# EnvSync-LE Commands Guide

This document describes all commands exposed by the EnvSync-LE VS Code extension in an API-style format. Each command lists its identifier, availability, keybinding (if any), behavior, preconditions, prompts/inputs, outputs/side effects, related settings, and expected warnings/errors.

## Where to Run Commands

- **Command Palette**: View → Command Palette → search for "EnvSync-LE" (macOS: Cmd+Shift+P, Windows/Linux: Ctrl+Shift+P)
- **Explorer Context Menu**: Right-click on .env files in the Explorer
- **Status Bar**: Click on the EnvSync-LE status bar item

## Quick Reference

| Command           | Identifier                   | Keybinding | Where Available                      | Description                            |
| ----------------- | ---------------------------- | ---------- | ------------------------------------ | -------------------------------------- |
| Show Issues       | `envsync-le.showIssues`      | —          | Command Palette                      | Display current sync status and issues |
| Compare Selected  | `envsync-le.compareSelected` | —          | Explorer context menu for .env files | Compare selected .env files            |
| Set Template      | `envsync-le.setTemplate`     | —          | Command Palette                      | Set template file for comparison       |
| Clear Template    | `envsync-le.clearTemplate`   | —          | Command Palette                      | Clear template file setting            |
| Ignore File       | `envsync-le.ignoreFile`      | —          | Explorer context menu for .env files | Temporarily ignore a file              |
| Stop Ignoring     | `envsync-le.stopIgnoring`    | —          | Command Palette                      | Stop ignoring a file                   |
| Clear All Ignored | `envsync-le.clearAllIgnored` | —          | Command Palette                      | Clear all ignored files                |
| Open Settings     | `envsync-le.openSettings`    | —          | Command Palette                      | Open EnvSync-LE settings               |

## Detailed Commands

### Show Issues

- **Identifier**: `envsync-le.showIssues`
- **Availability**: Always available
- **Keybinding**: None
- **Description**: Display current sync status and issues in a markdown report

#### Behavior

1. Performs a sync check across all discovered .env files
2. Generates a markdown report with sync status
3. Opens the report in a new editor tab
4. Shows file count, sync status, and detailed issues

#### Preconditions

- Extension must be enabled (`envsync-le.enabled: true`)
- Workspace must be trusted
- At least one .env file should exist (optional)

#### Output

- **Success**: Opens markdown report with sync status
- **No Files**: Shows information message "No .env files found in workspace"
- **In Sync**: Shows information message "Selected .env files are in sync"
- **Error**: Shows error message if report cannot be displayed

#### Side Effects

- Performs file system operations to read .env files
- Updates status bar with current sync status
- Sends telemetry event (if enabled)

#### Related Settings

- `envsync-le.enabled`
- `envsync-le.watchPatterns`
- `envsync-le.excludePatterns`
- `envsync-le.comparisonMode`
- `envsync-le.templateFile`

#### Example Output

```markdown
# envsync-le Sync Report

- Checked files: 3
- Status: missing-keys

## Missing Keys

### .env

Compared to: other files

- DATABASE_URL
- API_KEY

### .env.local

Compared to: other files

- DEBUG
- PORT
```

---

### Compare Selected

- **Identifier**: `envsync-le.compareSelected`
- **Availability**: Explorer context menu for .env files
- **Keybinding**: None
- **Description**: Compare selected .env files and show differences

#### Behavior

1. Validates that at least two .env files are selected
2. Performs comparison between selected files
3. Shows comparison results in a notification
4. Updates status bar with comparison status

#### Preconditions

- At least two .env files must be selected
- Selected files must be readable
- Extension must be enabled

#### Input

- **File URIs**: Selected file URIs from Explorer
- **Single File**: Single file URI (shows warning)

#### Output

- **Success**: Shows information message with comparison results
- **Warning**: Shows warning if fewer than two files selected
- **Error**: Shows error if files cannot be read

#### Side Effects

- Reads selected .env files
- Updates status bar
- Sends telemetry event (if enabled)

#### Related Settings

- `envsync-le.enabled`
- `envsync-le.caseSensitive`
- `envsync-le.ignoreComments`

#### Example Usage

1. Select two or more .env files in Explorer
2. Right-click and choose "EnvSync-LE: Compare Selected"
3. View comparison results in notification

---

### Set Template

- **Identifier**: `envsync-le.setTemplate`
- **Availability**: Command Palette
- **Keybinding**: None
- **Description**: Set a template file for comparison mode

#### Behavior

1. Shows quick pick with available .env files
2. Allows user to select template file
3. Updates configuration with selected template
4. Switches comparison mode to "template" if not already set

#### Preconditions

- At least one .env file must exist in workspace
- Extension must be enabled
- Workspace must be trusted

#### Input

- **File Selection**: Quick pick with .env files
- **Cancellation**: User can cancel selection

#### Output

- **Success**: Shows confirmation message with template file
- **Cancellation**: No action taken
- **Error**: Shows error if template file cannot be set

#### Side Effects

- Updates `envsync-le.templateFile` setting
- Updates `envsync-le.comparisonMode` to "template" if needed
- Triggers sync check with new template
- Sends telemetry event (if enabled)

#### Related Settings

- `envsync-le.templateFile`
- `envsync-le.comparisonMode`
- `envsync-le.watchPatterns`

#### Example Usage

1. Open Command Palette (Ctrl/Cmd + Shift + P)
2. Type "EnvSync-LE: Set Template"
3. Select template file from quick pick
4. Confirm selection

---

### Clear Template

- **Identifier**: `envsync-le.clearTemplate`
- **Availability**: Command Palette
- **Keybinding**: None
- **Description**: Clear the template file setting

#### Behavior

1. Clears the template file configuration
2. Switches comparison mode to "auto" if it was "template"
3. Shows confirmation message
4. Triggers sync check with new settings

#### Preconditions

- Template file must be currently set
- Extension must be enabled

#### Output

- **Success**: Shows confirmation message
- **No Template**: Shows information message if no template was set

#### Side Effects

- Clears `envsync-le.templateFile` setting
- Updates `envsync-le.comparisonMode` to "auto"
- Triggers sync check
- Sends telemetry event (if enabled)

#### Related Settings

- `envsync-le.templateFile`
- `envsync-le.comparisonMode`

#### Example Usage

1. Open Command Palette (Ctrl/Cmd + Shift + P)
2. Type "EnvSync-LE: Clear Template"
3. Confirm the action

---

### Ignore File

- **Identifier**: `envsync-le.ignoreFile`
- **Availability**: Explorer context menu for .env files
- **Keybinding**: None
- **Description**: Temporarily ignore a file from sync checking

#### Behavior

1. Adds selected file to temporary ignore list
2. Shows confirmation message
3. Triggers sync check excluding ignored file
4. Updates status bar

#### Preconditions

- .env file must be selected
- Extension must be enabled
- File must not already be ignored

#### Input

- **File URI**: Selected file URI from Explorer

#### Output

- **Success**: Shows confirmation message
- **Already Ignored**: Shows information message if file is already ignored

#### Side Effects

- Adds file to `envsync-le.temporaryIgnore` setting
- Triggers sync check
- Updates status bar
- Sends telemetry event (if enabled)

#### Related Settings

- `envsync-le.temporaryIgnore`
- `envsync-le.excludePatterns`

---

### Stop Ignoring

- **Identifier**: `envsync-le.stopIgnoring`
- **Availability**: Command Palette
- **Keybinding**: None
- **Description**: Stop ignoring a file and include it in sync checking

#### Behavior

1. Shows quick pick with currently ignored files
2. Allows user to select file to stop ignoring
3. Removes file from temporary ignore list
4. Triggers sync check including the file

#### Preconditions

- At least one file must be temporarily ignored
- Extension must be enabled

#### Input

- **File Selection**: Quick pick with ignored files
- **Cancellation**: User can cancel selection

#### Output

- **Success**: Shows confirmation message
- **No Ignored Files**: Shows information message if no files are ignored
- **Cancellation**: No action taken

#### Side Effects

- Removes file from `envsync-le.temporaryIgnore` setting
- Triggers sync check
- Updates status bar
- Sends telemetry event (if enabled)

#### Related Settings

- `envsync-le.temporaryIgnore`

---

### Clear All Ignored

- **Identifier**: `envsync-le.clearAllIgnored`
- **Availability**: Command Palette
- **Keybinding**: None
- **Description**: Clear all temporarily ignored files

#### Behavior

1. Clears all files from temporary ignore list
2. Shows confirmation message
3. Triggers sync check including all files
4. Updates status bar

#### Preconditions

- At least one file must be temporarily ignored
- Extension must be enabled

#### Output

- **Success**: Shows confirmation message
- **No Ignored Files**: Shows information message if no files are ignored

#### Side Effects

- Clears `envsync-le.temporaryIgnore` setting
- Triggers sync check
- Updates status bar
- Sends telemetry event (if enabled)

#### Related Settings

- `envsync-le.temporaryIgnore`

---

### Open Settings

- **Identifier**: `envsync-le.openSettings`
- **Availability**: Command Palette
- **Keybinding**: None
- **Description**: Open VS Code settings filtered to EnvSync-LE

#### Behavior

1. Opens VS Code Settings UI
2. Filters settings to show only EnvSync-LE settings
3. Focuses on the first EnvSync-LE setting

#### Preconditions

- VS Code Settings UI must be available
- Extension must be enabled

#### Output

- **Success**: Opens Settings UI with EnvSync-LE settings
- **Error**: Shows error if Settings UI cannot be opened

#### Side Effects

- Opens Settings UI
- Sends telemetry event (if enabled)

#### Related Settings

- All EnvSync-LE settings

---

## Command Context and Availability

### Explorer Context Menu

Commands appear in the Explorer context menu when:

- Right-clicking on .env files
- Files match the watch patterns
- Extension is enabled
- Workspace is trusted

### Command Palette

All commands are available in the Command Palette:

- Open Command Palette (Ctrl/Cmd + Shift + P)
- Type "EnvSync-LE" to filter commands
- Select desired command

### Status Bar

The status bar item provides:

- Current sync status
- Click to run "Show Issues" command
- Visual indicator of sync state

## Error Handling

### Common Errors

#### "No .env files found"

- **Cause**: No .env files match the watch patterns
- **Solution**: Check `envsync-le.watchPatterns` setting
- **Related**: `envsync-le.excludePatterns`

#### "Extension is disabled"

- **Cause**: `envsync-le.enabled` is set to `false`
- **Solution**: Enable the extension in settings
- **Related**: `envsync-le.enabled`

#### "Workspace not trusted"

- **Cause**: Workspace trust is disabled
- **Solution**: Trust the workspace or enable workspace trust
- **Related**: VS Code workspace trust settings

#### "File not readable"

- **Cause**: File permissions or file system issues
- **Solution**: Check file permissions and file system
- **Related**: File system permissions

### Error Recovery

#### Automatic Recovery

- **Transient Errors**: Automatic retry for transient errors
- **File System Errors**: Graceful handling of file system issues
- **Configuration Errors**: Fallback to defaults for invalid settings

#### Manual Recovery

- **Reload Window**: Reload VS Code window to reset state
- **Check Settings**: Verify configuration settings
- **Check Files**: Verify .env files are accessible
- **Check Logs**: Check Output channel for detailed error information

## Telemetry and Privacy

### Telemetry Events

Commands send telemetry events (if enabled):

- **Command Execution**: Track command usage
- **File Operations**: Track file operations
- **Configuration Changes**: Track configuration changes
- **Error Events**: Track error occurrences

### Privacy

- **Local Only**: All telemetry is local-only
- **No Network**: No data is sent over the network
- **User Control**: User controls telemetry via settings
- **Opt-in**: Telemetry is disabled by default

### Disabling Telemetry

```json
{
  "envsync-le.telemetryEnabled": false
}
```

## Best Practices

### Command Usage

- **Use Status Bar**: Use status bar for quick sync checks
- **Use Context Menu**: Use context menu for file-specific actions
- **Use Command Palette**: Use command palette for configuration
- **Check Settings**: Regularly review and update settings

### Performance

- **Limit Comparisons**: Use "Compare Selected" for specific files
- **Use Templates**: Use template mode for consistent environments
- **Ignore Files**: Use ignore functionality for temporary files
- **Adjust Debounce**: Adjust debounce for performance

### Troubleshooting

- **Check Logs**: Check Output channel for detailed information
- **Reload Window**: Reload window to reset extension state
- **Verify Settings**: Verify configuration settings
- **Check Files**: Verify .env files are accessible

This commands guide provides comprehensive information for using all EnvSync-LE commands effectively and troubleshooting common issues.
