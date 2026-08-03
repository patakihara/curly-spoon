#!/usr/bin/env bash
#
# Subagent activity log. One script, two hook events (see .claude/settings.json).
#
#   SubagentStart   append a "running" row for this agent to the bounded log in
#                   docs/HANDOVER.md, between <!-- AGENT_LOG_START/END -->, AND
#                   append one JSON line to a log shared across every worktree
#                   of this repo (see "Cross-worktree log" below)
#   SubagentStop    find that agent's row (if not already pruned) and flip it
#                   to "ended", with a short summary of its final output — AND
#                   append a matching JSON line to the shared log
#
# ## Why this exists
#
# A session that loses context to compaction, or a fresh session picking up
# after one, has no way to see what background agents were in flight or what
# their IDs were — the transcript that would answer that is exactly what got
# compacted away. This gives "just in case" visibility: agent_id, type,
# launch time, and (once it stops) a one-line summary, without depending on
# anything still being in context.
#
# ## Cross-worktree log
#
# docs/HANDOVER.md is per-checkout: a session working in a git worktree only
# ever sees and writes *that worktree's* copy, so a batch of agents spread
# across several worktrees produces several invisible-to-each-other logs. Every
# worktree of one repo shares a single physical `.git` directory though
# (`git rev-parse --git-common-dir`, verified empirically to resolve to the
# same absolute path from the main checkout and every worktree of it) — a
# location that is never gitignored per branch, never a merge-conflict spot
# (nothing under `.git/` is tracked by any branch, ever), and guaranteed to
# exist for every worktree. So in addition to the per-checkout HANDOVER.md
# section (kept — still the right thing for a session reading its own docs),
# every event also gets appended as one line of plain JSONL to
# `<git-common-dir>/auralis-agent-log.jsonl`, giving a genuinely global view.
#
# Deliberately plain append-only JSONL, not the anchor-delimited Markdown
# HANDOVER.md uses: nothing here is ever read back and rewritten by this
# script, so there is no anchor for injected text to corrupt, and JSON's own
# escaping (via jq) handles arbitrary message content correctly without the
# manual sanitising the Markdown list needs. It is intentionally unbounded —
# unlike the 15-entry HANDOVER.md view, this is meant as a durable forensic
# trail, not a scannable summary. If it ever needs rotation, that is a
# separate, later concern.
#
# Resolved from PROJECT_DIR (the same signal every hook in this repo already
# uses to mean "which checkout is this"), not from the event payload's own
# `cwd` field — one source of truth, and it is what a real multi-worktree
# invocation actually varies by (each worktree has its own on-disk copy of
# this very script, invoked with its own project dir).
#
# ## Bounded, not an appendix
#
# docs/HANDOVER.md is already flagged elsewhere as too long and too narrative.
# This log is deliberately the opposite: a fixed-size list (AURALIS_AGENT_LOG_MAX,
# default 15) that prunes the oldest entry first, never an appendix that grows
# forever.
#
# ## List, not a table — Prettier is why
#
# `prettier --write .` covers docs/*.md in this repo (no docs/ exclusion in
# .prettierignore), and its markdown table printer pads every cell to column
# width. A hook-written table would leave this file permanently "format-dirty"
# after the very next `pnpm format`/`format:check`, for a table only this
# script ever reads back. A bulleted list survives Prettier untouched as long
# as the anchor comments keep a blank line on either side (verified directly:
# `prettier --check` on a blank-line-padded list exits 0; a table needs
# column-padding no writer here maintains).
#
# ## Concurrency
#
# Multiple agents can start or stop within the same second — a batch launch is
# the normal case here, not an edge case (this repo dispatches agents in
# parallel batches by design; see CLAUDE.md's delegation rules). Every
# read-modify-write of HANDOVER.md happens under an exclusive flock on a
# dedicated lock file (never HANDOVER.md itself, so a plain reader opening the
# doc is never blocked), held only for the duration of one hook invocation. The
# write itself lands via a temp file + os.replace (atomic on the same
# filesystem), so a reader can never observe a half-written file even without
# the lock — the lock's job is only to stop two writers from racing each
# other's read, which a bare atomic write alone does not prevent (writer B can
# still read stale state that writer A already wrote past).
#
# ## Anchor-injection is a real corruption path, not paranoia
#
# `last_assistant_message` is model output, and a subagent that worked on this
# very feature can and will quote `<!-- AGENT_LOG_END -->` verbatim in its
# final message. If that lands in a row unsanitised, the next invocation's
# `text.find(END)` matches early, truncating the region and duplicating the
# anchor. clean() strips the comment delimiters and both anchor tokens before
# anything is written — see agent-log.test.sh's anchor-injection case.
#
# ## Failing open
#
# Same direction as usage-gate.sh and time-gate.sh: missing jq, malformed
# stdin, an anchors-missing HANDOVER.md, an unwritable file, a lock that can't
# be acquired in time — every one of these skips logging silently. Neither
# SubagentStart nor SubagentStop can block anything anyway; the only failure
# mode worth preventing is corrupting the doc, not missing an entry.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
HANDOVER_FILE="${AURALIS_AGENT_LOG_FILE:-$PROJECT_DIR/docs/HANDOVER.md}"
# Derived from HANDOVER_FILE by default so a test that overrides the file
# automatically gets a co-located lock too — a separate override left at its
# default would otherwise serialise a throwaway test file against the real
# docs/.HANDOVER.md.lock.
LOCK_FILE="${AURALIS_AGENT_LOG_LOCK:-$(dirname "$HANDOVER_FILE")/.$(basename "$HANDOVER_FILE").lock}"
MAX_ROWS="${AURALIS_AGENT_LOG_MAX:-15}"
# Kept well below this hook's timeout in .claude/settings.json (15s) so flock
# gives up and this exits before the harness kills the process mid-write.
LOCK_TIMEOUT="${AURALIS_AGENT_LOG_LOCK_TIMEOUT:-5}"

# Where the git-common-dir cross-worktree log lives, if this checkout is a git
# repo at all (it always is in practice, but fail open rather than assume).
# Resolved from PROJECT_DIR, not the event payload's own cwd field — see the
# header comment above for why. AURALIS_AGENT_LOG_SHARED overrides the whole
# derivation for tests, independent of whether PROJECT_DIR is a real repo.
GIT_COMMON_DIR=""
if command -v git >/dev/null 2>&1; then
  GIT_COMMON_DIR="$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
  [ -d "$GIT_COMMON_DIR" ] || GIT_COMMON_DIR=""
fi
if [ -n "${AURALIS_AGENT_LOG_SHARED:-}" ]; then
  SHARED_LOG="$AURALIS_AGENT_LOG_SHARED"
elif [ -n "$GIT_COMMON_DIR" ]; then
  SHARED_LOG="$GIT_COMMON_DIR/auralis-agent-log.jsonl"
else
  SHARED_LOG=""
fi
SHARED_LOCK="${SHARED_LOG:+$SHARED_LOG.lock}"

command -v jq >/dev/null 2>&1 || exit 0

payload="$(cat 2>/dev/null)" || exit 0
[ -n "$payload" ] || exit 0

# One jq call extracts and validates. A malformed payload (bad JSON, wrong
# shape) makes jq exit non-zero and this whole hook exits 0 having done
# nothing — never a crash, never a partial write.
#
# subagent_type is preferred for the "type" column (SubagentStart carries it
# and it is the more specific slug); agent_type is the fallback both events
# are documented to carry. last_assistant_message is truncated here too, to
# bound the size of what crosses into argv below regardless of what a
# pathological upstream message contains.
fields="$(printf '%s' "$payload" | jq -e -r '
  [
    (.hook_event_name // ""),
    (.agent_id // ""),
    (.subagent_type // .agent_type // ""),
    ((.last_assistant_message // "") | if (type == "string" and length > 500) then .[0:500] else . end)
  ] | @tsv
' 2>/dev/null)" || exit 0

IFS=$'\t' read -r event agent_id agent_type last_message <<<"$fields"

[ -n "$event" ] && [ -n "$agent_id" ] || exit 0

case "$event" in
SubagentStart | SubagentStop) ;;
*) exit 0 ;;
esac

now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- Per-checkout HANDOVER.md (unchanged from before the cross-worktree log) --
#
# Independent failure domain from the shared-log block below: a HANDOVER.md
# that does not exist, or a docs/ directory that is not writable, must not
# prevent the shared cross-worktree entry from landing, and vice versa.
if [ -f "$HANDOVER_FILE" ]; then
  mkdir -p "$(dirname "$LOCK_FILE")" 2>/dev/null

  # Runs in a subshell so that a failed `exec` redirection (e.g. an unwritable
  # docs/ directory) terminates only the subshell, not this script — a bare
  # `exec 9>...` failing in the top-level shell would otherwise abort the
  # whole script before the shared-log block or the trailing `exit 0` ran.
  (
    exec 9>>"$LOCK_FILE" 2>/dev/null || exit 0
    flock -x -w "$LOCK_TIMEOUT" 9 || exit 0

  python3 - "$HANDOVER_FILE" "$event" "$agent_id" "$agent_type" "$now_iso" "$MAX_ROWS" "$last_message" <<'PY' 2>/dev/null
import os
import re
import sys

(
    handover_file,
    event,
    agent_id,
    agent_type,
    now_iso,
    max_rows_s,
    last_message,
) = sys.argv[1:8]

try:
    max_rows = int(max_rows_s)
except Exception:
    max_rows = 15

START = "<!-- AGENT_LOG_START -->"
END = "<!-- AGENT_LOG_END -->"
EMPTY = "_(no agents logged yet)_"

# "·" is the middle-dot field separator (already decoded to a single
# code point by the time this string is read — not the raw UTF-8 bytes).
LINE_RE = re.compile(
    r"^-\s+`([^`]*)`\s+·\s+`([^`]*)`\s+·\s+([^·]*?)\s+·\s+([^·]*?)\s+·\s+(.*)$"
)


def clean(s, limit=None):
    if not isinstance(s, str):
        s = str(s)
    # jq's @tsv escapes real control characters into two-character literal
    # sequences (backslash-n etc.), so a multi-line message needs both forms
    # flattened, not just the raw control characters.
    for lit in ("\\n", "\\t", "\\r"):
        s = s.replace(lit, " ")
    s = s.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    # Never let logged text reconstruct the anchors this parser keys on, or
    # the field separator/backticks the list format keys on.
    for token in ("<!--", "-->", "AGENT_LOG_START", "AGENT_LOG_END"):
        s = s.replace(token, "")
    s = s.replace("·", "-").replace("`", "'")
    s = " ".join(s.split())
    if limit is not None and len(s) > limit:
        s = s[: max(limit - 1, 0)].rstrip() + "…"
    return s


agent_id = clean(agent_id, 64) or "unknown"
agent_type = clean(agent_type, 40) or "unknown"

try:
    with open(handover_file, "r", encoding="utf-8") as f:
        text = f.read()
except Exception:
    sys.exit(0)

start_i = text.find(START)
end_i = text.find(END)
if start_i == -1 or end_i == -1 or end_i < start_i:
    # Anchors missing or malformed: fail open rather than guess where to put
    # a new section.
    sys.exit(0)

before = text[: start_i + len(START)]
inner = text[start_i + len(START) : end_i]
after = text[end_i:]

rows = []
for line in inner.splitlines():
    m = LINE_RE.match(line.strip())
    if not m:
        continue
    launched, aid, typ, status, summary = m.groups()
    rows.append(
        {
            "launched": launched.strip(),
            "agent_id": aid.strip(),
            "type": typ.strip(),
            "status": status.strip(),
            "summary": summary.strip(),
        }
    )

if event == "SubagentStart":
    rows.append(
        {
            "launched": now_iso,
            "agent_id": agent_id,
            "type": agent_type,
            "status": "running",
            "summary": "—",
        }
    )
    if len(rows) > max_rows:
        rows = rows[-max_rows:]
elif event == "SubagentStop":
    summary = clean(last_message, 150) or "(no output captured)"
    matched = False
    for r in rows:
        if r["agent_id"] == agent_id and r["status"] == "running":
            r["status"] = "ended"
            r["summary"] = summary
            matched = True
            break
    if not matched:
        # Row already pruned, or a stop with no matching start recorded.
        # Not an error: nothing to update, so nothing is written.
        sys.exit(0)
else:
    sys.exit(0)

if rows:
    body = "\n".join(
        f"- `{r['launched']}` · `{r['agent_id']}` · {r['type']} · {r['status']} · {r['summary']}"
        for r in rows
    )
else:
    body = EMPTY

new_inner = "\n\n" + body + "\n\n"
new_text = before + new_inner + after

tmp_path = f"{handover_file}.tmp.{os.getpid()}"
try:
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(new_text)
    os.replace(tmp_path, handover_file)
except Exception:
    try:
        os.remove(tmp_path)
    except Exception:
        pass
    sys.exit(0)
PY
  )
fi

# --- Cross-worktree shared log: <git-common-dir>/auralis-agent-log.jsonl -----
#
# Independent failure domain from the HANDOVER.md block above (see its
# comment): resolving no git-common-dir, having no jq (checked earlier), or an
# unwritable .git directory must not prevent the per-checkout write, and vice
# versa. Plain append under its own lock — no read-modify-write, so no anchor
# for injected text to corrupt; jq's own JSON encoding (via --arg) handles
# arbitrary message content safely, including embedded quotes, backslashes,
# newlines, or literal HTML comment syntax.
if [ -n "$SHARED_LOG" ]; then
  mkdir -p "$(dirname "$SHARED_LOG")" 2>/dev/null

  (
    exec 8>>"$SHARED_LOCK" 2>/dev/null || exit 0
    flock -x -w "$LOCK_TIMEOUT" 8 || exit 0

    jq -nc \
      --arg event "$event" \
      --arg ts "$now_iso" \
      --arg agent_id "$agent_id" \
      --arg agent_type "$agent_type" \
      --arg checkout "$PROJECT_DIR" \
      --arg summary "$last_message" \
      '
        {event: $event, ts: $ts, agent_id: $agent_id, agent_type: $agent_type, checkout: $checkout}
        + (if $event == "SubagentStop" then {summary: $summary} else {} end)
      ' >>"$SHARED_LOG" 2>/dev/null
  )
fi

exit 0
