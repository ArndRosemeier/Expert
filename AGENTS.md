# Expert — project rules

Project-local rules for anyone (human or agent) working in this repository. These
extend, and take precedence over, the user-global rules in `~/.dsh/AGENTS.md` where
they are more specific.

**Start here:** `docs/ORCHESTRATION.md` is the state of record — the gate, the work
board, the host facts, and the head-start notes for porting the `tools/` folder to
another project. Read it before proposing work.

---

## The gate

ONE command. Do not invent another.

```bash
bash scripts/gate.sh          # typecheck + lint + build (staged)
bash scripts/gate.sh --cheap  # typecheck + lint only
```

Exit codes: `0` fully verified · `1` failed · `2` cheap tier only (expensive did NOT
run) · `3` refused, **void** (another check holds the lock). Quote them exactly; never
inflate them. Never pipe the gate through `tail`/`head` — that replaces its exit status
with the last command's. Logs land in `/tmp/expert-gate-logs/`.

The gate **never deploys**: it builds to a staging directory, because `dist/` is the
live symlink target for `https://apps.futuremagic.de/expert/`.

---

## Testing rule (owner-set, 2026-09-21)

This app is large, mature, and has historically been "tested by using it a lot". That
is a legitimate verification strategy — and **it becomes unreliable the moment you
change the thing being relied on**. So:

1. **Do NOT retrofit tests onto existing code.** Converting this app into a fully
   tested one is explicitly out of scope. Untouched code needs no new tests.
2. **Any code you ADD must ship with a test.**
3. **Any code you CHANGE must ship with a test**, because "tested by using it" no
   longer holds for that code once the behaviour it depended on has moved.
4. **Byte-identical refactors are the exception that proves the rule.** Moving or
   sharing code whose behaviour is provably identical (same tokens, same semantics) is
   verified by the gate plus a render check rather than by new tests. Say so explicitly
   when you claim it, and show the evidence that the bodies were identical.
5. If a change is behaviour-changing and there is nowhere to put a test, that is a
   **blocker to raise**, not something to quietly skip.

`npm test` currently runs `node --test "tools/**/*.test.mjs"` — the portable tooling
suite under `tools/`, which is dependency-free and fully tested. **`src/` still has no
test runner.** Until it does, rule 3 means a behaviour-changing change to `src/` needs
one to be stood up first (a dependency decision) — flag it, don't hand-wave past it.

---

## Deployment

- **Default:** `npm run build:apps` → `dist/` (Vite `base: '/expert/'`) → served at
  `https://apps.futuremagic.de/expert/` via the symlink `~/apps/expert` → `dist/`.
- **Other build modes must never write `dist/`.** Each mode has its own `outDir`
  (`dist-domainfactory`, `dist-github`, `dist-production`). Only `apps` owns `dist/`.
- **The FTP/PowerShell path** (`deploy-clean.ps1` → `futuremagic.de/Expert/`) is a
  **Windows fallback**, not a supported primary path. Do not spend verification effort
  on it.
- **Checking a deploy is not "HTTP 200".** A wrong `base` path returns 200 with a blank
  page. Load the page headlessly and confirm the UI actually mounted:
  `google-chrome --headless --dump-dom <url>`.

---

## Escaping: read before you merge an escape helper

This repo contains **~19 escape-function definitions behind 7 distinct behaviours**,
sharing names across incompatible implementations. Full classification is in
`docs/ORCHESTRATION.md` ("THE ESCAPE MAP"). The short version:

- The two `&apos;` variants are **`escapeXml`, used to generate XML/XHTML** (EPUB
  container/OPF in `WorkingEpubGenerator.ts`). `&apos;` is correct there. **Do not
  merge them into the HTML helpers.**
- Several `escapeHtml` variants escape only `& < >` or `& < > "` — merging them into a
  5-character helper changes their output.
- The canonical HTML helper is `escapeHtml` in `src/ui/modals/core/modal-utils.ts`.
  9 duplicated byte-identical copies were consolidated into it; new code should import
  it rather than define another.

**Decision (2026-09-21): the remaining variants stay as they are.** They are correct in
their own contexts and the app is verified by use; unifying them is behaviour-changing
work with real regression risk (EPUB/XML output) for little benefit.

---

## The tools/ folder

`tools/` holds portable, dependency-free analysis tools with their own rules and a
porting checklist — see `tools/README.md`. Current tool:
`npm run dup:candidates` (name-based Type-4 duplicate candidates).
