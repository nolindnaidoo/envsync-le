import { describe, expect, it } from 'vitest';
import type { Configuration } from '../interfaces';
import { readConfig } from './config';

describe('readConfig', () => {
	it('should return default values when configuration is empty', () => {
		const mockConfig: Configuration = {
			get: (key: string, defaultValue: unknown) => {
				if (key === 'excludePatterns') return ['.env.*.local'];
				if (key === 'compareOnlyFiles') return [];
				if (key === 'temporaryIgnore') return [];
				return defaultValue;
			},
			getSection: () => ({
				get: () => undefined,
				getSection: () => ({
					get: () => undefined,
					getSection: () => ({}) as never,
					has: () => false,
					keys: () => [],
				}),
				has: () => false,
				keys: () => [],
			}),
			has: () => false,
			keys: () => [],
		};

		const result = readConfig(mockConfig);

		expect(result.enabled).toBe(true);
		expect(result.watchPatterns).toEqual(['.env*']);
		expect(result.excludePatterns).toEqual(['.env.*.local']);
		expect(result.notificationLevel).toBe('important');
		expect(result.statusBarEnabled).toBe(true);
		expect(result.debounceMs).toBe(1000);
		expect(result.ignoreComments).toBe(true);
		expect(result.caseSensitive).toBe(true);
		expect(result.telemetryEnabled).toBe(false);
		expect(result.comparisonMode).toBe('auto');
		expect(result.compareOnlyFiles).toEqual([]);
		expect(result.templateFile).toBeUndefined();
		expect(result.temporaryIgnore).toEqual([]);
		expect(result.safetyEnabled).toBe(false);
	});

	it('should handle custom configuration values', () => {
		const mockConfig: Configuration = {
			get: (key: string, defaultValue: unknown) => {
				const values: Record<string, unknown> = {
					enabled: false,
					watchPatterns: ['.env', '.env.local'],
					excludePatterns: ['.env.prod'],
					notificationsLevel: 'all',
					'statusBar.enabled': false,
					debounceMs: 500,
					ignoreComments: false,
					caseSensitive: false,
					telemetryEnabled: true,
					comparisonMode: 'manual',
					compareOnlyFiles: ['.env.template'],
					templateFile: '.env.template',
					temporaryIgnore: ['.env.ignored'],
				};
				return values[key] ?? defaultValue;
			},
			getSection: () => ({
				get: (key: string, defaultValue: unknown) => {
					if (key === 'enabled') return false;
					return defaultValue;
				},
				getSection: () => ({
					get: () => undefined,
					getSection: () => ({}) as never,
					has: () => false,
					keys: () => [],
				}),
				has: () => false,
				keys: () => [],
			}),
			has: () => true,
			keys: () => ['enabled', 'watchPatterns'],
		};

		const result = readConfig(mockConfig);

		expect(result.enabled).toBe(false);
		expect(result.watchPatterns).toEqual(['.env', '.env.local']);
		expect(result.excludePatterns).toEqual(['.env.prod']);
		expect(result.notificationLevel).toBe('all');
		expect(result.statusBarEnabled).toBe(false);
		expect(result.debounceMs).toBe(500);
		expect(result.ignoreComments).toBe(false);
		expect(result.caseSensitive).toBe(false);
		expect(result.telemetryEnabled).toBe(true);
		expect(result.comparisonMode).toBe('manual');
		expect(result.compareOnlyFiles).toEqual(['.env.template']);
		expect(result.templateFile).toBe('.env.template');
		expect(result.temporaryIgnore).toEqual(['.env.ignored']);
	});

	it('should enforce minimum debounce value', () => {
		const mockConfig: Configuration = {
			get: (key: string, defaultValue: unknown) => {
				if (key === 'debounceMs') return 50; // Below minimum
				return defaultValue;
			},
			getSection: () => ({
				get: () => undefined,
				getSection: () => ({
					get: () => undefined,
					getSection: () => ({}) as never,
					has: () => false,
					keys: () => [],
				}),
				has: () => false,
				keys: () => [],
			}),
			has: () => false,
			keys: () => [],
		};

		const result = readConfig(mockConfig);
		expect(result.debounceMs).toBe(100); // Should be clamped to minimum
	});

	it('should validate notification levels', () => {
		const mockConfig: Configuration = {
			get: (key: string, defaultValue: unknown) => {
				if (key === 'notificationsLevel') return 'invalid-level';
				return defaultValue;
			},
			getSection: () => ({
				get: () => undefined,
				getSection: () => ({
					get: () => undefined,
					getSection: () => ({}) as never,
					has: () => false,
					keys: () => [],
				}),
				has: () => false,
				keys: () => [],
			}),
			has: () => false,
			keys: () => [],
		};

		const result = readConfig(mockConfig);
		expect(result.notificationLevel).toBe('important'); // Should fallback to default
	});

	it('should validate comparison modes', () => {
		const mockConfig: Configuration = {
			get: (key: string, defaultValue: unknown) => {
				if (key === 'comparisonMode') return 'invalid-mode';
				return defaultValue;
			},
			getSection: () => ({
				get: () => undefined,
				getSection: () => ({
					get: () => undefined,
					getSection: () => ({}) as never,
					has: () => false,
					keys: () => [],
				}),
				has: () => false,
				keys: () => [],
			}),
			has: () => false,
			keys: () => [],
		};

		const result = readConfig(mockConfig);
		expect(result.comparisonMode).toBe('auto'); // Should fallback to default
	});

	it('should return frozen arrays for immutability', () => {
		const mockConfig: Configuration = {
			get: (key: string, defaultValue: unknown) => {
				if (key === 'watchPatterns') return ['.env*'];
				if (key === 'excludePatterns') return ['.env.*.local'];
				if (key === 'compareOnlyFiles') return [];
				if (key === 'temporaryIgnore') return [];
				return defaultValue;
			},
			getSection: () => ({
				get: () => undefined,
				getSection: () => ({
					get: () => undefined,
					getSection: () => ({}) as never,
					has: () => false,
					keys: () => [],
				}),
				has: () => false,
				keys: () => [],
			}),
			has: () => false,
			keys: () => [],
		};

		const result = readConfig(mockConfig);

		expect(Object.isFrozen(result.watchPatterns)).toBe(true);
		expect(Object.isFrozen(result.excludePatterns)).toBe(true);
		expect(Object.isFrozen(result.compareOnlyFiles)).toBe(true);
		expect(Object.isFrozen(result.temporaryIgnore)).toBe(true);
	});
});
