#!/usr/bin/env bash
#
# SessionStart hook: put the current plan-usage reading into the session's
# context.
#
# The PreToolUse guard is a stop sign at one specific gate, and with subagents
# paused it may never fire at all. This is the gauge: it tells the session where
# it stands at the moment it can still choose how to spend the window, rather
# than at the moment it is already out of room.
#
# It is also the check that the whole arrangement is wired up. If this reports a
# reading, then this session's working directory is the project root, which is
# the same condition under which .claude/settings.json loaded and the PreToolUse
# hook got registered.
#
# Emits nothing at all when it cannot measure — an empty or noisy preamble in
# every session is worse than no preamble.

set -uo pipefail

cat >/dev/null 2>&1 || true # drain stdin so the caller never blocks on a full pipe

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GUARD="$PROJECT_DIR/scripts/usage-guard.py"

quiet() { exit 0; }

[ -f "$GUARD" ] || quiet
command -v python3 >/dev/null 2>&1 || quiet

report="$(python3 "$GUARD" --project "$PROJECT_DIR" 2>/dev/null)"
status=$?

# 0 = under threshold, 1 = over. Anything else is an error; say nothing.
[ "$status" -eq 0 ] || [ "$status" -eq 1 ] || quiet

# Only the two window lines. The rest of the report is for a human at a
# terminal, and every line here is paid for on every subsequent turn.
windows="$(printf '%s\n' "$report" | grep -E '^(Session|Weekly) {2,}')"
[ -n "$windows" ] || quiet

if [ "$status" -eq 1 ]; then
  note="A window is at or over 80%. Pause substantial work and tell the user, per CLAUDE.md."
else
  note="Under the 80% ceiling. Re-check at each phase boundary."
fi

python3 - "$windows" "$note" <<'PY'
import json
import sys

windows, note = sys.argv[1], sys.argv[2]
context = f"Plan usage for this project (estimate from local transcripts):\n{windows}\n{note}"
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }
}))
PY
