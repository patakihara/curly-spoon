# Handover

## Workflow check — resolved 2026-08-04

An earlier session mishandled `EnterWorktree`/subagent isolation, spawned an unsupervised
`claude --bg`, and defaulted to a PR workflow this repo doesn't use. `CLAUDE.md`'s "do not
create a worktree" section has the full detail if it recurs. An `advisor()` call on
2026-08-04 confirmed the workflow was back on track (main checkout, no stray
`EnterWorktree`, subagents correctly isolated via `Agent(isolation: "worktree")`) before
Wave E1 was picked up — no need to re-spend a call re-verifying this unless something looks
wrong again.

---

You are picking up **Auralis** from a session that ran in an ephemeral cloud container with
no access to the user's actual media server. Development moved to a **local machine** at
commit `108ae0e`, because the container's limits had become the binding constraint: no
Docker, no Android SDK (`dl.google.com` was blocked), and an ephemeral disk.

You can therefore do things the previous session could not: talk to the real Audiobookshelf
and Jellyfin, inspect the real library layout, run Docker, and — if the Android SDK is
installed — actually build the Android app.

**Two standing instructions carried over from the end of that session:**

1. ~~Do not spawn subagents.~~ **Lifted on 2026-08-02** — the user asked for delegation to
   Sonnet agents to resume, on token-consumption grounds. `CLAUDE.md`'s delegation rules
   apply again in full; the usage gate in `.claude/settings.json` is the only remaining
   gate.
2. **Work stops at 90%** of the session or weekly window, with a hand-off band from 85%.
   Both numbers are the user's, set on 2026-08-02. `scripts/hooks/usage-gate.sh` enforces
   them on `SessionStart`, `UserPromptSubmit` and every `PreToolUse` — so past 90% you
   cannot commit, push or write this file. Hand off in the band, not after it. See §5.

Read this file first, then `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and
`docs/INTEGRATIONS.md`. Those four are the spec; this file is the context around them.

**Then read `docs/setup/MY_SETUP.md`** — the real server's details, filled in from the box
itself. It answers most of section 4 below and contradicts several assumptions in this file.

---

## Background agent log (auto-maintained; most recent 15 entries)

Written by `scripts/hooks/agent-log.sh` on `SubagentStart`/`SubagentStop` — see that
script's header for the concurrency and fail-open design. Each entry: launch time (UTC),
Agent ID, type, status (`running`/`ended`), and — once the agent finishes — the first ~150
characters of its final message. If an entry still says `running` with no follow-up, the
session that owned it may have been lost to compaction or crashed; check its transcript by
Agent ID before assuming its work landed silently. Entries are pruned oldest-first past 15 —
an agent's absence here only means a newer launch pushed it out, not that it never ran.

**This section is per-checkout** — a session working in a git worktree (`.claude/
worktrees/<name>/`) reads and writes only that worktree's own copy of this file. Treat it as
"what a session in _this_ checkout was doing," not a global registry.

**For the global view, read the shared log instead**: every event recorded here is _also_
appended to `<git-common-dir>/auralis-agent-log.jsonl` — plain JSONL, one line per event,
each line tagged with a `checkout` field naming which worktree it came from. All worktrees
of one repo share a single
physical `.git` directory (verified empirically: `git rev-parse --git-common-dir` resolves
to the same absolute path from the main checkout and from every worktree of it), so that
file is genuinely global across every concurrent session on this repo, regardless of which
worktree each one runs in. It is never gitignored per branch and never a merge-conflict spot
because nothing under `.git/` is tracked by any branch, ever — confirmed directly: `git
status`/`git add` from any checkout cannot see or stage it. Find it from any checkout with:

```bash
cat "$(git rev-parse --path-format=absolute --git-common-dir)/auralis-agent-log.jsonl"
```

It is append-only and unbounded (unlike this section's 15-entry cap), so it is the place to
check "what was running across every checkout," while this section stays the quick,
in-context scan of the current one.

<!-- AGENT_LOG_START -->

- `2026-08-03T22:38:26Z` · `a6c0825a2e77ed564` · claude · ended · result: Verified the Dialog-class leftover-overlay bug is absent from Sheet/NowPlaying's Mantine Drawer usage — no bug found, no fix needed — and pus…
- `2026-08-03T22:58:48Z` · `a6e505a5002fe7a43` · claude · ended · ## Review of commit '01618f0' **Commit found**: '01618f05608922385586a72657251f845433a7d6' on 'origin/claude/media-client-app-k7v9by', one ahead of '…
- `2026-08-03T23:07:31Z` · `aee2a23e8809b8c5b` · claude · ended · Pushed cleanly, no rebase needed (fast-forward from '01618f0' to 'd02f37b'). ## Summary **Fix 1 — 'elementFromPoint'/mouse-click attribution:** Befor…
- `2026-08-04T01:58:29Z` · `ad333159447dbf905` · general-purpose · ended · ## Report **Important: I could not follow the literal instruction to edit the shared checkout directly.** This session runs as a background agent, an…
- `2026-08-04T02:01:41Z` · `a792cd8ec5afdb15e` · general-purpose · ended · ## Result: Blocked — no files changed I read all six files the spec named ('RequestsViewModel.kt', 'RequestsScreen.kt', 'RequestsViewModelTest.kt', '…
- `2026-08-04T02:08:24Z` · `a20e21e9632c12e4d` · general-purpose · ended · Here is the raw output of all five commands, verbatim, with no interpretation or action taken: ''' $ git branch --show-current worktree-agent-a20e21e…
- `2026-08-04T02:08:37Z` · `a97a5bc9440db24d1` · claude · ended · ## Summary **Base-ref check**: Needed the reset. The auto-created worktree initially printed 'WRONG_BASE' (branched from 'origin/main'); 'git fetch o…
- `2026-08-04T02:27:06Z` · `a5417c439f9c906ca` · general-purpose · ended · Committed successfully. Here is my report. **Mandatory first-steps verification: passed.** 'git status --short' was clean, 'git reset --hard 278e3fc'…
- `2026-08-04T02:34:14Z` · `a53d0a9055cdc4b5f` · general-purpose · ended · ## Review: commit 'fabd6b1' ("Android wave D2b: request list + retry/delete UI") **Files read in full**: 'RequestsViewModel.kt', 'RequestsScreen.kt',…
- `2026-08-04T02:40:59Z` · `a42d86b7aa4eb1d65` · general-purpose · ended · Task complete. Summary: **Mandatory first steps**: passed. 'git status --short' was clean, 'git reset --hard fabd6b1' succeeded, 'git log -1 --onelin…
- `2026-08-04T02:48:25Z` · `ac93172424677bfc1` · general-purpose · ended · ## Summary **Mandatory first steps**: passed. 'git status --short' was clean, 'git reset --hard c556d22' succeeded, and 'git log -1 --oneline' confir…
- `2026-08-04T04:02:55Z` · `a3af68dbac6b58ad6` · Explore · ended · All findings gathered. Here is the report. ## 1. 'AuralisMediaLibraryService' File: 'apps/android/app/src/main/java/net/auralis/app/playback/AuralisM…
- `2026-08-04T04:07:33Z` · `a85aefdbd745c6138` · general-purpose · ended · Committed clean as '7f887dd' on this worktree's branch. Final report: ## Summary **Mandatory first steps**: passed. 'git status --short' was clean be…
- `2026-08-04T05:04:22Z` · `a000e84f1b97bf728` · general-purpose · ended · ## Review: commit '7f887dd' — Wave E1 (Android Auto data layer prep) **Verification performed** (not just reading the Kotlin in isolation): cross-che…
- `2026-08-04T05:08:50Z` · `aa8707811f70f1b85` · general-purpose · ended · Both edits landed and are committed. **Summary:** - **Edit 1 ('docs/ROADMAP.md')**: Matched the exact two-line "Wave E — Android Auto" block verbatim…

<!-- AGENT_LOG_END -->

---

## 0. Background sessions and the shared checkout

The dirty-tree incident earlier drafts of this section described (uncommitted phase 5/5a
work left behind mid-phase) is long since reconciled — the checkout is clean and tracks
`origin/claude/media-client-app-k7v9by`. The one durable lesson from it: **the shared
checkout is where the user edits**, so a `git status` before any destructive git command
(`reset --hard`, `clean -fd`) is a real check, not a formality — it can lead as well as lag.

**Background sessions cannot edit the shared checkout at all.** A harness guard rejects
every `Edit`/`Write` there until the session isolates into a git worktree, and the
documented way to disable it is itself an edit — so there is no in-place path. Do not burn
turns rediscovering this. A new worktree must be based on the current branch HEAD, not on
`origin/main`, which is what the `EnterWorktree` tool does by default and is a base these
branch-derived changes cannot apply onto:

```bash
git worktree add -b <name> .claude/worktrees/<name> HEAD
pnpm install --frozen-lockfile        # a new worktree has no node_modules
```

Push with an explicit refspec — a worktree branch has no upstream:

```bash
git push origin <name>:claude/media-client-app-k7v9by
```

`.claude/worktrees/` is gitignored as of `07ce0c3`; git does not auto-ignore a nested
worktree, and untracked it reads as a mountain of phantom work.

---

## 1. What the user asked for, in their words

> "a web app + android app, in a material U style, that serves as three things"
>
> - **prio 1** — Audiobookshelf client + book request integration, pulling primarily from
>   AudiobookBay. "i have a mediaserver setup at home that id like to plug-in into it."
> - **prio 2** — podcast client.
> - **prio 3** — music client, as a Jellyfin client, ideally with a music request
>   integration (something like deemix). "my mediaserver also already has a music component."
>
> References they love: **YouTube Music**'s UI, **Symfonium**, **Spotify**'s search
> (specifically **lyrics search**), and the **Claude app**'s design language.
>
> "I want the experience to be fully-featured, no compromises. The UI must be beautiful and
> performant. The UX must be simple and friendly. Make use of test driven development,
> including end-to-end testing and UI testing with playwright (TS preferred)."
>
> "Plan out all of your steps, and deliver things task by task."

Later clarifications:

- **"work autonomously"** — do not stop to ask permission for ordinary decisions. Make the
  call, state it, keep moving. Only escalate things that genuinely change the product.
- **"outsource the implementation to sonnet agents"** — the orchestrating instance writes
  detailed specs and reviews/integrates; Sonnet subagents write the code. Keep doing this.
- **"web app" includes desktop** — the browser app must be a real desktop experience and
  the whole thing must run **in Docker**.
- **The actual goal is to replace Spotify.** In the user's own words (2026-08-03): "spotify
  now very conveniently (tho sometimes intrusively) bundles together music, podcasts, and
  audiobooks. one of the things that it does is cleverly serve me audiobooks it thinks i will
  enjoy." Personalized recommendations, not just library browsing, are part of the goal, not
  scope creep for a later phase to invent. No phase currently scopes this — treat it as an
  explicit requirement once the three media types are far enough along to reason over.
  `docs/INTEGRATIONS.md` now has a researched-not-decided section on a MusicBrainz/
  PodcastIndex/Audnexus metadata-catalog layer for this (`8e6866e`) — options and a named
  risk (Audnexus builds on Audible-scraping against Audible's ToS), not a committed design.

Treat these as standing instructions, not one-off remarks.

---

## 2. Where the project is

| Phase | What                                                | Status      |
| ----- | --------------------------------------------------- | ----------- |
| 1     | Monorepo, tooling, CI, test harness                 | done        |
| 2     | `@auralis/ui` — Material 3 Expressive design system | done        |
| 3     | BFF + Audiobookshelf client                         | done        |
| 4     | Web shell + Docker image                            | done        |
| 5     | Audiobooks experience + player                      | done        |
| 5a    | Android build skeleton + APK pipeline               | done        |
| 6     | Book requests                                       | done        |
| 7     | Android — audiobooks + requests                     | in progress |
| 8     | Podcasts — backend wave A done, no UI yet           | in progress |
| 9–11  | Music, polish, F-Droid                              | not started |

The phase5/phase6 worktrees mentioned in earlier drafts of this file are gone — this repo
now lives directly in `~/src/auralis-src`'s own checkout, per that project's own `CLAUDE.md`
("do not create a worktree"). A background session that hits the harness's shared-checkout
edit guard still needs one (see §0's "Background sessions cannot edit the shared checkout at
all" — that reconcile procedure is still accurate); just don't leave it lying around once
its work has landed and pushed.

**Phase 7 is delivered in waves** (see `docs/ROADMAP.md` §7 for the full breakdown) — each a
disjoint directory under `apps/android/app/src/{main,test}/java/net/auralis/app/`, so review
stays scoped. **Wave A (networking + settings data layer) landed on `ca9ba61`**: `ApiClient`,
`SessionCookieJar`, `KeyValueStore`/`DataStoreKeyValueStore`, `ServerConfigRepository`, using
OkHttp and kotlinx.serialization (no Retrofit), session-cookie auth persisted across process
death. Written blind (still no JDK/SDK/Gradle on the development machine), reviewed by an
independent subagent, two real defects caught and fixed before landing (see ROADMAP for what
they were). CI (`./gradlew test assembleDebug`) passed clean on the first real compile.
Waves B, B2, C1–C3 and D1 landed after that (Compose navigation/onboarding, home screen with
real shelf data, playback data layer, real ExoPlayer + `MediaLibrarySession`, MediaController
wiring + mini player, book-requests data layer — see `docs/ROADMAP.md` §7 for each one's
detail and defects independent review caught). **Wave D2a (request search + create UI) is
now done** (`3b1aebe`, fixed `646850d`) — this file previously said it was "in progress";
it landed with two real defects caught and fixed by independent review before commit, then
two of its own tests fixed afterward. **Wave D2b (request list + retry/delete UI) is now
done** (`fabd6b1`, layout fix `c556d22`) — a "Your requests" section below the existing
search form, fetched on screen entry and sorted newest-first, with per-request retry (when
failed) and delete (always). Independent review caught one real defect before landing: the
search-results branch's unweighted `Modifier.fillMaxSize()` consumed all remaining screen
height the moment a search returned any release, squeezing the new list to zero height —
this wave's entire deliverable invisible under its single most common trigger. Fixed by
making both the results section and the request list weighted siblings in the same
`Column` (`weight(1f, fill = false)` on results, so it shares space instead of hogging it;
the request list's existing `weight(1f)` was unchanged).
`./gradlew test assembleDebug` passed clean on the first real compile, six new
`RequestsViewModelTest` cases included.
**Wave E1 (Android Auto data layer prep) landed `7f887dd`** — `ApiClient`
additions (`libraryItems`/`librarySeries`/`searchLibrary`/`libraryItem`) and matching
models, reviewed against the real server source with no defects found. The browse tree
itself (Wave E2) ships `Continue`/`Books`/`Series` only, deliberately without a
`Downloaded` node — no offline-downloads feature exists yet anywhere in `apps/android`,
confirmed by grep; see `docs/ROADMAP.md` §7 for the full reasoning. **Next: wave E2**
(`MediaLibrarySession.Callback` overrides + a shared, non-`ViewModel` playback-item
resolver) — no spec written yet.

**Phase 8 wave A (podcast discovery backend) landed on `87595f0`.** Three BFF operations
against Audiobookshelf 2.36.0 — search the podcast directory, preview an RSS feed, subscribe
— verified against real upstream source, not assumed. No web or Android UI yet; that's the
next podcast wave, on whichever surface makes sense to build first. See `docs/ROADMAP.md` §8.

### Mantine — decided, full migration landed on this branch (`2a0d2e0`)

**Full migration to Mantine is settled** (user confirmed 2026-08-04, not a partial/spike-only
state) **and merged**: `2a0d2e0` landed it directly on `claude/media-client-app-k7v9by`, so the
`mantine-full-migration` worktree this section used to point to no longer holds anything not
already on this branch. Status, reconciled against the actual branch history, not assumed:

**Done and verified** (typecheck clean, unit tests pass, real dev-server screenshots inspected,
not just typechecked):

- Button, IconButton, Fab
- Chip, LinearProgress, CircularProgress, Skeleton
- Card, ListItem, Dialog
- NavigationBar, TopAppBar (`NavigationRail` deleted — dead code, superseded by `Shell.tsx`'s
  own inline Mantine `AppShell`/`NavLink` usage)
- `docs/DESIGN.md`/`docs/ARCHITECTURE.md` updated to describe Mantine as the implementation
  layer and to fix two unrelated stale claims (AudiobookBay-vs-Prowlarr priority,
  a phantom `packages/jellyfin-client/`)

**A real, high-risk bug was found and fixed**: Mantine's `unstyled` prop on `Modal` strips the
CSS that hides its always-mounted root while closed, leaving a permanent full-viewport
click-blocking overlay over the whole app. Fixed in `Dialog.tsx` by not setting `unstyled`.

**This class of bug is now confirmed absent from `Sheet.tsx`** (Mantine `Drawer`, a different
component from `Modal`, with an extra embedded-vs-modal mode `NowPlaying` depends on).
`Sheet.tsx` never set `unstyled` in the first place, but "doesn't set the known trigger" isn't
"verified absent" — Drawer's root wrapper (`Drawer.Root` → `ModalBase`'s outer `Box`) is
unconditionally mounted by Mantine regardless of `opened`, so it needed the same kind of
empirical check Dialog's bug was found with, not a grep. Two real-browser checks now do that:
`e2e/ui/sheet.spec.ts`'s "closing the sheet leaves nothing behind that intercepts clicks" (the
generic gallery `Sheet`) and `e2e/app/player.spec.ts`'s "closing Now Playing at compact width
leaves nothing behind that blocks the mini player" (the real app integration, `NowPlaying` via
`MiniPlayer`'s expand control — the compact breakpoint is the one where `Shell.tsx` gives
`NowPlaying` an actual closed state; `NowPlayingPanel`'s embedded/`expanded`-breakpoint usage
always passes `open` truthy, so it only got a cheap `elementFromPoint` check that nothing
blocks the adjacent nav rail, added to the existing breakpoint test). Both do a real
`page.mouse.click` at the trigger's actual screen coordinates after closing (not the locator
API's own `.click()`, which does its own interception checks and could mask exactly this bug);
`sheet.spec.ts`'s test additionally does an `elementFromPoint` sweep for any leftover node
carrying Mantine's `mantine-Drawer-*` static classes (`use-styles.mjs`'s
`getStaticClassNames`: `mantine-${themeName}-${selector}`) — the compact-width
`player.spec.ts` test relies on the mouse-click check alone.
No bug found; no fix was needed. `pnpm typecheck` (per-package), `pnpm lint`, `pnpm test` (764
unit tests) and the full `e2e/ui` + `e2e/app` suite (184 passed, 9 pre-existing failures — the
button/icon-button/browse.spec.ts set documented below, none newly broken; the dialog.spec.ts
Escape-focus flake documented separately below did not fail in this run) all pass.

Snackbar and SearchField weren't in this check's scope. Both packages typecheck and their own
`e2e/ui/snackbar.spec.ts`/`search-field.spec.ts` pass as part of the same full-suite run above,
but neither got the same dedicated overlay-bug-class check Sheet just did — worth doing if
either turns out to share this failure mode.

**Chip/Progress/Skeleton e2e fixes and `respectReducedMotion` are done.** `e2e/ui/chip.spec.ts`,
`progress.spec.ts` and `skeleton.spec.ts` now match Mantine's real DOM (chips are
`<input type="checkbox">` + `<label>`, not `<button>`; progress fills carry the static class
`mantine-Progress-section`; Skeleton's and CircularProgress's spin/shimmer animate on their
`::after` pseudo-element, not the element itself — `getComputedStyle` needs the second
argument to see it). `ThemeProvider.tsx`'s `MantineProvider` now gets
`theme={{ ..., respectReducedMotion: true }}` (it's a theme property, not a direct
`MantineProvider` prop). `e2e/ui` is 152 tests: **144 passed, 8 failed**, all 8 pre-existing
and outside this scope — 3 assertions × 2 projects in `button.spec.ts` (touch-target height,
`aria-busy` on the loading state, press corner-radius morph) and 1 × 2 in `icon-button.spec.ts`
(`.m3-icon-button__glyph` no longer exists), the same class of stale-Mantine-DOM locator drift
as chip/progress/skeleton had, just not in a file this pass touched.

**The full `pnpm test:e2e` (190 tests: `e2e/ui` + `e2e/app`) has two more pre-existing
failures beyond those 8**, both confirmed present already on `2a0d2e0`'s own CI run
(`gh run view 30856458080 --log-failed`), not introduced here: `e2e/app/browse.spec.ts` ›
"the Duration sort chip reorders the cards shortest to longest" — `LibraryPage.tsx`'s sort
chips are the same `@auralis/ui` `Chip`, so this is the identical checkbox-not-button DOM
drift `chip.spec.ts` had, just in an app-level spec, not a `packages/ui` one; and
`e2e/ui/dialog.spec.ts` › "Escape closes it and restores focus to the trigger", which only
failed on `ui-mobile` in CI's 2-worker run and did not reproduce locally under
`--workers=1`, so it may be a parallelism-dependent flake rather than a deterministic DOM
break — worth re-checking under CI's real worker count before assuming it's the same class
of bug. Neither was in this pass's scope (chip/progress/skeleton, `e2e/ui` only); noted here
so the next session doesn't have to re-run all of CI to rediscover them.

**Update 2026-08-04: both of the above, plus the button/icon-button failures from the
paragraph before it, are now fixed.** `2bea957` reformatted the four files `format:check`
was failing on (mechanical, no behavior change). `278e3fc` fixed the four real regressions:
`Button`'s default height was Mantine's 42px (below the 48px minimum touch target, fixed
with a `data-m3-size`-scoped `min-height` so `sm`/`lg` buttons elsewhere stay compact),
Mantine's `Button` doesn't set `aria-busy` when `loading` (added explicitly), the M3
Expressive corner-radius shape-morph on press was restored using the existing
`--m3-shape-full`/`--m3-shape-md` tokens, and `IconButton`'s toggle-glyph spring animation
was restored with a `.m3-icon-button__glyph` wrapper span. The same commit fixed
`browse.spec.ts`'s stale `getByRole('button')` locator to match chip.spec.ts's existing
checkbox+label pattern. CI is green on `c556d22` — verified directly via `gh run watch`,
not inferred from the push.

Fixing the locators surfaced one real bug, not just stale selectors: Mantine's
`respectReducedMotion` only disarms its JS-driven `Transition` machinery (`Modal`, `Drawer`,
`Collapse`, …) via a `[data-reduce-motion]` opt-in that, among Mantine's own components, only
`Spoiler` ever sets — `Skeleton`'s shimmer is a plain CSS `@keyframes` animation and was
**never** affected by the flag. `packages/ui/src/components/Skeleton.tsx` now drives its
`animate` prop from the same `prefersReducedMotion`/`watchReducedMotion` `ThemeProvider`
already uses, closing the gap directly rather than leaning on a Mantine mechanism that doesn't
reach it. The same gap (untested) likely applies to `Loader`'s spin and `Progress`'s stripe
scroll — worth a look if either grows a reduced-motion test later. The old hand-rolled
`Skeleton.css` had equivalent handling and is now fully dead code (superseded by Mantine's
`Skeleton`, left in place rather than deleted as part of this fix).

Also worth a human look, not a bug: `LinearProgress`'s `wavy` mode no longer renders a
distinct M3 Expressive wave — Mantine has no such primitive, so `wavy` now only thickens the
bar (see `LinearProgress.tsx`'s doc comment). `progress.spec.ts`'s wavy test was rewritten to
assert the real current behavior (thicker, not wave-shaped). No doc currently promises the
wave visual, so nothing else needed correcting, but it's a visible regression against "the UI
must be beautiful" worth a product decision.

**Three new Claude Code hooks were built in this same worktree** (`scripts/hooks/agent-log.sh`,
`doc-feedback-accumulate.sh`, `doc-feedback-review.sh`, `delegation-nudge.sh`) — logging
subagent launches/ends (cross-worktree, via a shared file under `git rev-parse
--git-common-dir`), accumulating documentation-relevant user feedback for later batch review,
and a delegation nudge. All are registered in _this worktree's_ `.claude/settings.json` only —
they cannot arm in any live session until this branch merges, and none have been observed
firing in a real conversation yet (only pipe-tested with synthesized stdin). `delegation-nudge`
specifically should stay disabled/uncommitted even after merge: its live classification path
(a nested headless `claude -p` call) has never succeeded in testing and measured close to a
full timeout (5.66s/6s) on one real attempt — a synchronous hook with that latency risk and no
proven success path is worse than no hook.

Also left in the worktree: assorted untracked debug scripts (`debug-sheet*.mjs`, `inspect*.mjs`,
`*-shot.mjs`) from agents' own screenshot/verification work — scratch, not meant to be committed,
clean up before or during final integration.

(Phase 7's Android work is unaffected by any of this — it shares no code with either web
component system.)

**Phase 5 is complete.** Home shelves, library browse with filter and sort, typed search
results, the player's logic layer (`features/player/playback.ts`, `state/playerStore.ts`,
`state/settingsStore.ts`) and now its surface: `NowPlaying` (a `Sheet` under the `expanded`
breakpoint, embedded directly above it), `MiniPlayer`, `ChapterList`, `BookmarkControls`,
`SleepTimerControl`, and variable speed / ±skip transport. `Shell.tsx` mounts the three
argument-free hooks — `useAudioElement`, `useMediaSession`, `useProgressSync` — once, for
every signed-in route.

Progress sync was the last gap and is the one piece worth knowing the reasoning behind:
**`timeListened` is measured from wall-clock time spent playing, never from how far
`currentTime` moved.** A seek, chapter jump or ±30s skip moves the position with nobody
listening, and Audiobookshelf folds `timeListened` into permanent listening statistics.
`features/player/progressSync.ts` holds that arithmetic as a pure, tested function;
`useProgressSync.ts` schedules it every 15s and on `pagehide`, and syncs-then-closes on
teardown (Audiobookshelf finalises a session on close, so the reverse order reports into a
closed session).

**Phase 5a closed on 2026-08-03.** Its first CI run went green and uploaded a 12 MB
`auralis-debug-apk`, which is the proof the phase existed to get: blind-written Compose
compiles, the Android Auto manifest merges, and the committed Gradle wrapper passes
`gradle/actions/wrapper-validation`. Phase 7 has a working pipeline to build on. Still no
JDK/SDK/Gradle on this machine, so CI is the only place Android compiles — check the
`Android` workflow after any `apps/android` change, since you cannot build it locally.

Green as of `07ce0c3`: `pnpm typecheck`, `pnpm lint`, **354 unit tests**, **181 Playwright
tests** (156 UI + 25 app end-to-end), and `pnpm test:docker` (the container smoke test).

`docs/ROADMAP.md` is the source of truth for status. Everything is on the branch
**`claude/media-client-app-k7v9by`**; do not push elsewhere without asking.

**Check `docs/agent-specs/`.** Subagent specs written but never launched — usually because
the usage gate closed first — are parked there, and each one that exists should be listed
below as a TODO. Empty but for its README means there is nothing queued.

<!-- pending specs: none -->

Both phase-6 specs were launched and deleted in the commits that landed their work — this
directory means _unlaunched_, and a spec left here after the fact reads as a TODO that is
already done.

### Phase 6 — closed 2026-08-03

CI has now actually been read (it hadn't been, for two prior commits) and is green: lint/
format/typecheck, 729 unit tests, Playwright 193/193 including `e2e/app/requests.spec.ts`
(which had never executed before this), and the Docker smoke test. Getting there needed two
follow-up fixes, both now on the branch:

- `c9bee10` — three doc-only commits landed without running Prettier; reformatted, no
  content changes.
- `daa132b` + `29e9856` — `e2e/app/player.spec.ts` (a **pre-existing Phase 5 test**, nothing
  phase 6 touched) failed intermittently under CI load. Root cause: the e2e fixture audio
  can't decode, and that produces _two_ independent async paths that revert the player
  store's "playing" state — `HTMLMediaElement.play()` rejecting, and, separately, assigning
  `.src` triggering the browser's real media-load pipeline, which fires a native `error`
  event on decode failure. Either could land inside the test's own assertions. Fixed by
  neutralising the audio element in that spec file entirely (`.src` becomes an inert
  instance property, `play()`/`pause()` no-op) rather than continuing to race a browser
  behaviour the suite was never meant to depend on. If a _different_ player test starts
  flaking later, re-read this — the same two paths are still there in production code,
  correctly, and are what any future audio-related e2e spec will need to neutralise the
  same way.

The web wave's presentational layer (`polling.ts`, `providerForm.ts`, `requestAnyway.ts`,
`format.ts`, `destinations.ts` and the components around them) is now covered by that green
Playwright run, not just unit tests. The server side was reviewed twice during the phase and
both rounds found real defects, since fixed.

**Two product decisions worth a human's opinion**, neither a bug:

- **`GET /requests` is unscoped by caller.** Any signed-in user sees — and can delete —
  everyone's requests. That matches Overseerr and is right for one person's own server, but
  combined with approval defaulting to automatic it means a shared install has no privacy
  and no gate. Worth deciding before anyone else gets an account.
- **`shelfarr` and `deemix` are already running on the development machine.** `shelfarr`
  overlaps this phase's pipeline; `deemix` cuts against the phase-9 decision to use slskd.
  Neither was designed around — worth asking the user rather than assuming.

### Phase 6 — what is decided, so it is not re-litigated

- **Prowlarr is the primary indexer; the AudiobookBay scraper is the fallback.** The
  development machine already runs Prowlarr with AudioBook Bay, MyAnonamouse, EBookBay and
  Knaben configured, plus `byparr` (a FlareSolverr-compatible solver). AudiobookBay is
  behind Cloudflare, Prowlarr gets through by delegating to the solver, and a direct
  BFF-side scrape cannot. `docs/ROADMAP.md` §6 has the full reasoning.
- **Provider credentials are server-scoped, in `provider_configs`, not in `secrets`.** The
  `secrets` table is keyed by `user_id` because an Audiobookshelf token belongs to whoever
  signed in. A Prowlarr API key belongs to the installation. An undecryptable secret reads
  as _unconfigured_ rather than erroring, so rotating `SESSION_SECRET` sends you to the
  settings screen instead of 500ing every search.
- **The download save path is a setting with no default.** The BFF and the download client
  are different containers with different mounts — here, qBittorrent sees
  `/data/media/Downloads` as `/data/Downloads` while Audiobookshelf sees `/data/media` as
  `/data`. Guessing produces downloads that complete and are never imported, which is the
  worst failure mode available because every component reports success.
- **Approval defaults to automatic**, on the grounds that this is one person's own server.

### Phase 4 — what closing it changed

The three open items are closed. Two of them turned up things worth knowing:

1. **`e2e/app` now has 18 specs** across onboarding, navigation, session and errors. The
   structural thing to understand before adding more: the `app` project's BFF is
   **single-tenant and stateful** — `POST /api/v1/setup` configures it for the whole
   process — so `fullyParallel` would race "assert the unconfigured state" against "sign
   in". `onboarding.spec.ts` is therefore its own Playwright project that everything else
   `dependencies` on, and it also writes the `storageState` the rest of the suite starts
   signed in from. That second part is not an optimisation: `POST /auth/login` is rate
   limited to **10/min per IP** and all workers share one, so a suite that signed in per
   test 429s partway through. `playwright.config.ts` says all of this in place.
2. **The container is built, booted and covered by CI.** `scripts/docker-smoke.sh`
   (`pnpm test:docker`, and the `container` job in CI) builds the image, waits on its own
   HEALTHCHECK, asserts the SPA/asset/API-404 split, authenticates end to end against
   `AURALIS_FAKE_UPSTREAMS=1`, and times `docker stop`.

   Closing it moved the fake upstream from `apps/server/test/fakes` to
   **`apps/server/src/testSupport/fakes`**. `AURALIS_FAKE_UPSTREAMS` is a runtime flag the
   _shipped_ server parses alongside `PORT`, so the code it loads has to be in the image;
   a `test/` sibling is not copied in, and that mode died on an unresolvable import inside
   the container while working perfectly outside it.

3. `apps/server`'s `start` still runs `tsx` against TypeScript sources, which is why `tsx`
   is a production dependency. Left as-is deliberately; if the image is slimmed later,
   compile instead.

---

## 3. Decisions already made, and why

Do not silently re-litigate these. If you disagree, say so and make the case.

**A thin Fastify BFF sits between the clients and the media server.** Three independent
reasons: Audiobookshelf and Jellyfin do not emit CORS headers for arbitrary origins, so a
pure browser client is blocked; AudiobookBay has no API and can only be scraped
server-side; and indexer/torrent credentials must never ship inside a browser bundle or an
APK. A side benefit is that web and Android consume one identical typed API, so parity is
structural rather than aspirational.

**No animation library.** Material 3 Expressive is spring-based. Rather than ship
Framer Motion, the token layer compiles spring physics into CSS `linear()` easing strings
at build time, so animation runs on the compositor with no per-frame JS. This is the main
reason the app can be both "beautiful" and "performant". Gesture-driven surfaces (sheet
drag, Now Playing expansion) use raw pointer events plus transforms.

**Colour is derived from artwork at runtime** with `@material/material-color-utilities` —
the Symfonium behaviour the user called out. Every generated `on*`/container pair is
asserted to clear WCAG AA in unit tests, in both light and dark.

**PWA, not Electron.** The desktop story is an installable PWA served by the same
container: own window, offline shell, OS media keys, nothing extra to bundle or update. If
the user later wants a true native desktop binary, Tauri is the cheap addition.

**slskd, not deemix, as the reference music-request provider.** deemix is unmaintained.
The provider interface is pluggable, so deemix or anything else is a new file, not a
refactor. Flag this to the user if they push back — they asked for "something like deemix",
and slskd is the working equivalent.

**Native Android (Compose + Media3), not a webview wrapper.** "No compromises" rules out a
Capacitor shell: background playback, offline downloads, media-session integration and
Android Auto all want the real thing.

**One container, one port.** The BFF serves the built web assets on its own origin, so
there is no separate nginx and no CORS configuration for the user to get wrong.

---

## 4. What is different now that you are on a laptop, talking to the media server remotely

**Updated 2026-08-03.** Development moved a second time: from an ephemeral cloud container
(no real server access at all) to the media server itself (commit `108ae0e`), and now from
the media server to a **separate laptop** (`SofiaThinkPad`) on the same Tailscale tailnet.
Reason for this second move: the media server has 3.7 GiB of RAM and runs the whole media
stack beside this repo, and unattended/CI-scale work here twice pushed it into a multi-hour
RAM-thrash stall (see mediaserver's own `~/CLAUDE.md`, "Out of RAM looks exactly like an
outage"). The laptop has no such constraint and no competing services.

**Mediaserver still runs the media stack** (Jellyfin, Audiobookshelf, qBittorrent, etc.) —
only the _development_ moved. Auralis now talks to it as a remote client instead of a
container sharing its Docker host.

### Network reachability changed

The previous setup (documented as it was found in `docs/setup/`) relied on Auralis's
containers sharing mediaserver's own Docker daemon: `host.docker.internal` +
`extra_hosts: host-gateway` for Jellyfin (a host service, not a container), and
container-name DNS (`gluetun:8080`, `audiobookshelf:80`) over the `arr_default` network for
the rest. None of that resolves from a separate machine. The dev loop now reaches every
upstream as a plain host address instead:

- Jellyfin: `192.168.100.34:8096`
- Audiobookshelf: `192.168.100.34:13378`
- qBittorrent WebUI: `192.168.100.34:8080`

(Reachable equally over the LAN or the private mesh VPN mentioned in `docs/setup/MY_SETUP.md` — its own identity is deliberately not written here; this is a public repo.)

`docs/setup/MY_SETUP.md` has the updated reachability answers per-service;
`docs/setup/HOST_REPORT.md` keeps the mediaserver host facts as target-server reference,
with a note on which parts (the container-network addressing) no longer apply directly.

One side effect worth knowing: mediaserver's host port `8787` conflict with its `bookshelf`
container doesn't exist on this laptop, so `pnpm dev`'s documented "BFF on :8787" now works
without the port workaround the setup docs describe for mediaserver itself.

### CI is the authoritative signal, but local running is no longer off-limits

This section previously said `pnpm test:e2e`/`playwright test`/the Docker smoke test/Gradle
were "denied by a hook on this laptop," mirroring mediaserver's RAM-driven
`block-local-ci.sh`. **Checked directly and corrected 2026-08-03: no such hook exists on this
laptop** — `~/.claude/hooks/` here only has `check-script-docs.sh` and `check-uncommitted.sh`,
neither of which touches CI commands. This laptop also isn't RAM-constrained the way
mediaserver is (7.8 GiB here vs. mediaserver's 3.7 GiB, and no media stack sharing it). See
`CLAUDE.md`'s "Definition of done" for the corrected guidance: real caution (single Playwright
worker, watch `free -h`, don't overlap the Docker smoke test with it) rather than a blanket
ban. Gradle still can't run locally — no JDK/Android SDK installed — but that's an install gap,
not a policy. `gh` is installed and authenticatable (`gh auth login`), so CI results can be
read directly rather than only inferred from a pushed SHA.

### Verify the clients against reality

The Audiobookshelf client was written against **fixtures**, from documented endpoint
shapes. Before building more on top of it:

1. Use the real Audiobookshelf URL and credentials from `docs/setup/MY_SETUP.md`.
2. Record the **actual** responses for the endpoints in `docs/INTEGRATIONS.md` and diff
   them against `apps/server/src/testSupport/fakes/fixtures/*.json`.
3. Where reality differs, fix the fixtures **and** the zod schemas, and add a regression
   test. Audiobookshelf payloads vary by version and by `minified`/`expanded` mode — this
   is the single most likely source of "works in tests, breaks on the real server".
4. Note the Audiobookshelf **version** in the fixture files, since the API drifts.

Do the same for Jellyfin before Phase 8.

### Things you can now do

- Point the app at real libraries over LAN/Tailscale and see real cover art, real chapter
  data, real long-file seeking. Range-request behaviour in particular deserves a real-world
  check against a multi-hour M4B, not just the synthetic byte-range test — though per
  `docs/setup/MY_SETUP.md`, the real library is dominated by chaptered MP3, not M4B, so
  weight that check accordingly.
- Measure performance on real library sizes (231 items today — small; see
  `docs/setup/MY_SETUP.md` Part 3 before assuming otherwise).
- `docker compose up` to validate the image — not yet set up on this laptop (Docker Desktop
  is on the Windows host but WSL integration isn't enabled for this distro). A separate ask
  if/when needed; not part of this migration.
- Building the Android app locally is still not possible — no Android SDK here either,
  same as before the move. CI is still the only place it compiles.

### Things already found out (were open questions here; now answered)

Everything this section used to ask about the user's server is now recorded in
`docs/setup/MY_SETUP.md` and `docs/setup/HOST_REPORT.md` — Audiobookshelf/Jellyfin URLs and
versions, the torrent client and its WebUI, **the save-path gap** (Audiobookshelf does not
watch qBittorrent's download folder — read that section, it is the most important thing in
`MY_SETUP.md`), Prowlarr/indexer configuration, the reverse-proxy setup, and that the server
is shared with family (so request approval is a real requirement, not hypothetical). Read
those two docs rather than re-deriving any of this.

---

## 5. How to work in this repo

```bash
pnpm install
pnpm dev            # BFF on :8787, web on :5173
pnpm dev:fake       # same, against built-in fake upstreams (no media server needed)

pnpm test           # Vitest — pure logic, clients, BFF routes
pnpm test:e2e       # Playwright — UI + end-to-end
pnpm typecheck && pnpm lint && pnpm format
```

**Test-driven, strictly.** The user asked for it explicitly and the codebase is built that
way. Write the failing test first. Tests read as behaviour descriptions, not as
`it('works')`. No network in unit tests — the clients take an injected `fetch`.

**House style**: total functions that degrade rather than throw; doc comments that explain
_why_, not _what_; zod parsing at every upstream boundary so shape drift surfaces as a
typed error instead of `undefined` deep in a component; no `any` used to dodge a type error.

**Delegation — active again since 2026-08-02.** `CLAUDE.md` has the full rules; the two
that matter most, both learned the hard way:

- **Agent cost is quadratic in turns per agent**, because every turn re-reads the whole
  accumulated context. Measured here: ~300 turns each, context growing 63k → 275k tokens,
  48–61M cache reads apiece, and the user's own usage report attributed **81% of
  consumption to requests above 150k context**. So scope agents _small_ — under ~150 turns —
  and write specs precise enough that they never explore. Bigger agent tasks are **not**
  cheaper.
- **Pre-install dependencies and pre-create manifests before spawning**, and forbid agents
  from running `pnpm install` or committing. Concurrent agents corrupt the lockfile.

**Plan usage.** `scripts/usage-guard.py` reads the account's real utilisation from the same
endpoint `/usage` uses, and fails open on every error path. `.claude/settings.json` runs
`scripts/hooks/usage-gate.sh` on `SessionStart`, `UserPromptSubmit` and every `PreToolUse`
— reporting under 85%, urging a hand-off between 85 and 90, denying **every tool call**
past 90.

Two things to know before trusting a reading:

- **Hand off inside the 85–90 band.** Past the ceiling the denial covers the tools you
  would need to hand off with — no commit, no push, no edit to this file — and whatever
  replaces you is a fresh session that reads only what is on disk. Unlaunched subagent
  specs go to `docs/agent-specs/` and get listed here as the next TODO.
- **A passing gate is not the same as affordable.** The number is whole-account, and one
  Sonnet subagent runs 48–61M cache reads. At 74% the gate says go and a subagent still
  does not fit in the remaining 6 points.

The **estimating** version of this guard is gone, and the history is worth one line so it
is not rebuilt: it projected usage from local transcript files, calibrated against a
percentage a human read out of `/usage`, and was wrong by a factor of about thirty-three —
transcripts are filed per working directory and it counted one of them. The lesson kept is
"do not estimate", not "estimate better".

**Work from the repo root.** Claude Code resolves `CLAUDE.md` and `.claude/settings.json` by
walking _up_ from the session's working directory. A session started elsewhere loads no
hooks, silently — and unloaded hooks do not run the guard at all.

**Verify agent output — do not trust it.** Two real defects reached the branch and passed a
glance-level review: bottom-sheet detents snapped to the _nearest_ detent, silently fighting
the user's drag direction, and `registerStaticServing` declared a return type it did not
return. An agent that stopped has not necessarily finished; run the full suite and read the
diff. And never commit a red tree — CI builds this branch.

**Commits**: descriptive body explaining the reasoning, `Co-Authored-By: Claude Opus 5` and
the session trailer. Deliver phase by phase; keep `docs/ROADMAP.md` statuses current.

---

## 6. Environment gotchas

- **`pnpm typecheck` from the repo root did not complete on this machine**, across three
  attempts on 2026-08-03; it runs five `tsc` processes in parallel. Typechecking one package
  at a time — `npx tsc -p apps/server/tsconfig.json --noEmit`, and the same for `apps/web`,
  `packages/core`, `packages/abs-client`, `packages/ui` — finished cleanly every time, and
  is what phase 6 was verified with. The cause was **not** established: the box is memory-
  tight, which makes a cap plausible, but each attempt also ended in a way that could have
  been the harness rather than the kernel, and no OOM evidence was collected. Use the
  per-package form; do not repeat the memory explanation as though it were measured.
- **Playwright browsers**: the previous sandbox pre-installed Chromium under
  `PLAYWRIGHT_BROWSERS_PATH` at a build number that did not match the installed Playwright,
  and downloads were blocked. `playwright.config.ts` auto-detects and points at whatever
  build is on disk, falling back to the default lookup when `playwright install` has run
  normally. On a normal machine this resolves to `undefined` and nothing special happens —
  leave the helper in place, it is harmless.
- **pnpm build scripts**: `esbuild` and `better-sqlite3` need approval to run install
  scripts; they are listed under `pnpm.onlyBuiltDependencies` in the root `package.json`.
- **`SESSION_SECRET`** keys the AES-256-GCM encryption of stored upstream credentials.
  Changing it invalidates every stored secret. Generate a real one for the media server.
- **Never commit real credentials, tokens or the user's server hostnames.** Fixtures must
  stay synthetic.

---

## 7. Suggested first moves

1. Read the roadmap; confirm which phases are actually complete by running the suite.
2. Collect the real service details from section 4 and get the app talking to the real
   Audiobookshelf.
3. Reconcile fixtures and schemas against real responses; add regression tests.
4. Continue the roadmap from the first unfinished phase — likely Phase 4 (web shell +
   Docker image), since that is what turns the work so far into something the user can
   actually open in a browser and judge.
5. Get it in front of the user early. They have strong visual references and opinions;
   a screenshot of the real shell against their real library is worth more than another
   phase of unreviewed work.

---

## 8. Open questions the previous session did not resolve

- Does the user want request **approval** (multi-user) or is it a single-user box where
  every request should just go straight to the torrent client?
- Which torrent client, and the exact save path Audiobookshelf watches.
- Do they want ebook support alongside audiobooks? Audiobookshelf handles both; the
  roadmap currently covers audio only.
- Android distribution: sideloaded debug APK, self-hosted F-Droid repo, or Play Store?
- Do they want Chromecast / DLNA output? Symfonium has it and they cited Symfonium, but
  they never asked for it directly.
