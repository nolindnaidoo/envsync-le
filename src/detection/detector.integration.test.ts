import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
	Configuration,
	FileSystem,
	Notifier,
	StatusBar,
	Telemetry,
} from '../interfaces';
import { createDetector } from './detector';

describe('detector integration tests', () => {
	const dataDir = join(__dirname, '__data__');

	function createMockDependencies(): {
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
		configuration: Configuration;
		fileSystem: FileSystem;
	} {
		return {
			telemetry: {
				event: vi.fn(),
			},
			notifier: {
				showMissingKeys: vi.fn(),
				showParseError: vi.fn(),
				showInfo: vi.fn(),
				showWarning: vi.fn(),
				showError: vi.fn(),
			},
			statusBar: {
				updateStatus: vi.fn(),
			},
			configuration: {
				get: vi.fn((key: string, defaultValue: any) => {
					const config: Record<string, any> = {
						enabled: true,
						watchPatterns: ['**/.env*'],
						excludePatterns: ['.env.*.local'],
						notificationLevel: 'important',
						statusBarEnabled: true,
						debounceMs: 1000,
						ignoreComments: true,
						caseSensitive: true,
						telemetryEnabled: false,
						comparisonMode: 'auto',
						compareOnlyFiles: [],
						templateFile: undefined,
						temporaryIgnore: [],
						safetyEnabled: true,
						fileSizeWarnBytes: 1024 * 1024,
						maxFilesWarn: 50,
						maxTotalSizeWarn: 5 * 1024 * 1024,
						maxProcessingTimeWarn: 5000,
					};
					return config[key] ?? defaultValue;
				}),
				getSection: vi.fn(() => ({
					get: vi.fn((key: string, defaultValue: any) => defaultValue),
					has: vi.fn(() => false),
				})),
				has: vi.fn(() => false),
			},
			fileSystem: {
				findFiles: vi.fn(),
				readFile: vi.fn(),
				getFileStats: vi.fn(),
				asRelativePath: vi.fn((path: string) => path),
				fileExists: vi.fn(),
			},
		};
	}

	it('should detect in-sync files correctly', async () => {
		const deps = createMockDependencies();
		const detector = createDetector(deps);

		// Mock file system to return sample files
		const sampleContent = readFileSync(join(dataDir, 'sample.env'), 'utf-8');
		deps.fileSystem.findFiles = vi.fn().mockResolvedValue([
			{ filepath: '/project/.env', uri: 'file:///project/.env' },
			{
				filepath: '/project/.env.example',
				uri: 'file:///project/.env.example',
			},
		]);
		deps.fileSystem.readFile = vi.fn().mockResolvedValue(sampleContent);
		deps.fileSystem.getFileStats = vi
			.fn()
			.mockResolvedValue({ mtime: new Date() });
		deps.fileSystem.asRelativePath = vi
			.fn()
			.mockImplementation((path: string) => path.split('/').pop() || path);

		const report = await detector.checkSync();

		expect(report.status).toBe('in-sync');
		expect(report.files.length).toBe(2);
		expect(report.missingKeys).toEqual([]);
		expect(report.extraKeys).toEqual([]);
		expect(report.errors).toEqual([]);
	});

	it('should detect missing keys correctly', async () => {
		const deps = createMockDependencies();
		const detector = createDetector(deps);

		// Mock files with different key sets
		const baseContent = readFileSync(join(dataDir, 'sample.env'), 'utf-8');
		const localContent = readFileSync(
			join(dataDir, 'sample.env.local'),
			'utf-8',
		);

		deps.fileSystem.findFiles = vi.fn().mockResolvedValue([
			{ filepath: '/project/.env', uri: 'file:///project/.env' },
			{ filepath: '/project/.env.local', uri: 'file:///project/.env.local' },
		]);
		deps.fileSystem.readFile = vi
			.fn()
			.mockResolvedValueOnce(baseContent) // .env
			.mockResolvedValueOnce(localContent); // .env.local
		deps.fileSystem.getFileStats = vi
			.fn()
			.mockResolvedValue({ mtime: new Date() });
		deps.fileSystem.asRelativePath = vi
			.fn()
			.mockImplementation((path: string) => path.split('/').pop() || path);

		const report = await detector.checkSync();

		expect(report.status).toBe('missing-keys');
		expect(report.missingKeys.length).toBeGreaterThan(0);

		// .env should be missing keys that are in .env.local
		const envMissing = report.missingKeys.find(
			(m) => m.filepath === '/project/.env',
		);
		expect(envMissing).toBeDefined();
		expect(envMissing!.keys.length).toBeGreaterThan(0);
	});

	it('should handle parse errors gracefully', async () => {
		const deps = createMockDependencies();
		const detector = createDetector(deps);

		const invalidContent = readFileSync(join(dataDir, 'invalid.env'), 'utf-8');

		deps.fileSystem.findFiles = vi
			.fn()
			.mockResolvedValue([
				{ filepath: '/project/.env', uri: 'file:///project/.env' },
			]);
		deps.fileSystem.readFile = vi.fn().mockResolvedValue(invalidContent);
		deps.fileSystem.getFileStats = vi
			.fn()
			.mockResolvedValue({ mtime: new Date() });

		const report = await detector.checkSync();

		expect(report.status).toBe('in-sync'); // File has valid keys despite parse errors
		expect(report.errors.length).toBeGreaterThan(0); // But still has parse errors
	});

	it('should handle template mode correctly', async () => {
		const deps = createMockDependencies();
		deps.configuration.get = vi.fn((key: string, defaultValue: any) => {
			const config: Record<string, any> = {
				enabled: true,
				watchPatterns: ['**/.env*'],
				excludePatterns: [],
				notificationLevel: 'important',
				statusBarEnabled: true,
				debounceMs: 1000,
				ignoreComments: true,
				caseSensitive: true,
				telemetryEnabled: false,
				comparisonMode: 'template',
				compareOnlyFiles: [],
				templateFile: '.env.example',
				temporaryIgnore: [],
				safetyEnabled: true,
				fileSizeWarnBytes: 1024 * 1024,
				maxFilesWarn: 50,
				maxTotalSizeWarn: 5 * 1024 * 1024,
				maxProcessingTimeWarn: 5000,
			};
			return config[key] ?? defaultValue;
		});

		const detector = createDetector(deps);

		const exampleContent = readFileSync(
			join(dataDir, 'sample.env.example'),
			'utf-8',
		);
		const localContent = readFileSync(
			join(dataDir, 'sample.env.local'),
			'utf-8',
		);

		deps.fileSystem.findFiles = vi.fn().mockResolvedValue([
			{
				filepath: '/project/.env.example',
				uri: 'file:///project/.env.example',
			},
			{ filepath: '/project/.env.local', uri: 'file:///project/.env.local' },
		]);
		deps.fileSystem.readFile = vi
			.fn()
			.mockResolvedValueOnce(exampleContent) // .env.example
			.mockResolvedValueOnce(localContent); // .env.local
		deps.fileSystem.getFileStats = vi
			.fn()
			.mockResolvedValue({ mtime: new Date() });
		deps.fileSystem.asRelativePath = vi
			.fn()
			.mockImplementation((path: string) => path.split('/').pop() || path);

		const report = await detector.checkSync();

		expect(report.status).toBe('missing-keys');
		// .env.local should be missing keys that are in .env.example
		const localMissing = report.missingKeys.find(
			(m) => m.filepath === '/project/.env.local',
		);
		expect(localMissing).toBeDefined();
	});

	it('should handle disabled extension', async () => {
		const deps = createMockDependencies();
		deps.configuration.get = vi.fn((key: string, defaultValue: any) => {
			if (key === 'enabled') return false;
			return defaultValue;
		});

		const detector = createDetector(deps);
		const report = await detector.checkSync();

		expect(report.status).toBe('no-files');
		expect(report.files).toEqual([]);
		expect(report.missingKeys).toEqual([]);
		expect(report.extraKeys).toEqual([]);
		expect(report.errors).toEqual([]);
	});

	it('should handle no files found', async () => {
		const deps = createMockDependencies();
		const detector = createDetector(deps);

		deps.fileSystem.findFiles = vi.fn().mockResolvedValue([]);

		const report = await detector.checkSync();

		expect(report.status).toBe('no-files');
		expect(report.files).toEqual([]);
		expect(report.missingKeys).toEqual([]);
		expect(report.extraKeys).toEqual([]);
		expect(report.errors).toEqual([]);
	});
});
