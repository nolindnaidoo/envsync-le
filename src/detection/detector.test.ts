import { describe, expect, it, vi } from 'vitest';
import type {
	Configuration,
	FileSystem,
	Notifier,
	StatusBar,
	Telemetry,
} from '../interfaces';
import { createDetector } from './detector';

// Mock dependencies
const createMockTelemetry = (): Telemetry => ({
	event: vi.fn(),
	dispose: vi.fn(),
});

const createMockNotifier = (): Notifier => ({
	showMissingKeys: vi.fn(),
	showExtraKeys: vi.fn(),
	showError: vi.fn(),
	showParseError: vi.fn(),
});

const createMockStatusBar = (): StatusBar => ({
	updateStatus: vi.fn(),
	dispose: vi.fn(),
});

const createMockConfiguration = (): Configuration => ({
	get: vi.fn((key: string, defaultValue: unknown) => {
		const values: Record<string, unknown> = {
			enabled: true,
			watchPatterns: ['.env*'],
			excludePatterns: ['.env.*.local'],
			notificationLevel: 'important',
			statusBarEnabled: true,
			debounceMs: 1000,
			caseSensitive: true,
			telemetryEnabled: false,
			comparisonMode: 'auto',
			compareOnlyFiles: [],
			templateFile: undefined,
			temporaryIgnore: [],
		};
		return values[key] ?? defaultValue;
	}) as Configuration['get'],
	has: vi.fn(() => false),
});

const createMockFileSystem = (): FileSystem => ({
	findFiles: vi.fn(),
	readFile: vi.fn(),
	getFileStats: vi.fn(),
	asRelativePath: vi.fn(),
	fileExists: vi.fn(),
});

describe('createDetector', () => {
	it('should create detector with all required methods', () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});

		expect(detector).toHaveProperty('checkSync');
		expect(detector).toHaveProperty('checkSyncForFiles');
		expect(detector).toHaveProperty('dispose');
		expect(typeof detector.checkSync).toBe('function');
		expect(typeof detector.checkSyncForFiles).toBe('function');
		expect(typeof detector.dispose).toBe('function');
	});

	it('should return disabled status when configuration is disabled', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// Override enabled to false
		(configuration.get as ReturnType<typeof vi.fn>).mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === 'enabled') return false;
				return defaultValue;
			},
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});

		const result = await detector.checkSync();

		expect(result.status).toBe('no-files');
		expect(result.files).toEqual([]);
		expect(result.missingKeys).toEqual([]);
		expect(result.extraKeys).toEqual([]);
		expect(result.errors).toEqual([]);
		expect(result.lastChecked).toBeGreaterThan(0);
	});

	it('should discover and compare files when enabled', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// Mock file discovery
		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ filepath: '.env', uri: 'file://.env' },
			{ filepath: '.env.local', uri: 'file://.env.local' },
		]);

		// Mock file reading
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => {
				if (filepath === '.env')
					return Promise.resolve('KEY1=value1\nKEY2=value2');
				if (filepath === '.env.local') return Promise.resolve('KEY1=value1');
				return Promise.resolve('');
			},
		);

		// Mock file stats
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 100,
			isFile: true,
			isDirectory: false,
		});

		// Mock relative path conversion
		(fileSystem.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => filepath,
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});

		const result = await detector.checkSync();

		expect(result.status).toBe('missing-keys');
		expect(result.files).toHaveLength(2);
		expect(result.missingKeys).toHaveLength(1);
		expect(result.missingKeys[0]?.filepath).toBe('.env.local');
		expect(result.missingKeys[0]?.keys).toEqual(['KEY2']);

		// Verify UI updates were called
		expect(statusBar.updateStatus).toHaveBeenCalledWith('missing-keys', 1);
		expect(notifier.showMissingKeys).toHaveBeenCalledWith('.env.local', [
			'KEY2',
		]);
		expect(telemetry.event).toHaveBeenCalledWith('sync-check', {
			status: 'missing-keys',
			fileCount: '2',
			missingKeyCount: '1',
		});
	});

	it('should handle file reading errors gracefully', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// Mock file discovery
		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ filepath: '.env', uri: 'file://.env' },
		]);

		// Mock file reading to throw error
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('File read error'),
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});

		const result = await detector.checkSync();

		// A file that could not be read is not "no files": the error is the
		// status, and the status bar shows it rather than hiding.
		expect(result.status).toBe('parse-error');
		expect(result.files).toHaveLength(0); // No files successfully loaded
		expect(result.errors).toHaveLength(1);
		expect(statusBar.updateStatus).toHaveBeenCalledWith('parse-error', 1);
	});

	it('does not announce files as in sync when one of them could not be parsed', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ filepath: '.env', uri: 'file://.env' },
			{ filepath: '.env.local', uri: 'file://.env.local' },
		]);
		// The same keys on both sides, and one line .env.local cannot parse.
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) =>
				Promise.resolve(
					filepath === '.env' ? 'KEY1=1\nKEY2=2' : 'KEY1=1\n2BAD=x\nKEY2=2',
				),
		);
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 100,
			isFile: true,
			isDirectory: false,
		});
		(fileSystem.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => filepath,
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});
		const result = await detector.checkSync();

		expect(result.status).toBe('parse-error');
		expect(result.errors.map((error) => error.message)).toEqual([
			'Line 2: Invalid key format',
		]);
		expect(statusBar.updateStatus).toHaveBeenCalledWith('parse-error', 1);
		expect(notifier.showParseError).toHaveBeenCalledWith(
			'.env.local',
			'Line 2: Invalid key format',
		);
	});

	it('keeps a mismatch as the status and counts the errors beside it', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ filepath: '.env', uri: 'file://.env' },
			{ filepath: '.env.local', uri: 'file://.env.local' },
		]);
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) =>
				Promise.resolve(filepath === '.env' ? 'KEY1=1\nKEY2=2' : '2BAD=x'),
		);
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 100,
			isFile: true,
			isDirectory: false,
		});
		(fileSystem.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => filepath,
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});
		const result = await detector.checkSync();

		expect(result.status).toBe('missing-keys');
		expect(result.errors).toHaveLength(1);
		// One mismatch and one error: both are issues the bar counts.
		expect(statusBar.updateStatus).toHaveBeenCalledWith('missing-keys', 2);
	});

	it('orders the report by path, whatever order the workspace listed the files in', async () => {
		// The workspace search returns files in no promised order, and the
		// report took them as they came: two runs over one workspace could
		// list the files and name the reference file differently.
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ filepath: '/w/.env.production', uri: 'file:///w/.env.production' },
			{ filepath: '/w/.env', uri: 'file:///w/.env' },
			{ filepath: '/w/.env.local', uri: 'file:///w/.env.local' },
		]);
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) =>
				Promise.resolve(filepath === '/w/.env.local' ? 'A=1' : 'A=1\nB=2'),
		);
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 3,
			isFile: true,
			isDirectory: false,
		});
		(fileSystem.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => filepath.slice(3),
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});
		const result = await detector.checkSync();

		expect(result.files.map((file) => file.path)).toEqual([
			'/w/.env',
			'/w/.env.local',
			'/w/.env.production',
		]);
		expect(result.missingKeys).toEqual([
			{ filepath: '/w/.env.local', keys: ['B'], reference: '/w/.env' },
		]);
	});

	it('says so when more files match a pattern than it compares', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// One over the hundred the comparison reads. Before, the hundred were
		// compared and nothing said the rest existed.
		const found = Array.from({ length: 101 }, (_, index) => ({
			filepath: `apps/service-${String(index).padStart(3, '0')}/.env`,
			uri: `file://apps/service-${index}/.env`,
		}));
		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockImplementation(
			(_pattern: string, _exclude: unknown, maxResults?: number) =>
				Promise.resolve(found.slice(0, maxResults)),
		);
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('A=1');
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 3,
			isFile: true,
			isDirectory: false,
		});
		(fileSystem.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => filepath,
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});
		const result = await detector.checkSync();

		expect(result.files).toHaveLength(100);
		expect(result.status).toBe('parse-error');
		expect(result.errors).toEqual([
			{
				type: 'read-error',
				message:
					'More than 100 files match .env*; only the first 100 were compared',
				filepath: 'pattern-search',
			},
		]);
	});

	it('reports selected files that could not be read as an error, not as no files', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('EACCES: permission denied'),
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});
		const result = await detector.checkSyncForFiles(['.env', '.env.local']);

		expect(result.status).toBe('parse-error');
		expect(result.errors.map((error) => error.filepath)).toEqual([
			'.env',
			'.env.local',
		]);
		expect(statusBar.updateStatus).toHaveBeenCalledWith('parse-error', 2);
	});

	it('should check sync for specific files', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// Mock file reading for specific files
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => {
				if (filepath === '.env')
					return Promise.resolve('KEY1=value1\nKEY2=value2');
				if (filepath === '.env.local') return Promise.resolve('KEY1=value1');
				return Promise.resolve('');
			},
		);

		// Mock file stats
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 100,
			isFile: true,
			isDirectory: false,
		});

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});

		const result = await detector.checkSyncForFiles(['.env', '.env.local']);

		expect(result.status).toBe('missing-keys');
		expect(result.files).toHaveLength(2);
		expect(result.missingKeys).toHaveLength(1);
		expect(result.missingKeys[0]?.filepath).toBe('.env.local');
		expect(result.missingKeys[0]?.keys).toEqual(['KEY2']);

		// Verify telemetry was called
		expect(telemetry.event).toHaveBeenCalledWith('sync-check-selected', {
			status: 'missing-keys',
			fileCount: '2',
			missingKeyCount: '1',
		});
	});

	it('should handle errors during sync check', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// Mock file discovery to throw error
		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('Discovery error'),
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});

		const result = await detector.checkSync();

		// A discovery error is collected into the report rather than failing
		// the whole check, and it is the status: a search that failed is not a
		// workspace with no files, and the status bar must not hide.
		expect(result.status).toBe('parse-error');
		expect(result.files).toEqual([]);
		expect(result.missingKeys).toEqual([]);
		expect(result.extraKeys).toEqual([]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.type).toBe('read-error');
		expect(result.errors[0]?.message).toContain('Failed to search pattern');
		expect(result.errors[0]?.filepath).toBe('pattern-search');

		// Verify error handling UI updates
		expect(statusBar.updateStatus).toHaveBeenCalledWith('parse-error', 1);
		// Parse errors are shown if notification level allows
		expect(notifier.showParseError).toHaveBeenCalled();
	});

	it('should apply comparison mode filtering correctly', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// Mock configuration for manual mode
		(configuration.get as ReturnType<typeof vi.fn>).mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === 'comparisonMode') return 'manual';
				if (key === 'compareOnlyFiles') return ['.env', '.env.production'];
				return defaultValue;
			},
		);

		// Mock file discovery
		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ filepath: '.env', uri: 'file://.env' },
			{ filepath: '.env.local', uri: 'file://.env.local' },
			{ filepath: '.env.production', uri: 'file://.env.production' },
		]);

		// Mock file reading
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation(() =>
			Promise.resolve('KEY1=value1'),
		);

		// Mock file stats
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 100,
			isFile: true,
			isDirectory: false,
		});

		// Mock relative path conversion
		(fileSystem.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => filepath,
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});

		const result = await detector.checkSync();

		// Should only include files specified in compareOnlyFiles
		expect(result.files).toHaveLength(2);
		expect(result.files.map((f) => f.path)).toEqual([
			'.env',
			'.env.production',
		]);
		expect(result.status).toBe('in-sync');
	});

	it('should compare against template keys when in template mode', async () => {
		const telemetry = createMockTelemetry();
		const notifier = createMockNotifier();
		const statusBar = createMockStatusBar();
		const configuration = createMockConfiguration();
		const fileSystem = createMockFileSystem();

		// Configure template mode
		(configuration.get as ReturnType<typeof vi.fn>).mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === 'comparisonMode') return 'template';
				if (key === 'templateFile') return '.env.template';
				return defaultValue;
			},
		);

		// Discover three files
		(fileSystem.findFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ filepath: '.env.template', uri: 'file://.env.template' },
			{ filepath: '.env', uri: 'file://.env' },
			{ filepath: '.env.local', uri: 'file://.env.local' },
		]);

		// File contents: template has K1,K2; .env has K1; .env.local has K1,K2,K3
		(fileSystem.readFile as ReturnType<typeof vi.fn>).mockImplementation(
			(filepath: string) => {
				if (filepath === '.env.template') return Promise.resolve('K1=1\nK2=2');
				if (filepath === '.env') return Promise.resolve('K1=1');
				if (filepath === '.env.local')
					return Promise.resolve('K1=1\nK2=2\nK3=3');
				return Promise.resolve('');
			},
		);
		(fileSystem.getFileStats as ReturnType<typeof vi.fn>).mockResolvedValue({
			mtime: new Date(),
			size: 100,
			isFile: true,
			isDirectory: false,
		});
		(fileSystem.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation(
			(p: string) => p,
		);

		const detector = createDetector({
			telemetry,
			notifier,
			statusBar,
			configuration,
			fileSystem,
		});
		const result = await detector.checkSync();

		expect(result.status).toBe('missing-keys');
		// Only .env should be missing K2 relative to template
		const envMissing = result.missingKeys.find((m) => m.filepath === '.env');
		expect(envMissing?.keys).toEqual(['K2']);
	});
});
