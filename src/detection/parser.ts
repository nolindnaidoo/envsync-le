import type { DotenvFileType, ParseResult } from '../types';

export function parseDotenvFile(
	content: string,
	filepath: string,
): ParseResult {
	const keys: string[] = [];
	const errors: Array<{
		type: 'parse-error' | 'read-error' | 'access-error';
		message: string;
		filepath: string;
	}> = [];

	try {
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]?.trim();
			const lineNumber = i + 1;

			// Skip empty lines and comments
			if (!line || line.startsWith('#')) {
				continue;
			}

			// Check for valid KEY=VALUE format
			const equalIndex = line.indexOf('=');
			if (equalIndex === -1) {
				// No equals sign found
				if (line.length > 0) {
					errors.push({
						type: 'parse-error',
						message: `Line ${lineNumber}: Missing equals sign in "${line}"`,
						filepath,
					});
				}
				continue;
			}

			const key = line.substring(0, equalIndex).trim();
			if (!key) {
				errors.push({
					type: 'parse-error',
					message: `Line ${lineNumber}: Empty key before equals sign`,
					filepath,
				});
				continue;
			}

			// Validate key format (alphanumeric, underscore, dash)
			if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) {
				errors.push({
					type: 'parse-error',
					message: `Line ${lineNumber}: Invalid key format "${key}"`,
					filepath,
				});
				continue;
			}

			keys.push(key);
		}

		return {
			success: true,
			keys: Object.freeze(keys),
			errors: Object.freeze(errors),
		};
	} catch (error) {
		return {
			success: false,
			keys: Object.freeze([]),
			errors: Object.freeze([
				{
					type: 'parse-error',
					message: `Failed to parse ${filepath}: ${(error as Error).message}`,
					filepath,
				},
			]),
		};
	}
}

export function detectFileType(filepath: string): DotenvFileType {
	const filename = filepath.split('/').pop() ?? '';

	if (filename === '.env') return 'base';
	if (filename.includes('.local')) return 'local';
	if (filename.includes('.example') || filename.includes('.template'))
		return 'example';
	if (filename.includes('.production') || filename.includes('.prod'))
		return 'production';
	if (filename.includes('.development') || filename.includes('.dev'))
		return 'development';
	if (filename.includes('.test')) return 'test';

	return 'base'; // fallback
}

export function shouldExcludeFile(
	filepath: string,
	excludePatterns: readonly string[],
): boolean {
	// Match against full relative path. Support '*' and '**' segments.
	return excludePatterns.some((pattern) => matchSimpleGlob(filepath, pattern));
}

function matchSimpleGlob(input: string, pattern: string): boolean {
	const escaped = pattern.replace(/[.+?^${}()|[\\]/g, '\\$&');
	const DOUBLE_STAR = '\u0000';
	const withMarker = escaped.replace(/\*\*/g, DOUBLE_STAR);
	const singleExpanded = withMarker.replace(/\*/g, '[^/]*');
	const regexStr = `^${singleExpanded.replace(new RegExp(DOUBLE_STAR, 'g'), '.*')}$`;
	return new RegExp(regexStr).test(input);
}
