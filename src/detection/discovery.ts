import type { readConfig } from '../config/config';
import type { FileSystem } from '../interfaces';
import type { DotenvFile, ParseError, ParseResult } from '../types';
import { errorMessage } from '../utils/errors';
import { detectFileType, shouldExcludeFile } from './heuristics';
import { parseDotenvFile } from './parser';

/**
 * Finding, reading and filtering the .env files a comparison runs over.
 *
 * Split from detector.ts, which held the detector factory plus all of file
 * discovery, parsing and filtering in one 526-line file.
 */

export async function discoverDotenvFiles(
	fileSystem: FileSystem,
	watchPatterns: readonly string[],
	excludePatterns: readonly string[],
	config: ReturnType<typeof readConfig>,
): Promise<{ files: DotenvFile[]; errors: ParseError[] }> {
	const files: DotenvFile[] = [];
	const errors: ParseError[] = [];

	const MAX_ERRORS = 50;

	for (const pattern of watchPatterns) {
		if (hasExceededErrorLimit(errors, MAX_ERRORS)) {
			errors.push(createErrorLimitExceededError());
			break;
		}

		await processPattern(
			pattern,
			fileSystem,
			excludePatterns,
			config,
			files,
			errors,
		);
	}

	const filteredFiles = applyComparisonModeFilter(fileSystem, files, config);
	return { files: filteredFiles, errors };
}

function hasExceededErrorLimit(
	errors: ParseError[],
	maxErrors: number,
): boolean {
	return errors.length > maxErrors;
}

function createErrorLimitExceededError(): ParseError {
	return {
		type: 'read-error',
		message: 'Too many parse errors detected. Check workspace configuration.',
		filepath: 'workspace',
	};
}

/**
 * How many files one pattern contributes to a comparison.
 *
 * Asked for one more than this, so a match list exactly at the cap is told
 * apart from one that was cut: the cut is reported, because a comparison
 * over the first hundred of a monorepo's dotenv files that said nothing
 * about the rest read as a comparison of all of them.
 */
const MAX_FILES_PER_PATTERN = 100;

async function processPattern(
	pattern: string,
	fileSystem: FileSystem,
	excludePatterns: readonly string[],
	config: ReturnType<typeof readConfig>,
	files: DotenvFile[],
	errors: ParseError[],
): Promise<void> {
	try {
		const found = byPath(
			await fileSystem.findFiles(pattern, null, MAX_FILES_PER_PATTERN + 1),
		);
		if (found.length > MAX_FILES_PER_PATTERN) {
			errors.push(createPatternCapError(pattern));
		}
		await processFileInfos(
			found.slice(0, MAX_FILES_PER_PATTERN),
			fileSystem,
			excludePatterns,
			config,
			files,
			errors,
		);
	} catch (error) {
		errors.push(createPatternSearchError(pattern, error));
	}
}

/**
 * The workspace search returns files in no promised order, and the report
 * took them as they came: the files' order and the file named as the
 * reference for a mismatch could differ between two runs over one
 * workspace. Sorted by code unit, as the CLI sorts by byte, so the same
 * workspace reads the same on every machine.
 */
function byPath<T extends { filepath: string }>(found: readonly T[]): T[] {
	return [...found].sort((left, right) => {
		if (left.filepath < right.filepath) return -1;
		if (left.filepath > right.filepath) return 1;
		return 0;
	});
}

function createPatternCapError(pattern: string): ParseError {
	return {
		type: 'read-error',
		message: `More than ${MAX_FILES_PER_PATTERN} files match ${pattern}; only the first ${MAX_FILES_PER_PATTERN} were compared`,
		filepath: 'pattern-search',
	};
}

function createPatternSearchError(pattern: string, error: unknown): ParseError {
	return {
		type: 'read-error',
		message: `Failed to search pattern ${pattern}: ${errorMessage(error)}`,
		filepath: 'pattern-search',
	};
}

async function processFileInfos(
	fileInfos: Array<{ filepath: string; uri: string }>,
	fileSystem: FileSystem,
	excludePatterns: readonly string[],
	config: ReturnType<typeof readConfig>,
	files: DotenvFile[],
	errors: ParseError[],
): Promise<void> {
	for (const info of fileInfos) {
		await processFileInfo(
			info,
			fileSystem,
			excludePatterns,
			config,
			files,
			errors,
		);
	}
}

async function processFileInfo(
	info: { filepath: string; uri: string },
	fileSystem: FileSystem,
	excludePatterns: readonly string[],
	config: ReturnType<typeof readConfig>,
	files: DotenvFile[],
	errors: ParseError[],
): Promise<void> {
	const filepath = info.filepath;
	const relativePath = fileSystem.asRelativePath(filepath);

	if (shouldSkipFile(relativePath, excludePatterns, config)) {
		return;
	}

	await parseAndAddFile(filepath, fileSystem, files, errors);
}

function shouldSkipFile(
	relativePath: string,
	excludePatterns: readonly string[],
	config: ReturnType<typeof readConfig>,
): boolean {
	if (shouldExcludeFile(relativePath, excludePatterns)) {
		return true;
	}

	if (isTemporarilyIgnored(relativePath, config)) {
		return true;
	}

	return false;
}

function isTemporarilyIgnored(
	relativePath: string,
	config: ReturnType<typeof readConfig>,
): boolean {
	return config.temporaryIgnore.includes(relativePath);
}

async function parseAndAddFile(
	filepath: string,
	fileSystem: FileSystem,
	files: DotenvFile[],
	errors: ParseError[],
): Promise<void> {
	try {
		const text = await fileSystem.readFile(filepath);
		const parseResult = parseDotenvFile(text, filepath);

		// Keys are extracted best-effort: a file with a malformed line
		// still contributes its parseable keys AND its errors.
		errors.push(...parseResult.errors);

		const dotenvFile = await createDotenvFile(
			filepath,
			parseResult,
			fileSystem,
		);
		files.push(dotenvFile);
	} catch (error) {
		errors.push(createFileReadError(filepath, error));
	}
}

async function createDotenvFile(
	filepath: string,
	parseResult: ParseResult,
	fileSystem: FileSystem,
): Promise<DotenvFile> {
	const stat = await fileSystem.getFileStats(filepath);

	return {
		path: filepath,
		type: detectFileType(filepath),
		keys: parseResult.keys,
		lastModified: stat.mtime.getTime(),
	};
}

function createFileReadError(filepath: string, error: unknown): ParseError {
	return {
		type: 'read-error',
		message: errorMessage(error),
		filepath,
	};
}

export async function loadSpecificFiles(
	fileSystem: FileSystem,
	filePaths: readonly string[],
): Promise<{ files: DotenvFile[]; errors: ParseError[] }> {
	const files: DotenvFile[] = [];
	const errors: ParseError[] = [];

	for (const filepath of filePaths) {
		await parseAndAddFile(filepath, fileSystem, files, errors);
	}

	return { files, errors };
}

export function applyComparisonModeFilter(
	fileSystem: FileSystem,
	files: DotenvFile[],
	config: ReturnType<typeof readConfig>,
): DotenvFile[] {
	if (config.comparisonMode === 'manual') {
		return filterManualModeFiles(fileSystem, files, config);
	}

	return files;
}

function filterManualModeFiles(
	fileSystem: FileSystem,
	files: DotenvFile[],
	config: ReturnType<typeof readConfig>,
): DotenvFile[] {
	if (config.compareOnlyFiles.length === 0) {
		return files;
	}

	return files.filter((file) => isFileInCompareList(file, fileSystem, config));
}

function isFileInCompareList(
	file: DotenvFile,
	fileSystem: FileSystem,
	config: ReturnType<typeof readConfig>,
): boolean {
	const relativePath = fileSystem.asRelativePath(file.path);
	return config.compareOnlyFiles.includes(relativePath);
}
