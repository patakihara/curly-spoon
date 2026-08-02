#!/usr/bin/env bash
#
# Auralis server-side agent runner.
#
# Polls the working branch for unanswered requests in ops/requests/, runs Claude
# headlessly against the oldest one, and pushes a report back to ops/reports/.
#
# Deliberately boring: no daemon, no state file, no queue. The presence or absence of a
# report file *is* the state, which means it survives reboots, is inspectable with `ls`,
# and cannot drift out of sync with reality.
#
# Usage:
#   ./ops/auralis-agent.sh --once     run one tick and exit (use this from cron/systemd)
#   ./ops/auralis-agent.sh --dry-run  show what would run, invoke nothing
#   ./ops/auralis-agent.sh --loop     poll forever (for testing; prefer the timer)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/auralis-agent.env"

# ── configuration ────────────────────────────────────────────────────────────
REPO_DIR="${REPO_DIR:-$(cd "$HERE/.." && pwd)}"
BRANCH="${BRANCH:-claude/media-client-app-k7v9by}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
CLAUDE_ARGS="${CLAUDE_ARGS:---permission-mode acceptEdits}"
POLL_SECONDS="${POLL_SECONDS:-600}"
LOCK_FILE="${LOCK_FILE:-/tmp/auralis-agent.lock}"

# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

MODE="${1:---once}"
DRY_RUN=0
[ "$MODE" = "--dry-run" ] && DRY_RUN=1

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() {
  log "ERROR: $*"
  exit 1
}

command -v git >/dev/null 2>&1 || die "git not found"
[ -d "$REPO_DIR/.git" ] || die "REPO_DIR=$REPO_DIR is not a git repository"

# ── one tick ─────────────────────────────────────────────────────────────────
tick() {
  cd "$REPO_DIR"

  log "fetching origin/$BRANCH"
  if ! git fetch --quiet origin "$BRANCH" 2>/dev/null; then
    log "fetch failed (network?); will retry next tick"
    return 0
  fi

  local local_ref remote_ref
  local_ref="$(git rev-parse HEAD 2>/dev/null || echo none)"
  remote_ref="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo none)"

  if [ "$local_ref" != "$remote_ref" ]; then
    log "branch moved: ${local_ref:0:8} -> ${remote_ref:0:8}"
    # The server clone is a consumer, not a place to develop. Any local edits are
    # the agent's own leftovers, so reset rather than merge and risk a conflict
    # that nobody is around to resolve.
    git checkout --quiet "$BRANCH" 2>/dev/null || git checkout --quiet -b "$BRANCH" "origin/$BRANCH"
    git reset --quiet --hard "origin/$BRANCH"
  else
    log "no new commits"
  fi

  # ── find the oldest request without a matching report ──────────────────────
  local request=''
  shopt -s nullglob
  for candidate in "$REPO_DIR"/ops/requests/*.md; do
    local base number
    base="$(basename "$candidate")"
    number="${base%%-*}"
    [ "$base" = "0001-example.md" ] && continue
    # A report answers a request when it shares the leading number.
    if ! compgen -G "$REPO_DIR/ops/reports/${number}-*.md" >/dev/null; then
      request="$candidate"
      break
    fi
  done
  shopt -u nullglob

  if [ -z "$request" ]; then
    log "no unanswered requests"
    return 0
  fi

  log "unanswered request: $(basename "$request")"

  if [ "$DRY_RUN" = "1" ]; then
    log "dry run — would invoke: $CLAUDE_BIN -p … $CLAUDE_ARGS"
    return 0
  fi

  command -v "${CLAUDE_BIN%% *}" >/dev/null 2>&1 || die "CLAUDE_BIN='$CLAUDE_BIN' not found"

  # ── run the agent ──────────────────────────────────────────────────────────
  local prompt
  prompt="$(
    cat <<EOF
Read ops/agent-prompt.md for your standing instructions, then carry out the request in:

  $(realpath --relative-to="$REPO_DIR" "$request")

Work in $REPO_DIR on branch $BRANCH. When you are finished — whether it succeeded, partly
succeeded, or failed — write your report to ops/reports/ using the filename convention in
ops/agent-prompt.md, commit it, and push to origin/$BRANCH.

A failure that is written up clearly is a good outcome. Do not leave the request
unanswered, and do not invent results you did not observe.
EOF
  )"

  log "invoking claude"
  # shellcheck disable=SC2086
  if "$CLAUDE_BIN" -p "$prompt" $CLAUDE_ARGS; then
    log "claude finished"
  else
    log "claude exited non-zero; request stays unanswered and will retry next tick"
  fi
}

# ── entrypoint, with a lock so ticks cannot overlap ───────────────────────────
run_locked() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
      log "another run is in progress; skipping"
      exit 0
    fi
  fi
  tick
}

case "$MODE" in
  --once | --dry-run) run_locked ;;
  --loop)
    while true; do
      run_locked || true
      log "sleeping ${POLL_SECONDS}s"
      sleep "$POLL_SECONDS"
    done
    ;;
  *) die "unknown mode '$MODE' (expected --once, --dry-run or --loop)" ;;
esac
