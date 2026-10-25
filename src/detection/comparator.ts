import type { DotenvFile, KeyMismatch, SyncReport, SyncStatus } from '../types';

interface CompareOptions {
	mode?: 'auto' | 'template';
	templatePath?: string;
	caseSensitive?: boolean;
}

export function compareFiles(
	files: readonly DotenvFile[],
	options?: CompareOptions,
): SyncReport {
	if (files.length === 0) {
		return createEmptyReport();
	}

	const caseSensitive = options?.caseSensitive ?? true;
	const referenceKeys = collectReferenceKeys(files, options);
	const missingKeys = findMissingKeys(files, referenceKeys, caseSensitive);

	// Extra keys only exist relative to a template: in auto mode the
	// reference is the union of all keys, so nothing can be "extra".
	const template = shouldUseTemplateMode(options)
		? findTemplateFile(files, options?.templatePath ?? '')
		: undefined;
	const extraKeys = template
		? findExtraKeys(files, referenceKeys, caseSensitive, template)
		: [];

	const status = determineStatus(missingKeys, extraKeys);

	return {
		status,
		files: Object.freeze([...files]),
		missingKeys: Object.freeze(missingKeys),
		extraKeys: Object.freeze(extraKeys),
		errors: Object.freeze([]),
		lastChecked: Date.now(),
	};
}

function createEmptyReport(): SyncReport {
	return {
		status: 'no-files',
		files: Object.freeze([]),
		missingKeys: Object.freeze([]),
		extraKeys: Object.freeze([]),
		errors: Object.freeze([]),
		lastChecked: Date.now(),
	};
}

function collectReferenceKeys(
	files: readonly DotenvFile[],
	options?: CompareOptions,
): Set<string> {
	if (shouldUseTemplateMode(options) && options?.templatePath) {
		return collectTemplateKeys(files, options.templatePath);
	}

	return collectAllKeys(files);
}

function shouldUseTemplateMode(options?: CompareOptions): boolean {
	return options?.mode === 'template' && Boolean(options.templatePath);
}

function collectTemplateKeys(
	files: readonly DotenvFile[],
	templatePath: string | undefined,
): Set<string> {
	if (!templatePath) {
		return collectAllKeys(files);
	}

	const template = findTemplateFile(files, templatePath);

	if (!template) {
		return collectAllKeys(files);
	}

	return new Set(template.keys);
}

/**
 * The template, by exact path first and then by the name it ends in.
 *
 * A caller names the template as a person types it beside a directory:
 * `./.env.example`, `sub/.env.example`, an absolute path. The files carry
 * the paths they were discovered or labelled with, so an exact match
 * alone sent `./.env.example` through to the union silently, with
 * `extraKeys` emptied. The crate matched by trailing component already;
 * `compare_env_files` is one tool on both servers, so this does too.
 */
function findTemplateFile(
	files: readonly DotenvFile[],
	templatePath: string,
): DotenvFile | undefined {
	return (
		files.find((file) => file.path === templatePath) ??
		files.find((file) => sameFile(file.path, templatePath))
	);
}

/**
 * Whether a discovered path and a named template are the same file: equal,
 * or one a suffix of the other on a component boundary, with either
 * separator, and a leading `./` or `.\` on neither. `config/.env.example`
 * does not answer for `other/.env.example`, and `.env.example` not for
 * `my.env.example`.
 */
export function sameFile(discovered: string, named: string): boolean {
	const left = withoutLeadingDot(discovered);
	const right = withoutLeadingDot(named);
	if (left === right) return true;
	const [long, short] =
		left.length >= right.length ? [left, right] : [right, left];
	if (!long.endsWith(short)) return false;
	const prefix = long.slice(0, long.length - short.length);
	return prefix === '' || prefix.endsWith('/') || prefix.endsWith('\\');
}

/** `trim_start_matches("./").trim_start_matches(".\\")`, in that order. */
function withoutLeadingDot(path: string): string {
	let rest = path;
	while (rest.startsWith('./')) rest = rest.slice(2);
	while (rest.startsWith('.\\')) rest = rest.slice(2);
	return rest;
}

function collectAllKeys(files: readonly DotenvFile[]): Set<string> {
	const allKeys = new Set<string>();

	for (const file of files) {
		for (const key of file.keys) {
			allKeys.add(key);
		}
	}

	return allKeys;
}

function normalizeKey(key: string, caseSensitive: boolean): string {
	return caseSensitive ? key : key.toLowerCase();
}

function findMissingKeys(
	files: readonly DotenvFile[],
	referenceKeys: Set<string>,
	caseSensitive: boolean,
): KeyMismatch[] {
	const mismatches: KeyMismatch[] = [];

	for (const file of files) {
		const missing = findMissingKeysInFile(file, referenceKeys, caseSensitive);

		if (missing.length === 0) {
			continue;
		}

		const reference = findReferenceFile(files, file, missing, caseSensitive);

		mismatches.push({
			filepath: file.path,
			keys: Object.freeze([...missing]),
			reference: reference?.path ?? 'other files',
		});
	}

	return mismatches;
}

function findMissingKeysInFile(
	file: DotenvFile,
	referenceKeys: Set<string>,
	caseSensitive: boolean,
): string[] {
	const fileKeys = new Set(
		file.keys.map((key) => normalizeKey(key, caseSensitive)),
	);
	const missing: string[] = [];

	for (const key of referenceKeys) {
		if (!fileKeys.has(normalizeKey(key, caseSensitive))) {
			missing.push(key);
		}
	}

	return missing;
}

function findReferenceFile(
	files: readonly DotenvFile[],
	currentFile: DotenvFile,
	missingKeys: string[],
	caseSensitive: boolean,
): DotenvFile | undefined {
	return files.find(
		(file) =>
			file.path !== currentFile.path &&
			hasAllKeys(file, missingKeys, caseSensitive),
	);
}

function hasAllKeys(
	file: DotenvFile,
	keys: string[],
	caseSensitive: boolean,
): boolean {
	const fileKeys = new Set(
		file.keys.map((key) => normalizeKey(key, caseSensitive)),
	);
	return keys.every((key) => fileKeys.has(normalizeKey(key, caseSensitive)));
}

function findExtraKeys(
	files: readonly DotenvFile[],
	referenceKeys: Set<string>,
	caseSensitive: boolean,
	template: DotenvFile,
): KeyMismatch[] {
	const normalizedReference = new Set(
		[...referenceKeys].map((key) => normalizeKey(key, caseSensitive)),
	);
	const mismatches: KeyMismatch[] = [];

	for (const file of files) {
		if (file.path === template.path) {
			continue;
		}

		const extra = file.keys.filter(
			(key) => !normalizedReference.has(normalizeKey(key, caseSensitive)),
		);

		if (extra.length > 0) {
			mismatches.push({
				filepath: file.path,
				keys: Object.freeze([...extra]),
				reference: template.path,
			});
		}
	}

	return mismatches;
}

function determineStatus(
	missingKeys: KeyMismatch[],
	extraKeys: KeyMismatch[],
): SyncStatus {
	if (missingKeys.length > 0) {
		return 'missing-keys';
	}

	if (extraKeys.length > 0) {
		return 'extra-keys';
	}

	return 'in-sync';
}
