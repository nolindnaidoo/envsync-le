import { describe, expect, it } from 'vitest';
import { parseDotenvFile } from './parser';

describe('parseDotenvFile', () => {
	it('should parse valid .env content', () => {
		const content = 'KEY1=value1\nKEY2=value2\nKEY3=value3';
		const result = parseDotenvFile(content, 'test.env');

		expect(result.keys).toEqual(['KEY1', 'KEY2', 'KEY3']);
		expect(result.errors).toEqual([]);
	});

	it('should handle empty content', () => {
		const result = parseDotenvFile('', 'empty.env');

		expect(result.keys).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('should handle content with only comments and empty lines', () => {
		const content = '# Comment\n\n# Another comment\n  \n';
		const result = parseDotenvFile(content, 'comments.env');

		expect(result.keys).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('should report lines without an equals sign', () => {
		const content = 'INVALID_CONTENT_WITHOUT_EQUALS';
		const result = parseDotenvFile(content, 'malformed.env');

		expect(result.keys).toEqual([]);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]?.type).toBe('parse-error');
	});

	it('should extract keys best-effort alongside errors', () => {
		const content = 'GOOD=1\nBROKEN LINE\nALSO_GOOD=2';
		const result = parseDotenvFile(content, 'mixed.env');

		expect(result.keys).toEqual(['GOOD', 'ALSO_GOOD']);
		expect(result.errors).toHaveLength(1);
	});

	it('should accept a dotted key, as the dotenv loader does', () => {
		const result = parseDotenvFile(
			'spring.datasource.url=x\nlogging.level.root=INFO\n',
			'test.env',
		);
		expect(result.keys).toEqual([
			'spring.datasource.url',
			'logging.level.root',
		]);
		expect(result.errors).toEqual([]);
		expect(parseDotenvFile('.hidden=1', 'test.env').errors).not.toEqual([]);
	});

	it('should accept an export prefix', () => {
		const result = parseDotenvFile('export API_KEY=abc', 'test.env');

		expect(result.keys).toEqual(['API_KEY']);
		expect(result.errors).toEqual([]);
	});

	it('should consume double-quoted multiline values', () => {
		const content = 'CERT="-----BEGIN-----\nabc\n-----END-----"\nNEXT=1';
		const result = parseDotenvFile(content, 'test.env');

		expect(result.keys).toEqual(['CERT', 'NEXT']);
		expect(result.errors).toEqual([]);
	});

	it('should consume single-quoted and backtick multiline values', () => {
		const content = "A='line1\nline2'\nB=`x\ny`\nC=3";
		const result = parseDotenvFile(content, 'test.env');

		expect(result.keys).toEqual(['A', 'B', 'C']);
		expect(result.errors).toEqual([]);
	});

	it('should not treat an escaped quote as closing', () => {
		const content = 'A="one \\" two\nstill value"\nB=2';
		const result = parseDotenvFile(content, 'test.env');

		expect(result.keys).toEqual(['A', 'B']);
		expect(result.errors).toEqual([]);
	});

	it('should report an unterminated quoted value', () => {
		const content = 'A="never closed\nB=2';
		const result = parseDotenvFile(content, 'test.env');

		expect(result.keys).toEqual(['A']);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.message).toContain('Unterminated');
	});

	it('should count duplicate keys once', () => {
		const content = 'DUP=1\nDUP=2\nOTHER=3';
		const result = parseDotenvFile(content, 'test.env');

		expect(result.keys).toEqual(['DUP', 'OTHER']);
	});

	it('should handle CRLF line endings', () => {
		const content = 'A=1\r\nB=2\r\n';
		const result = parseDotenvFile(content, 'test.env');

		expect(result.keys).toEqual(['A', 'B']);
		expect(result.errors).toEqual([]);
	});

	it('should return frozen arrays for immutability', () => {
		const content = 'KEY=value';
		const result = parseDotenvFile(content, 'test.env');

		expect(Object.isFrozen(result.keys)).toBe(true);
		expect(Object.isFrozen(result.errors)).toBe(true);
	});
});
