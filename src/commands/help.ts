import * as vscode from 'vscode';
import type { Telemetry } from '../interfaces/telemetry';

export function registerHelpCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
	}>,
): void {
	const command = vscode.commands.registerCommand(
		'envsync-le.help',
		async () => {
			deps.telemetry.event('command-help');

			const helpText = `
# EnvSync-LE Help

## Commands
- **Show Details** (Ctrl+Alt+S / Cmd+Alt+S): Run a sync check and open a markdown report of missing keys and parse errors
- **Compare Files**: Compare the key sets of two or more selected .env files
- **Set Template**: Mark a .env file as the reference template; all files are compared against it
- **Clear Template**: Remove the template and return to automatic comparison
- **Ignore File**: Exclude a .env file from sync checking
- **Unignore File**: Re-include a previously ignored .env file
- **Clear Ignored Files**: Empty the ignore list
- **Open Settings**: Open VS Code settings filtered to EnvSync-LE
- **Help & Troubleshooting**: Open this document

## What EnvSync-LE Does
EnvSync-LE compares the variable names (keys) across the .env files in
your workspace and reports keys that are missing from some files. It
does not read or compare values.

- Automatic checks when .env files change (debounced)
- Status bar item with the current issue count
- Template mode: validate every file against one reference file
- Ignore list for files you don't want checked

## Quick Start
1. Open a workspace containing more than one .env file (.env, .env.local, ...)
2. Press **Ctrl+Alt+S** (Mac: **Cmd+Alt+S**) or run "EnvSync-LE: Show Details"
3. Review the report of missing keys per file
4. Optionally set a template file as the source of truth

## Template System
- **Set Template**: Right-click a .env file → "EnvSync-LE: Set Template"
- All other .env files are validated against the template's keys
- **Clear Template**: Return to automatic (union-of-all-keys) comparison

## Ignore System
- **Ignore File**: Right-click a .env file → "EnvSync-LE: Ignore File"
- Ignored files are skipped by sync checks until you stop ignoring them
- Useful for example files (.env.example) or legacy files

## Troubleshooting

### No issues detected
- Ensure the workspace has at least two .env files
- Check the files match the watch patterns setting (default: .env*)
- Verify the files are not in the ignore list

### Files not being detected
- File names must match the watch patterns (default: .env*)
- Files must be inside a workspace folder

## Settings
Run "EnvSync-LE: Open Settings" to see every setting with its
description, including watch/exclude patterns, notification level,
status bar toggle, debounce delay, and comparison mode.

## Support
- GitHub Issues: https://github.com/nolindnaidoo/envsync-le/issues
- Documentation: https://github.com/nolindnaidoo/envsync-le#readme
- LE Tools: https://letools.dev

Enjoying it? A rating helps more than you'd think:
- Rate on VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.envsync-le&ssr=false#review-details
- Rate on Open VSX: https://open-vsx.org/extension/nolindnaidoo/envsync-le/reviews

Built by nolindnaidoo (https://github.com/nolindnaidoo) — MIT licensed.
		`.trim();

			const doc = await vscode.workspace.openTextDocument({
				content: helpText,
				language: 'markdown',
			});
			await vscode.window.showTextDocument(doc, {
				preview: false,
				viewColumn: vscode.ViewColumn.Beside,
			});
		},
	);

	context.subscriptions.push(command);
}
