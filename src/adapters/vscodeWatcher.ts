import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import type { Detector } from '../detection/detector';
import type { Configuration, FileSystem } from '../interfaces';
import type { SyncReport } from '../types';

export function registerVSCodeWatchers(
	context: vscode.ExtensionContext,
	detector: Detector,
	configuration: Configuration,
	fileSystem: FileSystem,
): void {
	const config = readConfig(configuration);

	// Debounced detection shared by all watchers
	let timeoutId: NodeJS.Timeout | undefined;
	let checkPromise: Promise<SyncReport> | undefined;
	let disposed = false;

	const debouncedDetect = (): void => {
		if (disposed) return; // Early exit if disposed
		if (timeoutId) clearTimeout(timeoutId);

		timeoutId = setTimeout(async () => {
			if (disposed) return; // Check again before executing
			if (checkPromise) {
				// Wait for existing check to complete instead of creating race condition
				await checkPromise;
				return;
			}

			checkPromise = detector.checkSync().finally(() => {
				checkPromise = undefined;
			});

			try {
				await checkPromise;
			} catch (error) {
				// Only log if notifications are enabled - respect user's preference
				if (config.notificationLevel !== 'silent') {
					console.error('File watcher sync check failed:', error);
				}
			}
		}, config.debounceMs);
	};

	const watchers: vscode.FileSystemWatcher[] = [];

	for (const pattern of config.watchPatterns) {
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		const handleEvent = async (uri: vscode.Uri): Promise<void> => {
			try {
				// Apply exclude patterns on relative path
				const rel = fileSystem.asRelativePath(uri.fsPath);
				const excluded = config.excludePatterns.some((pat) =>
					matchSimpleGlob(rel, pat),
				);
				if (excluded) return;
				debouncedDetect();
			} catch (error) {
				// Log but don't crash the watcher
				if (config.notificationLevel !== 'silent') {
					console.error('File watcher event error:', error);
				}
			}
		};

		watcher.onDidCreate(handleEvent);
		watcher.onDidChange(handleEvent);
		watcher.onDidDelete(handleEvent);

		context.subscriptions.push(watcher);
		watchers.push(watcher);
	}

	// Cleanup debounce timer and set disposed flag
	context.subscriptions.push({
		dispose: () => {
			disposed = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
		},
	});
}

// Very small glob matcher: supports "**", "*" and simple path segments
function matchSimpleGlob(input: string, pattern: string): boolean {
	// Escape regex special chars except *
	const escaped = pattern.replace(/[.+?^${}()|[\\]/g, '\\$&');
	// Use a placeholder to avoid interfering replacements
	const DOUBLE_STAR = '\u0000';
	const withMarker = escaped.replace(/\*\*/g, DOUBLE_STAR);
	const singleExpanded = withMarker.replace(/\*/g, '[^/]*');
	const regexStr = `^${singleExpanded.replace(new RegExp(DOUBLE_STAR, 'g'), '.*')}$`;
	return new RegExp(regexStr).test(input);
}
