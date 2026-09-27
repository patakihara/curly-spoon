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
# Every path allows unless the reading positively says over the limit. The
# reading is the whole account's real usage, asked of the same endpoint `/usage`
# uses; it is either right or unavailable, and unavailable must never mean
# blocked.
#
# ## One set of limits
#
# The limits live in one place: budget.py in the claude-shared auralis-autorun
# skill on mediaserver, the same check bin/auralis-autorun makes before it
# starts a session. A session may start only while usage is under them, and
# this gate stops a running session when usage reaches them, so the two can
# never disagree. This script takes budget.py's verdict as it is and has no
# thresholds of its own.
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
# this file (missing python3, an unreadable usage reading) and
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

# Runs a shell command on mediaserver, where the autorun switch and budget.py
# live. AURALIS_MEDIASERVER_LOCAL=1 runs it here instead, which is how the
# tests stub both reads without a network.
on_mediaserver() {
  if [ "${AURALIS_MEDIASERVER_LOCAL:-}" = "1" ]; then
    timeout 20 sh -c "$1"
  else
    timeout 20 ssh -o ConnectTimeout=5 -o BatchMode=yes mediaserver "$1"
  fi
}

# Refreshes a cached mediaserver reading when it is missing or older than 60 s,
# so a busy session makes at most one SSH call a minute per reading. A failed
# read is cached as empty for the same minute, so an unreachable mediaserver
# costs one connect timeout a minute rather than one per tool call.
refresh_cache() {
  # $1 = cache file, $2 = command
  local age
  age=$(( $(date +%s) - $(stat -c %Y "$1" 2>/dev/null || echo 0) ))
  if [ ! -e "$1" ] || [ "$age" -gt 60 ]; then
    mkdir -p "$(dirname "$1")" 2>/dev/null
    on_mediaserver "$2" >"$1.tmp" 2>/dev/null
    mv -f "$1.tmp" "$1" 2>/dev/null
  fi
}

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

# The autorun switch (flipped from any session by the claude-shared auralis-autorun skill; the file
# lives on mediaserver). Only background jobs are affected, never Sofia's own sessions in this repo.
# When it says paused, the job gets a 10-minute grace to land its work, warned on every tool call,
# and after that every tool call is denied; bin/auralis-autorun then stops the session on its next
# tick. Read at most once a minute; unreadable leaves the session alone (the start check in
# bin/auralis-autorun is the part that fails closed).
if [ -n "$JOB_ID" ] && [ "$event" = "PreToolUse" ] && [ "${AURALIS_SWITCH_CHECK:-on}" != "off" ]; then
  switch_cache="${XDG_CACHE_HOME:-${HOME:-}/.cache}/auralis-switch"
  refresh_cache "$switch_cache" "${AURALIS_SWITCH_CMD:-cat .local/state/auralis-autorun/control}"
  if [ "$(head -1 "$switch_cache" 2>/dev/null)" = "paused" ]; then
    paused_at="$(sed -n 's/^at: //p' "$switch_cache" | head -1)"
    paused_for=$(( $(date +%s) - $(date -d "$paused_at" +%s 2>/dev/null || date +%s) ))
    python3 - "$paused_for" <<'PAUSE'
import json, sys
left = 600 - int(sys.argv[1])
if left > 0:
    out = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": (
        "Sofia has paused the Auralis autorun. Land your work now: commit with its Plan: line, push "
        "the branch, and write where you stopped and what is next as the branch description "
        "(git config branch.<branch>.description \"...\"). In about %d minutes every "
        "tool call will be blocked and this session will be stopped." % max(1, left // 60))}}
else:
    out = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
        "permissionDecisionReason": ("Sofia has paused the Auralis autorun. Stop working: do not "
        "retry or route around this. End the turn; the session will be stopped.")},
        "systemMessage": "Auralis autorun paused: tool call blocked."}
print(json.dumps(out))
PAUSE
    exit 0
  fi
fi

command -v python3 >/dev/null 2>&1 || allow

# --- The usage reading: budget.py's one JSON line (see "One set of limits") --
budget_cache="${XDG_CACHE_HOME:-${HOME:-}/.cache}/auralis-budget.json"
refresh_cache "$budget_cache" "${AURALIS_BUDGET_CMD:-python3 .claude-shared/skills/auralis-autorun/budget.py}"

# Line 1: the verdict (ok | warn | over | unknown). Line 2: seconds until the
# moment a stopped session can restart, or empty. The rest: the windows report.
#
# The restart moment mirrors the queue plugin's runner: a 5-hour stop waits for
# the 5-hour reset; a weekly stop, by the hard ceiling or by the time-aware
# share, waits for the weekly reset. The share can clear earlier, but the reset
# is its true upper bound, and bin/auralis-autorun's 10-minute tick re-checks
# in between. Any other reason has no known moment, so no one-shot.
reading="$(python3 - "$budget_cache" <<'PY' 2>/dev/null
import json, sys
from datetime import datetime, timezone

try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("unknown"); raise SystemExit
if not isinstance(d, dict) or d.get("verdict") not in ("ok", "warn", "over"):
    print("unknown"); raise SystemExit
now = datetime.now(timezone.utc)

def seconds_until(raw):
    try:
        return max(0, int((datetime.fromisoformat(raw) - now).total_seconds()))
    except Exception:
        return None

def until(raw):
    s = seconds_until(raw)
    if s is None:
        return ""
    m = s // 60
    if m >= 1440:
        return ", resets in %dd%02dh" % (m // 1440, m % 1440 // 60)
    return ", resets in %dh%02dm" % (m // 60, m % 60)

def pct(v):
    return "%.0f%%" % v if isinstance(v, (int, float)) else "?"

reason = d.get("reason") or ""
key = {"session_ceiling": "five_hour_resets_at", "weekly_ceiling": "seven_day_resets_at",
       "weekly_availability": "seven_day_resets_at"}.get(reason)
restart = seconds_until(d.get(key)) if key else None

lines = [
    "5-hour  %s of %s limit%s" % (pct(d.get("five_hour")), pct(d.get("five_hour_ceiling")),
                                  until(d.get("five_hour_resets_at"))),
    "Weekly  %s of %s limit%s" % (pct(d.get("seven_day")), pct(d.get("seven_day_ceiling")),
                                  until(d.get("seven_day_resets_at"))),
]
avail = d.get("availability")
if reason == "weekly_availability":
    lines.append("Weekly share  used up (autonomous work waits for Sofia's share of the week to refill)")
elif d["verdict"] == "warn" and isinstance(avail, (int, float)) and avail < 0.02:
    lines.append("Weekly share  nearly used up (%.1f%% of the week left to spend now)" % (avail * 100))
print(d["verdict"])
print("" if restart is None else restart)
print("\n".join(lines))
PY
)"
verdict="$(printf '%s\n' "$reading" | sed -n 1p)"
restart_seconds="$(printf '%s\n' "$reading" | sed -n 2p)"
windows="$(printf '%s\n' "$reading" | sed -n '3,$p')"

case "$verdict" in
ok | warn | over) : ;;
*) allow ;; # unknown or unreadable: fail open
esac

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
                "1. Get to a clean state and commit your work, with its Plan: line.\n"
                "2. Write where you stopped and what is next as the branch description: "
                "git config branch.<branch>.description \"...\" (or git branch "
                "--edit-description). Say what is half-finished, in which files, and the "
                "exact next step. Whatever replaces you is a FRESH session with no memory "
                "of this one — it reads only the branch, so anything you do not write "
                "down is lost.\n"
                "3. Push the branch.\n"
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
                f"{windows}\nStill in the hand-off band: commit with its Plan: line, "
                f"set the branch description (git config branch.<branch>.description), "
                f"push the branch."
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

# Arms a one-shot systemd --user timer at the restart moment the reading gave
# (restart_seconds, see the reading above), plus a margin. bin/auralis-autorun
# is the literal ExecStart -- not a new command -- so this shares every check
# that script already does (existence, busy, cooldown, the same budget.py
# limits) without a second "should I start" to keep in sync. No network here:
# the moment comes from the reading this call already made.
arm_respawn_timer() {
  local job_id="$1"
  local seconds="$restart_seconds"

  case "$seconds" in
  '' | *[!0-9]*)
    echo "usage-gate: the usage reading gave no restart moment for this stop -- one-shot not armed for $job_id" >&2
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
  # ample room in the 20s budget for the usage reading and git work that
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

if [ "$verdict" = "over" ]; then
  emit deny
  [ -n "$JOB_ID" ] && retire_job "$JOB_ID"
  exit 0
fi

# The warning band (budget.py's "warn": a few points below either limit, or the
# weekly share nearly spent) exists because the hard stop blocks the tools
# needed to stop *well*. Past the limit every call is denied, including the
# Bash and Edit calls required to commit, push, or write the branch
# description, so a session stopped mid-task cannot record what it was doing
# and the fresh session that replaces it starts blind. Losing an hour of
# uncommitted work to a limit is worse than stopping a few minutes early.
#
# In the warning band, speak on every call rather than on the throttle. The
# throttle exists to keep a routine status line from being repeated; this is not
# routine, and a session that sees it once at the start of a long turn may be
# fifty tool calls past it by the time the ceiling lands.
#
# The full instruction lands once; after that it is a one-line nudge, because
# every injection accumulates in context and is re-read on every later turn.
WARN_STAMP="${XDG_CACHE_HOME:-${HOME:-}/.cache}/auralis-usage-warned"
if [ "$verdict" = "warn" ]; then
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
