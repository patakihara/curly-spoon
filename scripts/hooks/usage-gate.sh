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
#
# ## Retirement, the one deliberate exception to "failing open"
#
# At the hard ceiling, this script writes a durable, job-id-keyed "retired"
# marker (see retire_job() below) so a background job that has already been
# denied once stays denied forever, on every later tool call and prompt, even
# if something later wakes it up (a queued deferred prompt, a stray phone
# message, a resume). This closes the gap a pure usage-percentage re-check
# would leave: usage can read back under the ceiling after a window resets,
# which would otherwise let a retired incumbent act again even though a fresh
# session may already be running in the same checkout.
#
# The retire-marker check below runs BEFORE every other fail-open bail-out in
# this file (missing GUARD, missing python3, an unparseable usage report) and
# INVERTS the philosophy above for this one check only: it denies when it
# cannot determine whether a job is retired, rather than allowing. Placed
# after those bail-outs, it would inherit "allow" on exactly the inputs it
# needs to work, silently un-retiring an incumbent -- the two-orchestrators
# hole this whole mechanism exists to close. Do not "fix" this back to match
# the surrounding fail-open style; that would be the bug, not the fix.
#
# This is scoped tightly: it only ever affects a session with its own
# background-job record under $JOBS_DIR, glob-matched by the payload's own
# session_id. Interactive sessions never have one (verified directly against
# `claude agents --json`: "kind":"interactive" sessions carry no job id,
# "kind":"background" ones do), so "cannot tell whether this is a job at all"
# (no session_id, no python3, no match in the jobs dir) falls through to
# normal gating below -- never denied. Deny-on-unresolvable applies only once
# a real job record has been found and the marker lookup itself then fails
# (an unreadable jobs dir, a malformed state.json, an unreadable retire dir).
# See usage-gate.test.sh for the specific cases this distinguishes.
#
# Never invoke `claude --bg` from this script, under any condition. All
# session-starting stays external, in bin/auralis-autorun -- a successor
# started from inside this same hook would start inside the very usage
# window that just triggered retirement, and die on its own first gated tool
# call. retire_job()'s only actions are: write the marker, arm the one-shot
# respawn timer (bin/auralis-autorun itself is what actually restarts
# anything, invoked later by systemd), attempt worktree pruning, and issue a
# non-blocking courtesy `claude stop`.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GUARD="$PROJECT_DIR/scripts/usage-guard.py"
STAMP="${XDG_CACHE_HOME:-${HOME:-}/.cache}/auralis-usage-report.stamp"
REPORT_EVERY="${AURALIS_USAGE_REPORT_EVERY:-600}"

# Where a background job's own state.json lives (glob-matched by session_id
# to resolve "which job is this", per the header comment above), and where
# this script's own retire markers and the worktree-gc run log live. Both use
# the ${VAR:-${HOME:-}/...} shape deliberately, not ${VAR:-$HOME/...}: under
# `set -u`, the latter only crashes when both the override AND $HOME are
# unset, which is exactly the shape a bare mtime-testing hook elsewhere in
# this repo shipped with (see usage-gate.test.sh's dedicated case for this).
JOBS_DIR="${AURALIS_JOBS_DIR:-${CLAUDE_CONFIG_DIR:-${HOME:-}/.claude}/jobs}"
RESPAWN_STATE_DIR="${AURALIS_RESPAWN_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/auralis-respawn}"
RETIRE_DIR="$RESPAWN_STATE_DIR/retired"

payload="$(cat 2>/dev/null)"

allow() { exit 0; }

# Deny form used only for a retired-or-unresolvable job (see the header
# comment). Independent of emit()/$windows below -- this can fire before
# either is ever computed.
emit_retired() {
  # $1 = event, $2 = human-readable detail for the reason text
  python3 - "$1" "$2" <<'PY'
import json
import sys

event, detail = sys.argv[1], sys.argv[2]
reason = (
    "Plan usage gate: this background job is retired (" + detail + "). "
    "It already reached the plan-usage ceiling once; a fresh session was or "
    "will be started separately once the window reopens. Stop working. Do "
    "not retry this call and do not route around it with a different tool "
    "-- every tool is gated. End the turn."
)
if event == "UserPromptSubmit":
    out = {
        "decision": "block",
        "reason": reason,
        "systemMessage": "This background job is retired -- new work refused.",
    }
else:
    out = {
        "hookSpecificOutput": {
            "hookEventName": event,
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        },
        "systemMessage": "This background job is retired -- tool call blocked.",
    }
print(json.dumps(out))
PY
}

event="$(printf '%s' "$payload" |
  python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("hook_event_name") or "")
except Exception: print("")' 2>/dev/null)"
[ -n "$event" ] || event="${CLAUDE_HOOK_EVENT:-PreToolUse}"

# --- Retire-marker check (see the header comment for why this sits here) ----
retire_check="$(printf '%s' "$payload" | python3 -c '
import glob, json, os, sys

jobs_dir, retire_dir = sys.argv[1], sys.argv[2]

try:
    data = json.load(sys.stdin)
except Exception:
    # The payload itself did not parse as JSON at all -- unlike the
    # missing-session_id case below, this gives us no information to tell a
    # background job apart from an interactive session. Per the plan
    # deny-on-unresolvable rule, this must NOT fall through to "not-a-job":
    # a retired background job whose payload happens to be truncated or
    # corrupted on one call would otherwise slip through ordinary gating on
    # that call, silently un-retiring it. Bounded (see the header comment
    # for the two-cost argument): this is unresolvable, not a proven
    # interactive session, so it denies.
    print("unresolvable")
    raise SystemExit

session_id = data.get("session_id") if isinstance(data, dict) else None

if not isinstance(session_id, str) or not session_id:
    # Valid JSON, just no (usable) session_id key: interactive sessions and
    # any legitimately job-less payload land here, and must fall through to
    # normal gating below -- never denied. Told apart from the branch above
    # specifically because a session with no job record can never
    # accidentally match a retired marker -- see the header comment.
    print("not-a-job")
    raise SystemExit

if not os.path.isdir(jobs_dir) or not os.access(jobs_dir, os.R_OK | os.X_OK):
    # A real session_id, but the jobs directory itself cannot be listed. A
    # bare glob would silently read this the same as "no job found" -- check
    # readability explicitly so this is told apart from the interactive case.
    print("unresolvable")
    raise SystemExit

job_id = None
try:
    for state_path in glob.glob(os.path.join(jobs_dir, "*", "state.json")):
        try:
            with open(state_path) as f:
                state = json.load(f)
        except Exception:
            # One bad neighbour in the jobs dir is not a reason to give up
            # on the rest of it -- keep looking.
            continue
        if state.get("sessionId") == session_id:
            job_id = os.path.basename(os.path.dirname(state_path))
            break
except Exception:
    print("unresolvable")
    raise SystemExit

if job_id is None:
    # session_id present but no job record matches it: the ordinary
    # interactive-session case -- fall through.
    print("not-a-job")
    raise SystemExit

marker = os.path.join(retire_dir, job_id)
try:
    retired = os.path.isfile(marker)
except Exception:
    print("unresolvable")
    raise SystemExit

print(("retired:" if retired else "not-retired:") + job_id)
' "$JOBS_DIR" "$RETIRE_DIR" 2>/dev/null)"

JOB_ID=""
case "$retire_check" in
retired:*)
  emit_retired "$event" "job ${retire_check#retired:} was retired at the plan-usage ceiling"
  exit 0
  ;;
unresolvable)
  emit_retired "$event" "could not determine whether this job is retired"
  exit 0
  ;;
not-retired:*)
  JOB_ID="${retire_check#not-retired:}"
  ;;
*) : ;; # not-a-job, or python3 missing/failed -- both fall through, deliberately
esac

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
                "1. Any subagent spec you wrote but did not launch: save it verbatim to "
                "docs/agent-specs/ and list it in the handover as the next TODO. The spec "
                "is most of the work of delegating; losing it means writing it again.\n"
                "2. Update docs/HANDOVER.md: what you were doing, what is half-finished "
                "and in which files, and the exact next step. Whatever replaces you is a "
                "FRESH session with no memory of this one — it reads only what is on "
                "disk, so anything you do not write down is lost.\n"
                "3. Commit and push.\n"
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
                f"{windows}\nStill in the hand-off band: unlaunched specs to "
                f"docs/agent-specs/, HANDOVER.md, then commit and push."
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

# --- Retirement actions, run once, only at the hard trigger, only for a real
# background job (JOB_ID is empty for interactive sessions -- see the
# retire-marker check above). None of these ever invoke `claude --bg`; see
# the header comment for why that invariant matters.

launch_worktree_gc() {
  local gc_script="${AURALIS_WORKTREE_GC_BIN:-$PROJECT_DIR/scripts/hooks/worktree-gc.sh}"
  [ -x "$gc_script" ] || return 0
  local budget="${AURALIS_WORKTREE_GC_TIMEOUT:-300}"
  # Detached (own session, via setsid) and backgrounded: this hook process is
  # about to exit, and the gc pass must outlive it -- a bare `&` alone can
  # still be reaped by a SIGHUP the parent's process group receives on exit.
  # `timeout` bounds the whole pass so a hung git subprocess inside
  # worktree-gc.sh (which has its own, tighter per-command timeouts) cannot
  # run forever regardless. Never waited on; its outcome is never consulted.
  if command -v setsid >/dev/null 2>&1; then
    (setsid timeout "$budget" "$gc_script" >/dev/null 2>&1 </dev/null &) 2>/dev/null
  else
    (timeout "$budget" "$gc_script" >/dev/null 2>&1 </dev/null &) 2>/dev/null
  fi
}

# Arms a one-shot systemd --user timer at the reset moment of whichever
# window(s) triggered the ceiling (the later of the two, if both are over),
# plus a margin. bin/auralis-autorun is the literal ExecStart -- not a new
# command -- so this shares every check that script already does (existence,
# busy, cooldown, start-ceiling) without a second "should I start" to keep in
# sync. Never blocks on network beyond the (already-cached, just-fetched)
# --json read below.
arm_respawn_timer() {
  local job_id="$1"
  local json
  json="$(python3 "$GUARD" --json --threshold "$CEILING" 2>/dev/null)"
  if [ -z "$json" ]; then
    echo "usage-gate: could not read usage --json to arm the respawn timer for $job_id" >&2
    return 0
  fi

  local seconds
  seconds="$(printf '%s' "$json" | python3 -c '
import json, sys

try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit
if not data.get("available"):
    raise SystemExit

ceiling_pct = float(sys.argv[1]) * 100
windows = data.get("windows") or {}
candidates = []
for key in ("session", "weekly"):
    window = windows.get(key) or {}
    percent = window.get("percent")
    secs = window.get("seconds_until_reset")
    if isinstance(percent, (int, float)) and percent >= ceiling_pct and isinstance(secs, (int, float)):
        candidates.append(secs)

# Whichever window(s) are over: use the LATER reset. Starting after only one
# resets while the other is still over would fail the start-ceiling check
# again for no reason.
if candidates:
    print(int(max(candidates)))
' "$CEILING" 2>/dev/null)"

  case "$seconds" in
  '' | *[!0-9]*)
    echo "usage-gate: usage --json did not report a numeric seconds_until_reset for the over window(s) -- one-shot not armed for $job_id" >&2
    return 0
    ;;
  esac

  local margin="${AURALIS_RESPAWN_MARGIN:-90}"
  local delay=$((seconds + margin))
  local autorun_bin="${AURALIS_AUTORUN_BIN:-${HOME:-}/bin/auralis-autorun}"

  if [ ! -x "$autorun_bin" ]; then
    echo "usage-gate: autorun binary not found/executable at $autorun_bin -- one-shot not armed for $job_id" >&2
    return 0
  fi

  # Whether `systemd-run --user` even works from inside a `claude --bg`
  # process tree is explicitly unverified (plan §2.3 item 5) -- wrong D-Bus
  # session, a permission issue, or it simply hanging are all live
  # possibilities. This call stays SYNCHRONOUS on purpose (unlike the
  # courtesy `claude stop` below and launch_worktree_gc above, both
  # backgrounded) because arming failures must be surfaced on stderr with a
  # real exit code -- but synchronous with no bound means a hang burns this
  # hook's *entire* 20s PreToolUse budget (.claude/settings.json) on every
  # single retirement. `timeout` bounds it the same way every git call in
  # this file and worktree-gc.sh's own pass already are; the default leaves
  # ample room in the 20s budget for the usage-guard reads and git work that
  # happen around this call in the same retire_job() pass. Overridable via
  # env, same naming convention as AURALIS_RESPAWN_MARGIN/AURALIS_SYSTEMD_RUN
  # above.
  local arm_timeout="${AURALIS_RESPAWN_ARM_TIMEOUT:-5}"
  timeout "$arm_timeout" "${AURALIS_SYSTEMD_RUN:-systemd-run}" --user \
    --unit="auralis-respawn-${job_id}" \
    --on-active="${delay}" \
    --description="Restart Auralis autorun after usage window reset (${job_id})" \
    "$autorun_bin" >/dev/null 2>&1
  local arm_rc=$?
  if [ "$arm_rc" -eq 124 ]; then
    echo "usage-gate: systemd-run timed out after ${arm_timeout}s arming the one-shot respawn timer for $job_id (delay ${delay}s) -- treated as a failed arm, not retried" >&2
  elif [ "$arm_rc" -ne 0 ]; then
    echo "usage-gate: systemd-run failed to arm the one-shot respawn timer for $job_id (delay ${delay}s)" >&2
  fi
}

retire_job() {
  local job_id="$1"

  mkdir -p "$RETIRE_DIR" 2>/dev/null
  # Idempotent: writing the same marker twice for the same job id is
  # harmless, and a job that is already retired denies its own next tool
  # call (via the retire-marker check above) before this code can run again.
  : >"$RETIRE_DIR/$job_id" 2>/dev/null

  # Restores the ability to restart at all -- goes first.
  arm_respawn_timer "$job_id"

  # Housekeeping, not load-bearing for anything else here -- see
  # worktree-gc.sh's own header. Backgrounded; its outcome is never
  # consulted by anything in this design.
  launch_worktree_gc

  # Courtesy only (see the plan this implements, section 2.3, and
  # usage-gate.test.sh): never waited on. The retire marker above is what
  # actually stops this job from acting again, regardless of what `claude
  # stop` does under the hood.
  ("${AURALIS_CLAUDE_BIN:-claude}" stop "$job_id" >/dev/null 2>&1 &) 2>/dev/null
}

if [ "$status" -eq 1 ]; then
  emit deny
  [ -n "$JOB_ID" ] && retire_job "$JOB_ID"
  exit 0
fi

# In the warning band, speak on every call rather than on the throttle. The
# throttle exists to keep a routine status line from being repeated; this is not
# routine, and a session that sees it once at the start of a long turn may be
# fifty tool calls past it by the time the ceiling lands.
#
# The full instruction lands once; after that it is a one-line nudge, because
# every injection accumulates in context and is re-read on every later turn.
WARN_STAMP="${XDG_CACHE_HOME:-${HOME:-}/.cache}/auralis-usage-warned"
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

# --- Worktree pruning cadences (see worktree-gc.sh) --------------------------
#
# The hard-trigger cadence already ran inside retire_job above if this call
# denied -- reaching this point means it did not. SessionStart runs
# unconditionally, once per new session -- the fresh successor's own chance
# to clean up what a retiring incumbent's pass could not finish. PreToolUse
# runs on a throttle mirroring REPORT_EVERY's own pattern: this is the
# cadence that rides ordinary work, which is where the real worktree/branch
# backlog was actually found to accumulate (see worktree-gc.sh's own header).
case "$event" in
SessionStart)
  launch_worktree_gc
  ;;
PreToolUse)
  GC_STAMP="${XDG_CACHE_HOME:-${HOME:-}/.cache}/auralis-worktree-gc.stamp"
  GC_EVERY="${AURALIS_WORKTREE_GC_EVERY:-1800}"
  gc_last="$(cat "$GC_STAMP" 2>/dev/null || echo 0)"
  case "$gc_last" in '' | *[!0-9]*) gc_last=0 ;; esac
  gc_now="$(date +%s)"
  if [ $((gc_now - gc_last)) -ge "$GC_EVERY" ]; then
    mkdir -p "$(dirname "$GC_STAMP")" 2>/dev/null
    printf '%s' "$gc_now" >"$GC_STAMP" 2>/dev/null
    launch_worktree_gc
  fi
  ;;
esac

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
