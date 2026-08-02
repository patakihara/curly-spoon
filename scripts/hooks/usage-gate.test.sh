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

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
