#!/usr/bin/env bash
#
# Stop hook 2 of 2 in the doc-feedback pipeline: check accumulation, trigger review.
#
# Counts entries in .claude/pending-doc-feedback.jsonl (written by
# doc-feedback-accumulate.sh) and, once THRESHOLD have piled up, blocks the stop ONCE
# with self-contained instructions for a holistic docs/ pass — worth doing once enough
# feedback exists, not after every single comment.
#
# ## The state machine — read this before changing anything below
#
# The naive version of this hook infinite-loops. Naive version: count the pending file,
# block if >= THRESHOLD with instructions to "dispatch a subagent to do the review",
# done. Walk through what actually happens next:
#
#   1. Stop fires, count >= THRESHOLD, hook emits decision:block.
#   2. The assistant reads the block reason and dispatches a background review agent.
#      Dispatching returns almost immediately — the actual docs pass happens
#      asynchronously, on its own, possibly minutes later.
#   3. The assistant, having "handled" the block, tries to stop again.
#   4. Stop fires AGAIN. pending-doc-feedback.jsonl is untouched (nothing in step 2
#      removed anything from it) — count is still >= THRESHOLD. The hook blocks again,
#      with the same reason, because from its point of view nothing has changed.
#   5. Repeat 3-4 forever, or until the dispatched agent finishes and someone manually
#      intervenes — but the agent's own completion is not wired to unblock anything, so
#      even that doesn't end it on its own.
#
# The fix has to remove the trigger condition SYNCHRONOUSLY, inside this same hook
# invocation, in the same instant it fires the block — not rely on the assistant to
# clean up afterward, because "afterward" is exactly the part that recurses. So:
# rename pending-doc-feedback.jsonl to pending-doc-feedback.in-review.jsonl BEFORE
# emitting the block (see branch 3 below). The threshold check above is against the
# PENDING filename specifically; once the content has moved to the in-review filename,
# the NEXT Stop event — whether it is the same assistant retrying two seconds later, or
# a brand new session started tomorrow — counts pending-doc-feedback.jsonl again, finds
# it empty or absent, and allows (branch 2). It never re-blocks for the same batch.
#
# The in-review file's mere existence is the second half of the guard (branch 1): even
# if fresh feedback accumulates past THRESHOLD again while a review is still in flight,
# seeing pending-doc-feedback.in-review.jsonl short-circuits straight to allow before
# the count is even computed, so there is never a second concurrent review dispatched
# on top of the first.
#
# Cleanup of the in-review file is deliberately NOT this script's job — the block
# reason instructs the assistant to delete it once that agent's work is committed. If
# an assistant is killed or crashes before doing that, the file simply persists and
# every subsequent Stop keeps allowing (branch 1, forever) until a live assistant
# actually finishes the review and deletes it — it does not silently lose the feedback,
# and it does not re-trigger a redundant second review either.
#
# ## Recursion guard
#
# Same sentinel as doc-feedback-accumulate.sh — see lib/doc-feedback-lib.sh's header.
# This is what stops a nested `claude -p` classify call's OWN Stop event from reaching
# branch 3 and blocking that headless call from ever exiting (a Stop block means "keep
# working", which a one-shot headless call has no way to act on other than spin until
# something else kills it). Checked first, before any file is even stat'd.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/doc-feedback-lib.sh
source "$HOOK_DIR/lib/doc-feedback-lib.sh"

# Recursion guard. Must be the very first check performed by this script — before
# touching either pending-doc-feedback file.
df_guard_active && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}"
PENDING_FILE="${AURALIS_DOC_FEEDBACK_PENDING:-$PROJECT_DIR/.claude/pending-doc-feedback.jsonl}"
IN_REVIEW_FILE="${AURALIS_DOC_FEEDBACK_IN_REVIEW:-$PROJECT_DIR/.claude/pending-doc-feedback.in-review.jsonl}"

# Tunable: how many accumulated pieces of doc/direction feedback justify dispatching a
# holistic docs review, rather than continuing to wait for more to build up.
THRESHOLD="${AURALIS_DOC_FEEDBACK_THRESHOLD:-3}"

cat >/dev/null 2>&1 || true # drain the Stop event payload; its contents aren't needed

# Branch 1: a review is already in flight — from this Stop event's own earlier firing,
# in this session or an earlier one. Never block a second time on top of it.
if [ -f "$IN_REVIEW_FILE" ]; then
  exit 0
fi

count=0
if [ -f "$PENDING_FILE" ]; then
  count="$(grep -c . "$PENDING_FILE" 2>/dev/null || echo 0)"
  case "$count" in '' | *[!0-9]*) count=0 ;; esac
fi

# Branch 2: under threshold. Nothing to do yet.
if [ "$count" -lt "$THRESHOLD" ]; then
  exit 0
fi

# Branch 3: threshold met, no review in flight. Rename FIRST — see the state-machine
# comment above for exactly why this ordering is what prevents the infinite loop — and
# only emit the block if the rename actually succeeded. A failed rename means the
# pending count would still be >= THRESHOLD on the next Stop, so falling through to a
# block here without a successful rename would just be the naive, looping version of
# this hook; fail open (allow) instead and let the next Stop retry the rename.
mv "$PENDING_FILE" "$IN_REVIEW_FILE" 2>/dev/null || exit 0

reason="$count pieces of accumulated documentation/direction feedback are ready for review in .claude/pending-doc-feedback.in-review.jsonl -- dispatch a subagent to read them and do a holistic pass over docs/ (ARCHITECTURE.md, DESIGN.md, ROADMAP.md, HANDOVER.md) incorporating this feedback, then delete .claude/pending-doc-feedback.in-review.jsonl once that agent's work is committed. Do not lose this file's contents without incorporating them."

python3 -c '
import json, sys
print(json.dumps({"decision": "block", "reason": sys.argv[1]}))
' "$reason" 2>/dev/null

exit 0
