#!/usr/bin/env bash
#
# PreToolUse hook: refuse to spawn a subagent when plan usage is at or over the
# threshold.
#
# Subagents are the single largest consumer of the plan allowance on this
# project, and they are also the least interruptible — once one is running it
# will burn through its task. Blocking at spawn time is therefore the only point
# where a limit can actually be applied.
#
# Reads the PreToolUse payload on stdin (ignored — the decision depends on
# accumulated usage, not on this particular call) and emits a PreToolUse
# permission decision on stdout.
#
# Fails OPEN. If the guard is uncalibrated, missing, or errors, the spawn is
# allowed: a usage guard that blocks work because it cannot measure anything is
# worse than no guard.

set -uo pipefail

cat >/dev/null 2>&1 || true # drain stdin so the caller never blocks on a full pipe

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GUARD="$PROJECT_DIR/scripts/usage-guard.py"

allow() { exit 0; }

[ -x "$GUARD" ] || [ -f "$GUARD" ] || allow
command -v python3 >/dev/null 2>&1 || allow

report="$(python3 "$GUARD" --project "$PROJECT_DIR" 2>/dev/null)"
status=$?

# 0 = under threshold or not calibrated. 2 = bad usage. Anything but 1 allows.
[ "$status" -eq 1 ] || allow

# Collapse the report to the two window lines so the reason stays readable.
detail="$(printf '%s\n' "$report" | grep -E '^(Session|Weekly) {2,}' | tr '\n' ' ')"

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Plan usage guard: at or over the 80% threshold. ${detail}Subagents are the largest consumer of the allowance, so this spawn is blocked. Do the work inline, or re-run /usage and recalibrate with scripts/usage-guard.py if this reading is stale."
  },
  "systemMessage": "Subagent spawn blocked — plan usage at or over 80%."
}
EOF
exit 0
