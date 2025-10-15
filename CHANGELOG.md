# Changelog

All notable changes to EnvSync-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.2] - 2025-01-27

### Fixed

- **Keyboard shortcut conflict** - Changed from `Ctrl+Alt+E` to `Ctrl+Alt+S` to avoid conflict with Strings-LE
- **User experience** - Improved keyboard shortcut consistency across LE family extensions

### Technical

- Resolved keyboard shortcut collision with Strings-LE extension
- Maintained 100% backward compatibility with existing installations

## [1.4.1] - 2025-01-27

### Added

- **Portuguese (Brazil) localization** - Added complete pt-br language support for all user interface elements
- **Enhanced internationalization** - Expanded language coverage to include Brazilian Portuguese for better accessibility

### Technical

- Added comprehensive Portuguese (Brazil) localization file with 105+ translated strings
- All commands, settings, notifications, and help content now available in Portuguese (Brazil)
- Maintained 100% backward compatibility with existing functionality

## [1.4.0] - 2025-10-14

### Added

- **Command parity achievement** - Full parity with other LE extraction extensions
- **Help command** - Added comprehensive help and troubleshooting documentation accessible from command palette
- **Comprehensive documentation** - Added complete command list to README with examples
- **Documentation updates** - Updated all docs to reflect command parity achievement

### Changed

- **Command category casing** - Standardized command palette category from "envsync-le" to "EnvSync-LE" for visual consistency
- **Help command UX** - Help documentation now opens beside source code by default for better workflow
- **Documentation** - Updated README to use new demo.gif and command palette screenshot
- **Infrastructure verification** - Verified activation events, command registry, and all infrastructure components
- **Command count** - Stabilized at 9 commands (Sync, Compare, Diff, Import, Export, Load, Create Template, Settings, Help)

### Removed

- **Broken commands** - Removed non-functional export/import/reset settings commands that were never implemented

## [1.3.4] - 2025-10-14

### Technical

- No functional changes - version bump only to maintain consistency across LE family extensions

## [1.3.3] - 2025-10-14

### Documentation

- Added actual test coverage metrics: 121 passing tests across 17 test suites with 79.04% overall coverage
- Adds transparency and aligns with the documentation standard across the LE family

## [1.3.2] - 2025-10-12

### 🐛 Bug Fixes

- **Fixed race condition in file watcher**: Replaced boolean flag with promise-based mutex to prevent concurrent sync checks
- **Improved error logging**: Extension activation errors are now always logged to console for debugging, regardless of notification preferences
- **Enhanced disposal safety**: Added disposed flag to prevent timer callbacks from executing after extension deactivation

### 🔧 Technical Improvements

- Eliminated potential race conditions when multiple file changes occur rapidly
- Better error visibility during development and troubleshooting
- More robust cleanup on extension deactivation

## [1.3.1] - 2025-10-11

### 🐛 Bug Fixes

- Minor stability improvements

## [1.3.0] - 2025-10-11

### 🎉 Initial Public Release

**EnvSync-LE** - Zero Hassle .env file synchronization across your workspace.

### ✨ Features

#### Core Synchronization

- **Automatic detection**: Discover all .env files in your workspace automatically
- **Real-time sync checking**: Detect missing and extra keys instantly
- **Visual diff support**: Compare .env files side-by-side with syntax highlighting
- **Multiple comparison modes**: Auto, Manual, and Template-based comparison

#### Comparison Modes

- **Auto Mode**: Automatically compare all .env files in workspace
- **Manual Mode**: Select specific files to compare
- **Template Mode**: Use a master .env file as the source of truth

#### Detection & Validation

- **Pattern-based discovery**: Configurable glob patterns for file detection
- **Exclude patterns**: Filter out files you don't want to track
- **Parse error reporting**: Clear feedback on malformed .env files
- **Missing key detection**: Identify keys present in some files but missing in others
- **Extra key detection**: Find keys that don't belong based on comparison

#### User Interface

- **Status bar integration**: At-a-glance sync status with issue counts
- **Notification system**: Configurable alerts (all, errors only, silent)
- **Command palette**: Full keyboard-driven workflow
- **Context menu**: Quick access from Explorer
- **Webview diff viewer**: Beautiful side-by-side comparisons

#### Commands

- **Check Sync**: Manual sync check on demand
- **Compare Files**: Open visual diff for selected .env files
- **Set Template**: Choose a file as comparison template
- **Open Settings**: Quick access to configuration
- **View Help**: In-app documentation

#### Performance & Reliability

- **Debounced file watching**: Smart change detection without excessive checks
- **Concurrent check prevention**: Avoid race conditions
- **Error recovery**: Graceful handling of parse and read errors
- **Memory efficient**: Optimized for large monorepos

#### Enterprise Ready

- **13 languages supported**: Full internationalization (EN, ES, FR, DE, JA, ZH-CN, KO, RU, UK, IT, ID, VI)
- **Virtual workspace support**: Compatible with GitHub Codespaces, Gitpod
- **Untrusted workspace handling**: Safe operation in restricted environments
- **Local-only telemetry**: Privacy-focused with configurable logging

#### Configuration

- **Enable/disable**: Toggle extension on/off
- **Watch patterns**: Customize which files to track
- **Exclude patterns**: Filter files and directories
- **Comparison mode**: Choose Auto, Manual, or Template
- **Template file**: Set master .env file
- **Notification level**: Control alert verbosity
- **Debounce timing**: Adjust file watch sensitivity
- **Status bar**: Show/hide status indicator

### 🔒 Security & Quality

- **Resource management**: Proper cleanup of watchers, timers, and disposables
- **Error handling**: Comprehensive error handling with user feedback
- **Disposal guards**: Prevention of use-after-disposal issues
- **Code quality**: Zero linter warnings, 121 passing tests, strict TypeScript

### 🚀 Part of the LE Family

EnvSync-LE is part of a growing family of developer productivity tools:

- [Strings-LE](https://open-vsx.org/extension/nolindnaidoo/string-le) - String extraction from structured files
- [Numbers-LE](https://open-vsx.org/extension/nolindnaidoo/numbers-le) - Numeric data extraction
- [Colors-LE](https://open-vsx.org/extension/nolindnaidoo/colors-le) - Color analysis
- [Dates-LE](https://open-vsx.org/extension/nolindnaidoo/dates-le) - Date extraction
- [Paths-LE](https://open-vsx.org/extension/nolindnaidoo/paths-le) - File path analysis
- [URLs-LE](https://open-vsx.org/extension/nolindnaidoo/urls-le) - URL extraction

Each tool follows the same philosophy: **Zero Hassle, Maximum Productivity**.
