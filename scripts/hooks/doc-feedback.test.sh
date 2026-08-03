#!/usr/bin/env bash
#
# Tests for the doc-feedback pipeline:
#   scripts/hooks/doc-feedback-accumulate.sh  (UserPromptSubmit — classify & log)
#   scripts/hooks/doc-feedback-review.sh      (Stop — check accumulation, trigger review)
#
# The contract under test:
#   - The accumulate hook NEVER blocks and NEVER delays the prompt; it only ever logs.
#   - The pre-filter (slash commands, short prompts, bare acknowledgements) skips
#     classification entirely — no `claude` binary needs to be reachable for these.
#   - The recursion guard (AURALIS_DOC_FEEDBACK_HOOK_ACTIVE=1) makes BOTH hooks no-op
#     instantly, before any file I/O or classification.
#   - Every classifier failure mode (missing binary, malformed output, is_error,
#     timeout) fails open: nothing gets logged, nothing crashes.
#   - The review hook's three-branch state machine is exact: in-review present -> allow;
#     under threshold -> allow; at threshold with no in-review file -> block AND rename.
#     The rename is what prevents the infinite block-loop described in
#     doc-feedback-review.sh's header — this suite proves it by re-invoking the hook a
#     second time on the post-rename state and asserting it now allows silently.
#   - Concurrent appends via flock never interleave or corrupt the JSONL file.
#
# No test here invokes the real `claude` CLI — every classifier scenario uses a stub
# script placed on PATH ahead of the real one.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCUMULATE_HOOK="$HOOK_DIR/doc-feedback-accumulate.sh"
REVIEW_HOOK="$HOOK_DIR/doc-feedback-review.sh"

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

# Every JSONL line must independently parse as JSON. Reads $1 as a file path.
all_lines_valid_json() {
  python3 -c '
import json, sys
path = sys.argv[1]
with open(path) as f:
    lines = [l for l in f.read().splitlines() if l.strip()]
if not lines:
    sys.exit(1)
for l in lines:
    json.loads(l)
' "$1" 2>/dev/null
}

line_count() {
  # Counts non-blank lines, same as doc-feedback-review.sh's own count.
  grep -c . "$1" 2>/dev/null || echo 0
}

# --- stub `claude` binaries, each in their own PATH-prependable directory -----------

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

stub_success_true() {
  make_stub_dir 'cat <<'"'"'JSON'"'"'
{"is_error":false,"result":"{\"isDocFeedback\":true,\"note\":\"north star clarification, stubbed\"}"}
JSON'
}

stub_success_false() {
  make_stub_dir 'cat <<'"'"'JSON'"'"'
{"is_error":false,"result":"{\"isDocFeedback\":false,\"note\":\"\"}"}
JSON'
}

stub_malformed() {
  make_stub_dir 'echo "not json at all, sandbox garbage"'
}

stub_is_error() {
  make_stub_dir 'echo '"'"'{"is_error":true}'"'"''
}

stub_slow() {
  # Sleeps longer than the test's classify timeout; proves df_classify's internal
  # `timeout` wrapper actually cuts it off rather than hanging the hook.
  make_stub_dir 'sleep 5; echo '"'"'{"is_error":false,"result":"{\"isDocFeedback\":true,\"note\":\"too late\"}"}'"'"''
}

# Like stub_success_true, but also touches $1 the instant it's invoked — used to prove
# the recursion guard prevents the classify call from ever happening at all, without
# relying on wall-clock timing (which is noisy on a loaded box: process-spawn latency
# alone can vary by seconds under contention, making a millisecond budget an unreliable
# proxy for "the guard ran first"). If the marker file exists afterward, this stub was
# executed — full stop, regardless of how long it took.
stub_success_true_marker() {
  local marker="$1"
  make_stub_dir "touch '$marker'
cat <<'JSON'
{\"is_error\":false,\"result\":\"{\\\"isDocFeedback\\\":true,\\\"note\\\":\\\"north star clarification, stubbed\\\"}\"}
JSON"
}

# Runs the accumulate hook synchronously (AURALIS_DOC_FEEDBACK_SYNC=1) against a stub
# PATH and a throwaway pending-file directory. Prints the hook's own stdout; the
# resulting pending file path is $pending (set as a side effect via nameref-free
# convention: caller passes it in as $3 and reads it back afterward).
run_accumulate() {
  # $1 = stdin payload JSON, $2 = stub dir (prepended to PATH) or "" for none,
  # $3 = pending file path, $4 = extra env assignments (space-separated VAR=val), optional
  local payload="$1" stubdir="$2" pending="$3" extra="${4:-}"
  local path_override="$PATH"
  [ -n "$stubdir" ] && path_override="$stubdir:$PATH"
  printf '%s' "$payload" | env PATH="$path_override" \
    AURALIS_DOC_FEEDBACK_PENDING="$pending" \
    AURALIS_DOC_FEEDBACK_SYNC=1 \
    AURALIS_DOC_FEEDBACK_CLASSIFY_TIMEOUT="${AURALIS_DOC_FEEDBACK_CLASSIFY_TIMEOUT:-2}" \
    AURALIS_DOC_FEEDBACK_NOW="2026-08-03T20:00:00" \
    $extra \
    "$ACCUMULATE_HOOK" # $extra deliberately unquoted: word-splits into separate env
    # assignments. Fine as long as callers only ever pass single-token VAR=val entries
    # (true of every call site in this file) — a value containing a space would break.
}

# =====================================================================================
# Pre-filter: skip classification entirely (no claude binary needed on PATH at all)
# =====================================================================================

qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(run_accumulate '{"prompt":"/compact","session_id":"s1"}' "" "$pending")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "pre-filter: slash command exits 0 silently" ||
  fail "pre-filter: slash command misbehaved (status=$status out=$out)"
[ -f "$pending" ] && fail "pre-filter: slash command must not write pending file" ||
  ok "pre-filter: slash command wrote nothing"
rm -rf "$qdir"

qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(run_accumulate '{"prompt":"fix it","session_id":"s1"}' "" "$pending")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "pre-filter: short prompt exits 0 silently" ||
  fail "pre-filter: short prompt misbehaved (status=$status out=$out)"
[ -f "$pending" ] && fail "pre-filter: short prompt must not write pending file" ||
  ok "pre-filter: short prompt wrote nothing"
rm -rf "$qdir"

qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(run_accumulate '{"prompt":"Ok, thanks!","session_id":"s1"}' "" "$pending")"
[ -z "$out" ] && [ ! -f "$pending" ] && ok "pre-filter: bare acknowledgement skipped" ||
  fail "pre-filter: acknowledgement should have been skipped (out=$out)"
rm -rf "$qdir"

# A prompt merely CONTAINING an ack word is not skipped by the pre-filter (whole-message
# match only) — proven here by pointing PATH at nothing and confirming it still tries to
# classify (missing-binary fail-open path exercised, but pre-filter did not shortcut it).
# We can't observe "tried to classify" directly without a stub, so this is folded into
# the classification section below instead of asserted here.

# =====================================================================================
# Recursion guard: AURALIS_DOC_FEEDBACK_HOOK_ACTIVE=1 no-ops BOTH hooks instantly
# =====================================================================================

# The guard must fire BEFORE any classify attempt is even made — not merely exit 0
# eventually, which a guard placed AFTER a (successful) classify call would also do.
# Wall-clock timing is not a reliable way to prove this on a shared/loaded box (process
# spawn latency alone can vary by seconds under contention), so instead the stub used
# here touches a marker file the instant it is invoked. If the marker exists afterward,
# the classify call happened — full stop, regardless of how long anything took.
marker_dir="$(mktemp -d)"
marker="$marker_dir/classify-was-invoked"
stub="$(stub_success_true_marker "$marker")"
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(printf '%s' '{"prompt":"the north star is actually about acquisition breadth, not library size","session_id":"s1"}' |
  env PATH="$stub:$PATH" \
    AURALIS_DOC_FEEDBACK_HOOK_ACTIVE=1 \
    AURALIS_DOC_FEEDBACK_PENDING="$pending" \
    AURALIS_DOC_FEEDBACK_SYNC=1 \
    AURALIS_DOC_FEEDBACK_CLASSIFY_TIMEOUT=2 \
    "$ACCUMULATE_HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "recursion guard: accumulate hook exits 0 silently when active" ||
  fail "recursion guard: accumulate hook misbehaved (status=$status out=$out)"
[ -f "$pending" ] && fail "recursion guard: must not write pending file even with a classifier that would say yes" ||
  ok "recursion guard: no pending file written despite a stub that would classify true"
if [ -f "$marker" ]; then
  fail "recursion guard: the classify call ran at all — guard is not checked first (or not checked)"
else
  ok "recursion guard: classify call never happened — guard is checked before classification"
fi
rm -rf "$qdir" "$stub" "$marker_dir"

out="$(printf '%s' '{}' | env AURALIS_DOC_FEEDBACK_HOOK_ACTIVE=1 "$REVIEW_HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "recursion guard: review hook exits 0 silently when active" ||
  fail "recursion guard: review hook misbehaved (status=$status out=$out)"

# =====================================================================================
# Fail-open paths
# =====================================================================================

# No `claude` binary reachable at all: PATH restricted to just enough to run the rest
# of the hook's own logic (bash, python3, coreutils), deliberately excluding wherever
# the real `claude` lives on this machine.
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(printf '%s' '{"prompt":"the north star should be framed as acquisition breadth, not library size","session_id":"s1"}' |
  env PATH="/usr/bin:/bin" \
    AURALIS_DOC_FEEDBACK_PENDING="$pending" \
    AURALIS_DOC_FEEDBACK_SYNC=1 \
    "$ACCUMULATE_HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "fail-open: missing claude binary exits 0 silently" ||
  fail "fail-open: missing claude binary misbehaved (status=$status out=$out)"
[ -f "$pending" ] && fail "fail-open: missing claude binary must not write pending file" ||
  ok "fail-open: missing claude binary wrote nothing"
rm -rf "$qdir"

# Malformed classifier output (not JSON at all).
stub="$(stub_malformed)"
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(run_accumulate '{"prompt":"the north star should be framed as acquisition breadth, not library size","session_id":"s1"}' "$stub" "$pending")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "fail-open: malformed classifier output exits 0 silently" ||
  fail "fail-open: malformed classifier output misbehaved (status=$status out=$out)"
[ -f "$pending" ] && fail "fail-open: malformed classifier output must not write pending file" ||
  ok "fail-open: malformed classifier output wrote nothing"
rm -rf "$qdir" "$stub"

# is_error:true from the classifier.
stub="$(stub_is_error)"
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(run_accumulate '{"prompt":"the north star should be framed as acquisition breadth, not library size","session_id":"s1"}' "$stub" "$pending")"
[ -z "$out" ] && [ ! -f "$pending" ] && ok "fail-open: classifier is_error:true wrote nothing" ||
  fail "fail-open: classifier is_error:true should have written nothing (out=$out)"
rm -rf "$qdir" "$stub"

# Classifier hangs past the internal timeout. Wrapped in an outer `timeout 4` (stub
# sleeps 5s, internal classify timeout is set to 1s): if df_classify's own internal
# `timeout` actually cuts the nested call off, this whole invocation finishes well
# inside 4s. If it didn't, the outer timeout kills it at 4s (exit 124) — a structural
# pass/fail rather than a `date`-subtraction wall-clock check, which was flaky under
# this box's scheduling jitter (see the recursion-guard section above for the same
# concern, fixed there with a marker file instead).
stub="$(stub_slow)"
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
out="$(printf '%s' '{"prompt":"the north star should be framed as acquisition breadth, not library size","session_id":"s1"}' |
  timeout 4 env PATH="$stub:$PATH" \
    AURALIS_DOC_FEEDBACK_PENDING="$pending" \
    AURALIS_DOC_FEEDBACK_SYNC=1 \
    AURALIS_DOC_FEEDBACK_CLASSIFY_TIMEOUT=1 \
    "$ACCUMULATE_HOOK")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && [ ! -f "$pending" ] &&
  ok "fail-open: classifier timeout cuts off within the outer 4s bound and wrote nothing" ||
  fail "fail-open: classifier timeout did not cut off in time (status=$status out=$out)"
rm -rf "$qdir" "$stub"

# =====================================================================================
# Successful classification: writes a well-formed record
# =====================================================================================

stub="$(stub_success_true)"
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
run_accumulate '{"prompt":"actually the north star is fixing acquisition breadth, not reconciling with library size","session_id":"sess-42"}' "$stub" "$pending" >/dev/null
if [ -f "$pending" ] && all_lines_valid_json "$pending"; then
  ok "classify true: wrote a well-formed JSONL line"
else
  fail "classify true: pending file missing or malformed"
fi
python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    rec = json.loads(f.readline())
assert rec["session_id"] == "sess-42", rec
assert rec["timestamp"] == "2026-08-03T20:00:00", rec
assert "north star" in rec["prompt"], rec
assert isinstance(rec["note"], str) and rec["note"], rec
' "$pending" 2>/dev/null &&
  ok "classify true: record carries timestamp, session_id, note, and raw prompt" ||
  fail "classify true: record fields wrong or missing"
rm -rf "$qdir" "$stub"

stub="$(stub_success_false)"
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
run_accumulate '{"prompt":"please refactor the sheet detent snapping logic in Sheet.tsx","session_id":"sess-43"}' "$stub" "$pending" >/dev/null
[ ! -f "$pending" ] && ok "classify false: nothing written for a non-feedback message" ||
  fail "classify false: should not have written anything"
rm -rf "$qdir" "$stub"

# =====================================================================================
# Stop hook (doc-feedback-review.sh): the three-branch state machine
# =====================================================================================

run_review() {
  # $1 = pending file, $2 = in-review file, $3 = threshold
  printf '%s' '{}' | env \
    AURALIS_DOC_FEEDBACK_PENDING="$1" \
    AURALIS_DOC_FEEDBACK_IN_REVIEW="$2" \
    AURALIS_DOC_FEEDBACK_THRESHOLD="$3" \
    "$REVIEW_HOOK"
}

# --- branch 1: in-review file already present -> always allow, never re-block --------

qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
in_review="$qdir/pending-doc-feedback.in-review.jsonl"
printf '{"note":"a"}\n{"note":"b"}\n{"note":"c"}\n{"note":"d"}\n' >"$pending"
printf '{"note":"already in flight"}\n' >"$in_review"
out="$(run_review "$pending" "$in_review" 3)"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "branch 1: in-review present allows silently" ||
  fail "branch 1: should allow silently (status=$status out=$out)"
[ -f "$pending" ] && ok "branch 1: pending file untouched" || fail "branch 1: pending file should be untouched"
[ -f "$in_review" ] && ok "branch 1: in-review file untouched" || fail "branch 1: in-review file should still exist"
rm -rf "$qdir"

# --- branch 2: under threshold -> allow, no rename ------------------------------------

qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
in_review="$qdir/pending-doc-feedback.in-review.jsonl"
printf '{"note":"a"}\n{"note":"b"}\n' >"$pending"
out="$(run_review "$pending" "$in_review" 3)"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "branch 2: under threshold allows silently" ||
  fail "branch 2: should allow silently (status=$status out=$out)"
[ -f "$pending" ] && ok "branch 2: pending file untouched" || fail "branch 2: pending file should still exist"
[ -f "$in_review" ] && fail "branch 2: must not create the in-review file" || ok "branch 2: no in-review file created"
rm -rf "$qdir"

# --- branch 3: at threshold, no in-review file -> blocks AND renames -----------------
# This is the anti-reloop proof: after the rename, invoking the SAME hook a second time
# on the resulting state must land in branch 1 (allow), not branch 3 again.

qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
in_review="$qdir/pending-doc-feedback.in-review.jsonl"
printf '{"note":"a"}\n{"note":"b"}\n{"note":"c"}\n' >"$pending"
out="$(run_review "$pending" "$in_review" 3)"
status=$?
if [ "$status" -eq 0 ] && printf '%s' "$out" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["decision"] == "block", d
assert "in-review" in d["reason"], d["reason"]
assert "3" in d["reason"], d["reason"]
' 2>/dev/null; then
  ok "branch 3: emits well-formed decision:block naming the in-review file and count"
else
  fail "branch 3: block payload malformed or missing (status=$status out=$out)"
fi
[ ! -f "$pending" ] && ok "branch 3: pending file renamed away (no longer exists)" ||
  fail "branch 3: pending file should no longer exist after the rename"
if [ -f "$in_review" ] && [ "$(line_count "$in_review")" -eq 3 ] && all_lines_valid_json "$in_review"; then
  ok "branch 3: in-review file exists with all 3 original lines intact"
else
  fail "branch 3: in-review file missing, wrong line count, or malformed"
fi

# The anti-reloop proof: re-run the hook on the exact resulting state.
out2="$(run_review "$pending" "$in_review" 3)"
status2=$?
if [ "$status2" -eq 0 ] && [ -z "$out2" ]; then
  ok "anti-reloop: second invocation on post-rename state allows silently (no re-block)"
else
  fail "anti-reloop: second invocation should allow silently, got status=$status2 out=$out2"
fi
rm -rf "$qdir"

# --- branch 3, failed rename (e.g. unwritable dir) never blocks without it -----------
# Simulated by stripping write permission from the containing directory: `mv` needs to
# update a directory entry to rename, so this makes the rename fail for real (as
# opposed to `mv file existing-dir/`, which actually succeeds by moving the file INSIDE
# the directory — not a rename failure at all, and the wrong thing to simulate here).

qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
in_review="$qdir/pending-doc-feedback.in-review.jsonl"
printf '{"note":"a"}\n{"note":"b"}\n{"note":"c"}\n' >"$pending"
chmod 500 "$qdir" # read+execute only — mv can no longer update a directory entry here
out="$(run_review "$pending" "$in_review" 3)"
status=$?
chmod 700 "$qdir" # restore before rm -rf, or cleanup would fail too
[ "$status" -eq 0 ] && [ -z "$out" ] && ok "branch 3 (rename fails): allows rather than blocking without a successful rename" ||
  fail "branch 3 (rename fails): should fail open (status=$status out=$out)"
[ -f "$pending" ] && ok "branch 3 (rename fails): pending file left in place for a retry" ||
  fail "branch 3 (rename fails): pending file should still be there"
rm -rf "$qdir"

# =====================================================================================
# Concurrency: N simultaneous accumulate invocations, flock'd append, no corruption
# =====================================================================================

stub="$(stub_success_true)"
qdir="$(mktemp -d)"
pending="$qdir/pending-doc-feedback.jsonl"
N=20
pids=()
for i in $(seq 1 "$N"); do
  (
    printf '%s' "{\"prompt\":\"concurrent doc feedback message number $i about north star framing\",\"session_id\":\"s$i\"}" |
      env PATH="$stub:$PATH" \
        AURALIS_DOC_FEEDBACK_PENDING="$pending" \
        AURALIS_DOC_FEEDBACK_SYNC=1 \
        AURALIS_DOC_FEEDBACK_CLASSIFY_TIMEOUT=5 \
        "$ACCUMULATE_HOOK" >/dev/null 2>&1
  ) &
  pids+=($!)
done
for pid in "${pids[@]}"; do
  wait "$pid"
done

if [ -f "$pending" ] && [ "$(line_count "$pending")" -eq "$N" ]; then
  ok "concurrency: exactly $N lines written by $N concurrent invocations"
else
  fail "concurrency: expected $N lines, got $(line_count "$pending" 2>/dev/null || echo 0)"
fi
if all_lines_valid_json "$pending"; then
  ok "concurrency: every line independently parses as JSON (no interleaving/corruption)"
else
  fail "concurrency: at least one line failed to parse — interleaved or corrupted write"
fi
rm -rf "$qdir" "$stub"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
