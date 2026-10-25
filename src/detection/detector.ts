import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import type { Configuration, FileSystem } from '../interfaces';
import type { Notifier } from '../interfaces/notifier';
import type { StatusBar } from '../interfaces/statusBar';
import type { Telemetry } from '../interfaces/telemetry';
import type { DotenvFile, ParseError, SyncReport } from '../types';
import { errorMessage } from '../utils/errors';
import { compareFiles } from './comparator';
import { discoverDotenvFiles, loadSpecificFiles } from './discovery';

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
			return createDisabledReport();
		}

		try {
			return await performSyncCheck(config);
		} catch (error) {
			return handleSyncCheckError(error, config);
		}
	}

	async function performSyncCheck(
		config: ReturnType<typeof readConfig>,
	): Promise<SyncReport> {
		const { files, errors } = await discoverDotenvFiles(
			fileSystem,
			config.watchPatterns,
			config.excludePatterns,
			config,
		);

		const compareOptions = buildCompareOptions(files, config);
		const finalReport = withErrors(compareFiles(files, compareOptions), errors);

		updateUI(finalReport);
		notifyUser(finalReport, errors, config);
		trackTelemetry(finalReport, files);

		return finalReport;
	}

	/**
	 * A result with errors beside it is not a clean one.
	 *
	 * The comparator knows nothing of the files it was not given: one that
	 * could not be read or parsed makes "in sync" and "no files" untrue, so
	 * the status says so and the status bar shows it rather than reading
	 * clean or hiding. A mismatch already says the files disagree; the
	 * errors ride along in the report, and the bar counts them as issues.
	 */
	function withErrors(report: SyncReport, errors: ParseError[]): SyncReport {
		const clean = report.status === 'in-sync' || report.status === 'no-files';
		return {
			...report,
			status: errors.length > 0 && clean ? 'parse-error' : report.status,
			errors: Object.freeze(errors),
		};
	}

	function buildCompareOptions(
		files: DotenvFile[],
		config: ReturnType<typeof readConfig>,
	): {
		mode: 'auto' | 'template';
		templatePath?: string;
		caseSensitive: boolean;
	} {
		const caseSensitive = config.caseSensitive;
		const isTemplateMode = config.comparisonMode === 'template';

		if (!isTemplateMode || !config.templateFile) {
			return { mode: 'auto', caseSensitive };
		}

		const templatePath = findTemplatePath(files, config.templateFile);

		if (templatePath) {
			return {
				mode: 'template',
				templatePath,
				caseSensitive,
			};
		}

		return {
			mode: 'template',
			caseSensitive,
		};
	}

	function findTemplatePath(
		files: DotenvFile[],
		templateFile: string,
	): string | undefined {
		const template = files.find(
			(file) => fileSystem.asRelativePath(file.path) === templateFile,
		);
		return template?.path;
	}

	function updateUI(report: SyncReport): void {
		const issueCount =
			report.missingKeys.length +
			report.extraKeys.length +
			report.errors.length;
		statusBar.updateStatus(report.status, issueCount);
	}

	function notifyUser(
		report: SyncReport,
		errors: ParseError[],
		config: ReturnType<typeof readConfig>,
	): void {
		if (config.notificationLevel === 'silent') {
			return;
		}

		notifyMissingKeys(report);
		notifyExtraKeys(report);
		notifyParseErrors(errors);
	}

	function notifyMissingKeys(report: SyncReport): void {
		if (report.status !== 'missing-keys') {
			return;
		}

		for (const mismatch of report.missingKeys) {
			notifier.showMissingKeys(mismatch.filepath, mismatch.keys);
		}
	}

	function notifyExtraKeys(report: SyncReport): void {
		// The notifier only surfaces these at notificationLevel 'all'
		for (const mismatch of report.extraKeys) {
			notifier.showExtraKeys(mismatch.filepath, mismatch.keys);
		}
	}

	function notifyParseErrors(errors: ParseError[]): void {
		if (errors.length === 0) {
			return;
		}

		const MAX_ERRORS_TO_SHOW = 3;
		const errorsToShow = errors.slice(0, MAX_ERRORS_TO_SHOW);

		for (const error of errorsToShow) {
			notifier.showParseError(error.filepath, error.message);
		}
	}

	function trackTelemetry(report: SyncReport, files: DotenvFile[]): void {
		telemetry.event('sync-check', {
			status: report.status,
			fileCount: String(files.length),
			missingKeyCount: String(report.missingKeys.length),
		});
	}

	function handleSyncCheckError(
		error: unknown,
		config: ReturnType<typeof readConfig>,
	): SyncReport {
		const errorReport = createErrorReport(error);

		statusBar.updateStatus('parse-error', 0);

		if (config.notificationLevel !== 'silent') {
			notifier.showError(
				vscode.l10n.t('Failed to check dotenv sync: {0}', errorMessage(error)),
			);
		}

		return errorReport;
	}

	function createDisabledReport(): SyncReport {
		return {
			status: 'no-files',
			files: Object.freeze([]),
			missingKeys: Object.freeze([]),
			extraKeys: Object.freeze([]),
			errors: Object.freeze([]),
			lastChecked: Date.now(),
		};
	}

	function createErrorReport(error: unknown): SyncReport {
		return {
			status: 'parse-error',
			files: Object.freeze([]),
			missingKeys: Object.freeze([]),
			extraKeys: Object.freeze([]),
			errors: Object.freeze([
				{
					type: 'read-error',
					message: `Failed to check sync: ${errorMessage(error)}`,
					filepath: 'workspace',
				},
			]),
			lastChecked: Date.now(),
		};
	}

	async function checkSyncForFiles(
		filePaths: readonly string[],
	): Promise<SyncReport> {
		try {
			return await performSyncCheckForFiles(filePaths);
		} catch (error) {
			return handleSyncCheckForFilesError(error);
		}
	}

	async function performSyncCheckForFiles(
		filePaths: readonly string[],
	): Promise<SyncReport> {
		const { files, errors } = await loadSpecificFiles(fileSystem, filePaths);
		const config = readConfig(configuration);

		const compareOptions = buildCompareOptions(files, config);
		const finalReport = withErrors(compareFiles(files, compareOptions), errors);

		updateUI(finalReport);
		notifyUser(finalReport, errors, config);
		trackSelectedFilesTelemetry(finalReport, files);

		return finalReport;
	}

	function trackSelectedFilesTelemetry(
		report: SyncReport,
		files: DotenvFile[],
	): void {
		telemetry.event('sync-check-selected', {
			status: report.status,
			fileCount: String(files.length),
			missingKeyCount: String(report.missingKeys.length),
		});
	}

	function handleSyncCheckForFilesError(error: unknown): SyncReport {
		const errorReport = createSelectedFilesErrorReport(error);

		statusBar.updateStatus('parse-error', 0);

		const config = readConfig(configuration);
		if (config.notificationLevel !== 'silent') {
			notifier.showError(
				vscode.l10n.t(
					'Failed to check selected files: {0}',
					errorMessage(error),
				),
			);
		}

		return errorReport;
	}

	function createSelectedFilesErrorReport(error: unknown): SyncReport {
		return {
			status: 'parse-error',
			files: Object.freeze([]),
			missingKeys: Object.freeze([]),
			extraKeys: Object.freeze([]),
			errors: Object.freeze([
				{
					type: 'read-error',
					message: `Failed to check selected files: ${errorMessage(error)}`,
					filepath: 'selected-files',
				},
			]),
			lastChecked: Date.now(),
		};
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
