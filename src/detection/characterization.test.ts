import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DotenvFile } from '../types';
import { compareFiles } from './comparator';
import { detectFileType, shouldExcludeFile } from './heuristics';
import { parseDotenvFile } from './parser';

/**
 * Characterization tests: pin the full detection output per input.
 * Behavior changes must update these snapshots in the same commit, so
 * every output diff is explicit and lands in the CHANGELOG ledger.
 */

const FIXTURES = ['basic.env', 'tricky.env'] as const;

describe('parser characterization', () => {
	for (const fixture of FIXTURES) {
		it(`parses ${fixture}`, () => {
			const content = readFileSync(
				join(__dirname, '__fixtures__', fixture),
				'utf8',
			);
			const result = parseDotenvFile(content, fixture);
			expect(result).toMatchSnapshot();
		});
	}
});

describe('detectFileType characterization', () => {
	const FILENAMES = [
		'.env',
		'.env.local',
		'.env.example',
		'.env.template',
		'.env.production',
		'.env.prod',
		'.env.development',
		'.env.dev',
		'.env.test',
		'.env.development.local',
		'.env.production.local',
		'.env.staging',
		'app.device.env',
		'foo.test.env',
		'/deep/path/.env',
		'C:\\project\\.env',
		'C:\\project\\.env.local',
	];

	it('classifies filenames', () => {
		const result = Object.fromEntries(
			FILENAMES.map((name) => [name, detectFileType(name)]),
		);
		expect(result).toMatchSnapshot();
	});
});

describe('shouldExcludeFile characterization', () => {
	const CASES: ReadonlyArray<{ path: string; patterns: string[] }> = [
		{ path: '.env.staging.local', patterns: ['.env.*.local'] },
		{ path: 'config/.env.staging.local', patterns: ['.env.*.local'] },
		{ path: 'config/.env.staging.local', patterns: ['**/.env.*.local'] },
		{ path: '.env.local', patterns: ['*.local'] },
		{ path: 'a/b/.env', patterns: ['**/.env'] },
		{ path: '.env', patterns: ['.env'] },
		{ path: 'sub/.env', patterns: ['.env'] },
	];

	it('matches exclude globs', () => {
		const result = CASES.map(({ path, patterns }) => ({
			path,
			patterns,
			excluded: shouldExcludeFile(path, patterns),
		}));
		expect(result).toMatchSnapshot();
	});
});

describe('comparator characterization', () => {
	function file(path: string, keys: string[]): DotenvFile {
		return {
			path,
			type: detectFileType(path),
			keys: Object.freeze(keys),
		};
	}

	const REPORT_SHAPE = { lastChecked: expect.any(Number) };

	it('empty file list', () => {
		expect(compareFiles([])).toMatchSnapshot(REPORT_SHAPE);
	});

	it('two files in sync', () => {
		const files = [file('.env', ['A', 'B']), file('.env.local', ['A', 'B'])];
		expect(compareFiles(files)).toMatchSnapshot(REPORT_SHAPE);
	});

	it('auto mode unions keys and attributes a reference', () => {
		const files = [
			file('.env', ['A', 'B', 'C']),
			file('.env.local', ['A']),
			file('.env.production', ['A', 'B']),
		];
		expect(compareFiles(files)).toMatchSnapshot(REPORT_SHAPE);
	});

	it('no single file holds all missing keys -> "other files"', () => {
		const files = [
			file('.env', ['A', 'X']),
			file('.env.local', ['A', 'Y']),
			file('.env.production', ['A']),
		];
		expect(compareFiles(files)).toMatchSnapshot(REPORT_SHAPE);
	});

	it('case difference treated as distinct keys', () => {
		const files = [file('.env', ['DB_URL']), file('.env.local', ['db_url'])];
		expect(compareFiles(files)).toMatchSnapshot(REPORT_SHAPE);
	});

	it('template mode compares against template keys only', () => {
		const files = [
			file('.env.example', ['A', 'B']),
			file('.env', ['A', 'B', 'EXTRA']),
			file('.env.local', ['A']),
		];
		expect(
			compareFiles(files, { mode: 'template', templatePath: '.env.example' }),
		).toMatchSnapshot(REPORT_SHAPE);
	});

	it('template path not in files falls back to union', () => {
		const files = [file('.env', ['A']), file('.env.local', ['A', 'B'])];
		expect(
			compareFiles(files, { mode: 'template', templatePath: '.env.missing' }),
		).toMatchSnapshot(REPORT_SHAPE);
	});
});
