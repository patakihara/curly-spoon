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
per-content-type queues) is **shipped on web and Android except 12c-2**. **Phase 13
(personalized recommendations) is done** — all six waves, CI-verified, on both clients.

**Phases 1–13 are finished to the limit of what this machine can do**, and **phase 14** was
opened on 2026-08-16 by a session that found that to be true — it is infrastructure (measurement
and test capability), not product, and `ROADMAP.md` §14 says why. 14a is done; 14b has its harness
and one open wave (14b-2). Nothing is half-built and no wave is in flight. What remains is the table below: each item
needs a decision, a device, a credential, or a live change on another host. A session picking
this up should read that table first and expect to find nothing it can start alone — that is
the honest state, not a gap in the notes.

`docs/ROADMAP.md` §12 has each wave, its sha and its open findings. Everything is on
**`main`**; do not push elsewhere without asking.

### What remains, and what each item is blocked on

Verified 2026-08-15 against `ROADMAP.md`, not inherited from a previous session's summary.

| Item                                                                                      | Blocked on                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **12c-2** — requestable content on artist/author pages                                    | Queue `440b217`: should a title already in the library still be offered as requestable? The same question arises in Search — deciding it twice, differently, is the failure mode.      |
| **Phase 11**'s remaining steps                                                            | Two keys the user must generate, plus enabling Pages and pushing a tag. Everything automatable is built — see "Android distribution" below. `docs/FDROID_REPO.md` has the eight steps. |
| **Launcher icon**                                                                         | There is none; the app ships Android's default. Adding a file is mechanical, deciding what the icon _is_ is not.                                                                       |
| **12b** "sorted by relevance"                                                             | Music results are alphabetical (`jellyfin-client` pins `sortBy: 'SortName'`). Testing a fix wants a real Jellyfin server; no session has a credential.                                 |
| **12d (Android)** visual conformance                                                      | A device or emulator. None exists here, and that wave's whole requirement is visual.                                                                                                   |
| **12a**'s cold-cache nav rail                                                             | A design decision: what the rail shows before it knows which libraries exist. Deferred twice already.                                                                                  |
| **Auto-updating deployment**                                                              | A live change on mediaserver, needing that host's own rules and the user's go-ahead. See "Deployment" below.                                                                           |
| Direct play vs transcode; lyrics search; `GET /requests` scoping; `LinearProgress` `wavy` | Product decisions, written up under "Open product decisions" below.                                                                                                                    |

**Both items that were implementable on 2026-08-15 are done** (`50e74e0`, `3cda65c`), and
each turned out to be a coverage problem rather than the live bug the roadmap prose implied.
See "The minified-item bug" below for what that pass established — it corrects the standing
recommendation, so read it before picking up a branded-type refactor.

**No item in phases 1–12 is implementable without the user.** Verified again 2026-08-15:
every remaining one is in the table above and needs a decision, a device, a credential, or a
live change on another host.

**The roadmap was missing a phase, and it no longer is.** `HANDOVER` had long carried
"personalized recommendations are part of the goal, not scope creep for a later phase to
invent" as an explicit user requirement with nothing scoping it. `ROADMAP.md` §13 scoped it
(`2ae7ad6`) and **it is now delivered** — six waves, on signal that already existed and
needed no credential. Books recommend from Audiobookshelf progress, music from Jellyfin play
history, and genre affinity crosses between them, which is the user's own sentence about one
medium informing another. See "Phase 13" below for what that does and does not prove.

**`ROADMAP.md`'s top-of-file status table is fine now** — it reads `done*` for 11 and 12,
matching §12. The older note in this file saying it still called phase 12 "todo" was itself
stale and has been removed rather than repeated.

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

- `2026-08-15T15:44:26Z` · `a6168e2a5df25b40c` · general-purpose · ended · I'll wait for the monitor's notification rather than poll further.
- `2026-08-15T15:49:41Z` · `a6168e2a5df25b40c` · general-purpose · ended · Clean working tree — nothing to commit. I'm stopping here per the plan-usage hand-off band (85% session usage). Reporting findings now rather than co…
- `2026-08-15T19:13:48Z` · `ad3375be8178ba426` · general-purpose · ended · Confirmed: 'forUser()' is fully synchronous — 'getSettings'/'getJellyfinToken' are local DB reads, throws before constructing a client, no network I/…
- `2026-08-15T19:19:30Z` · `ab1df5b15f14315d4` · general-purpose · ended · I'll stop checking and wait for the notification.
- `2026-08-15T19:43:25Z` · `a3e749172e175a6e5` · general-purpose · ended · I'll wait for the notification from the background Playwright run rather than poll.
- `2026-08-15T19:44:06Z` · `a37ea47ff04d29baa` · general-purpose · ended · Committed. Not pushed, not merged, no 'Agent' calls made. ## Report **Branch/commit:** 'worktree-agent-a37ea47ff04d29baa' at '60b368f', based on '966…
- `2026-08-15T19:54:17Z` · `a24c2902cadc0c877` · general-purpose · ended · ## Review: Wave 13f-2 ('60b368f') **Verdict: merge as-is.** No compile-blocking defect found, no test-logic defect found, and the writer reaches a re…
- `2026-08-15T19:55:31Z` · `a0838ed6164b30f53` · general-purpose · ended · ## Review: wave 13f-1 web music recommendations ('e4bd22e', 'bc0695b') ### Blocking **1. 'e2e/app/music-recommended.spec.ts' is missing 'test.describ…
- `2026-08-15T21:14:42Z` · `a7e86b0ad34a5d1a5` · general-purpose · ended · Clean commit, exactly one file changed. Working tree is clean, no long-running command backgrounded. ## Report **Branch/commit:** 'worktree-agent-a7e…
- `2026-08-15T21:16:52Z` · `a51dab7f5fb349b6f` · general-purpose · ended · Committed. Exactly three files changed, no doc file touched (per the "no dedicated place" finding). ## Report **Branch/commit:** 'worktree-agent-a51d…
- `2026-08-15T21:20:43Z` · `a8bd5abd083ff3ed8` · general-purpose · ended · I'll wait for the run_in_background task's completion notification rather than poll.
- `2026-08-15T22:01:31Z` · `ab5d9dfca22e6dee6` · general-purpose · running · —
- `2026-08-16T06:37:26Z` · `a1e9c7904b31b3620` · general-purpose · running · —
- `2026-08-16T06:38:33Z` · `a7bfb028ca2b25a26` · general-purpose · running · —
- `2026-08-16T06:40:47Z` · `ada9aa18e890f1985` · general-purpose · running · —

<!-- AGENT_LOG_END -->

---

## Phase 14 — verification and weight (opened 2026-08-16, self-directed)

`ROADMAP.md` §14 is the spec and says why the phase exists. Short version: phases 1–13 are done
to the limit of this machine, every remaining roadmap item needs a decision/device/credential/
another host, and the two things a session here _can_ move are not features — they are the gap
between what this project can build and what it can prove.

### 14a — the web entry chunk: **done, and it worked better than expected**

- **14a-1** (`43861d6`) — `docs/perf/ENTRY_CHUNK_ATTRIBUTION.md`: the entry chunk byte-attributed
  by decoding its sourcemap's VLQ mappings, 99.5% of 666,616 bytes accounted for. Read that file
  before proposing any further weight work; it is the map.
- **14a-2** (`8708a7b`, `a5a3843`) — **one line**: `packages/ui/package.json` had no `sideEffects`
  field, so a bundler must assume every module in it is impure and cannot shake unused re-exports
  out of the barrel. `"sideEffects": ["**/*.css"]` marks the JS pure and keeps the CSS honest.

  **Entry raw 914.2 KB → 782.5 KB (−131.7 KB, −14.4%); entry gzip 237.0 KB → 198.9 KB
  (−38.1 KB, −16.1%).** Verified independently by the orchestrator, not taken from the report.
  `@floating-ui/react` — 21.8 KB that nothing in the app imports, riding in purely because
  `Menu.tsx` is a member of the barrel — left the entry chunk entirely. Total bundle is ~unchanged
  (bytes moved into `Shell`, whose lazy chunk grew 37.8 → 52.7 KB, still under its 72 KB budget).

  **It bought no Lighthouse score, and that is the durable finding.** A same-machine, same-commit
  A/B (five runs each, the one line the only difference) put `signedOut` mobile at 0.58 without and
  0.55 with, `home` mobile at 0.58 without and 0.56 with — every difference inside the documented
  0.55–0.62 band. **Third independent confirmation that entry-chunk weight is not the lever**,
  after lazy-loading `Shell` and after `manualChunks`. `react-dom` + `@mantine/core` are 335 KB of
  the 666 KB and neither defers without restructuring `main.tsx`'s boot. **Do not spend another
  wave shrinking the entry chunk.** Kept anyway — 131.7 KB off every first paint for one line is
  worth having even when the score does not notice.

  **The CSS-loss risk was real and was checked, because the e2e suite cannot see it.** Marking JS
  pure lets Rollup drop a component module _and its `import './Foo.css'` with it_ — and Playwright
  asserts on testids and text, never computed styles, so a component rendering unstyled passes
  188/188. Total CSS across `dist/assets/*.css` went 269,523 → 268,482 B; the entire 1,041 B delta
  is `TopAppBar`, which `apps/web` does not reference at all (only `packages/ui`'s own gallery
  does). `Sheet`/`Snackbar`/`Menu` were checked specifically and their CSS is present in their own
  lazy chunks. **If a future wave touches bundling in `packages/ui`, repeat that check — a green
  Playwright run is not evidence here.**

  Found in passing, not acted on: `Chip.tsx`, `CircularProgress.tsx`, `LinearProgress.tsx` and
  `Skeleton.tsx` each has a colocated `.css` file the component never imports. Already absent from
  the bundle before this wave. Dead files, safe to delete, nobody's wave yet.

### Home's CLS regressed since phase 10, and nobody noticed because it still passes

Found while A/B-ing 14a-2, and **not caused by it** — measured 0.067 desktop / 0.053 mobile both
with and without that change, against `lighthouse-budget.config.mjs`'s documented 2026-08-06
baseline of **0.001 desktop / 0.008 mobile**. The budget is 0.1, so nothing fails; that is why it
sat unseen. `signedOut` is 0.000 on both form factors, so this is **content, not bundling** — the
likeliest source is the shelves phases 12 and 13 added to the home feed, loading cover art in after
first paint. `home` mobile LCP has drifted the same way (~7150 ms against a 6851 ms documented
median).

**This is startable here** and wants no credential: bisect by measuring an older commit, then fix
the shift at its source (reserved space for shelf rows, or intrinsic dimensions on cover images).
It is the most product-visible thing left on this machine — "the UI must be beautiful" is the
user's own sentence.

### 14b — Android had no way to verify UI at all, and now has a narrow one

**The finding is the valuable part.** `apps/android` contained **no Compose UI test harness** —
no `createComposeRule`, no Robolectric — and `android.yml` runs `./gradlew test assembleDebug`,
JVM unit tests only. So every Compose change on Android was verifiable by exactly "it compiles"
plus "a reviewer read it": the standard that passed on all four writer-with-no-reader failures.
The carousel-a11y follow-up was recorded as blocked on _a device_; it was really blocked on this.

- **14b-1** (`92fbe30`, then `ab3fd7b` and `604f290`) — Robolectric 4.14.1, `ui-test-junit4`,
  `ui-test-manifest`, `androidx.test.ext:junit`, `androidx.test:core-ktx`, plus
  `testOptions { unitTests.isIncludeAndroidResources = true }` (load-bearing — Robolectric
  inflates nothing without it). One test file, no product file touched. Its second test asserts
  the exact `semantics(mergeDescendants = true)` grouping 14b-2 needs, so the harness is proved
  for its purpose on the way in rather than assumed.

**Two red CI rounds, both toolchain facts, both worth not relearning:**

1. `import androidx.compose.ui.test.assertExists` does not resolve — `assertExists` is a **member
   of `SemanticsNodeInteraction`**, while `onNodeWithText`/`onNodeWithContentDescription` on the
   lines either side of it genuinely are top-level and genuinely do need importing. It is the odd
   one out in a block of near-identical lines, which is why it reads as correct.
2. **`ui-test-manifest` must be `debugImplementation`, never `testImplementation`.** Its whole
   contribution is an `AndroidManifest` declaring the `ComponentActivity` that `createComposeRule()`
   hosts the composable in, and unit tests read the **debug variant's merged manifest**. On
   `testImplementation` the jar is on the classpath but its manifest never reaches the merger — so
   it compiles, resolves, and both tests die at `RoboMonitoringInstrumentation:102` with a bare
   `RuntimeException` naming neither an activity nor a manifest. The spec that produced this
   **named the missing-activity failure mode explicitly** and still got the configuration wrong.

**Be precise about what the harness buys.** The claim is "**Compose semantics are now assertable
in CI**" — not "Android UI is now verifiable." Robolectric renders on the JVM against a shadowed
framework: it will confirm a node exists with the contentDescription you meant; it will not tell
you what TalkBack announces, how the row looks, or what is reachable by touch. It closes the gap
between "a reviewer read it" and "a machine checked it". It does not close the gap to a device.

**14b-1 took four red CI rounds and the fourth exonerates it.** In order: (1) `assertExists` is a
member of `SemanticsNodeInteraction`, not a top-level import; (2) `ui-test-manifest` must be
`debugImplementation` — see above; (3) `gradlew test` runs `testReleaseUnitTest` too, so the file
belongs in the **`src/testDebug` source set**; (4) `AppStartViewModelTest` failed with
`UncaughtExceptionsBeforeTest` and **a plain re-run of the identical commit went green**. That
fourth one is the latent race 13d already documented, and it is now **firing intermittently on
CI** where it was not before — Robolectric added suite wall-time, which is precisely the mechanism
13d's write-up names. Real loose end; not the harness's fault; nobody's wave yet.

- **14b-2 — not started, deliberately.** Grouping each For You card's title and reason line into
  one accessibility node on `ForYouCarouselRow` (shared by the book, podcast and music shelves).
  It should wait until the harness has more than one green CI run behind it: a cross-cutting
  change to a surface nobody here can look at, verified by a harness one run old, is two unproven
  things stacked.

---

## Phase 13 — personalized recommendations: **done**, all six waves landed

`ROADMAP.md` §13 is the spec. On `main`: **13a** `8d071b8` (pure scoring core), **13b**
`0be4fc6` (`GET /libraries/:id/recommended` + `toCandidate`), **13c** `8bbad08` (web),
**13d** `8335184` (Android), **13e** restored 2026-08-15 as `640c751` (13e-1) and `9b086df`
(13e-2), **13f** `2e3f97b` (both clients read `GET /music/recommended`) with its Android
compile fix in `5b92e1d`. All CI-verified.

**The one asymmetry to keep in mind:** web's half of 13f is verified by a real browser asserting
on rendered testids; Android's is verified by unit tests plus a reviewer tracing the render path
by eye. There is no device or emulator here. That is the same standard the four historical
writer-with-no-reader failures all passed, so treat "the shelves render on Android" as a
well-argued claim rather than an observation.

**What works today.** The BFF computes book recommendations from Audiobookshelf's per-user
`mediaProgress[]` — signal that already existed and nothing read — and, since 13e, folds the
Jellyfin side's genre affinity into the same profile so taste in music informs the book feed.
Ranking is one pure, I/O-free core (`apps/server/src/features/recommendations/`) that the
route calls; it is deliberately not reimplemented per client. Shelves are served `Shelf`-shaped
plus a `reason`, appended after the existing For You feed, so cold start is a visual no-op and
a signal-less user sees exactly today's behaviour. Web and Android both render it.

### The 13e revert was unfounded, and both halves are restored

This is the correction that matters, established by evidence rather than by re-reading the
prose. Earlier sessions reverted both 13e commits on the strength of two e2e failures. **Both
findings were artefacts of a bad repro command, and the suite-wide crash blamed on the wave
does not exist.**

**The baseline that settles it.** A full `--project=app --workers=1` run on `3858f7e` — 13e
fully reverted, the tree the revert produced — gives **186 passed, 1 failed, 1 skipped**. There
is no `ERR_CONNECTION_REFUSED` cascade, the web server does not crash, and
**`for-you.spec.ts:128` passes**. The "e2e server dies mid-run and takes 130+ tests with it"
problem that the previous handover called "the thing to chase, not the two waves" **is not
reproducible and should not be chased.** It was almost certainly the tail of the same bad
invocation: a run that never established its preconditions, whose cascade of failures read as
a crash.

**`music-favorites.spec.ts` fails with 13e-1 already reverted**, which exonerates 13e-1
outright — its schema work was never involved. See "The one real suite defect" below for what
that failure actually is.

**`jellyfin-unconfigured.spec.ts` was never touched by 13e-2 either**, and this was confirmed
by reading code rather than by re-running: 13e-2 changed **no client file at all**, so nothing
new is issued from the `/music` page, and the one new server path reachable from an existing
route (`tryBuildMusicGenreProfile` in `routes/libraries.ts`) calls `app.jellyfin.forUser()`,
which is **fully synchronous** — two local DB reads, throwing before any network call or client
construction — and whose error its `catch` swallows into `null`. An unconfigured Jellyfin
cannot reach that route's response. The revert commit's stated cause ("the client now issues
`/music/recommended`") describes a call that does not exist in the diff.

**Never `-g` into a `describe.serial` block.** That is the lesson that cost two reverts and a
day. `-g` silently drops the setup test, the app then correctly renders "Jellyfin connection
has not been configured yet", and the failure reads exactly like a product regression. Run the
file.

### 13e-2's review, finally done

13e-2 was the only wave in the phase never independently reviewed (the session hit its usage
ceiling). Reviewed 2026-08-15: **no correctness defects.** Traps explicitly checked and
cleared, so no one re-checks them:

- Both new `rawUserItemDataDtoSchema` fields are `.nullable().optional()`, and
  `normalizeLastPlayedAt` folds `Date.parse`'s `NaN` into `null` — the null-vs-undefined class
  of bug that broke playback for weeks does not apply here.
- `albumToCandidate` folds `artistName` into a one-element `authors[]`, blank-guarded, so the
  adapted-shape trap is handled. Nothing in `profile.ts`/`score.ts`/`shelves.ts` branches on
  `media.kind`, so widening to `'album'` is inert by construction.
- The tests assert through to behaviour: route tests hit real HTTP and pin status codes and a
  known-item exclusion; `crossMediaGenre.test.ts` pins actual weighted-sum arithmetic. Deleting
  the logic fails them.
- `mergeGenreAffinity` never increases `target.totalSignal`, so a music-only user still sees an
  empty book feed. Cold start stays a visual no-op.

**One open finding: `GET /music/recommended` has no consumer.** Grep finds no hit in
`apps/web/src` or `apps/android`, and 13e-2 touched neither. This is the project's
most-repeated failure mode — a writer with no reader — though a milder form than the four
historical instances: the route works and is genuinely tested, it is simply inert in
production. `ROADMAP.md` names 13e's reader as the cross-media merge into the **books** route,
which _is_ wired and consumed; the music-facing endpoint is scope the wave invented beyond its
spec. **It must either gain a consumer or be deleted — silence is the one option the project's
own rule forbids.**

### The suite is green — 188/188 — and two real defects were fixed to get there

`pnpm exec playwright test --project=app --workers=1` on `main` now passes **188, with none
failed and none skipped**. The baseline before this work was 186/1/1. Two genuinely distinct
defects were in the way, and neither was what the 13e revert claimed:

1. **Cross-file favourite-state contamination.** `music-favorites.spec.ts:45` expected
   `/music/favorites` to already show `track-driftwave-1` and `-2` favourited, and
   `context-menu.spec.ts` toggled one off and left it off. The file passed 8/8 alone and failed
   in the suite. The `app` project runs every spec against **one** shared single-tenant BFF
   whose fake-Jellyfin favourite state is process-global, and `playwright.config.ts` already
   states the rule that was broken: files are order-independent only if **each makes its own
   preconditions true rather than inheriting them**. Both specs now do. Pre-existing; predates
   13e entirely.

2. **A widened fixture silently invalidated a count assertion — a real 13e-2 regression.**
   13e-2 added a third fake artist, `artist-lumen`, on purpose: `shelves.ts` drops any facet
   with fewer than two matching candidates, so without it the music recommendation path cannot
   be exercised at all. Its comment shows it checked `jellyfin.test.ts`'s exact album counts
   and correctly left them alone. It never checked the **Playwright** side, where
   `music.spec.ts` pinned `'1–2 of 2'` on the artist grid's pagination label. Fixed in
   `f77474d`, which also asserts the third artist by name so a future fourth fails on a named
   missing card rather than on an off-by-one.

**That second one is the generalisable lesson, and it is the same shape as the Android
`MockWebServer` trap already recorded below: widening a shared fixture invalidates every
existing assertion that counted it, and review of the diff cannot catch it** — both halves read
as correct in isolation, and every unit suite stays green (`jellyfin-client` 120/120,
`apps/server` 678/678). Only a full e2e run sees it. **A wave that widens a fixture must run
the full `--project=app` suite before it is called done.**

So the honest summary of the 13e revert: the wave did carry one real e2e regression, and the
revert caught none of it — it diagnosed two failures that were repro artefacts, attributed a
non-existent server crash to the wave, and missed the actual defect entirely.

### `E2E_SERVER_LOG=1` — why nobody could ever diagnose this

Playwright's `webServer.stdout` defaults to `'ignore'`, so when the e2e BFF misbehaves its own
output is discarded and every downstream failure is a bare `ERR_CONNECTION_REFUSED`. `8899880`
makes it switchable: `E2E_SERVER_LOG=1 pnpm test:e2e` pipes the server's stdout into the run.
Off by default so CI logs stay readable. Redirect the run to a file — the server is chatty.

### Decisions from 13a–13d worth not re-deciding

- **`RecommendationCandidate` is an _adapted_ shape, not `LibraryItem`.** A book satisfies it;
  a **podcast does not** (`Podcast` carries a flat `author: string | null`). A type assertion
  pins both halves. Anything handing a podcast in must fold `author` into a one-element
  `authors` array first.
- **The `reason` strings in `shelves.ts`'s `reasonFor` are a first draft.** Never assert exact
  reason text in a client test — web and Android both assert presence/absence/order only, so
  copy can change server-side without breaking a client.
- **Accessibility contract, set by web's browser pass — and Android does _not_ mirror it, despite
  what this file and `ROADMAP.md` both claimed until 2026-08-15.** On web the reason is _not_
  tied to the `h2`; the card list carries `aria-describedby` → the reason paragraph, so title
  and reason announce as name + description. That half is real and shipped.
  **Android has no equivalent.** Verified twice by grep, independently, while reviewing 13f-2:
  `ForYouCarousel.kt`/`ForYouScreen.kt`/`ForYouFeed.kt` contain **no** `semantics` or
  `clearAndSetSemantics` at all, the only `contentDescription`s are `= null` on decorative cover
  art, and `feedItemContentDescription()` builds its name from `title`/`subtitle` only — never
  from `carouselReasonText()`, which renders as a plain sibling `Text` with no grouping to the
  card. So on Android the reason is announced, if at all, as an unrelated loose string.
  This is a **pre-existing gap from 13d**, not something 13f introduced. It was deliberately not
  fixed inside 13f-2: `ForYouCarouselRow` is shared by the book and podcast shelves too, so
  retrofitting semantics onto it is a cross-cutting change that wants its own wave and its own
  verification — on a surface nobody here can actually look at. **It is a real open item, and
  the lesson is that a doc claiming parity is not evidence of parity.**
- **Reason lines wrap to two lines at 375px** when they carry the "— because you finished _X_"
  suffix. Nothing clips (there is deliberately no clamping), but headers get uneven. If that
  should change, the fix is `reasonFor` — once, serving both clients — not a clamp in either.
- **Quality is not assessable here.** Ten synthetic books prove mechanism, not taste. Judging
  whether the ranking is any _good_ wants the real 231-item library, which wants a credential.

## Claimed work — check here before starting a wave

A lightweight lock, because two sessions can share this checkout. Claim a wave here
**before** dispatching it; delete the line when it lands. A claim older than a couple of
hours with nothing on `main` is stale — take it.

**Claimed: the `UnifiedSearchViewModelTest` race** (2026-08-16). `main` is **red on Android** at
`9e87fdc` — `UnifiedSearchViewModelTest > a library fetch failure still returns music results,
degrading only the library side` failed `testReleaseUnitTest` with `UncompletedCoroutinesError`
(607 tests, 1 failed, CI run 31911008835). This is the 13d race the roadmap named as a loose end
with no owner; it is now firing on CI, and while it flakes no Android wave has a trustworthy
signal. Being fixed ahead of 14b-2 and the CLS wave for exactly that reason.

14a-1, 14a-2 and 14b-1 all landed on `main`; see `ROADMAP.md` §14 and "Phase 14" below.

**Phase 13 is done** — 13a–13f, all CI-verified. The `app` Playwright project sits at
**190 passed, 0 failed** at full parallelism, up from the 186/1/1 that greeted this session.
There is no unfinished wave in phases 1–13. What remains across the whole roadmap is the
blocked-on table near the top of this file, plus three follow-ups this session opened and
deliberately did not fold into a wave that was not about them:

1. **Android has no accessibility grouping on the For You carousels** — a pre-existing 13d gap
   that the docs wrongly claimed was closed. Touches `ForYouCarouselRow`, shared by the book,
   podcast and now music shelves. **It is not startable here, and now for a stated reason rather
   than a vague one.** Checked 2026-08-16: `apps/android` has **no Compose UI test harness at
   all** — no `createComposeRule`, no `createAndroidComposeRule`, no Robolectric dependency (the
   single `Robolectric` string in the tree is a comment in `ExampleUnitTest.kt`), and
   `android.yml` runs `./gradlew test assembleDebug`, i.e. JVM unit tests only, never an
   instrumented run. So semantics code written here could be verified by nothing but "it
   compiles" plus a reviewer's reading — which is precisely the standard that passed on all four
   of this project's writer-with-no-reader failures. **The prerequisite wave is a Compose test
   harness** (Robolectric + `androidx.compose.ui:ui-test-junit4` running under `gradlew test`),
   not the semantics change itself. That is a real, startable piece of work for a session with
   more window than this one had — but it adds dependencies to `libs.versions.toml`, so it needs
   a lockfile-safe single-agent wave, and it cannot be smoke-tested locally (no JDK, no SDK),
   meaning several red CI rounds should be budgeted.
2. **Recommendation quality is still unassessable here.** Ten synthetic books and three fake
   albums prove the mechanism, not the taste. Judging whether the ranking is any _good_ wants
   the real 231-item library, which wants a credential.
3. ~~**`tryBuildMusicGenreProfile`'s bare `catch` swallows every error class.**~~ **Done.** It
   now discriminates: `JellyfinNotConfiguredError`/`JellyfinNoCredentialsError` stay silent,
   because a household that never connected Jellyfin hits them on every books-route request and
   logging that is noise, not signal. **Anything else** — a network failure, an upstream shape
   change, a genuine bug in `albumToCandidate` or the scoring core — is logged at `warn` while
   still degrading to `null`. Two tests pin both halves, and the fault-logging one was confirmed
   to fail with the log line removed rather than merely passing alongside it.

**Phase 13 is four waves done of five.** 13a (`8d071b8`), 13b (`0be4fc6`), 13d (`8335184`),
13c (`8bbad08`). **13e is the only one left** — widen `packages/jellyfin-client` to normalize
`PlayCount`/`LastPlayedDate`/`PlaybackPositionTicks` and feed the music side into the profile.
It is the wave that actually delivers the user's sentence about taste in one medium informing
another; everything before it recommends audiobooks from audiobook behaviour.

**A latent Android test race was revealed, not introduced, by 13d** (`d6d8e21`).
`UnifiedSearchViewModelTest` deliberately runs its class-wide `ApiClient` on the **real**
`Dispatchers.IO`, so a request can outlive its own test and throw during a later one —
`ApiClient`'s own doc comment names this failure class. 13d merely added suite wall-time,
widening the window until two tests failed with `UncompletedCoroutinesError` (the
`ClassCastException` in the log is a secondary symptom, not the cause). The fix scopes a test
dispatcher to those two tests only, leaving the two that genuinely pin real interleaving alone.
**The loose end: the await-then-re-read pattern is not unique to those two call sites.** If that
file goes red again, the question is whether the race is more pervasive, not whether the patch
was wrong.

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

### Kotlin block comments **nest** — a `/*` inside a KDoc silently eats the rest of the file

Found the hard way on 13f-2, and it is the same shape as the backtick-dot trap below: a fact
about the toolchain that no amount of reading the logic will surface.

A doc comment mentioning a route glob — the entirely natural `` `/jellyfin/*` route `` — contains
the character pair `/*`. **Kotlin, unlike Java, supports nested block comments**, so that opens a
second comment inside the KDoc. The comment's own closing `*/` then closes only the _inner_ one,
and the outer comment swallows everything to the end of the file. What the compiler reports is
`Syntax error: Unclosed comment` at the **last line of the file** plus a bogus `Missing '}'`
somewhere near the top — neither of which points anywhere near the actual text.

Both an implementing agent and a thorough reviewer read straight past it, because as prose it is
correct and as Kotlin it looks like every other doc comment in the file.

**The check is arithmetic, costs nothing, and does not need a compiler:**

```bash
for f in <changed .kt files>; do
  echo "$f open=$(grep -o '/\*' "$f" | wc -l) close=$(grep -o '\*/' "$f" | wc -l)"
done
```

Unequal counts means an unclosed comment. Run it on every Kotlin file a wave touches — this
machine cannot compile Kotlin, so a cheap textual invariant is worth far more here than it would
be on a codebase where `gradlew compileKotlin` is one command away. Write route globs as
`` `/jellyfin` `` or `/jellyfin/…` instead.

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
(`LyricMetadata`/`LyricLine`/`LyricDto`) are **source-derived but not orphaned** — an earlier note
here called them "schema-only, no consumer, no test", and that was stale. Checked 2026-08-16:
`client.ts` parses the lyrics response with `rawLyricDtoSchema`, `normalizeLyrics` in
`normalize.ts` consumes it, and `normalize.test.ts` covers four shapes including the empty one.
What remains true is only the part no session here can fix: **they have never been exercised
against a real `LyricDto`**, because no session has a Jellyfin credential.

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

### Android distribution — everything automatable is now built

Settled 2026-08-15. The pipeline is complete and inert, waiting only on the user.

**A GitHub Releases tab is not sufficient for Droid-ify**, which is what prompted this work.
Droid-ify adds _repositories_, and a repository must serve a signed index (`index-v2.json` +
`entry.jar`) generated by `fdroid update`. A Releases page has no index and no signature.
`fdroid-repo.yml` already builds and publishes that index to GitHub Pages on a `v*` tag, and
`release.yml` creates the GitHub Release on the same tag. Neither has ever run — there are no
tags. (Obtainium _does_ consume GitHub Releases directly and is the fallback if the repo route
is ever abandoned; nothing in `docs/research/` mentions it.)

**The trap that was not in the documented steps.** The build declared no release signing config
at all, and CI built `assembleDebug`. On an ephemeral runner AGP generates a fresh random
`~/.android/debug.keystore` per run, so **every release would carry a different certificate** —
the first install works, the second fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, and the
user must uninstall and lose all app state. Through Droid-ify that reads as a client bug rather
than a signing problem. `280c1e7` closes it: a `release` signing config reading
`ANDROID_KEYSTORE_FILE`/`_PASSWORD`, `ANDROID_KEY_ALIAS`/`_PASSWORD` from the environment, both
tag workflows building the signed release APK, and a fail-loudly `check-secrets` guard so a tag
without secrets refuses to publish rather than shipping an un-updatable APK.

**The fallback is the load-bearing half and it is verified.** With no secrets — every PR, every
branch push, every local build — the config falls back to debug signing with a logged warning
and never throws. `android.yml` carries no secrets, so every branch run exercises exactly that
path; it went green on `280c1e7`, which is what settles the DSL question no reviewer could.

**There are two independent keys, and conflating them is the easy mistake.** The **app signing
key** (`ANDROID_*`) signs the APK and fixes app identity forever. The **F-Droid repo key**
(`FDROID_REPO_*`) signs the repository index and could be rotated by re-adding the repo. Eight
secrets total.

**`applicationId` is `net.develivarr.auralis`** as of `ece8f94`, derived from the domain the
user actually controls. The old `net.auralis.app` implied `auralis.net`, which the research doc
had flagged as unverified. It was renamed while free to do so: `applicationId` + certificate
together are app identity, so after a key exists and anyone installs, changing either forces an
uninstall.

**Hosting is GitHub Pages now, the user's own domain later** — their explicit call. Note the repo
URL is baked into Droid-ify, so moving it later means re-adding the repo on the device.

**No anti-AI policy blocks any of this**, verified against live sources 2026-08-15 —
`docs/research/FDROID_DISTRIBUTION.md` §7b has it. The short version: the policy is
IzzyOnDroid's, not F-Droid's; official F-Droid has no documented AI-authorship policy at all
(an open question, so "no rule today" rather than "fine"); and F-Droid's own Inclusion Policy
names a separate repository as the sanctioned route for apps that do not meet its criteria, so
self-hosting is outside any inclusion policy by design rather than by evasion.

**Still missing: a launcher icon.** The app ships Android's default, which is what would appear
in Droid-ify's listing.

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
  `prefersReducedMotion`). An older note here guessed the same gap was "untested but likely
  present" in `Loader`'s spin and `Progress`'s stripe scroll. Checked 2026-08-16: **it is not.**
  `packages/ui/src/styles/index.css` carries a blanket `@media (prefers-reduced-motion: reduce)`
  rule collapsing `animation-duration`/`animation-iteration-count`/`transition-duration` on `*`
  with `!important`, `apps/web/src/main.tsx` imports that stylesheet, and four e2e specs
  (`progress`, `marquee`, `skeleton`, `lyrics`) assert through `page.emulateMedia({ reducedMotion:
'reduce' })`. Neither Mantine `Loader` nor Mantine `Progress` is used in `apps/web` at all. The
  component-level `prefersReducedMotion` hooks exist because the blanket rule cannot stop work JS
  is _doing_ (Marquee's measurement, Skeleton's shimmer prop) — not because CSS coverage is
  missing.

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

Three, none of them holding unmerged work. All three are **safe to ignore** — `worktree-gc.sh`
refuses each of them, correctly, and will forever:

- `agent-a623d0d03e48b3297` — its two commits are on `main` under the same titles, landed by
  re-commit rather than merge, so they share no ancestry. `worktree-gc.sh` therefore refuses it
  ("not a confirmed ancestor of main") and will forever. That is the safety rail working. Removing
  it needs a deliberate `git worktree remove` plus `git branch -D` — the user's call.
- `agent-a8781e77885029281` — the 12f-2 draft, since superseded by `034c4cf`. **Locked**, so
  `git worktree remove` refuses it without `-f -f`; left in place deliberately rather than forced.
- `agent-a1b2a40eb1e9e4e64` — confirmed redundant against what landed on `main`.
- `agent-a0edf63595b976e4e` — the concurrent-libraries test, on `main` as `3cda65c`. Refused for
  the same reason as the first: it was **cherry-picked rather than fast-forwarded**, so it shares
  no ancestry.

**That last one is a lesson, not a fault.** Two agents based on the same commit cannot both
ff-merge — the first moves `main`, and the second is no longer a descendant. Cherry-picking the
second lands identical content but permanently strips `worktree-gc.sh`'s ability to prune it, so
the worktree lingers as apparent unmerged work forever. If two waves are dispatched from one base,
either merge the second with a real merge commit, or rebase it onto the new tip before merging —
and either way `git worktree remove` plus `git branch -D` is then a deliberate manual step, which
is the user's call rather than a session's.

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

### `android.yml` cancels its own in-flight runs on every push, unlike `ci.yml`

`android.yml` sets `cancel-in-progress: true` unconditionally, where `ci.yml` makes it conditional
on the ref so `main` queues instead. The consequence, seen three times in one session on 2026-08-16:
**a docs-only push to `main` kills the Android run verifying the previous commit**, mid-flight. So
Android verification on `main` only ever reflects the most recent push — a green Android run two
commits back is not evidence about the commit you are looking at, and an Android result you are
waiting on will vanish if you push anything at all. Batch pushes when an Android result matters.

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
