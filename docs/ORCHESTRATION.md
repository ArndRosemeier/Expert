# Expert — Orchestration Board

**This file is the state of record.** It is true before any report reaches the owner.
A successor session must be able to act within minutes from this file plus
`git -C ~/projects/Expert log --oneline -10` and `git worktree list`.

Last reconciled: 2026-09-21 (by the chief-of-staff session that created this file).

> **Before proposing "let's gate on code duplication", read §Duplication reality below.**
> The metric is the wrong shape and the obvious fix has already been investigated and
> rejected once. That work is not worth redoing.

---

## THE HEAD START — reusing the analysis toolbox on another project

This project now owns a small, portable toolbox at **`tools/`**. If you are an agent
asked to hunt accumulated cruft in **another** repo, do not start from scratch:

```bash
cp -r ~/projects/Expert/tools /path/to/other-project/
cd /path/to/other-project
node --test "tools/**/*.test.mjs"        # must pass before anything else
node tools/duplicate-candidates/find-duplicate-candidates.mjs --src <source-root>
```

Then read **`tools/README.md`** — it carries the folder's own rules (the contract that
travels with it) and a **numbered 10-step porting checklist** plus the caveats that
will actually bite you: monorepos with several source roots, generated/vendored files
that inflate counts, non-`.ts` sources, and the fact that **JSX/Vue/Svelte need a real
extractor** because this tokenizer does not understand markup blocks.

The tool that exists today: **`tools/duplicate-candidates/`** — finds functions sharing
an exact, normalised, or near-identical NAME across files, i.e. the Type-4 clone
candidates `jscpd` is structurally blind to. Read that folder's README for the tiers,
the `sim` hint, the early-exit prune reasons, and its stated limits.

**What went into building it — reuse these decisions, don't rediscover them:**

- Its first version emitted **12,313** tier-1 pairs of which **9,043 were
  `constructor()`** — 73% noise, and the real finds (`escapeHtml`, `addLogEntry`) sat
  below the default 60-per-tier stdout cap. **A candidate list nobody can read is not
  a working tool.** The fix was a *ubiquitous-name filter*, and the rule that must
  travel with any such filter is in `tools/README.md` rule 4: filtered items must be
  **counted, reported, still written to the report, and recoverable by a flag**.
- After filtering: **867 exact + 12 normalised + 1,842 near**, with **11,446** ignored
  pairs still in the report. `--no-ignore` reproduces the original 12,313 exactly
  (867 + 11,446 = 12,313), which is the test that proves filtering reclassifies
  rather than hides. **Keep that invariant** in any port.
- The body-evidence stage **exits early**: 66.2% of comparisons are ruled out by size
  *without the bodies ever being tokenised*, plus disjoint-prune and early-confirm
  paths. Counters are printed as evidence. `tools/README.md` rule 5 requires this.

---

## Duplication reality in this project (why W5 is closed as "wrong metric")

The duplication gate is `jscpd` (`npm run duplication:check`, `.jscpd.json`
`threshold: 5`, `minLines 3`, `minTokens 30`). Measured 2026-09-21 on 208 TS files /
59,999 lines: **274 clones, 2,735 duplicated lines (4.56%), 21,589 duplicated tokens
(4.92%)** — i.e. it currently PASSES with essentially no headroom.

**`jscpd` is token-based, so it finds Type-1/2 clones and cannot find Type-4**
(same purpose, independently written). Concretely, it reported this codebase as clean
while `addLogEntry()` sat at ~0.90 similarity in `AILogService.ts` and
`ErrorLogService.ts`, and `escapeHtml`/`escapeXml` were duplicated across ~8 files.
**The 258-line clone it does flag is the easy, visible kind; the dangerous drift is
the kind it cannot see.** A percentage threshold also gets *easier* as unrelated code
is added and *harder* when dead code is deleted, so it is not a stable gate.

**Decision: W5 stays ADVISORY (`continue-on-error: true` is deliberate).** Enforcing
it at 5% was measured and rejected: there is ~0.08pp of margin, so any normal commit
could turn CI red over a pre-existing condition — reintroducing exactly the
untrustworthy-red-CI problem this session spent its time fixing. Options if the owner
ever revisits: raise the threshold with real headroom then enforce, or replace the
percentage with a "no NEW clones vs a baseline" check (a script, not a config flag).

---

## The contract

- **One writer per file.** At most TWO writers in flight, each in its OWN worktree,
  each briefed with ABSOLUTE paths. A shared file means SERIALIZE.
- **The dispatcher does not implement while a writer can.** The dispatcher verifies.
- **Every landing is verified by the dispatcher**, not by the writer's report: the
  commit on the remote, the dispatcher's OWN gate run, raw output kept.
- **A discovery lands on this board before it is reported.**
- **A worker's partial work is COMMITTED on its branch**, never left uncommitted.
- **A silent worker is salvage-checked** (branch log + worktree status) before any
  deletion. Its worktree AND branch are retired together.
- **A red gate is fixed forward immediately**, before any other change lands.

## The gate

ONE command. Run it; do not invent another.

```bash
bash scripts/gate.sh          # full: typecheck + lint + build (staging)
bash scripts/gate.sh --cheap  # typed+lint only
```

Exit codes — quote them exactly, never inflate them:

| Code | Meaning |
|-----|---------|
| `0` | fully verified — the requested tier ran and passed |
| `1` | failed — the tier ran and FAILED (read the raw log) |
| `2` | cheap tier only — typecheck+lint passed, the expensive tier did **not** run |
| `3` | refused, **VOID** — another expensive check holds the lock; not a failure, not evidence |

The gate takes an atomic `mkdir` lock at `/tmp/expert-gate.lock`. A refusal is the
lock **working**. Logs: `/tmp/expert-gate-logs/`.

The gate builds to a **staging directory**, never to `dist/`, because `dist/` is the
live symlink target. **The gate must not deploy.**

**Never pipe the gate through `tail`/`head`** — the pipeline's exit status becomes the
last command's, so a failure reads as success.

---

## Host facts a successor needs immediately

| Fact | Value |
|---|---|
| Repo | `/home/administrator/projects/Expert` (own `.git`, not the `~/projects` marker repo) |
| Branch | `master`; remote `origin` = `https://github.com/ArndRosemeier/Expert.git` |
| **Package manager** | **npm** (`package-lock.json`). pnpm misresolves this project. |
| **TypeScript in the lockfile** | **5.8.3** — verify against THIS, not the ambient install |
| Live URL (default) | `https://apps.futuremagic.de/expert/` |
| Live artifact | symlink `~/apps/expert` → `/home/administrator/projects/Expert/dist` |
| Old deploy | `deploy-clean.ps1` (PowerShell + FTP → `futuremagic.de/Expert/`), Windows-only, still valid |
| CI | `.github/workflows/ci.yml`, `code-quality.yml` — green as of `2a51071` |

**THE TRAP:** `dist/` is the live deploy (symlinked). Any `npm run build` or
`build:domainfactory` overwrites it with a base-`/Expert/` bundle and **takes the live
site down** — silently, with no error, just a blank page. After any such build, run
`npm run build:apps` to restore. Work item W1 fixes this properly.

**THE OTHER TRAP:** this project's `node_modules` resolves TypeScript **5.9.x** if you
install with pnpm, but CI and the lockfile use **5.8.3**. `Element.textContent` is
`string | null` in 5.8 but not in 5.9, so a change can pass locally and fail in CI.
Always `npm ci` (lockfile-exact) before trusting a local gate run.

---

## Owner decisions (standing — do not re-litigate)

- **2026-09-21 — Cleanup is pre-approved.** Unused/unreachable code may be deleted;
  git is the safety net.
- **2026-09-21 — TESTS: only for NEW work.** This app is mature. Do **not** retrofit
  tests onto existing behaviour. When adding new features or fixing new bugs, a test is
  expected. Recorded because it changes what "done" means for future briefs.
- **2026-09-21 — Windows is a FALLBACK, not a supported primary path.** The owner's main
  environment is now this Linux host + `apps.futuremagic.de`. The FTP/PowerShell path
  stays working but is not worth verification effort; do not spend writer time on it.

## Board

| ID | Item | State | Owner |
|----|------|-------|-------|
| W1 | Builds clobbered the live `dist/` symlink target | **DONE** — `264ed7e` via `wt-w1`, merged `e84397d`, pushed | — |
| W4 | Dead code: 6 unreachable files, 1,370 lines | **DONE** — `fba05df`, pushed; app render-verified after | — |
| W6 | `npm run deadcode:*` scripts failed (`tsr` undeclared) | **DONE** — scripts and all doc references removed | — |
| W2 | No test runner / no `test` script | **POLICY SET** — tests for new work only (above); no framework added | — |
| W3 | Windows build unverified after the dependency change | **DEMOTED** — fallback path, not worth verification effort | — |
| W5 | Duplication gate is advisory; percentage metric is the wrong shape | **CLOSED (decision)** — see §Duplication reality above; do not re-propose enforcing it | — |
| W7 | `tools/` portable analysis toolbox; duplicate-candidate finder | **DONE** — `ad7e208`+`c0801ec` via `wt-dupcand`, merged `322f464`, pushed | — |
| W8 | Type-4 audit + deduplication | **IN PROGRESS** — 4 landings (`63e76f8`, `ff27bdc`, `8518de2`, `f5df9cf`); 258-line block classified NOT a duplicate; escape variants DECIDED to stay | — |
| W10 | Attribute injection: quote-blind `escapeHtml` in 12 attribute positions | **DONE** — `af8b6c4`, grep-verified zero remaining | — |
| W9 | Testing policy for changed vs untouched code | **RESOLVED** — owner rule in `AGENTS.md` | — |

### W8 — Type-4 audit and deduplication (IN PROGRESS)

`npm run dup:candidates` produces the shortlist. **Three landings done 2026-09-21:**

| Landing | Pattern | What | Commit |
|---|---|---|---|
| regex escaping | literal copy | `PromptExpansionService.escapeRegex` removed; 6 call sites use shared `escapeRegExp` | `63e76f8` |
| DOM `escapeHtml` | literal copy | **9** byte-identical private copies removed; 50 call sites import `modal-utils` | `ff27bdc` |
| `addLogEntry` | **parameterized** | one shared helper for both log services; `initInsideTry` + `logEntryOnFailure` reproduce each service's semantics exactly | `8518de2` |

`src/logPersistence.ts` is the shared helper and ships with **10 app tests** (the first
tests for `src/`). The test earned its keep immediately: the first version only
initialized inside the try branch, silently dropping initialization for the AI path —
the test failed and caught it before commit. A green gate would not have.

**Test harness for `src/` now exists**: `tools/app-tests/load-ts.mjs` transpiles a `.ts`
file in memory with the esbuild Vite already installs, so **no new dependency**.
`npm test` runs `tools/**` and `src/**` test files. App tests remain only where the
owner rule requires them — this is not a push toward full coverage.

#### ⚠ THE ESCAPE MAP — read this before merging any escape helper

**This codebase has ~24 escape implementations hiding 7 distinct behaviours.** The
names are shared across incompatible implementations, so merging by name alone WILL
silently change escaping. Verified classification:

| Count | Behaviour | Examples |
|---|---|---|
| 11 → **9 now merged** | DOM-based (`div.textContent` → `innerHTML`) | the 4 below |
| 2 | DOM + extra pass (`\n`→`<br>`; or a regex pass) | `text-editor-with-highlighting.ts:1170`, `AILogModal.ts:355` |
| 4 | escapes `& < > " '`→**`&#39;`** | `RPGWorldInspector.ts:988`, `RPGView.ts:921`, **`modal-utils.ts:24` (canonical)**, `RPGLiteTransferModal.ts:151` |
| 4 | escapes `& < > "` (**no apostrophe**) | `NodeStatisticsModal.ts:13`, `WorkingEpubGenerator.ts:44`, `WorldRpgView.ts:60`, `worldRpgTextRenderer.ts:14` |
| 2 | escapes `& < > " '`→**`&apos;`** | `RPGContextBuilder.ts:364` (escapeXml), `WorkingEpubGenerator.ts:35` (escapeXml) |
| 2 | escapes `& < >` only (**no quotes**) | `GuidedReviewModal.ts:847`, `XMLStoryModal.ts:2739` |
| 1 | escapes `& < " '`→`&#39;` + DOM | `AILogModal.ts:355` |

**19 escape-function definitions remain** (28 before). They are NOT interchangeable:
adding `'` or `"` escaping where it is absent changes output, and `&apos;` vs `&#39;`
is a real difference in older HTML parsers. **Deciding the canonical form is an owner
policy call, not a mechanical extraction.** The obvious direction — one `escapeHtml`
and one `escapeHtmlAttribute` in `modal-utils.ts` — has to be chosen deliberately.

Still open from the shortlist: the 258-line block between
`idea-board/ui/TransformModal.ts` and `ui/modals/ManualModal.ts` (found by `jscpd`, not
by name) — the next candidate, and large enough that the parameterize rule is the
right tool if it proves to be an almost-duplicate rather than a literal one.

### W8 result: the 258-line "clone" is NOT a duplicate (classified 2026-09-21)

`jscpd` reports a 258-line clone between `idea-board/ui/TransformModal.ts` and
`ui/modals/ManualModal.ts`. It was examined properly and is a **false positive of the
percentage metric**, not duplicated logic:

- the match carries only **127 tokens** across 258 lines; my own token analysis finds a
  longest contiguous common run of just **45** tokens
- only **3 of 222** four-line shingles of one side appear in the other; **4%** of lines
  sit inside an identical run
- the "48% verbatim lines" figure is dominated by lines like `});` and `// Add styles`
- **0 shared CSS class selectors** between the two files, and only 35 shared CSS
  declarations (Jaccard 0.17), all generic design tokens (`border-radius: 6px`,
  `display: flex`, `#f8fafc`)

**Conclusion: two independently written modals that share house style.** Nothing to
extract without inventing an abstraction they do not have in common. Left alone
deliberately, per the dedup rule's final clause.

### W10 — attribute injection in 12 positions (DONE)

Found by auditing for the pattern fixed in `f5df9cf`. `escapeHtml()` (DOM-based) escapes
only `& < >`, **not quotes** — verified against real Chrome. Using it to build an HTML
**attribute** lets a value containing `"` break out and inject markup. Sites still using
it inside `value="..."` / `title="..."` / `data-*="..."`:

| File | Count |
|---|---|
| `rpg/ui/RPGWorldInspector.ts` | 9 |
| `ui/modals/NodeInspectorModal.ts` | 2 |
| `ui/components/RatingsRenderer.ts` | 1 |

The fix is mechanical: use `escapeHtmlAttribute` (escapes `& < > " '`) for attribute
values; keep `escapeHtml` for text content. `getAttribute` decodes entities, so values
read back are unchanged. **DONE in `af8b6c4`** — all 12 now use `escapeHtmlAttribute`; no attribute-position
`escapeHtml` remains in `src/` (grep-verified). Text-content uses deliberately keep
`escapeHtml`. Gate 0, 41/41 tests, render clean.

Self-inflicted bug caught by the gate in that change: the first pass wrote
`this.escapeHtmlAttribute(...)`, but the helper was imported as a FUNCTION while
`this.escapeHtml` had worked because each class defines that *method*. A controlled
probe reproduced the `TS2339`. Fixed to a bare call.

### W9 — testing policy (RESOLVED by owner rule, 2026-09-21)

Owner's rule, now recorded in `AGENTS.md`: this app is large and mature and has been
**"tested by using it a lot"** — a legitimate strategy that **becomes unreliable the
moment you change the thing being relied on**. Therefore:

- do **not** retrofit tests onto existing code (converting this app to a fully tested
  one is explicitly out of scope);
- **do** test code you **add**;
- **do** test code you **change**, because "tested by using it" no longer holds for it;
- **byte-identical refactors are the documented exception** — gate + render check, with
  the evidence that the bodies were identical stated explicitly;
- a behaviour-changing change with nowhere to put a test is a **blocker to raise**.

Fact that still stands: `npm test` runs `tools/**/*.test.mjs` only; **`src/` has no test
runner**. Under the rule that is fine for byte-identical work and a blocker for
behaviour-changing work in `src/` until a runner is added. Anyone taking on such a
change must surface that rather than skip it.

### W8 (continued) — escape variants decision: LEAVE THEM

Owner asked whether the remaining escape variants matter, "probably not". Evidence
gathered and it agrees:

- The two `&apos;` variants are **`escapeXml`, and they feed XML/XHTML** —
  `WorkingEpubGenerator.ts` emits `<?xml version="1.0"?>` for the EPUB container and
  OPF; `&apos;` is the correct entity there. `RPGContextBuilder.ts` feeds RPG
  context markup. **Merging these into the HTML helper would be a real regression.**
- The `&<>"` and `&<>` variants are existing, working behaviour in
  `NodeStatisticsModal`, `WorldRpgView`, `WorldRpgTextRenderer`, `XMLStoryModal`,
  `GuidedReviewModal`.

**Decision: the remaining 19 definitions stay as they are.** Unifying them is
behaviour-changing work across call-site-heavy files, with EPUB/XML regression risk and
little benefit, and this app is verified by use. Recorded in `AGENTS.md` too, so nobody
re-litigates it.

### W5 — why this was NOT flipped to enforcing

`.github/workflows/code-quality.yml` runs `npm run duplication:check` with
`continue-on-error: true`, so duplication cannot fail CI. Removing that flag is a
one-word change — but it was measured first, and **the gate would be enforcing at
4.92% duplicated lines against a 5% threshold in `.jscpd.json`.** That is 274 clones
with roughly 0.08 percentage points of headroom: any normal commit could turn CI red
for a pre-existing condition, which is exactly the failure mode that made CI
distrusted in the first place. Enforcing a threshold the codebase already sits on top
of converts a useful signal into noise.

Options for the owner: (a) raise the threshold to give real headroom (e.g. 7–8%) and
then enforce; (b) enforce at 5% and accept a red gate until duplication is actually
reduced; (c) leave it advisory. **Recommended: (a).** Not decided.

### W1 — make the build scripts safe (DONE)

Landed as `264ed7e` on branch `wt-w1`, verified and merged to `master` as `e84397d`
(merge commit), pushed. Fix: one Vite mode → one `outDir` inside the existing
`defineConfig(({ mode }) => ...)`; only `apps` may write `dist/`, and an unknown mode
gets `dist-<mode>` so nothing can ever fall back to the live directory. `deploy-clean.ps1`
now reads `dist-domainfactory`, and `deploy`/`deploy:github` pass `-d dist-github` to
`gh-pages` so they no longer publish the live bundle.

**Dispatcher verification (not the writer's word):**
- merge commit `e84397d` — own gate run → exit 0
- **own injection**: `npm run build:domainfactory` on the merged tree left
  `dist/index.html` **byte-identical including mtime**
  (`fcb5160c…a203aa`, `main-2ZoN8fJL.js`, 14:07:30.296) while writing
  `dist-domainfactory/` with base `/Expert/`. Live site still HTTP 200.
- Before this change, that same command silently replaced the live bundle.

Follow-up fixed in the same landing window: `deploy-clean.ps1` still listed
`keys.html` as critical, a file that no longer exists anywhere — that `throw` would
have aborted **every** Windows deploy. Removed in `e898420`. The line predated the
key-mechanism removal, but that removal (`2a51071`) is what made it unsatisfiable, so
it was fixed forward rather than filed.

### W2 — no behavioural safety net (BLOCKED, owner decision)

There is **no test runner** and **no `test` script**; no vitest/jest/playwright in
`devDependencies`. Every green gate so far proves types, style and that a bundle is
produced — **nothing proves the app behaves**. The headless-Chrome render check used
earlier in this project is a manual technique, not a committed test. Adding a framework
is a real decision (deps, conventions, CI time), so it goes to the owner.

### W3 — unverified Windows build (BLOCKED, owner-only)

`2a51071` removed `lightningcss` and `lightningcss-win32-x64-msvc` from root
`dependencies` to unbreak Linux/macOS/CI installs. That fix was verified on Linux only.
Nobody has run the Windows build since. The owner builds and deploys on Windows.
**The dispatcher cannot verify this from this host** — do not claim it is fine.

### W4 — dead-code backlog (BLOCKED, owner decision)

Two dead artifacts were already found and removed by hand this session
(`src/keys/keys-ui.ts.broken`, `public/keys.html.backup`), which suggests more exist.

**PROBE ALREADY RUN (2026-09-21) — evidence, not a guess:**

`npm run deadcode:check` does NOT work: `tsr` is not in `node_modules` and `npx`
refuses to install it non-interactively, so that script fails in a clean checkout.
(Part of W4: install `tsr` as a devDependency, or delete the three `deadcode:*`
scripts.) The probe was therefore done with a read-only import-graph walk from the
`src/main.ts` entry, cross-checked by grepping every basename as a string.

**6 files (~1,370 lines) are unreachable from the app entry point and referenced
nowhere in `src/`:**

| File | Lines |
|---|---|
| `src/ui/rpg/RPGMockView.ts` | 765 |
| `src/rpg/ui/RPGSnapshotManager.ts` | 228 |
| `src/ui/utils/DOMUtils.ts` | 162 |
| `src/ui/components/text-editor-utils.ts` | 102 |
| `src/ui/components/TextTransformUtils.ts` | 95 |
| `src/types/ContextRatingTypes.ts` | 18 |

Confidence: HIGH but not absolute. All dynamic `import()` sites were checked and
resolve to reachable modules; no dynamic import names any of the six. The caveat is
that this is static analysis plus string search, so a file reached only by a
runtime-constructed specifier or retained deliberately as scaffolding would be
misreported. **Deleting scaffolding is a human call, so this goes to the owner before
any writer acts.** Note that `RPGMockView.ts` carried one of the 82 lint errors fixed
in `d00e75a` — a "fix" that was wasted effort if the file is in fact dead.

### W5 — duplication gate has no teeth (READY, low priority)

`.github/workflows/code-quality.yml` runs `npm run duplication:check` with
`continue-on-error: true`, so a duplication regression cannot fail CI. The `.jscpd.json`
threshold is 5%.

---

## Discovery log

- **2026-09-21** — Gate machinery (`scripts/gate.sh`) created and verified: cheap tier
  → exit 2, held lock → exit 3, full tier → exit 0 in ~30s. It stages the build; it does
  not deploy.
- **2026-09-21** — Component: **no test runner exists**. Recorded as W2.
- **2026-09-21** — `dist/` is the live symlink target and is clobbered by every non-apps
  build. Recorded as W1.
- **2026-09-21** — pnpm vs npm TypeScript skew (5.9.x vs 5.8.3) caused a CI failure
  after a locally-green lint sweep. Recorded above as a host fact.
- **2026-09-21** — `deadcode:check` is broken in a clean checkout: `tsr` is not a
  declared dependency. Recorded under W4.
- **2026-09-21** — W4 probe: 6 unreachable files, ~1,370 lines. Owner decision before
  deletion. Recorded under W4.
- **2026-09-21** — **W1 landed and verified.** Writer `wt-w1` commit `264ed7e`, merged
  as `e84397d`. Dispatcher re-ran the gate (exit 0) and re-ran the injection itself:
  `build:domainfactory` left the live `dist/index.html` byte-identical *including
  mtime*, and wrote `dist-domainfactory/` instead. Worker branch and worktree retired
  after verification.
- **2026-09-21** — Found while verifying W1: `deploy-clean.ps1` demanded the deleted
  `keys.html`, which would have aborted **every** Windows deploy at the verification
  step. Fixed forward as `e898420` (my own `2a51071` is what made the check
  unsatisfiable, so filing it as someone else's would have been wrong).
- **2026-09-21** — **W7 landed.** Portable `tools/` toolbox + `npm test`. First W7
  version was verified working (236 files, 3389 declarations, 14167 candidate pairs,
  66.2% of body comparisons pruned by size without tokenising) but emitted 12,313
  tier-1 pairs of which 9,043 were `constructor()`. Sent back for a ubiquitous-name
  filter; `c0801ec` cut the default view to 867+12+1,842 while keeping all 11,446
  ignored pairs counted and in the report. Dispatcher verified independently:
  `npm test` 20/20, own gate exit 0, and kept 2,721 + ignored 11,446 = 14,167 =
  the `--no-ignore` total (the invariant that proves nothing is hidden).
- **2026-09-21** — **W5 closed as "wrong metric", not "too strict".** `jscpd` reports
  this codebase clean while `addLogEntry()` sits at ~0.90 similarity across two log
  services: it cannot see Type-4 clones at all, and its percentage threshold drifts
  with codebase size. Full reasoning in §Duplication reality.

## Recovery pointers

- Built and verified this session, all pushed and on `origin/master`: `19a6356`
  (repo cleanup), `98109ed` (Linux install fix + apps deploy mode + CI action bumps),
  `d00e75a` (82 lint errors), `32a4135` (restore null guards for TS 5.8.3),
  `2a51071` (remove the access-key mechanism), `436ae52` (gate.sh + this board),
  `e84397d`/`264ed7e` (W1 build isolation), `e898420` (keys.html deploy fix),
  `fba05df` (W4 dead files), `1834c07` (W6 deadcode scripts), `322f464` (W7 the
  `tools/` toolbox, via `ad7e208`+`c0801ec`).
- `npm test` now exists (W7) and runs `node --test "tools/**/*.test.mjs"`. There is
  still **no test runner for the app itself** — see the owner policy above.
- To redeploy after ANY rebuild: `npm run build:apps` (base `/expert/`), then verify
  `curl -s -o /dev/null -w '%{http_code}' https://apps.futuremagic.de/expert/` → 200.
- A stronger check than HTTP 200: headless Chrome `--dump-dom` and confirm the app UI
  mounted (a wrong base path returns 200 with a blank page).
- `npm run dup:candidates` regenerates `reports/duplicate-candidates.md` (git-ignored,
  ~1.9 MB because ignored pairs are retained). That report is the durable artifact.
