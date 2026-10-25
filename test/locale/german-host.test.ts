import * as assert from 'node:assert';
import * as vscode from 'vscode';

/**
 * The runtime localization mechanism, loaded by a real host running in German.
 *
 * `test/integration/l10n.test.ts` holds the catalogues complete and in parity,
 * and says why it cannot show that either mechanism loads: `vscode.l10n.t`
 * resolves against the extension that calls it, and a test file is its own
 * extension with an empty bundle. What a test can read is what this extension
 * produces: the report, whose headings go through `l10n.t()` inside the
 * extension's own code. That is the runtime half, the one a catalogue in
 * parity says nothing about.
 *
 * The manifest half is not shown here. The host does not localize the manifest
 * of an extension loaded from a development path, whatever catalogues sit next
 * to it, so a German command title can only be read off an installed VSIX. The
 * English substitution is held by the integration suite, the German catalogue's
 * presence in the VSIX by the packaging gate, and its keys by the parity tests.
 *
 * Launched by the `german host` config in `.vscode-test.mjs`, with
 * `--locale=de`, the German language pack installed into the test profile, and
 * the integration fixtures as the workspace: `.env` has DEBUG, `.env.local`
 * lacks it.
 */
describe('EnvSync-LE in a German host', function () {
	this.timeout(60_000);

	it('runs in German', () => {
		assert.strictEqual(vscode.env.language, 'de');
	});

	it('shows the runtime half in German: the report', async () => {
		await vscode.commands.executeCommand('envsync-le.showIssues');

		const report = vscode.workspace.textDocuments.find(
			(doc) => doc.languageId === 'markdown' && doc.getText().includes('.env.local'),
		);
		assert.ok(report, 'no report was opened');
		const text = report.getText();
		assert.ok(text.includes('# envsync-le Sync-Bericht'), text);
		assert.ok(text.includes('- Geprüfte Dateien: 2'), text);
		assert.ok(text.includes('## Fehlende Schlüssel'), text);
		assert.ok(text.includes('- DEBUG'), text);
	});
});
