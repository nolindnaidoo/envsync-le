# EnvSync-LE Sample Files

Test files for EnvSync-LE's environment file synchronization and comparison features. Use these files to explore sync detection, visual diffs, and template-based comparison.

---

## 📋 Sample Files Overview

| File              | Purpose                 | Keys | Description                             |
| ----------------- | ----------------------- | ---- | --------------------------------------- |
| `.env.example`    | Template/Reference      | 8    | Example template with all required keys |
| `.env`            | Development Environment | 8    | Local development configuration         |
| `.env.local`      | Local Overrides         | 8    | Local machine-specific settings         |
| `.env.production` | Production Environment  | 8    | Production deployment configuration     |

**Total**: 4 files with 8 keys each, demonstrating environment file comparison scenarios

---

## 🚀 Quick Start

### 1. Auto Sync Detection

1. Open any `.env*` file in the `sample/` folder
2. Watch the status bar (bottom right)
3. See sync status indicator:
   - ✅ Green check = All files in sync
   - ⚠️ Warning = Missing or extra keys detected
   - ❌ Error = Parse errors detected

### 2. View Sync Details

1. Click the status bar indicator
2. See detailed sync report showing:
   - Which files are out of sync
   - Missing keys per file
   - Extra keys detected
   - Parse errors (if any)

### 3. Manual Comparison

1. Open Command Palette (`Cmd/Ctrl + Shift + P`)
2. Run **EnvSync-LE: Compare Selected .env Files**
3. Select files to compare
4. View comparison results

### 4. Template Mode

1. Run **EnvSync-LE: Set Template File**
2. Select `.env.example` as template
3. All other files compared against template
4. See which files are missing template keys

---

## 📁 File Details

### .env.example - Template File

**Purpose**: Reference template showing all required environment variables  
**Keys**: 8  
**Description**: Acts as source of truth for required configuration

**Contents**:

```bash
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/myapp
REDIS_URL=redis://localhost:6379
API_KEY=your-api-key-here
SECRET_KEY=your-secret-key-here
PORT=3000
LOG_LEVEL=info
ENABLE_FEATURES=true
```

**Use Case**:

- Set as template for comparison
- New team members copy this file
- CI/CD validation reference

---

### .env - Development Environment

**Purpose**: Local development configuration  
**Keys**: 8  
**Description**: Actual values for local development

**Contents**:

```bash
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379
API_KEY=dev-api-key-12345
SECRET_KEY=dev-secret-key-67890
PORT=3000
LOG_LEVEL=debug
ENABLE_FEATURES=true
```

**Differences from template**:

- `DATABASE_URL`: Has `_dev` suffix
- `API_KEY`: Real development key
- `SECRET_KEY`: Real development secret
- `LOG_LEVEL`: More verbose (debug vs info)

---

### .env.local - Local Overrides

**Purpose**: Machine-specific overrides  
**Keys**: 8  
**Description**: Personal local settings that override defaults

**Contents**:

```bash
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/myapp_local
REDIS_URL=redis://localhost:6379
API_KEY=local-api-key-12345
SECRET_KEY=local-secret-key-67890
PORT=3001
LOG_LEVEL=debug
ENABLE_FEATURES=true
```

**Differences from .env**:

- `DATABASE_URL`: Uses `_local` suffix
- `PORT`: Different port (3001 vs 3000)
- Other values personalized

**Note**: Typically gitignored

---

### .env.production - Production Environment

**Purpose**: Production deployment configuration  
**Keys**: 8  
**Description**: Production-ready values (sanitized for sample)

**Contents**:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://prod-db:5432/myapp
REDIS_URL=redis://prod-redis:6379
API_KEY=prod-api-key-XXXXX
SECRET_KEY=prod-secret-key-XXXXX
PORT=80
LOG_LEVEL=error
ENABLE_FEATURES=true
```

**Differences**:

- `NODE_ENV`: Production mode
- `DATABASE_URL`: Production database host
- `PORT`: Standard HTTP port (80)
- `LOG_LEVEL`: Minimal logging (error only)

---

## ⚙️ Test Scenarios

### Test 1: Auto Sync Detection (Default)

**Goal**: Verify automatic sync detection  
**Settings**: Default (auto mode)  
**Steps**:

1. Open workspace with sample folder
2. Wait for auto-detection
3. Check status bar

**Expected**:

- Status bar shows ✅ (files are in sync)
- Hover shows "4 files in sync"

---

### Test 2: Detect Missing Keys

**Goal**: Test missing key detection  
**Steps**:

1. Open `.env.local`
2. Delete the `API_KEY` line
3. Save file
4. Wait 1 second (debounce)
5. Check status bar

**Expected**:

- Status bar shows ⚠️
- Click to see: ".env.local is missing: API_KEY"

---

### Test 3: Detect Extra Keys

**Goal**: Test extra key detection  
**Steps**:

1. Open `.env`
2. Add new line: `EXTRA_KEY=extra-value`
3. Save file
4. Check status bar

**Expected**:

- Status bar shows ⚠️
- Click to see: ".env has extra key: EXTRA_KEY"

---

### Test 4: Template Mode

**Goal**: Test template-based comparison  
**Settings**: Mode = template  
**Steps**:

1. Run **Set Template File**
2. Select `.env.example`
3. Status bar updates
4. All files compared against template

**Expected**:

- Template icon in status bar
- All files validated against `.env.example`
- Report shows any missing template keys

---

### Test 5: Manual Comparison

**Goal**: Test manual file selection  
**Settings**: Mode = manual  
**Steps**:

1. Change mode to manual: `envsync-le.comparisonMode: "manual"`
2. Run **Compare Selected .env Files**
3. Select `.env` and `.env.production`
4. View comparison

**Expected**:

- Only selected files compared
- Report shows differences between the two

---

### Test 6: Ignore Specific Files

**Goal**: Test file ignoring  
**Steps**:

1. Right-click `.env.local` in explorer
2. Select **EnvSync-LE: Ignore File**
3. Check status bar

**Expected**:

- `.env.local` excluded from sync checks
- Status bar reflects 3 files instead of 4

---

### Test 7: Case Sensitivity

**Goal**: Test case-sensitive key comparison  
**Settings**: `envsync-le.caseSensitive: true` (default)  
**Steps**:

1. Open `.env`
2. Change `PORT` to `port`
3. Save file

**Expected**:

- Detects as different keys
- Status bar shows out-of-sync
- Report shows "missing: PORT, extra: port"

**Alternative**: Set `caseSensitive: false` to treat as same key

---

### Test 8: Comment Handling

**Goal**: Test comment ignoring  
**Settings**: `envsync-le.ignoreComments: true` (default)  
**Steps**:

1. Open `.env.example`
2. Add comment: `# This is a comment`
3. Save file

**Expected**:

- Comments ignored
- No impact on sync status

---

### Test 9: Parse Error Detection

**Goal**: Test malformed .env handling  
**Steps**:

1. Open `.env`
2. Add malformed line: `BROKEN KEY=value`
3. Save file

**Expected**:

- Status bar shows ❌ error
- Click to see parse error details
- Other valid files still compared

---

### Test 10: Debounce Testing

**Goal**: Verify debounce prevents excessive checks  
**Settings**: `envsync-le.debounceMs: 1000` (default)  
**Steps**:

1. Rapidly make multiple edits to `.env`
2. Observe status bar

**Expected**:

- Sync check waits 1 second after last edit
- Prevents check on every keystroke

---

## 🧪 Edge Cases & Advanced Testing

### Edge Case 1: Empty File

**Action**: Create empty `.env.test`  
**Expected**: Treated as file with no keys, compared against others

### Edge Case 2: Duplicate Keys

**Action**: Add duplicate key in `.env`:

```bash
PORT=3000
PORT=4000
```

**Expected**: Parse warning, last value wins

### Edge Case 3: Multiline Values

**Action**: Add multiline value:

```bash
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----"
```

**Expected**: Handled correctly if properly quoted

### Edge Case 4: No .env Files

**Action**: Remove all `.env*` files from workspace  
**Expected**: Extension inactive, no status bar item

### Edge Case 5: Single File Only

**Action**: Only one `.env` file in workspace  
**Expected**: Always shows in-sync (nothing to compare)

### Edge Case 6: Mixed Line Endings

**Action**: Files with CRLF vs LF  
**Expected**: Handled transparently, no impact on comparison

### Edge Case 7: UTF-8 Characters

**Action**: Use unicode in values:

```bash
WELCOME_MESSAGE=¡Bienvenido! 欢迎 مرحبا
```

**Expected**: Parsed correctly, compared accurately

### Edge Case 8: Very Large .env File

**Action**: Create .env with 1000+ keys  
**Expected**: Comparison completes within 1 second

---

## 📊 Performance Benchmarks

### Small Workspace (2-5 files)

- **Detection**: < 100ms
- **Comparison**: < 50ms
- **Status Update**: < 20ms

### Medium Workspace (5-20 files)

- **Detection**: < 300ms
- **Comparison**: < 200ms
- **Status Update**: < 50ms

### Large Workspace (20-100 files)

- **Detection**: < 1 second
- **Comparison**: < 500ms
- **Status Update**: < 100ms

### Monorepo (100+ .env files)

- **Detection**: < 3 seconds
- **Comparison**: < 2 seconds
- **Recommended**: Use `excludePatterns` to filter

---

## 🛠️ Troubleshooting

### Issue: Status Bar Not Showing

**Possible Causes**:

1. No `.env*` files in workspace
2. Status bar disabled in settings
3. Extension not activated

**Solution**:

- Verify `.env*` files exist
- Check: `envsync-le.statusBar.enabled: true`
- Check: `envsync-le.enabled: true`
- Reload VS Code

---

### Issue: Files Not Being Detected

**Possible Causes**:

1. Files excluded by `excludePatterns`
2. Files in ignored folders (node_modules)
3. Watch patterns don't match

**Solution**:

- Check: `envsync-le.watchPatterns` includes your files
- Check: `envsync-le.excludePatterns` doesn't exclude them
- Default pattern is `.env*` which should match all

---

### Issue: False "Out of Sync" Warnings

**Possible Causes**:

1. Case sensitivity setting
2. Comments being compared
3. Extra keys intentional

**Solution**:

- Disable case sensitivity: `envsync-le.caseSensitive: false`
- Ensure: `envsync-le.ignoreComments: true`
- Use ignore feature for intentional differences

---

### Issue: Performance Issues

**Possible Causes**:

1. Too many .env files
2. Debounce too short
3. Large .env files

**Solution**:

- Increase debounce: `envsync-le.debounceMs: 2000`
- Use `excludePatterns` to filter unnecessary files
- Use `temporaryIgnore` for large files

---

## 💡 Best Practices

### 1. Use Template Mode for Teams

```json
{
  "envsync-le.comparisonMode": "template",
  "envsync-le.templateFile": ".env.example"
}
```

✓ Clear source of truth  
✓ Easy onboarding  
✓ Consistent requirements

### 2. Ignore Local Override Files

```json
{
  "envsync-le.excludePatterns": ["**/.env.local"]
}
```

✓ Personal settings don't cause warnings  
✓ Focus on team files

### 3. Enable Case-Insensitive Comparison (Optional)

```json
{
  "envsync-le.caseSensitive": false
}
```

✓ More forgiving  
✓ Prevents case-related issues

### 4. Adjust Debounce for Your Workflow

```json
{
  "envsync-le.debounceMs": 500
}
```

✓ Faster feedback (lower value)  
✓ Less CPU usage (higher value)

### 5. Use Notifications Wisely

```json
{
  "envsync-le.notificationLevel": "important"
}
```

✓ See critical issues only  
✓ Less notification fatigue

---

## 🎯 Recommended Workflows

### For New Team Members

1. Clone repository
2. Copy `.env.example` to `.env`
3. Fill in personal values
4. EnvSync-LE validates you have all required keys
5. Start development confident everything is configured

### For CI/CD Validation

1. Set mode to template
2. Set template to `.env.example`
3. Add CI check to verify `.env.production` has all keys
4. Gate deployments on sync validation

### For Monorepo Management

1. Use `watchPatterns`: `["apps/**/.env*", "packages/**/.env*"]`
2. Set `excludePatterns` for build artifacts
3. Monitor all services' environment files
4. Catch configuration drift early

### For Environment Audits

1. Enable all sync features
2. Run comparison across all environments
3. Document differences
4. Standardize where appropriate
5. Ignore where intentional

---

## 🚀 Next Steps

1. **Test all scenarios** - Try each test case above
2. **Experiment with settings** - Find what works for your team
3. **Integrate into workflow** - Use for onboarding and CI/CD
4. **Report issues** - [Open an issue](https://github.com/nolindnaidoo/envsync-le/issues)
5. **Share feedback** - Rate on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.envsync-le)

---

## 📚 Additional Resources

- **README**: Complete feature documentation
- **CONFIGURATION.md**: Detailed settings guide
- **COMMANDS.md**: All available commands
- **TROUBLESHOOTING.md**: Common issues and solutions

---

**Need Help?** Check [GitHub Issues](https://github.com/nolindnaidoo/envsync-le/issues) or open a new issue.

---

Copyright © 2025 @nolindnaidoo. All rights reserved.
