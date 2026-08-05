#!/usr/bin/env bash
#
# PreToolUse (matcher `*`) hook: a static "should this be delegated?" nudge,
# fired once on the first tool call of each prompt.
#
# ## Why PreToolUse, and not UserPromptSubmit — this hook used to be the latter
#
# The previous version of this file ran on UserPromptSubmit and asked a nested
# `claude -p --model haiku` call to guess, from the prompt TEXT ALONE, whether
# it described delegatable work. That guess was expensive (1-3s of nested-CLI
# startup, synchronously, before the user's turn even started) and per
# docs/HANDOVER.md it never actually succeeded in testing.
#
# The signal this version uses instead is not a guess: "is a tool about to be
# called" is directly observable, a moment later, at the first PreToolUse
# firing of the turn. No classifier, no nested `claude` call, no network — one
# python3 process reading the hook's own stdin payload.
#
# `additionalContext` is available on PreToolUse, not just permissionDecision/
# decision/updatedInput — verified empirically against Claude Code 2.1.221 (a
# throwaway single-hook project, `additionalContext` with no other
# hookSpecificOutput key present, read back by a real headless run). Do not
# re-derive this from the bundled docs' phrasing alone: they mark
# permissionDecision/permissionDecisionReason/updatedInput as "PreToolUse
# only", which describes those three, not a restriction on additionalContext.
#
# ## Why keyed on `prompt_id`, not a session marker cleared on UserPromptSubmit
#
# PreToolUse payloads carry `prompt_id` — a UUID naming the user-prompt cycle
# currently in flight, stable across every tool call of that turn no matter how
# many assistant messages the agentic loop takes. Keying the "have I already
# fired this turn?" marker on `prompt_id` makes it self-invalidating: a new
# prompt gets a new id, so the old marker simply stops matching anything. That
# needs no second hook and no clearing step — a session-id-keyed marker would
# need something on UserPromptSubmit purely to delete it between turns.
#
# Deliberately once per `prompt_id`, not once per assistant message: this repo
# runs ~300 turns per agent, and every injected string is re-read by the model
# on every later turn (see usage-gate.sh's header on the same cost). A nudge on
# every assistant message's first tool call would be hundreds of copies of the
# same static line in one session. Once per prompt matches both the intent
# ("consider delegating THIS task") and the cost model.
#
# ## The `Agent`/`Task` exclusion still claims the turn — this is the subtle part
#
# If the first tool call of the turn is itself a subagent spawn, delegation
# already happened and the nudge would be noise, so it is suppressed. But the
# marker directory is created FIRST, before that check, and the suppression
# only skips the PRINT, never the claim. A version that checked
# `tool_name == "Agent"` and returned before claiming would leave the turn
# unclaimed, so the very next tool call in the same turn — a Read, a Bash —
# would fire the nudge at a session that had already delegated. Claiming
# first, then deciding what to print, is what keeps that from happening. This
# is also why the exclusion lives inside the script rather than as a `matcher`
# regex: a matcher that excluded Agent would stop the hook from running for
# that call at all, so it could never claim the turn.
#
# ## The marker itself: an atomic `mkdir`, not a read-then-write
#
# Every hook invocation is a fresh process, and a batch of parallel tool calls
# runs concurrently, so "has this turn already fired?" cannot be a
# check-then-write — two processes could both see "no marker yet" and both
# print. `os.mkdir()` is atomic at the filesystem level and raises
# FileExistsError for whichever process loses the race; that's the only
# synchronization this needs.
#
# ## Accepted limitations — not defects, do not build machinery against these
#
#   1. Parallel-call race: if one assistant message issues [Read, Agent] as a
#      parallel batch, both PreToolUse firings race to claim. If Read wins,
#      the nudge prints even though the turn also delegated. A
#      PostToolBatch-based redesign would be race-free but fires only after
#      the tools already ran, which defeats the entire point (steering the
#      approach before work begins) — considered and rejected.
#   2. Orientation reads trigger it: this repo's CLAUDE.md has the orchestrator
#      read HANDOVER.md/ROADMAP.md first, so the first tool call is often a
#      Read when the model may have been about to delegate on the very next
#      call. Inherent to "first tool call"; the nudge text is phrased to let
#      the model carry on rather than read as an accusation.
#   3. <task-notification> re-arms it: a subagent handing a result back to its
#      parent arrives via UserPromptSubmit, which mints a fresh prompt_id, so
#      the nudge fires again on the parent's next tool call — exactly when
#      delegation just happened. Frequent in this repo's autonomous sessions.
#      Bounded (one short line each); a <task-notification> detector has no
#      way to exist in a hook that never sees prompt text (PreToolUse only
#      sees tool calls), and is not worth adding machinery for.
#
# ## What this version sheds, on purpose
#
# The doc-feedback family (a `df_guard_active` recursion sentinel, a
# `df_should_skip` prompt pre-filter, a `df_classify` nested `claude` call) all
# existed to make a classifier call cheap or to prevent it from recursing into
# itself. There is no classifier call any more, so none of that applies here.
# That family — the two hooks, its test, and its shared library — has since been
# deleted outright; this script never sourced any of it and does not now.
#
# ## Failing open — the highest-severity property of this hook
#
# The only two outcomes are silence, or the well-formed
# hookSpecificOutput.additionalContext payload below. Never permissionDecision,
# never decision, never continue:false — a nudge that can block or deny a tool
# call is a defect, not a tradeoff. Missing python3, unreadable/malformed
# stdin, an unwritable state directory, a session_id/prompt_id that fails
# validation, any unexpected exception: all print nothing and exit 0. Silence
# is always the correct failure direction here; flooding context because a
# marker directory could not be written would be worse than saying nothing.
#
# ## Testing hooks (env overrides, only meant for delegation-nudge.test.sh)
#
#   AURALIS_DELEGATION_NUDGE_STATE_DIR   marker-directory root, instead of the
#                                        default ${XDG_CACHE_HOME:-$HOME/.cache}/
#                                        auralis-delegation-nudge. Tests must
#                                        always set this to a mktemp -d, never
#                                        touching the real state directory.

set -uo pipefail

# `${HOME:-}`, not `$HOME`: under `set -u` a bare `$HOME` in an environment that
# somehow lacks it aborts the script with an unbound-variable error and exit 1,
# before python3 ever starts — the one path that could escape the "silence, exit
# 0" contract, since it happens in the wrapper rather than inside the try/except.
# Claude Code always sets HOME for hook subprocesses, so this is unreachable in
# practice; it is written defensively because "always exit 0" is the whole point
# of this hook and a fail-open guarantee with one uncovered path is not one.
STATE_DIR="${AURALIS_DELEGATION_NUDGE_STATE_DIR:-${XDG_CACHE_HOME:-${HOME:-}/.cache}/auralis-delegation-nudge}"

command -v python3 >/dev/null 2>&1 || exit 0

# Capture stdin to a temp file rather than piping it straight into python3.
# `python3 - ... <<'PY'` reads the *script itself* from stdin, which conflicts
# with also piping the hook's JSON payload through stdin — the heredoc wins
# and json.load(sys.stdin) inside the script sees EOF, not the payload. A
# temp file sidesteps that entirely; python3 gets its source from the heredoc
# and the payload from this file, and the two never contend for the same fd.
payload_file="$(mktemp 2>/dev/null)" || exit 0
trap 'rm -f "$payload_file"' EXIT
cat >"$payload_file" 2>/dev/null || exit 0

# All the real logic lives in one python3 process, so there is exactly one
# place that can fail — and it fails by printing nothing, which the shell
# wrapper below always treats as "allow, no output". Nothing here can make
# the hook deny anything: the only two outcomes are silence or an
# additionalContext payload.
out="$(python3 - "$payload_file" "$STATE_DIR" <<'PY'
import json
import os
import re
import sys
import time

VALID = re.compile(r"^[A-Za-z0-9._-]+$")
SEVEN_DAYS_SECONDS = 7 * 24 * 3600

NUDGE = (
    "First tool call this turn -- delegation check: if this is multi-step "
    "legwork, an investigation, or a self-contained implementation, dispatch "
    "a Sonnet subagent (Agent with model: \"sonnet\") instead of doing it "
    "inline. If it is a small, well-understood fix, carry on."
)


def main():
    payload_file, state_dir = sys.argv[1], sys.argv[2]

    with open(payload_file) as f:
        payload = json.load(f)

    session_id = payload.get("session_id")
    prompt_id = payload.get("prompt_id")
    tool_name = payload.get("tool_name")

    for value in (session_id, prompt_id, tool_name):
        if not isinstance(value, str) or not value:
            # Missing or empty field -- either a shape change upstream or this
            # hook fired for something that isn't a real PreToolUse event.
            # Never guess. Fail open, silently.
            return

    # session_id/prompt_id come straight from the payload and are about to
    # become a directory name under STATE_DIR. Reject anything that isn't a
    # plain token before it ever reaches a filesystem call -- in particular,
    # no `/` and no `..` can reach os.mkdir this way.
    if not VALID.match(session_id) or not VALID.match(prompt_id):
        return

    claim_name = "%s.%s" % (session_id, prompt_id)
    claim_path = os.path.join(state_dir, claim_name)

    os.makedirs(state_dir, exist_ok=True)
    try:
        os.mkdir(claim_path)
    except FileExistsError:
        # Some earlier tool call in this same turn already claimed it. The
        # common case -- not an error, and not something to print about.
        return

    # This process now owns the turn. Prune, in this same listdir pass:
    #   - every other marker for THIS session (so a session holds at most one,
    #     bounding growth per session), and
    #   - every marker older than 7 days (bounding growth across dead
    #     sessions that never come back to overwrite their own entry).
    # Each removal is independently guarded so one bad entry can't stop the
    # rest of the prune, or the nudge print below, from happening. Deliberately
    # os.listdir, not a `find` shellout -- this runs at most once per turn and
    # os.listdir already has everything needed.
    same_session_prefix = session_id + "."
    now = time.time()
    try:
        for entry in os.listdir(state_dir):
            if entry == claim_name:
                continue
            entry_path = os.path.join(state_dir, entry)
            try:
                is_same_session = entry.startswith(same_session_prefix)
                is_stale = (now - os.stat(entry_path).st_mtime) > SEVEN_DAYS_SECONDS
                if is_same_session or is_stale:
                    os.rmdir(entry_path)
            except Exception:
                continue
    except Exception:
        pass

    if tool_name in ("Agent", "Task"):
        # Delegation already happened this turn -- the turn is claimed
        # (above) so no later tool call this same turn will nudge either.
        return

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": NUDGE,
        }
    }))


try:
    main()
except Exception:
    # Anything at all unexpected: print nothing, allow through normally.
    pass
PY
)"

[ -n "$out" ] && printf '%s\n' "$out"
exit 0
