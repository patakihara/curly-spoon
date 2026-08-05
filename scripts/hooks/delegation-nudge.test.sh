#!/usr/bin/env bash
#
# Tests for scripts/hooks/delegation-nudge.sh (PreToolUse, matcher `*` — a
# static "should this be delegated?" nudge on the first tool call of a turn).
#
# The contract under test:
#   - Never blocks: the only two outcomes are silence, or a well-formed
#     hookSpecificOutput.additionalContext nudge — never permissionDecision,
#     never decision, never continue:false.
#   - Not agentic at all any more: no `claude` binary is ever invoked, on any
#     path. Proven directly with a marker-touching stub on PATH, not inferred
#     from reading the script.
#   - Fires exactly once per (session_id, prompt_id): silent on the 2nd and
#     3rd tool call of the same prompt, fires again on a new prompt_id even
#     for the same session_id.
#   - THE core discriminator: an `Agent` (or legacy `Task`) first tool call
#     still claims the turn, so a later, different tool call in that SAME
#     prompt_id stays silent too — not just the Agent call itself.
#   - Every malformed/hostile/unwritable input fails open: silence, exit 0,
#     never a crash, never anything resembling a permission decision.
#   - Path traversal in session_id/prompt_id is rejected before it ever
#     reaches a filesystem call.
#   - The real state directory (${XDG_CACHE_HOME:-$HOME/.cache}/
#     auralis-delegation-nudge) is never touched by this suite — every
#     invocation below pins AURALIS_DELEGATION_NUDGE_STATE_DIR to its own
#     mktemp -d.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HOOK_DIR/delegation-nudge.sh"

# The real state directory, for the final check below. NOT snapshotted
# before/after as a whole-listing diff: this hook is registered live in
# .claude/settings.json, so any OTHER tool call in this same Claude Code
# session — including ones the harness fires concurrently with this very
# script — legitimately writes and prunes real markers there while this suite
# runs. A before/after listing comparison would be flaky against that live
# writer for reasons that have nothing to do with this suite. Instead, below,
# assert the narrower and sufficient thing: none of THIS suite's own synthetic
# session ids ever appears there, which can only happen if some invocation in
# this file forgot to pin AURALIS_DELEGATION_NUDGE_STATE_DIR.
REAL_STATE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/auralis-delegation-nudge"

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

# $1 = stdin payload, $2 = state dir, $3 = extra PATH prefix (or "" for none)
run_hook() {
  local payload="$1" state_dir="$2" path_prefix="${3:-}"
  local path_override="$PATH"
  [ -n "$path_prefix" ] && path_override="$path_prefix:$PATH"
  printf '%s' "$payload" | env PATH="$path_override" \
    AURALIS_DELEGATION_NUDGE_STATE_DIR="$state_dir" \
    "$HOOK"
}

payload() {
  # $1 session_id, $2 prompt_id, $3 tool_name
  printf '{"session_id":"%s","prompt_id":"%s","tool_name":"%s"}' "$1" "$2" "$3"
}

assert_well_formed_nudge() {
  # $1 = raw hook output. Parses it and checks the exact required shape.
  printf '%s' "$1" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert "decision" not in d, d
hso = d["hookSpecificOutput"]
assert hso["hookEventName"] == "PreToolUse", hso
assert isinstance(hso.get("additionalContext"), str) and hso["additionalContext"], hso
assert "permissionDecision" not in hso, hso
'
}

# =====================================================================================
# Not agentic: no `claude` binary is ever invoked, on any path through the suite
# =====================================================================================

stub_dir="$(mktemp -d)"
marker="$stub_dir/claude-was-invoked"
cat >"$stub_dir/claude" <<EOF
#!/usr/bin/env bash
touch "$marker"
echo '{}'
EOF
chmod +x "$stub_dir/claude"

state_dir="$(mktemp -d)"
out="$(run_hook "$(payload s1 p1 Read)" "$state_dir" "$stub_dir")"
run_hook "$(payload s1 p1 Bash)" "$state_dir" "$stub_dir" >/dev/null
run_hook "$(payload s1 p2 Agent)" "$state_dir" "$stub_dir" >/dev/null
run_hook "$(payload s1 p2 Read)" "$state_dir" "$stub_dir" >/dev/null
if [ -f "$marker" ]; then
  fail "not-agentic: the stub 'claude' binary was invoked at some point"
else
  ok "not-agentic: the stub 'claude' binary was never invoked"
fi
rm -rf "$stub_dir" "$state_dir"

# Grep only CODE lines (strip full-line comments) — the header comment names
# `claude`/doc-feedback-lib/df_classify/AURALIS_DOC_FEEDBACK deliberately, to
# explain what this rewrite sheds and why (house style: headers say why). What
# must not exist is a LIVE reference: an actual `source`, function call, or
# invocation of any of them outside prose.
if grep -Ev '^[[:space:]]*#' "$HOOK" | grep -Eqn 'claude|df_classify|doc-feedback-lib|AURALIS_DOC_FEEDBACK'; then
  fail "not-agentic: delegation-nudge.sh has a live (non-comment) reference to the classifier/doc-feedback family"
else
  ok "not-agentic: no live (non-comment) reference to claude/df_classify/doc-feedback-lib/AURALIS_DOC_FEEDBACK"
fi

# =====================================================================================
# Emitted JSON shape
# =====================================================================================

state_dir="$(mktemp -d)"
out="$(run_hook "$(payload s1 p1 Read)" "$state_dir")"
status=$?
if [ "$status" -eq 0 ] && assert_well_formed_nudge "$out" 2>/dev/null; then
  ok "first tool call: emits well-formed PreToolUse additionalContext"
else
  fail "first tool call: nudge payload malformed or missing (status=$status out=$out)"
fi
rm -rf "$state_dir"

# =====================================================================================
# Once per prompt_id: 2nd and 3rd calls of the same prompt are silent
# =====================================================================================

state_dir="$(mktemp -d)"
out1="$(run_hook "$(payload s1 p1 Read)" "$state_dir")"
out2="$(run_hook "$(payload s1 p1 Bash)" "$state_dir")"
out3="$(run_hook "$(payload s1 p1 Write)" "$state_dir")"
[ -n "$out1" ] && ok "same prompt_id: 1st call fires" || fail "same prompt_id: 1st call was silent"
[ -z "$out2" ] && ok "same prompt_id: 2nd call is silent" || fail "same prompt_id: 2nd call fired: $out2"
[ -z "$out3" ] && ok "same prompt_id: 3rd call is silent" || fail "same prompt_id: 3rd call fired: $out3"
rm -rf "$state_dir"

# =====================================================================================
# Different prompt_id, same session_id: fires again (marker is not sticky-forever,
# and is not keyed on session_id alone)
# =====================================================================================

state_dir="$(mktemp -d)"
run_hook "$(payload s1 p1 Read)" "$state_dir" >/dev/null
out="$(run_hook "$(payload s1 p2 Read)" "$state_dir")"
[ -n "$out" ] && ok "new prompt_id, same session_id: fires again" ||
  fail "new prompt_id, same session_id: should have fired, was silent"
rm -rf "$state_dir"

# =====================================================================================
# THE discriminator: Agent first, then a different tool with the SAME prompt_id —
# both must be silent. An implementation that returns early on tool_name=="Agent"
# WITHOUT claiming the turn passes a naive "does it skip Agent" check and fails
# this one, because the later Read would still nudge.
# =====================================================================================

state_dir="$(mktemp -d)"
out_agent="$(run_hook "$(payload s3 p1 Agent)" "$state_dir")"
out_read="$(run_hook "$(payload s3 p1 Read)" "$state_dir")"
[ -z "$out_agent" ] && ok "Agent first call: silent" || fail "Agent first call: should be silent, got: $out_agent"
[ -z "$out_read" ] && ok "Agent claimed the turn: later Read in same prompt_id stays silent" ||
  fail "Agent did not claim the turn: later Read nudged anyway: $out_read"
rm -rf "$state_dir"

# Task (legacy name) gets the same treatment.
state_dir="$(mktemp -d)"
out_task="$(run_hook "$(payload s4 p1 Task)" "$state_dir")"
out_read="$(run_hook "$(payload s4 p1 Bash)" "$state_dir")"
[ -z "$out_task" ] && ok "Task first call: silent" || fail "Task first call: should be silent, got: $out_task"
[ -z "$out_read" ] && ok "Task claimed the turn: later Bash in same prompt_id stays silent" ||
  fail "Task did not claim the turn: later Bash nudged anyway: $out_read"
rm -rf "$state_dir"

# A non-Agent/Task tool that arrives AFTER an Agent call in a different prompt_id
# is unaffected — sanity check that the claim is genuinely per-prompt_id, not global.
state_dir="$(mktemp -d)"
run_hook "$(payload s5 p1 Agent)" "$state_dir" >/dev/null
out="$(run_hook "$(payload s5 p2 Read)" "$state_dir")"
[ -n "$out" ] && ok "Agent claim does not leak into a different prompt_id" ||
  fail "Agent claim wrongly suppressed a different prompt_id's nudge"
rm -rf "$state_dir"

# =====================================================================================
# Fail-open paths: never a crash, never anything but silence, always exit 0
# =====================================================================================

assert_fails_open() {
  # $1 = description, $2 = raw stdin (may be empty), $3 = state dir override or "",
  # $4 = extra PATH prefix or ""
  local desc="$1" stdin_payload="$2" state_dir="$3" path_prefix="${4:-}"
  local path_override="$PATH"
  [ -n "$path_prefix" ] && path_override="$path_prefix:$PATH"
  local out status
  out="$(printf '%s' "$stdin_payload" | env PATH="$path_override" \
    AURALIS_DELEGATION_NUDGE_STATE_DIR="$state_dir" "$HOOK")"
  status=$?
  if [ "$status" -eq 0 ] && [ -z "$out" ]; then
    ok "fail-open: $desc"
  else
    fail "fail-open: $desc (status=$status out=$out)"
  fi
}

state_dir="$(mktemp -d)"
assert_fails_open "malformed / non-JSON payload" 'not json at all' "$state_dir"
assert_fails_open "empty stdin" '' "$state_dir"
assert_fails_open "missing prompt_id" '{"session_id":"s1","tool_name":"Read"}' "$state_dir"
assert_fails_open "missing tool_name" '{"session_id":"s1","prompt_id":"p1"}' "$state_dir"
assert_fails_open "missing session_id" '{"prompt_id":"p1","tool_name":"Read"}' "$state_dir"
assert_fails_open "session_id containing ../" "$(payload '../../evil' p1 Read)" "$state_dir"
assert_fails_open "prompt_id containing ../" "$(payload s1 '../../evil' Read)" "$state_dir"
assert_fails_open "empty-string session_id" '{"session_id":"","prompt_id":"p1","tool_name":"Read"}' "$state_dir"
assert_fails_open "non-string tool_name" '{"session_id":"s1","prompt_id":"p1","tool_name":42}' "$state_dir"
rm -rf "$state_dir"

# python3 absent from PATH entirely.
minimal_path_dir="$(mktemp -d)"
for bin in cat env printf sh bash mktemp rm; do
  src="$(command -v "$bin" 2>/dev/null)"
  [ -n "$src" ] && ln -sf "$src" "$minimal_path_dir/$bin"
done
state_dir="$(mktemp -d)"
out="$(printf '%s' "$(payload s1 p1 Read)" | env -i PATH="$minimal_path_dir" \
  AURALIS_DELEGATION_NUDGE_STATE_DIR="$state_dir" "$HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] &&
  ok "fail-open: python3 absent from PATH" ||
  fail "fail-open: python3 absent from PATH misbehaved (status=$status out=$out)"
rm -rf "$minimal_path_dir" "$state_dir"

# Unwritable state directory.
if [ "$(id -u)" -ne 0 ]; then
  state_dir="$(mktemp -d)"
  chmod 000 "$state_dir"
  out="$(run_hook "$(payload s1 p1 Read)" "$state_dir")"
  status=$?
  if [ "$status" -eq 0 ] && [ -z "$out" ]; then
    ok "fail-open: unwritable state directory"
  else
    fail "fail-open: unwritable state directory misbehaved (status=$status out=$out)"
  fi
  chmod 755 "$state_dir"
  rm -rf "$state_dir"
else
  ok "fail-open: unwritable state directory (skipped — running as root, chmod 000 has no effect)"
fi

# Path traversal must not create anything outside the pinned state dir.
state_dir="$(mktemp -d)"
outer_dir="$(dirname "$state_dir")"
before="$(find "$outer_dir" -maxdepth 1 | sort)"
run_hook "$(payload '../../evil' p1 Read)" "$state_dir" >/dev/null
after="$(find "$outer_dir" -maxdepth 1 | sort)"
[ "$before" = "$after" ] && ok "path traversal: nothing created outside the pinned state dir" ||
  fail "path traversal: something appeared outside the pinned state dir"
[ -z "$(find "$state_dir" -mindepth 1 2>/dev/null)" ] &&
  ok "path traversal: nothing created inside the pinned state dir either" ||
  fail "path traversal: an unexpected entry was created inside the state dir"
rm -rf "$state_dir"

# =====================================================================================
# Never denies: for every fail-open case above and the ordinary paths, the output
# never contains permissionDecision or "decision" — checked directly, not inferred.
# =====================================================================================

state_dir="$(mktemp -d)"
out="$(run_hook "$(payload s1 p1 Read)" "$state_dir")"
if printf '%s' "$out" | grep -q 'permissionDecision\|"decision"'; then
  fail "never-denies: output contains a permission/decision key: $out"
else
  ok "never-denies: no permissionDecision or decision key in the normal-firing case"
fi
rm -rf "$state_dir"

# =====================================================================================
# The real state directory is never touched by this suite
# =====================================================================================

# This suite's own synthetic session ids (s1, s3, s4, s5 — see the `payload`
# calls above) must never appear as a marker under the REAL state dir. They
# can only get there if some invocation in this file forgot to pin
# AURALIS_DELEGATION_NUDGE_STATE_DIR — everything else that might legitimately
# exist there (from this same live Claude Code session's own real tool calls)
# uses a real session_id/prompt_id, never these fixed test tokens.
leaked=""
if [ -d "$REAL_STATE_DIR" ]; then
  for sid in s1 s3 s4 s5; do
    match="$(find "$REAL_STATE_DIR" -maxdepth 1 -name "${sid}.*" 2>/dev/null)"
    [ -n "$match" ] && leaked="$leaked $match"
  done
fi
[ -z "$leaked" ] &&
  ok "real state dir ($REAL_STATE_DIR): none of this suite's synthetic markers leaked into it" ||
  fail "real state dir: found this suite's own markers there (override not wired through):$leaked"

# =====================================================================================
# Fail open even with HOME unset
# =====================================================================================

# Regression guard for the one path that could escape "silence, exit 0": STATE_DIR
# is assembled in the bash wrapper, under `set -u`, BEFORE python3 starts — so a
# bare `$HOME` there aborts with an unbound-variable error and exit 1, outside the
# reach of the script's own try/except. Every other test in this file pins
# AURALIS_DELEGATION_NUDGE_STATE_DIR, which is exactly why this path went
# uncovered until an adversarial review found it. Unreachable under Claude Code
# (it always sets HOME for hook subprocesses) and pinned here anyway, because a
# fail-open guarantee with one uncovered path is not a guarantee.
out="$(env -u HOME -u XDG_CACHE_HOME -u AURALIS_DELEGATION_NUDGE_STATE_DIR \
  "$HOOK" <<<'{"session_id":"s9","prompt_id":"p9","tool_name":"Read"}' 2>/dev/null)"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] &&
  ok "fail-open: HOME unset exits 0 silently (no unbound-variable abort under set -u)" ||
  fail "fail-open: HOME unset misbehaved (status=$status out=$out)"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
