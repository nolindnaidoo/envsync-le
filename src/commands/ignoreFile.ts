import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import type { Detector } from '../detection/detector';
import { isEnvFileName } from '../detection/heuristics';
import type { Configuration, FileSystem, UserInterface } from '../interfaces';
import type { Notifier } from '../interfaces/notifier';
import type { Telemetry } from '../interfaces/telemetry';
import { errorMessage } from '../utils/errors';
import { guarded } from './guard';

/** Ask which ignored file to act on; null when the picker is dismissed. */
async function pickIgnoredFile(
	ui: UserInterface,
	currentIgnored: readonly string[],
): Promise<string | null> {
	const picks = currentIgnored.map((path) => ({
		label: path,
		description: vscode.l10n.t('Currently ignored'),
		value: path,
	}));

	const selected = await ui.showQuickPick(picks, {
		placeHolder: vscode.l10n.t('Select file to stop ignoring'),
	});

	if (!selected || Array.isArray(selected)) return null;
	return selected;
}

export function registerIgnoreFileCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		detector: Detector;
		configuration: Configuration;
		fileSystem: FileSystem;
		ui: UserInterface;
	}>,
): void {
	const { telemetry, detector, configuration, fileSystem, ui } = deps;

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'envsync-le.ignoreFile',
			guarded(deps.notifier, async (uri?: vscode.Uri) => {
				telemetry.event('command', { name: 'ignoreFile' });

				let targetFile: vscode.Uri | undefined = uri;

				if (!targetFile) {
					// No file context - let user pick
					const allEnvFiles = await fileSystem.findFiles('**/.env*', null, 50);
					if (allEnvFiles.length === 0) {
						ui.showInformationMessage(
							vscode.l10n.t('No .env files found in workspace'),
						);
						return;
					}

					const picks = allEnvFiles.map((file) => ({
						label: fileSystem.asRelativePath(file.filepath),
						description: file.filepath,
						value: file.filepath,
					}));

					const selected = await ui.showQuickPick(picks, {
						placeHolder: vscode.l10n.t('Select .env file to ignore'),
					});

					if (!selected || Array.isArray(selected)) return;
					targetFile = vscode.Uri.file(selected);
				}

				// Validate it's an .env file
				if (!isEnvFileName(targetFile.fsPath)) {
					ui.showWarningMessage(vscode.l10n.t('Please select a .env file'));
					return;
				}

				try {
					const config = vscode.workspace.getConfiguration('envsync-le');
					const currentIgnored = readConfig(configuration).temporaryIgnore;
					const relativePath = vscode.workspace.asRelativePath(targetFile);

					if (currentIgnored.includes(relativePath)) {
						ui.showInformationMessage(
							`${relativePath} is already being ignored`,
						);
						return;
					}

					// Add to temporary ignore list
					const newIgnored = [...currentIgnored, relativePath];
					await config.update(
						'temporaryIgnore',
						newIgnored,
						vscode.ConfigurationTarget.Workspace,
					);

					// Trigger immediate comparison
					await detector.checkSync();

					ui.showInformationMessage(
						`Temporarily ignoring ${relativePath}. Use "Unignore File" to re-enable.`,
					);
				} catch (error) {
					ui.showErrorMessage(
						vscode.l10n.t('Failed to ignore file: {0}', errorMessage(error)),
					);
				}
			}),
		),
	);

	// Command to stop ignoring a file
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'envsync-le.stopIgnoring',
			guarded(deps.notifier, async (uri?: vscode.Uri) => {
				telemetry.event('command', { name: 'stopIgnoring' });

				const config = vscode.workspace.getConfiguration('envsync-le');
				const currentIgnored = readConfig(configuration).temporaryIgnore;

				if (currentIgnored.length === 0) {
					ui.showInformationMessage(
						vscode.l10n.t('No files are currently being ignored'),
					);
					return;
				}

				// Either the file was passed in (context menu) or the user picks one.
				const targetPath = uri
					? vscode.workspace.asRelativePath(uri)
					: await pickIgnoredFile(ui, currentIgnored);
				if (!targetPath) return;

				if (!currentIgnored.includes(targetPath)) {
					ui.showInformationMessage(
						`${targetPath} is not currently being ignored`,
					);
					return;
				}

				try {
					// Remove from ignore list
					const newIgnored = currentIgnored.filter(
						(path) => path !== targetPath,
					);
					await config.update(
						'temporaryIgnore',
						newIgnored,
						vscode.ConfigurationTarget.Workspace,
					);

					// Trigger immediate comparison
					await detector.checkSync();

					ui.showInformationMessage(
						vscode.l10n.t('No longer ignoring {0}', targetPath),
					);
				} catch (error) {
					ui.showErrorMessage(
						`Failed to stop ignoring file: ${errorMessage(error)}`,
					);
				}
			}),
		),
	);

	// Command to clear all ignored files
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'envsync-le.clearAllIgnored',
			guarded(deps.notifier, async () => {
				telemetry.event('command', { name: 'clearAllIgnored' });

				const currentIgnored = readConfig(configuration).temporaryIgnore;

				if (currentIgnored.length === 0) {
					ui.showInformationMessage(
						vscode.l10n.t('No files are currently being ignored'),
					);
					return;
				}

				const confirmed = await ui.showWarningMessage(
					vscode.l10n.t('Stop ignoring all {0} files?', currentIgnored.length),
					'Yes',
					'No',
				);

				if (confirmed !== 'Yes') return;

				try {
					const config = vscode.workspace.getConfiguration('envsync-le');
					await config.update(
						'temporaryIgnore',
						[],
						vscode.ConfigurationTarget.Workspace,
					);

					await detector.checkSync();

					ui.showInformationMessage(
						vscode.l10n.t(
							'Cleared ignore list. All .env files will be checked again.',
						),
					);
				} catch (error) {
					ui.showErrorMessage(
						`Failed to clear ignore list: ${errorMessage(error)}`,
					);
				}
			}),
		),
	);
}
