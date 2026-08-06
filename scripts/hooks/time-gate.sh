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
# don't reply to me then there's no urge yeah." Outside 17:00-18:00 *local
# system time*, a submitted prompt is captured with a timestamp instead of
# being processed this turn, and the user is told plainly that it was queued.
#
# ## Where a gated prompt goes
#
# Into the queue plugin's `auralis` instance, via `queuelib.submit_entry` —
# the same store, flock, atomic-rename and autocommit path every other queue
# write uses. It is filed with `submitted_by: user` and blocked on the
# `quiet_hours` sentinel, which a clock-driven sweep clears an hour later; it
# then surfaces through the ordinary queue hand-over (`/queue:list`,
# `queue next`).
#
# `.claude/deferred-prompts.jsonl` is a **fallback sink only**: if the queue
# plugin is missing or its write fails, the prompt is appended there rather
# than lost, and the block still happens. That path matters because this is a
# public repo — anyone cloning it has no queue plugin, and this hook must
# degrade rather than crash for them. Nothing reads that file back
# automatically, so anything landing in it needs picking up by hand.
#
# Ordering is the invariant: a prompt is blocked only AFTER it has been
# durably written to one sink or the other. Never block on nothing.
#
# ## One owner for Auralis gating
#
# The queue plugin ships its own `UserPromptSubmit` gate
# (`hooks/queue-prompt-gate.sh`). That hook deliberately passes through
# whenever the resolved instance is not `main`, so it never fires here — this
# hook is the sole gate for this checkout, and there is no double-block. The
# two are NOT the same policy and are not meant to converge: the plugin's gate
# has no clock at all (it gates every prompt, always), while this one gates
# only outside a local-time window. Auralis's quiet hours differ from the
# main instance's by design; only the mechanism is shared.
#
# ## Personal, not shared policy
#
# This is a habit-management mechanism for one person, not a team policy —
# unlike usage-gate.sh (checked into .claude/settings.json, applies to anyone
# who clones this public repo), this hook is registered from
# .claude/settings.local.json, which is gitignored and never leaves this
# machine.
#
# ## Per-prompt exemptions (rules A and B)
#
# An earlier version of this hook exempted machine-started sessions via an
# `AURALIS_AUTONOMOUS` environment marker that `auralis-autorun` exported
# before `claude --bg`. That marker **never worked**: `claude --bg` does not
# fork the session from the calling shell, it hands the job to a pre-spawned
# `bg-spare` worker pulled from a daemon's pool, and that worker process
# already existed before the export ran. An exported variable cannot reach a
# process that predates it — this was a structural impossibility, not a
# misconfiguration, verified by checking that AURALIS_AUTONOMOUS was absent
# from every claude process's environ on this machine, including the
# offending session's. Do not reintroduce an environment-marker exemption for
# `--bg` sessions; it cannot work for the same reason a second time.
#
# The replacement classifies each *prompt*, not each session:
#
# **Rule A — the session's own kickoff prompt.** `claude --bg` creates a job
# record at `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/jobs/<jobId>/state.json`
# with an `intent` field fixed at creation time — the exact text the job was
# launched with. Given the payload's `session_id`, glob the jobs directory
# for the `state.json` whose `sessionId` matches, and exempt only when its
# `intent`, stripped, equals the submitted prompt, stripped. This is true at
# most once per session, by construction: every later prompt differs from
# `intent`, including the user's own later messages to that same session.
# Interactive sessions have no job record at all, so they never match and
# fall through to normal gating.
#
# Deliberately per-prompt rather than per-session: a session-level exemption
# would also exempt the *user* texting that same background session at
# 02:00, which is exactly what this hook exists to stop.
#
# Accepted limitation, not a bug: this also passes the first prompt of any
# brand-new session, including one the user starts from their phone outside
# the window — one message per new session slips through, then the gate
# closes on everything after it. This is coherent ("the reason a session
# exists gets delivered, everything after waits") and is not to be closed by
# matching on `respawnFlags` shape or any other launcher fingerprint — that
# was considered and rejected as fragile.
#
# **Rule B — harness-generated prompts.** A prompt that, left-stripped,
# starts with `<task-notification>` is a subagent handing a result back to
# its parent session via UserPromptSubmit, not a human typing — exempt it at
# any hour. Deliberately narrow: `<local-command-caveat>` and
# `<command-name>` are user-initiated slash commands and stay gated.
#
# Both rules are new failure surface (a missing jobs dir, an unreadable or
# malformed `state.json`) and must fail open to *normal gating*, never to a
# crash or to a silent allow — see "Failing open" below.
#
# This hook's exemptions are its own. No other hook should ever adopt an
# autonomy exemption — in particular not usage-gate.sh, which enforces the
# plan-usage ceiling. That ceiling is the repo owner's, it deliberately
# applies to autonomous sessions above all (they are the ones that spend
# unattended with nobody watching), and a general-purpose "skip checks when
# autonomous" flag would gut it. This hook's exemptions are about *who is
# being protected from whom* — the user, from their own texting habit — not
# about bypassing a safety limit, and removing the old env-marker mechanism
# must not be read as softening that warning.
#
# ## Clock
#
# `date`/`datetime.now()` below read THIS MACHINE's local system time, not UTC
# and not any timezone fixed in code. If this checkout is ever used from a box
# in a different timezone, "17:00-18:00" means that box's clock — that is
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
#   AURALIS_TIME_GATE_START  window start, HH:MM (default 17:00)
#   AURALIS_TIME_GATE_END    window end, HH:MM (default 18:00)
#   AURALIS_TIME_GATE_QUEUE  path to the queue file (default under this repo)
#   AURALIS_TIME_GATE_JOBS_DIR  jobs directory for rule A's lookup (default
#                            ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/jobs)
#   AURALIS_TIME_GATE_QUEUE_LIB  directory holding queuelib.py (default
#                            ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/queue/lib).
#                            Set to an empty or nonexistent path to force the
#                            deferred-prompts.jsonl fallback.
#   AURALIS_TIME_GATE_INSTANCE   queue instance to file into (default auralis)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
QUEUE_FILE="${AURALIS_TIME_GATE_QUEUE:-$PROJECT_DIR/.claude/deferred-prompts.jsonl}"
WINDOW_START="${AURALIS_TIME_GATE_START:-17:00}"
WINDOW_END="${AURALIS_TIME_GATE_END:-18:00}"

command -v python3 >/dev/null 2>&1 || exit 0

JOBS_DIR="${AURALIS_TIME_GATE_JOBS_DIR:-${CLAUDE_CONFIG_DIR:-${HOME:-}/.claude}/jobs}"
QUEUE_LIB="${AURALIS_TIME_GATE_QUEUE_LIB-${CLAUDE_CONFIG_DIR:-${HOME:-}/.claude}/skills/queue/lib}"
QUEUE_INSTANCE="${AURALIS_TIME_GATE_INSTANCE:-auralis}"

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
out="$(python3 - "$payload_file" "$QUEUE_FILE" "$WINDOW_START" "$WINDOW_END" "${AURALIS_TIME_GATE_NOW:-}" "$JOBS_DIR" "$QUEUE_LIB" "$QUEUE_INSTANCE" <<'PY'
import datetime
import glob
import json
import os
import sys

(payload_file, queue_file, start_s, end_s, now_override, jobs_dir,
 queue_lib, queue_instance) = (
    sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5],
    sys.argv[6], sys.argv[7], sys.argv[8]
)


def file_into_queue(prompt, visible_at):
    """File the gated prompt into the queue plugin's `auralis` instance.

    Returns the new entry id, or None if the plugin is unavailable or the
    write fails for any reason — the caller then falls back to appending
    deferred-prompts.jsonl. Never raises: a public-repo clone with no queue
    plugin installed must degrade, not crash.
    """
    try:
        if not queue_lib or not os.path.isdir(queue_lib):
            return None
        if queue_lib not in sys.path:
            sys.path.insert(0, queue_lib)
        import queuelib

        instances = queuelib.load_instances()
        cfg = instances.get(queue_instance)
        if not cfg:
            return None

        # v2 API. `initial_prompt` is the user's verbatim words and is
        # deliberately uncapped; `submitted_by: "user"` is what makes
        # submit_entry never raise (it degrades to a defaulted field plus a
        # note rather than dropping the prompt). The 1h delay is expressed
        # as the `quiet_hours` blocked_by sentinel, which the queue's own
        # clock-driven sweep clears — not as a timestamp this hook computes.
        return queuelib.submit_entry(cfg, {
            "initial_prompt": prompt,
            "submitted_by": "user",
            "blocked_by": ["quiet_hours"],
            "reason_blocked": ["submitted during quiet hours; held for 1h"],
        })
    except Exception:
        return None


def append_fallback(prompt, now, visible_at):
    """The pre-2026-08-06 behaviour, kept as a sink of last resort so a
    gated prompt is never silently dropped when the queue write fails."""
    record = {
        "queuedAt": now.isoformat(timespec="seconds"),
        "visibleAt": visible_at.isoformat(timespec="seconds"),
        "prompt": prompt,
    }
    os.makedirs(os.path.dirname(queue_file), exist_ok=True)
    with open(queue_file, "a") as f:
        f.write(json.dumps(record) + "\n")


def parse_hm(s):
    h, m = s.split(":")
    return int(h), int(m)


def is_task_notification(prompt):
    # Rule B: a subagent handing a result back to its own parent session via
    # UserPromptSubmit is not the user texting, at any hour. Deliberately
    # narrow — <local-command-caveat> and <command-name> are user-initiated
    # slash commands and stay gated.
    return prompt.lstrip().startswith("<task-notification>")


def kickoff_intent_matches(prompt, session_id, jobs_dir):
    # Rule A: the prompt that caused a `claude --bg` session to exist is
    # delivered once; everything after it, including the user's own later
    # messages to that session, is gated normally. This is new failure
    # surface (missing dir, unreadable/malformed state.json, permissions) —
    # any error here must return False, never raise, so the caller always
    # falls through to normal gating rather than crashing or wrongly
    # allowing.
    try:
        if not isinstance(session_id, str) or not session_id:
            return False
        for state_path in glob.glob(os.path.join(jobs_dir, "*", "state.json")):
            try:
                with open(state_path) as f:
                    state = json.load(f)
            except Exception:
                continue
            job_session_id = state.get("sessionId")
            if not isinstance(job_session_id, str) or not job_session_id:
                continue
            if job_session_id != session_id:
                continue
            intent = state.get("intent")
            if isinstance(intent, str) and intent.strip() == prompt.strip():
                return True
            return False
        return False
    except Exception:
        return False


try:
    with open(payload_file) as f:
        payload = json.load(f)

    prompt = payload.get("prompt")
    if not isinstance(prompt, str):
        # Either a shape change upstream, or this hook got fired for something
        # that isn't a real UserPromptSubmit event. Never guess at content —
        # fail open.
        sys.exit(0)

    session_id = payload.get("session_id")

    if is_task_notification(prompt):
        sys.exit(0)

    if kickoff_intent_matches(prompt, session_id, jobs_dir):
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

    # Durability before blocking, in that order: a prompt is only ever
    # swallowed once it is safely written somewhere. Queue first; the
    # jsonl append is the fallback sink when the plugin is absent (public
    # clone) or its write failed. If BOTH fail, raise into the except below
    # and let the prompt through ungated — never block on nothing.
    entry_id = file_into_queue(prompt, visible_at)
    if entry_id is None:
        append_fallback(prompt, now, visible_at)

    visible_at_human = visible_at.strftime("%H:%M")
    if visible_at.date() != now.date():
        visible_at_human += " (tomorrow)"

    if entry_id is None:
        where = (
            "Saved to .claude/deferred-prompts.jsonl (fallback — the queue "
            "plugin was unavailable, so this needs picking up by hand)."
        )
        ack = f"Queued to file — readable from {visible_at_human}."
    else:
        where = (
            f"Filed as queue entry #{entry_id} in the `{queue_instance}` "
            f"instance, visible from {visible_at_human} and surfaced through "
            f"the normal queue hand-over (`/queue:list`, `queue next`)."
        )
        ack = f"Filed as #{entry_id} — visible {visible_at_human}."

    reason = (
        f"Queued, not delivered live — outside the {start_s}-{end_s} local-time "
        f"window (now {now.strftime('%H:%M')}, this machine's local system "
        f"clock). {where}"
        f"\n\nReply with exactly this one line and nothing else: \"{ack}\" "
        f"Do not answer the prompt's actual content, and do not add "
        f"commentary — filing already happened."
    )
    out = {
        "decision": "block",
        "reason": reason,
        "systemMessage": (
            f"Message queued, not sent live — outside {start_s}-{end_s}. "
            f"{ack}"
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
