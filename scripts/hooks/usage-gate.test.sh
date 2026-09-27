#!/usr/bin/env bash
#
# Tests for the plan-usage gate hook.
#
# The contract is entirely about the verdict in budget.py's JSON and the JSON
# the hook emits: "over" denies, "warn" warns, "ok" reports, and every other
# outcome must allow. The fail-open paths are the ones worth pinning, because
# when they break they break silently in the safe-looking direction — a gate
# that denies everything looks like a working gate right up until it blocks
# real work.
#
# Each case points AURALIS_BUDGET_CMD at a stub that prints a chosen budget.py
# line, run locally (AURALIS_MEDIASERVER_LOCAL=1) instead of over SSH, so
# nothing here touches mediaserver, the real credentials or the real endpoint.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/usage-gate.sh"
# Offline and deterministic: both mediaserver reads run locally, and the autorun
# switch is off except in the cases that exercise it.
export AURALIS_MEDIASERVER_LOCAL=1 AURALIS_SWITCH_CHECK=off

passed=0
failed=0
fail() {
  printf '  FAIL: %s\n' "$1"
  failed=$((failed + 1))
}
ok() {
  printf '  ok: %s\n' "$1"
  passed=$((passed + 1))
}

STUBS="$(mktemp -d)"
trap 'rm -rf "$STUBS"' EXIT

# Points the hook at a budget.py stub printing one reading, the same shape as
# budget.py's CLI. Resets are given as seconds from now (plus 0.9 s, so the
# whole seconds the hook computes a moment later come out exact).
#   budget <verdict> <reason> <five_hour> <seven_day> <availability> <five_reset_s> <week_reset_s>
budget() {
  local f
  f="$(mktemp "$STUBS/budget.XXXXXX")"
  python3 - "$@" >"$f" <<'PY'
import json, sys
from datetime import datetime, timedelta, timezone
verdict, reason, five, week, avail, five_s, week_s = sys.argv[1:8]
now = datetime.now(timezone.utc)
at = lambda s: (now + timedelta(seconds=float(s) + 0.9)).isoformat()
# share_low mirrors budget.py, which owns the threshold; this fixture only needs one low value.
print(json.dumps({"allowed": verdict != "over", "reason": reason, "verdict": verdict,
                  "share_low": float(avail) < 0.02,
                  "five_hour": float(five), "seven_day": float(week), "availability": float(avail),
                  "five_hour_ceiling": 80, "seven_day_ceiling": 95,
                  "five_hour_resets_at": at(five_s), "seven_day_resets_at": at(week_s)}))
PY
  export AURALIS_BUDGET_CMD="cat '$f'"
}
budget_over() { budget over session_ceiling 94 6 0.3 111 999999; }
budget_ok() { budget ok ok 40 6 0.3 3600 999999; }
budget_warn() { budget warn ok 77 6 0.3 3600 999999; }

# Fresh stamp dir per case so the throttle never leaks between tests.
run_hook() {
  local dir="$1" event="$2" cache
  cache="$(mktemp -d)"
  printf '{"hook_event_name":"%s","tool_name":"Bash"}' "$event" |
    CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" "$HOOK" 2>/dev/null
  local rc=$?
  rm -rf "$cache"
  return $rc
}

# --- over the limit: deny, on every gated event --------------------------------

dir="$(mktemp -d)"
budget_over

for event in PreToolUse UserPromptSubmit; do
  out="$(run_hook "$dir" "$event")"
  status=$?
  [ "$status" -eq 0 ] ||
    fail "$event: a denying hook must still exit 0 (got $status) — non-zero is a hook error, not a deny"
  [ "$status" -eq 0 ] && ok "$event: exits 0 while denying"

  if printf '%s' "$out" | python3 -c '
import json, sys
d = json.load(sys.stdin)
event = sys.argv[1]
if event == "UserPromptSubmit":
    assert d["decision"] == "block", d
    reason = d["reason"]
else:
    hs = d["hookSpecificOutput"]
    assert hs["permissionDecision"] == "deny", hs
    assert hs["hookEventName"] == event, hs
    reason = hs["permissionDecisionReason"]
assert "5-hour  94% of 80% limit, resets in 0h01m" in reason, reason
assert "Weekly  6% of 95% limit, resets in 11d13h" in reason, reason
assert "Weekly share  6% used of a 36% cap for now (the cap rises as waking hours pass)" in reason, reason
' "$event" 2>/dev/null; then
    ok "$event: emits a well-formed deny carrying both windows, limits and resets"
  else
    fail "$event: deny payload malformed: $out"
  fi
done

# --- the weekly share: an availability stop says so in the report -------------

budget over weekly_availability 30 60 -0.01 3600 5000
out="$(run_hook "$dir" PreToolUse)"
if printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["permissionDecision"] == "deny", hs
assert "Weekly share  used up" in hs["permissionDecisionReason"], hs
' 2>/dev/null; then
  ok "weekly_availability: denies and names the weekly share"
else
  fail "weekly_availability should deny with a weekly share line: $out"
fi
rm -rf "$dir"

# --- under the limit: SessionStart reports, and does not deny -----------------

dir="$(mktemp -d)"
budget_ok
out="$(run_hook "$dir" SessionStart)"
if printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["hookEventName"] == "SessionStart", hs
assert "5-hour  40% of 80% limit" in hs["additionalContext"], hs
assert "Weekly share  6% used of a 36% cap for now (the cap rises as waking hours pass)" in hs["additionalContext"], hs
assert "permissionDecision" not in hs, hs
' 2>/dev/null; then
  ok "SessionStart: reports usage as context without denying"
else
  fail "SessionStart: expected an additionalContext report, got: $out"
fi

# --- the report throttles: first PreToolUse speaks, the next is silent ---------

cache="$(mktemp -d)"
first="$(printf '{"hook_event_name":"PreToolUse"}' |
  CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" "$HOOK" 2>/dev/null)"
second="$(printf '{"hook_event_name":"PreToolUse"}' |
  CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" "$HOOK" 2>/dev/null)"
rm -rf "$cache"
if [ -n "$first" ] && [ -z "$second" ]; then
  ok "PreToolUse: reports once, then throttles"
else
  fail "throttle broken (first='$first' second='$second')"
fi

# --- forcing the interval to 0 makes every call report ------------------------

cache="$(mktemp -d)"
a="$(printf '{"hook_event_name":"PreToolUse"}' |
  CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_USAGE_REPORT_EVERY=0 "$HOOK" 2>/dev/null)"
b="$(printf '{"hook_event_name":"PreToolUse"}' |
  CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_USAGE_REPORT_EVERY=0 "$HOOK" 2>/dev/null)"
rm -rf "$cache"
if [ -n "$a" ] && [ -n "$b" ]; then
  ok "REPORT_EVERY=0 disables the throttle"
else
  fail "REPORT_EVERY=0 should report every time (a='$a' b='$b')"
fi

# --- the budget reading is cached: one read a minute, not one per call ---------

count_file="$STUBS/budget-count"
export AURALIS_BUDGET_CMD="echo x >>'$count_file'; $AURALIS_BUDGET_CMD"
cache="$(mktemp -d)"
for _ in 1 2 3; do
  printf '{"hook_event_name":"PreToolUse"}' |
    CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_USAGE_REPORT_EVERY=0 "$HOOK" >/dev/null 2>&1
done
rm -rf "$cache"
if [ "$(wc -l <"$count_file" 2>/dev/null)" -eq 1 ]; then
  ok "the budget reading is read once and cached for later calls"
else
  fail "expected one budget read for three calls, got $(wc -l <"$count_file" 2>/dev/null)"
fi
rm -rf "$dir"

# --- the warning band: budget.py says warn -------------------------------------
#
# The band matters because the hard stop blocks the very tools needed to commit
# and write the branch description.

dir="$(mktemp -d)"
budget_warn

out="$(run_hook "$dir" PreToolUse)"
status=$?
if [ "$status" -eq 0 ] && printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
ctx = hs["additionalContext"]
assert "permissionDecision" not in hs, "warning band must not deny"
assert "branch description" in ctx, ctx
assert "NOW" in ctx, ctx
assert "5-hour  77% of 80% limit" in ctx, ctx
' 2>/dev/null; then
  ok "warning band urges a handoff without blocking"
else
  fail "expected a non-blocking warn payload, got (status=$status): $out"
fi

# The warning must repeat on every call — a session fifty tool calls into a turn
# has long since scrolled past a throttled one — but the *full* instruction only
# lands once, because every injection is re-read on every later turn.
cache="$(mktemp -d)"
w1="$(printf '{"hook_event_name":"PreToolUse"}' |
  CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" "$HOOK" 2>/dev/null)"
w2="$(printf '{"hook_event_name":"PreToolUse"}' |
  CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" "$HOOK" 2>/dev/null)"
rm -rf "$cache"
if [ -n "$w1" ] && [ -n "$w2" ]; then
  ok "warning band ignores the report throttle"
else
  fail "warning should repeat every call (w1='$w1' w2='$w2')"
fi

if printf '%s' "$w1" | grep -q "branch description is what you rely on" && ! printf '%s' "$w2" | grep -q "branch description is what you rely on"; then
  ok "full hand-off instruction lands once, then a short nudge"
else
  fail "expected the full text once then a nudge (w1='$w1' w2='$w2')"
fi
if printf '%s' "$w2" | grep -q "branch description"; then
  ok "the nudge still names the branch description"
else
  fail "the short nudge must still name the branch description: $w2"
fi
for text in "$w1" "$w2"; do
  printf '%s' "$text" | grep -q "Plan: line" ||
    fail "hand-off text must ask for the Plan: line on the commit: $text"
done
printf '%s' "$w1" | grep -q "Plan: line" &&
  printf '%s' "$w2" | grep -q "Plan: line" &&
  ok "both warnings ask for the commit's Plan: line"

# A warning driven by the weekly share names it.
budget warn ok 30 40 0.01 3600 5000
out="$(run_hook "$dir" PreToolUse)"
if printf '%s' "$out" | grep -q "Weekly share  40% used of a 41% cap for now, nearly reached (the cap rises as waking hours pass)"; then
  ok "a warning from the weekly share names the share"
else
  fail "expected a weekly share line in the warning: $out"
fi
rm -rf "$dir"

# --- unknown or unreadable readings allow, silently ----------------------------

dir="$(mktemp -d)"
for case in unknown garbage empty failing; do
  case "$case" in
  unknown) budget unknown read_failed:network 0 0 0 60 60 ;;
  garbage) export AURALIS_BUDGET_CMD="echo 'not json'" ;;
  empty) export AURALIS_BUDGET_CMD="true" ;;
  failing) export AURALIS_BUDGET_CMD="exit 255" ;;
  esac
  for event in PreToolUse UserPromptSubmit SessionStart; do
    out="$(run_hook "$dir" "$event")"
    status=$?
    if [ "$status" -eq 0 ] && [ -z "$out" ]; then
      ok "$case reading ($event) allows with no output"
    else
      fail "$case reading ($event) should allow silently (status=$status output=$out)"
    fi
  done
done
rm -rf "$dir"

# --- stdin larger than a pipe buffer is drained without blocking --------------

dir="$(mktemp -d)"
budget_ok
big="$(head -c 200000 /dev/zero | tr '\0' 'x')"
cache="$(mktemp -d)"
if printf '{"hook_event_name":"PreToolUse","junk":"%s"}' "$big" |
  timeout 20 env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" "$HOOK" >/dev/null 2>&1; then
  ok "drains a payload larger than the pipe buffer"
else
  fail "hook blocked or errored on a large stdin payload"
fi
rm -rf "$cache" "$dir"

# =============================================================================
# Retire-marker check and retirement actions
#
# None of the cases above ever set a payload session_id, so they never reach
# any of this — they are the regression proof that ordinary (interactive, or
# session_id-less) traffic is completely unaffected.
# =============================================================================

# A jobs-dir fixture with exactly one job whose state.json carries the given
# sessionId. The directory name IS the job id, per this repo's own rule:
# resolve the short id from the jobs directory, never by slicing the session
# UUID (see usage-gate.sh's header comment).
make_job() {
  local jobs_dir="$1" session_id="$2" job_id="$3"
  mkdir -p "$jobs_dir/$job_id"
  printf '{"sessionId":"%s"}' "$session_id" >"$jobs_dir/$job_id/state.json"
}

# A recorder: appends its full argv to a log file, so a test can see what
# usage-gate.sh actually invoked without touching a real systemd instance, a
# real session, or the real worktree-gc.sh.
make_recorder() {
  local path="$1" logfile="$2"
  cat >"$path" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"$logfile"
EOF
  chmod +x "$path"
}

# A fake bin dir for the retirement actions: recorders for systemd-run and
# claude, a worktree-gc.sh that touches gc-ran, and an auralis-autorun that
# does nothing. Sets fake_bin, sysrun_log, claude_log, gc_marker.
make_fake_bin() {
  fake_bin="$(mktemp -d)"
  sysrun_log="$fake_bin/systemd-run.log"
  claude_log="$fake_bin/claude.log"
  gc_marker="$fake_bin/gc-ran"
  make_recorder "$fake_bin/systemd-run" "$sysrun_log"
  make_recorder "$fake_bin/claude" "$claude_log"
  printf '#!/usr/bin/env bash\n: >"%s"\n' "$gc_marker" >"$fake_bin/worktree-gc.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' >"$fake_bin/auralis-autorun"
  chmod +x "$fake_bin/worktree-gc.sh" "$fake_bin/auralis-autorun"
}

# Runs one retiring PreToolUse call for session $1 with the fake bin dir.
run_retire() {
  printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"%s"}' "$1" |
    env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" \
      AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" \
      AURALIS_SYSTEMD_RUN="$fake_bin/systemd-run" AURALIS_CLAUDE_BIN="$fake_bin/claude" \
      AURALIS_WORKTREE_GC_BIN="$fake_bin/worktree-gc.sh" AURALIS_AUTORUN_BIN="$fake_bin/auralis-autorun" \
      AURALIS_RESPAWN_MARGIN=10 \
      "$HOOK" 2>&1 >/dev/null
}

# --- row 1: no session_id at all -- not a job, falls through, even denying --

dir="$(mktemp -d)"
budget_over
jobs_dir="$(mktemp -d)"
make_job "$jobs_dir" "some-other-session" "otherjob1"
state_dir="$(mktemp -d)"
cache="$(mktemp -d)"
out="$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" "$HOOK" 2>/dev/null)"
status=$?
if [ "$status" -eq 0 ] && printf '%s' "$out" | grep -q "94%" && ! printf '%s' "$out" | grep -q "retired"; then
  ok "row 1: no session_id -- ordinary deny, unaffected by an unrelated job existing"
else
  fail "row 1 broken: status=$status out=$out"
fi
[ -d "$state_dir/retired" ] && fail "row 1: no job should ever be retired when there is no session_id" ||
  ok "row 1: nothing written to the retire dir"
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache"

# --- row 2: session_id present, no matching job -- interactive, falls through

dir="$(mktemp -d)"
budget_ok
jobs_dir="$(mktemp -d)"
make_job "$jobs_dir" "some-other-session" "otherjob2"
state_dir="$(mktemp -d)"
cache="$(mktemp -d)"
out="$(printf '{"hook_event_name":"SessionStart","session_id":"interactive-session-xyz"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" "$HOOK" 2>/dev/null)"
if printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["hookEventName"] == "SessionStart", hs
assert "permissionDecision" not in hs, hs
' 2>/dev/null; then
  ok "row 2: session_id with no matching job (interactive) -- reports normally, never bricked"
else
  fail "row 2 broken: $out"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache"

# --- row 3: session_id present, jobs dir unreadable -- unresolvable, deny -----

dir="$(mktemp -d)"
budget_ok
jobs_dir="$(mktemp -d)"
chmod 000 "$jobs_dir"
state_dir="$(mktemp -d)"
cache="$(mktemp -d)"
out="$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"sess-unresolvable"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" "$HOOK" 2>/dev/null)"
status=$?
chmod 700 "$jobs_dir"
if [ "$status" -eq 0 ] && printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["permissionDecision"] == "deny", hs
assert "could not determine" in hs["permissionDecisionReason"], hs
' 2>/dev/null; then
  ok "row 3: unreadable jobs dir with a real session_id -- denies (cannot resolve, not allowed open)"
else
  fail "row 3 broken (status=$status): $out"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache"

# --- row 3b: the whole payload is not valid JSON at all -- unresolvable, deny
#
# Distinct from row 1 (valid JSON, no session_id key -- allowed through,
# since a session with no job record can never match a retired marker) and
# from row 3 above (session_id parses fine, jobs dir is what is unreadable).
# Here the payload itself cannot even be parsed, so there is no session_id to
# extract at all -- we cannot tell a background job apart from an interactive
# session. A retired job whose payload happened to be truncated/corrupted on
# one call must still deny, per the plan's own deny-on-unresolvable rule;
# collapsing this into "not-a-job" (as an earlier version of this check did)
# would let a retired incumbent through on exactly the call this check exists
# to cover, the moment its usage reading itself reads back under the ceiling.

dir="$(mktemp -d)"
budget_ok
jobs_dir="$(mktemp -d)"
job_id="already-retired-malformed-payload"
make_job "$jobs_dir" "sess-does-not-matter" "$job_id"
state_dir="$(mktemp -d)"
mkdir -p "$state_dir/retired"
: >"$state_dir/retired/$job_id"
cache="$(mktemp -d)"
out="$(printf '{not valid json at all' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" "$HOOK" 2>/dev/null)"
status=$?
if [ "$status" -eq 0 ] && printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["permissionDecision"] == "deny", hs
assert "could not determine" in hs["permissionDecisionReason"], hs
' 2>/dev/null; then
  ok "row 3b: unparseable payload (no session_id extractable at all) -- denies, never allowed through to ordinary gating"
else
  fail "row 3b broken (status=$status): $out"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache"

# --- row 4: job found, retire marker already present -- deny, durably --------
#
# The budget stub answers UNDER the limit here deliberately: the whole point
# of the marker is that it denies regardless of what the current usage
# reading says, because the job was already retired earlier and must never
# un-retire just because the window came back under the limit.

dir="$(mktemp -d)"
budget_ok
jobs_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-already-retired" "retiredjob1"
state_dir="$(mktemp -d)"
mkdir -p "$state_dir/retired"
: >"$state_dir/retired/retiredjob1"
cache="$(mktemp -d)"

for event in PreToolUse UserPromptSubmit; do
  out="$(printf '{"hook_event_name":"%s","tool_name":"Bash","session_id":"sess-already-retired"}' "$event" |
    env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" "$HOOK" 2>/dev/null)"
  status=$?
  if [ "$event" = "UserPromptSubmit" ]; then
    ok_shape="$(printf '%s' "$out" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["decision"] == "block", d
assert "retired" in d["reason"], d
print("ok")' 2>/dev/null)"
  else
    ok_shape="$(printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["permissionDecision"] == "deny", hs
assert "retired" in hs["permissionDecisionReason"], hs
print("ok")' 2>/dev/null)"
  fi
  if [ "$status" -eq 0 ] && [ "$ok_shape" = "ok" ]; then
    ok "row 4 ($event): a job with an existing retire marker is denied, even though usage now reads under the ceiling"
  else
    fail "row 4 ($event) broken (status=$status): $out"
  fi
done
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache"

# --- row 5: job found, no marker -- ordinary gating, JOB_ID resolved silently -

dir="$(mktemp -d)"
budget_ok
jobs_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-not-yet-retired" "notretiredjob1"
state_dir="$(mktemp -d)"
cache="$(mktemp -d)"
out="$(printf '{"hook_event_name":"SessionStart","session_id":"sess-not-yet-retired"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" "$HOOK" 2>/dev/null)"
if printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["hookEventName"] == "SessionStart", hs
assert "permissionDecision" not in hs, hs
' 2>/dev/null; then
  ok "row 5: a real background job with no retire marker gates completely normally"
else
  fail "row 5 broken: $out"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache"

# --- missing python3: falls through to normal gating, never denies -----------
#
# The retire-marker check itself needs python3; without it, this check
# cannot run at all -- deliberately a fall-through, not a deny, since
# nothing here can even tell whether a job record exists. The python3
# fail-open check further down independently allows the rest of the hook
# once it sees python3 is missing too.

dir="$(mktemp -d)"
budget_ok
jobs_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-nopy" "nopyjob1"
state_dir="$(mktemp -d)"
cache="$(mktemp -d)"
fakebin="$(mktemp -d)"
for b in cat printf grep sed mkdir date dirname env bash; do
  p="$(command -v "$b" 2>/dev/null || true)"
  [ -n "$p" ] && ln -sf "$p" "$fakebin/$b"
done
out="$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"sess-nopy"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" PATH="$fakebin" "$HOOK" 2>/dev/null)"
status=$?
if [ "$status" -eq 0 ] && [ -z "$out" ]; then
  ok "missing python3: falls through and allows (cannot resolve a job at all without it)"
else
  fail "missing python3 should allow silently (status=$status out=$out)"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache" "$fakebin"

# --- hard trigger: marker written, timer armed, gc launched, courtesy stop ----

dir="$(mktemp -d)"
budget_over # session_ceiling, 5-hour resets in 111 s
jobs_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-retire-1" "job00001"
make_fake_bin
cache="$(mktemp -d)"
run_retire "sess-retire-1" >/dev/null
status=$?

# retire_job's own side effects are backgrounded/detached -- poll briefly
# rather than assume they have already landed the instant the hook returns.
for _ in $(seq 1 40); do
  [ -f "$state_dir/retired/job00001" ] && [ -s "$sysrun_log" ] && [ -f "$gc_marker" ] && [ -s "$claude_log" ] && break
  sleep 0.1
done

if [ "$status" -eq 0 ] && [ -f "$state_dir/retired/job00001" ]; then
  ok "hard trigger: retire marker written for the resolved job id"
else
  fail "hard trigger: retire marker not written (status=$status)"
fi

if grep -q "auralis-respawn-job00001" "$sysrun_log" 2>/dev/null && grep -q -- "--on-active=121 " "$sysrun_log" 2>/dev/null; then
  ok "hard trigger, session_ceiling: one-shot armed at five_hour_resets_at + margin (111 + 10 = 121)"
else
  fail "hard trigger: systemd-run not invoked with the expected delay: $(cat "$sysrun_log" 2>/dev/null)"
fi

if [ -f "$gc_marker" ]; then
  ok "hard trigger: worktree-gc launched"
else
  fail "hard trigger: worktree-gc was not launched"
fi

if grep -q "stop job00001" "$claude_log" 2>/dev/null; then
  ok "hard trigger: courtesy claude stop issued with the resolved job id"
else
  fail "hard trigger: courtesy stop not issued: $(cat "$claude_log" 2>/dev/null)"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$fake_bin" "$cache"

# --- the restart moment follows the reason, as in the queue plugin's runner ---
#
# A weekly stop (hard ceiling or time-aware share) arms at the weekly reset, the
# share's true upper bound. Any other reason has no known moment: no one-shot,
# said on stderr, and the job is still retired.

for case in weekly_availability weekly_ceiling other; do
  dir="$(mktemp -d)"
  case "$case" in
  weekly_availability) budget over weekly_availability 30 60 -0.01 111 5000 ;;
  weekly_ceiling) budget over weekly_ceiling 30 96 -0.5 111 5000 ;;
  other) budget over some_new_reason 30 60 0.1 111 5000 ;;
  esac
  jobs_dir="$(mktemp -d)"
  state_dir="$(mktemp -d)"
  make_job "$jobs_dir" "sess-$case" "job-$case"
  make_fake_bin
  cache="$(mktemp -d)"
  err_out="$(run_retire "sess-$case")"
  sleep 0.2
  if [ "$case" = other ]; then
    if [ ! -s "$sysrun_log" ] && [ -f "$state_dir/retired/job-$case" ] &&
      printf '%s' "$err_out" | grep -q "no restart moment"; then
      ok "hard trigger, unrecognised reason: retired, no one-shot armed, said on stderr"
    else
      fail "hard trigger, unrecognised reason: sysrun=$(cat "$sysrun_log" 2>/dev/null) err=$err_out"
    fi
  elif grep -q -- "--on-active=5010 " "$sysrun_log" 2>/dev/null; then
    ok "hard trigger, $case: one-shot armed at seven_day_resets_at + margin (5000 + 10)"
  else
    fail "hard trigger, $case: expected --on-active=5010: $(cat "$sysrun_log" 2>/dev/null) $err_out"
  fi
  rm -rf "$dir" "$jobs_dir" "$state_dir" "$fake_bin" "$cache"
done

# --- hard trigger, interactive session (no job record): never retired --------
#
# The single highest-consequence case: an interactive session must never be
# retired, marker-written, timer-armed, or stopped, even when it happens to
# be over the limit and gets denied normally.

dir="$(mktemp -d)"
budget_over
jobs_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
# jobs_dir intentionally has no job matching this session -- interactive.
make_fake_bin
cache="$(mktemp -d)"
run_retire "sess-interactive-over-ceiling" >/dev/null
status=$?
sleep 0.3 # give any (wrongly-fired) background job a moment to land

if [ "$status" -eq 0 ] && [ ! -d "$state_dir/retired" ] && [ ! -s "$sysrun_log" ] && [ ! -s "$claude_log" ]; then
  ok "hard trigger, interactive session: denied normally, never retired/timed/stopped"
else
  fail "an interactive session must never be retired: marker_dir=$([ -d "$state_dir/retired" ] && echo present || echo absent) sysrun=$(cat "$sysrun_log" 2>/dev/null) claude=$(cat "$claude_log" 2>/dev/null)"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$fake_bin" "$cache"

# --- hard trigger: a hanging systemd-run does not exceed the arm-timeout bound
#
# arm_respawn_timer's systemd-run call is synchronous by design (its exit
# code has to reach stderr), so an unbounded hang would burn the hook's
# entire 20s PreToolUse budget (.claude/settings.json) on every retirement.
# This pins that `timeout` actually bounds it: a fake systemd-run that sleeps
# far longer than the configured bound must not make the whole hook
# invocation take anywhere near that long, and the timeout must be logged as
# a failure on stderr, not swallowed silently.

dir="$(mktemp -d)"
budget_over
jobs_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-retire-hang" "job-hang-1"
make_fake_bin
printf '#!/usr/bin/env bash\nsleep 30\n' >"$fake_bin/systemd-run"
rm -f "$fake_bin/worktree-gc.sh"
cache="$(mktemp -d)"
start_ts=$(date +%s)
err_out="$(AURALIS_RESPAWN_ARM_TIMEOUT=1 run_retire "sess-retire-hang")"
status=$?
end_ts=$(date +%s)
elapsed=$((end_ts - start_ts))

if [ "$status" -eq 0 ] && [ "$elapsed" -le 5 ]; then
  ok "hard trigger: hanging systemd-run bounded by AURALIS_RESPAWN_ARM_TIMEOUT, hook returned in ${elapsed}s (fake sleeps 30s)"
else
  fail "hard trigger: hook took ${elapsed}s (status=$status) -- the timeout wrapper did not bound the hang"
fi

if printf '%s' "$err_out" | grep -q "systemd-run timed out"; then
  ok "hard trigger: the timeout is logged as a failure on stderr, not swallowed"
else
  fail "hard trigger: no timeout failure logged on stderr: $err_out"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$fake_bin" "$cache"

# =============================================================================
# The autorun pause switch (background jobs only)
# =============================================================================
#
# AURALIS_SWITCH_CMD stands in for reading the control file on mediaserver.

switch_case() {
  # $1 = session id, $2 = switch file contents; prints the hook's stdout
  printf '%s' "$2" >"$STUBS/control"
  printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"%s"}' "$1" |
    env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" \
      AURALIS_RESPAWN_STATE_DIR="$state_dir" AURALIS_SWITCH_CHECK=on \
      AURALIS_SWITCH_CMD="cat '$STUBS/control'" "$HOOK" 2>/dev/null
}

dir="$(mktemp -d)"
budget_ok
jobs_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-switch" "job-switch"

cache="$(mktemp -d)"
out="$(switch_case sess-switch "paused
at: $(date -d '-20 minutes' -Iseconds)
")"
if printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["permissionDecision"] == "deny", hs
assert "paused" in hs["permissionDecisionReason"], hs
' 2>/dev/null; then
  ok "switch paused past the 10-minute grace: a background job is denied"
else
  fail "paused switch past grace should deny: $out"
fi
rm -rf "$cache"

cache="$(mktemp -d)"
out="$(switch_case sess-switch "paused
at: $(date -d '-2 minutes' -Iseconds)
")"
if printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert "permissionDecision" not in hs, hs
assert "Land your work now" in hs["additionalContext"], hs
' 2>/dev/null; then
  ok "switch paused within the grace: a background job is warned, not denied"
else
  fail "paused switch within grace should warn: $out"
fi
rm -rf "$cache"

cache="$(mktemp -d)"
out="$(switch_case sess-interactive "paused
at: $(date -d '-20 minutes' -Iseconds)
")"
if ! printf '%s' "$out" | grep -q "paused"; then
  ok "switch paused: an interactive session is never affected"
else
  fail "paused switch must not touch an interactive session: $out"
fi
rm -rf "$cache" "$dir" "$jobs_dir" "$state_dir"

# =============================================================================
# Worktree-gc dispatch cadences
# =============================================================================

# --- SessionStart launches worktree-gc unconditionally ------------------------

dir="$(mktemp -d)"
budget_ok
fake_bin="$(mktemp -d)"
gc_marker="$fake_bin/gc-ran"
cat >"$fake_bin/worktree-gc.sh" <<EOF
#!/usr/bin/env bash
: >"$gc_marker"
EOF
chmod +x "$fake_bin/worktree-gc.sh"
cache="$(mktemp -d)"
printf '{"hook_event_name":"SessionStart"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_WORKTREE_GC_BIN="$fake_bin/worktree-gc.sh" "$HOOK" >/dev/null 2>&1
for _ in $(seq 1 30); do [ -f "$gc_marker" ] && break; sleep 0.1; done
if [ -f "$gc_marker" ]; then
  ok "SessionStart: worktree-gc launched unconditionally"
else
  fail "SessionStart should always launch worktree-gc"
fi
rm -rf "$dir" "$fake_bin" "$cache"

# --- PreToolUse: throttled -- first call launches, second (same cache) does not

dir="$(mktemp -d)"
budget_ok
fake_bin="$(mktemp -d)"
gc_log="$fake_bin/gc.log"
cat >"$fake_bin/worktree-gc.sh" <<EOF
#!/usr/bin/env bash
printf 'ran\n' >>"$gc_log"
EOF
chmod +x "$fake_bin/worktree-gc.sh"
cache="$(mktemp -d)"

printf '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_WORKTREE_GC_BIN="$fake_bin/worktree-gc.sh" "$HOOK" >/dev/null 2>&1
for _ in $(seq 1 30); do [ -f "$gc_log" ] && break; sleep 0.1; done
first_count="$(wc -l <"$gc_log" 2>/dev/null || echo 0)"

printf '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_WORKTREE_GC_BIN="$fake_bin/worktree-gc.sh" "$HOOK" >/dev/null 2>&1
sleep 0.3
second_count="$(wc -l <"$gc_log" 2>/dev/null || echo 0)"

if [ "${first_count:-0}" -ge 1 ] && [ "${second_count:-0}" -eq "${first_count:-0}" ]; then
  ok "PreToolUse: worktree-gc runs on the first call, throttles on the second"
else
  fail "PreToolUse gc throttle broken (first=$first_count second=$second_count)"
fi
rm -rf "$dir" "$fake_bin" "$cache"

# --- AURALIS_WORKTREE_GC_EVERY=0 disables the throttle -------------------------

dir="$(mktemp -d)"
budget_ok
fake_bin="$(mktemp -d)"
gc_log="$fake_bin/gc.log"
cat >"$fake_bin/worktree-gc.sh" <<EOF
#!/usr/bin/env bash
printf 'ran\n' >>"$gc_log"
EOF
chmod +x "$fake_bin/worktree-gc.sh"
cache="$(mktemp -d)"

for _ in 1 2; do
  printf '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' |
    env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_WORKTREE_GC_BIN="$fake_bin/worktree-gc.sh" AURALIS_WORKTREE_GC_EVERY=0 "$HOOK" >/dev/null 2>&1
  sleep 0.2
done
count="$(wc -l <"$gc_log" 2>/dev/null || echo 0)"
if [ "${count:-0}" -ge 2 ]; then
  ok "AURALIS_WORKTREE_GC_EVERY=0 disables the worktree-gc throttle"
else
  fail "AURALIS_WORKTREE_GC_EVERY=0 should run gc every call (count=$count)"
fi
rm -rf "$dir" "$fake_bin" "$cache"

# --- when worktree-gc.sh is absent, nothing is launched and nothing errors ----
# (most cases above already exercise this implicitly -- their throwaway
# project dirs never have scripts/hooks/worktree-gc.sh -- but it is worth
# pinning explicitly.)

dir="$(mktemp -d)"
budget_ok
cache="$(mktemp -d)"
out="$(printf '{"hook_event_name":"SessionStart"}' |
  CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" "$HOOK" 2>&1)"
status=$?
if [ "$status" -eq 0 ]; then
  ok "no worktree-gc.sh present: SessionStart still completes cleanly"
else
  fail "missing worktree-gc.sh should not break SessionStart (status=$status): $out"
fi
rm -rf "$dir" "$cache"

# --- HOME and XDG_STATE_HOME/XDG_CACHE_HOME unset: no crash on default paths --
#
# A suite where every case sets the env override never evaluates the bare
# ${HOME:-...} default branch under set -u. Every default touched by this file (STAMP,
# WARN_STAMP, JOBS_DIR, RESPAWN_STATE_DIR, GC_STAMP, AUTORUN_BIN) is written
# as ${VAR:-${HOME:-}/...}, never ${VAR:-$HOME/...}, for exactly this reason.

dir="$(mktemp -d)"
budget_ok
out="$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' |
  env -u HOME -u XDG_STATE_HOME -u XDG_CACHE_HOME -u CLAUDE_CONFIG_DIR \
    -u AURALIS_JOBS_DIR -u AURALIS_RESPAWN_STATE_DIR -u AURALIS_AUTORUN_BIN \
    CLAUDE_PROJECT_DIR="$dir" PATH="$PATH" "$HOOK" 2>&1)"
status=$?
if [ "$status" -eq 0 ] && ! printf '%s' "$out" | grep -qi "unbound variable"; then
  ok "HOME and every XDG var unset: no crash on any default-path branch"
else
  fail "unset HOME/XDG crashed a default path (status=$status): $out"
fi
rm -rf "$dir"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
