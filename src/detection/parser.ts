import type { ParseError, ParseResult } from '../types';

/**
 * Line-oriented dotenv parser. Values are never interpreted — only key
 * names matter for sync comparison — but quoted values that span lines
 * must be consumed so their continuation lines are not misread as
 * malformed entries.
 *
 * Intentional behavior (documented, not bugs):
 * - Keys must match /^[a-zA-Z_][a-zA-Z0-9_-]*$/; anything else on the
 *   left of '=' is reported as a parse error for that line.
 * - A leading 'export ' prefix is accepted and stripped.
 * - Duplicate keys count once (dotenv itself keeps one occurrence).
 * - Multi-line values are supported for double-, single-, and
 *   backtick-quoted values; an unterminated quote is reported and
 *   swallows the remainder of the file (matching dotenv's behavior).
 */

const KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;

export function parseDotenvFile(
	content: string,
	filepath: string,
): ParseResult {
	const keys: string[] = [];
	const seen = new Set<string>();
	const errors: ParseError[] = [];

	const lines = content.split(/\r?\n/);
	let i = 0;

	while (i < lines.length) {
		const line = (lines[i] ?? '').trim();
		const lineNumber = i + 1;
		i++;

		if (line === '' || line.startsWith('#')) {
			continue;
		}

		// Neither message quotes the line. A diagnostic that echoes what it
		// could not parse is the one way a value leaves this product, and
		// both of these reach real value material: the continuation lines
		// of a multi-line certificate have no '=' at all, and a connection
		// string wrapped onto its own line has one inside its query
		// parameters — which makes the whole credential the "key" that
		// failed to parse. The line number is the pointer; the content
		// stays in the file.
		const equalIndex = line.indexOf('=');
		if (equalIndex === -1) {
			errors.push(
				createParseError(lineNumber, 'Missing equals sign', filepath),
			);
			continue;
		}

		const key = line
			.substring(0, equalIndex)
			.trim()
			.replace(/^export\s+/, '');

		if (!key) {
			errors.push(
				createParseError(lineNumber, 'Empty key before equals sign', filepath),
			);
			continue;
		}

		if (!KEY_PATTERN.test(key)) {
			errors.push(createParseError(lineNumber, 'Invalid key format', filepath));
			continue;
		}

		// A quoted value with no closing quote on this line spans the
		// following lines until one closes it.
		const openQuote = findOpenQuote(line.substring(equalIndex + 1).trim());
		if (openQuote) {
			while (i < lines.length && !closesQuote(lines[i] ?? '', openQuote)) {
				i++;
			}
			if (i >= lines.length) {
				errors.push(
					createParseError(
						lineNumber,
						`Unterminated ${openQuote} quoted value for "${key}"`,
						filepath,
					),
				);
			}
			if (i < lines.length) {
				i++; // consume the closing line
			}
		}

		if (!seen.has(key)) {
			seen.add(key);
			keys.push(key);
		}
	}

	return {
		keys: Object.freeze(keys),
		errors: Object.freeze(errors),
	};
}

type Quote = '"' | "'" | '`';

function findOpenQuote(value: string): Quote | null {
	const first = value[0];
	if (first !== '"' && first !== "'" && first !== '`') {
		return null;
	}
	return closesQuote(value.substring(1), first) ? null : first;
}

function closesQuote(line: string, quote: Quote): boolean {
	for (let j = 0; j < line.length; j++) {
		if (line[j] === '\\') {
			j++;
			continue;
		}
		if (line[j] === quote) {
			return true;
		}
	}
	return false;
}

function createParseError(
	lineNumber: number,
	message: string,
	filepath: string,
): ParseError {
	return {
		type: 'parse-error',
		message: `Line ${lineNumber}: ${message}`,
		filepath,
	};
}
