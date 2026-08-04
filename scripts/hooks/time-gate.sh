#!/usr/bin/env bash
#
# Personal quiet-hours gate for live prompt delivery. Registered ONLY on
# UserPromptSubmit (see .claude/settings.local.json) — never on PreToolUse or
# any other event. Autonomous work, background agents, and every tool call are
# completely unaffected by this hook outside the window; it only ever gates
# the live delivery of a prompt the user just typed.
#
# ## Why this exists
#
# User's own words: "i just end up texting you too much, it sucks. if you
# don't reply to me then there's no urge yeah." Outside 11:00-18:00 *local
# system time*, a submitted prompt is captured with a timestamp instead of
# being processed this turn, and the user is told plainly that it was queued.
#
# ## What happens after the 1-hour mark
#
# Nothing automatic, by the user's own explicit choice (asked and answered
# directly — see the session that wrote this file). A queued prompt does not
# wake anything up and is not processed on a schedule: no cron job, no
# scheduler, nothing autonomous. It simply becomes fair game to read the next
# time a real turn happens in this checkout, once `visibleAt` has passed nothing
# reads the queue back in automatically — that is deliberate scope, not a gap.
#
# ## Personal, not shared policy
#
# This is a habit-management mechanism for one person, not a team policy —
# unlike usage-gate.sh (checked into .claude/settings.json, applies to anyone
# who clones this public repo), this hook is registered from
# .claude/settings.local.json, which is gitignored and never leaves this
# machine.
#
# ## Autonomous-session exemption
#
# When AURALIS_AUTONOMOUS is set and non-empty, this hook exits 0 immediately,
# silently, before touching stdin or the queue at all. What it exempts and
# why: machine-started sessions — the kickoff prompt `auralis-autorun` passes
# to `claude --bg` on a timer, and every wake-up prompt a running autonomous
# session later schedules for itself. UserPromptSubmit fires for those exactly
# as it does for a human typing, and this gate exists to stop the *user* from
# texting at all hours by their own request (see "Why this exists" above) — it
# was never meant to stop the machine from working, and an unattended session
# has no human on the other end to defer. Without this exemption, an autorun
# session started outside the window would have its own kickoff prompt queued
# and blocked: the session starts, does nothing, and logs success — a silent
# no-op that looks exactly like normal operation.
#
# Why an environment marker rather than matching prompt text: wake-up prompts
# are written fresh each time and have no stable prefix or shape to match
# against, so content-based detection cannot cover them. AURALIS_AUTONOMOUS
# rides the *process* instead — `auralis-autorun` exports it before launching
# `claude --bg`, hooks inherit the Claude process environment, and that covers
# both the kickoff prompt and everything the session schedules for itself
# afterward, with nothing to keep in sync.
#
# This marker is this hook's alone. No other hook should ever honour
# AURALIS_AUTONOMOUS — in particular not usage-gate.sh, which enforces the
# plan-usage ceiling. That ceiling is the repo owner's, it deliberately
# applies to autonomous sessions above all (they are the ones that spend
# unattended with nobody watching), and a general-purpose "skip checks when
# autonomous" flag would gut it. This exemption is about *who is being
# protected from whom* — the user, from their own texting habit — not about
# bypassing a safety limit, and it must not be read as precedent for one.
#
# ## Clock
#
# `date`/`datetime.now()` below read THIS MACHINE's local system time, not UTC
# and not any timezone fixed in code. If this checkout is ever used from a box
# in a different timezone, "11:00-18:00" means that box's clock — that is
# accepted as-is, not compensated for.
#
# ## Failing open
#
# No credential and no network call here — but a missing python3, a malformed
# stdin payload, a shape change in the event upstream, an unwritable queue
# file, or any other surprise all fall through to "allow, say nothing",
# exactly like usage-gate.sh's stated philosophy. The two scripts do not share
# code (this one has nothing in common with a usage ceiling), but they share
# the failure direction.
#
# Testing hooks (env overrides, all optional, only meant for
# time-gate.test.sh):
#   AURALIS_TIME_GATE_NOW    ISO 8601 local datetime to use instead of "now"
#   AURALIS_TIME_GATE_START  window start, HH:MM (default 11:00)
#   AURALIS_TIME_GATE_END    window end, HH:MM (default 18:00)
#   AURALIS_TIME_GATE_QUEUE  path to the queue file (default under this repo)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
QUEUE_FILE="${AURALIS_TIME_GATE_QUEUE:-$PROJECT_DIR/.claude/deferred-prompts.jsonl}"
WINDOW_START="${AURALIS_TIME_GATE_START:-11:00}"
WINDOW_END="${AURALIS_TIME_GATE_END:-18:00}"

command -v python3 >/dev/null 2>&1 || exit 0

# Machine-started sessions and their own scheduled wake-ups are exempt — see
# "Autonomous-session exemption" in the header comment. Checked as early as
# possible, before stdin is even read, so the exempt path does the least
# possible work and has nothing left in it that could fail.
[ -n "${AURALIS_AUTONOMOUS:-}" ] && exit 0

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
# the hook deny anything: the only two outcomes are silence (allow) or a
# `decision: block` JSON payload (queued).
out="$(python3 - "$payload_file" "$QUEUE_FILE" "$WINDOW_START" "$WINDOW_END" "${AURALIS_TIME_GATE_NOW:-}" <<'PY'
import datetime
import json
import os
import sys

payload_file, queue_file, start_s, end_s, now_override = (
    sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
)


def parse_hm(s):
    h, m = s.split(":")
    return int(h), int(m)


try:
    with open(payload_file) as f:
        payload = json.load(f)

    prompt = payload.get("prompt")
    if not isinstance(prompt, str):
        # Either a shape change upstream, or this hook got fired for something
        # that isn't a real UserPromptSubmit event. Never guess at content —
        # fail open.
        sys.exit(0)

    now = (
        datetime.datetime.fromisoformat(now_override)
        if now_override
        else datetime.datetime.now()
    )

    start_h, start_m = parse_hm(start_s)
    end_h, end_m = parse_hm(end_s)
    window_start = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    window_end = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)

    if window_start <= now < window_end:
        # Inside the window: behave completely normally. Print nothing.
        sys.exit(0)

    visible_at = now + datetime.timedelta(hours=1)

    record = {
        "queuedAt": now.isoformat(timespec="seconds"),
        "visibleAt": visible_at.isoformat(timespec="seconds"),
        "prompt": prompt,
    }

    os.makedirs(os.path.dirname(queue_file), exist_ok=True)
    with open(queue_file, "a") as f:
        f.write(json.dumps(record) + "\n")

    visible_at_human = visible_at.strftime("%H:%M")
    if visible_at.date() != now.date():
        visible_at_human += " (tomorrow)"

    reason = (
        f"Queued, not delivered live — outside the {start_s}-{end_s} local-time "
        f"window (now {now.strftime('%H:%M')}, this machine's local system "
        f"clock). Saved to .claude/deferred-prompts.jsonl. Nothing automatic "
        f"will wake a session to read it: it just becomes fair game to pick up "
        f"the next time a real turn happens here, from {visible_at_human} "
        f"onward."
    )
    out = {
        "decision": "block",
        "reason": reason,
        "systemMessage": (
            f"Message queued, not sent live — outside {start_s}-{end_s}. "
            f"Readable starting {visible_at_human}."
        ),
    }
    print(json.dumps(out))
except Exception:
    # Anything at all unexpected: allow through normally, print nothing.
    sys.exit(0)
PY
)"

[ -n "$out" ] && printf '%s\n' "$out"
exit 0
