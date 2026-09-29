# Delete the old Auralis's leftovers on mediaserver

kind: irreversible
default: keep them until you answer; nothing on mediaserver is touched.

Option A: say "delete the old Auralis leftovers" and the session deletes everything listed below,
one item at a time, checking the staging container stays healthy after each.
Option B: say "delete all but <item numbers>" to keep some of them.
Option C: say "keep them" and they stay.

Nothing below is used by the staging container, its update timer, the autorun switch or any
other service. Each was checked on mediaserver itself (the running containers and their mounts,
the compose file, the user units, `PATH`, and a search of the home folder for anything naming it).

1. `~/src/auralis-src`: a checkout of the old code (the `apps/` and `packages/` tree, last
   commit early August). The container is pulled from GHCR, not built from it.
2. Old Auralis images: about 145 untagged `ghcr.io/patakihara/auralis` images left behind by
   each update, plus the local builds `arr-auralis` (with its `rollback-20260804` tag),
   `auralis:smoke`, `auralis:local` and `auralis-proddeps`, and Docker's 3.4 GB build cache.
   Only `ghcr.io/patakihara/auralis:latest` runs.
3. `~/docker/arr/auralis-data/auralis.sqlite3`: the old Auralis's database. The rebuild keeps
   its own in `auralis.sqlite` beside it; `secret.key` and `setup-code` there stay.
4. The Android and JavaScript toolchain once installed to build the old Auralis on
   mediaserver: `~/.local/share/android-sdk`, `~/.local/share/jdk17`, `~/.local/share/gradle`,
   `~/.local/share/kotlin`, `~/.gradle`, `~/.android` and the pnpm store in
   `~/.local/share/pnpm`, about 2.3 GB, untouched since early August. Android builds only on
   GitHub's CI now.
5. `~/curly-spoon-docs.bundle`: a git bundle of the old repo's docs.
6. The `auralis-autoupdate` worktree in `~/.claude/worktrees/` and its branch in the home
   repo. What it built, the update timer, is already live from the home repo's own history.
7. The four `~/docker/arr/docker-compose.yml.bak-*` copies. The compose file is committed in the
   home repo, so git history already keeps every earlier version; one copy still builds the old
   Auralis from `~/src/auralis-src` with its old session-secret setting.

None of this can be undone, except that item 2's GHCR images can be pulled again for as long as
GHCR keeps those versions.
