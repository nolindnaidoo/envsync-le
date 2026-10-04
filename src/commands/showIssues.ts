import * as vscode from 'vscode';
import type { Detector } from '../detection/detector';
import type { FileSystem, UserInterface } from '../interfaces';
import type { Telemetry } from '../interfaces/telemetry';
import type { RatingPrompt } from '../ui/ratingPrompt';
import { errorMessage } from '../utils/errors';

export function registerShowIssuesCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		detector: Detector;
		fileSystem: FileSystem;
		ui: UserInterface;
		ratingPrompt: RatingPrompt;
	}>,
): void {
	const { telemetry, detector, fileSystem, ui, ratingPrompt } = deps;

	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.showIssues', async () => {
			telemetry.event('command', { name: 'showIssues' });

			const report = await detector.checkSync();

			if (shouldShowNoFilesMessage(report)) {
				showNoFilesMessage();
				return;
			}

			if (shouldShowInSyncMessage(report)) {
				showInSyncMessage();
				// Not awaited: it resolves when the toast is answered, and a command that
				// waited on that would stay pending for as long as the toast is ignored.
				void ratingPrompt.recordSuccess();
				return;
			}

			await displayIssuesReport(report, fileSystem, ui, ratingPrompt);
		}),
	);
}

function shouldShowNoFilesMessage(report: { status: string }): boolean {
	return report.status === 'no-files';
}

function showNoFilesMessage(): void {
	vscode.window.showInformationMessage('No .env files found in workspace');
}

function shouldShowInSyncMessage(report: { status: string }): boolean {
	return report.status === 'in-sync';
}

function showInSyncMessage(): void {
	vscode.window.showInformationMessage('Selected .env files are in sync');
}

async function displayIssuesReport(
	report: {
		files: readonly unknown[];
		status: string;
		missingKeys: readonly {
			filepath: string;
			keys: readonly string[];
			reference: string;
		}[];
		errors: readonly { filepath: string; message: string }[];
	},
	fileSystem: FileSystem,
	ui: UserInterface,
	ratingPrompt: RatingPrompt,
): Promise<void> {
	const content = buildReportContent(report, fileSystem);

	try {
		await showMarkdownDocument(content);
		void ratingPrompt.recordSuccess();
	} catch (error) {
		showDisplayError(error, ui);
	}
}

function buildReportContent(
	report: {
		files: readonly unknown[];
		status: string;
		missingKeys: readonly {
			filepath: string;
			keys: readonly string[];
			reference: string;
		}[];
		errors: readonly { filepath: string; message: string }[];
	},
	fileSystem: FileSystem,
): string {
	const lines: string[] = [];

	addReportHeader(lines, report);
	addMissingKeysSection(lines, report.missingKeys, fileSystem);
	addErrorsSection(lines, report.errors, fileSystem);

	return lines.join('\n');
}

function addReportHeader(
	lines: string[],
	report: { files: readonly unknown[]; status: string },
): void {
	lines.push('# envsync-le Sync Report');
	lines.push('');
	lines.push(`- Checked files: ${report.files.length}`);
	lines.push(`- Status: ${report.status}`);
	lines.push('');
}

function addMissingKeysSection(
	lines: string[],
	missingKeys: readonly {
		filepath: string;
		keys: readonly string[];
		reference: string;
	}[],
	fileSystem: FileSystem,
): void {
	if (missingKeys.length === 0) {
		return;
	}

	lines.push('## Missing Keys');

	for (const mismatch of missingKeys) {
		addMismatchDetails(lines, mismatch, fileSystem);
	}
}

function addMismatchDetails(
	lines: string[],
	mismatch: { filepath: string; keys: readonly string[]; reference: string },
	fileSystem: FileSystem,
): void {
	const file = fileSystem.asRelativePath(mismatch.filepath);
	const reference = mismatch.reference
		? fileSystem.asRelativePath(mismatch.reference)
		: 'other files';

	lines.push(`### ${file}`);
	lines.push(`Compared to: ${reference}`);
	lines.push('');

	for (const key of mismatch.keys) {
		lines.push(`- ${key}`);
	}

	lines.push('');
}

function addErrorsSection(
	lines: string[],
	errors: readonly { filepath: string; message: string }[],
	fileSystem: FileSystem,
): void {
	if (errors.length === 0) {
		return;
	}

	lines.push('## Parse / Read Errors');

	for (const error of errors) {
		const filepath = fileSystem.asRelativePath(error.filepath);
		lines.push(`- ${filepath}: ${error.message}`);
	}

	lines.push('');
}

async function showMarkdownDocument(content: string): Promise<void> {
	const doc = await vscode.workspace.openTextDocument({
		content,
		language: 'markdown',
	});

	await vscode.window.showTextDocument(doc, { preview: true });
}

function showDisplayError(error: unknown, ui: UserInterface): void {
	ui.showErrorMessage(
		vscode.l10n.t('Failed to show issues: {0}', errorMessage(error)),
	);
}
