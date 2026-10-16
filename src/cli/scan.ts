/**
 * One comparison end to end, as the Rust CLI's `scan.rs` runs it: the files
 * read, the extension's comparator over them, and the report reshaped to the
 * crate's. The report is one object for the whole run, because the answer is
 * about the set of files.
 */
import { compareFiles } from '../detection/comparator';
import type { KeyMismatch, SyncStatus } from '../types';
import {
	DEFAULT_DISCOVER,
	type DiscoverOptions,
	discover,
	type EnvFile,
	read,
	relativePath,
} from './discover';

export interface ScanOptions {
	readonly template: string | null;
	readonly ignoreCase: boolean;
	readonly discover: DiscoverOptions;
}

export const DEFAULT_SCAN: ScanOptions = Object.freeze({
	template: null,
	ignoreCase: false,
	discover: DEFAULT_DISCOVER,
});

export interface Diagnostic {
	readonly severity: 'warning';
	readonly code: string;
	readonly file: string;
	readonly message: string;
}

interface Mismatch {
	readonly filepath: string;
	readonly keys: readonly string[];
	readonly reference: string;
}

export interface Report {
	readonly status: Exclude<SyncStatus, 'parse-error'>;
	readonly mode: 'auto' | 'template';
	readonly files: readonly { path: string; type: string; keys: number }[];
	readonly missingKeys: readonly Mismatch[];
	readonly extraKeys: readonly Mismatch[];
	readonly diagnostics: readonly Diagnostic[];
	readonly summary: {
		readonly files: number;
		readonly missing: number;
		readonly extra: number;
	};
}

/** Compare the dotenv files under `root`. Throws when the root cannot be walked. */
export function scan(root: string, options: ScanOptions): Report {
	return scanPaths(discover(root, options.discover), root, options);
}

/**
 * Compare exactly these files, in the order given. One unreadable file does
 * not abort the rest: a `.env.bak` that is not text says nothing about whether
 * the real ones agree. It is named in the diagnostics instead.
 */
export function scanPaths(
	paths: readonly string[],
	root: string,
	options: ScanOptions,
): Report {
	const files: EnvFile[] = [];
	const skipped: Diagnostic[] = [];
	for (const path of paths) {
		try {
			files.push(read(path, root));
		} catch (error) {
			skipped.push({
				severity: 'warning',
				code: 'skipped',
				file: relativePath(path, root),
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	const report = reportFor(files, options);
	return { ...report, diagnostics: [...report.diagnostics, ...skipped] };
}

export function reportFor(
	files: readonly EnvFile[],
	options: ScanOptions,
): Report {
	const template =
		options.template === null ? undefined : templateOf(files, options.template);
	const compared = compareFiles(
		files.map((file) => ({ ...file, lastModified: 0 })),
		template
			? {
					mode: 'template',
					templatePath: template.path,
					caseSensitive: !options.ignoreCase,
				}
			: { mode: 'auto', caseSensitive: !options.ignoreCase },
	);

	// A file that does not parse cleanly is a warning naming it, and its keys
	// still count: half a dotenv file is evidence about the half that parsed.
	const diagnostics: Diagnostic[] = files.flatMap((file) =>
		file.errors.map((error) => ({
			severity: 'warning' as const,
			code: error.type,
			file: file.path,
			message: error.message,
		})),
	);

	return {
		status: compared.status as Report['status'],
		mode: options.template === null ? 'auto' : 'template',
		files: files.map((file) => ({
			path: file.path,
			type: file.type,
			keys: file.keys.length,
		})),
		missingKeys: compared.missingKeys.map(mismatch),
		extraKeys: compared.extraKeys.map(mismatch),
		diagnostics,
		summary: {
			files: files.length,
			missing: compared.missingKeys.length,
			extra: compared.extraKeys.length,
		},
	};
}

function mismatch(entry: KeyMismatch): Mismatch {
	return {
		filepath: entry.filepath,
		keys: entry.keys,
		reference: entry.reference,
	};
}

/**
 * The crate matches a template by the name it ends in when no file has the
 * exact spelling, so `./.env.example` or `sub/.env.example` finds the file the
 * walk calls `.env.example`. A template that matches nothing falls back to
 * the union, as it does there.
 */
function templateOf(
	files: readonly EnvFile[],
	named: string,
): EnvFile | undefined {
	return (
		files.find((file) => file.path === named) ??
		files.find((file) => sameFile(file.path, named))
	);
}

function sameFile(discovered: string, named: string): boolean {
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

/**
 * 0 in sync, 1 out of sync, 2 could not answer. No dotenv files is 0: there
 * is nothing to be out of sync with.
 */
export function exitCode(report: Report, strict: boolean): number {
	if (strict && report.diagnostics.some((found) => found.code === 'skipped'))
		return 2;
	if (report.status === 'in-sync' || report.status === 'no-files') return 0;
	return 1;
}
