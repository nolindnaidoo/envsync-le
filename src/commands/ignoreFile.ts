import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { readConfig } from '../config/config'
import type { Detector } from '../detection/detector'
import type { Configuration, FileSystem, UserInterface } from '../interfaces'
import type { Telemetry } from '../interfaces/telemetry'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function registerIgnoreFileCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry
		detector: Detector
		configuration: Configuration
		fileSystem: FileSystem
		ui: UserInterface
	}>,
): void {
	const { telemetry, detector, configuration, fileSystem, ui } = deps

	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.ignoreFile', async (uri?: vscode.Uri) => {
			telemetry.event('command', { name: 'ignoreFile' })

			let targetFile: vscode.Uri | undefined = uri

			if (!targetFile) {
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
					placeHolder: localize('runtime.picker.select-ignore', 'Select .env file to ignore'),
				})

				if (!selected) return
				targetFile = vscode.Uri.file(selected)
			}

			// Validate it's an .env file
			const filename = targetFile.fsPath.split('/').pop() ?? ''
			if (!filename.startsWith('.env')) {
				ui.showWarningMessage(localize('runtime.message.not-env-file', 'Please select a .env file'))
				return
			}

			try {
				const config = vscode.workspace.getConfiguration('envsync-le')
				const currentIgnored = readConfig(configuration).temporaryIgnore
				const relativePath = vscode.workspace.asRelativePath(targetFile)

				if (currentIgnored.includes(relativePath)) {
					ui.showInformationMessage(
						localize('runtime.message.already-ignored', '{0} is already being ignored', relativePath),
					)
					return
				}

				// Add to temporary ignore list
				const newIgnored = [...currentIgnored, relativePath]
				await config.update('temporaryIgnore', newIgnored, vscode.ConfigurationTarget.Workspace)

				// Trigger immediate comparison
				await detector.checkSync()

				ui.showInformationMessage(
					localize(
						'runtime.message.file-ignored',
						'Temporarily ignoring {0}. Use "Stop Ignoring" to re-enable.',
						relativePath,
					),
				)
			} catch (error) {
				ui.showErrorMessage(
					localize('runtime.message.ignore-failed', 'Failed to ignore file: {0}', (error as Error).message),
				)
			}
		}),
	)

	// Command to stop ignoring a file
	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.stopIgnoring', async (uri?: vscode.Uri) => {
			telemetry.event('command', { name: 'stopIgnoring' })

			const config = vscode.workspace.getConfiguration('envsync-le')
			const currentIgnored = readConfig(configuration).temporaryIgnore

			if (currentIgnored.length === 0) {
				ui.showInformationMessage(localize('runtime.message.no-ignored-files', 'No files are currently being ignored'))
				return
			}

			let targetPath: string

			if (uri) {
				targetPath = vscode.workspace.asRelativePath(uri)
			} else {
				// Show picker of currently ignored files
				const picks = currentIgnored.map((path) => ({
					label: path,
					description: 'Currently ignored',
					value: path,
				}))

				const selected = await ui.showQuickPick(picks, {
					placeHolder: localize('runtime.picker.select-unignore', 'Select file to stop ignoring'),
				})

				if (!selected) return
				targetPath = selected
			}

			if (!currentIgnored.includes(targetPath)) {
				ui.showInformationMessage(
					localize('runtime.message.not-ignored', '{0} is not currently being ignored', targetPath),
				)
				return
			}

			try {
				// Remove from ignore list
				const newIgnored = currentIgnored.filter((path) => path !== targetPath)
				await config.update('temporaryIgnore', newIgnored, vscode.ConfigurationTarget.Workspace)

				// Trigger immediate comparison
				await detector.checkSync()

				ui.showInformationMessage(localize('runtime.message.file-unignored', 'No longer ignoring {0}', targetPath))
			} catch (error) {
				ui.showErrorMessage(
					localize('runtime.message.unignore-failed', 'Failed to stop ignoring file: {0}', (error as Error).message),
				)
			}
		}),
	)

	// Command to clear all ignored files
	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.clearAllIgnored', async () => {
			telemetry.event('command', { name: 'clearAllIgnored' })

			const currentIgnored = readConfig(configuration).temporaryIgnore

			if (currentIgnored.length === 0) {
				ui.showInformationMessage(localize('runtime.message.no-ignored-files', 'No files are currently being ignored'))
				return
			}

			const confirmed = await ui.showWarningMessage(
				localize('runtime.message.confirm-clear-ignored', 'Stop ignoring all {0} files?', currentIgnored.length),
				localize('runtime.action.yes', 'Yes'),
				localize('runtime.action.no', 'No'),
			)

			if (confirmed !== 'Yes') return

			try {
				const config = vscode.workspace.getConfiguration('envsync-le')
				await config.update('temporaryIgnore', [], vscode.ConfigurationTarget.Workspace)

				await detector.checkSync()

				ui.showInformationMessage(
					localize('runtime.message.all-ignored-cleared', 'Cleared ignore list. All .env files will be checked again.'),
				)
			} catch (error) {
				ui.showErrorMessage(
					localize(
						'runtime.message.clear-ignored-failed',
						'Failed to clear ignore list: {0}',
						(error as Error).message,
					),
				)
			}
		}),
	)
}
