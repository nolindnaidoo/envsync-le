/**
 * Finding and reading the dotenv files in a tree, as the Rust CLI's
 * `discover.rs` does with ripgrep's `ignore` crate.
 *
 * A dotenv file is a dotfile and is git-ignored by design, so unlike the
 * sibling tools the walk always sees dotfiles, `hidden` decides only whether
 * hidden *directories* are descended, and the ignore rules are off unless a
 * caller turns them on. A default that cannot see `.env` reports a tree in
 * sync that was never compared.
 *
 * The result is sorted the way Rust sorts a `PathBuf`, by component, so the
 * report's lines are in the same order from either binary and do not move
 * between two runs over an unchanged tree.
 */
import { type Dirent, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
	detectFileType,
	isEnvFileName,
	shouldExcludeFile,
} from '../detection/heuristics';
import { parseDotenvFile } from '../detection/parser';
import type { DotenvFileType } from '../types';
import {
	type DirectoryRules,
	isIgnored,
	type RepositoryRules,
	repositoryRoot,
	repositoryRules,
	rulesFor,
} from './ignoreRules';
import { decodeUtf8OrThrow, rustIoMessage, withoutBom } from './ioError';

export interface DiscoverOptions {
	readonly hidden: boolean;
	readonly respectIgnore: boolean;
	readonly exclude: readonly string[];
}

export const DEFAULT_DISCOVER: DiscoverOptions = Object.freeze({
	hidden: false,
	respectIgnore: false,
	exclude: Object.freeze([]),
});

export interface EnvFile {
	readonly path: string;
	readonly type: DotenvFileType;
	readonly keys: readonly string[];
	readonly errors: readonly {
		readonly type: string;
		readonly message: string;
	}[];
}

interface Walk {
	readonly root: string;
	readonly options: DiscoverOptions;
	readonly repository: RepositoryRules | null;
	readonly files: string[];
}

/** The dotenv files under `root`, in a stable order. Throws a message naming the root. */
export function discover(
	root: string,
	options: DiscoverOptions,
): readonly string[] {
	let kind: { isFile(): boolean; isDirectory(): boolean };
	try {
		kind = statSync(root);
	} catch (error) {
		throw new Error(`${display(root)}: ${rustIoMessage(error)}`);
	}
	if (kind.isFile()) return [root];
	if (!kind.isDirectory()) return [];

	const absolute = resolve(root);
	const repoRoot = options.respectIgnore ? repositoryRoot(absolute) : null;
	const walk: Walk = {
		root,
		options,
		repository: repoRoot ? repositoryRules(repoRoot) : null,
		files: [],
	};
	visit(walk, root, absolute, parentRules(absolute, options));
	return Object.freeze(sortAndDedupe(walk.files));
}

/** The crate's `parents(true)`: ignore files above the walk root count too. */
function parentRules(
	absolute: string,
	options: DiscoverOptions,
): readonly DirectoryRules[] {
	if (!options.respectIgnore) return [];
	const chain: DirectoryRules[] = [];
	let dir = dirname(absolute);
	while (dir !== dirname(dir)) {
		chain.unshift(rulesFor(dir, repositoryRoot(dir) !== null));
		dir = dirname(dir);
	}
	chain.unshift(rulesFor(dir, repositoryRoot(dir) !== null));
	return chain;
}

function visit(
	walk: Walk,
	shown: string,
	absolute: string,
	inherited: readonly DirectoryRules[],
): void {
	const chain = walk.options.respectIgnore
		? [...inherited, rulesFor(absolute, repositoryRoot(absolute) !== null)]
		: inherited;
	for (const entry of entriesOf(walk, shown, absolute)) {
		visitEntry(
			walk,
			entry,
			joinShown(shown, entry.name),
			`${absolute}${sep}${entry.name}`,
			chain,
		);
	}
}

function visitEntry(
	walk: Walk,
	entry: Dirent,
	shown: string,
	absolute: string,
	chain: readonly DirectoryRules[],
): void {
	const isDir = entry.isDirectory();
	if (isDir && !walk.options.hidden && entry.name.startsWith('.')) return;
	// A link is neither: never followed, so a link out of the tree cannot
	// have this reading files the caller did not point it at.
	if (!isDir && !entry.isFile()) return;
	if (
		walk.options.respectIgnore &&
		isIgnored(absolute, isDir, chain, walk.repository)
	)
		return;
	if (isDir) {
		visit(walk, shown, absolute, chain);
		return;
	}
	const relative = relativePath(shown, walk.root);
	if (
		!isEnvFileName(relative) ||
		shouldExcludeFile(relative, walk.options.exclude)
	)
		return;
	walk.files.push(shown);
}

function entriesOf(
	walk: Walk,
	shown: string,
	absolute: string,
): readonly Dirent[] {
	try {
		return readdirSync(absolute, { withFileTypes: true });
	} catch (error) {
		// The crate ends the walk on an unreadable directory rather than
		// reporting less than the tree holds as though it were all of it.
		// walkdir's wording, inside the `ignore` crate's, inside the CLI's.
		throw new Error(
			`${display(walk.root)}: ${shown}: IO error for operation on ${shown}: ${rustIoMessage(error)}`,
		);
	}
}

/**
 * One file in the shape the comparator takes. The refusal carries only the
 * reason, because every caller names the file itself.
 *
 * A named pipe is refused rather than read: `--file` bypasses the walk, and a
 * read on a pipe with no writer never returns.
 */
export function read(path: string, root: string): EnvFile {
	let content: string;
	try {
		if (!statSync(path).isFile()) throw new Error('not a regular file');
		content = decodeUtf8OrThrow(readFileSync(path));
	} catch (error) {
		throw new Error(reasonOf(error));
	}
	const relative = relativePath(path, root);
	const parsed = parseDotenvFile(withoutBom(content), relative);
	return Object.freeze({
		path: relative,
		type: detectFileType(relative),
		keys: parsed.keys,
		errors: parsed.errors.map(({ type, message }) => ({ type, message })),
	});
}

function reasonOf(error: unknown): string {
	if ((error as { code?: unknown })?.code === 'INVALID_UTF8')
		return 'not UTF-8 text';
	if (error instanceof Error && !('code' in error)) return error.message;
	return rustIoMessage(error);
}

/**
 * A path below `root`, as `Path::strip_prefix` gives it, with forward
 * slashes. A path that is not below `root` is reported as it was named.
 */
export function relativePath(path: string, root: string): string {
	const remainder = stripPrefix(path, root);
	return display(remainder ?? path);
}

/** A path as the report spells it: forward slashes, on Windows only. */
export function display(path: string): string {
	if (process.platform !== 'win32') return path;
	return forwardSlashes(path);
}

/** `\\?\UNC\server\share` is `\\server\share` written the long way. */
export function forwardSlashes(rendered: string): string {
	const unc = '\\\\?\\UNC\\';
	const verbatim = '\\\\?\\';
	let bare = rendered;
	if (rendered.startsWith(unc)) bare = `\\\\${rendered.slice(unc.length)}`;
	else if (rendered.startsWith(verbatim))
		bare = rendered.slice(verbatim.length);
	return bare.replaceAll('\\', '/');
}

const SEPARATOR = process.platform === 'win32' ? /[\\/]/ : /\//;

interface Component {
	readonly text: string;
	readonly end: number;
}

/**
 * Rust's components: separators collapse, a `.` counts only at the very
 * start, and each carries where it ends in the original text so the
 * remainder can be cut from what was typed rather than rebuilt.
 */
function componentsOf(path: string): readonly Component[] {
	const found: Component[] = [];
	if (SEPARATOR.test(path.charAt(0))) found.push({ text: '/', end: 1 });
	let start = 0;
	for (let index = 0; index <= path.length; index++) {
		if (index < path.length && !SEPARATOR.test(path.charAt(index))) continue;
		const part = path.slice(start, index);
		const leading = start === 0;
		start = index + 1;
		if (!part) continue;
		if (part === '.' && !leading) continue;
		found.push({ text: part, end: index });
	}
	return found;
}

function stripPrefix(path: string, root: string): string | null {
	const base = componentsOf(root);
	const full = componentsOf(path);
	if (base.length > full.length) return null;
	for (let index = 0; index < base.length; index++) {
		if (base[index]?.text !== full[index]?.text) return null;
	}
	const cut = base.length === 0 ? 0 : (base[base.length - 1]?.end ?? 0);
	return trimmed(path.slice(cut));
}

/** `Components::as_path`: no leading or trailing separators or `.`. */
function trimmed(rest: string): string {
	const parts = rest.split(SEPARATOR);
	while (parts.length > 0 && (parts[0] === '' || parts[0] === '.'))
		parts.shift();
	while (
		parts.length > 0 &&
		(parts[parts.length - 1] === '' || parts[parts.length - 1] === '.')
	)
		parts.pop();
	if (parts.length === 0) return '';
	const first = rest.indexOf(parts[0] as string);
	const lastPart = parts[parts.length - 1] as string;
	const last = rest.lastIndexOf(lastPart) + lastPart.length;
	return rest.slice(first, last);
}

/** `PathBuf::join`: no separator is added after one that is already there. */
function joinShown(parent: string, name: string): string {
	if (parent.endsWith('/') || parent.endsWith(sep)) return `${parent}${name}`;
	return `${parent}${sep}${name}`;
}

type Ranked = readonly [rank: number, bytes: Buffer];

/**
 * A path as Rust compares it: by component, where `/` and `.` sort before a
 * name and a name compares by its bytes. Comparing the strings instead would
 * put `a.b/.env` before `a/.env`, because `.` is below `/` in ASCII.
 */
function ranked(path: string): readonly Ranked[] {
	const parts = path.split(SEPARATOR);
	const found: Ranked[] = [];
	if (parts[0] === '' && parts.length > 1) found.push([1, Buffer.alloc(0)]);
	parts.forEach((part, index) => {
		if (!part) return;
		if (part === '.') {
			if (index === 0) found.push([2, Buffer.alloc(0)]);
			return;
		}
		found.push([part === '..' ? 3 : 4, Buffer.from(part)]);
	});
	return found;
}

function compareRanked(
	left: readonly Ranked[],
	right: readonly Ranked[],
): number {
	const shared = Math.min(left.length, right.length);
	for (let index = 0; index < shared; index++) {
		const a = left[index] as Ranked;
		const b = right[index] as Ranked;
		if (a[0] !== b[0]) return a[0] - b[0];
		const order = Buffer.compare(a[1], b[1]);
		if (order !== 0) return order;
	}
	return left.length - right.length;
}

function sortAndDedupe(files: readonly string[]): string[] {
	const keyed = files.map((file) => ({ file, key: ranked(file) }));
	keyed.sort((left, right) => compareRanked(left.key, right.key));
	return keyed
		.filter((item, index) => {
			const previous = keyed[index - 1];
			return !previous || compareRanked(previous.key, item.key) !== 0;
		})
		.map((item) => item.file);
}
