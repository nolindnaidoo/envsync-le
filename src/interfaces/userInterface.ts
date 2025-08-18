export interface QuickPickItem<T> {
	readonly label: string
	readonly description?: string
	readonly detail?: string
	readonly value: T
}

export interface QuickPickOptions {
	readonly placeHolder?: string
	readonly canPickMany?: boolean
	readonly ignoreFocusOut?: boolean
}

export interface ProgressOptions {
	readonly location: 'notification' | 'window' | 'source-control'
	readonly title: string
	readonly cancellable?: boolean
}

export interface UserInterface {
	/**
	 * Show a progress indicator
	 */
	showProgress<T>(options: ProgressOptions, task: () => Promise<T>): Promise<T>

	/**
	 * Show a quick pick selection dialog
	 */
	showQuickPick<T>(items: QuickPickItem<T>[], options: QuickPickOptions): Promise<T | undefined>

	/**
	 * Show an information message
	 */
	showInformationMessage(message: string): void

	/**
	 * Show a warning message
	 */
	showWarningMessage(message: string): void

	/**
	 * Show a warning message with confirmation buttons
	 */
	showWarningMessage(message: string, ...actions: string[]): Promise<string | undefined>

	/**
	 * Show an error message
	 */
	showErrorMessage(message: string): void

	/**
	 * Show a status bar message
	 */
	showStatusBarMessage(message: string, timeout?: number): void
}
