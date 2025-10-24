# Changelog

All notable changes to EnvSync-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2025-01-27

### Initial Public Release

EnvSync-LE brings zero-hassle .env synchronization to VS Code. Simple, reliable, focused.

#### Core Features

- **Simple sync detection** - Instantly see if your environment files are in sync
- **One-click details** - Click the status bar to open comprehensive visual diff reports
- **Clear signals** - Status bar indicators for in-sync, missing/extra keys, and parse errors
- **Flexible modes** - Auto scan, manual selection, or compare all files to a template
- **Noise control** - Ignore comments, toggle case sensitivity, and debounce checks
- **Granular scope** - Include/exclude file patterns and temporarily ignore specific files

#### Supported File Types

- **Environment files** - .env, .env.local, .env.production, .env.development
- **Template files** - .env.template, .env.example
- **Configuration files** - Various environment variable configurations

#### Features

- **Multi-language support** - Comprehensive localization for 12+ languages
- **Visual diff reports** - Side-by-side comparison of environment files
- **Template-based comparison** - Compare all files against a master template
- **Automatic detection** - Find and compare all .env files in workspace
- **Manual selection** - Choose specific files for comparison
- **Parse error detection** - Identify malformed environment files
- **Status bar integration** - Real-time sync status in VS Code status bar
- **Developer-friendly** - 45+ passing tests, TypeScript strict mode, functional programming, MIT licensed

#### Use Cases

- **Monorepo Environment Management** - Keep environment variables synchronized across multiple services
- **Team Development** - Ensure all developers have consistent environment configurations
- **Deployment Validation** - Verify environment files match production requirements
- **Configuration Auditing** - Track changes and inconsistencies across environment files
