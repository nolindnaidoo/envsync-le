import type { DotenvFileType } from '../types';

/**
 * Shared filename/path heuristics for dotenv detection. This is the one
 * place that decides what counts as a dotenv file, how a file is
 * classified, and how exclude globs match — previously three divergent
 * copies (parser, watcher, and per-command string slicing).
 *
 * Intentional behavior (documented, not bugs):
 * - Classification is segment-based on the basename: `.env.production`
 *   is production, but `app.device.env` is NOT development — substring
 *   matching used to misclassify it. Suffix-style names (`foo.env`) are
 *   always 'base'.
 * - Priority when multiple segments match: local > example > production
 *   > development > test (`.env.production.local` is a local override).
 * - Exclude patterns without a '/' match against the basename
 *   (gitignore-style), so '.env.*.local' excludes nested files too.
 *   Patterns with a '/' match against the workspace-relative path;
 *   a leading '**' + '/' matches zero or more directories.
 */

export function basename(filepath: string): string {
	const normalized = filepath.replace(/\\/g, '/');
	return normalized.split('/').pop() ?? '';
}

export function isEnvFileName(filepath: string): boolean {
	const name = basename(filepath);
	return name === '.env' || name.startsWith('.env.') || name.endsWith('.env');
}

export function detectFileType(filepath: string): DotenvFileType {
	const name = basename(filepath);

	if (name !== '.env' && !name.startsWith('.env.')) {
		return 'base'; // suffix-style names (foo.env) and everything else
	}

	// '.env.development.local' -> ['development', 'local']
	const segments = new Set(name.split('.').slice(2));

	if (segments.has('local')) return 'local';
	if (segments.has('example') || segments.has('template')) return 'example';
	if (segments.has('production') || segments.has('prod')) return 'production';
	if (segments.has('development') || segments.has('dev')) return 'development';
	if (segments.has('test')) return 'test';

	return 'base';
}

export function shouldExcludeFile(
	filepath: string,
	excludePatterns: readonly string[],
): boolean {
	const path = filepath.replace(/\\/g, '/');
	const name = basename(path);

	return excludePatterns.some((pattern) => {
		const target = pattern.includes('/') ? path : name;
		return globToRegex(pattern).test(target);
	});
}

/**
 * A glob as a regex source: `**\/` spans zero or more directories, `**` any
 * run, `*` and `?` stay inside one segment, `{a,b}` is either branch (and
 * nests), `[abc]`, `[a-z]` and `[!abc]` are one character that is not `/`.
 * An unclosed `{` or `[` is a literal.
 */
function translateGlob(pattern: string): string {
	let out = '';
	let i = 0;
	while (i < pattern.length) {
		const c = pattern[i] as string;
		if (c === '*' && pattern[i + 1] === '*' && pattern[i + 2] === '/') {
			out += '(?:.*/)?';
			i += 3;
		} else if (c === '*' && pattern[i + 1] === '*') {
			out += '.*';
			i += 2;
		} else if (c === '*') {
			out += '[^/]*';
			i += 1;
		} else if (c === '?') {
			out += '[^/]';
			i += 1;
		} else if (c === '{' && closingBrace(pattern, i) !== -1) {
			const end = closingBrace(pattern, i);
			const branches = splitBranches(pattern.slice(i + 1, end));
			out += `(?:${branches.map(translateGlob).join('|')})`;
			i = end + 1;
		} else if (c === '[' && closingBracket(pattern, i) !== -1) {
			const end = closingBracket(pattern, i);
			out += characterClass(pattern.slice(i + 1, end));
			i = end + 1;
		} else {
			out += escapeRegexChar(c);
			i += 1;
		}
	}
	return out;
}

/** The index of the `}` closing the `{` at `open`, or -1. */
function closingBrace(pattern: string, open: number): number {
	let depth = 0;
	for (let i = open; i < pattern.length; i++) {
		if (pattern[i] === '{') depth++;
		else if (pattern[i] === '}' && --depth === 0) return i;
	}
	return -1;
}

/** Top-level comma-separated branches, leaving nested braces whole. */
function splitBranches(body: string): string[] {
	const branches: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		if (body[i] === '{') depth++;
		else if (body[i] === '}') depth--;
		else if (body[i] === ',' && depth === 0) {
			branches.push(body.slice(start, i));
			start = i + 1;
		}
	}
	branches.push(body.slice(start));
	return branches;
}

/** The `]` closing the `[` at `open`; a `]` first in the class is literal. */
function closingBracket(pattern: string, open: number): number {
	let i = open + 1;
	if (pattern[i] === '!' || pattern[i] === '^') i++;
	if (pattern[i] === ']') i++;
	for (; i < pattern.length; i++) {
		if (pattern[i] === ']') return i;
	}
	return -1;
}

function characterClass(body: string): string {
	const negated = body.startsWith('!') || body.startsWith('^');
	const members = (negated ? body.slice(1) : body).replace(/[\\\]^]/g, '\\$&');
	return negated ? `[^/${members}]` : `(?![/])[${members}]`;
}

function globToRegex(pattern: string): RegExp {
	return new RegExp(`^${translateGlob(pattern)}$`);
}

function escapeRegexChar(c: string): string {
	return /[.+^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
}
