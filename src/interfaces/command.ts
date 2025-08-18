export interface CommandAdapter {
	registerCommand(command: string, callback: (...args: unknown[]) => unknown | undefined): void
	executeCommand<T = unknown>(command: string, ...rest: unknown[]): Promise<T | undefined>
}
