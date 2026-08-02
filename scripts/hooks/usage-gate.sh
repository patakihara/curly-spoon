#!/usr/bin/env bash
#
# The plan-usage gate. One script, three hook events (see .claude/settings.json).
#
#   SessionStart      report the standing usage into context, once
#   UserPromptSubmit  refuse new instructions past the ceiling
#   PreToolUse (*)    refuse every tool call past the ceiling, and periodically
#                     report where things stand
#
# ## Why the matcher is `*` and not `Agent|Task`
#
# The first version of this gate only matched subagent spawns, on the theory
# that subagents were the expensive thing. They are — but an orchestrating
# session doing the work itself is not free, and it was the single largest
# consumer on this account while being the one thing the gate did not watch. A
# session that cannot call tools cannot spend, so `*` is where the cap actually
# lives. UserPromptSubmit closes the other side: without it you can hand a
# capped session fresh work that it silently cannot carry out.
#
# ## Reporting cadence
#
# There is no timer hook event, so the periodic report rides on PreToolUse and
# throttles itself against a stamp file. That ties the cadence to activity
# rather than wall time, which is the right behaviour — an idle session does not
# need reminding, and a busy one gets told roughly every REPORT_EVERY seconds.
#
# ## Failing open
#
# Every path allows unless the guard positively reports being over the ceiling.
# See scripts/usage-guard.py for why that direction is deliberate.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GUARD="$PROJECT_DIR/scripts/usage-guard.py"
STAMP="${XDG_CACHE_HOME:-$HOME/.cache}/auralis-usage-report.stamp"
REPORT_EVERY="${AURALIS_USAGE_REPORT_EVERY:-600}"

payload="$(cat 2>/dev/null)"

allow() { exit 0; }

event="$(printf '%s' "$payload" |
  python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("hook_event_name") or "")
except Exception: print("")' 2>/dev/null)"
[ -n "$event" ] || event="${CLAUDE_HOOK_EVENT:-PreToolUse}"

[ -f "$GUARD" ] || allow
command -v python3 >/dev/null 2>&1 || allow

report="$(python3 "$GUARD" 2>/dev/null)"
status=$?

# 1 means over the ceiling. 0 means under. Anything else could not measure.
[ "$status" -eq 0 ] || [ "$status" -eq 1 ] || allow

windows="$(printf '%s\n' "$report" | grep -E '^(Session|Weekly) {2,}')"
[ -n "$windows" ] || allow

emit() {
  # $1 = mode: deny | context
  python3 - "$event" "$1" "$windows" <<'PY'
import json
import sys

event, mode, windows = sys.argv[1], sys.argv[2], sys.argv[3]

if mode == "deny":
    reason = (
        "Plan usage gate: at or over the ceiling.\n"
        f"{windows}\n"
        "Stop working. Do not retry this call and do not route around it with a "
        "different tool — every tool is gated. Tell the user where usage stands "
        "and when the window resets, then end the turn."
    )
    if event == "UserPromptSubmit":
        # UserPromptSubmit has no permissionDecision; blocking is the deny form.
        out = {
            "decision": "block",
            "reason": reason,
            "systemMessage": "Plan usage at or over the ceiling — new work refused.",
        }
    else:
        out = {
            "hookSpecificOutput": {
                "hookEventName": event,
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            },
            "systemMessage": "Plan usage at or over the ceiling — tool call blocked.",
        }
else:
    out = {
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": f"Plan usage:\n{windows}",
        }
    }

print(json.dumps(out))
PY
}

if [ "$status" -eq 1 ]; then
  emit deny
  exit 0
fi

# Under the ceiling. Report on SessionStart always, and on other events only
# once per REPORT_EVERY seconds.
now="$(date +%s)"
case "$event" in
SessionStart) due=1 ;;
*)
  last="$(cat "$STAMP" 2>/dev/null || echo 0)"
  case "$last" in
  '' | *[!0-9]*) last=0 ;;
  esac
  due=0
  [ $((now - last)) -ge "$REPORT_EVERY" ] && due=1
  ;;
esac

[ "$due" -eq 1 ] || allow

mkdir -p "$(dirname "$STAMP")" 2>/dev/null
printf '%s' "$now" >"$STAMP" 2>/dev/null
emit context
