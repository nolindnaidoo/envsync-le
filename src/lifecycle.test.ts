import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_createExtensionContext,
	_live,
	_outputChannels,
	_registeredCommands,
	_resetMockState,
	_respondToWarning,
	_setConfig,
	_setFile,
	_setLmApi,
	_statusBarItems,
	_watchers,
	Uri,
	window,
	workspace,
} from './__mocks__/vscode';
import { createVSCodeConfiguration } from './adapters/vscodeConfiguration';
import { createVSCodeStatusBar } from './adapters/vscodeStatusBar';
import { createVSCodeTelemetry } from './adapters/vscodeTelemetry';
import { registerVSCodeWatchers } from './adapters/vscodeWatcher';
import { readConfig } from './config/config';
import type { Detector } from './detection/detector';
import { activate } from './extension';
import type { FileSystem } from './interfaces';

/**
 * What the extension holds, and whether it lets go.
 *
 * An extension host stays up for days, so a resource created per command and
 * never released is a real leak, and a deactivation that leaves a listener, a
 * watcher or a timer behind is one too. The mock counts what is alive:
 * created and not disposed, registered and not removed.
 */

async function run(id: string, ...args: unknown[]): Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	await handler(...args);
}

function openWorkspace(): void {
	_setFile('/ws/.env', 'A=1\nB=2');
	_setFile('/ws/.env.local', 'A=1');
	_setFile('/ws/.env.example', 'A=\nB=');
}

const EVERY_COMMAND: ReadonlyArray<readonly [string, ...unknown[]]> = [
	['envsync-le.showIssues'],
	[
		'envsync-le.compareSelected',
		undefined,
		[Uri.file('/ws/.env'), Uri.file('/ws/.env.local')],
	],
	['envsync-le.setTemplate', Uri.file('/ws/.env.example')],
	['envsync-le.clearTemplate'],
	['envsync-le.ignoreFile', Uri.file('/ws/.env.local')],
	['envsync-le.stopIgnoring', Uri.file('/ws/.env.local')],
	['envsync-le.clearAllIgnored'],
	['envsync-le.openSettings'],
	['envsync-le.help'],
];

beforeEach(() => {
	_resetMockState();
	_setConfig('envsync-le.telemetryEnabled', true);
	_setLmApi(true);
	_respondToWarning(() => 'Yes');
});

describe('dispose is complete and safe to repeat', () => {
	it('status bar', () => {
		const context = _createExtensionContext();
		const configuration = createVSCodeConfiguration(workspace as never);
		const statusBar = createVSCodeStatusBar(
			context as never,
			{
				window: window as never,
				StatusBarAlignment: { Left: 1, Right: 2 } as never,
				ThemeColor: class {} as never,
				onDidChangeConfiguration: workspace.onDidChangeConfiguration as never,
				readConfig,
			},
			configuration,
		);
		statusBar.updateStatus('in-sync', 0);
		for (const disposable of context.subscriptions) disposable.dispose();
		statusBar.dispose();
		expect(_statusBarItems()[0]?.disposed).toBe(true);
		expect(_live().configListeners).toBe(0);
		expect(() => {
			statusBar.dispose();
			for (const disposable of context.subscriptions) disposable.dispose();
		}).not.toThrow();
	});

	it('telemetry channel', () => {
		const telemetry = createVSCodeTelemetry(
			createVSCodeConfiguration(workspace as never),
		);
		telemetry.event('x');
		expect(_outputChannels()).toHaveLength(1);
		telemetry.dispose();
		expect(_outputChannels()[0]?.disposed).toBe(true);
		expect(() => telemetry.dispose()).not.toThrow();
	});

	it('watchers, their listener and the debounce timer', () => {
		vi.useFakeTimers();
		try {
			const context = _createExtensionContext();
			const detector = {
				checkSync: vi.fn(async () => undefined as never),
				checkSyncForFiles: vi.fn(),
				dispose: () => {},
			} as unknown as Detector;
			registerVSCodeWatchers(
				context as never,
				detector,
				createVSCodeConfiguration(workspace as never),
				{ asRelativePath: (p: string) => p } as unknown as FileSystem,
			);
			_watchers()[0]?.fireChange(Uri.file('/ws/.env'));
			expect(vi.getTimerCount()).toBe(1);

			for (const disposable of context.subscriptions) disposable.dispose();
			expect(vi.getTimerCount()).toBe(0);
			expect(_live().watchers).toBe(0);
			expect(_live().configListeners).toBe(0);
			// An event after dispose reaches nothing: the host drops the
			// listeners with the watcher, and the mock does the same.
			_watchers()[0]?.fireChange(Uri.file('/ws/.env'));
			vi.advanceTimersByTime(5000);
			expect(detector.checkSync).not.toHaveBeenCalled();
			expect(() => {
				for (const disposable of context.subscriptions) disposable.dispose();
			}).not.toThrow();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('deactivation leaves nothing behind', () => {
	it('after every command has run once', async () => {
		vi.useFakeTimers();
		try {
			openWorkspace();
			const context = _createExtensionContext();
			activate(context as never);
			await vi.advanceTimersByTimeAsync(0);
			for (const [id, ...args] of EVERY_COMMAND) await run(id, ...args);
			expect(_live()).toEqual({
				statusBarItems: 1,
				outputChannels: 1,
				configListeners: 2,
				watchers: 1,
				commands: 9,
				mcpProviders: 1,
			});

			for (const disposable of context.subscriptions) disposable.dispose();
			expect(_live()).toEqual({
				statusBarItems: 0,
				outputChannels: 0,
				configListeners: 0,
				watchers: 0,
				commands: 0,
				mcpProviders: 0,
			});
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('repeated runs do not grow', () => {
	it('fifty rounds of every command', async () => {
		openWorkspace();
		activate(_createExtensionContext() as never);
		for (const [id, ...args] of EVERY_COMMAND) await run(id, ...args);
		const afterOne = _live();
		for (let round = 0; round < 49; round++) {
			for (const [id, ...args] of EVERY_COMMAND) await run(id, ...args);
		}
		expect(_live()).toEqual(afterOne);
	});
});
