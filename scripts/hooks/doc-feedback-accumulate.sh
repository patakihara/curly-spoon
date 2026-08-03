#!/usr/bin/env bash
#
# UserPromptSubmit hook 1 of 2 in the doc-feedback pipeline: classify-and-accumulate.
#
# Purpose: the user sometimes drops a standalone remark about product direction or how
# something should be documented/framed — a north-star clarification, a correction to
# how a feature is described, a scope/priority opinion — in passing, mid-conversation,
# about something other than the task at hand. That kind of comment is said once and is
# easy to lose. This hook watches every prompt for it and logs a note to
# .claude/pending-doc-feedback.jsonl. See doc-feedback-review.sh (the Stop hook) for
# what happens once enough of these pile up.
#
# ## Never blocks, never delays
#
# This is a side log, not a gate — it must ALWAYS allow the prompt through, and it must
# return near-instantly so the user is never kept waiting on an LLM call. The actual
# classification runs in a detached, disowned background subprocess; this script itself
# does no more than a cheap pre-filter and a stdin parse before exiting 0.
#
# ## Recursion guard
#
# See lib/doc-feedback-lib.sh's header for the full reasoning. Checked FIRST, before
# the pre-filter, before any file I/O.
#
# ## Fail open
#
# Missing `claude` binary, a malformed classifier response, an unwritable pending file,
# a timeout — every one of these results in silently doing nothing. Nothing in this
# script can surface an error to the user or affect the prompt submission; by the time
# any of this runs (in the background, after this script has already exited 0), the
# prompt has already gone through.
#
# Test overrides (see doc-feedback.test.sh):
#   AURALIS_DOC_FEEDBACK_PENDING            path to the pending JSONL file
#   AURALIS_DOC_FEEDBACK_CLASSIFY_TIMEOUT    seconds for the nested classify call (default 45)
#   AURALIS_DOC_FEEDBACK_NOW                 ISO 8601 timestamp to record instead of "now"
#   AURALIS_DOC_FEEDBACK_SYNC                if "1", run the background block in the
#                                             foreground instead of detaching — lets tests
#                                             wait on the result deterministically instead
#                                             of polling.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/doc-feedback-lib.sh
source "$HOOK_DIR/lib/doc-feedback-lib.sh"

# Recursion guard. Must be the very first check performed by this script.
df_guard_active && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"
PENDING_FILE="${AURALIS_DOC_FEEDBACK_PENDING:-$PROJECT_DIR/.claude/pending-doc-feedback.jsonl}"
CLASSIFY_TIMEOUT="${AURALIS_DOC_FEEDBACK_CLASSIFY_TIMEOUT:-45}"

payload="$(cat 2>/dev/null)"
[ -n "$payload" ] || exit 0

prompt="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("prompt") or "")
except Exception:
    print("")
' 2>/dev/null)"
[ -n "$prompt" ] || exit 0

session_id="$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("session_id") or "")
except Exception:
    print("")
' 2>/dev/null)"

# Cheap pre-filter: slash command, too short, or a bare acknowledgement. None of these
# are ever worth a classifier call.
df_should_skip "$prompt" && exit 0

instructions="You are a strict binary classifier embedded in a developer-tool hook for
a software project. Decide whether the MESSAGE below is standalone product or
documentation direction feedback: a north-star clarification, a correction to how a
feature or decision is currently framed or documented, or a scope/priority opinion. This
is NOT a request to do a specific coding or investigation task right now, and it is NOT
a plain question or small talk. Respond with ONLY one line of minified JSON, no markdown
fencing, no commentary, exactly this shape:
{\"isDocFeedback\": true or false, \"note\": \"one-line paraphrase, empty string if false\"}"

classify_and_log() {
  local classification is_doc_feedback note record

  classification="$(df_classify "$prompt" "$instructions" "$CLASSIFY_TIMEOUT")"
  [ -n "$classification" ] || return 0

  is_doc_feedback="$(printf '%s' "$classification" | python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print("1" if d.get("isDocFeedback") is True else "0")
except Exception:
    print("0")
' 2>/dev/null)"
  [ "$is_doc_feedback" = "1" ] || return 0

  note="$(printf '%s' "$classification" | python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
    n = d.get("note")
    print(n if isinstance(n, str) else "")
except Exception:
    print("")
' 2>/dev/null)"

  mkdir -p "$(dirname "$PENDING_FILE")" 2>/dev/null || return 0

  record="$(python3 -c '
import json, sys, datetime

session_id, note, prompt, now_override = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
timestamp = now_override if now_override else datetime.datetime.now().isoformat(timespec="seconds")
print(json.dumps({
    "timestamp": timestamp,
    "session_id": session_id,
    "note": note,
    "prompt": prompt,
}))
' "$session_id" "$note" "$prompt" "${AURALIS_DOC_FEEDBACK_NOW:-}" 2>/dev/null)"
  [ -n "$record" ] || return 0

  # flock guards against other concurrent hook invocations appending at the same time.
  # A separate lock file (rather than locking PENDING_FILE itself) means the lock
  # survives doc-feedback-review.sh renaming PENDING_FILE out from under it.
  (
    flock -w 5 9 || exit 0
    printf '%s\n' "$record" >>"$PENDING_FILE"
  ) 9>>"$PENDING_FILE.lock"
}

if [ "${AURALIS_DOC_FEEDBACK_SYNC:-0}" = "1" ]; then
  # Test-only path: run in the foreground so the test can assert on the result
  # deterministically instead of polling for a background write.
  classify_and_log
else
  ( classify_and_log ) >/dev/null 2>&1 &
  disown
fi

exit 0
