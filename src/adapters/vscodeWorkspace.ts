import * as vscode from 'vscode'
import type { Workspace } from '../interfaces'

export function createVSCodeWorkspace(): Workspace {
	return {
		getRootPath(): string | undefined {
			return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		},

		isInWorkspace(filepath: string): boolean {
			const rootPath = this.getRootPath()
			if (!rootPath) return false

			try {
				const relativePath = vscode.workspace.asRelativePath(filepath)
				return !relativePath.startsWith('..') && relativePath !== filepath
			} catch {
				return false
			}
		},

		getName(): string {
			return vscode.workspace.workspaceFolders?.[0]?.name ?? 'Unknown'
		},

		isTrusted(): boolean {
			return vscode.workspace.isTrusted
		},
	}
}
