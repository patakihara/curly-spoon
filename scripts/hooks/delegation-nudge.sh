#!/usr/bin/env bash
#
# UserPromptSubmit hook: "should this be delegated?" nudge.
#
# This repo's standing preference (CLAUDE.md's delegation section) is to push legwork —
# research, investigation, self-contained implementation — to background Sonnet
# subagents rather than doing it inline in the main loop. This hook watches each
# incoming prompt that describes actual work and, if a headless classifier thinks it
# looks delegatable, injects a one-line nudge into THIS SAME turn's context.
#
# ## Why this one runs SYNCHRONOUSLY, unlike doc-feedback-accumulate.sh
#
# Verified against the Claude Code hooks documentation before writing this (not
# assumed): UserPromptSubmit hook output is read synchronously, for the same prompt
# submission, before the model sees it — and there is no mechanism for a process a hook
# backgrounds and detaches from to retroactively attach `additionalContext` to a turn
# that has already started. The only two ways context can reach the model here are (a)
# this same hook's own synchronous stdout, on this turn, or (b) a later hook invocation
# on some FUTURE turn. A delegation nudge that lands a turn late — after the assistant
# has already started working inline — has lost almost all its value; the entire point
# is steering the approach before it begins. So, deliberately, this hook accepts the
# latency cost below rather than detaching the way doc-feedback-accumulate.sh does.
#
# ## The latency cost, stated plainly
#
# Every prompt that passes the pre-filter pays real wall-clock time here, before the
# user's turn starts: CLI startup for a nested `claude` invocation is commonly 1-3
# seconds on its own, before any tokens come back. NUDGE_TIMEOUT bounds the worst case,
# but a fast round-trip is still not instant. This is a standing tax on the interactive
# loop, accepted in exchange for the nudge actually being useful. If it turns out to be
# annoying in practice the cheap dial is the pre-filter (DF_MIN_LENGTH in
# lib/doc-feedback-lib.sh) — raising it means fewer prompts qualify at all — rather than
# shrinking NUDGE_TIMEOUT further, which just converts slow classifications into
# fail-open silence without saving much time on the common case.
#
# ## Recursion guard
#
# Same sentinel as the doc-feedback pair — see lib/doc-feedback-lib.sh's header for why
# one guard covers this hook too (the nested `claude -p` call below would otherwise
# reload this repo's .claude/settings.json, which registers this exact hook on
# UserPromptSubmit again). Checked first, before the pre-filter.
#
# ## Fail open
#
# No `claude` binary, timeout, malformed classifier output, anything unexpected: print
# nothing, exit 0 — same prompt processing as if this hook did not exist at all. Never
# blocks.
#
# Test overrides (see delegation-nudge.test.sh):
#   AURALIS_DELEGATION_NUDGE_TIMEOUT   seconds for the nested classify call (default 10)

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/doc-feedback-lib.sh
source "$HOOK_DIR/lib/doc-feedback-lib.sh"

# Recursion guard. Must be the very first check performed by this script.
df_guard_active && exit 0

# Deliberately smaller than this hook's own `timeout` field in .claude/settings.json
# (15s) so THIS script controls the fail-open path — printing nothing and exiting 0 —
# rather than being SIGKILLed mid-flight by the harness, which would still fail open
# but leaves nothing for this script to clean up or reason about.
NUDGE_TIMEOUT="${AURALIS_DELEGATION_NUDGE_TIMEOUT:-10}"

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

# Same cheap pre-filter as doc-feedback-accumulate.sh: slash command, too short, or a
# bare acknowledgement never warrant a classifier call.
df_should_skip "$prompt" && exit 0

instructions="You are a strict binary classifier embedded in a developer-tool hook for
a software project whose standing preference is to push legwork -- research,
investigation, self-contained multi-step implementation -- to background subagents
rather than doing it inline in the main conversation. Decide whether the MESSAGE below
describes actual work that should be delegated to a subagent: multi-step legwork, an
investigation, or a self-contained implementation task. Answer false for a quick
single-step edit, a plain question, small talk, or a decision only the user themself can
make. Respond with ONLY one line of minified JSON, no markdown fencing, no commentary,
exactly this shape:
{\"shouldDelegate\": true or false, \"note\": \"one-line reason, empty string if false\"}"

classification="$(df_classify "$prompt" "$instructions" "$NUDGE_TIMEOUT")"
[ -n "$classification" ] || exit 0

should_delegate="$(printf '%s' "$classification" | python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print("1" if d.get("shouldDelegate") is True else "0")
except Exception:
    print("0")
' 2>/dev/null)"
[ "$should_delegate" = "1" ] || exit 0

note="$(printf '%s' "$classification" | python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
    n = d.get("note")
    print(n if isinstance(n, str) else "")
except Exception:
    print("")
' 2>/dev/null)"

python3 -c '
import json, sys

note = sys.argv[1]
message = "This looks delegatable -- consider dispatching a background Agent instead of doing it inline."
if note:
    message += " (" + note + ")"
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": message,
    }
}))
' "$note" 2>/dev/null

exit 0
