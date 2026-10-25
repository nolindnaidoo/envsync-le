import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_getConfigUpdates,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_setConfig,
	_setFile,
	_shownMessages,
	_statusBarItems,
	executedBuiltins,
	Uri,
} from './__mocks__/vscode';
import { activate } from './extension';

/**
 * Every command, started a second time while the first is suspended.
 *
 * The policy the code implements is that each run is independent: no command
 * holds state another run reads, so two runs deliver two results, and what
 * they share, the status bar and the settings, ends in the state the last
 * run wrote. The commands that write a setting read it before their first
 * await and write it after, so two of them started at once both write; the
 * mock's writes land as they are made, so both reads see the state they would
 * see in sequence. In a real host a write lands asynchronously, and two
 * `Ignore File` runs started together could each read the list from before
 * the other's write; that case needs a queue and is recorded, not pinned.
 */

function command(id: string): (...args: unknown[]) => Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	return async (...args) => {
		await handler(...args);
	};
}

beforeEach(() => {
	_resetMockState();
	_setConfig('envsync-le.notificationLevel', 'all');
	_setFile('/ws/.env', 'A=1\nB=2');
	_setFile('/ws/.env.local', 'A=1');
	activate(_createExtensionContext() as never);
});

describe('two invocations at once', () => {
	it('showIssues: both open their report, and the bar shows the one state', async () => {
		const showIssues = command('envsync-le.showIssues');
		await Promise.all([showIssues(), showIssues()]);
		const reports = _openedDocuments().map((d) => d.getText());
		expect(reports).toHaveLength(2);
		for (const report of reports) {
			expect(report).toContain('### ws/.env.local');
			expect(report).toContain('- B');
		}
		expect(_statusBarItems()[0]?.text).toBe('$(file) 1');
	});

	it('compareSelected: both announce their own result', async () => {
		const compare = command('envsync-le.compareSelected');
		const pair = [Uri.file('/ws/.env'), Uri.file('/ws/.env.local')];
		await Promise.all([compare(undefined, pair), compare(undefined, pair)]);
		expect(
			_shownMessages().filter((m) => m.message.includes('missing keys')),
		).toHaveLength(2);
	});

	it('setTemplate and clearTemplate: every write lands, the last one wins', async () => {
		_setFile('/ws/.env.example', 'A=\nB=');
		await Promise.all([
			command('envsync-le.setTemplate')(Uri.file('/ws/.env.example')),
			command('envsync-le.clearTemplate')(),
		]);
		const modes = _getConfigUpdates()
			.filter((update) => update.key === 'envsync-le.comparisonMode')
			.map((update) => update.value);
		expect(modes).toHaveLength(2);
		expect(modes).toEqual(expect.arrayContaining(['template', 'auto']));
		expect(_shownMessages().filter((m) => m.kind === 'error')).toHaveLength(0);
	});

	it('help and openSettings: two documents, two settings calls', async () => {
		await Promise.all([
			command('envsync-le.help')(),
			command('envsync-le.help')(),
			command('envsync-le.openSettings')(),
			command('envsync-le.openSettings')(),
		]);
		expect(_openedDocuments()).toHaveLength(2);
		expect(executedBuiltins).toHaveLength(2);
	});
});
