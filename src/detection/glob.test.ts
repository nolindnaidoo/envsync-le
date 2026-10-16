import { describe, expect, it } from 'vitest';
import { shouldExcludeFile } from './heuristics';

// The crate's `braces_and_classes_match_as_the_extension_matches` holds the
// same table.
const CASES: readonly (readonly [string, string, boolean])[] = [
	['.env.{local,test}', '.env.local', true],
	['.env.{local,test}', '.env.prod', false],
	['.env.{a,{b,c}}', '.env.c', true],
	['.env.[pd]*', '.env.prod', true],
	['.env.[pd]*', '.env.local', false],
	['.env.[!p]*', '.env.prod', false],
	['.env.[!p]*', '.env.local', true],
	['.env.[a-c]', '.env.b', true],
	['apps/{web,api}/.env', 'apps/api/.env', true],
	['apps/{web,api}/.env', 'apps/cli/.env', false],
	['.env.{local', '.env.{local', true],
	['.env.[x', '.env.[x', true],
	['**/.env.{dev,prod}', 'a/b/.env.dev', true],
	['a[/]b', 'a/b', false],
	['.env.[]]', '.env.]', true],
	// A range that does not compile excludes nothing.
	['.env.[z-a]', '.env.b', false],
];

describe('exclude globs', () => {
	it.each(CASES)('%s against %s is %s', (pattern, file, expected) => {
		expect(shouldExcludeFile(file, [pattern])).toBe(expected);
	});
});

describe('a pattern that does not compile', () => {
	it('excludes nothing and leaves the other patterns working', () => {
		expect(shouldExcludeFile('.env.local', ['[z-a]', '*.local'])).toBe(true);
		expect(shouldExcludeFile('.env', ['[z-a]', '*.local'])).toBe(false);
	});
});
