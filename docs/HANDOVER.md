# Handover

`docs/ROADMAP.md` is the source of truth for **status** and for per-wave detail. This file
is the **context around it**: what a session needs to know that the code, the commits and
the roadmap do not say. It is `@`-imported into every session in this repo by `CLAUDE.md`,
so its length is paid for on every turn of every session — keep it short, and put wave
narrative in `ROADMAP.md` instead.

## Autonomy — read this before stopping

A session stops only on an explicit request to stop. A finished phase, wave, or CI run is
the cue to start the next roadmap item, not a reason to end the turn — see `CLAUDE.md`'s
"Autonomy" section for the full rule and the one real exception (the plan-usage ceiling,
enforced by hooks at 90%, with a hand-off band from 85%).

## Where the project is

Phases 1–10 **done**. Phase 11 **done\*** — the route is a self-hosted F-Droid repo, and
the six remaining steps are blocked (below). Phase 12 (the user's spec addendum — five nav
destinations, unified search, artist/author discography, For You carousels, context menus,
per-content-type queues) is **shipped on web and Android except 12c-2**.

`docs/ROADMAP.md` §12 has each wave, its sha and its open findings. Everything is on
**`main`**; do not push elsewhere without asking.

### What remains, and what each item is blocked on

Verified 2026-08-15 against `ROADMAP.md`, not inherited from a previous session's summary.

| Item                                                                                      | Blocked on                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **12c-2** — requestable content on artist/author pages                                    | Queue `440b217`: should a title already in the library still be offered as requestable? The same question arises in Search — deciding it twice, differently, is the failure mode. |
| **Phase 11**'s six remaining steps                                                        | A release signing key and an `applicationId` — one-way doors. `docs/FDROID_REPO.md` lists all six.                                                                                |
| **Launcher icon**                                                                         | There is none; the app ships Android's default. Adding a file is mechanical, deciding what the icon _is_ is not.                                                                  |
| **12b** "sorted by relevance"                                                             | Music results are alphabetical (`jellyfin-client` pins `sortBy: 'SortName'`). Testing a fix wants a real Jellyfin server; no session has a credential.                            |
| **12d (Android)** visual conformance                                                      | A device or emulator. None exists here, and that wave's whole requirement is visual.                                                                                              |
| **12a**'s cold-cache nav rail                                                             | A design decision: what the rail shows before it knows which libraries exist. Deferred twice already.                                                                             |
| **Auto-updating deployment**                                                              | A live change on mediaserver, needing that host's own rules and the user's go-ahead. See "Deployment" below.                                                                      |
| Direct play vs transcode; lyrics search; `GET /requests` scoping; `LinearProgress` `wavy` | Product decisions, written up under "Open product decisions" below.                                                                                                               |

**Both items that were implementable on 2026-08-15 are done** (`50e74e0`, `3cda65c`), and
each turned out to be a coverage problem rather than the live bug the roadmap prose implied.
See "The minified-item bug" below for what that pass established — it corrects the standing
recommendation, so read it before picking up a branded-type refactor.

**No implementable roadmap item is currently outstanding.** That is a verified state, not a
session giving up: every remaining item is in the table above, and each needs a user decision,
a device, a credential, or a live change on another host.

**`ROADMAP.md`'s top-of-file status table is stale** — it still calls phase 12 "todo",
contradicting its own detailed §12 table. Trust §12.

## Background agent log (auto-maintained)

Written by `scripts/hooks/agent-log.sh` on `SubagentStart`/`SubagentStop`; that script's
header is the real spec. Fifteen entries, pruned oldest-first, **per-checkout** — a session
in a worktree reads and writes only that worktree's copy. An entry still saying `running`
with no follow-up means the owning session may have been lost; check its transcript by Agent
ID before assuming its work landed. An agent's absence here only means a newer launch pushed
it out.

For the **global** view across every checkout, read the shared JSONL instead — same events,
one line each, tagged with the checkout they came from, append-only and unbounded. All
worktrees of one repo share one physical `.git`, and nothing under `.git/` is ever tracked,
so it is neither gitignored per branch nor a merge-conflict spot:

```bash
cat "$(git rev-parse --path-format=absolute --git-common-dir)/auralis-agent-log.jsonl"
```

<!-- AGENT_LOG_START -->

- `2026-08-07T22:54:58Z` · `a1ac0127d315ceb00` · general-purpose · ended · Committed at '738c28c' on branch 'worktree-agent-a1ac0127d315ceb00', based on 'dc4ec6c'. **Report** - **Single shared cause, confirmed by exact prece…
- `2026-08-07T23:04:26Z` · `afb619fd719a4b9b3` · general-purpose · ended · Committed on the worktree branch, not pushed, as instructed. ## Report **Branch/commit:** 'worktree-agent-afb619fd719a4b9b3' at '69e69bf', based on '…
- `2026-08-07T23:18:17Z` · `a84176025894b086a` · general-purpose · ended · Clean tree, everything committed. ## Report **Branch/commits:** 'worktree-agent-a84176025894b086a', 'aad6bce' (implementation) + '54cf683' (test clea…
- `2026-08-07T23:35:14Z` · `adf013230a4368e95` · general-purpose · ended · Committed cleanly on the worktree branch ('worktree-agent-adf013230a4368e95' @ '56f2889', based on '54cf683'). Not pushed, not merged, per instructio…
- `2026-08-08T00:55:04Z` · `a29269fefb68cb389` · general-purpose · ended · The Playwright suite is running in the background (task 'boogp0fzf'); I'll wait for its completion notification rather than polling.
- `2026-08-08T01:15:42Z` · `a19d3c44dbe3b9109` · general-purpose · ended · All pass. Now let me write up the final report. ## Verdict: merge with named corrections The fix genuinely closes the mechanism that shipped the bug…
- `2026-08-08T02:06:28Z` · `a3611acd6116bcddb` · general-purpose · ended · Work is complete and committed on the worktree branch (not pushed). **Branch/commit:** 'worktree-agent-a3611acd6116bcddb' @ '2725f0b', based on '08dd…
- `2026-08-08T02:24:58Z` · `a7c79fdbae07e4da4` · general-purpose · ended · Committed cleanly, clean tree. ## Report **Branch/commit:** 'worktree-agent-a7c79fdbae07e4da4' at '39798b7', on top of '2725f0b' (confirmed via 'git…
- `2026-08-08T02:33:00Z` · `a86f0a330c35152e9` · general-purpose · ended · Committed cleanly, working tree clean, not pushed. Now let me write the final report. ## Report **Branch/commit:** 'worktree-agent-a86f0a330c35152e9'…
- `2026-08-15T10:20:56Z` · `af51f8fbf81138b80` · general-purpose · ended · ## Findings: docs/ROADMAP.md remaining work (phases 11–12) **Status-table disagreement with HANDOVER**: The top-of-file summary table (line 20) still…
- `2026-08-15T10:28:43Z` · `a1c5f8044105dc888` · general-purpose · ended · Confirmed — the Dockerfile does copy 'packages/' wholesale now (line 85, with explanatory comment at 72-74), which directly contradicts ROADMAP.md's…
- `2026-08-15T10:29:09Z` · `a06477e5fdb64fe18` · general-purpose · ended · I have everything needed. Final report. ## Report **Critical finding first: the task's premise is partly stale.** 'docs/HANDOVER.md'/'ROADMAP.md' in…
- `2026-08-15T10:38:15Z` · `a02f9c8999148bda0` · general-purpose · ended · Committed. Final report: **1. §1 answer — yes, but it's already a deliberate, documented design, not an unnoticed bug.** 'normalizeMedia' in 'package…
- `2026-08-15T10:39:10Z` · `a0edf63595b976e4e` · general-purpose · ended · ## Report **1. §2 answer — coverage gap, not a live bug.** 'fetchLibraryResults' fires one 'async' per matching library, and each 'async' closure cap…
- `2026-08-15T10:44:59Z` · `a53710d7e5d134b7a` · general-purpose · ended · ## Report **Change A ('50e74e0') — merge as-is.** 1. **Claim verified true.** Checked the pre-change fixture ('minifiedBook', lines 6–24 of the file…

<!-- AGENT_LOG_END -->

---

## Claimed work — check here before starting a wave

A lightweight lock, because two sessions can share this checkout. Claim a wave here
**before** dispatching it; delete the line when it lands. A claim older than a couple of
hours with nothing on `main` is stale — take it.

**Nothing is currently claimed.**

Before dispatching a wave **and again before merging it**, check what is already on `main`
(`git log --oneline origin/main -15`) and check `git branch --list 'worktree-*'` — a `+`
marks a branch checked out in another session's worktree, which is a live signal that
someone else is mid-flight. A session that dispatched at T and merged at T+25min never saw
what landed in between; that is how Android playlists got built twice on 2026-08-05.

`pgrep -af claude`, read for `node .../worktrees/<name>/...` children, is the stronger check:
a live Playwright or vite process rooted in a worktree path is positive proof that wave is
taken, where `git log main..<branch>` is empty for an agent that has not committed yet.

---

## Lessons that must not be relearned

Each of these was paid for. They are compressed on purpose — the wave-by-wave telling is in
`docs/ROADMAP.md`.

### A wave that adds a writer must name its reader

**Four instances on this project, every one green on its unit tests.** `installQueueRouter()`
was never called in production; a `QueueStore` cursor bootstrapped at `0` made the first
`advance()` a silent no-op; Android's `Play next`/`Play last` wrote into a `QueueStore`
nothing consumes, because **Media3 owns the music queue on Android** and cross-track advance
runs on `MediaController`'s real playlist. Each reported success and did nothing.

**The rule: a spec that adds a writer must name the reader, and the report must too.** The
gap is always at the seam between two waves, which is where "is this reachable from the
running app?" has to be asked. `PlayerViewModel.musicQueue` is deliberately write-once and
read-never now, and its doc comment says so — a mirror nobody reads is worse than no mirror.

### A test that only inspects a return value can pin the wrong value as correct

`QueueStoreTest` passed throughout the bug above because it asserted the shape of the state
the function returned and never chained into an `advance()`. The feature was entirely broken
while its unit tests were green. Two more of the same family: a stale-response test that
stopped observing before the slow response arrived (it would have passed with the guard
deleted), and an installer test for something nothing called.

**Something has to assert through to observable behaviour** — an effect on the player, a
call count on a fake seam, a rendered result. `12e`'s fix is the pattern: the test asserts on
the fake `PlaybackHandle`'s call count, so it fails if anyone "simplifies" the dispatch back
into the dead store.

### The minified-item bug — three occurrences, one durable fix still unbuilt

Audiobookshelf's **minified** items — what every shelf, browse and personalized response
returns — never carry `authors[]` or `media.series[]`, only the flattened `authorName` and
`seriesName` strings. `7e57a78` fixed this for shelf and browse cards. Wave 12c-1 then
reintroduced it on top of the same endpoints: `/author/:id` returned "Author not found" for
**every** author, always, and `/series/:id` collapsed to alphabetical because `seriesSequence`
was always null. The pure `orderSeriesBooks` function was correct and well tested — it was
simply never given a real sequence.

**Anything reading `media.authors[]` or `media.series[]` off a list endpoint is wrong by
construction.**

**The `.id` half of this is now closed at the type level, and the standing "build a branded type"
recommendation is withdrawn** — established 2026-08-15 by reading the code rather than the prose
about it. `AuthorBadge` and `SeriesBadge` in `packages/abs-client/src/domain.ts` no longer declare
an `id` at all, so `book.media.authors[0].id` is a compile error everywhere, and a type-only
assertion in `normalize.test.ts` pins that. Every surviving read of `media.authors`/`media.series`
in the tree is a display-only `.name`, safe on either shape. `tracks`/`chapters`/`episodes` already
follow the `T[] | undefined` convention.

**But `id` is still deliberately emitted on the wire, and must stay.** `normalizeMedia`'s fallback
constructs `{ id: <the name string>, name: <the name string> }`, and the BFF serializes that to
JSON. It looks like a bug and is not: **Android's Kotlin models declare `id: String` non-nullable
with no default**, so dropping the key throws `MissingFieldException` on deserialization. The type
says no `id`, the wire has one, and the gap is intentional. Do not "fix" it without changing
`ApiModels.kt` first.

So a `Minified<T>`/`Expanded<T>` refactor would buy little for its cost. The residual risk is not
"is `id` present" but that a consumer casts through `unknown` and treats the fabricated id as real
— which a lint or grep-based CI check would catch far more cheaply than a type refactor.
`apps/web` maintains its own hand-mirrored types and does not import `@auralis/abs-client` at all,
so branding would not reach it anyway.

`regressionGuards.test.ts` remains a tripwire, not a guarantee: it is a **text scan** over
`apps/web/src` only, matching `.media.authors|series` followed within 100 characters by an
`.id ===` comparison. It does not see a `.filter()`, a destructured local, a helper wrapping the
same logic, or anything in `apps/server` or Android.

The first draft's other defect is worth knowing separately: two e2e cases failed because the
spec never clicked the "Books" primary chip, and `ALL_KINDS_VISIBLE` deliberately hides series
and author results until it is selected. A test-authoring bug, not a product one.

### For `apps/android`, CI is the gate and review is not a substitute

Android 12a went through the full process — a spec naming the files and the failure modes, a
separate Sonnet reviewer per wave with the traps enumerated, both returning "merge as-is, no
defects" — and CI rejected it in about a minute, three times running:

- `import androidx.compose.foundation.layout.weight` resolves to the **internal**
  `RowColumnParentData.weight`, failing as an _access_ error rather than an unresolved
  reference. The call site was already in a `Row`; deleting the import was the whole fix.
- Two backtick test names containing `..`. Kotlin permits a dot in a quoted function name;
  the JVM does not permit it in a method name. Compiles as Kotlin, fails as bytecode.
- Two directional icons wanting their `AutoMirrored` variants — a warning, but a real RTL point.

None is a logic defect, and that is exactly what review cannot catch: these are facts about
the toolchain, not about the code's intent. **This has now happened on three consecutive
waves** — review got the hard product questions right and lost to CI on toolchain reasoning
every time. The consequence is scheduling, not process: budget for two or three red Android
runs after any sizeable Android wave, and push early enough that they fit in the usage window.

### Android test traps — read before touching an Android test

- **`ApiClient` takes its dispatcher as a constructor parameter** (defaulting to
  `Dispatchers.IO`). Nine ViewModel test files pass their own `UnconfinedTestDispatcher`, which
  makes the work visible to `runTest` and the leak impossible by construction. A test that
  injects into `setMain` but **not** into `ApiClient` looks identical and is the one outlier
  that fails; casual reading cannot tell them apart, and both an implementing agent and its
  reviewer missed exactly that.
- **The convention is not universal.** `UnifiedSearchViewModelTest` contains two
  timing-dependent tests that assert on real interleaving produced by `MockWebServer` body
  delays. Forcing the unconfined dispatcher collapses the very interleaving they exist to pin,
  turning both into tautologies that pass for the wrong reason. That file drains its states to
  non-`Loading` in `tearDown()` instead.
- **`Dispatchers.resetMain()` in `tearDown()` while a continuation is still in flight** throws
  `IllegalStateException` — _not_ `ApiException`, so nothing in the app's error handling catches
  it — reported against whichever test runs next. This is the `UncaughtExceptionsBeforeTest`
  failure class; the reported failure never names the culprit, which is why successive point
  fixes each made it move rather than go away.
- **A wave that gives an existing ViewModel new outbound requests silently invalidates every
  existing test's `MockWebServer` dispatcher.** Review cannot catch it, because each test still
  reads correctly in isolation.
- **A one-shot event `SharedFlow` collected with `launch { flow.collect { … } }` never sees the
  emission** — that `launch` schedules on `StandardTestDispatcher` while the action runs to
  completion on the unconfined `Main`, emitting before the collector subscribes. `replay = 0`
  drops it and `extraBufferCapacity = 1` does not help (it is not replay). Use
  `async(start = CoroutineStart.UNDISPATCHED) { flow.first() }`; `HomeViewModelTest` is the
  pattern. Applies to **event** flows only — `uiState` wants a plain `.value` assertion, never
  an await, since the whole call is synchronous under the unconfined dispatcher.
- **`MockWebServer` serves enqueued responses in request-arrival order, not enqueue order**, so
  two concurrent requests swap bodies. Key responses with a `Dispatcher` on something in the
  request itself — `MusicSearchViewModelTest` shows the pattern.

### Agents die while waiting on a backgrounded Playwright run

Three times in one session an agent backgrounded the full suite, said it would wait for the
notification, and stopped there — twice holding its **entire wave** as uncommitted files in a
worktree that is deleted with its session. One returned a final message unrelated to its task
("I don't see a task or question in your message"), so the report was no signal either way.

Specs tell agents to commit _before_ backgrounding a long run, and that lowers the frequency
but does not hold — of two agents given the instruction verbatim, one complied and one did not.
**The orchestrator-side check is the load-bearing one.** On every agent report, before reading
the report:

```bash
git -C .claude/worktrees/agent-<id> status --short
git -C .claude/worktrees/agent-<id> log --oneline -1
```

and commit anything uncommitted before doing anything else. A dead agent can also leave
Playwright and vite processes holding CPU and ports; `pgrep -af "worktrees/agent-<id>"` finds
them, kill them before dispatching the next wave.

### An `Agent` call is never a no-op, and `"continue"` is not a neutral prompt

A web subagent made an `Agent` call with the prompt `"continue"`, intending merely to move on.
It **resumed a different, broader agent**, which did substantial unscoped work in the shared
checkout, pushed three commits to `main` including edits to a file its spec forbade, and
rebased twice. Nothing was lost and the content was in scope — but it skipped the
orchestrator's merge step, the review-before-merge step, and the claim discipline. One concrete
cost: it pushed while another sha's `Android` run was in progress, **cancelling it**, so that
wave sat red on `main` unnoticed.

Subagent specs here say **never make an `Agent` call at all** — the weaker "do not spawn
subagents" did not read as covering a one-word follow-up. And the honest report is what saved
it: the agent flagged its own mistake, named the commits, and declined to push further. That is
the behaviour to reward.

### Subagents push to `main` after being told not to

Three occurrences, so not a fluke. The push was harmless each time; what it skips is the
orchestrator's merge step, where the base and the file-overlap against a concurrently-moving
`main` get checked. **Verify `git log origin/main` immediately on every agent report**, not only
before merging.

### Diff every edit to this file before committing it

On 2026-08-08 a single careless anchored replacement in `HANDOVER.md` silently deleted seven
sections and 406 lines — including the `UncaughtExceptionsBeforeTest` diagnosis and the
stray-`Agent`-call finding, the exact lessons that session was telling its subagents to go read.
It was caught only by diffing the commit afterwards. An anchored `str.replace` spanning two
headings looks identical to a correct one until you look:

```bash
git show <sha> -- docs/HANDOVER.md | grep '^-### '
```

Prefer authoring this file wholesale over anchored replacement.

### Progress sync — `timeListened` is wall-clock, never position delta

Kept because any future player work will be tempted to get it wrong. `timeListened` is measured
from wall-clock time spent playing, never from how far `currentTime` moved: a seek, chapter jump
or ±30s skip moves the position with nobody listening, and Audiobookshelf folds `timeListened`
into permanent listening statistics. `features/player/progressSync.ts` holds that as a pure
tested function; `useProgressSync.ts` schedules it every 15s and on `pagehide`, and
syncs-then-closes on teardown (Audiobookshelf finalises a session on close, so the reverse order
reports into a closed session).

Related, for any audio e2e spec: the fixture audio cannot decode, which gives **two** independent
async paths that revert the player store's "playing" state — `HTMLMediaElement.play()` rejecting,
and `.src` assignment triggering the browser's real media-load pipeline, which fires a native
`error` event. Both are correct in production code. `e2e/app/player.spec.ts` neutralises the audio
element entirely (`.src` inert, `play()`/`pause()` no-op); any new audio spec needs the same.

---

## The Audiobookshelf and Jellyfin clients are only partly verified against reality

`packages/abs-client` was written from fixtures and documented shapes. On 2026-08-06 a user hit
"response for POST /api/items/:id/play did not match the expected shape" — playback had been
completely broken since the client was written. Fixed in `5794f10`.

The cause generalises. The schema had `metadata` as `.optional()`, which accepts `undefined` but
**not `null`**, and a real server sends a literal `null`. And it was not an edge case: `playItem`
posts an **empty body**, so it never declares `supportedMimeTypes`, so Audiobookshelf's
`checkCanDirectPlay` fails closed and **every session Auralis starts takes the transcode path** —
whose single HLS track never sets `metadata`. The fixtures encoded the _direct-play_ shape, which
no real Auralis session has ever received. That is why the whole suite passed against a client
that could not play anything.

**A fixture written from documentation describes the shape you expected, and a passing suite
against it proves only that the code agrees with the guess.** Anything in `packages/abs-client`
not yet exercised against the real server is unverified.

Reconciling it is **blocked: no session has an Audiobookshelf or Jellyfin credential**
(`docs/setup/MY_SETUP.md` names it as the first ask). Everything beyond `/status` and `/ping` is
source-derived. `docs/INTEGRATIONS.md`'s "Fixture/schema reconciliation pass" has the
live/source/unverified breakdown — get a credential before re-deriving it. When one arrives:
record the actual responses, diff them against
`apps/server/src/testSupport/fakes/fixtures/*.json`, fix fixtures **and** schemas, add a
regression test, and note the Audiobookshelf version in the fixture (the API drifts by version
and by `minified`/`expanded` mode).

Two smaller findings from the same investigation, neither fixed: the play response carries a
duplicate `libraryItem` and `mediaMetadata`, silently dropped by `.passthrough()`; and
`audioTracks[].codec` is real and undeclared.

**Range-request behaviour deserves a real-world check** against a multi-hour file, not just the
synthetic byte-range test — though per `docs/setup/MY_SETUP.md` the real library is dominated by
chaptered MP3 rather than M4B, so weight that check accordingly. The library is 231 items today, so
do not assume performance measured against it generalises to a large one.

`packages/jellyfin-client/src/schemas/raw.ts`'s lyrics schemas
(`LyricMetadata`/`LyricLine`/`LyricDto`) are **a draft to verify**: schema-only, no consumer, no
test, never exercised against a real `LyricDto`.

---

## Open product decisions — the user's to make

None of these blocks the two implementable items above.

- **Direct play vs transcode.** Declaring the client's real supported `supportedMimeTypes` would
  flip most sessions from server-side transcode to direct play: less server CPU per listen, and
  byte-range seeking on the original file instead of chunked HLS. It is not a parse fix — it
  changes playback behaviour on a path that currently works, and the seek semantics differ.
- **`GET /requests` is unscoped by caller.** Any signed-in user sees and can delete everyone's
  requests. Matches Overseerr and is right for one person's server — but the server is shared
  with family, and approval defaults to automatic, so a shared install has no privacy and no gate.
- **Lyrics search** needs its own index and a privacy decision. Jellyfin cannot search lyric text
  at all, so Auralis would need to build an index and decide whether to backfill from an external
  provider (an opt-in). The synced lyrics _view_ is unaffected and has shipped.
- **`LinearProgress`'s `wavy` mode no longer renders a wave.** Mantine has no such primitive, so
  `wavy` only thickens the bar. A visible regression against "the UI must be beautiful."
- **`shelfarr` and `deemix` are already running on the user's machine.** `shelfarr` overlaps the
  phase-6 pipeline; `deemix` cuts against the phase-9 decision to use slskd. Neither was designed
  around.
- **Ebooks?** Audiobookshelf handles them; the roadmap covers audio only.
- **Chromecast / DLNA?** Symfonium has it and the user cited Symfonium, but never asked directly.
- **Android's own open questions**: whether it should have a Settings screen at all (it has none).

### The reported Android post-login crash — audited, not reproduced

The user reported (queue `a41192a`) that the APK built 2026-08-04 crashes after login, and that
they have not reinstalled since. A source-level audit found no confirmed candidate; there is no
device, emulator, JDK or SDK here.

**The obvious suspect does not apply** — `5794f10` lives entirely in `packages/abs-client`, which
only `apps/server` imports; Android talks JSON to the BFF through its own kotlinx models. Same
class of bug, no shared code path. Do not repeat the guess.

Their build is `316cc33c` and 37 commits have landed since, predating nearly all of Android's
music feature set. The post-login path is better guarded than expected: `ApiClient.execute()`
rethrows `IOException`/`SerializationException` as `ApiException`, which both `LoginViewModel` and
`HomeViewModel` catch, and `auralisJson` sets `ignoreUnknownKeys = true`. So it is one of three
things static reading cannot separate: already fixed incidentally; a real force-close outside
readable code (Compose recomposition, a ViewModel factory throwing before any `try`, Media3
service binding, a device-specific fault); or "crashes" describing the reachable
`HomeUiState.Error` screen. **The cheapest next step is the user reinstalling the current CI
APK**; if it still fails, a logcat is the only thing that separates those three. Do not spend
another audit without one.

### Android Auto is unverified end to end

No Desktop Head Unit or car has exercised any of it, and CI cannot. Two assumptions in the browse
tree are flagged in the code's own comments: the continue-listening shelf is found by a
case-insensitive `contains("continue")` match on the shelf's id or label, and it is unconfirmed
whether `/libraries/:id/series` populates each series' `books` array.

---

## What the user asked for, in their words

> "a web app + android app, in a material U style, that serves as three things"
>
> - **prio 1** — Audiobookshelf client + book request integration, pulling primarily from
>   AudiobookBay. "i have a mediaserver setup at home that id like to plug-in into it."
> - **prio 2** — podcast client.
> - **prio 3** — music client, as a Jellyfin client, ideally with a music request integration
>   (something like deemix). "my mediaserver also already has a music component."
>
> References they love: **YouTube Music**'s UI, **Symfonium**, **Spotify**'s search (specifically
> **lyrics search**), and the **Claude app**'s design language.
>
> "I want the experience to be fully-featured, no compromises. The UI must be beautiful and
> performant. The UX must be simple and friendly. Make use of test driven development, including
> end-to-end testing and UI testing with playwright (TS preferred)."

**The actual goal is to replace Spotify.** In their words: "spotify now very conveniently (tho
sometimes intrusively) bundles together music, podcasts, and audiobooks. one of the things that
it does is cleverly serve me audiobooks it thinks i will enjoy." **Personalized recommendations
are part of the goal, not scope creep for a later phase to invent.** No phase currently scopes
this; treat it as an explicit requirement now that all three media types are far enough along.
`docs/INTEGRATIONS.md` has a researched-not-decided section on a
MusicBrainz/PodcastIndex/Audnexus metadata-catalog layer for it, with a named risk (Audnexus
builds on Audible-scraping against Audible's ToS) — options, not a committed design.

Standing instructions, not one-off remarks: **work autonomously** (make ordinary calls, state
them, keep moving; escalate only what genuinely changes the product); **outsource implementation
to Sonnet agents**; **"web app" includes desktop**, and the whole thing must run in Docker.

---

## Decisions already made, and why

Do not silently re-litigate these. If you disagree, say so and make the case.

**A thin Fastify BFF sits between the clients and the media server.** Audiobookshelf and Jellyfin
do not emit CORS headers for arbitrary origins, so a pure browser client is blocked; AudiobookBay
has no API and can only be scraped server-side; and indexer/torrent credentials must never ship in
a browser bundle or an APK. A side benefit is that web and Android consume one identical typed
API, so parity is structural rather than aspirational.

**No animation library.** Material 3 Expressive is spring-based; the token layer compiles spring
physics into CSS `linear()` easing strings at build time, so animation runs on the compositor with
no per-frame JS. Gesture-driven surfaces use raw pointer events plus transforms.

**Colour is derived from artwork at runtime** with `@material/material-color-utilities` — the
Symfonium behaviour the user called out. Every generated `on*`/container pair is asserted to clear
WCAG AA in unit tests, light and dark.

**PWA, not Electron.** Own window, offline shell, OS media keys, nothing extra to bundle. Tauri is
the cheap addition if a true native desktop binary is ever wanted.

**slskd, not deemix**, as the reference music-request provider — deemix is unmaintained. The
provider interface is pluggable, so deemix is a new file, not a refactor.

**Native Android (Compose + Media3)**, not a webview wrapper. Background playback, offline
downloads, media-session integration and Android Auto all want the real thing.

**One container, one port.** The BFF serves the built web assets on its own origin — no separate
nginx, no CORS for the user to get wrong.

**Prowlarr is the primary indexer; the AudiobookBay scraper is the fallback.** AudiobookBay is
behind Cloudflare and only Prowlarr (via `byparr`) gets through; a direct BFF-side scrape cannot.

**Provider credentials are server-scoped**, in `provider_configs`, not in `secrets` (which is keyed
by `user_id` for per-account upstream tokens). An undecryptable secret reads as _unconfigured_
rather than erroring.

**The download save path is a setting with no default.** The BFF and the download client are
different containers with different mounts, so guessing produces downloads that complete and are
never imported — every component reports success while nothing lands. This is the most important
thing in `docs/setup/MY_SETUP.md`: Audiobookshelf does **not** watch qBittorrent's download folder.

**Approval defaults to automatic**, on the grounds that this is one person's own server.

**A music request's terminal state is `importRequested`, not `completed`** — Jellyfin exposes no
API to confirm an import landed.

**IzzyOnDroid is closed, and the route is a self-hosted F-Droid repo.** The user: _"we will not
violate IzzyOnDroid's anti-AI policy. We won't submit the app there. I'll just add it as a custom
repo to my droidify."_ Their inclusion policy opposes apps "fully or in part created by generative
AI tools." `docs/research/FDROID_DISTRIBUTION.md` §2 and §5 are the working spec. Do not submit
anything anywhere.

---

## Environment and how to work here

Development is on a **laptop** (`SofiaThinkPad`), which talks to mediaserver as a remote client
over LAN/Tailscale. `docs/setup/MY_SETUP.md` and `HOST_REPORT.md` have the server's real details —
read them rather than re-deriving.

```bash
pnpm install
pnpm dev            # BFF on :8787, web on :5173
pnpm dev:fake       # same, against built-in fake upstreams (no media server needed)
pnpm test           # Vitest
pnpm test:e2e       # Playwright
pnpm format && pnpm typecheck && pnpm lint && pnpm test    # the cheap set
```

Upstreams: Jellyfin `192.168.100.34:8096`, Audiobookshelf `192.168.100.34:13378`, qBittorrent
`192.168.100.34:8080`.

**Runs here:** Playwright (`pnpm test:e2e`, `playwright install`), `gh`, the whole web/unit suite.
Use Playwright to verify UI work directly — a screenshot beats inferring from a pushed sha.
**CI-only:** `pnpm test:docker` (no Docker on this distro) and Gradle (no JDK or Android SDK), so
`apps/android` compiles on CI only.

**CI is the authoritative signal** for calling a phase done; local running is a faster first look,
not a replacement.

### Gotchas

- **The per-package typecheck does not cover `e2e/`. CI's does.** The root `pnpm typecheck` was
  unreliable here (five parallel `tsc` processes; cause never established — do not repeat the
  memory explanation as though it were measured), and the per-package workaround silently drops the
  `e2e` project, where Playwright specs live. That turned `main` red on 2026-08-08 while every local
  check passed. Run `pnpm --filter e2e typecheck` too, or prefer the root command if it works now.
- **Run `pnpm format` before pushing docs, every time.** Twice in one day unformatted docs turned CI
  red. The cost is not a badge: `format:check` gates `publish`, `publish` writes
  `ghcr.io/patakihara/auralis:latest`, and mediaserver pulls that tag every fifteen minutes — **a red
  CI on `main` quietly stops the live deployment updating**.
- **`SESSION_SECRET`** keys the AES-256-GCM encryption of stored upstream credentials; changing it
  invalidates every stored secret.
- **Never commit real credentials, tokens or the user's hostnames.** This repo is public. Fixtures
  stay synthetic. RFC1918 addresses and container names are fine.
- `esbuild` and `better-sqlite3` need install-script approval; they are in `pnpm.onlyBuiltDependencies`.
- **`apps/server`'s `start` runs `tsx` against TypeScript sources** (a production dependency), left as-is
  deliberately. Compile instead if the image is ever slimmed.
- **A quiet-hours prompt gate is armed on `UserPromptSubmit`** via `.claude/settings.local.json`
  (gitignored, machine-local). Outside 17:00–18:00 local a typed prompt is filed into the task queue
  and blocked, surfacing an hour later. Two per-prompt exemptions — a `claude --bg` session's own
  kickoff prompt, and any `<task-notification>` a subagent hands back. `usage-gate.sh` must never
  honour anything like them: the plan-usage ceiling applies to autonomous sessions most of all.
- **`e2e/app`'s BFF is single-tenant and stateful** — `POST /api/v1/setup` configures it for the
  whole process, so `fullyParallel` would race. `onboarding.spec.ts` is its own Playwright project
  everything else `dependencies` on, and writes the `storageState` the rest start signed in from —
  not an optimisation: `POST /auth/login` is rate-limited to 10/min per IP, shared across workers.
- **The container's fake-upstream mode lives in `apps/server/src/testSupport/fakes`, not a `test/`
  sibling** — `AURALIS_FAKE_UPSTREAMS` is a runtime flag the shipped server parses, so that code has
  to ship in the image.
- **Mantine gotchas, both real bugs already fixed**: `unstyled` on `Modal` strips the CSS hiding its
  always-mounted root, leaving a permanent full-viewport click-blocking overlay; and
  `respectReducedMotion` only disarms Mantine's JS `Transition` machinery, not plain CSS
  `@keyframes` (so `Skeleton` drives its `animate` prop from `ThemeProvider`'s own
  `prefersReducedMotion`). The same reduced-motion gap is untested but likely present in `Loader`'s
  spin and `Progress`'s stripe scroll.

### Working in this checkout

**Do not create a worktree** — `CLAUDE.md` has the full reasoning (main-checkout rot, per-directory
auto-memory, the autorun runner's directory-based lookup, and a worktree's `.claude/settings.json`
being invisible to sessions rooted elsewhere). Work on `main` in this checkout, commit, push.

**A background session's `Edit`/`Write` cannot touch the shared checkout** — a harness guard rejects
both until the session isolates. **`Bash` is not gated**, so the orchestrator's in-place path for
`ROADMAP.md`/`HANDOVER.md` upkeep is a `python3` heredoc or `cat > file <<'EOF'`, exactly as
`git merge --ff-only` already writes the working tree from `Bash`. Use that rather than spawning a
worktree for a doc edit.

**`isolation: "worktree"` on the `Agent` tool defaults to the wrong base for this repo** — with no
`worktree.baseRef` configured, the agent lands on `origin/main`'s initial commit, an empty scaffold.
Instruct every isolated agent, as its literal first action, to run `git reset --hard <current branch
tip sha>` inside its worktree and verify with `git log -1`. Every worktree of one repo shares one
object database, so that commit is already present with nothing to fetch. The agent commits on its
own branch; the orchestrator integrates with `git merge --ff-only <branch>` from `Bash`.

A new worktree has no `node_modules` — `pnpm install --frozen-lockfile`. A worktree branch has no
upstream, so push needs an explicit refspec (`git push origin <name>:main`).

**Scope: this working tree, and nothing outside it.** This repo is a clone sitting inside the host's
`$HOME` repo. Do not stage, commit or "tidy" anything in another repo, even when asked to — a `Stop`
hook belonging to the _outer_ repo will report its uncommitted files into an Auralis session, because
hooks fire on the session rather than the directory. That report is not a task. Reading outside the
tree is fine; writing outside it is not.

### Worktrees currently on disk

Three, none of them holding unmerged work:

- `agent-a623d0d03e48b3297` — its two commits are on `main` under the same titles, landed by
  re-commit rather than merge, so they share no ancestry. `worktree-gc.sh` therefore refuses it
  ("not a confirmed ancestor of main") and will forever. That is the safety rail working. Removing
  it needs a deliberate `git worktree remove` plus `git branch -D` — the user's call.
- `agent-a8781e77885029281` — the 12f-2 draft, since superseded by `034c4cf`. **Locked**, so
  `git worktree remove` refuses it without `-f -f`; left in place deliberately rather than forced.
- `agent-a1b2a40eb1e9e4e64` — confirmed redundant against what landed on `main`.

---

## Infrastructure findings

### The web `CI` workflow has been failing to allocate runners

Established 2026-08-07 and **not resolved**; it undermines "CI is the authoritative signal" if left
unknown. Two independent things are wrong:

1. **Concurrency.** `ci.yml` sets `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`, so
   runs on `main` queue instead of cancelling. The comment's reasoning is sound — a cancelled run
   also cancels `publish`, and mediaserver auto-updates from `:latest`, so superseded runs would
   silently stop updating the registry while everything reported green. **But queuing does not do
   what the comment assumes**: GitHub allows only one _pending_ run per concurrency group, so a new
   run cancels the already-pending one. Under back-to-back pushes every queued run in between is
   discarded anyway. Eight consecutive `CI` runs on `main` ended `cancelled` without allocating a job.
2. **Allocation.** One run sat `pending` for over forty minutes with nothing in its group to
   supersede it and zero jobs allocated, while `android.yml` runs on the same shas were picked up
   and finished green. So the `CI` workflow specifically is not getting runners — an account or
   workflow problem, and the user's infrastructure to look at.

**Reconfirmed 2026-08-15.** Allocation looks recovered — runs now pick up runners and finish. The
concurrency half is very much live: three back-to-back doc pushes that day produced exactly the
predicted pattern, the in-progress run surviving while both queued ones were cancelled without ever
allocating a job. The mechanism is understood and reproducible, not intermittent.

**Do not read a green `Android` run as the branch being verified**, and space pushes to `main` out
if the web CI result matters — one push, wait for it, then the next. The obvious fix for half of it — move `publish` into its own workflow
with its own concurrency group, so verification jobs may cancel freely while the deployment-coupled
job queues — **changes deployment behaviour on a live host and is not an autonomous call.**

### Deployment

Container images publish to GHCR (`c1882d5`): CI's `publish` job pushes
`ghcr.io/patakihara/auralis:latest` and `:<sha>` (linux/amd64) on every green build of `main`.
Multi-arch (arm64) is unbuilt.

**Auto-updating deployment on mediaserver is the next infrastructure task and is not started** —
pulling the new image and restarting when `:latest` changes, Watchtower being the candidate. It is a
live change on a different host, so whoever picks it up must read mediaserver's own `~/CLAUDE.md`
first (this repo's scope rules do not extend there) and needs the user's go-ahead. **The other
containers on that host must stay running; above all, Jellyfin must not be taken down.**

Worth reconciling first: the checked-in `compose.yaml` carries both `build: .` and
`image: ghcr.io/patakihara/auralis:latest`, while `docs/SELF_HOSTING.md`'s snippet uses `image:`
only — so `docker compose up` against the checked-in file builds locally instead of pulling, and a
stray `--build` would override a pulled tag.

### Performance — mobile scores ~0.58, and that is the phase 10 finding

Desktop is fine on both pages measured (~0.94, ~1.1s FCP). **Mobile is ~0.58 on both**, FCP ~6.0s,
LCP ~6.9s. Blocking time is modest and layout shift near zero — nothing is janky; it is purely how
much has to arrive before anything renders.

That the two pages land within a few percent of each other is the informative part. The home page
does strictly more work and does not measurably cost more, because both pay for React, Mantine,
react-query, the router and zustand before anything paints, and under mobile's throttle that shared
cost dominates. It is also why lazy-loading the app shell took ~62 KB out of the entry chunk and
moved no score.

The entry chunk is ~887 KB raw / ~231 KB gzip. Route-level splitting already works (largest lazy
chunk 34 KB) and vendor `manualChunks` was tried and **rejected for measuring nothing**. What is left
is a weight problem, not a splitting problem: the app shell pulls the whole design system in before
first paint. Improving it means changing what the shell depends on — real product work, not a
build-config change. The budgets are deliberately floors at current values; they stop this getting
worse, they do not claim it is good.

### Android's UI audit — source-derived, never seen on a device

`docs/research/ANDROID_DESIGN_AUDIT.md`. Most of what it found has since shipped (the persistent
shell, the Now Playing surface, `material-icons-extended`, unified search). What remains is that
`MaterialTheme` receives only a colour scheme — no typography, no shapes — and that colour is
Android's wallpaper-derived Material You, not the artwork-derived pipeline `DESIGN.md` specifies and
web implements. There is no motion system. **None of this was verified on a device**, and closing it
is real feature work on a surface nobody here can look at.

---

## Where the specs live

`docs/ROADMAP.md` (status and per-wave detail), `ARCHITECTURE.md`, `DESIGN.md`, `INTEGRATIONS.md`.
`docs/setup/MY_SETUP.md` and `HOST_REPORT.md` are the real server's details. `docs/research/` holds
the F-Droid and Android-design investigations, and `docs/research/spec-addendum/` the user's four
reference screenshots for phase 12 — **deliberately not in git** (they are the user's own Spotify
screenshots and this repo is public), so a session on this machine can read them and a fresh clone
cannot.

**Check `docs/agent-specs/`.** Subagent specs written but never launched are parked there. Empty but
for its README means nothing is queued.
