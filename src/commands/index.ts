import type * as vscode from 'vscode';
import type { Detector } from '../detection/detector';
import type { Configuration, FileSystem, UserInterface } from '../interfaces';
import type { Notifier } from '../interfaces/notifier';
import type { StatusBar } from '../interfaces/statusBar';
import type { Telemetry } from '../interfaces/telemetry';
import { registerCompareSelectedCommand } from './compareSelected';
import { registerHelpCommand } from './help';
import { registerIgnoreFileCommand } from './ignoreFile';
import { registerSetTemplateCommand } from './setTemplate';
import { registerShowIssuesCommand } from './showIssues';

// Centralized command registration
export function registerAllCommands(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
		detector: Detector;
		fileSystem: FileSystem;
		ui: UserInterface;
		configuration: Configuration;
	}>,
): void {
	registerCompareSelectedCommand(context, deps);
	registerSetTemplateCommand(context, deps);
	registerIgnoreFileCommand(context, deps);
	registerShowIssuesCommand(context, deps);
	registerHelpCommand(context, deps);
}
