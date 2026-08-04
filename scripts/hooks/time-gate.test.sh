#!/usr/bin/env bash
#
# Tests for the quiet-hours prompt gate hook (scripts/hooks/time-gate.sh).
#
# The contract: inside 11:00-18:00, behave completely normally and silently.
# Outside it, queue the prompt to a JSONL file with a timestamp and block it
# from being processed this turn via `decision: "block"`. Any failure at all
# — bad JSON, no prompt field, unwritable queue file — must allow, silently,
# same direction as usage-gate.sh. Nothing here should ever deny a prompt by
# accident; the only two legitimate outcomes are silence and a well-formed
# queue-and-block.
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
out="$(run_hook '{"prompt":"hi","session_id":"s1"}' "2026-08-03T14:00:00" "$q")"
status=$?
[ "$status" -eq 0 ] && ok "inside window: exits 0" || fail "inside window: exit was $status"
[ -z "$out" ] && ok "inside window: prints nothing" || fail "inside window: unexpected output: $out"
[ -f "$q" ] && fail "inside window: must not write the queue file" || ok "inside window: no queue file written"
rm -rf "$qdir"

# --- boundary: exactly window start is inside ----------------------------------

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(run_hook '{"prompt":"hi"}' "2026-08-03T11:00:00" "$q")"
[ -z "$out" ] && ok "boundary 11:00: treated as inside (silent)" || fail "boundary 11:00: expected silence, got: $out"
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

# --- AURALIS_AUTONOMOUS exemption -----------------------------------------------
#
# Machine-started sessions (autorun's own kickoff prompt, and every wake-up an
# autonomous session schedules for itself) must never be queued-and-blocked —
# that would start a session, silently do nothing, and log success. The
# exemption must (a) actually exempt outside the window, (b) not write the
# queue file while doing so — a version that stayed silent but still queued
# would look correct from the caller's side and silently accumulate junk,
# (c) leave in-window behaviour unchanged, (d) not regress the non-exempt
# path, and (e) treat an empty value as not set, since an empty marker is not
# an opt-in.

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(printf '%s' '{"prompt":"autorun kickoff","session_id":"auto1"}' |
  AURALIS_AUTONOMOUS=1 AURALIS_TIME_GATE_NOW="2026-08-03T22:15:00" AURALIS_TIME_GATE_QUEUE="$q" "$HOOK")"
status=$?
[ "$status" -eq 0 ] && ok "autonomous, outside window: exits 0" || fail "autonomous, outside window: exit was $status"
[ -z "$out" ] && ok "autonomous, outside window: prints nothing" || fail "autonomous, outside window: unexpected output: $out"
[ -f "$q" ] && fail "autonomous, outside window: must not write the queue file" || ok "autonomous, outside window: no queue file written"
rm -rf "$qdir"

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(printf '%s' '{"prompt":"autorun kickoff","session_id":"auto2"}' |
  AURALIS_AUTONOMOUS=1 AURALIS_TIME_GATE_NOW="2026-08-03T14:00:00" AURALIS_TIME_GATE_QUEUE="$q" "$HOOK")"
status=$?
[ "$status" -eq 0 ] && ok "autonomous, inside window: exits 0" || fail "autonomous, inside window: exit was $status"
[ -z "$out" ] && ok "autonomous, inside window: prints nothing" || fail "autonomous, inside window: unexpected output: $out"
[ -f "$q" ] && fail "autonomous, inside window: must not write the queue file" || ok "autonomous, inside window: no queue file written"
rm -rf "$qdir"

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(printf '%s' '{"prompt":"a human prompt","session_id":"s4"}' |
  AURALIS_TIME_GATE_NOW="2026-08-03T22:15:00" AURALIS_TIME_GATE_QUEUE="$q" "$HOOK")"
[ -n "$out" ] && ok "AURALIS_AUTONOMOUS unset, outside window: still blocks (regression guard)" ||
  fail "AURALIS_AUTONOMOUS unset, outside window: expected a block payload, got silence"
[ -f "$q" ] && ok "AURALIS_AUTONOMOUS unset, outside window: still queues" ||
  fail "AURALIS_AUTONOMOUS unset, outside window: queue file missing"
rm -rf "$qdir"

qdir="$(mktemp -d)"
q="$qdir/deferred-prompts.jsonl"
out="$(printf '%s' '{"prompt":"a human prompt","session_id":"s5"}' |
  AURALIS_AUTONOMOUS="" AURALIS_TIME_GATE_NOW="2026-08-03T22:15:00" AURALIS_TIME_GATE_QUEUE="$q" "$HOOK")"
[ -n "$out" ] && ok "AURALIS_AUTONOMOUS empty string, outside window: still blocks (empty is not an opt-in)" ||
  fail "AURALIS_AUTONOMOUS empty string, outside window: expected a block payload, got silence"
[ -f "$q" ] && ok "AURALIS_AUTONOMOUS empty string, outside window: still queues" ||
  fail "AURALIS_AUTONOMOUS empty string, outside window: queue file missing"
rm -rf "$qdir"

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
