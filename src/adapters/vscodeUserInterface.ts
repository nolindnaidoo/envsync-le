import * as vscode from 'vscode'
import type { ProgressOptions, QuickPickItem, QuickPickOptions, UserInterface } from '../interfaces'

export function createVSCodeUserInterface(): UserInterface {
	return {
		async showProgress<T>(options: ProgressOptions, task: () => Promise<T>): Promise<T> {
			const location =
				options.location === 'notification'
					? vscode.ProgressLocation.Notification
					: options.location === 'source-control'
						? vscode.ProgressLocation.SourceControl
						: vscode.ProgressLocation.Window

			return await vscode.window.withProgress(
				{
					location,
					title: options.title,
					cancellable: options.cancellable ?? false,
				},
				task,
			)
		},

		async showQuickPick<T>(items: QuickPickItem<T>[], options: QuickPickOptions): Promise<T | undefined> {
			const quickPickItems = items.map((item) => ({
				label: item.label,
				description: item.description ?? '',
				detail: item.detail ?? '',
			}))

			const vscodeOptions: vscode.QuickPickOptions = {
				canPickMany: options.canPickMany ?? false,
				ignoreFocusOut: options.ignoreFocusOut ?? false,
			}

			if (options.placeHolder) {
				vscodeOptions.placeHolder = options.placeHolder
			}

			const selected = await vscode.window.showQuickPick(quickPickItems, vscodeOptions)

			if (!selected) return undefined

			// Find the corresponding item with the value
			const selectedItem = items.find(
				(item) => item.label === selected.label && (item.description ?? '') === selected.description,
			)

			return selectedItem?.value
		},

		showInformationMessage(message: string): void {
			vscode.window.showInformationMessage(message)
		},

		showWarningMessage: ((message: string, ...actions: string[]) => {
			if (actions.length === 0) {
				vscode.window.showWarningMessage(message)
				return
			}
			return Promise.resolve(vscode.window.showWarningMessage(message, ...actions))
		}) as UserInterface['showWarningMessage'],

		showErrorMessage(message: string): void {
			vscode.window.showErrorMessage(message)
		},

		showStatusBarMessage(message: string, timeout?: number): void {
			if (timeout !== undefined) {
				vscode.window.setStatusBarMessage(message, timeout)
			} else {
				vscode.window.setStatusBarMessage(message)
			}
		},
	}
}
