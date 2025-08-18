import * as vscode from 'vscode'
import type { CommandAdapter } from '../interfaces/command'

export class VSCodeCommandAdapter implements CommandAdapter {
	constructor(private context: vscode.ExtensionContext) {}

	registerCommand(command: string, callback: (...args: unknown[]) => unknown | undefined): void {
		this.context.subscriptions.push(vscode.commands.registerCommand(command, (...args: unknown[]) => callback(...args)))
	}

	executeCommand<T = unknown>(command: string, ...rest: unknown[]): Promise<T | undefined> {
		const exec = vscode.commands.executeCommand as <R = unknown>(
			cmd: string,
			...args: unknown[]
		) => Thenable<R | undefined>
		return Promise.resolve(exec<T>(command, ...rest))
	}
}
