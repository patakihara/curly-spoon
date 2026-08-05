#!/usr/bin/env bash
#
# Tests for scripts/hooks/worktree-gc.sh.
#
# Every fixture here is a throwaway repo under mktemp -d -- never the real
# checkout. Per this repo's own standing rule (see CLAUDE.md and the plan
# this implements), pruning is destructive and irreversible, so nothing here
# is allowed to touch a real worktree or branch.
#
# The contract under test: a candidate worktree is removed only when all of
# (1) a confirmed ancestor of the named integration branch, (2) a clean
# porcelain, (3) an empty stash, and (4) git's own `worktree remove`/
# `branch -d` (never --force/-D) all agree. A locked worktree, a live
# subagent (per the shared agent-log JSONL), or an unparseable/too-young
# candidate is left alone regardless of git state.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/worktree-gc.sh"

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

# A fresh bare-bones repo, branch claude/media-client-app-k7v9by (the real
# integration branch name), one commit. Returns the repo's path.
new_repo() {
  local dir
  dir="$(mktemp -d)"
  git init -q -b claude/media-client-app-k7v9by "$dir" >/dev/null
  git -C "$dir" config user.email test@example.com
  git -C "$dir" config user.name test
  echo seed >"$dir/seed.txt"
  git -C "$dir" add seed.txt
  git -C "$dir" commit -q -m seed
  printf '%s' "$dir"
}

# Run the hook against $1 (main checkout dir), with a throwaway, per-call log
# and (unless overridden) an empty shared agent log so liveness is never
# accidentally "running" or "ended" for a fixture that didn't set one up.
# Extra args after $1 are passed through as `VAR=value` env overrides.
run_gc() {
  local dir="$1" logfile="$2"
  shift 2
  env CLAUDE_PROJECT_DIR="$dir" \
    AURALIS_WORKTREE_GC_LOG="$logfile" \
    AURALIS_AGENT_LOG_SHARED="${AURALIS_AGENT_LOG_SHARED_OVERRIDE:-$dir/unused-shared-log.jsonl}" \
    AURALIS_WORKTREE_GC_MIN_AGE="${AURALIS_WORKTREE_GC_MIN_AGE_OVERRIDE:-0}" \
    "$@" "$HOOK" >/dev/null 2>&1
}

worktree_exists() {
  git -C "$1" worktree list --porcelain | grep -qxF "worktree $2"
}
branch_exists() {
  git -C "$1" rev-parse --verify --quiet "refs/heads/$2" >/dev/null
}

# --- a clean, merged worktree is removed, and its branch goes with it ---------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-clean1 "$dir/.claude/worktrees/agent-clean1" >/dev/null
log="$(mktemp)"
run_gc "$dir" "$log"

if ! worktree_exists "$dir" "$dir/.claude/worktrees/agent-clean1" &&
  ! branch_exists "$dir" worktree-agent-clean1; then
  ok "clean, merged worktree: worktree and branch both removed"
else
  fail "clean, merged worktree should have been removed: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- an unmerged worktree is kept, worktree and branch both -------------------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-unmerged1 "$dir/.claude/worktrees/agent-unmerged1" >/dev/null
echo diverge >"$dir/.claude/worktrees/agent-unmerged1/d.txt"
git -C "$dir/.claude/worktrees/agent-unmerged1" add d.txt
git -C "$dir/.claude/worktrees/agent-unmerged1" commit -q -m diverge
log="$(mktemp)"
run_gc "$dir" "$log"

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-unmerged1" &&
  branch_exists "$dir" worktree-agent-unmerged1; then
  ok "unmerged worktree: kept (ancestor check refuses)"
else
  fail "unmerged worktree should have been kept: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- a merged but dirty worktree (untracked file) is kept ---------------------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-dirty1 "$dir/.claude/worktrees/agent-dirty1" >/dev/null
echo untracked >"$dir/.claude/worktrees/agent-dirty1/u.txt"
log="$(mktemp)"
run_gc "$dir" "$log"

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-dirty1"; then
  ok "merged worktree with an untracked file: kept (porcelain check refuses)"
else
  fail "dirty worktree should have been kept: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- a merged, porcelain-clean worktree with a stash is kept -------------------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-stash1 "$dir/.claude/worktrees/agent-stash1" >/dev/null
echo tostash >"$dir/.claude/worktrees/agent-stash1/s.txt"
git -C "$dir/.claude/worktrees/agent-stash1" add s.txt
git -C "$dir/.claude/worktrees/agent-stash1" stash push -q -m gc-test
log="$(mktemp)"
run_gc "$dir" "$log"

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-stash1"; then
  ok "merged, clean worktree with a stash entry: kept (stash check refuses)"
else
  fail "stashed worktree should have been kept: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- stash is per-worktree, not repo-global: a stash in worktree A must not --
# skip B ------------------------------------------------------------------
#
# The bug this pins: `git stash` storage lives once per repository (shared
# `.git` dir across every worktree), so `git -C <any-worktree> stash list`
# returns the SAME entries no matter which worktree it is pointed at. The
# earlier version of this check ran that per-candidate, so one forgotten
# stash anywhere in the repo made the check see it from every worktree and
# skip all of them -- pruning silently stopped repo-wide. This fixture has
# two merged, porcelain-clean worktrees: A holds a stash, B does not. A must
# still be kept (attributed to A's own branch); B must be removed regardless
# of A's stash existing in the same repo.

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-stashA "$dir/.claude/worktrees/agent-stashA" >/dev/null
echo tostash >"$dir/.claude/worktrees/agent-stashA/sa.txt"
git -C "$dir/.claude/worktrees/agent-stashA" add sa.txt
git -C "$dir/.claude/worktrees/agent-stashA" stash push -q -m gc-test-a

git -C "$dir" worktree add -q -b worktree-agent-stashB "$dir/.claude/worktrees/agent-stashB" >/dev/null

log="$(mktemp)"
run_gc "$dir" "$log"

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-stashA"; then
  ok "multi-worktree stash: A (has the stash) is still kept"
else
  fail "worktree A should have been kept (its own stash): $(cat "$log")"
fi

if ! worktree_exists "$dir" "$dir/.claude/worktrees/agent-stashB" &&
  ! branch_exists "$dir" worktree-agent-stashB; then
  ok "multi-worktree stash: B (no stash of its own) is removed despite A's stash existing in the same repo"
else
  fail "worktree B should have been removed -- A's stash must not leak into B's check: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- a stash made from a detached HEAD is unattributable: that worktree is --
# kept, but does not block an unrelated named-branch worktree -----------------
#
# Attribution relies on the branch name `git stash list` records the entry
# under; a stash made while detached records the literal "(no branch)",
# indistinguishable from any other detached worktree's stash. This must stay
# conservative (kept) for the detached worktree itself, without regressing
# into blocking every OTHER, named-branch candidate the way the repo-global
# bug did.

dir="$(new_repo)"
git -C "$dir" worktree add -q --detach "$dir/.claude/worktrees/agent-detached1" >/dev/null
echo tostash >"$dir/.claude/worktrees/agent-detached1/sd.txt"
git -C "$dir/.claude/worktrees/agent-detached1" add sd.txt
git -C "$dir/.claude/worktrees/agent-detached1" stash push -q

git -C "$dir" worktree add -q -b worktree-agent-clean-detached-sibling "$dir/.claude/worktrees/agent-clean-detached-sibling" >/dev/null

log="$(mktemp)"
run_gc "$dir" "$log"

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-detached1"; then
  ok "detached-HEAD stash: unattributable, so that worktree is conservatively kept"
else
  fail "detached-HEAD worktree with its own stash should have been kept: $(cat "$log")"
fi

if ! worktree_exists "$dir" "$dir/.claude/worktrees/agent-clean-detached-sibling"; then
  ok "detached-HEAD stash: does not block an unrelated named-branch sibling from being removed"
else
  fail "sibling worktree should have been removed -- a detached-HEAD stash elsewhere must not block it: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- a locked worktree is kept regardless of otherwise being eligible ---------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-locked1 "$dir/.claude/worktrees/agent-locked1" >/dev/null
git -C "$dir" worktree lock "$dir/.claude/worktrees/agent-locked1" >/dev/null
log="$(mktemp)"
run_gc "$dir" "$log"

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-locked1"; then
  ok "locked worktree: kept even though clean and merged"
else
  fail "locked worktree should never be removed: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- a live subagent (SubagentStart, no Stop) blocks removal unconditionally --

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-beef01 "$dir/.claude/worktrees/agent-beef01" >/dev/null
shared="$(mktemp)"
printf '{"event":"SubagentStart","ts":"t","agent_id":"beef01","agent_type":"claude","checkout":"c"}\n' >"$shared"
log="$(mktemp)"
AURALIS_AGENT_LOG_SHARED_OVERRIDE="$shared" run_gc "$dir" "$log"

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-beef01"; then
  ok "clean, merged worktree with a running agent-log entry: kept"
else
  fail "a live subagent's worktree must never be removed: $(cat "$log")"
fi
rm -rf "$dir" "$log" "$shared"

# --- an ended agent (Start + Stop) is removed like any other eligible one -----

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-c0ffee "$dir/.claude/worktrees/agent-c0ffee" >/dev/null
shared="$(mktemp)"
{
  printf '{"event":"SubagentStart","ts":"t","agent_id":"c0ffee","agent_type":"claude","checkout":"c"}\n'
  printf '{"event":"SubagentStop","ts":"t","agent_id":"c0ffee","agent_type":"claude","checkout":"c","summary":"done"}\n'
} >"$shared"
log="$(mktemp)"
AURALIS_AGENT_LOG_SHARED_OVERRIDE="$shared" run_gc "$dir" "$log"

if ! worktree_exists "$dir" "$dir/.claude/worktrees/agent-c0ffee"; then
  ok "clean, merged worktree whose agent-log shows Start+Stop: removed"
else
  fail "an ended agent's eligible worktree should be removed: $(cat "$log")"
fi
rm -rf "$dir" "$log" "$shared"

# --- a name that does not parse into an agent id is a fallback age gate -------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b some-unrelated-branch "$dir/.claude/worktrees/notanagent" >/dev/null
log="$(mktemp)"
# Young: default AURALIS_WORKTREE_GC_MIN_AGE (86400s) wins, must be kept.
AURALIS_WORKTREE_GC_MIN_AGE_OVERRIDE=86400 run_gc "$dir" "$log"
young_kept=1
worktree_exists "$dir" "$dir/.claude/worktrees/notanagent" || young_kept=0

# Old enough (min age forced to 0): falls through to the git-level checks,
# which are clean+merged here, so it is removed.
log2="$(mktemp)"
AURALIS_WORKTREE_GC_MIN_AGE_OVERRIDE=0 run_gc "$dir" "$log2"
old_removed=1
worktree_exists "$dir" "$dir/.claude/worktrees/notanagent" && old_removed=0

if [ "$young_kept" -eq 1 ] && [ "$old_removed" -eq 1 ]; then
  ok "unparseable name: kept while younger than the age threshold, removed once past it"
else
  fail "unparseable-name age gate broken (young_kept=$young_kept old_removed=$old_removed): $(cat "$log") / $(cat "$log2")"
fi
rm -rf "$dir" "$log" "$log2"

# --- an orphan branch (no worktree) that is merged is deleted -----------------

dir="$(new_repo)"
git -C "$dir" branch worktree-agent-orphan-merged HEAD
log="$(mktemp)"
run_gc "$dir" "$log"

if ! branch_exists "$dir" worktree-agent-orphan-merged; then
  ok "orphan branch, merged, no worktree: deleted"
else
  fail "merged orphan branch should have been deleted: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- an orphan branch (no worktree) that is NOT merged is kept ----------------

dir="$(new_repo)"
tmpwt="$dir/.claude/worktrees/agent-tmp-orphan"
git -C "$dir" worktree add -q -b worktree-agent-orphan-unmerged "$tmpwt" >/dev/null
echo diverge >"$tmpwt/d.txt"
git -C "$tmpwt" add d.txt
git -C "$tmpwt" commit -q -m diverge
git -C "$dir" worktree remove "$tmpwt"
log="$(mktemp)"
run_gc "$dir" "$log"

if branch_exists "$dir" worktree-agent-orphan-unmerged; then
  ok "orphan branch, not merged, no worktree: kept"
else
  fail "unmerged orphan branch should never be deleted: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- the worktree the hook is itself running from is never a candidate --------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-self1 "$dir/.claude/worktrees/agent-self1" >/dev/null
log="$(mktemp)"
env CLAUDE_PROJECT_DIR="$dir/.claude/worktrees/agent-self1" \
  AURALIS_WORKTREE_GC_LOG="$log" \
  AURALIS_AGENT_LOG_SHARED="$dir/unused.jsonl" \
  AURALIS_WORKTREE_GC_MIN_AGE=0 \
  "$HOOK" >/dev/null 2>&1

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-self1"; then
  ok "the worktree the pass is running from is excluded from its own candidate list"
else
  fail "self-worktree exclusion failed -- it removed the tree it was running from: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- an interrupted-looking pass recovers via git worktree prune first --------
#
# Not a full crash simulation (that needs killing mid-remove, which is not
# reproducible reliably in a unit test); this just confirms `git worktree
# prune` runs and does not error the whole pass when there is stale
# housekeeping to do. A stale registration is simulated by removing a
# worktree's directory by hand (bypassing `git worktree remove`) and
# confirming the pass still completes and reconciles the metadata.

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-stale1 "$dir/.claude/worktrees/agent-stale1" >/dev/null
rm -rf "$dir/.claude/worktrees/agent-stale1"
log="$(mktemp)"
run_gc "$dir" "$log"

if git -C "$dir" worktree list --porcelain | grep -q "agent-stale1"; then
  fail "git worktree prune should have reconciled the stale entry: $(cat "$log")"
else
  ok "a stale worktree administrative entry is reconciled via git worktree prune"
fi
rm -rf "$dir" "$log"

# --- the stray, non-worktree file under .claude/worktrees is never touched ----

dir="$(new_repo)"
mkdir -p "$dir/.claude/worktrees"
echo "some saved diff" >"$dir/.claude/worktrees/leftover.diff"
log="$(mktemp)"
run_gc "$dir" "$log"

if [ -f "$dir/.claude/worktrees/leftover.diff" ]; then
  ok "a stray non-worktree file under .claude/worktrees is left alone"
else
  fail "a stray file that is not a registered worktree must never be deleted"
fi
rm -rf "$dir" "$log"

# --- the named integration branch not existing removes nothing ----------------

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-noTarget "$dir/.claude/worktrees/agent-noTarget" >/dev/null
log="$(mktemp)"
env CLAUDE_PROJECT_DIR="$dir" \
  AURALIS_WORKTREE_GC_LOG="$log" \
  AURALIS_AGENT_LOG_SHARED="$dir/unused.jsonl" \
  AURALIS_WORKTREE_GC_BRANCH="branch-that-does-not-exist" \
  AURALIS_WORKTREE_GC_MIN_AGE=0 \
  "$HOOK" >/dev/null 2>&1

if worktree_exists "$dir" "$dir/.claude/worktrees/agent-noTarget"; then
  ok "an unresolvable integration branch removes nothing this pass"
else
  fail "should have aborted the whole pass rather than guessing: $(cat "$log")"
fi
rm -rf "$dir" "$log"

# --- not a git repo at all: exits cleanly, does not crash ---------------------

dir="$(mktemp -d)"
out="$(CLAUDE_PROJECT_DIR="$dir" "$HOOK" 2>&1)"
status=$?
if [ "$status" -eq 0 ] && [ -z "$out" ]; then
  ok "not a git repo: exits 0 silently"
else
  fail "non-repo dir should exit 0 with no output (status=$status output=$out)"
fi
rm -rf "$dir"

# --- HOME and every XDG var unset: the default-path branches must not crash ---
#
# This is the shape time-gate.sh's own tests structurally could not catch
# (every case there set the env override, so the bare ${HOME:-...} default
# branch never evaluated under set -u). Every default here is written as
# ${VAR:-${HOME:-}/...} for exactly this reason -- assert it holds.

dir="$(new_repo)"
out="$(env -u HOME -u XDG_STATE_HOME -u AURALIS_WORKTREE_GC_LOG -u AURALIS_AGENT_LOG_SHARED \
  CLAUDE_PROJECT_DIR="$dir" PATH="$PATH" "$HOOK" 2>&1)"
status=$?
if [ "$status" -eq 0 ] && ! printf '%s' "$out" | grep -qi "unbound variable"; then
  ok "HOME and XDG_STATE_HOME unset: no crash on the default-path branch"
else
  fail "unset HOME/XDG crashed the default path (status=$status): $out"
fi
rm -rf "$dir"

# --- missing python3: fails open (exits 0, prunes nothing) rather than crashing

dir="$(new_repo)"
git -C "$dir" worktree add -q -b worktree-agent-nopy "$dir/.claude/worktrees/agent-nopy" >/dev/null
fakebin="$(mktemp -d)"
for tool in git grep timeout stat date find basename dirname mkdir cat env bash sh; do
  real="$(command -v "$tool" 2>/dev/null)"
  [ -n "$real" ] && ln -s "$real" "$fakebin/$tool"
done
log="$(mktemp)"
out="$(env -i PATH="$fakebin" CLAUDE_PROJECT_DIR="$dir" AURALIS_WORKTREE_GC_LOG="$log" HOME="$HOME" bash "$HOOK" 2>&1)"
status=$?
if [ "$status" -eq 0 ] && worktree_exists "$dir" "$dir/.claude/worktrees/agent-nopy"; then
  ok "missing python3: exits 0, removes nothing"
else
  fail "missing python3 should fail open, not crash or remove anything (status=$status): $out"
fi
rm -rf "$dir" "$log" "$fakebin"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
