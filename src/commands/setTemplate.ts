import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import type { Detector } from '../detection/detector'
import type { Configuration, FileSystem, UserInterface } from '../interfaces'
import type { Telemetry } from '../interfaces/telemetry'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function registerSetTemplateCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry
		detector: Detector
		configuration: Configuration
		fileSystem: FileSystem
		ui: UserInterface
	}>,
): void {
	const { telemetry, detector, fileSystem, ui } = deps

	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.setTemplate', async (uri?: vscode.Uri) => {
			telemetry.event('command', { name: 'setTemplate' })

			let templateFile: vscode.Uri | undefined = uri

			if (!templateFile) {
				// No file context - let user pick
				const allEnvFiles = await fileSystem.findFiles('**/.env*', null, 50)
				if (allEnvFiles.length === 0) {
					ui.showInformationMessage(localize('runtime.message.no-env-files', 'No .env files found in workspace'))
					return
				}

				const picks = allEnvFiles.map((file) => ({
					label: fileSystem.asRelativePath(file.filepath),
					description: file.filepath,
					value: file.filepath,
				}))

				const selected = await ui.showQuickPick(picks, {
					placeHolder: localize('runtime.picker.select-template', 'Select .env file to use as template'),
				})

				if (!selected) return
				templateFile = vscode.Uri.file(selected)
			}

			// Validate it's an .env file
			const filename = templateFile.fsPath.split('/').pop() ?? ''
			if (!filename.startsWith('.env')) {
				ui.showWarningMessage(localize('runtime.message.not-env-file', 'Please select a .env file'))
				return
			}

			try {
				// Update configuration
				const config = vscode.workspace.getConfiguration('envsync-le')
				const relativePath = fileSystem.asRelativePath(templateFile.fsPath)

				await config.update('templateFile', relativePath, vscode.ConfigurationTarget.Workspace)
				await config.update('comparisonMode', 'template', vscode.ConfigurationTarget.Workspace)

				// Trigger immediate comparison
				await detector.checkSync()

				ui.showInformationMessage(
					localize(
						'runtime.message.template-set',
						'Set {0} as template. All .env files will be compared against it.',
						relativePath,
					),
				)
			} catch (error) {
				ui.showErrorMessage(
					localize('runtime.message.template-failed', 'Failed to set template: {0}', (error as Error).message),
				)
			}
		}),
	)

	// Command to clear template and return to auto mode
	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.clearTemplate', async () => {
			telemetry.event('command', { name: 'clearTemplate' })

			try {
				const config = vscode.workspace.getConfiguration('envsync-le')
				await config.update('templateFile', undefined, vscode.ConfigurationTarget.Workspace)
				await config.update('comparisonMode', 'auto', vscode.ConfigurationTarget.Workspace)

				await detector.checkSync()

				ui.showInformationMessage(
					localize('runtime.message.template-cleared', 'Cleared template. Returned to automatic comparison.'),
				)
			} catch (error) {
				ui.showErrorMessage(
					localize('runtime.message.clear-template-failed', 'Failed to clear template: {0}', (error as Error).message),
				)
			}
		}),
	)
}
