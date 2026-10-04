import * as vscode from 'vscode';
import {
	createVSCodeConfiguration,
	createVSCodeFileSystem,
	createVSCodeUserInterface,
} from './adapters';
import { createVSCodeCommandAdapter } from './adapters/vscodeCommand';
import { createVSCodeNotifier } from './adapters/vscodeNotifier';
import { createVSCodeStatusBar } from './adapters/vscodeStatusBar';
import { createVSCodeTelemetry } from './adapters/vscodeTelemetry';
import { registerVSCodeWatchers } from './adapters/vscodeWatcher';
import { registerAllCommands } from './commands';
import { readConfig } from './config/config';
import { registerOpenSettingsCommand } from './config/settings';
import { createDetector } from './detection/detector';
import { registerMcpProvider } from './mcp/provider';
import { createRatingPromptFor } from './ui/ratingPrompt';

export function activate(context: vscode.ExtensionContext): void {
	// Create core services using factory pattern
	const configuration = createVSCodeConfiguration(vscode.workspace);
	const telemetry = createVSCodeTelemetry(configuration);
	const notifier = createVSCodeNotifier(
		{ window: vscode.window, readConfig: readConfig },
		configuration,
	);
	const statusBar = createVSCodeStatusBar(
		context,
		{
			window: vscode.window,
			StatusBarAlignment: vscode.StatusBarAlignment,
			ThemeColor: vscode.ThemeColor,
			onDidChangeConfiguration: vscode.workspace.onDidChangeConfiguration,
			readConfig: readConfig,
		},
		configuration,
	);
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
	const commandAdapter = createVSCodeCommandAdapter(context);

	// Register commands
	registerOpenSettingsCommand(commandAdapter, telemetry);
	registerAllCommands(context, {
		telemetry,
		detector,
		fileSystem,
		ui: createVSCodeUserInterface(),
		configuration,
		ratingPrompt: createRatingPromptFor(context, telemetry.event),
	});

	// Setup file watching (honors patterns/excludes)
	registerVSCodeWatchers(context, detector, configuration, fileSystem);

	// Perform the initial sync check.
	//
	// Deliberately not wrapped in .catch(): checkSync resolves with an error
	// report rather than rejecting — it catches internally and routes failures
	// through handleSyncCheckError, which notifies the user and honours
	// notificationLevel. The only read outside its try is the configuration
	// read, and a configuration that cannot be read has already thrown earlier
	// in this function. A catch here was unreachable, and when it did anything
	// at all it re-reported a failure the detector had already reported.
	void detector.checkSync();

	// Cleanup on deactivation
	context.subscriptions.push(telemetry);
	context.subscriptions.push(statusBar);
	context.subscriptions.push(detector);

	telemetry.event('extension-activated');

	// Offer the bundled MCP server to agent mode, where the host supports it
	registerMcpProvider(context);
}

export function deactivate(): void {
	// Extensions are automatically disposed via context.subscriptions
}
