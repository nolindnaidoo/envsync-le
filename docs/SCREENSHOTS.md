# Screenshots

These examples show how envsync-le surfaces sync status and actions in VS Code.

## Status Bar — In Sync

![envsync-le Status Bar (In Sync)](../src/assets/images/insync.png)

- Green check indicates all discovered `.env*` files have matching keys.
- Tooltip confirms everything is in sync.

## Status Bar — Out of Sync

![envsync-le Status Bar (Out of Sync)](../src/assets/images/outofsync.png)

- Warning icon shows the number of files with key mismatches or issues.
- Click the status bar to open a detailed Sync Details report.

## Notifications

![envsync-le Notifications](../src/assets/images/notifications.png)

- Clear messages for missing keys and parse/read errors.
- Honors `envsync-le.notificationLevel` (`all`, `important`, `silent`).

## Command Palette

![envsync-le Commands](../src/assets/images/command-palette.png)

- Quickly run: Show Sync Details, Compare Selected, Set/Clear Template, Ignore/Stop Ignoring.
- Use Manual or Template modes to control comparison behavior.

## Sync Details Report

![envsync-le Sync Details Report](../src/assets/images/diff.png)

- One‑click report listing out‑of‑sync files and offending keys.
- Notes the reference file used for comparison and includes parse/read errors when present.

