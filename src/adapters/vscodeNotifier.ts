import type * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import type { readConfig } from '../config/config'
import type { Configuration } from '../interfaces'
import type { Notifier } from '../interfaces/notifier'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

interface VSCodeDependencies {
	window: typeof vscode.window
	readConfig: typeof readConfig
}

export function createVSCodeNotifier(deps: VSCodeDependencies, configuration?: Configuration): Notifier {
	function getNotificationLevel(): 'all' | 'important' | 'silent' {
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
		return config.notificationLevel
	}

	return Object.freeze({
		showMissingKeys(filepath: string, keys: readonly string[]): void {
			const level = getNotificationLevel()
			if (level === 'silent') return

			const filename = filepath.split('/').pop() ?? filepath
			const keyList = keys.slice(0, 3).join(', ') + (keys.length > 3 ? '...' : '')
			const message = localize('runtime.notification.missing-keys', 'Missing keys in {0}: {1}', filename, keyList)

			if (level === 'all' || level === 'important') {
				deps.window.showWarningMessage(message)
			}
		},

		showExtraKeys(filepath: string, keys: readonly string[]): void {
			const level = getNotificationLevel()
			if (level === 'silent') return

			const filename = filepath.split('/').pop() ?? filepath
			const keyList = keys.slice(0, 3).join(', ') + (keys.length > 3 ? '...' : '')
			const message = localize('runtime.notification.extra-keys', 'Extra keys in {0}: {1}', filename, keyList)

			if (level === 'all') {
				deps.window.showInformationMessage(message)
			}
		},

		showError(message: string): void {
			const level = getNotificationLevel()
			if (level === 'silent') return
			deps.window.showErrorMessage(message)
		},

		showParseError(filepath: string, error: string): void {
			const level = getNotificationLevel()
			if (level === 'silent') return

			const filename = filepath.split('/').pop() ?? filepath
			const message = localize('runtime.notification.parse-error', 'Failed to parse {0}: {1}', filename, error)

			if (level === 'all' || level === 'important') {
				deps.window.showErrorMessage(message)
			}
		},
	})
}
