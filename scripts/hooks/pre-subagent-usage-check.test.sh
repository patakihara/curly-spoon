#!/usr/bin/env bash
#
# Tests for the PreToolUse usage-guard hook.
#
# The hook's contract is narrow and entirely about exit codes: the guard exits 1
# and only 1 to mean "over threshold", and every other outcome — including a
# crash, a missing guard, or an uncalibrated one — must allow the spawn. That
# fail-open behaviour is the part worth testing, because when it breaks it
# breaks silently in the safe-looking direction: a guard that denies everything
# looks like a working guard until it blocks real work.
#
# Each case substitutes a stub for scripts/usage-guard.py in a throwaway project
# directory, so no test depends on real transcripts or a real calibration.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-subagent-usage-check.sh"
PAYLOAD='{"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{}}'

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

# Build a project dir whose usage-guard.py exits with $1 after printing $2.
stub_project() {
  local code="$1" output="${2:-}" dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/scripts"
  cat >"$dir/scripts/usage-guard.py" <<EOF
import sys
sys.stdout.write("""$output""")
sys.exit($code)
EOF
  printf '%s' "$dir"
}

run_hook() {
  local dir="$1"
  printf '%s' "$PAYLOAD" | CLAUDE_PROJECT_DIR="$dir" "$HOOK" 2>/dev/null
}

# --- over threshold: deny, with the window lines carried into the reason ------

report='Auralis plan usage
Session   [##########]  91.0% of plan  <- OVER
Weekly    [####]  40.0% of plan
Project tokens'
dir="$(stub_project 1 "$report")"
out="$(run_hook "$dir")"
status=$?
rm -rf "$dir"

[ "$status" -eq 0 ] || fail "denying hook must still exit 0 (got $status); a non-zero exit is a hook error, not a deny"
[ "$status" -eq 0 ] && ok "exits 0 while denying"

if printf '%s' "$out" | python3 -c '
import json, sys
decision = json.load(sys.stdin)["hookSpecificOutput"]
assert decision["hookEventName"] == "PreToolUse", decision
assert decision["permissionDecision"] == "deny", decision
reason = decision["permissionDecisionReason"]
assert "91.0%" in reason, reason
assert "40.0%" in reason, reason
' 2>/dev/null; then
  ok "emits a well-formed deny carrying both window readings"
else
  fail "deny payload malformed or missing the window readings: $out"
fi

# --- every other exit code allows, silently -----------------------------------

for code in 0 2 3; do
  dir="$(stub_project "$code" "irrelevant")"
  out="$(run_hook "$dir")"
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
out="$(run_hook "$dir")"
status=$?
rm -rf "$dir"
if [ "$status" -eq 0 ] && [ -z "$out" ]; then
  ok "missing guard allows"
else
  fail "missing guard should allow (status=$status output=$out)"
fi

# --- stdin is drained, so a caller writing a large payload never blocks -------

dir="$(stub_project 0 "")"
big="$(head -c 200000 /dev/zero | tr '\0' 'x')"
if printf '{"tool_name":"Agent","junk":"%s"}' "$big" |
  timeout 10 env CLAUDE_PROJECT_DIR="$dir" "$HOOK" >/dev/null 2>&1; then
  ok "drains a payload larger than the pipe buffer"
else
  fail "hook blocked or errored on a large stdin payload"
fi
rm -rf "$dir"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
