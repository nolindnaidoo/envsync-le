import { vi } from 'vitest';

export const Uri = {
	file: vi.fn((path: string) => ({
		fsPath: path,
		path,
		scheme: 'file',
		toString: () => `file://${path}`,
	})),
	parse: vi.fn((str: string) => ({
		fsPath: str.replace('file://', ''),
		path: str.replace('file://', ''),
		scheme: 'file',
		toString: () => str,
	})),
};

export const workspace = {
	getConfiguration: vi.fn(() => ({
		get: vi.fn(),
		update: vi.fn(),
	})),
	findFiles: vi.fn(),
	fs: {
		readFile: vi.fn(),
		stat: vi.fn(),
		_setFile: vi.fn(),
		_reset: vi.fn(),
	},
	asRelativePath: vi.fn((pathOrUri: any) =>
		typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath,
	),
	createFileSystemWatcher: vi.fn(() => ({
		onDidCreate: vi.fn(),
		onDidDelete: vi.fn(),
		onDidChange: vi.fn(),
		dispose: vi.fn(),
	})),
	workspaceFolders: [
		{
			uri: Uri.file('/root/folder'),
			name: 'test-workspace',
			index: 0,
		},
	],
};

export const window = {
	showInformationMessage: vi.fn(),
	showWarningMessage: vi.fn(),
	showErrorMessage: vi.fn(),
	showQuickPick: vi.fn(),
	withProgress: vi.fn((options: any, task: any) => task()),
	setStatusBarMessage: vi.fn(),
	createStatusBarItem: vi.fn(() => ({
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
	})),
	createOutputChannel: vi.fn(() => ({
		appendLine: vi.fn(),
		show: vi.fn(),
		dispose: vi.fn(),
	})),
};

export const commands = {
	registerCommand: vi.fn(),
	executeCommand: vi.fn(),
};

export const StatusBarAlignment = {
	Left: 1,
	Right: 2,
};

export class ThemeColor {
	constructor(public id: string) {}
}

export const mockExtensionContext = {
	subscriptions: {
		push: vi.fn(),
	},
};
