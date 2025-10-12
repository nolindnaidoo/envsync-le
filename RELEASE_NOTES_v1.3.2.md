# EnvSync-LE v1.3.2 Release Notes

**Release Date:** October 12, 2025  
**Type:** Bug Fix Release

## 🐛 Critical Bug Fixes

### 1. Fixed Race Condition in File Watcher

**Problem:** Multiple rapid file changes could trigger concurrent sync checks, leading to wasted resources and potential inconsistencies.

**Solution:** Replaced boolean flag with promise-based mutex pattern that properly queues and waits for ongoing checks to complete.

**Impact:** More reliable file watching, especially in projects with frequent .env file changes.

### 2. Improved Error Logging During Activation

**Problem:** Extension activation errors were only logged when notifications were enabled, making debugging difficult.

**Solution:** Errors are now always logged to console for debugging, while notifications still respect user preferences.

**Impact:** Better debugging experience for developers and easier troubleshooting of issues.

### 3. Enhanced Disposal Safety

**Problem:** Timer callbacks could potentially execute after extension deactivation.

**Solution:** Added disposed flag that prevents callbacks from running after cleanup.

**Impact:** More robust cleanup process and prevention of potential memory leaks.

## 🔧 Technical Details

### Changes Made

#### `src/adapters/vscodeWatcher.ts`

- Replaced `isChecking` boolean flag with `checkPromise` promise-based mutex
- Added `disposed` flag to prevent execution after disposal
- Improved timer cleanup in dispose method

#### `src/extension.ts`

- Enhanced error logging in initial sync check
- Always log errors to console regardless of notification settings
- Improved error messages for better debugging

## 📊 Testing

All existing tests pass with 121 test cases:

```bash
cd envsync-le && npm test
```

## 🚀 Upgrade Instructions

### For End Users

Simply update to v1.3.2 through the VS Code marketplace or manually install the VSIX file.

### For Developers

```bash
cd envsync-le
npm run build
npm test
npm run package
```

## 🔗 Related Issues

These fixes address potential issues identified during comprehensive code review:

- Race conditions in file watcher operations
- Silent activation failures
- Timer cleanup edge cases

## 📝 Migration Notes

This is a **patch release** with no breaking changes. All existing configurations and workflows remain compatible.

## 🙏 Acknowledgments

Special thanks to the code review process that identified these edge cases and potential issues before they impacted users.

---

**Full Changelog:** [CHANGELOG.md](./CHANGELOG.md)  
**Bug Report:** [BUG_REPORT.md](../../BUG_REPORT.md)  
**Fixes Documentation:** [FIXES_APPLIED.md](../../FIXES_APPLIED.md)

