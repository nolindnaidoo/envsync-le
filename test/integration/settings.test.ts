import * as assert from 'node:assert';
import * as vscode from 'vscode';

/**
 * A setting changed while the extension is running must take effect on the
 * next command, without a reload. Only a real host can show it: the unit
 * mock hands back a configuration object that reads live, while VS Code's
 * `getConfiguration()` returns a snapshot, so an adapter that holds the
 * object it was given at activation reads the values of that moment for the
 * rest of the session.
 *
 * `enabled` is the observable one: switched off, `Show Details` reports no
 * files and opens no report. The value is written to the global target of
 * the test host's own user data directory, never to the workspace, and is
 * restored whatever the outcome.
 */
describe('EnvSync-LE settings change without a reload', function () {
	this.timeout(30_000);

	const section = () => vscode.workspace.getConfiguration('envsync-le');
	const reports = () =>
		vscode.workspace.textDocuments.filter(
			(doc) =>
				doc.languageId === 'markdown' &&
				doc.getText().includes('Sync Report'),
		).length;

	afterEach(async () => {
		await section().update('enabled', undefined, vscode.ConfigurationTarget.Global);
	});

	it('honours enabled=false set after activation', async () => {
		await vscode.extensions.getExtension('nolindnaidoo.envsync-le')?.activate();

		const before = reports();
		await section().update('enabled', false, vscode.ConfigurationTarget.Global);
		assert.strictEqual(section().get('enabled'), false, 'the host did not take the setting');

		await vscode.commands.executeCommand('envsync-le.showIssues');

		assert.strictEqual(
			reports(),
			before,
			'Show Details opened a report while the extension was disabled: the setting was read from a snapshot taken at activation',
		);
	});
});
