#!/usr/bin/env bash
#
# Tests for scripts/hooks/delegation-nudge.sh (UserPromptSubmit — synchronous
# "should this be delegated?" nudge).
#
# The contract under test:
#   - Never blocks: the only two outcomes are silence, or a well-formed
#     hookSpecificOutput.additionalContext nudge — never `decision: block`.
#   - The same pre-filter as the doc-feedback hooks (slash commands, short prompts,
#     bare acknowledgements) skips classification without needing `claude` reachable.
#   - The recursion guard (AURALIS_DOC_FEEDBACK_HOOK_ACTIVE=1) no-ops instantly, proven
#     via a marker-touching stub rather than wall-clock (see doc-feedback.test.sh for
#     why timing alone is unreliable on a loaded box).
#   - Every classifier failure mode fails open: silence, never a crash, never a block.
#   - A classifier that says "yes, delegate" produces the exact additionalContext shape;
#     one that says "no" produces silence.
#
# No test here invokes the real `claude` CLI.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HOOK_DIR/delegation-nudge.sh"

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

make_stub_dir() {
  local dir body
  dir="$(mktemp -d)"
  body="$1"
  cat >"$dir/claude" <<EOF
#!/usr/bin/env bash
$body
EOF
  chmod +x "$dir/claude"
  printf '%s' "$dir"
}

stub_delegate_true() {
  make_stub_dir 'cat <<'"'"'JSON'"'"'
{"is_error":false,"result":"{\"shouldDelegate\":true,\"note\":\"multi-file investigation\"}"}
JSON'
}

stub_delegate_false() {
  make_stub_dir 'cat <<'"'"'JSON'"'"'
{"is_error":false,"result":"{\"shouldDelegate\":false,\"note\":\"\"}"}
JSON'
}

stub_malformed() {
  make_stub_dir 'echo "not json at all"'
}

stub_slow() {
  make_stub_dir 'sleep 5; echo '"'"'{"is_error":false,"result":"{\"shouldDelegate\":true,\"note\":\"too late\"}"}'"'"''
}

stub_marker() {
  local marker="$1"
  make_stub_dir "touch '$marker'
cat <<'JSON'
{\"is_error\":false,\"result\":\"{\\\"shouldDelegate\\\":true,\\\"note\\\":\\\"stubbed\\\"}\"}
JSON"
}

run_hook() {
  # $1 = stdin payload, $2 = stub dir to prepend to PATH (or "" for none),
  # $3 = extra env assignments (space-separated), optional
  local payload="$1" stubdir="$2" extra="${3:-}"
  local path_override="$PATH"
  [ -n "$stubdir" ] && path_override="$stubdir:$PATH"
  printf '%s' "$payload" | env PATH="$path_override" \
    AURALIS_DELEGATION_NUDGE_TIMEOUT="${AURALIS_DELEGATION_NUDGE_TIMEOUT:-2}" \
    $extra \
    "$HOOK" # $extra deliberately unquoted: word-splits into separate env assignments.
    # Fine as long as callers only ever pass single-token VAR=val entries (true of
    # every call site in this file) — a value containing a space would break.
}

# =====================================================================================
# Pre-filter: skip classification entirely
# =====================================================================================

out="$(run_hook '{"prompt":"/compact","session_id":"s1"}' "")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "pre-filter: slash command exits 0 silently" ||
  fail "pre-filter: slash command misbehaved (status=$status out=$out)"

out="$(run_hook '{"prompt":"fix it","session_id":"s1"}' "")"
[ -z "$out" ] && ok "pre-filter: short prompt produces no nudge" ||
  fail "pre-filter: short prompt should have skipped classification (out=$out)"

out="$(run_hook '{"prompt":"Sounds good, thanks!","session_id":"s1"}' "")"
[ -z "$out" ] && ok "pre-filter: bare acknowledgement produces no nudge" ||
  fail "pre-filter: acknowledgement should have skipped classification (out=$out)"

# A plain question, long enough to pass the pre-filter, should still reach the
# classifier (this hook has no separate "is this a question" pre-filter — that
# judgment is delegated to the classifier itself) but a stub that says "no" must
# produce silence, proven in the classification section below.

# =====================================================================================
# Recursion guard
# =====================================================================================

marker_dir="$(mktemp -d)"
marker="$marker_dir/classify-was-invoked"
stub="$(stub_marker "$marker")"
out="$(printf '%s' '{"prompt":"please investigate why the sheet detent snapping drifted and fix it across every affected component","session_id":"s1"}' |
  env PATH="$stub:$PATH" AURALIS_DOC_FEEDBACK_HOOK_ACTIVE=1 AURALIS_DELEGATION_NUDGE_TIMEOUT=2 "$HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "recursion guard: exits 0 silently when active" ||
  fail "recursion guard: misbehaved (status=$status out=$out)"
if [ -f "$marker" ]; then
  fail "recursion guard: the classify call ran at all — guard is not checked first"
else
  ok "recursion guard: classify call never happened — guard is checked before classification"
fi
rm -rf "$stub" "$marker_dir"

# =====================================================================================
# Fail-open paths
# =====================================================================================

out="$(printf '%s' '{"prompt":"please investigate why the sheet detent snapping drifted and fix it across every affected component","session_id":"s1"}' |
  env PATH="/usr/bin:/bin" AURALIS_DELEGATION_NUDGE_TIMEOUT=2 "$HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "fail-open: missing claude binary exits 0 silently" ||
  fail "fail-open: missing claude binary misbehaved (status=$status out=$out)"

stub="$(stub_malformed)"
out="$(run_hook '{"prompt":"please investigate why the sheet detent snapping drifted and fix it across every affected component","session_id":"s1"}' "$stub")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "fail-open: malformed classifier output exits 0 silently" ||
  fail "fail-open: malformed classifier output misbehaved (status=$status out=$out)"
rm -rf "$stub"

stub="$(stub_slow)"
# Wrapped in an outer `timeout 4` (the stub sleeps 5s, the hook's own internal timeout
# is set to 1s below): if the internal timeout actually cuts the nested call off, this
# whole invocation finishes well inside 4s and the outer timeout never has to act,
# giving exit 0 with the hook's own (silent) output. If the internal timeout did NOT
# fire, the outer timeout kills the process group at 4s and reports exit 124 — a
# structural pass/fail rather than a wall-clock subtraction, which proved unreliable
# under this box's scheduling jitter (see doc-feedback.test.sh's marker-file rationale
# for the same concern).
out="$(printf '%s' '{"prompt":"please investigate why the sheet detent snapping drifted and fix it across every affected component","session_id":"s1"}' |
  timeout 4 env PATH="$stub:$PATH" AURALIS_DELEGATION_NUDGE_TIMEOUT=1 "$HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "fail-open: classifier timeout cuts off within the outer 4s bound and produces no nudge" ||
  fail "fail-open: classifier timeout did not cut off in time (status=$status out=$out)"
rm -rf "$stub"

# =====================================================================================
# Classification outcomes
# =====================================================================================

stub="$(stub_delegate_true)"
out="$(run_hook '{"prompt":"please investigate why the sheet detent snapping drifted and fix it across every affected component","session_id":"s1"}' "$stub")"
status=$?
if [ "$status" -eq 0 ] && printf '%s' "$out" | python3 -c '
import json, sys
d = json.load(sys.stdin)
hso = d["hookSpecificOutput"]
assert hso["hookEventName"] == "UserPromptSubmit", hso
assert "delegat" in hso["additionalContext"].lower(), hso
assert "decision" not in d, d
' 2>/dev/null; then
  ok "classify true: emits well-formed hookSpecificOutput.additionalContext, never decision:block"
else
  fail "classify true: nudge payload malformed or missing (status=$status out=$out)"
fi
rm -rf "$stub"

stub="$(stub_delegate_false)"
out="$(run_hook '{"prompt":"please investigate why the sheet detent snapping drifted and fix it across every affected component","session_id":"s1"}' "$stub")"
[ -z "$out" ] && ok "classify false: produces no nudge" ||
  fail "classify false: should have produced no nudge (out=$out)"
rm -rf "$stub"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
