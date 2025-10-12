import * as vscode from 'vscode';
import {
	createVSCodeConfiguration,
	createVSCodeFileSystem,
	createVSCodeUserInterface,
} from './adapters';
import { VSCodeCommandAdapter } from './adapters/vscodeCommand';
import { createVSCodeNotifier } from './adapters/vscodeNotifier';
import { createVSCodeStatusBar } from './adapters/vscodeStatusBar';
import { createVSCodeTelemetry } from './adapters/vscodeTelemetry';
import { registerVSCodeWatchers } from './adapters/vscodeWatcher';
import { registerAllCommands } from './commands';
import { readConfig } from './config/config';
import { registerOpenSettingsCommand } from './config/settings';
import { createDetector } from './detection/detector';

export function activate(context: vscode.ExtensionContext): void {
	// Create core services using factory pattern
	const configuration = createVSCodeConfiguration(vscode.workspace);
	const telemetry = createVSCodeTelemetry(configuration);
	const notifier = createVSCodeNotifier(
		{ window: vscode.window, readConfig: readConfig },
		configuration,
	);
	const statusBar = createVSCodeStatusBar(context, {
		window: vscode.window,
		StatusBarAlignment: vscode.StatusBarAlignment,
		ThemeColor: vscode.ThemeColor,
		readConfig: readConfig,
	});
	const fileSystem = createVSCodeFileSystem({
		Uri: vscode.Uri,
		workspaceFs: vscode.workspace.fs,
		findFiles: (pattern, exclude, maxResults) =>
			Promise.resolve(vscode.workspace.findFiles(pattern, exclude, maxResults)),
		asRelativePath: vscode.workspace.asRelativePath,
		FileType: vscode.FileType,
	});
	const detector = createDetector({
		telemetry,
		notifier,
		statusBar,
		configuration,
		fileSystem,
	});
	const commandAdapter = new VSCodeCommandAdapter(context);

	// Register commands
	registerOpenSettingsCommand(commandAdapter, telemetry);
	registerAllCommands(context, {
		telemetry,
		notifier,
		statusBar,
		detector,
		fileSystem,
		ui: createVSCodeUserInterface(),
		configuration,
	});

	// Setup file watching (honors patterns/excludes)
	registerVSCodeWatchers(context, detector, configuration, fileSystem);

	// Perform initial sync check
	detector.checkSync().catch((error) => {
		// Always log errors for debugging, regardless of notification preference
		console.error('EnvSync-LE: Initial sync check failed:', error);

		// Only show notifications based on user preference
		const config = readConfig(configuration);
		if (config.notificationLevel !== 'silent') {
			notifier.showError(
				`Initial sync check failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	});

	// Cleanup on deactivation
	context.subscriptions.push(telemetry);
	context.subscriptions.push(statusBar);
	context.subscriptions.push(detector);

	telemetry.event('extension-activated');
}

export function deactivate(): void {
	// Extensions are automatically disposed via context.subscriptions
}
