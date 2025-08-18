export interface Notifier {
	showMissingKeys(filepath: string, keys: readonly string[]): void
	showExtraKeys(filepath: string, keys: readonly string[]): void
	showError(message: string): void
	showParseError(filepath: string, error: string): void
}
