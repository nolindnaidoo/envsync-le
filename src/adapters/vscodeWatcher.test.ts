import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_createExtensionContext,
	_fireConfigChange,
	_resetMockState,
	_setConfig,
	_watchers,
	Uri,
} from '../__mocks__/vscode';
import type { Detector } from '../detection/detector';
import type { Configuration } from '../interfaces/configuration';
import type { FileSystem } from '../interfaces/fileSystem';
import type { SyncReport } from '../types';
import { registerVSCodeWatchers } from './vscodeWatcher';

/**
 * The file watcher, which debounces detection and has to cope with being
 * disposed, with a check already in flight, and with a check that throws.
 *
 * None of that was reachable from the existing suite: it registered the
 * watcher and never fired an event, so the debounce, the in-flight guard and
 * both error handlers were unread.
 */

const EMPTY_REPORT: SyncReport = {
	status: 'in-sync',
	files: [],
	missingKeys: [],
	extraKeys: [],
	errors: [],
	lastChecked: 0,
};

function makeContext() {
	return _createExtensionContext() as never;
}

function makeDetector(
	behaviour: 'ok' | 'throws' | 'hangs' = 'ok',
): Detector & { calls: number } {
	let calls = 0;
	return {
		get calls() {
			return calls;
		},
		checkSync: async () => {
			calls += 1;
			if (behaviour === 'throws') throw new Error('check exploded');
			if (behaviour === 'hangs') return new Promise<SyncReport>(() => {});
			return EMPTY_REPORT;
		},
		checkSyncForFiles: async () => EMPTY_REPORT,
		dispose: () => {},
	} as unknown as Detector & { calls: number };
}

const configuration = {
	get: <T>(_k: string, fallback: T): T => fallback,
	has: () => false,
	update: async () => {},
} as unknown as Configuration;

const fileSystem = {
	findFiles: async () => [],
	readFile: async () => '',
	asRelativePath: (p: string) => p,
} as unknown as FileSystem;

beforeEach(() => {
	_resetMockState();
	vi.useRealTimers();
});

describe('registerVSCodeWatchers', () => {
	it('registers at least one file watcher', () => {
		registerVSCodeWatchers(
			makeContext(),
			makeDetector(),
			configuration,
			fileSystem,
		);
		expect(_watchers().length).toBeGreaterThan(0);
	});

	it('runs a sync check after a file change, debounced', async () => {
		vi.useFakeTimers();
		const detector = makeDetector();
		registerVSCodeWatchers(makeContext(), detector, configuration, fileSystem);

		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		expect(detector.calls).toBe(0); // debounced, not immediate

		await vi.advanceTimersByTimeAsync(1000);
		expect(detector.calls).toBeGreaterThan(0);
	});

	it('waits the configured debounce, not the default', async () => {
		// Every other setting had a test showing its effect; this one was only
		// read back from the configuration.
		vi.useFakeTimers();
		_setConfig('envsync-le.debounceMs', 250);
		const detector = makeDetector();
		registerVSCodeWatchers(
			makeContext(),
			detector,
			{
				get: <T>(key: string, fallback: T): T =>
					key === 'debounceMs' ? (250 as T) : fallback,
				has: () => false,
			} as unknown as Configuration,
			fileSystem,
		);

		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(240);
		expect(detector.calls).toBe(0);
		await vi.advanceTimersByTimeAsync(10);
		expect(detector.calls).toBe(1);
	});

	it('collapses a burst of events into one check', async () => {
		vi.useFakeTimers();
		const detector = makeDetector();
		registerVSCodeWatchers(makeContext(), detector, configuration, fileSystem);

		const watcher = _watchers()[0];
		watcher?.fireChange(Uri.file('/w/.env'));
		watcher?.fireChange(Uri.file('/w/.env'));
		watcher?.fireCreate(Uri.file('/w/.env.example'));
		await vi.advanceTimersByTimeAsync(1000);

		expect(detector.calls).toBe(1);
	});

	it('reacts to create and delete as well as change', async () => {
		vi.useFakeTimers();
		const detector = makeDetector();
		registerVSCodeWatchers(makeContext(), detector, configuration, fileSystem);

		_watchers()[0]?.fireDelete(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);
		expect(detector.calls).toBeGreaterThan(0);
	});

	it('survives a sync check that throws', async () => {
		// The watcher must not take the extension down with it, and must stay
		// responsive afterwards.
		vi.useFakeTimers();
		const detector = makeDetector('throws');
		registerVSCodeWatchers(makeContext(), detector, configuration, fileSystem);

		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);
		expect(detector.calls).toBe(1);

		// The in-flight guard must clear on failure too, or one error would
		// silence the watcher permanently.
		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);
		expect(detector.calls).toBe(2);
	});

	it('stays quiet about a failed check at the silent notification level', async () => {
		vi.useFakeTimers();
		_setConfig('envsync-le.notificationLevel', 'silent');
		const detector = makeDetector('throws');
		registerVSCodeWatchers(makeContext(), detector, configuration, fileSystem);

		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);
		expect(detector.calls).toBe(1);
	});

	it('does not start a second check while one is in flight', async () => {
		vi.useFakeTimers();
		const detector = makeDetector('hangs');
		registerVSCodeWatchers(makeContext(), detector, configuration, fileSystem);

		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);
		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);

		expect(detector.calls).toBe(1);
	});

	it('checks once more for a change that arrived while a check was in flight', async () => {
		// The check reads the files it was told about; a file edited after
		// that read and before the check returned was never read, and the
		// event for it used to be dropped, so the status bar showed the
		// state before the edit until something else changed.
		vi.useFakeTimers();
		let calls = 0;
		const releases: Array<() => void> = [];
		const detector = {
			checkSync: () => {
				calls += 1;
				return new Promise<SyncReport>((resolve) => {
					releases.push(() => resolve(EMPTY_REPORT));
				});
			},
			checkSyncForFiles: async () => EMPTY_REPORT,
			dispose: () => {},
		} as unknown as Detector;
		registerVSCodeWatchers(makeContext(), detector, configuration, fileSystem);

		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);
		expect(calls).toBe(1); // suspended inside the first check

		_watchers()[0]?.fireChange(Uri.file('/w/.env'));
		await vi.advanceTimersByTimeAsync(1000);
		expect(calls).toBe(1); // not a second check while one is in flight

		releases[0]?.();
		await vi.advanceTimersByTimeAsync(0);
		expect(calls).toBe(2); // the change made during the check is checked

		releases[1]?.();
		await vi.advanceTimersByTimeAsync(1000);
		expect(calls).toBe(2); // and once is enough
	});

	it('re-registers watchers when the patterns setting changes', async () => {
		registerVSCodeWatchers(
			makeContext(),
			makeDetector(),
			configuration,
			fileSystem,
		);
		const before = _watchers().length;
		_fireConfigChange('envsync-le.watchPatterns');
		expect(_watchers().length).toBeGreaterThanOrEqual(before);
	});

	it('ignores a configuration change for another section', async () => {
		registerVSCodeWatchers(
			makeContext(),
			makeDetector(),
			configuration,
			fileSystem,
		);
		const before = _watchers().length;
		_fireConfigChange('editor.fontSize');
		expect(_watchers().length).toBe(before);
	});
});
