# Code Quality Automation Guide

This guide explains all automated tools available for maintaining code quality in the Expert project.

## 🎯 Quick Start

```bash
# Run everything at once
npm run quality:all

# Or run individual checks
npm run duplication:report    # Generate visual duplication report
npm run typecheck             # Type safety check
npm run lint                  # ESLint analysis
npm run deadcode:check        # Find unused code
```

## 🔍 Duplication Detection (JSCPD)

### What It Does
- Scans all TypeScript files for duplicate code blocks
- Detects patterns like the ones we just fixed (button state management)
- Generates visual HTML reports with side-by-side comparisons

### Available Commands

```bash
# Quick console check
npm run duplication:check

# Full HTML report (RECOMMENDED)
npm run duplication:report
# Then open: jscpd-report/html/index.html

# Detailed analysis (more sensitive)
npm run duplication:detailed
```

### Configuration

The `.jscpd.json` file controls detection sensitivity:

```json
{
  "minLines": 3,        // Minimum duplicate lines to report
  "minTokens": 30,      // Minimum duplicate tokens to report
  "threshold": 5        // Max duplication % before failing
}
```

**Lower values = more sensitive** (finds smaller duplications)

### Current Status

```
Files analyzed: 162 TypeScript files
Clones found: 224
Duplication: 4.34% (within healthy range)
```

## 🔧 ESLint Analysis

### What It Checks
- Type safety violations (`@typescript-eslint/no-explicit-any`)
- Floating promises (`@typescript-eslint/no-floating-promises`)
- Defensive programming patterns that mask errors
- Unused variables and unnecessary conditions

### Commands

```bash
# Check for issues
npm run lint

# Auto-fix what can be fixed
npm run lint:fix

# Both type check AND lint
npm run check-all
npm run fix-all
```

## 🧹 Dead Code Detection (TSR)

### What It Does
- Finds unused exports, functions, and variables
- Traces from entry points (`main.ts`, `keys/index.ts`)
- Helps remove unnecessary code that increases complexity

### Commands

```bash
# Check for dead code
npm run deadcode:check

# Remove dead code (use with caution!)
npm run deadcode:remove
```

## 🤖 Automation Options

### Option 1: Manual Regular Checks

Run weekly or before major commits:
```bash
npm run quality:all
```

### Option 2: Pre-commit Hook (Recommended)

Automatically checks staged files before every commit:
```bash
# Install husky (if not already installed)
npm install --save-dev husky
npx husky install

# The pre-commit hook is already configured in .husky/pre-commit
```

### Option 3: GitHub Actions (CI/CD)

The `.github/workflows/code-quality.yml` runs on every PR:
- Type checking
- Linting
- Duplication analysis
- Generates reports as artifacts

### Option 4: VS Code Integration

Add to `.vscode/settings.json`:
```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["typescript"]
}
```

## 📊 Interpreting Results

### Duplication Report

**Healthy levels:**
- < 5% duplication: Excellent
- 5-10%: Acceptable
- > 10%: Needs refactoring

**Common patterns to look for:**
- Same DOM query repeated (like we just fixed)
- Similar function implementations
- Copy-pasted validation logic
- Repeated error handling

### What to Refactor

**Good candidates for extraction:**
1. Button/UI state management (3+ lines repeated)
2. Validation logic (5+ lines repeated)
3. Error handling patterns (4+ lines repeated)
4. Data transformation logic (10+ lines repeated)

**Not worth extracting:**
1. Very short snippets (1-2 lines)
2. Domain-specific configurations
3. Test setup/teardown (unless extensive)

## 🎨 Best Practices

### Before Refactoring
1. Run `npm run duplication:report`
2. Review HTML report at `jscpd-report/html/index.html`
3. Prioritize by:
   - Number of occurrences (3+ is high priority)
   - Lines of code (10+ lines is high priority)
   - Maintenance burden (frequently changed code)

### During Refactoring
1. Extract to helper methods (like `setComposerButtonsGenerating()`)
2. Use descriptive names that show intent
3. Keep single responsibility principle
4. Add JSDoc comments for public methods

### After Refactoring
1. Run `npm run typecheck` - ensure no type errors
2. Run `npm run lint` - catch any issues
3. Run `npm run duplication:check` - verify improvement
4. Test the functionality

## 🔗 Additional Tools

### For Large-Scale Refactoring

```bash
# Find all instances of a pattern using ripgrep
rg "querySelector\('#rpg-lite-send'\)" src/

# Count occurrences
rg "querySelector\('#rpg-lite-send'\)" -c src/
```

### Measure Improvement

```bash
# Before refactoring
npm run duplication:check > before.txt

# After refactoring  
npm run duplication:check > after.txt

# Compare
diff before.txt after.txt
```

## 📈 Tracking Progress

### Weekly Dashboard
Create a simple tracking file:
```
Week 01: 224 clones, 4.34% duplication
Week 02: 201 clones, 3.89% duplication ↓
Week 03: ...
```

### Monitoring Commands
```bash
# Quick metrics
npm run duplication:check | grep "Total:"

# Full analysis with trends
npm run duplication:report
```

## 🚀 Next Steps

1. ✅ Run `npm run duplication:report` now to see visual report
2. Review the top 10 duplications in the HTML report
3. Prioritize refactoring by impact (lines × occurrences)
4. Set up pre-commit hooks for continuous monitoring
5. Schedule weekly quality checks

## 💡 Tips

- **Start small**: Fix 1-2 duplications per session
- **Test thoroughly**: Duplication removal can introduce bugs
- **Document helpers**: Add JSDoc to extracted functions
- **Be pragmatic**: Not all duplication is bad (sometimes clarity > DRY)

---

**Last Updated:** 2026-02-09
**Current Duplication:** 4.34%
**Target:** < 3%
