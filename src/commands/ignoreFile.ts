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

	// The three commands read the ignore list and write it back, and the host
	// lands a write after the call returns. Two started within one write would
	// each read the list from before the other's write, and the second write
	// would drop the first. Every read-and-write runs after the one before it
	// has landed, whether that one succeeded or not.
	let queue: Promise<unknown> = Promise.resolve();
	const withIgnoreList = <T>(
		run: (
			current: readonly string[],
			write: (next: readonly string[]) => Thenable<void>,
		) => Promise<T>,
	): Promise<T> => {
		const step = () => {
			const config = vscode.workspace.getConfiguration('envsync-le');
			return run(readConfig(configuration).temporaryIgnore, (next) =>
				config.update(
					'temporaryIgnore',
					next,
					vscode.ConfigurationTarget.Workspace,
				),
			);
		};
		const next = queue.then(step, step);
		queue = next.catch(() => undefined);
		return next;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'envsync-le.ignoreFile',
			guarded(deps.notifier, async (uri?: vscode.Uri) => {
				telemetry.event('command', { name: 'ignoreFile' });

				let targetFile: vscode.Uri | undefined = uri;

				if (!targetFile) {
					// No file context - let user pick
					const allEnvFiles = await fileSystem.findFiles('**/.env*', null);
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
					const relativePath = vscode.workspace.asRelativePath(targetFile);
					const added = await withIgnoreList(async (current, write) => {
						if (current.includes(relativePath)) return false;
						await write([...current, relativePath]);
						return true;
					});

					if (!added) {
						ui.showInformationMessage(
							vscode.l10n.t('{0} is already being ignored', relativePath),
						);
						return;
					}

					// Trigger immediate comparison
					await detector.checkSync();

					ui.showInformationMessage(
						vscode.l10n.t(
							'Temporarily ignoring {0}. Run Unignore File to check it again.',
							relativePath,
						),
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
						vscode.l10n.t('{0} is not currently being ignored', targetPath),
					);
					return;
				}

				try {
					// The list is read again inside the queue: another command may
					// have written it since the picker was shown.
					const removed = await withIgnoreList(async (current, write) => {
						if (!current.includes(targetPath)) return false;
						await write(current.filter((path) => path !== targetPath));
						return true;
					});

					if (!removed) {
						ui.showInformationMessage(
							vscode.l10n.t('{0} is not currently being ignored', targetPath),
						);
						return;
					}

					// Trigger immediate comparison
					await detector.checkSync();

					ui.showInformationMessage(
						vscode.l10n.t('No longer ignoring {0}', targetPath),
					);
				} catch (error) {
					ui.showErrorMessage(
						vscode.l10n.t(
							'Failed to stop ignoring file: {0}',
							errorMessage(error),
						),
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

				// Bound once and compared below: the dialog returns the clicked
				// label, so an English literal would read every translated click
				// as a refusal.
				const yes = vscode.l10n.t('Yes');
				const confirmed = await ui.showWarningMessage(
					vscode.l10n.t('Stop ignoring all {0} files?', currentIgnored.length),
					yes,
					vscode.l10n.t('No'),
				);

				if (confirmed !== yes) return;

				try {
					await withIgnoreList(async (_current, write) => {
						await write([]);
					});

					await detector.checkSync();

					ui.showInformationMessage(
						vscode.l10n.t(
							'Cleared ignore list. All .env files will be checked again.',
						),
					);
				} catch (error) {
					ui.showErrorMessage(
						vscode.l10n.t(
							'Failed to clear ignore list: {0}',
							errorMessage(error),
						),
					);
				}
			}),
		),
	);
}
