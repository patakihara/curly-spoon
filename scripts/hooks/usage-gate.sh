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

# Stated explicitly rather than inherited from the guard's CLI default: the
# ceiling is a decision, and leaving it implicit means a change to that default
# silently moves it. The user set 90.
CEILING="${AURALIS_USAGE_CEILING:-0.90}"
WARN_AT="${AURALIS_USAGE_WARN:-0.85}"

report="$(python3 "$GUARD" --threshold "$CEILING" 2>/dev/null)"
status=$?

# 1 means over the ceiling. 0 means under. Anything else could not measure.
[ "$status" -eq 0 ] || [ "$status" -eq 1 ] || allow

# The warning band exists because the hard stop blocks the tools needed to stop
# *well*. Past the ceiling every call is denied — including the Bash and Edit
# calls required to commit, push, or write state into docs/HANDOVER.md. A
# session gated mid-task therefore cannot record what it was doing, and the
# fresh session that replaces it starts blind. So there is a band below the
# ceiling where work is still permitted but the session is told, on every tool
# call, to land what it has now. Losing an hour of uncommitted work to a limit
# is a worse outcome than stopping a few minutes early.
warn=0
if [ "$status" -eq 0 ]; then
  warn="$(python3 "$GUARD" --threshold "$WARN_AT" >/dev/null 2>&1 || echo 1)"
  [ "$warn" = "1" ] || warn=0
fi

# The bar is stripped, not merely cosmetic waste: measured against the token
# counter it is 21 of the 53 tokens in each injected report, and injected
# context is re-read on every later turn, so it is paid hundreds of times over a
# session. It carries no information the adjacent percentage does not, and the
# only reader here is a model. The terminal output keeps its bars — the guard is
# untouched; this strips them on the way into context.
windows="$(printf '%s\n' "$report" | grep -E '^(Session|Weekly) {2,}' | sed -E 's/\[[^]]*\] +//')"
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
elif mode == "warn":
    # Said in full the first time, tersely afterwards. The warning repeats on
    # every tool call in the band, and each injection accumulates in context and
    # is re-read on every later turn — so the full text, at 107 tokens, would
    # add tens of thousands of tokens across a busy band, inflating context at
    # exactly the moment the budget is tightest. The instruction only has to
    # land once; after that a nudge is enough to keep it in view.
    out = {
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": (
                f"Plan usage — approaching the ceiling:\n{windows}\n"
                "Hand off NOW, in this order:\n"
                "1. Update docs/HANDOVER.md: what you were doing, what is half-finished "
                "and in which files, and the exact next step. Whatever replaces you is a "
                "FRESH session with no memory of this one — it reads only what is on "
                "disk, so anything you do not write down is lost.\n"
                "2. Commit and push.\n"
                "Past the ceiling every tool call is blocked, including these. "
                "Start nothing new."
            ),
        }
    }
elif mode == "warn-again":
    out = {
        "hookSpecificOutput": {
            "hookEventName": event,
            "additionalContext": (
                f"{windows}\nStill in the hand-off band: HANDOVER.md, then commit and push."
            ),
        }
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

# In the warning band, speak on every call rather than on the throttle. The
# throttle exists to keep a routine status line from being repeated; this is not
# routine, and a session that sees it once at the start of a long turn may be
# fifty tool calls past it by the time the ceiling lands.
#
# The full instruction lands once; after that it is a one-line nudge, because
# every injection accumulates in context and is re-read on every later turn.
WARN_STAMP="${XDG_CACHE_HOME:-$HOME/.cache}/auralis-usage-warned"
if [ "$warn" = "1" ]; then
  if [ -f "$WARN_STAMP" ]; then
    emit warn-again
  else
    mkdir -p "$(dirname "$WARN_STAMP")" 2>/dev/null
    : >"$WARN_STAMP" 2>/dev/null
    emit warn
  fi
  exit 0
fi

# Below the band: clear the marker, so a window that resets and climbs again
# gets the full instruction rather than a nudge referring to something this
# session never saw.
rm -f "$WARN_STAMP" 2>/dev/null

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
