import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import type { Detector } from '../detection/detector';
import { shouldExcludeFile } from '../detection/heuristics';
import type { Configuration, FileSystem } from '../interfaces';
import type { SyncReport } from '../types';

export function registerVSCodeWatchers(
	context: vscode.ExtensionContext,
	detector: Detector,
	configuration: Configuration,
	fileSystem: FileSystem,
): void {
	// Debounced detection shared by all watchers
	let timeoutId: NodeJS.Timeout | undefined;
	let checkPromise: Promise<SyncReport> | undefined;
	// A change that arrived while a check was in flight. The check read the
	// files before the change, so its answer is stale the moment it lands;
	// one more check after it, not one per event, covers everything that
	// happened in the meantime.
	let changedDuringCheck = false;
	let disposed = false;
	let watchers: vscode.FileSystemWatcher[] = [];

	const runCheck = async (): Promise<void> => {
		checkPromise = detector.checkSync().finally(() => {
			checkPromise = undefined;
		});

		try {
			await checkPromise;
		} catch (error) {
			// Only log if notifications are enabled - respect user's preference
			if (readConfig(configuration).notificationLevel !== 'silent') {
				console.error('File watcher sync check failed:', error);
			}
		}

		if (disposed || !changedDuringCheck) return;
		changedDuringCheck = false;
		await runCheck();
	};

	const debouncedDetect = (): void => {
		if (disposed) return; // Early exit if disposed
		if (timeoutId) clearTimeout(timeoutId);

		// Config is read per event, not snapshotted at registration
		const config = readConfig(configuration);

		timeoutId = setTimeout(async () => {
			if (disposed) return; // Check again before executing
			if (checkPromise) {
				changedDuringCheck = true;
				return;
			}
			await runCheck();
		}, config.debounceMs);
	};

	const handleEvent = async (uri: vscode.Uri): Promise<void> => {
		try {
			const config = readConfig(configuration);
			// Apply exclude patterns on relative path
			const rel = fileSystem.asRelativePath(uri.fsPath);
			if (shouldExcludeFile(rel, config.excludePatterns)) return;
			debouncedDetect();
		} catch (error) {
			// Log but don't crash the watcher
			if (readConfig(configuration).notificationLevel !== 'silent') {
				console.error('File watcher event error:', error);
			}
		}
	};

	function createWatchers(): void {
		const config = readConfig(configuration);

		for (const pattern of config.watchPatterns) {
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);

			watcher.onDidCreate(handleEvent);
			watcher.onDidChange(handleEvent);
			watcher.onDidDelete(handleEvent);

			watchers.push(watcher);
		}
	}

	function disposeWatchers(): void {
		for (const watcher of watchers) {
			watcher.dispose();
		}
		watchers = [];
	}

	createWatchers();

	// Watchers were previously built once from a config snapshot; changing
	// watchPatterns required a window reload to take effect.
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('envsync-le.watchPatterns')) {
				disposeWatchers();
				createWatchers();
			}
		}),
	);

	// Cleanup watchers, debounce timer, and set disposed flag
	context.subscriptions.push({
		dispose: () => {
			disposed = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			disposeWatchers();
		},
	});
}
