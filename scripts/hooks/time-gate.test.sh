#!/usr/bin/env bash
#
# Tests for the quiet-hours prompt gate hook (scripts/hooks/time-gate.sh).
#
# The contract: inside 17:00-18:00, behave completely normally and silently.
# Outside it, queue the prompt to a JSONL file with a timestamp and block it
# from being processed this turn via `decision: "block"`. Any failure at all
# — bad JSON, no prompt field, unwritable queue file, malformed job state —
# must allow through to normal gating, never crash, same fail-open direction
# as usage-gate.sh. Nothing here should ever deny a prompt by accident; the
# only two legitimate outcomes are silence and a well-formed queue-and-block.
#
# Rule A (a session's own `claude --bg` kickoff prompt) and rule B
# (`<task-notification>` results) are exempted per-prompt, not per-session —
# see time-gate.sh's header comment for the full design and why the old
# AURALIS_AUTONOMOUS environment marker was removed (it never worked).
#
# "Now" is controlled via AURALIS_TIME_GATE_NOW so this suite never depends on
# the wall clock at run time.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/time-gate.sh"

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

run_hook() {
  # $1 = stdin payload, $2 = AURALIS_TIME_GATE_NOW, $3 = queue file path
  printf '%s' "$1" | AURALIS_TIME_GATE_NOW="$2" AURALIS_TIME_GATE_QUEUE="$3" "$HOOK"
}

# --- inside the window: allow, silently, no queue file ------------------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook '{"prompt":"hi","session_id":"s1"}' "2026-08-03T17:30:00" "$q")"
status=$?
[ "$status" -eq 0 ] && ok "inside window: exits 0" || fail "inside window: exit was $status"
[ -z "$out" ] && ok "inside window: prints nothing" || fail "inside window: unexpected output: $out"
[ -f "$q" ] && fail "inside window: must not write the queue file" || ok "inside window: no queue file written"
rm -rf "$qdir"

# --- boundary: exactly window start is inside ----------------------------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook '{"prompt":"hi"}' "2026-08-03T17:00:00" "$q")"
[ -z "$out" ] && ok "boundary 17:00: treated as inside (silent)" || fail "boundary 17:00: expected silence, got: $out"
rm -rf "$qdir"

# --- boundary: exactly window end is outside -----------------------------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook '{"prompt":"hi"}' "2026-08-03T18:00:00" "$q")"
[ -n "$out" ] && ok "boundary 18:00: treated as outside (blocks)" || fail "boundary 18:00: expected a block payload, got silence"
rm -rf "$qdir"

# --- outside the window: block, queue, and carry both timestamps --------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook '{"prompt":"please refactor the sheet detent code","session_id":"s2"}' "2026-08-03T22:15:00" "$q")"
status=$?
[ "$status" -eq 0 ] && ok "outside window: exits 0 while blocking" || fail "outside window: exit was $status"

if printf '%s' "$out" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["decision"] == "block", d
assert "23:15" in d["reason"], d["reason"]
assert "systemMessage" in d, d
'; then
  ok "outside window: emits well-formed decision:block carrying the +1h time"
else
  fail "outside window: block payload malformed: $out"
fi

[ -f "$q" ] && ok "outside window: queue file created" || fail "outside window: queue file missing"

if [ -f "$q" ] && python3 -c '
import json
with open("'"$q"'") as f:
    line = f.readline()
rec = json.loads(line)
assert rec["prompt"] == "please refactor the sheet detent code", rec
assert rec["queuedAt"] == "2026-08-03T22:15:00", rec
assert rec["visibleAt"] == "2026-08-03T23:15:00", rec
'; then
  ok "outside window: queued record has prompt, queuedAt, and visibleAt = +1h"
else
  fail "outside window: queued record malformed"
fi
rm -rf "$qdir"

# --- outside the window, wrapping past midnight --------------------------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook '{"prompt":"late one"}' "2026-08-03T23:30:00" "$q")"
if printf '%s' "$out" | grep -q 'tomorrow'; then
  ok "past-midnight wrap: human-readable visibleAt is flagged (tomorrow)"
else
  fail "past-midnight wrap: expected '(tomorrow)' in output: $out"
fi
rm -rf "$qdir"

# --- fail open: malformed JSON --------------------------------------------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(printf 'not json at all' | AURALIS_TIME_GATE_NOW="2026-08-03T22:00:00" AURALIS_TIME_GATE_QUEUE="$q" "$HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] &&
  ok "fail-open: malformed JSON allows silently" ||
  fail "fail-open: malformed JSON did not allow silently (exit=$status, out=$out)"
[ -f "$q" ] && fail "fail-open: malformed JSON must not write a queue file" || ok "fail-open: malformed JSON wrote nothing"
rm -rf "$qdir"

# --- fail open: missing prompt field --------------------------------------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook '{"session_id":"s3"}' "2026-08-03T22:00:00" "$q")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] &&
  ok "fail-open: missing prompt field allows silently" ||
  fail "fail-open: missing prompt field did not allow silently (exit=$status, out=$out)"
rm -rf "$qdir"

# --- fail open: unwritable queue directory --------------------------------------

out="$(run_hook '{"prompt":"x"}' "2026-08-03T22:00:00" "/nonexistent-root-only-path/nope/q.jsonl")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] &&
  ok "fail-open: unwritable queue path allows silently, no crash" ||
  fail "fail-open: unwritable queue path did not allow silently (exit=$status, out=$out)"

# --- Rule A / Rule B per-prompt exemptions --------------------------------------
#
# Replaces the old AURALIS_AUTONOMOUS session-level exemption (never worked —
# see time-gate.sh's header). Machine-started sessions' own kickoff prompt
# (rule A) and harness-generated <task-notification> prompts (rule B) must
# never be queued-and-blocked. Critically, this must be per-*prompt*: a later,
# different prompt on the same session is a human texting and must still be
# gated (regression guard for the whole reframing — a session-level exemption
# would wrongly pass it too).

run_hook_jobs() {
  # $1 = stdin payload, $2 = AURALIS_TIME_GATE_NOW, $3 = queue file path,
  # $4 = jobs dir path
  printf '%s' "$1" |
    AURALIS_TIME_GATE_NOW="$2" AURALIS_TIME_GATE_QUEUE="$3" AURALIS_TIME_GATE_JOBS_DIR="$4" "$HOOK"
}

# 1. Kickoff prompt, outside window, matching intent -> allowed, no queue write.
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
jdir="$(mktemp -d)"
mkdir -p "$jdir/job1"
cat >"$jdir/job1/state.json" <<'JSON'
{"sessionId":"auto1","intent":"autorun kickoff"}
JSON
out="$(run_hook_jobs '{"prompt":"autorun kickoff","session_id":"auto1"}' "2026-08-03T22:15:00" "$q" "$jdir")"
status=$?
[ "$status" -eq 0 ] && ok "rule A: kickoff match exits 0" || fail "rule A: kickoff match exit was $status"
[ -z "$out" ] && ok "rule A: kickoff match prints nothing" || fail "rule A: kickoff match unexpected output: $out"
[ -f "$q" ] && fail "rule A: kickoff match must not write the queue file" || ok "rule A: kickoff match no queue file written"
rm -rf "$qdir" "$jdir"

# 2. Different prompt, same session, outside window -> blocked and queued.
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
jdir="$(mktemp -d)"
mkdir -p "$jdir/job1"
cat >"$jdir/job1/state.json" <<'JSON'
{"sessionId":"auto1","intent":"autorun kickoff"}
JSON
out="$(run_hook_jobs '{"prompt":"a human prompt","session_id":"auto1"}' "2026-08-03T22:15:00" "$q" "$jdir")"
[ -n "$out" ] && ok "rule A regression guard: later different prompt on same session still blocks" ||
  fail "rule A regression guard: expected a block payload, got silence"
[ -f "$q" ] && ok "rule A regression guard: later different prompt still queues" ||
  fail "rule A regression guard: queue file missing"
rm -rf "$qdir" "$jdir"

# 3. <task-notification>..., outside window -> allowed.
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
jdir="$(mktemp -d)"
out="$(run_hook_jobs '{"prompt":"<task-notification>result here</task-notification>","session_id":"s6"}' "2026-08-03T22:15:00" "$q" "$jdir")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] &&
  ok "rule B: task-notification outside window allows silently" ||
  fail "rule B: task-notification outside window did not allow silently (exit=$status, out=$out)"
[ -f "$q" ] && fail "rule B: task-notification outside window must not write the queue file" ||
  ok "rule B: task-notification outside window no queue file written"
rm -rf "$qdir" "$jdir"

# 4. <task-notification> inside the window -> allowed (trivially, but pin it).
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
jdir="$(mktemp -d)"
out="$(run_hook_jobs '{"prompt":"<task-notification>result here</task-notification>","session_id":"s7"}' "2026-08-03T17:30:00" "$q" "$jdir")"
[ -z "$out" ] && ok "rule B: task-notification inside window allows silently" ||
  fail "rule B: task-notification inside window unexpected output: $out"
rm -rf "$qdir" "$jdir"

# 5. No matching job record for the session id (interactive session), outside
#    window -> blocked and queued.
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
jdir="$(mktemp -d)"
mkdir -p "$jdir/job1"
cat >"$jdir/job1/state.json" <<'JSON'
{"sessionId":"some-other-session","intent":"unrelated kickoff"}
JSON
out="$(run_hook_jobs '{"prompt":"a human prompt","session_id":"interactive1"}' "2026-08-03T22:15:00" "$q" "$jdir")"
[ -n "$out" ] && ok "rule A: no matching job record still blocks" ||
  fail "rule A: no matching job record expected a block payload, got silence"
[ -f "$q" ] && ok "rule A: no matching job record still queues" ||
  fail "rule A: no matching job record queue file missing"
rm -rf "$qdir" "$jdir"

# 6. Malformed / unreadable state.json in the jobs dir -> hook still
#    functions, falls through to normal gating (block+queue outside window),
#    does not crash.
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
jdir="$(mktemp -d)"
mkdir -p "$jdir/job1"
printf 'not valid json at all' >"$jdir/job1/state.json"
out="$(run_hook_jobs '{"prompt":"a human prompt","session_id":"whatever"}' "2026-08-03T22:15:00" "$q" "$jdir")"
status=$?
[ "$status" -eq 0 ] && ok "malformed state.json: exits 0, no crash" || fail "malformed state.json: exit was $status"
[ -n "$out" ] && ok "malformed state.json: falls through to normal gating (blocks)" ||
  fail "malformed state.json: expected a block payload, got silence"
[ -f "$q" ] && ok "malformed state.json: still queues" || fail "malformed state.json: queue file missing"
rm -rf "$qdir" "$jdir"

# 7. Jobs dir does not exist at all -> normal gating.
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook_jobs '{"prompt":"a human prompt","session_id":"whatever"}' "2026-08-03T22:15:00" "$q" "/nonexistent-root-only-path/nope/jobs")"
status=$?
[ "$status" -eq 0 ] && ok "missing jobs dir: exits 0, no crash" || fail "missing jobs dir: exit was $status"
[ -n "$out" ] && ok "missing jobs dir: falls through to normal gating (blocks)" ||
  fail "missing jobs dir: expected a block payload, got silence"
rm -rf "$qdir"

# 8. Whitespace differences between intent and prompt -> still matches (both
#    are stripped).
qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
jdir="$(mktemp -d)"
mkdir -p "$jdir/job1"
cat >"$jdir/job1/state.json" <<'JSON'
{"sessionId":"auto3","intent":"  autorun kickoff\n"}
JSON
out="$(run_hook_jobs '{"prompt":"autorun kickoff","session_id":"auto3"}' "2026-08-03T22:15:00" "$q" "$jdir")"
[ -z "$out" ] && ok "rule A: whitespace-only difference still matches" ||
  fail "rule A: whitespace-only difference should have matched, got: $out"
[ -f "$q" ] && fail "rule A: whitespace-only match must not write the queue file" ||
  ok "rule A: whitespace-only match no queue file written"
rm -rf "$qdir" "$jdir"

# --- never gated on anything but UserPromptSubmit: registration check ----------
#
# settings.local.json is gitignored by design (it's a personal override, never
# committed — see .gitignore), so it will not exist in a fresh clone or in a
# checkout nobody has personally configured yet. Its absence is the expected
# state, not a failure; only check the registration shape when the file is
# actually there.

local_settings="$(dirname "$HOOK")/../../.claude/settings.local.json"
if [ -f "$local_settings" ]; then
  if jq -e '
    .hooks.UserPromptSubmit != null and
    (.hooks | to_entries | map(select(.key != "UserPromptSubmit")) |
      all(.value[]?.hooks[]?.command | contains("time-gate.sh") | not))
  ' "$local_settings" >/dev/null 2>&1; then
    ok "settings.local.json: time-gate.sh registered only on UserPromptSubmit"
  else
    fail "settings.local.json: time-gate.sh appears outside UserPromptSubmit, or malformed"
  fi
else
  ok "settings.local.json: absent (expected on a fresh/unconfigured checkout — skipping)"
fi

echo
echo "passed=$passed failed=$failed"
[ "$failed" -eq 0 ]
