#!/usr/bin/env bash
# Expert — the ONE gate command.
#
# Usage:  bash scripts/gate.sh          # full gate (typecheck + lint + build)
#         bash scripts/gate.sh --cheap  # cheap tier only (typecheck + lint)
#
# EXIT CODE VOCABULARY (quoted exactly in every report; never inflated):
#   0 = fully verified      — the requested tier ran and passed
#   1 = failed              — the tier ran and FAILED (see the raw log)
#   2 = cheap tier only     — typecheck+lint passed, the EXPENSIVE tier did NOT run
#                             (either --cheap was requested, or the lock was busy)
#   3 = refused, VOID       — another expensive check holds the lock.
#                             A refusal is the lock WORKING. The run is void:
#                             not a failure, not evidence, nothing to retry.
#
# Why a lock: two observers can look in the same instant and both see "free".
# The refusal must come from the lock itself, not from a glance.
#
# NEVER pipe this through tail/head: the pipeline's exit status becomes the last
# command's, so a failing gate reads as success. Keep the raw log.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOCK="/tmp/expert-gate.lock"
LOG_DIR="/tmp/expert-gate-logs"
TIER="full"
[ "${1:-}" = "--cheap" ] && TIER="cheap"

log() { printf '%s\n' "$*"; }
die() { log "GATE: $*"; exit 1; }

# ---- Preconditions -----------------------------------------------------------
command -v npm >/dev/null 2>&1 || die "npm not found on PATH"
[ -d node_modules ] || die "node_modules missing — run 'npm ci' first (lockfile-exact, tsc 5.8.3)"

# ---- Atomic lock (mkdir is atomic; no TOCTOU window) -------------------------
if ! mkdir "$LOCK" 2>/dev/null; then
  OWNER="$(cat "$LOCK/pid" 2>/dev/null || echo unknown)"
  log "GATE: REFUSED — expensive check already running (pid $OWNER)."
  log "      This run is VOID, not a failure. Exit 3."
  exit 3
fi
echo $$ > "$LOCK/pid"
cleanup() { rm -rf "$LOCK"; }
trap cleanup EXIT INT TERM

mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/$TIER-$STAMP.log"

log "GATE: tier=$TIER  tsc=$(./node_modules/.bin/tsc --version 2>/dev/null | tr -d '\n')"
log "GATE: log=$LOG"

# ---- Cheap tier: typecheck + lint -------------------------------------------
{
  echo "=== npm run typecheck ==="
  npm run typecheck
  echo "typecheck exit: $?"
  echo
  echo "=== npm run lint ==="
  npm run lint
  echo "lint exit: $?"
} >"$LOG" 2>&1

if grep -qE '^typecheck exit: 0$' "$LOG" && grep -qE '^lint exit: 0$' "$LOG"; then
  log "GATE: cheap tier PASSED (typecheck + lint)"
else
  log "GATE: FAILED in the cheap tier. Raw log: $LOG"
  log "      Exit 1."
  exit 1
fi

if [ "$TIER" = "cheap" ]; then
  log "GATE: expensive tier NOT run (--cheap). Exit 2."
  exit 2
fi

# ---- Expensive tier: production build ---------------------------------------
# Build to a STAGING dir, never to dist/. dist/ is the live symlink target
# (~/apps/expert -> dist), so building into it would publish a half-finished
# bundle, and a failing build would take the live app down. The gate must not
# deploy.
STAGE="$(mktemp -d /tmp/expert-gate-build.XXXXXX)"
{
  echo
  echo "=== vite build --mode apps --outDir $STAGE ==="
  ./node_modules/.bin/tsc --noEmit && \
    ./node_modules/.bin/vite build --mode apps --outDir "$STAGE"
  echo "build exit: $?"
} >>"$LOG" 2>&1

BUILD_OK=0
grep -qE '^build exit: 0$' "$LOG" || BUILD_OK=1
# The deploy script's own critical-file contract, checked on the staged output.
MISSING=""
for f in index.html .htaccess pdf.worker.min.mjs manual.html creation-loop.html; do
  [ -e "$STAGE/$f" ] || MISSING="$MISSING $f"
done
{
  echo "staged output: $STAGE"
  echo "missing critical files:${MISSING:- none}"
} >>"$LOG" 2>&1

if [ "$BUILD_OK" = "0" ] && [ -z "$MISSING" ]; then
  rm -rf "$STAGE"
  log "GATE: FULL PASS — typecheck + lint + build all exit 0, staged output complete. Exit 0."
  exit 0
fi

log "GATE: FAILED in the expensive tier (build). Raw log: $LOG"
log "      Staged output kept for inspection: $STAGE"
log "      Exit 1."
exit 1
