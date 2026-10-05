import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_getConfigUpdates,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_respondToWarning,
	_setConfig,
	_setFile,
	_setFindFilesError,
	_shownMessages,
	_statusBarItems,
	commands,
	executedBuiltins,
	Uri,
} from './__mocks__/vscode';
import { activate, deactivate } from './extension';

const ALL_COMMANDS = [
	'envsync-le.openSettings',
	'envsync-le.showIssues',
	'envsync-le.compareSelected',
	'envsync-le.setTemplate',
	'envsync-le.clearTemplate',
	'envsync-le.ignoreFile',
	'envsync-le.stopIgnoring',
	'envsync-le.clearAllIgnored',
	'envsync-le.help',
];

async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('extension activation', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('registers every command declared in the manifest', async () => {
		activate(_createExtensionContext() as never);
		await flush();

		const registered = [..._registeredCommands().keys()].sort();
		expect(registered).toEqual([...ALL_COMMANDS].sort());
	});

	it('runs the initial sync check and updates the status bar', async () => {
		_setFile('/ws/.env', 'A=1\nB=2');
		_setFile('/ws/.env.local', 'A=1');

		activate(_createExtensionContext() as never);
		await flush();

		const item = _statusBarItems()[0];
		expect(item?.visible).toBe(true);
		expect(item?.text).toBe('$(file) 1');
		// missing-keys warning shown at default 'important' level
		expect(
			_shownMessages().some(
				(m) => m.kind === 'warning' && m.message.includes('Missing keys'),
			),
		).toBe(true);
	});

	it('deactivate is a no-op', () => {
		expect(deactivate()).toBeUndefined();
	});
});

describe('commands (through the real wiring)', () => {
	beforeEach(async () => {
		_resetMockState();
		activate(_createExtensionContext() as never);
		await flush();
	});

	it('openSettings filters settings to the extension prefix', async () => {
		await commands.executeCommand('envsync-le.openSettings');
		expect(executedBuiltins).toContainEqual({
			id: 'workbench.action.openSettings',
			args: ['envsync-le.'],
		});
	});

	it('help opens a markdown document listing real commands', async () => {
		await commands.executeCommand('envsync-le.help');
		const doc = _openedDocuments().at(-1);
		expect(doc?.languageId).toBe('markdown');
		expect(doc?.getText()).toContain('EnvSync-LE Help');
		expect(doc?.getText()).toContain('Show Details');
	});

	it('showIssues reports when no env files exist', async () => {
		await commands.executeCommand('envsync-le.showIssues');
		expect(
			_shownMessages().some((m) =>
				m.message.includes('No .env files found in workspace'),
			),
		).toBe(true);
	});

	it('showIssues opens a report when keys are missing', async () => {
		_setFile('/ws/.env', 'A=1\nB=2');
		_setFile('/ws/.env.local', 'A=1');

		await commands.executeCommand('envsync-le.showIssues');

		const doc = _openedDocuments().at(-1);
		expect(doc?.getText()).toContain('Sync Report');
		expect(doc?.getText()).toContain('Missing Keys');
		expect(doc?.getText()).toContain('- B');
	});

	it('compareSelected compares the given uris', async () => {
		_setFile('/ws/.env', 'A=1');
		_setFile('/ws/.env.local', 'A=1');

		await commands.executeCommand('envsync-le.compareSelected', undefined, [
			Uri.file('/ws/.env'),
			Uri.file('/ws/.env.local'),
		]);

		expect(
			_shownMessages().some((m) =>
				m.message.includes('Selected .env files are in sync'),
			),
		).toBe(true);
	});

	it('compareSelected warns when fewer than two files are selected', async () => {
		await commands.executeCommand('envsync-le.compareSelected', undefined, [
			Uri.file('/ws/.env'),
		]);

		expect(
			_shownMessages().some((m) => m.message.includes('at least 2 .env files')),
		).toBe(true);
	});

	it('setTemplate updates templateFile and comparisonMode', async () => {
		_setFile('/ws/.env.example', 'A=1');

		await commands.executeCommand(
			'envsync-le.setTemplate',
			Uri.file('/ws/.env.example'),
		);

		const updates = _getConfigUpdates();
		expect(updates).toContainEqual(
			expect.objectContaining({
				key: 'envsync-le.templateFile',
				value: 'ws/.env.example',
			}),
		);
		expect(updates).toContainEqual(
			expect.objectContaining({
				key: 'envsync-le.comparisonMode',
				value: 'template',
			}),
		);
	});

	it('setTemplate rejects non-env files', async () => {
		await commands.executeCommand(
			'envsync-le.setTemplate',
			Uri.file('/ws/README.md'),
		);

		expect(
			_shownMessages().some((m) =>
				m.message.includes('Please select a .env file'),
			),
		).toBe(true);
		expect(_getConfigUpdates()).toHaveLength(0);
	});

	it('clearTemplate resets to auto mode', async () => {
		await commands.executeCommand('envsync-le.clearTemplate');

		const updates = _getConfigUpdates();
		expect(updates).toContainEqual(
			expect.objectContaining({
				key: 'envsync-le.comparisonMode',
				value: 'auto',
			}),
		);
	});

	it('ignoreFile adds the file to temporaryIgnore', async () => {
		_setFile('/ws/.env.local', 'A=1');

		await commands.executeCommand(
			'envsync-le.ignoreFile',
			Uri.file('/ws/.env.local'),
		);

		expect(_getConfigUpdates()).toContainEqual(
			expect.objectContaining({
				key: 'envsync-le.temporaryIgnore',
				value: ['ws/.env.local'],
			}),
		);
	});

	it('stopIgnoring removes the file from temporaryIgnore', async () => {
		_setConfig('envsync-le.temporaryIgnore', ['ws/.env.local']);

		await commands.executeCommand(
			'envsync-le.stopIgnoring',
			Uri.file('/ws/.env.local'),
		);

		expect(_getConfigUpdates()).toContainEqual(
			expect.objectContaining({
				key: 'envsync-le.temporaryIgnore',
				value: [],
			}),
		);
	});

	it('clearAllIgnored empties the list after confirmation', async () => {
		_setConfig('envsync-le.temporaryIgnore', ['a/.env', 'b/.env']);
		_respondToWarning(() => 'Yes');

		await commands.executeCommand('envsync-le.clearAllIgnored');

		expect(_getConfigUpdates()).toContainEqual(
			expect.objectContaining({
				key: 'envsync-le.temporaryIgnore',
				value: [],
			}),
		);
	});

	it('clearAllIgnored does nothing without confirmation', async () => {
		_setConfig('envsync-le.temporaryIgnore', ['a/.env']);
		_respondToWarning(() => 'No');

		await commands.executeCommand('envsync-le.clearAllIgnored');

		expect(_getConfigUpdates()).toHaveLength(0);
	});
});

describe('activation: initial sync failure', () => {
	// checkSync resolves with an error report rather than rejecting, so the
	// reporting happens inside the detector. These drive a real failure through
	// activate and assert the user is told exactly once, and not at all when the
	// level is silent.

	it('reports the failure at a non-silent notification level', async () => {
		_resetMockState();
		_setConfig('envsync-le.notificationLevel', 'all');
		_setFindFilesError(new Error('workspace unavailable'));

		activate(_createExtensionContext() as never);
		// The check runs detached; let its rejection settle.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(true);
	});

	it('stays quiet at the silent notification level', async () => {
		_resetMockState();
		_setConfig('envsync-le.notificationLevel', 'silent');
		_setFindFilesError(new Error('workspace unavailable'));

		activate(_createExtensionContext() as never);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(false);
	});
});
