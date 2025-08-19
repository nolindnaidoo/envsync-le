# Change Log

All notable changes to the "envsync-le" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-08-18

### Added

- Internationalization (i18n) support: All user-facing strings are now localized.
- Added language files in the root for easy translation and localization.
- Extension UI and commands now display in your VS Code language, if available.

#### Supported Languages

- Chinese (Simplified), Spanish, French, Russian, Portuguese (Brazil)
- Japanese, Korean, German, Italian, Vietnamese, Ukrainian, Indonesian

- Fix: Update "manage extension" path
- Fix: Set notifications to silent by default
- Fix: Packaging Issues

## [1.0.0] - 2025-08-18

### Added

- Initial release of envsync-le.
- Synchronizes `.env` files across your workspace.
- Detects missing or extra environment variables.
- Provides commands for comparing selected `.env` files.
- Allows setting a template `.env` file for comparison.
- Supports ignoring specific `.env` files.
- Configurable notification levels and status bar integration.
- Telemetry for usage insights (opt-in).
