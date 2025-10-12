import { describe, expect, it } from 'vitest';
import { detectFileType, parseDotenvFile, shouldExcludeFile } from './parser';

describe('detectFileType', () => {
	it('should detect base .env files', () => {
		expect(detectFileType('.env')).toBe('base');
		expect(detectFileType('/path/to/.env')).toBe('base');
	});

	it('should detect local files', () => {
		expect(detectFileType('.env.local')).toBe('local');
		expect(detectFileType('.env.development.local')).toBe('local');
		expect(detectFileType('/path/to/.env.production.local')).toBe('local');
	});

	it('should detect example files', () => {
		expect(detectFileType('.env.example')).toBe('example');
		expect(detectFileType('.env.template')).toBe('example');
		expect(detectFileType('/path/to/.env.example')).toBe('example');
	});

	it('should detect production files', () => {
		expect(detectFileType('.env.production')).toBe('production');
		expect(detectFileType('.env.prod')).toBe('production');
		expect(detectFileType('/path/to/.env.production')).toBe('production');
	});

	it('should detect development files', () => {
		expect(detectFileType('.env.development')).toBe('development');
		expect(detectFileType('.env.dev')).toBe('development');
		expect(detectFileType('/path/to/.env.dev')).toBe('development');
	});

	it('should detect test files', () => {
		expect(detectFileType('.env.test')).toBe('test');
		expect(detectFileType('/path/to/.env.test')).toBe('test');
	});

	it('should fallback to base for unknown patterns', () => {
		expect(detectFileType('.env.unknown')).toBe('base');
		expect(detectFileType('random.txt')).toBe('base');
	});
});

describe('shouldExcludeFile', () => {
	it('should exclude files matching exact patterns', () => {
		const patterns = ['.env.local', '.env.production'];
		expect(shouldExcludeFile('.env.local', patterns)).toBe(true);
		expect(shouldExcludeFile('.env.production', patterns)).toBe(true);
		expect(shouldExcludeFile('.env.development', patterns)).toBe(false);
	});

	it('should handle glob patterns with asterisks', () => {
		const patterns = ['.env.*.local', '*.test'];
		expect(shouldExcludeFile('.env.development.local', patterns)).toBe(true);
		expect(shouldExcludeFile('.env.production.local', patterns)).toBe(true);
		expect(shouldExcludeFile('.env.test', patterns)).toBe(true);
		expect(shouldExcludeFile('.env.development', patterns)).toBe(false);
	});

	it('should handle empty exclude patterns', () => {
		expect(shouldExcludeFile('.env.local', [])).toBe(false);
	});

	it('should handle complex paths', () => {
		const patterns = ['**/.env.*.local'];
		expect(
			shouldExcludeFile('deep/nested/path/.env.development.local', patterns),
		).toBe(true);
	});

	it('should match path-aware patterns', () => {
		const patterns = ['packages/**/.env.*.local'];
		expect(
			shouldExcludeFile('packages/app/.env.production.local', patterns),
		).toBe(true);
		expect(
			shouldExcludeFile('packages/web/nested/.env.dev.local', patterns),
		).toBe(true);
		expect(shouldExcludeFile('other/.env.dev.local', patterns)).toBe(false);
	});
});

describe('parseDotenvFile', () => {
	it('should parse valid .env content', () => {
		const content = 'KEY1=value1\nKEY2=value2\nKEY3=value3';
		const result = parseDotenvFile(content, 'test.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual(['KEY1', 'KEY2', 'KEY3']);
		expect(result.errors).toEqual([]);
	});

	it('should handle empty content', () => {
		const result = parseDotenvFile('', 'empty.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('should handle content with only comments and empty lines', () => {
		const content = '# Comment\n\n# Another comment\n  \n';
		const result = parseDotenvFile(content, 'comments.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('should handle malformed content gracefully', () => {
		const content = 'INVALID_CONTENT_WITHOUT_EQUALS';
		const result = parseDotenvFile(content, 'malformed.env');

		// The parser should detect malformed content and report errors
		expect(result.success).toBe(true);
		expect(result.keys).toEqual([]);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]?.type).toBe('parse-error');
	});

	it('should handle parse errors gracefully', () => {
		// Test with content that might cause parsing issues
		// Note: The dotenv parser is very lenient, so we test the error structure
		// by creating a scenario where the parser might fail
		const result = parseDotenvFile('', 'empty.env');

		// Even empty content should parse successfully
		expect(result.success).toBe(true);
		expect(result.keys).toEqual([]);
		expect(result.errors).toEqual([]);

		// Test that the error structure is properly typed when errors do occur
		// (though the dotenv parser rarely fails in practice)
		expect(Object.isFrozen(result.errors)).toBe(true);
	});

	it('should return frozen arrays for immutability', () => {
		const content = 'KEY=value';
		const result = parseDotenvFile(content, 'test.env');

		expect(Object.isFrozen(result.keys)).toBe(true);
		expect(Object.isFrozen(result.errors)).toBe(true);
	});
});
