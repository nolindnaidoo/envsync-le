import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDotenvFile } from './parser';

describe('parseDotenvFile integration tests', () => {
	const dataDir = join(__dirname, '__data__');

	it('should parse sample.env correctly', () => {
		const content = readFileSync(join(dataDir, 'sample.env'), 'utf-8');
		const expected = readFileSync(
			join(dataDir, 'sample.env.expected.txt'),
			'utf-8',
		)
			.trim()
			.split('\n')
			.filter((line) => line.trim());

		const result = parseDotenvFile(content, 'sample.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual(expected);
		expect(result.errors).toEqual([]);
	});

	it('should parse sample.env.local correctly', () => {
		const content = readFileSync(join(dataDir, 'sample.env.local'), 'utf-8');
		const expected = readFileSync(
			join(dataDir, 'sample.env.local.expected.txt'),
			'utf-8',
		)
			.trim()
			.split('\n')
			.filter((line) => line.trim());

		const result = parseDotenvFile(content, 'sample.env.local');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual(expected);
		expect(result.errors).toEqual([]);
	});

	it('should parse sample.env.example correctly', () => {
		const content = readFileSync(join(dataDir, 'sample.env.example'), 'utf-8');
		const expected = readFileSync(
			join(dataDir, 'sample.env.example.expected.txt'),
			'utf-8',
		)
			.trim()
			.split('\n')
			.filter((line) => line.trim());

		const result = parseDotenvFile(content, 'sample.env.example');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual(expected);
		expect(result.errors).toEqual([]);
	});

	it('should handle invalid.env gracefully', () => {
		const content = readFileSync(join(dataDir, 'invalid.env'), 'utf-8');
		const expected = readFileSync(
			join(dataDir, 'invalid.env.expected.txt'),
			'utf-8',
		)
			.trim()
			.split('\n')
			.filter((line) => line.trim());

		const result = parseDotenvFile(content, 'invalid.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual(expected);
		// Should have some parse errors for malformed lines
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('should handle empty file', () => {
		const result = parseDotenvFile('', 'empty.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('should handle file with only comments and empty lines', () => {
		const content = `# This is a comment
		
# Another comment

`;
		const result = parseDotenvFile(content, 'comments-only.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it('should handle case sensitivity correctly', () => {
		const content = `DATABASE_URL=postgresql://localhost:5432/db
database_url=postgresql://localhost:5432/db2
API_KEY=sk-12345
api_key=sk-67890`;

		const result = parseDotenvFile(content, 'case-test.env');

		expect(result.success).toBe(true);
		// Should extract all keys regardless of case
		expect(result.keys).toEqual([
			'DATABASE_URL',
			'database_url',
			'API_KEY',
			'api_key',
		]);
	});

	it('should handle values with special characters', () => {
		const content = `COMPLEX_URL=https://api.example.com/v1/endpoint?param=value&other=123
JSON_VALUE={"key": "value", "number": 42}
MULTILINE_VALUE=line1\\nline2\\nline3
SPECIAL_CHARS=!@#$%^&*()_+-=[]{}|;':",./<>?`;

		const result = parseDotenvFile(content, 'special-chars.env');

		expect(result.success).toBe(true);
		expect(result.keys).toEqual([
			'COMPLEX_URL',
			'JSON_VALUE',
			'MULTILINE_VALUE',
			'SPECIAL_CHARS',
		]);
	});
});
