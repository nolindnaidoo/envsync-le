import type * as vscode from 'vscode';
import type { Detector } from '../detection/detector';
import type { Configuration, FileSystem, UserInterface } from '../interfaces';
import type { Notifier } from '../interfaces/notifier';
import type { Telemetry } from '../interfaces/telemetry';
import type { RatingPrompt } from '../ui/ratingPrompt';
import { registerCompareSelectedCommand } from './compareSelected';
import { registerHelpCommand } from './help';
import { registerIgnoreFileCommand } from './ignoreFile';
import { registerSetTemplateCommand } from './setTemplate';
import { registerShowIssuesCommand } from './showIssues';

// Centralized command registration. The deps bag carries exactly what the
// commands consume. The notifier is for the guard around each body, which
// reports a rejection in the user's language instead of the editor's.
export function registerAllCommands(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		detector: Detector;
		fileSystem: FileSystem;
		ui: UserInterface;
		configuration: Configuration;
		ratingPrompt: RatingPrompt;
	}>,
): void {
	registerCompareSelectedCommand(context, deps);
	registerSetTemplateCommand(context, deps);
	registerIgnoreFileCommand(context, deps);
	registerShowIssuesCommand(context, deps);
	registerHelpCommand(context, deps);
}
