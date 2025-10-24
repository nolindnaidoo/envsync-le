import * as vscode from 'vscode';
import type { Notifier } from '../interfaces/notifier';
import type { StatusBar } from '../interfaces/statusBar';
import type { Telemetry } from '../interfaces/telemetry';

export function registerHelpCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): void {
	const command = vscode.commands.registerCommand(
		'envsync-le.help',
		async () => {
			deps.telemetry.event('command-help');

			const helpText = `
# EnvSync-LE Help & Troubleshooting

## Commands
- **Show Issues** (Ctrl+Alt+E / Cmd+Alt+E): Display environment file synchronization issues
- **Compare Selected**: Compare two selected .env files side-by-side
- **Set Template**: Mark current .env file as the reference template
- **Clear Template**: Remove the current template designation
- **Ignore File**: Exclude a .env file from sync checking
- **Stop Ignoring**: Re-include a previously ignored .env file
- **Clear All Ignored**: Remove all files from ignore list
- **Open Settings**: Configure EnvSync-LE settings
- **Help**: Open this help documentation

## What EnvSync-LE Does
EnvSync-LE automatically detects and highlights inconsistencies across multiple .env files in your workspace:
- Missing variables in some files
- Variables present in some but not others
- Out-of-sync variable sets
- Template-based validation

## Quick Start
1. Open a workspace with multiple .env files (.env, .env.local, .env.production, etc.)
2. Press **Ctrl+Alt+E** (Mac: **Cmd+Alt+E**) or run "EnvSync-LE: Show Issues"
3. Review detected inconsistencies
4. (Optional) Set a template file to use as reference
5. Fix inconsistencies based on recommendations

## Template System
Set one .env file as the "template" to serve as the source of truth:
- **Set Template**: Right-click any .env file → "EnvSync-LE: Set Template"
- **Clear Template**: Remove template designation
- All other .env files will be validated against the template

## Ignore System
Exclude specific .env files from sync checking:
- **Ignore File**: Right-click .env file → "EnvSync-LE: Ignore File"
- **Stop Ignoring**: Re-include a previously ignored file
- **Clear All Ignored**: Remove all files from ignore list

Useful for:
- Example files (.env.example)
- Documentation files (.env.sample)
- Legacy files you don't want to sync

## Detection Features
- **Automatic scanning**: Detects all .env files in workspace
- **Real-time updates**: Updates issues as files change
- **Smart comparison**: Identifies missing/extra variables
- **Clear reporting**: Shows which variables are out of sync

## Troubleshooting

### No issues detected
- Ensure you have multiple .env files in workspace
- Check that files are named .env, .env.local, .env.production, etc.
- Verify files are not ignored
- Try running "Show Issues" command manually

### Template not working
- Verify template is set correctly (check status bar)
- Ensure template file exists and is readable
- Clear and re-set template if needed

### Files not being detected
- Check file naming (.env prefix required)
- Verify files are in workspace folders
- Check if files are in .gitignore (still detected, but noted)

### Performance with many .env files
- Use ignore feature for files you don't need to sync
- Set a specific template to reduce comparisons
- Close unused workspace folders

## Settings
Access settings via Command Palette: "EnvSync-LE: Open Settings"

Key settings:
- **Auto-detect on startup**: Automatically scan for issues when workspace opens
- **Show in status bar**: Display sync status in VS Code status bar
- **Notification levels**: Control verbosity (silent, important, all)
- **File patterns**: Customize which files are considered .env files
- **Telemetry**: Local logging only (default: false)

## Common Use Cases

### Keeping environments in sync
1. Set your main .env file as template
2. Run "Show Issues" to see what's missing in other environments
3. Add missing variables to .env.local, .env.production, etc.

### Comparing two specific files
1. Select two .env files in explorer (Ctrl+Click)
2. Right-click → "EnvSync-LE: Compare Selected"
3. Review side-by-side comparison

### Excluding example files
1. Right-click .env.example
2. Select "EnvSync-LE: Ignore File"
3. File will be excluded from sync checks

### Cleaning up after project changes
1. Remove old/unused .env files
2. Run "Clear All Ignored" if you changed ignore settings
3. Re-run "Show Issues" to see current state

## Performance Tips
- Set a template to reduce comparison complexity
- Ignore files you don't need to sync
- Close unused workspace folders
- Use ignore feature for large .env files you don't maintain

## Keyboard Shortcuts
- **Show Issues**: Ctrl+Alt+E / Cmd+Alt+E

## Support
- GitHub Issues: https://github.com/OffensiveEdge/envsync-le/issues
- Documentation: https://github.com/OffensiveEdge/envsync-le#readme
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
