import * as vscode from 'vscode';
import type { Detector } from '../detection/detector';
import { isEnvFileName } from '../detection/heuristics';
import type { FileSystem, UserInterface } from '../interfaces';
import type { Notifier } from '../interfaces/notifier';
import type { Telemetry } from '../interfaces/telemetry';
import { errorMessage } from '../utils/errors';
import { guarded } from './guard';

export function registerCompareSelectedCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		detector: Detector;
		fileSystem: FileSystem;
		ui: UserInterface;
	}>,
): void {
	const { telemetry, detector, fileSystem, ui } = deps;

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'envsync-le.compareSelected',
			guarded(deps.notifier, async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
				telemetry.event('command', { name: 'compareSelected' });

				const selectedFiles = await resolveSelectedFiles(
					uri,
					uris,
					fileSystem,
					ui,
				);

				if (!selectedFiles) {
					return;
				}

				if (!hasMinimumFiles(selectedFiles)) {
					showMinimumFilesWarning(ui);
					return;
				}

				const envFiles = filterEnvFiles(selectedFiles);

				if (!hasMinimumFiles(envFiles)) {
					showMinimumEnvFilesWarning(ui);
					return;
				}

				await compareFiles(envFiles, detector, ui);
			}),
		),
	);
}

async function resolveSelectedFiles(
	uri: vscode.Uri | undefined,
	uris: vscode.Uri[] | undefined,
	fileSystem: FileSystem,
	ui: UserInterface,
): Promise<vscode.Uri[] | null> {
	if (uris && uris.length > 0) {
		return uris;
	}

	if (uri) {
		return [uri];
	}

	return await promptUserForFiles(fileSystem, ui);
}

async function promptUserForFiles(
	fileSystem: FileSystem,
	ui: UserInterface,
): Promise<vscode.Uri[] | null> {
	const allEnvFiles = await findAllEnvFiles(fileSystem);

	if (allEnvFiles.length === 0) {
		showNoFilesMessage(ui);
		return null;
	}

	const picks = createFilePicks(allEnvFiles, fileSystem);
	const selected = await ui.showQuickPick(picks, {
		canPickMany: true,
		placeHolder: vscode.l10n.t('Select .env files to compare'),
	});

	if (!selected || (Array.isArray(selected) && selected.length === 0)) {
		return null;
	}

	return convertToUris(selected);
}

async function findAllEnvFiles(
	fileSystem: FileSystem,
): Promise<Array<{ fsPath: string }>> {
	const fileInfos = await fileSystem.findFiles('**/.env*', null);
	return fileInfos.map((info) => ({ fsPath: info.filepath }));
}

function showNoFilesMessage(ui: UserInterface): void {
	ui.showInformationMessage(vscode.l10n.t('No .env files found in workspace'));
}

function createFilePicks(
	files: Array<{ fsPath: string }>,
	fileSystem: FileSystem,
): Array<{ label: string; description: string; value: string }> {
	return files.map((file) => ({
		label: fileSystem.asRelativePath(file.fsPath),
		description: file.fsPath,
		value: file.fsPath,
	}));
}

function convertToUris(selected: string | string[]): vscode.Uri[] {
	if (Array.isArray(selected)) {
		return selected.map((path) => vscode.Uri.file(path));
	}

	return [vscode.Uri.file(selected)];
}

function hasMinimumFiles(files: vscode.Uri[]): boolean {
	const MINIMUM_FILES = 2;
	return files.length >= MINIMUM_FILES;
}

function showMinimumFilesWarning(ui: UserInterface): void {
	ui.showWarningMessage(
		vscode.l10n.t('Please select at least 2 .env files to compare'),
	);
}

function filterEnvFiles(files: vscode.Uri[]): vscode.Uri[] {
	return files.filter((uri) => isEnvFileName(uri.fsPath));
}

function showMinimumEnvFilesWarning(ui: UserInterface): void {
	ui.showWarningMessage(vscode.l10n.t('Please select at least 2 .env files'));
}

async function compareFiles(
	envFiles: vscode.Uri[],
	detector: Detector,
	ui: UserInterface,
): Promise<void> {
	try {
		const result = await performComparison(envFiles, detector, ui);
		showComparisonResult(result, envFiles.length, ui);
	} catch (error) {
		showComparisonError(error, ui);
	}
}

async function performComparison(
	envFiles: vscode.Uri[],
	detector: Detector,
	ui: UserInterface,
): Promise<{ status: string } | undefined> {
	return await ui.showProgress(
		{
			location: 'notification',
			title: vscode.l10n.t('Comparing selected files...'),
			cancellable: false,
		},
		async () => {
			return await detector.checkSyncForFiles(
				envFiles.map((uri) => uri.fsPath),
			);
		},
	);
}

function showComparisonResult(
	result: { status: string } | undefined,
	fileCount: number,
	ui: UserInterface,
): void {
	if (!result) {
		return;
	}

	if (result.status === 'in-sync') {
		showInSyncMessage(ui);
		return;
	}

	if (result.status === 'missing-keys') {
		showMissingKeysMessage(ui);
		return;
	}

	if (result.status === 'parse-error') {
		showParseErrorMessage(ui);
		return;
	}

	showComparisonCompleteMessage(fileCount, ui);
}

function showInSyncMessage(ui: UserInterface): void {
	ui.showInformationMessage(vscode.l10n.t('Selected .env files are in sync'));
}

function showMissingKeysMessage(ui: UserInterface): void {
	ui.showWarningMessage(
		vscode.l10n.t('Some files are missing keys. See status bar.'),
	);
}

function showParseErrorMessage(ui: UserInterface): void {
	ui.showErrorMessage(
		vscode.l10n.t('Some files could not be parsed. See status bar.'),
	);
}

function showComparisonCompleteMessage(
	fileCount: number,
	ui: UserInterface,
): void {
	ui.showInformationMessage(
		vscode.l10n.t(
			'Compared {0} files. Check status bar for results.',
			fileCount,
		),
	);
}

function showComparisonError(error: unknown, ui: UserInterface): void {
	ui.showErrorMessage(
		vscode.l10n.t('Failed to compare files: {0}', errorMessage(error)),
	);
}
