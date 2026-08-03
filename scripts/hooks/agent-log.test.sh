#!/usr/bin/env bash
#
# Tests for the subagent activity log hook (scripts/hooks/agent-log.sh).
#
# The contract: SubagentStart appends a "running" row, SubagentStop flips the
# matching row to "ended" with a short summary, everything happens inside a
# bounded, Prettier-safe list between <!-- AGENT_LOG_START/END --> in a target
# HANDOVER.md, and nothing here ever corrupts the file or crashes — a missing
# jq, malformed stdin, or an unwritable file all fail open, silently.
#
# The concurrency case is the one most likely to be subtly broken: this repo
# dispatches subagents in parallel batches by design, so SubagentStart/Stop
# hooks racing each other is the normal case, not an edge case. Each
# concurrency test below fires several real hook invocations as background
# shell jobs against the same target file and inspects the result afterward —
# nothing here is a unit test of the read-modify-write function in isolation.

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/agent-log.sh"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

# A throwaway HANDOVER.md with the same anchor section this repo's real one
# has, plus content before and after it — so tests can assert that content
# outside the anchors is left byte-for-byte alone, not just that the anchors
# themselves survive.
seed_handover() {
  local dir="$1"
  cat >"$dir/HANDOVER.md" <<'EOF'
# Handover

Some intro text before the log section, standing in for the real narrative
content of docs/HANDOVER.md.

<!-- AGENT_LOG_START -->

_(no agents logged yet)_

<!-- AGENT_LOG_END -->

## Trailing section

Content after the log section. Must survive byte-identical.
Second line of trailing content.
EOF
}

# $1 = dir with rows already "running", one per agent id in $2 (space-separated)
seed_running() {
  local dir="$1" ids="$2"
  {
    echo '# Handover'
    echo
    echo '<!-- AGENT_LOG_START -->'
    echo
    local i=1
    for id in $ids; do
      printf -- '- `2026-08-03T20:00:%02dZ` · `%s` · worker · running · —\n' "$i" "$id"
      i=$((i + 1))
    done
    echo
    echo '<!-- AGENT_LOG_END -->'
  } >"$dir/HANDOVER.md"
}

run_hook() {
  # $1 = json payload, $2 = HANDOVER.md dir, rest = extra env assignments
  #
  # Defaults CLAUDE_PROJECT_DIR and AURALIS_AGENT_LOG_SHARED to paths rooted in
  # the test's own throwaway $dir, which is never a git repo (a plain
  # mktemp -d). Without this, agent-log.sh's PROJECT_DIR fallback resolves to
  # this *script's own location* — a real worktree of the real repo — and the
  # shared-log feature would then resolve a real git-common-dir and write
  # real test noise into the actual repo's .git/auralis-agent-log.jsonl. That
  # happened once while developing this suite; every test in this file must
  # go through this default rather than inventing its own isolation.
  #
  # "$@" is applied *after* these defaults, so a caller-supplied override
  # (e.g. a test that deliberately wants a real git repo) still wins.
  local payload="$1" dir="$2"
  shift 2
  printf '%s' "$payload" | env     CLAUDE_PROJECT_DIR="$dir"     AURALIS_AGENT_LOG_SHARED="$dir/unused-shared-log.jsonl"     AURALIS_AGENT_LOG_FILE="$dir/HANDOVER.md"     "$@"     "$HOOK"
}

log_section() {
  awk '/AGENT_LOG_START/{p=1} p; /AGENT_LOG_END/{if(p)exit}' "$1/HANDOVER.md"
}

trailing_content() {
  awk '/AGENT_LOG_END/{found=1; next} found' "$1/HANDOVER.md"
}

# --- normal start+stop pairing --------------------------------------------

dir="$(mktemp -d)"
seed_handover "$dir"
before_trailing="$(trailing_content "$dir")"

out="$(run_hook '{"hook_event_name":"SubagentStart","agent_id":"agent-1","agent_type":"general-purpose"}' "$dir")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] ||
  fail "SubagentStart: expected silent exit 0 (status=$status out=$out)"

if grep -qE '^- `[^`]+` · `agent-1` · general-purpose · running · —$' "$dir/HANDOVER.md"; then
  ok "SubagentStart: adds a running row with agent id and type"
else
  fail "SubagentStart: expected row not found: $(log_section "$dir")"
fi

out="$(run_hook '{"hook_event_name":"SubagentStop","agent_id":"agent-1","agent_type":"general-purpose","last_assistant_message":"Task complete: refactored the sheet detent logic and added tests."}' "$dir")"
status=$?
[ "$status" -eq 0 ] && [ -z "$out" ] ||
  fail "SubagentStop: expected silent exit 0 (status=$status out=$out)"

if grep -qE '^- `[^`]+` · `agent-1` · general-purpose · ended · Task complete: refactored the sheet detent logic and added tests\.$' "$dir/HANDOVER.md"; then
  ok "SubagentStop: flips the matching row to ended with a summary"
else
  fail "SubagentStop: expected updated row not found: $(log_section "$dir")"
fi

if [ "$(grep -c '^- `' "$dir/HANDOVER.md")" -eq 1 ]; then
  ok "SubagentStop: updates in place, does not add a new row"
else
  fail "SubagentStop: row count changed unexpectedly: $(log_section "$dir")"
fi

after_trailing="$(trailing_content "$dir")"
[ "$before_trailing" = "$after_trailing" ] &&
  ok "content after the log section is untouched" ||
  fail "content after the log section changed"
rm -rf "$dir"

# --- stop with no matching start (agent id already pruned) -----------------

dir="$(mktemp -d)"
seed_handover "$dir"
out="$(run_hook '{"hook_event_name":"SubagentStop","agent_id":"agent-ghost","agent_type":"Explore","last_assistant_message":"orphaned stop, start row long since pruned"}' "$dir")"
status=$?
if [ "$status" -eq 0 ] && [ -z "$out" ]; then
  ok "SubagentStop with no matching start: exits 0 silently, no error"
else
  fail "SubagentStop with no matching start should be silent (status=$status out=$out)"
fi
if grep -q 'no agents logged yet' "$dir/HANDOVER.md"; then
  ok "SubagentStop with no matching start: does not fabricate a row"
else
  fail "SubagentStop with no matching start: unexpectedly modified the log: $(log_section "$dir")"
fi
rm -rf "$dir"

# --- fail open: malformed JSON on stdin -------------------------------------

dir="$(mktemp -d)"
seed_handover "$dir"
before_hash="$(md5sum "$dir/HANDOVER.md")"
out="$(printf 'not json at all {{{' | CLAUDE_PROJECT_DIR="$dir" AURALIS_AGENT_LOG_SHARED="$dir/unused-shared-log.jsonl" AURALIS_AGENT_LOG_FILE="$dir/HANDOVER.md" "$HOOK")"
status=$?
after_hash="$(md5sum "$dir/HANDOVER.md")"
if [ "$status" -eq 0 ] && [ -z "$out" ] && [ "$before_hash" = "$after_hash" ]; then
  ok "fail-open: malformed JSON allows silently and leaves the file untouched"
else
  fail "fail-open: malformed JSON should allow silently without writing (status=$status out=$out)"
fi
rm -rf "$dir"

# --- fail open: missing hook_event_name / agent_id --------------------------

dir="$(mktemp -d)"
seed_handover "$dir"
out="$(run_hook '{"some_other_field":"x"}' "$dir")"
status=$?
if [ "$status" -eq 0 ] && [ -z "$out" ] && grep -q 'no agents logged yet' "$dir/HANDOVER.md"; then
  ok "fail-open: payload missing required fields allows silently"
else
  fail "fail-open: missing-field payload should allow silently (status=$status out=$out)"
fi
rm -rf "$dir"

# --- fail open: missing jq --------------------------------------------------
#
# A PATH containing every binary the hook needs except jq — proves the
# fail-open check is jq's absence specifically, not a broken environment.

dir="$(mktemp -d)"
seed_handover "$dir"
before_hash="$(md5sum "$dir/HANDOVER.md")"
fakebin="$(mktemp -d)"
for b in cat printf date mkdir dirname basename flock python3 env rm mv sed bash; do
  p="$(command -v "$b" 2>/dev/null || true)"
  [ -n "$p" ] && ln -sf "$p" "$fakebin/$b"
done
out="$(printf '{"hook_event_name":"SubagentStart","agent_id":"x"}' |
  CLAUDE_PROJECT_DIR="$dir" AURALIS_AGENT_LOG_SHARED="$dir/unused-shared-log.jsonl" AURALIS_AGENT_LOG_FILE="$dir/HANDOVER.md" PATH="$fakebin" /bin/bash "$HOOK")"
status=$?
after_hash="$(md5sum "$dir/HANDOVER.md")"
rm -rf "$fakebin"
if [ "$status" -eq 0 ] && [ -z "$out" ] && [ "$before_hash" = "$after_hash" ]; then
  ok "fail-open: missing jq allows silently and leaves the file untouched"
else
  fail "fail-open: missing jq should allow silently without writing (status=$status out=$out)"
fi
rm -rf "$dir"

# --- fail open: HANDOVER.md missing -----------------------------------------

dir="$(mktemp -d)"
out="$(run_hook '{"hook_event_name":"SubagentStart","agent_id":"x"}' "$dir")"
status=$?
if [ "$status" -eq 0 ] && [ -z "$out" ]; then
  ok "fail-open: missing HANDOVER.md allows silently, no crash"
else
  fail "fail-open: missing HANDOVER.md should allow silently (status=$status out=$out)"
fi
rm -rf "$dir"

# --- anchor injection: a subagent quoting the anchors verbatim --------------
#
# last_assistant_message is model output. A subagent that worked on this very
# feature will plausibly quote "<!-- AGENT_LOG_END -->" in its final message.
# If that landed unsanitised, the next read's text.find(END) would match
# early and duplicate/truncate the anchors. This is the corruption path the
# task called out as most important to prove closed.

dir="$(mktemp -d)"
seed_handover "$dir"
run_hook '{"hook_event_name":"SubagentStart","agent_id":"agent-inj","agent_type":"general-purpose"}' "$dir" >/dev/null
run_hook '{"hook_event_name":"SubagentStop","agent_id":"agent-inj","agent_type":"general-purpose","last_assistant_message":"done <!-- AGENT_LOG_END --> now injected <!-- AGENT_LOG_START --> more · text with a ` backtick"}' "$dir" >/dev/null

start_count="$(grep -c 'AGENT_LOG_START' "$dir/HANDOVER.md")"
end_count="$(grep -c 'AGENT_LOG_END' "$dir/HANDOVER.md")"
if [ "$start_count" -eq 1 ] && [ "$end_count" -eq 1 ]; then
  ok "anchor injection: exactly one START and one END anchor survive"
else
  fail "anchor injection: anchor count corrupted (start=$start_count end=$end_count): $(cat "$dir/HANDOVER.md")"
fi
after_trailing="$(trailing_content "$dir")"
[ "$after_trailing" = "$(printf '\n## Trailing section\n\nContent after the log section. Must survive byte-identical.\nSecond line of trailing content.')" ] &&
  ok "anchor injection: trailing content still intact" ||
  fail "anchor injection: trailing content damaged: $after_trailing"
if grep -qE '^- `' "$dir/HANDOVER.md" && ! grep -q '<!--' <(log_section "$dir" | grep '^- `'); then
  ok "anchor injection: the row itself contains no HTML comment delimiters"
else
  fail "anchor injection: row still contains raw comment syntax: $(log_section "$dir")"
fi
rm -rf "$dir"

# --- concurrency: 6 simultaneous SubagentStart, unique agent ids ------------
#
# This just happened for real (6 agents launched together in one batch), so
# it is not a hypothetical stress test.

dir="$(mktemp -d)"
seed_handover "$dir"
before_trailing="$(trailing_content "$dir")"

pids=()
for i in 1 2 3 4 5 6; do
  (run_hook "{\"hook_event_name\":\"SubagentStart\",\"agent_id\":\"agent-c$i\",\"agent_type\":\"worker-$i\"}" "$dir" >/dev/null 2>&1) &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done

start_count="$(grep -c 'AGENT_LOG_START' "$dir/HANDOVER.md")"
end_count="$(grep -c 'AGENT_LOG_END' "$dir/HANDOVER.md")"
row_count="$(grep -cE '^- `' "$dir/HANDOVER.md")"

[ "$start_count" -eq 1 ] && [ "$end_count" -eq 1 ] &&
  ok "concurrency/6-starts: exactly one anchor pair survives" ||
  fail "concurrency/6-starts: anchor count wrong (start=$start_count end=$end_count)"

[ "$row_count" -eq 6 ] &&
  ok "concurrency/6-starts: exactly 6 rows, none lost to interleaving" ||
  fail "concurrency/6-starts: expected 6 rows, got $row_count: $(log_section "$dir")"

all_present=1
for i in 1 2 3 4 5 6; do
  grep -q "\`agent-c$i\`" "$dir/HANDOVER.md" || all_present=0
done
[ "$all_present" -eq 1 ] &&
  ok "concurrency/6-starts: all 6 distinct agent ids present" ||
  fail "concurrency/6-starts: at least one agent id missing: $(log_section "$dir")"

after_trailing="$(trailing_content "$dir")"
[ "$before_trailing" = "$after_trailing" ] &&
  ok "concurrency/6-starts: content after the log section is byte-identical" ||
  fail "concurrency/6-starts: trailing content was corrupted by the race"

# Valid markdown, structurally: same non-log lines still bracket a single
# well-formed list, and every data line matches the 5-field row shape.
malformed_rows=0
while IFS= read -r line; do
  case "$line" in
  '- `'*) echo "$line" | grep -qE '^- `[^`]*` · `[^`]*` · [^·]+ · [^·]+ · .+$' || malformed_rows=$((malformed_rows + 1)) ;;
  esac
done <"$dir/HANDOVER.md"
[ "$malformed_rows" -eq 0 ] &&
  ok "concurrency/6-starts: every row is well-formed (5 fields)" ||
  fail "concurrency/6-starts: $malformed_rows malformed row(s)"
rm -rf "$dir"

# --- concurrency: pruning under lock, 6 starts against AURALIS_AGENT_LOG_MAX=3 --

dir="$(mktemp -d)"
seed_handover "$dir"

pids=()
for i in 1 2 3 4 5 6; do
  (run_hook "{\"hook_event_name\":\"SubagentStart\",\"agent_id\":\"agent-p$i\",\"agent_type\":\"worker\"}" "$dir" AURALIS_AGENT_LOG_MAX=3 >/dev/null 2>&1) &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done

row_count="$(grep -cE '^- `' "$dir/HANDOVER.md")"
if [ "$row_count" -eq 3 ]; then
  ok "concurrency/prune: capped at 3 rows under concurrent starts"
else
  fail "concurrency/prune: expected 3 rows, got $row_count: $(log_section "$dir")"
fi

bogus=0
while IFS= read -r line; do
  case "$line" in
  '- `'*)
    id="$(printf '%s' "$line" | sed -E 's/^- `[^`]*` · `([^`]*)`.*/\1/')"
    case "$id" in agent-p1 | agent-p2 | agent-p3 | agent-p4 | agent-p5 | agent-p6) ;; *) bogus=$((bogus + 1)) ;; esac
    ;;
  esac
done <"$dir/HANDOVER.md"
[ "$bogus" -eq 0 ] &&
  ok "concurrency/prune: surviving rows all come from the 6 real launches" ||
  fail "concurrency/prune: found $bogus row(s) with an unrecognised agent id"
rm -rf "$dir"

# --- concurrency: 6 simultaneous SubagentStop against 6 pre-seeded rows -----

dir="$(mktemp -d)"
seed_running "$dir" "agent-s1 agent-s2 agent-s3 agent-s4 agent-s5 agent-s6"

pids=()
for i in 1 2 3 4 5 6; do
  (run_hook "{\"hook_event_name\":\"SubagentStop\",\"agent_id\":\"agent-s$i\",\"agent_type\":\"worker\",\"last_assistant_message\":\"agent $i finished ok\"}" "$dir" >/dev/null 2>&1) &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done

row_count="$(grep -cE '^- `' "$dir/HANDOVER.md")"
running_count="$(grep -c ' running · ' "$dir/HANDOVER.md" || true)"
ended_count="$(grep -c ' ended · ' "$dir/HANDOVER.md" || true)"

[ "$row_count" -eq 6 ] &&
  ok "concurrency/6-stops: no rows lost (still 6)" ||
  fail "concurrency/6-stops: expected 6 rows, got $row_count"

[ "$running_count" -eq 0 ] && [ "$ended_count" -eq 6 ] &&
  ok "concurrency/6-stops: all 6 rows flipped to ended, none left running" ||
  fail "concurrency/6-stops: running=$running_count ended=$ended_count (want 0/6): $(log_section "$dir")"
rm -rf "$dir"

# --- cross-worktree shared log ----------------------------------------------
#
# All of these use a real, disposable git repo (never the actual repo this
# test suite lives in) so the mechanism under test — git's own
# --git-common-dir resolution — is exercised for real, not mocked, while
# never touching the real .git this checkout belongs to.

make_git_repo_with_worktree() {
  # $1 = root dir to create; creates $1/main (a real repo) and $1/wt1 (a real
  # worktree of it on its own branch). Echoes nothing; caller uses fixed
  # subpaths.
  local root="$1"
  mkdir -p "$root/main"
  git -C "$root/main" init -q
  git -C "$root/main" config user.email test@test.com
  git -C "$root/main" config user.name Test
  echo hello >"$root/main/README.md"
  git -C "$root/main" add README.md >/dev/null
  git -C "$root/main" commit -q -m init
  git -C "$root/main" worktree add -q -b feature-branch "$root/wt1" >/dev/null 2>&1
}

if ! command -v git >/dev/null 2>&1; then
  ok "cross-worktree tests: git not installed, skipping (fail-open behaviour covered separately)"
else
  root="$(mktemp -d)"
  make_git_repo_with_worktree "$root"
  shared_log="$(git -C "$root/main" rev-parse --path-format=absolute --git-common-dir)/auralis-agent-log.jsonl"

  common_main="$(git -C "$root/main" rev-parse --path-format=absolute --git-common-dir)"
  common_wt1="$(git -C "$root/wt1" rev-parse --path-format=absolute --git-common-dir)"
  [ "$common_main" = "$common_wt1" ] &&
    ok "cross-worktree: git-common-dir resolves identically from main and from the worktree" ||
    fail "cross-worktree: git-common-dir diverged (main=$common_main wt1=$common_wt1)"

  # Two events from two different checkouts (CLAUDE_PROJECT_DIR is how every
  # hook in this repo already answers "which checkout is this" — see
  # agent-log.sh's header for why that, not the payload's own cwd field, is
  # what a real multi-worktree invocation actually varies by).
  printf '{"hook_event_name":"SubagentStart","agent_id":"agent-main-1","agent_type":"general-purpose"}' |
    CLAUDE_PROJECT_DIR="$root/main" AURALIS_AGENT_LOG_FILE="$root/main/no-handover.md" "$HOOK" >/dev/null 2>&1
  printf '{"hook_event_name":"SubagentStart","agent_id":"agent-wt1-1","agent_type":"Explore"}' |
    CLAUDE_PROJECT_DIR="$root/wt1" AURALIS_AGENT_LOG_FILE="$root/wt1/no-handover.md" "$HOOK" >/dev/null 2>&1
  printf '{"hook_event_name":"SubagentStop","agent_id":"agent-wt1-1","agent_type":"Explore","last_assistant_message":"finished exploring the worktree"}' |
    CLAUDE_PROJECT_DIR="$root/wt1" AURALIS_AGENT_LOG_FILE="$root/wt1/no-handover.md" "$HOOK" >/dev/null 2>&1

  if [ -f "$shared_log" ] && [ "$(wc -l <"$shared_log")" -eq 3 ]; then
    ok "cross-worktree: events fired from two different checkouts land in the one shared file"
  else
    fail "cross-worktree: expected 3 lines in $shared_log, got: $(cat "$shared_log" 2>/dev/null || echo '<missing>')"
  fi

  all_valid=1
  while IFS= read -r line; do
    printf '%s' "$line" | jq -e . >/dev/null 2>&1 || all_valid=0
  done <"$shared_log"
  [ "$all_valid" -eq 1 ] &&
    ok "cross-worktree: every shared-log line is valid JSON" ||
    fail "cross-worktree: at least one shared-log line is not valid JSON: $(cat "$shared_log")"

  if grep -q '"checkout":"'"$root"'/main"' "$shared_log" && grep -q '"checkout":"'"$root"'/wt1"' "$shared_log"; then
    ok "cross-worktree: each line is tagged with the checkout it actually came from"
  else
    fail "cross-worktree: checkout attribution missing or wrong: $(cat "$shared_log")"
  fi

  if grep -q '"event":"SubagentStop".*"summary":"finished exploring the worktree"' "$shared_log"; then
    ok "cross-worktree: the stop event carries its summary through to the shared log"
  else
    fail "cross-worktree: stop event summary missing: $(cat "$shared_log")"
  fi

  # Never gitignored, never tracked, never even visible: nothing under .git/
  # is part of any branch's working tree, from either checkout.
  status_main="$(git -C "$root/main" status --porcelain --ignored=matching)"
  status_wt1="$(git -C "$root/wt1" status --porcelain --ignored=matching)"
  [ -z "$status_main" ] && [ -z "$status_wt1" ] &&
    ok "cross-worktree: shared log is invisible to git status from either checkout" ||
    fail "cross-worktree: git status saw something (main='$status_main' wt1='$status_wt1')"

  git -C "$root/main" add -v "$shared_log" >/tmp/agentlog-git-add-out.$$ 2>&1
  add_out="$(cat /tmp/agentlog-git-add-out.$$)"
  rm -f /tmp/agentlog-git-add-out.$$
  tracked_after="$(git -C "$root/main" ls-files | grep -c auralis-agent-log || true)"
  [ -z "$add_out" ] && [ "$tracked_after" -eq 0 ] &&
    ok "cross-worktree: git add on the shared log path is a silent no-op, never tracked" ||
    fail "cross-worktree: git add unexpectedly did something (out='$add_out' tracked=$tracked_after)"

  rm -rf "$root"

  # --- concurrency on the shared log itself -----------------------------------

  root="$(mktemp -d)"
  make_git_repo_with_worktree "$root"
  shared_log="$(git -C "$root/main" rev-parse --path-format=absolute --git-common-dir)/auralis-agent-log.jsonl"

  pids=()
  for i in 1 2 3 4 5 6; do
    (printf '{"hook_event_name":"SubagentStart","agent_id":"agent-shared-%d","agent_type":"worker"}' "$i" |
      CLAUDE_PROJECT_DIR="$root/main" AURALIS_AGENT_LOG_FILE="$root/main/no-handover.md" "$HOOK" >/dev/null 2>&1) &
    pids+=($!)
  done
  for p in "${pids[@]}"; do wait "$p"; done

  line_count="$(wc -l <"$shared_log" 2>/dev/null || echo 0)"
  [ "$line_count" -eq 6 ] &&
    ok "cross-worktree concurrency: 6 simultaneous starts produce exactly 6 shared-log lines" ||
    fail "cross-worktree concurrency: expected 6 lines, got $line_count"

  all_valid=1
  while IFS= read -r line; do
    printf '%s' "$line" | jq -e . >/dev/null 2>&1 || all_valid=0
  done <"$shared_log"
  [ "$all_valid" -eq 1 ] &&
    ok "cross-worktree concurrency: every line is still valid JSON, none interleaved/corrupted" ||
    fail "cross-worktree concurrency: a line was corrupted by the race: $(cat "$shared_log")"

  rm -rf "$root"
fi

# --- fail open: not a git repo at all ----------------------------------------
#
# A HANDOVER.md write must still succeed even when PROJECT_DIR is not a git
# repository (or git itself is missing) — the shared-log block is an
# independent failure domain and must not take the per-checkout write down
# with it.

dir="$(mktemp -d)"
seed_handover "$dir"
out="$(run_hook '{"hook_event_name":"SubagentStart","agent_id":"agent-nogit","agent_type":"worker"}' "$dir" CLAUDE_PROJECT_DIR="$dir" AURALIS_AGENT_LOG_SHARED=)"
status=$?
if [ "$status" -eq 0 ] && [ -z "$out" ] && grep -q 'agent-nogit' "$dir/HANDOVER.md"; then
  ok "fail-open: non-git PROJECT_DIR still logs to HANDOVER.md (shared log silently skipped)"
else
  fail "fail-open: HANDOVER.md write should succeed even without a git repo (status=$status out=$out)"
fi
stray_jsonl="$(find "$dir" -maxdepth 2 -name '*.jsonl' 2>/dev/null)"
[ -z "$stray_jsonl" ] &&
  ok "fail-open: no shared-log file fabricated when there is no git-common-dir" ||
  fail "fail-open: unexpected jsonl file created: $stray_jsonl"
rm -rf "$dir"

# --- settings.json registration ----------------------------------------------

settings="$REPO_ROOT/.claude/settings.json"
if jq -e '. as $s |
  ($s.hooks.SubagentStart // []) as $start |
  ($s.hooks.SubagentStop // []) as $stop |
  ($start | any(.hooks[]?.command | contains("agent-log.sh"))) and
  ($stop | any(.hooks[]?.command | contains("agent-log.sh")))
' "$settings" >/dev/null 2>&1; then
  ok "settings.json: agent-log.sh registered on both SubagentStart and SubagentStop"
else
  fail "settings.json: agent-log.sh not found on both events"
fi

if jq -e '.hooks.SubagentStart[0].matcher == "*" and .hooks.SubagentStop[0].matcher == "*"' "$settings" >/dev/null 2>&1; then
  ok "settings.json: both registrations use the match-everything matcher"
else
  fail "settings.json: expected matcher \"*\" on both SubagentStart and SubagentStop"
fi

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
