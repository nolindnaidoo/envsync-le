import { readConfig } from '../config/config';
import type { Configuration, FileSystem } from '../interfaces';
import type { Notifier } from '../interfaces/notifier';
import type { StatusBar } from '../interfaces/statusBar';
import type { Telemetry } from '../interfaces/telemetry';
import type { DotenvFile, ParseError, SyncReport } from '../types';
import { compareFiles } from './comparator';
import { detectFileType, parseDotenvFile, shouldExcludeFile } from './parser';

export interface Detector {
	checkSync(): Promise<SyncReport>;
	checkSyncForFiles(filePaths: readonly string[]): Promise<SyncReport>;
	dispose(): void;
}

export function createDetector(
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
		configuration: Configuration;
		fileSystem: FileSystem;
	}>,
): Detector {
	const { telemetry, notifier, statusBar, configuration, fileSystem } = deps;

	async function checkSync(): Promise<SyncReport> {
		const config = readConfig(configuration);

		if (!config.enabled) {
			return {
				status: 'no-files',
				files: Object.freeze([]),
				missingKeys: Object.freeze([]),
				extraKeys: Object.freeze([]),
				errors: Object.freeze([]),
				lastChecked: Date.now(),
			};
		}

		try {
			const { files, errors } = await discoverDotenvFiles(
				fileSystem,
				config.watchPatterns,
				config.excludePatterns,
				config,
			);

			// Determine template absolute path if in template mode
			const templatePath =
				config.comparisonMode === 'template' && config.templateFile
					? files.find(
							(f) => fileSystem.asRelativePath(f.path) === config.templateFile,
						)?.path
					: undefined;

			const opts: { mode: 'auto' | 'template'; templatePath?: string } = {
				mode: config.comparisonMode === 'template' ? 'template' : 'auto',
			};
			if (templatePath) opts.templatePath = templatePath;
			const report = compareFiles(files, opts);

			// Update UI based on sync status
			statusBar.updateStatus(
				report.status,
				report.missingKeys.length + report.extraKeys.length,
			);

			// Send notifications if needed
			if (
				report.status === 'missing-keys' &&
				config.notificationLevel !== 'silent'
			) {
				for (const mismatch of report.missingKeys) {
					notifier.showMissingKeys(mismatch.filepath, mismatch.keys);
				}
			}

			// Surface parse errors (limit to first 3 to avoid spam)
			if (errors.length > 0 && config.notificationLevel !== 'silent') {
				for (const e of errors.slice(0, 3)) {
					const detail = sanitizeParseMessage(e.message);
					notifier.showParseError(e.filepath, detail);
				}
			}

			telemetry.event('sync-check', {
				status: report.status,
				fileCount: String(files.length),
				missingKeyCount: String(report.missingKeys.length),
			});

			return { ...report, errors: Object.freeze(errors) };
		} catch (error) {
			const errorReport: SyncReport = {
				status: 'parse-error',
				files: Object.freeze([]),
				missingKeys: Object.freeze([]),
				extraKeys: Object.freeze([]),
				errors: Object.freeze([
					{
						type: 'read-error',
						message: `Failed to check sync: ${(error as Error).message}`,
						filepath: 'workspace',
					},
				]),
				lastChecked: Date.now(),
			};

			statusBar.updateStatus('parse-error', 0);
			if (config.notificationLevel !== 'silent') {
				notifier.showError(
					`Failed to check dotenv sync: ${(error as Error).message}`,
				);
			}

			return errorReport;
		}
	}

	async function checkSyncForFiles(
		filePaths: readonly string[],
	): Promise<SyncReport> {
		try {
			const { files, errors } = await loadSpecificFiles(fileSystem, filePaths);
			const config = readConfig(configuration);

			const templatePath =
				config.comparisonMode === 'template' && config.templateFile
					? files.find(
							(f) => fileSystem.asRelativePath(f.path) === config.templateFile,
						)?.path
					: undefined;

			const opts: { mode: 'auto' | 'template'; templatePath?: string } = {
				mode: config.comparisonMode === 'template' ? 'template' : 'auto',
			};
			if (templatePath) opts.templatePath = templatePath;
			const report = compareFiles(files, opts);

			// Update UI based on sync status
			statusBar.updateStatus(
				report.status,
				report.missingKeys.length + report.extraKeys.length,
			);

			// Send notifications if needed
			if (
				report.status === 'missing-keys' &&
				config.notificationLevel !== 'silent'
			) {
				for (const mismatch of report.missingKeys) {
					notifier.showMissingKeys(mismatch.filepath, mismatch.keys);
				}
			}

			// Surface parse errors for selected files
			if (errors.length > 0 && config.notificationLevel !== 'silent') {
				for (const e of errors.slice(0, 3)) {
					const detail = sanitizeParseMessage(e.message);
					notifier.showParseError(e.filepath, detail);
				}
			}

			telemetry.event('sync-check-selected', {
				status: report.status,
				fileCount: String(files.length),
				missingKeyCount: String(report.missingKeys.length),
			});

			return { ...report, errors: Object.freeze(errors) };
		} catch (error) {
			const errorReport: SyncReport = {
				status: 'parse-error',
				files: Object.freeze([]),
				missingKeys: Object.freeze([]),
				extraKeys: Object.freeze([]),
				errors: Object.freeze([
					{
						type: 'read-error',
						message: `Failed to check selected files: ${(error as Error).message}`,
						filepath: 'selected-files',
					},
				]),
				lastChecked: Date.now(),
			};

			statusBar.updateStatus('parse-error', 0);
			const config = readConfig(configuration);
			if (config.notificationLevel !== 'silent') {
				notifier.showError(
					`Failed to check selected files: ${(error as Error).message}`,
				);
			}

			return errorReport;
		}
	}

	function dispose(): void {
		// Cleanup if needed
	}

	return Object.freeze({
		checkSync,
		checkSyncForFiles,
		dispose,
	});
}

async function discoverDotenvFiles(
	fileSystem: FileSystem,
	watchPatterns: readonly string[],
	excludePatterns: readonly string[],
	config: ReturnType<typeof readConfig>,
): Promise<{ files: DotenvFile[]; errors: ParseError[] }> {
	const files: DotenvFile[] = [];
	const errors: ParseError[] = [];

	for (const pattern of watchPatterns) {
		// Stop processing if too many errors accumulated
		if (errors.length > 50) {
			errors.push({
				type: 'read-error',
				message:
					'Too many parse errors detected. Check workspace configuration.',
				filepath: 'workspace',
			});
			break;
		}

		try {
			const infos = await fileSystem.findFiles(pattern, null, 100);

			for (const info of infos) {
				const filepath = info.filepath;
				const relativePath = fileSystem.asRelativePath(filepath);

				// Skip excluded files (use relative path, path-aware patterns)
				if (shouldExcludeFile(relativePath, excludePatterns)) {
					continue;
				}

				// Skip temporarily ignored files
				if (config.temporaryIgnore.includes(relativePath)) {
					continue;
				}

				try {
					const text = await fileSystem.readFile(filepath);
					const parseResult = parseDotenvFile(text, filepath);

					// Always add parse errors to the errors array
					if (parseResult.errors.length > 0) {
						errors.push(...parseResult.errors);
					}

					if (parseResult.success) {
						const stat = await fileSystem.getFileStats(filepath);
						files.push({
							path: filepath,
							type: detectFileType(filepath),
							keys: parseResult.keys,
							lastModified: stat.mtime.getTime(),
						});
					}
				} catch (error) {
					errors.push({
						type: 'read-error',
						message: (error as Error).message,
						filepath,
					});
				}
			}
		} catch (error) {
			errors.push({
				type: 'read-error',
				message: `Failed to search pattern ${pattern}: ${(error as Error).message}`,
				filepath: 'pattern-search',
			});
		}
	}

	// Apply comparison mode filtering
	const filtered = applyComparisonModeFilter(fileSystem, files, config);
	return { files: filtered, errors };
}

async function loadSpecificFiles(
	fileSystem: FileSystem,
	filePaths: readonly string[],
): Promise<{ files: DotenvFile[]; errors: ParseError[] }> {
	const files: DotenvFile[] = [];
	const errors: ParseError[] = [];

	for (const filepath of filePaths) {
		try {
			const text = await fileSystem.readFile(filepath);
			const parseResult = parseDotenvFile(text, filepath);

			if (parseResult.success) {
				const stat = await fileSystem.getFileStats(filepath);
				files.push({
					path: filepath,
					type: detectFileType(filepath),
					keys: parseResult.keys,
					lastModified: stat.mtime.getTime(),
				});
			} else {
				errors.push(...parseResult.errors);
			}
		} catch (error) {
			errors.push({
				type: 'read-error',
				message: (error as Error).message,
				filepath,
			});
		}
	}

	return { files, errors };
}

function applyComparisonModeFilter(
	fileSystem: FileSystem,
	files: DotenvFile[],
	config: ReturnType<typeof readConfig>,
): DotenvFile[] {
	switch (config.comparisonMode) {
		case 'manual':
			// Only compare files specified in config
			if (config.compareOnlyFiles.length === 0) return files;
			return files.filter((file) => {
				const relativePath = fileSystem.asRelativePath(file.path);
				return config.compareOnlyFiles.includes(relativePath);
			});

		case 'template':
			// Keep all files; comparator will enforce template semantics
			return files;

		default:
			// Include all discovered files
			return files;
	}
}

function sanitizeParseMessage(message: string): string {
	return message.replace(/^Failed to parse[^:]*:\s*/, '');
}
