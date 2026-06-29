// Helper to drive eslint-interactive's programmable API for the tiered lint
// debt cleanup. Non-interactive so it can run in CI/agents.
//
// Usage:
//   node scripts/lint-cleanup.mjs summary   -> print per-rule breakdown
//   node scripts/lint-cleanup.mjs autofix   -> scoped `--fix` for SAFE_FIX_RULES
//   node scripts/lint-cleanup.mjs suggest    -> apply first suggestion for SUGGEST_RULES
import { Core } from 'eslint-interactive';

// Tier 1: rules whose autofix is structure-only and behavior-preserving.
// NOTE: no-unnecessary-type-assertion is intentionally excluded -- its autofix
// strips DOM casts (e.g. `as HTMLInputElement`) that the project's stricter
// tsconfig actually needs, breaking the typecheck. It is suppressed in Tier 3.
const SAFE_FIX_RULES = [
  '@typescript-eslint/prefer-optional-chain',
  '@typescript-eslint/no-confusing-void-expression',
  '@typescript-eslint/no-unnecessary-boolean-literal-compare',
  'prefer-const',
  'no-implicit-coercion',
  'no-unused-expressions',
];

// Tier 2: suggestion-only rules we trust to roll out (reviewed afterwards).
const SUGGEST_RULES = [
  '@typescript-eslint/prefer-nullish-coalescing',
];

const pickFirstSuggestion = (suggestions) => suggestions[0] ?? null;

async function main() {
  const mode = process.argv[2];
  const core = new Core({ patterns: ['src'] });
  const results = await core.lint();

  if (mode === 'summary') {
    console.log(core.formatResultSummary(results));
    return;
  }

  if (mode === 'autofix') {
    console.log(`Applying scoped autofix for ${SAFE_FIX_RULES.length} rules...`);
    await core.applyAutoFixes(results, SAFE_FIX_RULES);
    console.log('Done.');
    return;
  }

  if (mode === 'suggest') {
    console.log(`Applying suggestions for: ${SUGGEST_RULES.join(', ')}`);
    await core.applySuggestions(results, SUGGEST_RULES, pickFirstSuggestion);
    console.log('Done.');
    return;
  }

  if (mode === 'locate') {
    const ruleId = process.argv[3];
    if (!ruleId) throw new Error('locate requires a rule id argument');
    for (const result of results) {
      for (const message of result.messages) {
        if (message.ruleId === ruleId) {
          console.log(`${result.filePath}:${message.line}:${message.column}`);
        }
      }
    }
    return;
  }

  throw new Error(`Unknown mode "${mode}". Use: summary | autofix | suggest | locate <ruleId>`);
}

await main();
