#!/usr/bin/env bash
#
# Worktree/branch garbage collection for this repo's subagent worktrees.
#
# Called from four places, ranked by how strong a guarantee each gives that
# it actually runs (see scripts/hooks/usage-gate.sh and bin/auralis-autorun
# in $HOME for the call sites):
#
#   1. usage-gate.sh, at the hard usage-ceiling trigger. Strongest: fires
#      exactly once per retirement, as part of the hook invocation that is
#      already running on the way to denying that tool call.
#   2. usage-gate.sh, on every SessionStart. Second-strongest: once per new
#      session, unconditionally -- the fresh successor's own chance to finish
#      whatever the retiring incumbent could not (e.g. a subagent still live
#      at that moment; see the liveness gate below).
#   3. usage-gate.sh, throttled, riding ordinary PreToolUse traffic. Weakest
#      guarantee, but the one that matches where the real backlog was found
#      to accumulate: worktree-agent-* branches and worktrees pile up during
#      ordinary, well-below-any-ceiling subagent work, not around retirement.
#   4. bin/auralis-autorun's own timer tick, on this host. The backstop for
#      everything above: the one thing still running when nothing in the
#      repo is alive to.
#
# Every caller backgrounds/detaches this script and never inspects its exit
# code or output. A pass that fails, hangs, or removes nothing has zero
# effect on anything else in this design -- retirement, the respawn timer,
# and gating decisions elsewhere never consult it.
#
# ## Script-only, no model in the loop, ever
#
# Every check below -- git worktree list, git merge-base --is-ancestor, git
# status --porcelain, git stash list, git worktree remove, git branch -d, git
# worktree prune -- is a plain git/shell operation with a deterministic exit
# code. Nothing here should ever gain an Agent call or a `claude -p`
# classification step. A pruning decision that depends on a model's read of
# "does this look done" applied to a *destructive* operation is a strictly
# worse bet than the one delegation-nudge.sh's own abandoned live-
# classification path already lost on a non-blocking nudge (see
# docs/HANDOVER.md). Determinism is the entire basis for trusting an
# unattended, irreversible operation at all.
#
# ## The safety rail, four layers
#
#   1. Ancestor check: a candidate worktree's HEAD must be a confirmed
#      ancestor of the named integration branch's tip (AURALIS_WORKTREE_GC_
#      BRANCH), resolved against the MAIN checkout -- never against this
#      script's own HEAD, which can itself be a worktree if the invoking
#      session's harness forced it into one.
#   2. Porcelain-empty: `git status --porcelain` in the candidate must be
#      exactly empty (this also catches untracked files).
#   3. Stash-empty, per-branch: no `git stash` entry attributable to the
#      candidate's own branch (stash storage is repo-global -- see
#      worktree_has_attributable_stash() below for how attribution works and
#      what it cannot see).
#   4. Git's own refusals, as a backstop under this script's own logic, not
#      merely a courtesy: `git worktree remove` runs WITHOUT --force and
#      `git branch -d` is used, NEVER -D. A refusal from either is always a
#      skip, logged, never retried around with a force flag. Do not add
#      --force or -D anywhere in this file to "make a stuck case work" --
#      that silently disables the one check that does not depend on this
#      script's own code being correct.
#
# A locked worktree (`git worktree lock`) is skipped unconditionally,
# regardless of what the other checks say.
#
# ## Liveness gate (why git-clean is not enough by itself)
#
# agent-log.sh's global JSONL (<git-common-dir>/auralis-agent-log.jsonl, or
# AURALIS_AGENT_LOG_SHARED in tests) records SubagentStart/SubagentStop per
# agent_id, but does not record which worktree an agent used -- correlation
# to a specific `.claude/worktrees/agent-<id>` directory relies on the
# observed `agent-<id>` / `worktree-agent-<id>` naming convention alone, not
# on anything the log structurally guarantees. If a candidate's name does not
# parse into a recognizable agent_id, or the log has no entries for the id it
# does parse into, liveness is UNKNOWN -- never treated as safe. An unknown
# candidate is skipped unless it is already older than
# AURALIS_WORKTREE_GC_MIN_AGE, in which case it falls through to the git-
# level checks above (which remain the real, harness-independent safety net
# either way). A "running" entry (SubagentStart with no matching
# SubagentStop) is skipped unconditionally, regardless of git state --
# whether a killed-mid-flight agent ever gets a SubagentStop at all is
# unverified, so absence of a Stop is never read as "done".
#
# This is a *reduction* of the timing race Auralis's own CLAUDE.md documents
# (exiting a worktree while a subagent was still writing into it dropped a
# pending edit), not an elimination of it: a worktree can be git-clean at the
# instant it is checked and still have a live writer about to land a change a
# moment later. Layer 2/3 above and this gate both narrow that window; they
# do not close it.
#
# ## Recovering from an interrupted pass
#
# `git worktree prune` (metadata-only, non-destructive -- distinct from what
# this script does, which is why this script is not itself named with
# "prune" in it) runs first, every pass, before `git worktree list` is
# trusted for anything else -- a previous pass killed mid-`git worktree
# remove` by a hook timeout can leave a stale `.git/worktrees/<name>/` entry
# that this reconciles.
#
# ## What this script will never touch
#
# Anything under .claude/worktrees/ that `git worktree list` does not itself
# recognize as a registered worktree -- e.g. a stray .diff file someone
# deliberately saved. This script's authority is scoped strictly to entries
# that command reports; a loose file it does not structurally understand is
# out of scope for automatic deletion by design, logged and left alone.
#
# ## Env knobs (all optional)
#
#   AURALIS_WORKTREE_GC_BRANCH         integration branch worktree HEADs are
#                                       tested as an ancestor of (default:
#                                       claude/media-client-app-k7v9by)
#   AURALIS_WORKTREE_GC_BRANCH_PREFIX  branch-name prefix considered for the
#                                       orphan-branch pass (default:
#                                       worktree-agent-)
#   AURALIS_WORKTREE_GC_MIN_AGE        fallback age threshold in seconds for
#                                       an unparseable/unknown-liveness
#                                       candidate before the git-level checks
#                                       are even attempted (default: 86400)
#   AURALIS_WORKTREE_GC_GIT_TIMEOUT    per-git-call timeout in seconds
#                                       (default: 30)
#   AURALIS_AGENT_LOG_SHARED           path to the shared agent-log JSONL
#                                       (default: derived from git-common-dir,
#                                       same override agent-log.sh itself
#                                       uses -- shared name deliberately, so a
#                                       test pointing agent-log.sh at a
#                                       fixture log also points this here)
#   AURALIS_WORKTREE_GC_LOG            where this script's own run log is
#                                       appended (default:
#                                       $XDG_STATE_HOME/auralis-respawn/
#                                       worktree-gc.log)
#   CLAUDE_PROJECT_DIR                 which checkout this pass runs for
#                                       (same signal every hook in this repo
#                                       already uses); the MAIN checkout and
#                                       the shared log are both resolved from
#                                       this via git-common-dir, never from
#                                       this process's own HEAD/cwd.
#
# ## Failing open
#
# Same direction as usage-gate.sh/agent-log.sh: not a git repo, no git, no
# python3, no resolvable integration branch, an unreadable candidate -- all
# of these skip that candidate (or the whole pass) rather than guessing or
# crashing. Failing open here means "prune nothing", never "prune anyway".

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

command -v git >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

GIT_COMMON_DIR="$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
[ -n "$GIT_COMMON_DIR" ] && [ -d "$GIT_COMMON_DIR" ] || exit 0
MAIN_CHECKOUT="$(dirname "$GIT_COMMON_DIR")"
[ -d "$MAIN_CHECKOUT" ] || exit 0

GIT_TIMEOUT="${AURALIS_WORKTREE_GC_GIT_TIMEOUT:-30}"
MIN_AGE="${AURALIS_WORKTREE_GC_MIN_AGE:-86400}"
TARGET_BRANCH="${AURALIS_WORKTREE_GC_BRANCH:-claude/media-client-app-k7v9by}"
PREFIX="${AURALIS_WORKTREE_GC_BRANCH_PREFIX:-worktree-agent-}"
SHARED_LOG="${AURALIS_AGENT_LOG_SHARED:-$GIT_COMMON_DIR/auralis-agent-log.jsonl}"
LOG_FILE="${AURALIS_WORKTREE_GC_LOG:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/auralis-respawn/worktree-gc.log}"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null

log() {
  local line
  line="$(date -Is 2>/dev/null || date) worktree-gc: $*"
  printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null
  printf '%s\n' "$line"
}

# --- recover from any pass a previous invocation's hook timeout interrupted -
timeout "$GIT_TIMEOUT" git -C "$MAIN_CHECKOUT" worktree prune 2>>"$LOG_FILE" ||
  log "note: git worktree prune exited non-zero (continuing anyway)"

TARGET_SHA="$(git -C "$MAIN_CHECKOUT" rev-parse --verify "refs/heads/$TARGET_BRANCH" 2>/dev/null)"
if [ -z "$TARGET_SHA" ]; then
  log "abort: cannot resolve refs/heads/$TARGET_BRANCH from $MAIN_CHECKOUT -- removing nothing this pass"
  exit 0
fi

SELF_WORKTREE="$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --show-toplevel 2>/dev/null)"

# --- parse `git worktree list --porcelain` into path/head/branch/locked rows
rows="$(git -C "$MAIN_CHECKOUT" worktree list --porcelain 2>/dev/null | python3 -c '
import sys


def emit(b):
    if not b:
        return
    path = b.get("worktree", "")
    head = b.get("HEAD", "")
    branch = b.get("branch", "")
    if branch.startswith("refs/heads/"):
        branch = branch[len("refs/heads/") :]
    locked = "1" if "locked" in b else "0"
    # 0x1f (unit separator), not a tab. The bash reader on the other end
    # (IFS set to a literal tab, read -r) still collapses runs of tabs and
    # drops empty fields, because tab is one of the IFS-whitespace
    # characters bash always treats specially for splitting no matter what
    # IFS is actually set to -- verified directly, not assumed. A detached
    # worktree has an empty branch field, and that bit for real: it shifted
    # the locked column into branch, so a detached candidate was evaluated
    # with a corrupted branch name instead of being correctly recognized as
    # detached. Git refnames cannot contain control characters, so 0x1f
    # cannot collide with a real branch name or path.
    print("\x1f".join([path, head, branch, locked]))


block = {}
for raw in sys.stdin:
    line = raw.rstrip("\n")
    if line == "":
        emit(block)
        block = {}
        continue
    if " " in line:
        key, val = line.split(" ", 1)
    else:
        key, val = line, ""
    if key == "worktree":
        block["worktree"] = val
    elif key == "HEAD":
        block["HEAD"] = val
    elif key == "branch":
        block["branch"] = val
    elif key == "locked":
        block["locked"] = val
    elif key == "detached":
        block["branch"] = ""
emit(block)
')"

# --- pass 1: which branches are attached to a registered worktree right now -
attached_branches=""
while IFS=$'\x1f' read -r _path _head branch _locked; do
  [ -n "$branch" ] || continue
  attached_branches="$attached_branches$branch
"
done <<<"$rows"

is_attached() {
  printf '%s\n' "$attached_branches" | grep -qxF "$1"
}

extract_agent_id() {
  local base="$1" branch="$2"
  if [[ "$base" =~ ^agent-([0-9a-f]+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  if [[ "$branch" =~ ^worktree-agent-([0-9a-f]+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi
  printf ''
}

# Bounded: grep filters the (intentionally unbounded, per agent-log.sh's own
# header) shared log to lines mentioning this agent_id first; only those
# lines are ever inspected further. Never a full parse of the file.
agent_liveness() {
  local agent_id="$1"
  if [ -z "$agent_id" ] || [ ! -f "$SHARED_LOG" ]; then
    printf 'unknown'
    return
  fi
  local matches
  matches="$(grep -F "\"agent_id\":\"$agent_id\"" "$SHARED_LOG" 2>/dev/null)"
  if [ -z "$matches" ]; then
    printf 'unknown'
    return
  fi
  if printf '%s\n' "$matches" | grep -q '"event":"SubagentStop"'; then
    printf 'ended'
    return
  fi
  if printf '%s\n' "$matches" | grep -q '"event":"SubagentStart"'; then
    printf 'running'
    return
  fi
  printf 'unknown'
}

worktree_age_ok() {
  local path="$1" mtime now
  mtime="$(stat -c %Y "$path" 2>/dev/null)" || return 1
  now="$(date +%s)"
  [ $((now - mtime)) -ge "$MIN_AGE" ]
}

# --- resolve stash entries ONCE, attributed to the branch each was made on --
# `git stash` storage lives once per repository, under the shared `.git` dir
# -- there is no per-worktree stash. `git -C <any-worktree> stash list`
# therefore returns the identical, repo-global list regardless of which
# worktree's path it is pointed at. Querying it per-candidate (as an earlier
# version of this script did) cannot distinguish "this worktree has a
# stash" from "some OTHER worktree has a stash" -- one forgotten stash
# anywhere in the repo made every candidate look stashed, defeating pruning
# repo-wide. The fix: read the list once, attribute each entry to the branch
# it names, and match that against the CANDIDATE's own branch (already
# resolved above from `git worktree list --porcelain`) instead of asking
# per-worktree.
#
# Attribution source: `%gs` is the stash reflog subject -- the exact text
# `git stash list`'s default output shows -- and git writes it in one of two
# shapes: `WIP on <branch>: <sha> <subject>` (plain `stash push`/`save`) or
# `On <branch>: <message>` (`stash push -m`/`save -m`). Verified directly
# against a scratch repo rather than assumed. Both start with the branch
# name up to the first `:`, which is what is parsed below.
#
# What this still cannot see, by design kept conservative rather than
# guessed at:
#   - A stash made from a DETACHED HEAD records the branch as the literal
#     string "(no branch)", identical for every detached worktree in the
#     repo -- there is nothing in the stash entry itself that says which
#     detached worktree made it.
#   - A stash made while on a branch that was later renamed still names the
#     OLD branch name -- it will never match the worktree's current branch,
#     so it will not be attributed to it.
#   - A branch name that itself contains ": " would break the naive split
#     below; not handled specially, since `worktree-agent-*` branch names
#     never contain one.
# In every one of these cases attribution is impossible, not merely
# unlikely, and the check stays fail-safe rather than narrowing further:
# see worktree_has_attributable_stash()'s handling of a DETACHED candidate
# below, which skips it whenever any such unattributable entry exists,
# because it cannot be ruled out as belonging to that candidate.
stash_list_output="$(timeout "$GIT_TIMEOUT" git -C "$MAIN_CHECKOUT" stash list --format='%gs' 2>/dev/null)"
stash_list_rc=$?

stash_branches=""  # newline-separated branch names with an attributable stash
stash_ambiguous=0  # count of stash entries this script cannot attribute to any branch

if [ "$stash_list_rc" -eq 0 ] && [ -n "$stash_list_output" ]; then
  while IFS= read -r subject; do
    [ -n "$subject" ] || continue
    case "$subject" in
    "WIP on "* | "On "*)
      rest="${subject#WIP on }"
      rest="${rest#On }"
      branch_of_stash="${rest%%:*}"
      if [ -z "$branch_of_stash" ] || [ "$branch_of_stash" = "(no branch)" ]; then
        stash_ambiguous=$((stash_ambiguous + 1))
      else
        stash_branches="$stash_branches$branch_of_stash
"
      fi
      ;;
    *)
      # Reflog subject didn't match either known shape (e.g. an entry made
      # by `git stash store` rather than `push`/`save`) -- cannot attribute.
      stash_ambiguous=$((stash_ambiguous + 1))
      ;;
    esac
  done <<<"$stash_list_output"
fi

worktree_has_attributable_stash() {
  local branch="$1"
  if [ "$stash_list_rc" -ne 0 ]; then
    return 0 # stash list itself unreadable: fail safe, same as before
  fi
  if [ -z "$branch" ]; then
    # Candidate itself is on a detached HEAD -- see the comment above; any
    # unattributable entry might be this worktree's, so it cannot be cleared.
    [ "$stash_ambiguous" -gt 0 ]
    return
  fi
  printf '%s\n' "$stash_branches" | grep -qxF "$branch"
}

# --- pass 2: evaluate every candidate worktree, remove what clears all rails
while IFS=$'\x1f' read -r path head branch locked; do
  [ -n "$path" ] || continue
  [ "$path" = "$MAIN_CHECKOUT" ] && continue

  if [ "$locked" = "1" ]; then
    log "skip $path: locked"
    continue
  fi
  if [ -n "$SELF_WORKTREE" ] && [ "$path" = "$SELF_WORKTREE" ]; then
    log "skip $path: this pass is running from inside it"
    continue
  fi
  if [ ! -d "$path" ]; then
    log "skip $path: git worktree list reported it but the directory is gone (leave it for the next git worktree prune)"
    continue
  fi

  base="$(basename "$path")"
  agent_id="$(extract_agent_id "$base" "$branch")"
  liveness="$(agent_liveness "$agent_id")"

  if [ "$liveness" = "running" ]; then
    log "skip $path: agent-log shows agent_id ${agent_id:-<unparsed>} still running"
    continue
  fi
  if [ "$liveness" = "unknown" ]; then
    if ! worktree_age_ok "$path"; then
      log "skip $path: liveness unknown (agent_id=${agent_id:-<unparsed>}) and younger than the ${MIN_AGE}s fallback threshold"
      continue
    fi
    log "note $path: liveness unknown (agent_id=${agent_id:-<unparsed>}) but past the age threshold -- relying on the git-level checks"
  fi

  if [ -z "$head" ]; then
    log "skip $path: could not read HEAD from worktree list"
    continue
  fi
  if ! timeout "$GIT_TIMEOUT" git -C "$MAIN_CHECKOUT" merge-base --is-ancestor "$head" "$TARGET_SHA" 2>/dev/null; then
    log "skip $path: HEAD $head is not a confirmed ancestor of $TARGET_BRANCH"
    continue
  fi

  porcelain="$(timeout "$GIT_TIMEOUT" git -C "$path" status --porcelain 2>/dev/null)"
  porcelain_rc=$?
  if [ "$porcelain_rc" -ne 0 ] || [ -n "$porcelain" ]; then
    log "skip $path: working tree not clean (or unreadable)"
    continue
  fi

  if worktree_has_attributable_stash "$branch"; then
    log "skip $path: has a stash entry attributable to ${branch:-its own detached HEAD} (or the stash list was unreadable)"
    continue
  fi

  # No --force, ever -- a refusal here is git's own independent check on top
  # of the three above, and is always a skip, never retried around.
  if timeout "$GIT_TIMEOUT" git -C "$MAIN_CHECKOUT" worktree remove "$path" 2>>"$LOG_FILE"; then
    log "removed worktree $path"
    if [ -n "$branch" ]; then
      # No -D, ever. The ancestor check above already establishes this is
      # merged; -d's own refusal here would be new information, not expected.
      if timeout "$GIT_TIMEOUT" git -C "$MAIN_CHECKOUT" branch -d "$branch" 2>>"$LOG_FILE"; then
        log "removed branch $branch"
      else
        log "worktree $path removed but git branch -d refused $branch -- leaving it"
      fi
    fi
  else
    log "skip $path: git worktree remove refused or failed"
  fi
done <<<"$rows"

# --- pass 3: branches matching the prefix with no worktree attached at all -
all_prefixed="$(git -C "$MAIN_CHECKOUT" branch --list "${PREFIX}*" --format='%(refname:short)' 2>/dev/null)"
while IFS= read -r name; do
  [ -n "$name" ] || continue
  is_attached "$name" && continue

  sha="$(git -C "$MAIN_CHECKOUT" rev-parse --verify "refs/heads/$name" 2>/dev/null)"
  [ -n "$sha" ] || continue

  if ! timeout "$GIT_TIMEOUT" git -C "$MAIN_CHECKOUT" merge-base --is-ancestor "$sha" "$TARGET_SHA" 2>/dev/null; then
    log "skip orphan branch $name: not a confirmed ancestor of $TARGET_BRANCH"
    continue
  fi

  if timeout "$GIT_TIMEOUT" git -C "$MAIN_CHECKOUT" branch -d "$name" 2>>"$LOG_FILE"; then
    log "removed orphan branch $name"
  else
    log "skip orphan branch $name: git branch -d refused"
  fi
done <<<"$all_prefixed"

# --- note, never touch: anything under .claude/worktrees git does not know -
strays_dir="$MAIN_CHECKOUT/.claude/worktrees"
if [ -d "$strays_dir" ]; then
  while IFS= read -r -d '' f; do
    log "note: non-worktree entry under .claude/worktrees left untouched: $f"
  done < <(find "$strays_dir" -maxdepth 1 -mindepth 1 ! -type d -print0 2>/dev/null)
fi

exit 0
