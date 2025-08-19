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
				// Minimal: file icon + 0 count for in-sync
				statusBarItem.text = '$(file) 0'
				statusBarItem.tooltip = localize('runtime.tooltip.in-sync', 'All dotenv files are in sync')
				statusBarItem.backgroundColor = undefined
				statusBarItem.command = undefined
				break

			case 'missing-keys':
			case 'extra-keys':
				// Minimal: file icon + count, warning background indicates severity
				statusBarItem.text = `$(file) ${issueCount}`
				statusBarItem.tooltip = localize('runtime.tooltip.out-of-sync', 'Dotenv files out of sync - click for details')
				statusBarItem.backgroundColor = new deps.ThemeColor('statusBarItem.warningBackground')
				statusBarItem.command = 'envsync-le.showIssues'
				break

			case 'parse-error':
				// Minimal: file icon + count, error background indicates severity
				statusBarItem.text = `$(file) ${issueCount > 0 ? issueCount : ''}`.trim()
				statusBarItem.tooltip = localize('runtime.tooltip.error', 'Error checking dotenv files - click for settings')
				statusBarItem.backgroundColor = new deps.ThemeColor('statusBarItem.errorBackground')
				statusBarItem.command = 'envsync-le.showIssues'
				break

			case 'no-files':
				// Hide when no dotenv files
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
