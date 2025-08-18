import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import type { Detector } from '../detection/detector'
import type { FileSystem, UserInterface } from '../interfaces'
import type { Telemetry } from '../interfaces/telemetry'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function registerCompareSelectedCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry
		detector: Detector
		fileSystem: FileSystem
		ui: UserInterface
	}>,
): void {
	const { telemetry, detector, fileSystem, ui } = deps

	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.compareSelected', async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
			telemetry.event('command', { name: 'compareSelected' })

			// Handle different invocation contexts
			let selectedFiles: vscode.Uri[] = []

			if (uris && uris.length > 0) {
				// Multi-select context
				selectedFiles = uris
			} else if (uri) {
				// Single file context
				selectedFiles = [uri]
			} else {
				// Command palette - let user pick files
				const allEnvFilesInfos = await fileSystem.findFiles('**/.env*', null, 50)
				const allEnvFiles = allEnvFilesInfos.map((i) => ({ fsPath: i.filepath })) as Array<{ fsPath: string }>
				if (allEnvFiles.length === 0) {
					ui.showInformationMessage(localize('runtime.message.no-env-files', 'No .env files found in workspace'))
					return
				}

				const picks = allEnvFiles.map((file) => ({
					label: fileSystem.asRelativePath(file.fsPath),
					description: file.fsPath,
					value: file.fsPath,
				}))

				const selected = await ui.showQuickPick(picks, {
					canPickMany: true,
					placeHolder: localize('runtime.picker.select-files', 'Select .env files to compare'),
				})

				if (!selected || (Array.isArray(selected) && selected.length === 0)) return
				if (Array.isArray(selected)) {
					selectedFiles = selected.map((v) => vscode.Uri.file(v))
				} else {
					selectedFiles = [vscode.Uri.file(selected)]
				}
			}

			if (selectedFiles.length < 2) {
				ui.showWarningMessage(
					localize('runtime.message.need-two-files', 'Please select at least 2 .env files to compare'),
				)
				return
			}

			// Filter to only .env files
			const envFiles = selectedFiles.filter((uri) => {
				const filename = uri.fsPath.split('/').pop() ?? ''
				return filename.startsWith('.env')
			})

			if (envFiles.length < 2) {
				ui.showWarningMessage(localize('runtime.message.need-two-env-files', 'Please select at least 2 .env files'))
				return
			}

			try {
				const result = await ui.showProgress(
					{
						location: 'notification',
						title: localize('runtime.progress.comparing', 'Comparing selected files...'),
						cancellable: false,
					},
					async () => {
						// Use detector with custom file list
						return await detector.checkSyncForFiles(envFiles.map((uri) => uri.fsPath))
					},
				)

				if (result?.status === 'in-sync') {
					ui.showInformationMessage(localize('runtime.message.in-sync', 'Selected .env files are in sync'))
				} else if (result?.status === 'missing-keys') {
					ui.showWarningMessage(
						localize('runtime.message.missing-keys', 'Some files are missing keys. See status bar.'),
					)
				} else if (result?.status === 'parse-error') {
					ui.showErrorMessage(
						localize('runtime.message.parse-errors', 'Some files could not be parsed. See status bar.'),
					)
				} else {
					ui.showInformationMessage(
						localize(
							'runtime.message.comparison-complete',
							'Compared {0} files. Check status bar for results.',
							envFiles.length,
						),
					)
				}
			} catch (error) {
				ui.showErrorMessage(
					localize('runtime.message.comparison-failed', 'Failed to compare files: {0}', (error as Error).message),
				)
			}
		}),
	)
}
