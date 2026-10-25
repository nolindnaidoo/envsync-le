import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_getConfigUpdates,
	_holdConfigUpdates,
	_openedDocuments,
	_registeredCommands,
	_releaseConfigUpdates,
	_resetMockState,
	_respondToQuickPick,
	_respondToWarning,
	_setConfig,
	_setFile,
	_setFileBytes,
	_setFindFilesError,
	_setOpenDocumentError,
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

	it('showIssues opens the report, not the in-sync toast, when a file could not be parsed', async () => {
		_setFile('/ws/.env', 'A=1\nB=2');
		_setFile('/ws/.env.local', 'A=1\n2BAD=x\nB=2');

		await commands.executeCommand('envsync-le.showIssues');

		expect(
			_shownMessages().some((m) => m.message.includes('are in sync')),
		).toBe(false);
		const doc = _openedDocuments().at(-1);
		expect(doc?.getText()).toContain('Status: parse-error');
		expect(doc?.getText()).toContain('Parse / Read Errors');
		expect(doc?.getText()).toContain(
			'ws/.env.local: Line 2: Invalid key format',
		);
		expect(_statusBarItems()[0]?.visible).toBe(true);
		expect(_statusBarItems()[0]?.text).toBe('$(file) 1');
	});

	it('showIssues reports a report it could not open, in the user language', async () => {
		// The host can refuse to open a document; the command's catch was
		// reachable from no test because the mock could not refuse.
		_setFile('/ws/.env', 'A=1\nB=2');
		_setFile('/ws/.env.local', 'A=1');
		_setOpenDocumentError(new Error('no window'));

		await commands.executeCommand('envsync-le.showIssues');

		expect(
			_shownMessages()
				.filter((m) => m.kind === 'error')
				.map((m) => m.message),
		).toEqual(['Failed to show issues: no window']);
	});

	it('showIssues names a file that is not UTF-8 text', async () => {
		_setFile('/ws/.env', 'A=1');
		_setFileBytes('/ws/.env.latin1', Uint8Array.from([0x41, 0x3d, 0xe9, 0x0a]));

		await commands.executeCommand('envsync-le.showIssues');

		const doc = _openedDocuments().at(-1);
		expect(doc?.getText()).toContain('ws/.env.latin1: not UTF-8 text');
		expect(doc?.getText()).not.toContain('Invalid key format');
	});

	it('compareSelected names files that could not be parsed', async () => {
		_setFile('/ws/.env', 'A=1');
		_setFile('/ws/.env.local', 'A=1\nBROKEN');

		await commands.executeCommand('envsync-le.compareSelected', undefined, [
			Uri.file('/ws/.env'),
			Uri.file('/ws/.env.local'),
		]);

		expect(
			_shownMessages().some((m) =>
				m.message.includes('Some files could not be parsed'),
			),
		).toBe(true);
	});

	it.each([
		['envsync-le.compareSelected'],
		['envsync-le.setTemplate'],
		['envsync-le.ignoreFile'],
	])(
		'%s offers every env file in the workspace, not the first fifty',
		async (id) => {
			for (let index = 0; index < 60; index++) {
				_setFile(`/ws/service-${String(index).padStart(2, '0')}/.env`, 'A=1');
			}
			let offered = 0;
			_respondToQuickPick((items) => {
				offered = items.length;
				return undefined;
			});

			await commands.executeCommand(id);

			expect(offered).toBe(60);
		},
	);

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

	describe('two ignore commands started within one host write', () => {
		// The host lands a configuration write after the call returns. Each of
		// these commands reads the list and writes it back, so two started
		// together would each read the list from before the other's write, and
		// the last write would drop the first. The mock holds every write until
		// released, as the host holds it until it lands.
		const ignoreList = () =>
			_getConfigUpdates()
				.filter((update) => update.key === 'envsync-le.temporaryIgnore')
				.at(-1)?.value;

		it('ignoreFile twice: both files end up ignored', async () => {
			_holdConfigUpdates();
			const first = commands.executeCommand(
				'envsync-le.ignoreFile',
				Uri.file('/ws/.env.local'),
			);
			const second = commands.executeCommand(
				'envsync-le.ignoreFile',
				Uri.file('/ws/.env.test'),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			_releaseConfigUpdates();
			await Promise.all([first, second]);

			expect(ignoreList()).toEqual(['ws/.env.local', 'ws/.env.test']);
		});

		it('ignoreFile beside stopIgnoring: the add survives the removal', async () => {
			_setConfig('envsync-le.temporaryIgnore', ['ws/.env.local']);
			_holdConfigUpdates();
			const add = commands.executeCommand(
				'envsync-le.ignoreFile',
				Uri.file('/ws/.env.test'),
			);
			const remove = commands.executeCommand(
				'envsync-le.stopIgnoring',
				Uri.file('/ws/.env.local'),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			_releaseConfigUpdates();
			await Promise.all([add, remove]);

			expect(ignoreList()).toEqual(['ws/.env.test']);
		});
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
