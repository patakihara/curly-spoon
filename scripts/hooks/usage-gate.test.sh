#!/usr/bin/env bash
#
# Tests for the plan-usage gate hook.
#
# The contract is entirely about exit codes and emitted JSON: the guard exits 1
# and only 1 to mean "over the ceiling", and every other outcome must allow. The
# fail-open paths are the ones worth pinning, because when they break they break
# silently in the safe-looking direction — a gate that denies everything looks
# like a working gate right up until it blocks real work.
#
# Each case substitutes a stub for scripts/usage-guard.py in a throwaway project
# directory, so nothing here touches the real credentials or the real endpoint.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/usage-gate.sh"

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

REPORT='Plan usage  (ceiling 90%, checked now)

Session   [##############]  94.0%   resets in 1h02m  <- OVER
Weekly    [##]  6.0%   resets in 1d20h
'

# A project dir whose usage-guard.py exits with $1 after printing the report.
stub_project() {
  local code="$1" dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/scripts"
  cat >"$dir/scripts/usage-guard.py" <<EOF
import sys
sys.stdout.write("""$REPORT""")
sys.exit($code)
EOF
  printf '%s' "$dir"
}

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

# --- over the ceiling: deny, on every gated event ------------------------------

dir="$(stub_project 1)"

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
assert "94.0%" in reason, reason
assert "6.0%" in reason, reason
' "$event" 2>/dev/null; then
    ok "$event: emits a well-formed deny carrying both windows"
  else
    fail "$event: deny payload malformed: $out"
  fi
done
rm -rf "$dir"

# --- under the ceiling: SessionStart reports, and does not deny ----------------

dir="$(stub_project 0)"
out="$(run_hook "$dir" SessionStart)"
if printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
assert hs["hookEventName"] == "SessionStart", hs
assert "94.0%" in hs["additionalContext"], hs
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
rm -rf "$dir"

# --- the warning band: under the ceiling, over the warn line -------------------
#
# The band matters because the hard stop blocks the very tools needed to commit
# and write a handover. A stub that answers "under" at 0.90 and "over" at 0.85
# is exactly a session sitting between the two.

dir="$(mktemp -d)"
mkdir -p "$dir/scripts"
cat >"$dir/scripts/usage-guard.py" <<EOF
import sys
threshold = 0.90
for i, a in enumerate(sys.argv):
    if a == "--threshold" and i + 1 < len(sys.argv):
        threshold = float(sys.argv[i + 1])
sys.stdout.write("""$REPORT""")
sys.exit(1 if 87.0 >= threshold * 100 else 0)
EOF

out="$(run_hook "$dir" PreToolUse)"
status=$?
if [ "$status" -eq 0 ] && printf '%s' "$out" | python3 -c '
import json, sys
hs = json.load(sys.stdin)["hookSpecificOutput"]
ctx = hs["additionalContext"]
assert "permissionDecision" not in hs, "warning band must not deny"
assert "HANDOVER" in ctx, ctx
assert "NOW" in ctx, ctx
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

if printf '%s' "$w1" | grep -q "FRESH session" && ! printf '%s' "$w2" | grep -q "FRESH session"; then
  ok "full hand-off instruction lands once, then a short nudge"
else
  fail "expected the full text once then a nudge (w1='$w1' w2='$w2')"
fi
if printf '%s' "$w2" | grep -q "HANDOVER.md"; then
  ok "the nudge still names HANDOVER.md"
else
  fail "the short nudge must still name the file: $w2"
fi
for text in "$w1" "$w2"; do
  printf '%s' "$text" | grep -q "docs/agent-specs/" ||
    fail "hand-off text must point unlaunched specs at docs/agent-specs/: $text"
done
printf '%s' "$w1" | grep -q "docs/agent-specs/" &&
  printf '%s' "$w2" | grep -q "docs/agent-specs/" &&
  ok "both warnings route unlaunched subagent specs to docs/agent-specs/"
rm -rf "$dir"

# --- anything other than exit 1 allows, silently -------------------------------

for code in 2 3; do
  dir="$(stub_project "$code")"
  out="$(run_hook "$dir" PreToolUse)"
  status=$?
  rm -rf "$dir"
  if [ "$status" -eq 0 ] && [ -z "$out" ]; then
    ok "guard exit $code allows with no output"
  else
    fail "guard exit $code should allow silently (status=$status output=$out)"
  fi
done

# --- a missing guard allows rather than blocking work it cannot measure -------

dir="$(mktemp -d)"
out="$(run_hook "$dir" PreToolUse)"
status=$?
rm -rf "$dir"
if [ "$status" -eq 0 ] && [ -z "$out" ]; then
  ok "missing guard allows"
else
  fail "missing guard should allow (status=$status output=$out)"
fi

# --- stdin larger than a pipe buffer is drained without blocking --------------

dir="$(stub_project 0)"
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
# None of the 16 cases above ever set a payload session_id, so they never
# reach any of this — they are the regression proof that ordinary
# (interactive, or session_id-less) traffic is completely unaffected.
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

# Like stub_project, but the stub also answers `--json [--threshold X]`,
# which arm_respawn_timer needs. Session window is fixed over the ceiling
# (94%, resets in 111s); weekly is fixed under it (6%) — matching $REPORT's
# own numbers, so the same fixture project dir works for both the plain
# report path and the --json path in one hard-trigger test.
stub_project_json() {
  local code="$1" dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/scripts"
  cat >"$dir/scripts/usage-guard.py" <<PYEOF
import sys
if "--json" in sys.argv:
    import json
    print(json.dumps({
        "available": True,
        "threshold": 0.90,
        "over_threshold": True,
        "windows": {
            "session": {"percent": 94.0, "resets_at": "2026-01-01T00:00:00+00:00", "seconds_until_reset": 111},
            "weekly": {"percent": 6.0, "resets_at": "2026-01-08T00:00:00+00:00", "seconds_until_reset": 999999},
        },
    }))
    sys.exit(0)
sys.stdout.write("""$REPORT""")
sys.exit($code)
PYEOF
  printf '%s' "$dir"
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

# --- row 1: no session_id at all -- not a job, falls through, even denying --

dir="$(stub_project 1)"
jobs_dir="$(mktemp -d)"
make_job "$jobs_dir" "some-other-session" "otherjob1"
state_dir="$(mktemp -d)"
cache="$(mktemp -d)"
out="$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" "$HOOK" 2>/dev/null)"
status=$?
if [ "$status" -eq 0 ] && printf '%s' "$out" | grep -q "94.0%" && ! printf '%s' "$out" | grep -q "retired"; then
  ok "row 1: no session_id -- ordinary deny, unaffected by an unrelated job existing"
else
  fail "row 1 broken: status=$status out=$out"
fi
[ -d "$state_dir/retired" ] && fail "row 1: no job should ever be retired when there is no session_id" ||
  ok "row 1: nothing written to the retire dir"
rm -rf "$dir" "$jobs_dir" "$state_dir" "$cache"

# --- row 2: session_id present, no matching job -- interactive, falls through

dir="$(stub_project 0)"
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

dir="$(stub_project 0)"
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

dir="$(stub_project 0)"
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
# The guard stub answers UNDER the ceiling (status 0) here deliberately: the
# whole point of the marker is that it denies regardless of what the current
# usage reading says, because the job was already retired earlier and must
# never un-retire just because the window came back under the ceiling.

dir="$(stub_project 0)"
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

dir="$(stub_project 0)"
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
# nothing here can even tell whether a job record exists. The pre-existing
# GUARD/python3 fail-open checks further down independently allow the rest
# of the hook once they see python3 is missing too.

dir="$(stub_project 0)"
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

dir="$(stub_project_json 1)"
jobs_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-retire-1" "job00001"

fake_bin="$(mktemp -d)"
sysrun_log="$(mktemp)"
claude_log="$(mktemp)"
gc_marker="$fake_bin/gc-ran"
make_recorder "$fake_bin/systemd-run" "$sysrun_log"
make_recorder "$fake_bin/claude" "$claude_log"

cat >"$fake_bin/worktree-gc.sh" <<EOF
#!/usr/bin/env bash
: >"$gc_marker"
EOF
chmod +x "$fake_bin/worktree-gc.sh"

cat >"$fake_bin/auralis-autorun" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$fake_bin/auralis-autorun"

cache="$(mktemp -d)"
printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"sess-retire-1"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" \
    AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" \
    AURALIS_SYSTEMD_RUN="$fake_bin/systemd-run" AURALIS_CLAUDE_BIN="$fake_bin/claude" \
    AURALIS_WORKTREE_GC_BIN="$fake_bin/worktree-gc.sh" AURALIS_AUTORUN_BIN="$fake_bin/auralis-autorun" \
    AURALIS_RESPAWN_MARGIN=10 \
    "$HOOK" >/dev/null 2>&1
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

if grep -q "auralis-respawn-job00001" "$sysrun_log" 2>/dev/null && grep -q -- "--on-active=121" "$sysrun_log" 2>/dev/null; then
  ok "hard trigger: one-shot timer armed with seconds_until_reset + margin (111 + 10 = 121)"
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
rm -rf "$dir" "$jobs_dir" "$state_dir" "$fake_bin" "$cache" "$sysrun_log" "$claude_log"

# --- hard trigger, interactive session (no job record): never retired --------
#
# The single highest-consequence case: an interactive session must never be
# retired, marker-written, timer-armed, or stopped, even when it happens to
# be over the ceiling and gets denied normally.

dir="$(stub_project_json 1)"
jobs_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
# jobs_dir intentionally has no job matching this session -- interactive.

fake_bin="$(mktemp -d)"
sysrun_log="$(mktemp)"
claude_log="$(mktemp)"
make_recorder "$fake_bin/systemd-run" "$sysrun_log"
make_recorder "$fake_bin/claude" "$claude_log"

cache="$(mktemp -d)"
printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"sess-interactive-over-ceiling"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" \
    AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" \
    AURALIS_SYSTEMD_RUN="$fake_bin/systemd-run" AURALIS_CLAUDE_BIN="$fake_bin/claude" \
    "$HOOK" >/dev/null 2>&1
status=$?
sleep 0.3 # give any (wrongly-fired) background job a moment to land

if [ "$status" -eq 0 ] && [ ! -d "$state_dir/retired" ] && [ ! -s "$sysrun_log" ] && [ ! -s "$claude_log" ]; then
  ok "hard trigger, interactive session: denied normally, never retired/timed/stopped"
else
  fail "an interactive session must never be retired: marker_dir=$([ -d "$state_dir/retired" ] && echo present || echo absent) sysrun=$(cat "$sysrun_log" 2>/dev/null) claude=$(cat "$claude_log" 2>/dev/null)"
fi
rm -rf "$dir" "$jobs_dir" "$state_dir" "$fake_bin" "$cache" "$sysrun_log" "$claude_log"

# --- hard trigger: a hanging systemd-run does not exceed the arm-timeout bound
#
# arm_respawn_timer's systemd-run call is synchronous by design (its exit
# code has to reach stderr), so an unbounded hang would burn the hook's
# entire 20s PreToolUse budget (.claude/settings.json) on every retirement.
# This pins that `timeout` actually bounds it: a fake systemd-run that sleeps
# far longer than the configured bound must not make the whole hook
# invocation take anywhere near that long, and the timeout must be logged as
# a failure on stderr, not swallowed silently.

dir="$(stub_project_json 1)"
jobs_dir="$(mktemp -d)"
state_dir="$(mktemp -d)"
make_job "$jobs_dir" "sess-retire-hang" "job-hang-1"

fake_bin="$(mktemp -d)"
claude_log="$(mktemp)"
make_recorder "$fake_bin/claude" "$claude_log"

cat >"$fake_bin/systemd-run" <<'EOF'
#!/usr/bin/env bash
sleep 30
EOF
chmod +x "$fake_bin/systemd-run"

cat >"$fake_bin/auralis-autorun" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$fake_bin/auralis-autorun"

cache="$(mktemp -d)"
start_ts=$(date +%s)
err_out="$(printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"sess-retire-hang"}' |
  env CLAUDE_PROJECT_DIR="$dir" XDG_CACHE_HOME="$cache" \
    AURALIS_JOBS_DIR="$jobs_dir" AURALIS_RESPAWN_STATE_DIR="$state_dir" \
    AURALIS_SYSTEMD_RUN="$fake_bin/systemd-run" AURALIS_CLAUDE_BIN="$fake_bin/claude" \
    AURALIS_WORKTREE_GC_BIN="$fake_bin/no-such-worktree-gc.sh" AURALIS_AUTORUN_BIN="$fake_bin/auralis-autorun" \
    AURALIS_RESPAWN_MARGIN=10 AURALIS_RESPAWN_ARM_TIMEOUT=1 \
    "$HOOK" 2>&1 >/dev/null)"
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
rm -rf "$dir" "$jobs_dir" "$state_dir" "$fake_bin" "$cache" "$claude_log"

# =============================================================================
# Worktree-gc dispatch cadences
# =============================================================================

# --- SessionStart launches worktree-gc unconditionally ------------------------

dir="$(stub_project 0)"
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

dir="$(stub_project 0)"
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

dir="$(stub_project 0)"
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
# (this is what every one of the original 16 cases above already exercised
# implicitly -- their throwaway project dirs never have scripts/hooks/
# worktree-gc.sh -- but it is worth pinning explicitly.)

dir="$(stub_project 0)"
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
# The shape time-gate.sh's own 32 tests structurally could not catch: every
# case there set the env override, so the bare ${HOME:-...} default branch
# never evaluated under set -u. Every default touched by this file (STAMP,
# WARN_STAMP, JOBS_DIR, RESPAWN_STATE_DIR, GC_STAMP, AUTORUN_BIN) is written
# as ${VAR:-${HOME:-}/...}, never ${VAR:-$HOME/...}, for exactly this reason.

dir="$(stub_project 0)"
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
