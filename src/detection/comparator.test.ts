import { describe, expect, it } from 'vitest';
import type { DotenvFile } from '../types';
import { areFilesInSync, compareFiles, sameFile } from './comparator';

describe('compareFiles', () => {
	it('should handle empty file list', () => {
		const result = compareFiles([]);

		expect(result.status).toBe('no-files');
		expect(result.files).toEqual([]);
		expect(result.missingKeys).toEqual([]);
		expect(result.extraKeys).toEqual([]);
		expect(result.errors).toEqual([]);
		expect(result.lastChecked).toBeGreaterThan(0);
	});

	it('should use template keys as reference in template mode', () => {
		const now = Date.now();
		const files: DotenvFile[] = [
			{
				path: '.env.template',
				type: 'example',
				keys: ['K1', 'K2'],
				lastModified: now,
			},
			{ path: '.env', type: 'base', keys: ['K1'], lastModified: now },
			{
				path: '.env.local',
				type: 'local',
				keys: ['K1', 'K2', 'K3'],
				lastModified: now,
			},
		];

		const result = compareFiles(files, {
			mode: 'template',
			templatePath: '.env.template',
		});

		// .env is missing K2 relative to template
		// .env.local has extra K3 but we only report missing relative to template today
		expect(result.status).toBe('missing-keys');
		const envMissing = result.missingKeys.find((m) => m.filepath === '.env');
		expect(envMissing?.keys).toEqual(['K2']);
	});

	it('should detect in-sync files', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2', 'KEY3'],
				lastModified: Date.now(),
			},
			{
				path: '.env.local',
				type: 'local',
				keys: ['KEY1', 'KEY2', 'KEY3'],
				lastModified: Date.now(),
			},
			{
				path: '.env.production',
				type: 'production',
				keys: ['KEY1', 'KEY2', 'KEY3'],
				lastModified: Date.now(),
			},
		];

		const result = compareFiles(files);

		expect(result.status).toBe('in-sync');
		expect(result.files).toHaveLength(3);
		expect(result.missingKeys).toEqual([]);
		expect(result.extraKeys).toEqual([]);
	});

	it('should detect missing keys', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2', 'KEY3'],
				lastModified: Date.now(),
			},
			{
				path: '.env.local',
				type: 'local',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
			{
				path: '.env.production',
				type: 'production',
				keys: ['KEY1', 'KEY2', 'KEY3', 'KEY4'],
				lastModified: Date.now(),
			},
		];

		const result = compareFiles(files);

		expect(result.status).toBe('missing-keys');
		// Each file missing keys from others gets a missingKeys entry
		expect(result.missingKeys).toHaveLength(2);
		// .env.local is missing KEY3 and KEY4
		const localMissing = result.missingKeys.find(
			(m) => m.filepath === '.env.local',
		);
		expect(localMissing?.keys).toEqual(['KEY3', 'KEY4']);
		// .env is missing KEY4
		const baseMissing = result.missingKeys.find((m) => m.filepath === '.env');
		expect(baseMissing?.keys).toEqual(['KEY4']);
	});

	it('should handle files with completely different keys', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
			{
				path: '.env.local',
				type: 'local',
				keys: ['KEY3', 'KEY4'],
				lastModified: Date.now(),
			},
		];

		const result = compareFiles(files);

		expect(result.status).toBe('missing-keys');
		expect(result.missingKeys).toHaveLength(2);
		expect(result.missingKeys[0]?.keys).toEqual(['KEY3', 'KEY4']);
		expect(result.missingKeys[1]?.keys).toEqual(['KEY1', 'KEY2']);
	});

	it('should return frozen arrays for immutability', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1'], lastModified: Date.now() },
		];

		const result = compareFiles(files);

		expect(Object.isFrozen(result.files)).toBe(true);
		expect(Object.isFrozen(result.missingKeys)).toBe(true);
		expect(Object.isFrozen(result.extraKeys)).toBe(true);
		expect(Object.isFrozen(result.errors)).toBe(true);
	});
});

describe('areFilesInSync', () => {
	it('should return true for empty file list', () => {
		expect(areFilesInSync([])).toBe(true);
	});

	it('should return true for single file', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
		];
		expect(areFilesInSync(files)).toBe(true);
	});

	it('should return true for identical files', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
			{
				path: '.env.local',
				type: 'local',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
		];
		expect(areFilesInSync(files)).toBe(true);
	});

	it('should return false for different key counts', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
			{
				path: '.env.local',
				type: 'local',
				keys: ['KEY1'],
				lastModified: Date.now(),
			},
		];
		expect(areFilesInSync(files)).toBe(false);
	});

	it('should return false for different keys', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
			{
				path: '.env.local',
				type: 'local',
				keys: ['KEY1', 'KEY3'],
				lastModified: Date.now(),
			},
		];
		expect(areFilesInSync(files)).toBe(false);
	});

	it('should handle undefined keys gracefully', () => {
		const files: DotenvFile[] = [
			{
				path: '.env',
				type: 'base',
				keys: ['KEY1', 'KEY2'],
				lastModified: Date.now(),
			},
			{ path: '.env.local', type: 'local', keys: [], lastModified: Date.now() },
		];
		expect(areFilesInSync(files)).toBe(false);
	});
});

describe('a template named by the name it ends in', () => {
	const file = (path: string, keys: string[]): DotenvFile => ({
		path,
		type: 'base',
		keys: Object.freeze(keys),
		lastModified: 0,
	});
	const files = [file('.env.example', ['A']), file('.env', ['A', 'LOCAL'])];

	it.each(['.env.example', './.env.example', 'sub/.env.example', '/abs/.env.example', 'C:\\abs\\.env.example'])(
		'%s is the template, so LOCAL is extra',
		(templatePath) => {
			const result = compareFiles(files, { mode: 'template', templatePath });
			expect(result.extraKeys).toEqual([
				{ filepath: '.env', keys: ['LOCAL'], reference: '.env.example' },
			]);
		},
	);

	it('a partial component is not the same file', () => {
		for (const [discovered, named] of [
			['.env.example', 'my.env.example'],
			['config/.env', 'other/.env.example'],
			['.env', '.env.local'],
		]) {
			expect(sameFile(discovered as string, named as string)).toBe(false);
		}
		const result = compareFiles(files, {
			mode: 'template',
			templatePath: 'my.env.example',
		});
		expect(result.extraKeys).toEqual([]);
	});
});

describe('caseSensitive option', () => {
	const file = (path: string, keys: string[]): DotenvFile => ({
		path,
		type: 'base',
		keys: Object.freeze(keys),
		lastModified: 1700000000000,
	});

	it('treats differently-cased keys as distinct by default', () => {
		const files = [file('.env', ['DB_URL']), file('.env.local', ['db_url'])];
		const result = compareFiles(files);
		expect(result.status).toBe('missing-keys');
		expect(result.missingKeys).toHaveLength(2);
	});

	it('treats differently-cased keys as equal when caseSensitive is false', () => {
		const files = [file('.env', ['DB_URL']), file('.env.local', ['db_url'])];
		const result = compareFiles(files, { caseSensitive: false });
		expect(result.status).toBe('in-sync');
		expect(result.missingKeys).toHaveLength(0);
	});

	it('reports reference-cased key names when case-insensitive', () => {
		const files = [
			file('.env', ['API_KEY', 'PORT']),
			file('.env.local', ['api_key']),
		];
		const result = compareFiles(files, { caseSensitive: false });
		expect(result.missingKeys).toHaveLength(1);
		expect(result.missingKeys[0]?.keys).toEqual(['PORT']);
	});
});
