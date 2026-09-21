# Expert — Orchestration Board

**This file is the state of record.** It is true before any report reaches the owner.
A successor session must be able to act within minutes from this file plus
`git -C ~/projects/Expert log --oneline -10` and `git worktree list`.

Last reconciled: 2026-09-21 (by the chief-of-staff session that created this file).

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
| W5 | Duplication gate runs `continue-on-error`, never fails CI | **BLOCKED (owner decision)** — see the margin finding below | — |

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

## Recovery pointers

- Built and verified this session, all pushed and on `origin/master`: `19a6356`
  (repo cleanup), `98109ed` (Linux install fix + apps deploy mode + CI action bumps),
  `d00e75a` (82 lint errors), `32a4135` (restore null guards for TS 5.8.3),
  `2a51071` (remove the access-key mechanism).
- To redeploy after ANY rebuild: `npm run build:apps` (base `/expert/`), then verify
  `curl -s -o /dev/null -w '%{http_code}' https://apps.futuremagic.de/expert/` → 200.
- A stronger check than HTTP 200: headless Chrome `--dump-dom` and confirm the app UI
  mounted (a wrong base path returns 200 with a blank page).
