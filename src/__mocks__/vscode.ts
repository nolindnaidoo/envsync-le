/**
 * Mock VS Code API for unit tests (aliased via vitest.config.ts).
 * Stateful pieces (config store, message log, command registry, file
 * store, watcher registry) expose `_reset()`/`_set()` helpers prefixed
 * with underscore — test-only API.
 */

export interface WorkspaceFolder {
	readonly uri: Uri;
	readonly name: string;
	readonly index: number;
}

// ---------------------------------------------------------------- Uri

export class Uri {
	scheme: string;
	authority: string;
	path: string;
	query: string;
	fragment: string;

	constructor(
		scheme: string,
		authority: string,
		path: string,
		query: string,
		fragment: string,
	) {
		this.scheme = scheme;
		this.authority = authority;
		this.path = path;
		this.query = query;
		this.fragment = fragment;
	}

	get fsPath(): string {
		return this.path;
	}

	toString(_skipEncoding?: boolean): string {
		return `${this.scheme}://${this.authority}${this.path}`;
	}

	static file(path: string): Uri {
		return new Uri('file', '', path, '', '');
	}

	static parse(value: string): Uri {
		const match = value.match(/^(\w+):\/\/([^/]*)(.*)$/);
		if (match?.[1] && match[2] !== undefined && match[3] !== undefined) {
			return new Uri(match[1], match[2], match[3], '', '');
		}
		return new Uri('file', '', value, '', '');
	}
}

// ---------------------------------------------------------- documents

export interface MockDocumentInit {
	readonly content: string;
	readonly languageId?: string;
	readonly fileName?: string;
}

export function _createDocument(init: MockDocumentInit) {
	const content = init.content;
	return {
		getText: () => content,
		languageId: init.languageId ?? 'plaintext',
		fileName: init.fileName ?? '/mock/document.txt',
		uri: Uri.file(init.fileName ?? '/mock/document.txt'),
	};
}

export type MockDocument = ReturnType<typeof _createDocument>;

const openedDocuments: MockDocument[] = [];

export function _openedDocuments(): readonly MockDocument[] {
	return openedDocuments;
}

// ------------------------------------------------------ configuration

const configStore = new Map<string, unknown>();
const configUpdates: Array<{ key: string; value: unknown; target: unknown }> =
	[];

export function _setConfig(key: string, value: unknown): void {
	configStore.set(key, value);
}

export function _getConfigUpdates(): ReadonlyArray<{
	key: string;
	value: unknown;
	target: unknown;
}> {
	return configUpdates;
}

export const ConfigurationTarget = {
	Global: 1,
	Workspace: 2,
	WorkspaceFolder: 3,
};

type ConfigListener = (event: {
	affectsConfiguration: (section: string) => boolean;
}) => void;
const configListeners: ConfigListener[] = [];

export function _fireConfigChange(section: string): void {
	for (const listener of [...configListeners]) {
		listener({
			affectsConfiguration: (candidate: string) =>
				section === candidate || section.startsWith(`${candidate}.`),
		});
	}
}

// -------------------------------------------------------- file system

const fileStore = new Map<string, string>();

/** Make workspace.findFiles reject, for error-path tests. */
let findFilesError: Error | undefined;

/** Make configuration reads throw, for error-path tests. */
let configReadError: Error | undefined;

export function _setConfigReadError(error: Error | undefined): void {
	configReadError = error;
}

export function _setFindFilesError(error: Error | undefined): void {
	findFilesError = error;
}

export function _setFile(path: string, content: string): void {
	fileStore.set(path, content);
}

export interface MockWatcher {
	readonly pattern: string;
	disposed: boolean;
	fireCreate(uri: Uri): void;
	fireChange(uri: Uri): void;
	fireDelete(uri: Uri): void;
}

const watchers: MockWatcher[] = [];

export function _watchers(): readonly MockWatcher[] {
	return watchers;
}

// --------------------------------------------------------- workspace

export const workspace = {
	workspaceFolders: undefined as WorkspaceFolder[] | undefined,
	isTrusted: true,
	fs: {
		readFile: async (uri: Uri): Promise<Uint8Array> => {
			const content = fileStore.get(uri.fsPath);
			if (content === undefined) {
				throw new Error(`ENOENT: ${uri.fsPath}`);
			}
			return new TextEncoder().encode(content);
		},
		writeFile: async (uri: Uri, content: Uint8Array) => {
			fileStore.set(uri.fsPath, new TextDecoder().decode(content));
		},
		stat: async (uri: Uri) => {
			if (!fileStore.has(uri.fsPath)) {
				throw new Error(`ENOENT: ${uri.fsPath}`);
			}
			return {
				type: 1,
				ctime: 0,
				mtime: 1700000000000,
				size: fileStore.get(uri.fsPath)?.length ?? 0,
			};
		},
	},
	findFiles: async (_pattern: string, _exclude?: unknown, max?: number) => {
		// Lets a test drive the failure path of anything that discovers files.
		if (findFilesError) throw findFilesError;
		const uris = [...fileStore.keys()].map((p) => Uri.file(p));
		return max !== undefined ? uris.slice(0, max) : uris;
	},
	asRelativePath: (pathOrUri: string | Uri): string => {
		const path = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath;
		return path.replace(/^\//, '');
	},
	getConfiguration: (section?: string) => ({
		get: <T>(key: string, defaultValue?: T): T | undefined => {
			// Reading configuration can genuinely fail — a corrupt settings file,
			// a workspace that has gone away. Several call sites read config
			// outside their own try, so this is the only way to reach their
			// callers' error handling.
			if (configReadError) throw configReadError;
			const full = section ? `${section}.${key}` : key;
			return configStore.has(full)
				? (configStore.get(full) as T)
				: defaultValue;
		},
		has: (key: string): boolean => {
			const full = section ? `${section}.${key}` : key;
			return configStore.has(full);
		},
		update: async (key: string, value: unknown, target?: unknown) => {
			const full = section ? `${section}.${key}` : key;
			configStore.set(full, value);
			configUpdates.push({ key: full, value, target });
		},
	}),
	onDidChangeConfiguration: (listener: ConfigListener) => {
		configListeners.push(listener);
		return {
			dispose: () => {
				const index = configListeners.indexOf(listener);
				if (index >= 0) configListeners.splice(index, 1);
			},
		};
	},
	createFileSystemWatcher: (pattern: string) => {
		const listeners = {
			create: [] as Array<(uri: Uri) => unknown>,
			change: [] as Array<(uri: Uri) => unknown>,
			delete: [] as Array<(uri: Uri) => unknown>,
		};
		const watcher: MockWatcher & {
			onDidCreate(l: (uri: Uri) => unknown): { dispose(): void };
			onDidChange(l: (uri: Uri) => unknown): { dispose(): void };
			onDidDelete(l: (uri: Uri) => unknown): { dispose(): void };
			dispose(): void;
		} = {
			pattern,
			disposed: false,
			onDidCreate(l) {
				listeners.create.push(l);
				return { dispose: () => {} };
			},
			onDidChange(l) {
				listeners.change.push(l);
				return { dispose: () => {} };
			},
			onDidDelete(l) {
				listeners.delete.push(l);
				return { dispose: () => {} };
			},
			fireCreate(uri) {
				for (const l of listeners.create) l(uri);
			},
			fireChange(uri) {
				for (const l of listeners.change) l(uri);
			},
			fireDelete(uri) {
				for (const l of listeners.delete) l(uri);
			},
			dispose() {
				watcher.disposed = true;
			},
		};
		watchers.push(watcher);
		return watcher;
	},
	openTextDocument: async (options?: {
		content?: string;
		language?: string;
	}) => {
		const doc = _createDocument({
			content: options?.content ?? '',
			languageId: options?.language ?? 'plaintext',
		});
		openedDocuments.push(doc);
		return doc;
	},
};

// ------------------------------------------------------------ window

export interface ShownMessage {
	readonly kind: 'info' | 'warning' | 'error';
	readonly message: string;
	readonly items: readonly unknown[];
}

const shownMessages: ShownMessage[] = [];
let quickPickResponder: ((items: unknown[]) => unknown) | undefined;
let warningResponder: ((items: unknown[]) => unknown) | undefined;

export function _shownMessages(): readonly ShownMessage[] {
	return shownMessages;
}

export function _respondToQuickPick(
	responder: ((items: unknown[]) => unknown) | undefined,
): void {
	quickPickResponder = responder;
}

export function _respondToWarning(
	responder: ((items: unknown[]) => unknown) | undefined,
): void {
	warningResponder = responder;
}

export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2 };
export const ProgressLocation = {
	SourceControl: 1,
	Window: 10,
	Notification: 15,
};

export class ThemeColor {
	constructor(public readonly id: string) {}
}

export interface MockStatusBarItem {
	text: string;
	tooltip: string;
	command: unknown;
	backgroundColor: unknown;
	visible: boolean;
	show(): void;
	hide(): void;
	dispose(): void;
}

const statusBarItems: MockStatusBarItem[] = [];

export function _statusBarItems(): readonly MockStatusBarItem[] {
	return statusBarItems;
}

export const window = {
	showInformationMessage: async (message: string, ...items: unknown[]) => {
		shownMessages.push({ kind: 'info', message, items });
		return undefined;
	},
	showWarningMessage: async (message: string, ...items: unknown[]) => {
		shownMessages.push({ kind: 'warning', message, items });
		return warningResponder?.(items);
	},
	showErrorMessage: async (message: string, ...items: unknown[]) => {
		shownMessages.push({ kind: 'error', message, items });
		return undefined;
	},
	showQuickPick: async (items: unknown[], _options?: unknown) =>
		quickPickResponder ? quickPickResponder(items) : undefined,
	showTextDocument: async (_document: unknown, _column?: unknown) => undefined,
	setStatusBarMessage: (_message: string, _timeout?: number) => ({
		dispose: () => {},
	}),
	withProgress: async <T>(_options: unknown, task: () => Promise<T>) => task(),
	createOutputChannel: (_name: string) => {
		const linesOut: string[] = [];
		return {
			appendLine: (line: string) => linesOut.push(line),
			dispose: () => {},
			_lines: linesOut,
		};
	},
	createStatusBarItem: (_alignment?: unknown, _priority?: number) => {
		const item: MockStatusBarItem = {
			text: '',
			tooltip: '',
			command: undefined,
			backgroundColor: undefined,
			visible: false,
			show(): void {
				item.visible = true;
			},
			hide(): void {
				item.visible = false;
			},
			dispose: () => {},
		};
		statusBarItems.push(item);
		return item;
	},
};

// ---------------------------------------------------------- commands

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

export function _registeredCommands(): ReadonlyMap<
	string,
	(...args: unknown[]) => unknown
> {
	return registeredCommands;
}

export const commands = {
	registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
		registeredCommands.set(id, handler);
		return {
			dispose: () => {
				registeredCommands.delete(id);
			},
		};
	},
	executeCommand: async (id: string, ...args: unknown[]) => {
		const handler = registeredCommands.get(id);
		if (handler) return handler(...args);
		executedBuiltins.push({ id, args });
		return undefined;
	},
};

export const executedBuiltins: Array<{ id: string; args: unknown[] }> = [];

// ------------------------------------------------- extension context

export const env = {
	openExternal: async (_uri: unknown) => true,
};

export function _createExtensionContext() {
	const globalStateStore = new Map<string, unknown>();
	return {
		subscriptions: [] as Array<{ dispose(): void }>,
		globalState: {
			get: <T>(key: string, defaultValue?: T): T | undefined =>
				globalStateStore.has(key)
					? (globalStateStore.get(key) as T)
					: defaultValue,
			update: async (key: string, value: unknown) => {
				globalStateStore.set(key, value);
			},
			setKeysForSync: (_keys: readonly string[]) => {},
		},
		extension: {
			id: 'nolindnaidoo.envsync-le',
			packageJSON: { displayName: 'EnvSync-LE' },
		},
	};
}

export type MockExtensionContext = ReturnType<typeof _createExtensionContext>;

// -------------------------------------------------------------- misc

export const FileType = {
	Unknown: 0,
	File: 1,
	Directory: 2,
	SymbolicLink: 64,
};

/** Reset all mutable mock state between tests. */
export function _resetMockState(): void {
	findFilesError = undefined;
	configReadError = undefined;
	configStore.clear();
	configUpdates.length = 0;
	configListeners.length = 0;
	shownMessages.length = 0;
	openedDocuments.length = 0;
	executedBuiltins.length = 0;
	registeredCommands.clear();
	statusBarItems.length = 0;
	watchers.length = 0;
	fileStore.clear();
	quickPickResponder = undefined;
	warningResponder = undefined;
	workspace.workspaceFolders = undefined;
}

export const l10n = {
	t(message: string, ...args: unknown[]): string {
		if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
			const named = args[0] as Record<string, unknown>;
			return message.replace(/\{(\w+)\}/g, (whole, key) =>
				key in named ? String(named[key]) : whole,
			);
		}
		return message.replace(/\{(\d+)\}/g, (whole, index) => {
			const value = args[Number(index)];
			return value === undefined ? whole : String(value);
		});
	},
};
