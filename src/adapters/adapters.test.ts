import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_createExtensionContext,
	_fireConfigChange,
	_registeredCommands,
	_resetMockState,
	_respondToQuickPick,
	_setConfig,
	_setFile,
	_setFileBytes,
	_shownMessages,
	_statusBarItems,
	_watchers,
	FileType,
	StatusBarAlignment,
	ThemeColor,
	Uri,
	window,
	workspace,
} from '../__mocks__/vscode';
import { readConfig } from '../config/config';
import type { Detector } from '../detection/detector';
import { createVSCodeCommandAdapter } from './vscodeCommand';
import { createVSCodeConfiguration } from './vscodeConfiguration';
import { createVSCodeFileSystem } from './vscodeFileSystem';
import { createVSCodeNotifier } from './vscodeNotifier';
import { createVSCodeStatusBar } from './vscodeStatusBar';
import { createVSCodeTelemetry } from './vscodeTelemetry';
import { createVSCodeUserInterface } from './vscodeUserInterface';
import { registerVSCodeWatchers } from './vscodeWatcher';

beforeEach(() => {
	_resetMockState();
});

function makeConfiguration() {
	return createVSCodeConfiguration(workspace as never);
}

function makeFileSystem() {
	return createVSCodeFileSystem({
		Uri: Uri as never,
		workspaceFs: workspace.fs as never,
		findFiles: (pattern, exclude, maxResults) =>
			workspace.findFiles(pattern, exclude, maxResults) as never,
		asRelativePath: workspace.asRelativePath as never,
		FileType,
	});
}

describe('vscodeConfiguration', () => {
	it('reads values under the envsync-le section', () => {
		_setConfig('envsync-le.debounceMs', 250);
		const configuration = makeConfiguration();

		expect(configuration.get('debounceMs', 1000)).toBe(250);
		expect(configuration.get('missing', 'fallback')).toBe('fallback');
		expect(configuration.has('debounceMs')).toBe(true);
		expect(configuration.has('missing')).toBe(false);
	});

	it('reads a value changed after it was created', () => {
		// The host hands out a snapshot, so an adapter that kept the object it
		// was given at activation read every setting from that moment for the
		// life of the session: nothing took effect without a reload.
		const configuration = makeConfiguration();
		expect(configuration.get('debounceMs', 1000)).toBe(1000);

		_setConfig('envsync-le.debounceMs', 250);
		expect(configuration.get('debounceMs', 1000)).toBe(250);
		expect(configuration.has('debounceMs')).toBe(true);
	});
});

describe('vscodeCommand', () => {
	it('registers commands into subscriptions and executes them', async () => {
		const context = _createExtensionContext();
		const adapter = createVSCodeCommandAdapter(
			context as never,
			{
				showError: () => {},
			} as never,
		);

		const seen: unknown[] = [];
		adapter.registerCommand('envsync-le.testCmd', async (...args) => {
			seen.push(args);
		});

		expect(context.subscriptions).toHaveLength(1);
		expect(_registeredCommands().has('envsync-le.testCmd')).toBe(true);

		await adapter.executeCommand('envsync-le.testCmd', 1, 'two');
		expect(seen).toEqual([[1, 'two']]);
	});
});

describe('vscodeFileSystem', () => {
	it('reads files, stats, and existence from workspace.fs', async () => {
		_setFile('/ws/.env', 'A=1');
		const fileSystem = makeFileSystem();

		expect(await fileSystem.readFile('/ws/.env')).toBe('A=1');

		const stats = await fileSystem.getFileStats('/ws/.env');
		expect(stats.isFile).toBe(true);
		expect(stats.size).toBe(3);

		expect(await fileSystem.fileExists('/ws/.env')).toBe(true);
		expect(await fileSystem.fileExists('/ws/.env.missing')).toBe(false);

		const found = await fileSystem.findFiles('**/.env*');
		expect(found).toEqual([{ filepath: '/ws/.env', uri: 'file:///ws/.env' }]);

		expect(fileSystem.asRelativePath('/ws/.env')).toBe('ws/.env');
	});

	it('propagates read errors for missing files', async () => {
		const fileSystem = makeFileSystem();
		await expect(fileSystem.readFile('/nope')).rejects.toThrow('ENOENT');
	});

	it('refuses a file that is not UTF-8 text, in the words the CLI uses', async () => {
		// Decoding leniently turned a Latin-1 or UTF-16 file into text with
		// replacement characters, which the parser then reported as a line it
		// could not read, so the user was told the key was malformed rather
		// than that the file was never read as text.
		_setFileBytes('/ws/.env.latin1', Uint8Array.from([0x41, 0x3d, 0xe9, 0x0a]));
		_setFileBytes(
			'/ws/.env.utf16',
			Uint8Array.from([0xff, 0xfe, 0x41, 0x00, 0x3d, 0x00, 0x31, 0x00]),
		);
		const fileSystem = makeFileSystem();
		await expect(fileSystem.readFile('/ws/.env.latin1')).rejects.toThrow(
			'not UTF-8 text',
		);
		await expect(fileSystem.readFile('/ws/.env.utf16')).rejects.toThrow(
			'not UTF-8 text',
		);
	});

	it('drops a leading byte order mark and keeps one inside the text', async () => {
		_setFileBytes('/ws/.env.bom', Uint8Array.from([0xef, 0xbb, 0xbf, 0x41, 0x3d, 0x31]));
		const fileSystem = makeFileSystem();
		expect(await fileSystem.readFile('/ws/.env.bom')).toBe('A=1');
	});
});

describe('vscodeTelemetry', () => {
	it('is silent unless telemetryEnabled is true', () => {
		const telemetry = createVSCodeTelemetry(makeConfiguration());
		telemetry.event('nope');

		_setConfig('envsync-le.telemetryEnabled', true);
		telemetry.event('yes', { detail: 'x' });
		telemetry.dispose();

		// One channel was created lazily, holding exactly one line
		expect(_shownMessages()).toHaveLength(0);
	});
});

describe('vscodeNotifier', () => {
	function makeNotifier() {
		return createVSCodeNotifier(
			{ window: window as never, readConfig },
			makeConfiguration(),
		);
	}

	it('suppresses everything at silent level', () => {
		_setConfig('envsync-le.notificationLevel', 'silent');
		const notifier = makeNotifier();

		notifier.showMissingKeys('/ws/.env', ['A']);
		notifier.showExtraKeys('/ws/.env', ['B']);
		notifier.showError('boom');
		notifier.showParseError('/ws/.env', 'bad line');

		expect(_shownMessages()).toHaveLength(0);
	});

	it('shows missing keys and parse errors at important level', () => {
		const notifier = makeNotifier(); // default level: important

		notifier.showMissingKeys('/ws/.env.local', ['A', 'B', 'C', 'D']);
		notifier.showExtraKeys('/ws/.env.local', ['X']); // 'all' only
		notifier.showParseError('/ws/.env', 'bad line');

		const messages = _shownMessages();
		expect(messages).toHaveLength(2);
		expect(messages[0]?.message).toBe('Missing keys in .env.local: A, B, C...');
		expect(messages[1]?.message).toBe('Failed to parse .env: bad line');
	});

	it('shows extra keys only at all level', () => {
		_setConfig('envsync-le.notificationLevel', 'all');
		const notifier = makeNotifier();

		notifier.showExtraKeys('/ws/.env.local', ['X']);

		expect(_shownMessages()[0]?.message).toBe('Extra keys in .env.local: X');
	});
});

describe('vscodeStatusBar', () => {
	function makeStatusBar() {
		const context = _createExtensionContext();
		return createVSCodeStatusBar(
			context as never,
			{
				window: window as never,
				StatusBarAlignment: StatusBarAlignment as never,
				ThemeColor: ThemeColor as never,
				onDidChangeConfiguration: workspace.onDidChangeConfiguration as never,
				readConfig,
			},
			makeConfiguration(),
		);
	}

	it('renders each status', () => {
		const statusBar = makeStatusBar();
		const item = _statusBarItems()[0];

		statusBar.updateStatus('in-sync', 0);
		expect(item?.visible).toBe(true);
		expect(item?.text).toBe('$(file) 0');
		expect(item?.backgroundColor).toBeUndefined();

		statusBar.updateStatus('missing-keys', 3);
		expect(item?.text).toBe('$(file) 3');
		expect((item?.backgroundColor as ThemeColor | undefined)?.id).toBe(
			'statusBarItem.warningBackground',
		);
		expect(item?.command).toBe('envsync-le.showIssues');

		statusBar.updateStatus('extra-keys', 2);
		expect(item?.text).toBe('$(file) 2');

		statusBar.updateStatus('parse-error', 0);
		expect((item?.backgroundColor as ThemeColor | undefined)?.id).toBe(
			'statusBarItem.errorBackground',
		);

		statusBar.updateStatus('no-files', 0);
		expect(item?.visible).toBe(false);

		statusBar.dispose();
	});

	it('reacts to statusBar.enabled changes at runtime', () => {
		const statusBar = makeStatusBar();
		const item = _statusBarItems()[0];

		statusBar.updateStatus('in-sync', 0);
		expect(item?.visible).toBe(true);

		_setConfig('envsync-le.statusBar.enabled', false);
		_fireConfigChange('envsync-le.statusBar.enabled');
		expect(item?.visible).toBe(false);

		_setConfig('envsync-le.statusBar.enabled', true);
		_fireConfigChange('envsync-le.statusBar.enabled');
		expect(item?.visible).toBe(true);
	});
});

describe('vscodeUserInterface', () => {
	it('maps quick pick selections back to values (single)', async () => {
		const ui = createVSCodeUserInterface();
		_respondToQuickPick((items) => items[1]);

		const result = await ui.showQuickPick(
			[
				{ label: 'one', value: 1 },
				{ label: 'two', value: 2 },
			],
			{ placeHolder: 'pick' },
		);

		expect(result).toBe(2);
	});

	it('maps quick pick selections back to values (multi)', async () => {
		const ui = createVSCodeUserInterface();
		_respondToQuickPick((items) => [items[0], items[1]]);

		const result = await ui.showQuickPick(
			[
				{ label: 'one', value: 1 },
				{ label: 'two', value: 2 },
				{ label: 'three', value: 3 },
			],
			{ canPickMany: true },
		);

		expect(result).toEqual([1, 2]);
	});

	it('returns undefined when the pick is dismissed', async () => {
		const ui = createVSCodeUserInterface();
		_respondToQuickPick(undefined);

		const result = await ui.showQuickPick([{ label: 'one', value: 1 }], {});
		expect(result).toBeUndefined();
	});

	it('runs tasks under progress and shows messages', async () => {
		const ui = createVSCodeUserInterface();

		const value = await ui.showProgress(
			{ location: 'notification', title: 'working' },
			async () => 42,
		);
		expect(value).toBe(42);

		ui.showInformationMessage('info');
		ui.showErrorMessage('error');
		ui.showWarningMessage('warning');
		ui.showStatusBarMessage('status', 100);
		ui.showStatusBarMessage('status');

		expect(_shownMessages().map((m) => m.kind)).toEqual([
			'info',
			'error',
			'warning',
		]);
	});
});

describe('vscodeWatcher', () => {
	function makeDetector(): Detector & { calls: number } {
		const detector = {
			calls: 0,
			checkSync: async () => {
				detector.calls++;
				return undefined as never;
			},
			checkSyncForFiles: async () => undefined as never,
			dispose: () => {},
		};
		return detector;
	}

	it('debounces file events into a sync check', async () => {
		vi.useFakeTimers();
		const context = _createExtensionContext();
		const detector = makeDetector();

		registerVSCodeWatchers(
			context as never,
			detector,
			makeConfiguration(),
			makeFileSystem(),
		);

		const watcher = _watchers()[0];
		expect(watcher?.pattern).toBe('.env*');

		watcher?.fireChange(Uri.file('/ws/.env'));
		watcher?.fireChange(Uri.file('/ws/.env'));
		await vi.advanceTimersByTimeAsync(1100);

		expect(detector.calls).toBe(1);
		vi.useRealTimers();
	});

	it('skips events for excluded files', async () => {
		vi.useFakeTimers();
		_setConfig('envsync-le.excludePatterns', ['.env.*.local']);
		const context = _createExtensionContext();
		const detector = makeDetector();

		registerVSCodeWatchers(
			context as never,
			detector,
			makeConfiguration(),
			makeFileSystem(),
		);

		_watchers()[0]?.fireChange(Uri.file('/ws/.env.staging.local'));
		await vi.advanceTimersByTimeAsync(1100);

		expect(detector.calls).toBe(0);
		vi.useRealTimers();
	});

	it('rebuilds watchers when watchPatterns changes', () => {
		const context = _createExtensionContext();
		registerVSCodeWatchers(
			context as never,
			makeDetector(),
			makeConfiguration(),
			makeFileSystem(),
		);

		expect(_watchers()).toHaveLength(1);

		_setConfig('envsync-le.watchPatterns', ['.env*', 'config/.env*']);
		_fireConfigChange('envsync-le.watchPatterns');

		const all = _watchers();
		expect(all[0]?.disposed).toBe(true);
		expect(all.slice(1).map((w) => w.pattern)).toEqual([
			'.env*',
			'config/.env*',
		]);
	});

	it('cleans up on dispose', () => {
		const context = _createExtensionContext();
		registerVSCodeWatchers(
			context as never,
			makeDetector(),
			makeConfiguration(),
			makeFileSystem(),
		);

		for (const subscription of context.subscriptions) {
			subscription.dispose();
		}

		expect(_watchers().every((w) => w.disposed)).toBe(true);
	});
});
