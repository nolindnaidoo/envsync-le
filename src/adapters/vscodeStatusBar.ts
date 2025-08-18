import type * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import type { readConfig } from '../config/config'
import type { Configuration } from '../interfaces'
import type { StatusBar } from '../interfaces/statusBar'
import type { SyncStatus } from '../types'

// Removed: import type { Window, StatusBarAlignment, ThemeColor, ExtensionContext } from 'vscode'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

interface VSCodeDependencies {
	window: typeof vscode.window // Modified
	StatusBarAlignment: typeof vscode.StatusBarAlignment // Modified
	ThemeColor: typeof vscode.ThemeColor // Modified
	readConfig: typeof readConfig
}

export function createVSCodeStatusBar(
	context: vscode.ExtensionContext, // Modified
	deps: VSCodeDependencies,
	configuration?: Configuration,
): StatusBar {
	const statusBarItem = deps.window.createStatusBarItem(deps.StatusBarAlignment.Left, 100)
	context.subscriptions.push(statusBarItem)

	function updateStatus(status: SyncStatus, issueCount: number): void {
		const config = deps.readConfig(
			configuration ?? {
				get: <T>(_k: string, d: T) => d,
				getSection: () => ({
					get: <T>(_k: string, d: T) => d,
					getSection: () => ({}) as never,
					has: () => false,
				}),
				has: () => false,
			},
		)

		if (!config.statusBarEnabled) {
			statusBarItem.hide()
			return
		}

		switch (status) {
			case 'in-sync':
				statusBarItem.text = localize('runtime.status.in-sync', '$(check) Dotenv files in sync')
				statusBarItem.tooltip = localize('runtime.tooltip.in-sync', 'All dotenv files are in sync')
				statusBarItem.backgroundColor = undefined
				statusBarItem.command = undefined
				break

			case 'missing-keys':
			case 'extra-keys':
				statusBarItem.text = localize('runtime.status.out-of-sync', '$(warning) {0} files out of sync', issueCount)
				statusBarItem.tooltip = localize('runtime.tooltip.out-of-sync', 'Dotenv files out of sync - click for details')
				statusBarItem.backgroundColor = new deps.ThemeColor('statusBarItem.warningBackground')
				statusBarItem.command = 'envsync-le.showIssues'
				break

			case 'parse-error':
				statusBarItem.text = localize('runtime.status.error', '$(error) Error checking dotenv files')
				statusBarItem.tooltip = localize('runtime.tooltip.error', 'Error checking dotenv files - click for settings')
				statusBarItem.backgroundColor = new deps.ThemeColor('statusBarItem.errorBackground')
				statusBarItem.command = 'envsync-le.showIssues'
				break

			case 'no-files':
				statusBarItem.text = localize('runtime.status.no-files', 'No dotenv files found')
				statusBarItem.hide()
				return
		}

		statusBarItem.show()
	}

	function dispose(): void {
		statusBarItem.dispose()
	}

	return Object.freeze({
		updateStatus,
		dispose,
	})
}
