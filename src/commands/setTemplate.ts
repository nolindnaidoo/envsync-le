import * as vscode from 'vscode';
import type { Detector } from '../detection/detector';
import { isEnvFileName } from '../detection/heuristics';
import type { Configuration, FileSystem, UserInterface } from '../interfaces';
import type { Notifier } from '../interfaces/notifier';
import type { Telemetry } from '../interfaces/telemetry';
import { errorMessage } from '../utils/errors';
import { guarded } from './guard';

export function registerSetTemplateCommand(
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
	const { telemetry, detector, fileSystem, ui } = deps;

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'envsync-le.setTemplate',
			guarded(deps.notifier, async (uri?: vscode.Uri) => {
				telemetry.event('command', { name: 'setTemplate' });

				let templateFile: vscode.Uri | undefined = uri;

				if (!templateFile) {
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
						placeHolder: vscode.l10n.t('Select .env file to use as template'),
					});

					if (!selected || Array.isArray(selected)) return;
					templateFile = vscode.Uri.file(selected);
				}

				// Validate it's an .env file
				if (!isEnvFileName(templateFile.fsPath)) {
					ui.showWarningMessage(vscode.l10n.t('Please select a .env file'));
					return;
				}

				try {
					// Update configuration
					const config = vscode.workspace.getConfiguration('envsync-le');
					const relativePath = fileSystem.asRelativePath(templateFile.fsPath);

					await config.update(
						'templateFile',
						relativePath,
						vscode.ConfigurationTarget.Workspace,
					);
					await config.update(
						'comparisonMode',
						'template',
						vscode.ConfigurationTarget.Workspace,
					);

					// Trigger immediate comparison
					await detector.checkSync();

					ui.showInformationMessage(
						vscode.l10n.t(
							'Set {0} as template. All .env files will be compared against it.',
							relativePath,
						),
					);
				} catch (error) {
					ui.showErrorMessage(
						vscode.l10n.t('Failed to set template: {0}', errorMessage(error)),
					);
				}
			}),
		),
	);

	// Command to clear template and return to auto mode
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'envsync-le.clearTemplate',
			guarded(deps.notifier, async () => {
				telemetry.event('command', { name: 'clearTemplate' });

				try {
					const config = vscode.workspace.getConfiguration('envsync-le');
					await config.update(
						'templateFile',
						undefined,
						vscode.ConfigurationTarget.Workspace,
					);
					await config.update(
						'comparisonMode',
						'auto',
						vscode.ConfigurationTarget.Workspace,
					);

					await detector.checkSync();

					ui.showInformationMessage(
						vscode.l10n.t(
							'Cleared template. Returned to automatic comparison.',
						),
					);
				} catch (error) {
					ui.showErrorMessage(
						vscode.l10n.t('Failed to clear template: {0}', errorMessage(error)),
					);
				}
			}),
		),
	);
}
