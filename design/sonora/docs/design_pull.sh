#!/usr/bin/env bash
# Pull the full remote state of a Claude Design project into a git worktree, as a "theirs"
# commit ready to `git merge`.
#
# DesignSync has no bulk export and no history — four verbs (list_files, get_file, write_files,
# delete_files), nothing else. It is also orchestrator-only: a subagent's ToolSearch("select:
# DesignSync") comes back empty, confirmed empirically, so the ~200-400 get_file calls a full
# pull needs cannot be delegated to a subagent from inside a running session.
#
# What CAN be delegated is the orchestrator role itself: `claude -p` starts a fresh top-level
# session, which is its own orchestrator, so DesignSync is available to it. That session's
# transcript is append-only and survives its own context compaction, so it does not need to hold
# hundreds of files in context at once — it only needs to fetch each one and move on. This
# script drives exactly that, then replays the transcript onto disk with extract_ds.py (see
# there for why replay beats re-typing) and commits it as a clean "remote state" point old
# enough for git to 3-way merge against.
#
# WHY THERE IS A RETRY LOOP, NOT ONE SHOT: the first real run of this script had a puller
# session stop after components/forms/ — a bit over a third of the way through — and still
# report "✅ All text files successfully fetched with no errors" in the very same message that
# also said the rest "would continue the same pattern". A natural-language summary from the
# agent that did the fetching is not evidence; the transcript is. So after every attempt, this
# script computes the ACTUAL fetched set against the ACTUAL list_files result
# (docs/ds_check_complete.py) and only trusts that. Anything still missing gets a focused
# follow-up attempt — a short, concrete list of paths is far more likely to finish than "pull
# ~200 files" is — up to --max-attempts times.
#
# Usage:
#   docs/design_pull.sh <project-id> <worktree-path> [base-ref] [--model=haiku] [--max-attempts=4]
#
# Example:
#   docs/design_pull.sh 6c14357e-f54e-4ad9-99e0-d7fd5ab02144 ../sonora-sync 2184b06
#
# Exit 0: everything was fetched, worktree has one commit with the full remote state.
# Exit 1: gave up after --max-attempts with files still missing. The worktree still gets a
#         commit (partial data found is better than none, per this project's own "no silent
#         caps" rule) but its message says PARTIAL and lists what's missing — never merge that
#         commit believing it is complete.
#
# Nothing here calls `git merge` — that decision, and resolving any real conflicts, stays yours.
set -euo pipefail

PROJECT_ID="${1:?usage: design_pull.sh <project-id> <worktree-path> [base-ref] [--model=haiku] [--max-attempts=N]}"
WORKTREE="${2:?usage: design_pull.sh <project-id> <worktree-path> [base-ref] [--model=haiku] [--max-attempts=N]}"
BASE_REF="${3:-HEAD}"
MODEL="haiku"
MAX_ATTEMPTS=4
for a in "$@"; do
  case "$a" in
    --model=*) MODEL="${a#--model=}";;
    --max-attempts=*) MAX_ATTEMPTS="${a#--max-attempts=}";;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE_DIR="$(mktemp -d)"
mkdir -p "$STAGE_DIR"

# The project-dir name Claude Code derives from a session's cwd: every '/' AND every '.' become
# '-'. Confirmed against real project dirs (~/.claude-shared -> -home-<user>--claude-shared: the
# '.' of .claude-shared becomes its own dash, distinct from the '/' before it). Missing the '.'
# case here made the first real run of this script fail to find its own transcript on the first
# try — it recovered via the find(1) fallback below, but this fixes the actual bug rather than
# leaning on the fallback forever.
project_dir_name() { python3 -c "import sys; print(sys.argv[1].replace('/', '-').replace('.', '-'))" "$1"; }

find_transcript() {
  local sid="$1" cwd="$2"
  local primary="$HOME/.claude/projects/$(project_dir_name "$cwd")/$sid.jsonl"
  if [ -f "$primary" ]; then echo "$primary"; return 0; fi
  find "$HOME/.claude/projects" -maxdepth 2 -name "$sid.jsonl" 2>/dev/null | head -1
}

echo "== repo:          $REPO_ROOT"
echo "== project:       $PROJECT_ID"
echo "== worktree:      $WORKTREE"
echo "== base ref:      $BASE_REF"
echo "== model:         $MODEL"
echo "== max attempts:  $MAX_ATTEMPTS"

TRANSCRIPTS=()
MISSING_FILE="$STAGE_DIR/missing.txt"
: > "$MISSING_FILE"   # attempt 1 needs an empty "already tried" list — see prompt below

attempt=1
while :; do
  SESSION_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
  PULLER_CWD="$STAGE_DIR/attempt-$attempt"
  mkdir -p "$PULLER_CWD"
  # A throwaway cwd, not the real repo: this session must never see or touch the working tree it
  # is pulling INTO. Its only job is to hold a DesignSync credential and fetch; if it can see the
  # repo, a model that decides to be "helpful" could write files, and the guarantee that the
  # transcript is a pure, unfiltered fetch log is gone.

  if [ "$attempt" -eq 1 ]; then
    cat > "$PULLER_CWD/PULL_PROMPT.txt" <<PROMPT_EOF
You are doing a bulk read-only mirror pull from a Claude Design project. This is
mechanical work. Do not analyse, summarise, or improve anything.

Project: $PROJECT_ID

STEP 1. Load the DesignSync tool:  ToolSearch  query "select:DesignSync"

STEP 2. Call DesignSync { method: "list_files", projectId: "$PROJECT_ID" } to get every path.

STEP 3. For EVERY path that is a text file, call
        DesignSync { method: "get_file", projectId: "$PROJECT_ID", path: "<path>" }
        one call per file, until none are left. This will be several hundred calls for a
        real project — that is expected, not a sign something is wrong. Do not stop partway
        through and summarize; there is no partial credit, only a complete pull is useful.

        Include: *.jsx *.d.ts *.card.html *.css *.md *.js *.json *.html
        Skip:    assets/**  uploads/**  .thumbnail  *.png *.jpg *.svg
        Skip:    _ds_bundle.js  (it is huge and generated)

STEP 4. Report ONLY: how many files you fetched, and a list of any that errored. Do not
        claim completion unless you have actually made a get_file call for every single
        wanted path from step 2 — going quiet partway through and writing a confident
        summary anyway is worse than reporting an honest partial count.

HARD RULES
- NEVER call finalize_plan, write_files, delete_files, register_assets, or
  unregister_assets. This is a read-only job. If something seems to want a
  write, stop and say so instead.
- Do NOT write the file contents to disk, do not echo them back, do not
  summarise them. Fetching them is the entire job — the contents are being
  harvested from your session transcript afterwards, so they only need to pass
  through once.
- Do NOT stop early because it feels repetitive or because your context is
  filling up. Let it compact as often as it needs to; the transcript keeps
  everything even after compaction. Keep going until every path is fetched.
- If a get_file fails, note the path and carry on. Do not retry more than once.
PROMPT_EOF
  else
    # Focused retry: a concrete, bounded list is a much easier task to actually finish than
    # "pull everything" was, and it's the direct product of ds_check_complete.py's diff against
    # the real list_files result — not a guess about what might be missing.
    {
      echo "A previous pull of this same Claude Design project (id: $PROJECT_ID) did not finish."
      echo "The following $(wc -l < "$MISSING_FILE" | tr -d ' ') paths were never fetched. Fetch"
      echo "ONLY these, nothing else — this is a small, bounded list, finish all of it:"
      echo
      cat "$MISSING_FILE"
      echo
      echo "STEP 1. Load the DesignSync tool:  ToolSearch  query \"select:DesignSync\""
      echo "STEP 2. For each path above, call DesignSync { method: \"get_file\", projectId: \"$PROJECT_ID\", path: \"<path>\" }"
      echo "STEP 3. Report how many you fetched and any that errored."
      echo
      echo "HARD RULES: same as any DesignSync read pass — never call finalize_plan, write_files,"
      echo "delete_files, register_assets, or unregister_assets. Do not write contents to disk or"
      echo "echo them back; fetching is the whole job. Do not stop until every path above is done."
    } > "$PULLER_CWD/PULL_PROMPT.txt"
  fi

  echo
  echo "== attempt $attempt/$MAX_ATTEMPTS: running puller session ($([ "$attempt" -eq 1 ] && echo "full pull" || echo "$(wc -l < "$MISSING_FILE" | tr -d ' ') missing files"))..."
  ( cd "$PULLER_CWD" && claude -p "$(cat PULL_PROMPT.txt)" \
      --model "$MODEL" \
      --session-id "$SESSION_ID" \
      --output-format text \
  ) | tee "$PULLER_CWD/puller.log"
  # No --disallowedTools for DesignSync methods: DesignSync does not define a specifier matcher
  # (confirmed earlier — parenthesised rules like "DesignSync(deletions:[] *)" don't match
  # anything for it), so a rule scoped to just the write methods would likely be a silent no-op,
  # and one scoped to the bare tool name would block get_file too. The real guarantee is
  # verified instead: finalize_plan is hardcoded to ask, classifierApprovable:false, and a
  # headless -p session has nobody to ask — tested directly, it denies cleanly with exit 0,
  # nothing hangs, nothing writes. write_files/delete_files both require a planId from a
  # finalize_plan that can never succeed here.

  T="$(find_transcript "$SESSION_ID" "$PULLER_CWD")"
  if [ -z "$T" ] || [ ! -f "$T" ]; then
    echo "!! could not locate attempt $attempt's transcript — puller session may have failed to start" >&2
    exit 1
  fi
  echo "== attempt $attempt transcript: $T ($(wc -l < "$T") lines)"
  TRANSCRIPTS+=("$T")

  echo "== checking completeness against the real list_files result..."
  if python3 "$REPO_ROOT/docs/ds_check_complete.py" "${TRANSCRIPTS[@]}" > "$MISSING_FILE.next" 2> "$STAGE_DIR/check.log"; then
    cat "$STAGE_DIR/check.log" >&2
    mv "$MISSING_FILE.next" "$MISSING_FILE"
    echo "== complete: every wanted file was fetched across $attempt attempt(s)"
    break
  fi
  cat "$STAGE_DIR/check.log" >&2
  mv "$MISSING_FILE.next" "$MISSING_FILE"

  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "!! gave up after $MAX_ATTEMPTS attempts, $(wc -l < "$MISSING_FILE" | tr -d ' ') files still missing" >&2
    break
  fi
  attempt=$((attempt + 1))
done

STILL_MISSING="$(wc -l < "$MISSING_FILE" | tr -d ' ')"

# --- Set up the worktree fresh from base-ref, then replay every attempt's transcript. --------
BRANCH="design-pull-$(date +%s 2>/dev/null || echo "$SESSION_ID" | cut -c1-8)"
if [ -d "$WORKTREE" ]; then
  echo "== resetting existing worktree to $BASE_REF"
  (cd "$WORKTREE" && git checkout -B "$BRANCH" "$BASE_REF" -q && git reset --hard "$BASE_REF" -q && git clean -fdq)
else
  echo "== creating worktree at $WORKTREE on branch $BRANCH"
  git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE" "$BASE_REF" -q
fi

echo "== replaying ${#TRANSCRIPTS[@]} transcript(s) onto the worktree"
python3 "$REPO_ROOT/docs/extract_ds.py" "$WORKTREE" "${TRANSCRIPTS[@]}"

# --- Commit "theirs" as a clean point old enough to 3-way merge — honestly labeled. ----------
( cd "$WORKTREE" \
  && git add -A \
  && if git diff --cached --quiet; then
       echo "== nothing changed since $BASE_REF — no commit made"
     else
       if [ "$STILL_MISSING" -eq 0 ]; then
         git commit -q -m "Remote state as of $(date '+%Y-%m-%d'), pulled in full

Replayed verbatim from ${#TRANSCRIPTS[@]} headless puller session(s) (model: $MODEL).
No inference, no hand-editing — git computes the diff against $BASE_REF from here."
       else
         git commit -q -m "PARTIAL remote pull as of $(date '+%Y-%m-%d') — $STILL_MISSING file(s) never fetched

Gave up after $MAX_ATTEMPTS attempts. Do NOT treat this as the full remote state — it
is only what was actually confirmed fetched (docs/ds_check_complete.py), not a claim
from the puller session about what it did. See $MISSING_FILE for the exact list.

$(cat "$MISSING_FILE" | sed 's/^/  missing: /')"
       fi
       echo "== committed: $(git log --oneline -1)"
     fi
)

echo
if [ "$STILL_MISSING" -eq 0 ]; then
  echo "== done. To merge:"
  echo "     cd $REPO_ROOT && git merge $BRANCH -m 'Merge remote design pull'"
  echo "   Resolve any real conflicts, then verify:"
  echo "     python3 docs/check_tokens.py && node docs/build_bundle.js && node docs/render_cards.mjs"
  exit 0
else
  echo "!! INCOMPLETE — $STILL_MISSING file(s) never fetched after $MAX_ATTEMPTS attempts:" >&2
  cat "$MISSING_FILE" >&2
  echo "!! The worktree at $WORKTREE has a PARTIAL commit. Do not merge it as if it were complete." >&2
  exit 1
fi
