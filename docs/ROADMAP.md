# Auralis — Roadmap

Delivery is phase by phase; each phase lands on `main` as a
self-contained, tested increment.

| #   | Phase                                                           | Status |
| --- | --------------------------------------------------------------- | ------ |
| 1   | Monorepo foundations, tooling, CI, test harness                 | done   |
| 2   | `@auralis/ui` — Material 3 Expressive design system             | done   |
| 3   | Server BFF core + Audiobookshelf client                         | done   |
| 4   | Web app shell + **Docker image** — routing, theming, onboarding | done   |
| 5   | Audiobooks experience + player                                  | done   |
| 5a  | Android build skeleton + APK pipeline (parallel with 5)         | done   |
| 6   | Book requests — Prowlarr, AudiobookBay, torrents                | done   |
| 7   | **Android — audiobooks + requests** (Compose + Media3)          | done   |
| 8   | Podcast client (web + Android)                                  | done   |
| 9   | Music client (Jellyfin) + lyrics + requests (web + Android)     | done   |
| 10  | Release polish — performance budgets, a11y audit                | done   |
| 11  | **F-Droid / Droid-ify distribution** — alternative app stores   | todo   |
| 12  | **Spec addendum** — five views, unified search, per-type queues | todo   |

### Why Android sits at 7 rather than last

Audiobooks are mostly listened to on a phone, while walking or driving, and the things that
make that work — reliable background playback, offline downloads, lock-screen controls,
Android Auto — are exactly what a browser does poorly. Shipping priority 1 to the web only
would be shipping it to the wrong device.

It is not first because it depends on the **API contract** having stopped moving, which
happens once phases 5 and 6 complete priority 1 (the Audiobookshelf client _and_ the
request flow, which the user named as one priority). Building Android against a churning
API means building it twice.

The web app remains a genuine phone experience in the meantime: installable as a PWA, with
Media Session lock-screen controls. It is a good stopgap, not a replacement.

### Why 5a exists

Android was written **blind** — not compiled or run once — so the pipeline that builds it is
itself the risk. 5a therefore lands a minimal Compose app that does nothing but build, plus
the workflow that produces a sideloadable debug APK, well before there is real code
depending on it. It runs in parallel with phase 5 because `apps/android/` and `apps/web/`
are disjoint.

**Why it was written blind is worth correcting, because the inherited reason was wrong.**
Earlier drafts of this file said `dl.google.com` was unreachable and Google's Maven
repository blocked. That was true of the ephemeral **cloud container** phases 1–4 were built
in; it was never checked against the machine development actually moved to. Measured there
on 2026-08-02: `dl.google.com`, `maven.google.com` and `services.gradle.org` all resolve and
respond, and the real AGP 8.7.3 POM downloads fine.

The actual blocker is duller and fixable: that machine has **no JDK, no Android SDK and no
Gradle installed**. So local Android builds are an install away, not a network wall — and
until someone does that install, CI remains the first place `apps/android` is compiled.
Do not propagate the network claim any further; check it before repeating it.

## Target surfaces

Auralis is **one Docker container** serving **one web app** that is a first-class
experience on phone, tablet and desktop, plus a **native Android app** against the same API.

| Surface            | How it ships                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop browser    | The primary large-screen layout: expanded navigation rail, multi-column grids, persistent Now Playing side panel, full keyboard control. Not a stretched phone UI.                 |
| Desktop app window | The web app is an installable PWA, so it runs in its own window with no browser chrome, offline shell and OS media keys. No Electron — nothing to bundle, nothing extra to update. |
| Phone / tablet     | Bottom navigation, full-screen Now Playing sheet, touch gestures.                                                                                                                  |
| Android            | Native Compose + Media3 for background playback and offline downloads.                                                                                                             |

The container is self-contained: the Fastify BFF serves the built web app as static assets
on the same origin, so there is no separate web server, no CORS configuration, and one port
to expose. A working `Dockerfile` and `compose.yaml` are an **exit criterion of Phase 4** —
from that point on, every phase leaves `docker compose up` working, rather than saving
packaging for the end.

## Phase detail

### 1 — Foundations

pnpm workspaces, strict TypeScript, ESLint flat config, Prettier, Vitest workspace,
Playwright, GitHub Actions CI running lint + typecheck + unit + e2e.

### 2 — Design system

Token generator (colour from artwork, type, shape, spring motion), theme provider,
component set: button, icon button, card, list item, nav bar/rail, top app bar, search bar,
chip, slider, sheet, dialog, snackbar, progress. Playwright UI tests per component in both
themes.

### 3 — Server BFF

Fastify + zod, encrypted settings store (SQLite), session auth, Audiobookshelf client
covering libraries, items, personalized shelves, search, playback sessions, progress sync,
covers and range-proxied audio.

### 4 — Web shell + container

Routing, adaptive navigation (bottom bar → rail → expanded rail as the window grows),
onboarding (point at your server, sign in), installable PWA with an offline shell, error
boundaries.

Ships the deployment story at the same time, because a self-hosted app that cannot be
self-hosted yet is not a deliverable:

- multi-stage `Dockerfile` — build the web app, prune to production deps, run as a
  non-root user on a distroless-ish base;
- the BFF serving the built assets on its own origin with SPA fallback and immutable
  cache headers for hashed bundles;
- `compose.yaml` with a healthcheck and a single mounted data volume;
- a smoke test that builds the image, boots it against the fake upstreams and asserts the
  app loads and authenticates — so the container is covered by CI, not by hope.

### 5 — Audiobooks

Home shelves ("Continue listening", "Recently added", series), library browse with filter
and sort, item detail, and the full player: chapter list, variable speed, sleep timer,
bookmarks, ±30s, progress sync, Media Session integration, mini player.

### 5a — Android build skeleton

A minimal Compose application that compiles and nothing more: Gradle version catalog,
module structure, Material 3 theme wired to dynamic colour, and a single screen. Plus
`.github/workflows/android.yml`, which assembles a debug APK and uploads it as an artifact
on every push.

It also scaffolds the **Android Auto manifest plumbing** — `automotive_app_desc.xml`, the
`com.google.android.gms.car.application` meta-data, and an empty `MediaLibraryService` — so
that CI proves the Auto declarations compile and merge correctly before phase 7 depends on
them. Manifest-merger failures are a miserable thing to debug blind.

The deliverable is not a feature — it is proof that a machine which cannot reach the Android
SDK can still produce an installable APK. Getting that wrong later, with a real app on top
of it, is far more expensive.

**Closed on 2026-08-03, on the evidence rather than on the code being written.** The first
`Android` workflow run against `07ce0c3` went green and uploaded a 12 MB
`auralis-debug-apk` artifact. That is what the phase was for: blind-written Compose sources
compile, the Android Auto manifest plumbing merges without a manifest-merger failure, and
`gradle/actions/wrapper-validation` accepts the committed wrapper jar. There is now a known
-good pipeline for phase 7 to build on.

Still true, and worth keeping: **no JDK, Android SDK or Gradle is installed on the
development machine**, so CI remains the only place `apps/android` compiles. Installing a
JDK would demote it to a second opinion and make the edit-build loop local.

### 6 — Book requests

Pluggable indexers (Prowlarr, AudiobookBay scraper), pluggable download clients
(qBittorrent, Transmission), request queue with approval and status tracking, post-import
Audiobookshelf scan trigger. Completes priority 1 on the web, and freezes the API surface
that phase 7 builds against.

**Closed 2026-08-03, on a green CI run.** The run for the phase's own work (`958fbb5`
onward) was never read until now; when it finally was, it was red — but at
`e2e/app/player.spec.ts`, a _pre-existing_ Phase 5 test, not at anything phase 6 touched.
Two real, independent bugs were behind it, both in `useAudioElement.ts`'s handling of the
e2e fixture's undecodable audio: `play()` rejecting (asynchronously, timing-dependent) and,
separately, assigning `.src` triggering the browser's own media-load pipeline, which fires
a native `error` event on decode failure — also wired to `pause()`. Either could revert the
store's optimistic "playing" state mid-assertion, so `player.spec.ts` neutralises the audio
element outright (`play()`/`pause()` no-op, `.src` becomes an inert instance property)
rather than continuing to race a browser behaviour the suite was never meant to depend on.
See `daa132b` and `29e9856`. Once that was fixed, all four CI jobs passed cleanly:
lint/format/typecheck, 729 unit tests, Playwright (193/193), and the Docker smoke test.

**Prowlarr leads, and the scraper is the fallback** — the reverse of how earlier drafts of
this file listed them. Checked against the development machine on 2026-08-03: Prowlarr is
already running there with AudioBook Bay, MyAnonamouse, EBookBay and Knaben configured,
and so is `byparr`, a FlareSolverr-compatible challenge solver. That last one is the whole
argument. AudiobookBay sits behind Cloudflare; Prowlarr gets through it by delegating to
the solver, and a BFF-side scraper hitting the site directly cannot. The scraper stays,
because an install without Prowlarr should still work, but it is the degraded path and the
settings screen says so.

**The save path is a setting with no default, deliberately.** The BFF and the download
client are different containers and do not see the same filesystem: on the development
machine qBittorrent has `/data/media/Downloads` mounted at `/data/Downloads` while
Audiobookshelf has `/data/media` at `/data`. A path that is correct for one is not
generally correct for the other, and a wrong guess produces downloads that complete and are
never imported — the most confusing possible failure, because every component reports
success. So Auralis asks, and explains why in the field's help text.

Approval defaults to automatic. The overwhelmingly common deployment is one person's own
server, where a queue is a step that only ever approves; multi-user installs turn it on.

**Where end-to-end coverage stops, and why.** `AURALIS_FAKE_UPSTREAMS` fakes Audiobookshelf
and nothing else, so in CI a configured indexer is genuinely unreachable. The Playwright
spec therefore covers configuring providers, the navigation gate, the unreachable-indexer
notice, and creating a request from a title — but never a release-attached request, because
no release is reachable in that environment. Closing that gap needs fake indexer and
download-client upstreams, which is a follow-up rather than part of this phase: the fake
lives under `src/` and ships in the image (see `main.ts`), so growing it is a change to the
production module graph, not a test-only one.

### 7 — Android: audiobooks + requests

The priority-1 experience, natively:

- Jetpack Compose with Material 3 Expressive and dynamic colour from wallpaper and artwork.
- **Media3 `ExoPlayer` behind a `MediaLibraryService`** — see "Android Auto is a design
  constraint" below; this is not the same choice as a plain `MediaSessionService`.
- Offline downloads with resumable transfers, so a commute without signal still works.
- Progress synced through the same BFF, so a book continued on the phone resumes correctly
  in the browser and vice versa.
- The request flow from phase 6, so a book can be asked for from the phone.

Podcast and music screens follow in phases 8 and 9 as their APIs land.

**Delivered in waves, each a disjoint directory so review stays cheap:**

- **Wave A — networking + settings data layer: done (`ca9ba61`).** `net.auralis.app.data.network`
  (`ApiClient`, `SessionCookieJar`, `KeyValueStore`/`DataStoreKeyValueStore`, `ApiException`)
  and `net.auralis.app.data.settings` (`ServerConfigRepository`), covering `/setup`,
  `/auth/*` and `/libraries*` over session-cookie auth, persisted across process death via
  DataStore. No Compose UI yet. Written blind (no local JDK/SDK), reviewed by an independent
  subagent that caught two real defects before they landed — an uncaught
  `SerializationException` on an undecodable 200 body, and a dropped OkHttp `hostOnly` cookie
  flag that silently widened session-cookie matching after every persisted reload — both
  fixed with regression tests. First real compiler check (`./gradlew test assembleDebug` on
  CI) passed clean.
- **Wave B — composition root, navigation, onboarding + login: done.** `AuralisApplication`/
  `AppContainer` (manual composition, no DI framework — not justified at this size),
  `AuralisNavHost`, and the first-run flow (enter the Auralis server's own address → sign in)
  ending at 5a's existing placeholder `HomeScreen`. First real Compose UI exercised by CI in
  this app (5a's screen was trivial); reviewed by an independent subagent, one compile-breaking
  defect caught before landing (`viewModelFactory` imported from the wrong package —
  `androidx.lifecycle.viewmodel.compose` instead of `androidx.lifecycle.viewmodel`) and fixed.
- **Wave B2 — home screen with real shelf data and cover art: done (`19e8328`).** Replaces
  5a's placeholder `HomeScreen` with the real thing: fetches the first library and its home
  shelves via wave A's `ApiClient`, renders scrollable rows of cover art + title through Coil
  (added this wave), sharing the same cookie-authenticated `OkHttpClient` the `ApiClient`
  already uses — a separate image loader would have silently 401ed on cover requests with no
  local way to notice. Reviewed by an independent subagent; nothing needed fixing.
- **Wave C1 — playback API data layer: done (`4cea695`).** The data-only slice of the player
  wave: `PlaybackSession`/`PlayResponse`/`SyncSessionBody` models, and
  `ApiClient.playItem`/`syncSession`/`closeSession`/`audioTrackUrl`, plus
  `fileIdFromContentUrl` (mirrors the web client's `playback.ts` exactly). No ExoPlayer or
  Compose UI yet. Independent review caught one real defect: a test's own invented
  trailing-slash-only edge case asserted the wrong expected value against otherwise-correct,
  TS-mirrored logic — fixed and verified by hand-tracing all four test cases.
- **Wave C2 — real ExoPlayer + MediaSession behind the service: done (`8ef4224`).** Gives
  `AuralisMediaLibraryService` (a 5a no-op stub) a real player: ExoPlayer backed by an OkHttp
  data source sharing the same cookie-authenticated `OkHttpClient`, wrapped in a
  `MediaLibrarySession` rather than a plain `MediaSession` — deliberate, since Android Auto's
  browse tree (wave E) needs that from the start. The session `Callback` has zero overrides;
  Media3 1.5.1's defaults are correct until Auto actually builds a browse tree. Independent
  review fetched Media3's tagged 1.5.1 source directly to verify this and found no defects.
  No Compose UI or `MediaController` wiring yet, and runtime playback behaviour cannot be
  verified in this environment — CI only proves it compiles.
- **Wave C3 — MediaController wiring + mini player: done (`080c2ca`).** Wires Compose UI to
  actual playback: `PlayerViewModel` owns the single `MediaController` connected to wave C2's
  service, `HomeScreen` taps a shelf item to play it, and a `MiniPlayerBar` shows while
  playing. Independent review caught two real defects before landing — an `Error` UI state
  set but never rendered (fixed with a Snackbar), and `onCleared()` dropping an in-flight
  `MediaController` connection attempt without cancelling it, leaking the eventual controller
  — plus flagged the missing `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_MEDIA_PLAYBACK`
  permissions and `foregroundServiceType="mediaPlayback"`, required at targetSdk 35, fixed
  directly as a three-line manifest change. `gradlew test assembleDebug` confirmed green on
  CI for this commit. Known gap left for later: no `Player.Listener.onPlayerError` handling,
  so an ExoPlayer-side failure doesn't yet surface to the UI.
- **The visual comparison against YouTube Music / Symfonium** flagged for waves B2 and C in
  `docs/DESIGN.md`'s reference table has not happened for either. This environment has no
  Android emulator or device — it can only happen once someone with a device builds and runs
  the debug APK CI produces. Still an open gap.
- **Wave D1 — book-requests API data layer: done (`d917a20`).** The data-only slice of phase
  6's request pipeline, consumed natively: `Release`/`SearchError`/`RequestSearchResult`/
  `BookRequest` models, and `ApiClient.searchReleases`/`listRequests`/`createRequest`/
  `getRequest`/`approveRequest`/`rejectRequest`/`retryRequest`/`grabRequest`/`deleteRequest`.
  Extends the private `get<T>` helper to accept optional query parameters and adds
  `executeNoContent` for `DELETE /requests/:id`'s 204-with-no-body response. No Compose UI
  yet. Independent review checked it field-for-field against the server schema and found no
  defects.
- **Wave D2a — request search + create UI: done (`3b1aebe`, fixed `646850d`).**
  `RequestsViewModel`/`RequestsScreen` — search AudiobookBay/indexer, request a release,
  "request anyway" by title on empty results — mirroring web's `AskForBookPanel.tsx`.
  Independent review caught two real defects before landing (a failed-search state had no
  "request anyway" path; `submitSearch()` had no job cancellation, so a slower earlier search
  could overwrite a faster later one), both fixed with regression tests. `646850d` then fixed
  two of the wave's own tests that were wrong (an assertion expecting a serialized
  `"release":null` when the field is correctly omitted; a test-ordering bug where a prior
  test's un-awaited coroutine threw after teardown).
- **Wave D2b — request list + retry/delete UI: done (`fabd6b1`, layout fix `c556d22`).**
  Adds a "Your requests" section below the existing search form: `GET /requests` on screen
  entry (sorted newest-first), per-request retry when failed, delete always available. No
  approve/reject — Android has no request-settings/approval-policy fetch yet, so there's no
  safe way to gate that. Independent review caught one real defect before landing: the
  search-results branch's unweighted `Modifier.fillMaxSize()` claimed all remaining screen
  height the moment a search returned any release, rendering the new list invisible under
  the single most common search outcome — fixed by making both sections weighted siblings
  (`weight(1f, fill = false)` on the results section, so it shares space instead of hogging
  it; the request list's own `weight(1f)` was already correct).
  `./gradlew test assembleDebug` passed clean on the first real compile, six new
  `RequestsViewModelTest` cases included.
- **Wave E — Android Auto: complete (`f924c47`).** Browse tree, `onPlayFromSearch`/
  `onSearch`, playback resumption — see below for why this can't be bolted on after the
  fact. Split into sub-waves the same way phase 6's requests work was, since the data
  `ApiClient` had was insufficient for a
  browse tree at all.
  - **Wave E1 — data layer prep: done (`7f887dd`).** `ApiClient` had no way to list a
    library's items, list its series, search it, or fetch a single item's expanded detail
    (chapters) — all four exist server-side (`GET /libraries/:id/items`, `/series`,
    `/search`, `GET /items/:id`) but were never wired into the Android client, because
    nothing before this needed them. Added `libraryItems`/`librarySeries`/`searchLibrary`/
    `libraryItem`, plus `SeriesSequence`/`Series`/`Author`/`LibraryItemsPage`/`SeriesPage`/
    `SearchResults`/`LibraryItemResponse` models and a new `series` field on `MediaSummary`
    (books carry it, podcasts don't — nullable, matching the existing `narrator`/`tracks`
    convention in that file). Independent review cross-checked every field and query
    param against the real server source (`apps/server/src/routes/{libraries,items,
schemas}.ts`, `packages/abs-client/src/{client,domain,normalize}.ts`), not just the
    Kotlin in isolation — no defects found. No Compose UI, no `MediaLibrarySession.Callback`
    changes yet; pure data layer, mirroring how Wave D1 shipped ahead of D2a/D2b.
  - **Scope decision, made without waiting on the user (routine call, not a product
    change): the browse tree will ship without a "Downloaded" root node.** ROADMAP's own
    text below lists `Downloaded` alongside `Continue`/`Books`/`Series`/`Podcasts`/`Music`,
    but no offline-downloads feature exists anywhere in `apps/android` yet (confirmed by
    grep — zero hits beyond an unrelated `downloadUrl` field on `Release`, phase 6's
    torrent-request model). Auto's own text argues downloads are "a prerequisite for Auto
    being usable, not an optional extra," which is true for _availability offline_, not for
    landing the browse tree at all — the tree is still useful without it, and a downloads
    wave can add the node later without restructuring what E ships now. `Podcasts`/`Music`
    are likewise out for the same reason (phases 8/9 aren't done) — root ships as
    `Continue`/`Books`/`Series` only, to be extended as sibling waves land.
  - **Wave E2a — read-only browse tree: done (`785391e`, crash fix `316cc33`).**
    `BrowseTree.kt` (`BrowseFolder`/`BrowseBook`/`BrowseIds`/`BrowseTreeRepository`, free of
    any Media3 import) plus `AuralisMediaLibraryService`'s inner `BrowseTreeCallback`, with
    three overrides — `onGetLibraryRoot`, `onGetChildren`, `onGetItem` — bridging the
    repository's suspend API into Media3's `ListenableFuture` contract. Root ships
    `Continue`/`Books`/`Series` only, per the no-`Downloaded` scope decision above.
    Independent review caught a real defect before the crash fix landed: `onGetChildren`
    ignored Media3's `page`/`pageSize` arguments and returned the whole result list
    unbounded, which crashes/misbehaves in Media3.
  - **Wave E2b — make browse items actually playable: done (`371f48d`, fix `e05714a`).**
    E2a's tree rendered in Auto but nothing played from it: a controller taps a book and
    sends back a `MediaItem` carrying only a `mediaId` and no playable URI. Added a plain
    (non-`ViewModel`) `PlaybackItemResolver`, reading `AppContainer.apiClient` directly
    since `MediaLibraryService` has no `ViewModelStore`, owning the chain `playItem` →
    `firstPlayableTrack` → `fileIdFromContentUrl` → `audioTrackUrl`; an `onAddMediaItems`
    override on `BrowseTreeCallback`; and `PlayerViewModel.playItem` rerouted through the
    resolver. Independent review verified against the tagged `androidx/media` 1.5.1 source
    that `MediaSession.Callback.onSetMediaItems`'s default delegates to `onAddMediaItems`
    (so overriding only the latter covers both "add to queue" and "tap to play, replacing
    the queue"), and that returning a shorter list than was passed in is legal — Android
    Auto's legacy `onPlayFromMediaId` path routes through
    `MediaUtils.setMediaItemsWithStartIndexAndPosition`'s `C.INDEX_UNSET` branch, which
    handles an empty list without an index-based crash — so dropping unresolvable items is
    safe. Review found one real defect, fixed in `e05714a`: the browse row put the author in
    `subtitle` while the resolver put it in `artist` and mapped a different, usually-null
    field into `subtitle`, so the subtitle line blanked the instant playback started — both
    converters now set `artist` from the author, with `subtitle` falling back to it. A
    second fix in the same commit generalizes beyond this wave: `MediaItem.Builder().
setUri(String)` reaches `android.net.Uri.parse`, and this project's unit tests run
    against the stub `android.jar` (no Robolectric, `isReturnDefaultValues` unset), whose
    methods throw — so any test that reaches a successful resolve and constructs a real
    `MediaItem` fails on CI. The resolver's `resolve` now returns a Media3-free
    `ResolvedPlayback` data class; all `MediaItem`/`MediaMetadata` construction moved into a
    separate `playback/MediaItemConversions.kt` as pure, logic-free mapping. **General rule
    for this project, not just this wave: `MediaItem` construction is unit-untestable here,
    so any decidable playback logic must live in a Media3-free class, with conversion to
    `MediaItem` kept as pure mapping in its own file.** Both `CI` and `Android` workflows
    are green on `8ae9468`.
  - **Wave E2c — voice search + playback resumption: done (`c79a1a7`, merged `f924c47`).**
    `BrowseTreeRepository.search()` is Media3-free and returns the same `BrowseBook` type
    the browse tree uses, so results convert through the existing
    `MediaItemConversions.kt` mapper rather than a second one. `onSearch` and
    `onGetSearchResult` window results to `pageSize` client-side, gated by the same
    `verifyResultItems` check that crashed `onGetChildren` in E2a. Spoken "play <title>"
    doesn't reach `onGetSearchResult` at all — Android Auto sends a `MediaItem` with
    `mediaId = MediaItem.DEFAULT_MEDIA_ID` (`""`, not null) and the query in
    `requestMetadata.searchQuery`, through `onAddMediaItems`, so the `searchQuery` branch is
    checked before the `mediaId` branch; reversing them silently breaks voice search.
    Best-match selection (case-insensitive exact match wins, else first result, blank query
    falls back to the most recent continue-listening item) is a Media3-free tested function.
    `onPlaybackResumption` returns the most recent continue-listening item at its stored
    position, signalling "nothing to resume" the way Media3's own default does — by failing
    the future with `UnsupportedOperationException`. `ResolvedPlayback` gained
    `startPositionMs`, converted from `PlaybackSession.currentTime` (seconds, per this
    project's own seconds-unless-`Ms`-suffixed convention) with no extra network call.
    Independent review re-verified every Media3 claim directly against the `androidx/media`
    1.5.1 tag rather than trusting the implementing agent — the `verifyResultItems` gate,
    `notifySearchResultChanged`'s signature and non-empty-query contract,
    `createMediaItemForMediaRequest`'s empty-`mediaId` behaviour, `onPlaybackResumption`'s
    default, and (via `kotlinx-coroutines-guava`'s source) that throwing inside `future { }`
    completes the future exceptionally rather than escaping the `SupervisorJob` scope — and
    found no defects. Two efficiency nits recorded, neither fixed: `onSearch` and
    `onGetSearchResult` each call `search()` independently and never pass `searchLibrary`'s
    optional `limit`, so one search interaction makes two unbounded round trips with all
    windowing done client-side (deliberate, to keep the browser's reported count and the
    later-returned results from drifting apart); and `search()`'s `.drop(page * pageSize)`
    carries the same theoretical `Int` overflow risk as the pre-existing
    `continueListeningChildren`/`seriesBooks` windowing it copies, not reachable with any
    pageSize a real Auto client sends. Both `CI` and `Android` workflows are green on
    `f924c47`. This completes Wave E — Android Auto is feature-complete as scoped, but
    unverified on real hardware: Auto can't be exercised here or on CI, and
    `onPlaybackResumption` depends on the same unverified `contains("continue")`
    shelf-matching heuristic the rest of the continue-listening surface already relies on.
- **Wave F — offline downloads: complete (`a762cbb`).** Split data-layer-first, same as every
  prior wave.
  - **Wave F1 — data layer: done (`eb211ef`, fix `66829da`).** New
    `net.auralis.app.data.downloads`: `DownloadState`/`DownloadedItem`, a pure
    `downloadProgress` (total on zero/unknown totals, clamps to 0..1),
    `downloadStateFromMedia3(Int)` mapping Media3's `Download.STATE_*` constants, and a
    `DownloadRepository` behind a narrow `DownloadEngine` interface, persisted through wave
    A's existing `KeyValueStore`. `AppContainer` wires a named `UnavailableDownloadEngine`
    placeholder until the real engine lands. Downloads cover every track of an item,
    deliberately unlike `PlaybackItemResolver`'s first-track-only playback scoping —
    downloading only track one of a multi-file audiobook strands a listener exactly during
    the signal-loss commute the feature exists for. The whole decidable layer stays
    framework-free (zero `androidx.media3`/`android.*` imports), since unit tests run against
    the stub `android.jar`, which throws on any real framework call — the same rule Wave E2b
    learned the hard way. Independent review verified every `Download.STATE_*` constant
    against `Download.java` at the `androidx/media` 1.5.1 tag and caught one real defect,
    fixed in `66829da`: with the placeholder engine `AppContainer` actually ships, `enqueue`
    persisted the item into the kept-offline set and returned the same success value a real
    download start produces — a phantom entry `downloadsFor` would never report on. Fixed
    with a distinct `Unavailable` result case and an `isAvailable` property on
    `DownloadEngine` (default `true`), rather than an `is UnavailableDownloadEngine` type
    check that would keep compiling and keep silently doing nothing once the real engine
    replaces that class.
  - **Wave F2a — real download engine: done (`f07668b`, crash-risk fix `21fb61c`).** The
    real `Media3DownloadEngine` behind F1's interface, an `AuralisDownloadService` so
    downloads survive backgrounding, and a single shared non-evicting `SimpleCache` the
    player reads through so a downloaded item plays with no network. Two decisions worth
    recording because neither is visible without a device: the download stack uses the
    **same cookie-authenticated `OkHttpClient`** as playback (Media3's default HTTP stack
    would 401 every request against an authenticated Audiobookshelf), and playback's
    `CacheDataSource` is deliberately **read-only** (`setCacheWriteDataSinkFactory(null)`) —
    the default opportunistically writes streamed content into the cache it reads from,
    which combined with the non-evicting policy downloads require would grow disk forever
    from ordinary listening, invisible to `DownloadManager`'s index. Independent review
    found a real crash risk, fixed in `21fb61c`: a `dataSync` foreground service on
    targetSdk 35 is capped at 6 cumulative hours per 24h, and a service that doesn't stop
    itself when the system calls `onTimeout` takes a fatal `RemoteServiceException` —
    neither Media3's `DownloadService` nor ours implemented it. Reachable, not theoretical:
    `getScheduler()` returns `null` and Media3 only consults a scheduler below API 31, so a
    download stalled on lost signal pins the service indefinitely. The fix **pauses
    downloads before `stopSelf()`** — that ordering is load-bearing, since Media3 restarts a
    detached service whenever a download is still `DOWNLOADING`, so a bare `stopSelf()`
    would relaunch against the very budget the system just exhausted. The pause flag is
    in-memory and cleared on the next `onCreate`, so resumability is unaffected.
  - **Wave F2b — download UI: done (`a762cbb`, test fixes `f21709a`).** Starting a download
    from the home shelves (no book-detail screen exists yet), a downloads screen with live
    progress and cancel, the runtime `POST_NOTIFICATIONS` request on first download rather
    than at launch, and a **`Downloaded` node in the Android Auto browse tree** (deliberately
    omitted by Wave E1's scope decision above while no downloads feature existed — it exists
    now). The Auto node lists only items whose aggregate state is `COMPLETED`, not merely
    kept-offline — a still-downloading item would let a driver tap it expecting offline
    playback and get nothing. Progress **polls** rather than pushing from a
    `DownloadManager.Listener`: a listener is strictly better but can only live in
    `Media3DownloadEngine`, which is untestable here, so polling keeps the new logic in a
    framework-free tested class. `f21709a` fixed four failing tests, **both test-side,
    implementation correct** — worth recording because both traps will recur:
    `MockWebServer` serves queued responses strictly **FIFO by arrival**, not by matching
    URL, so a helper that fires its own request before the one under test steals the queued
    response and shifts every later one, compounded by `BrowseTreeRepository.children()`'s
    own degrade-to-empty catch turning the resulting parse error into a silent "no children"
    rather than a visible failure; and a `SharedFlow` with `replay = 0` loses an event
    emitted before its collector attaches, which happens whenever the production path
    doesn't suspend — fixed by starting the test's collector `UNDISPATCHED`. **Still
    unfixed, flagged**: one Downloaded-node test (`excludes an item that is still
downloading`) has the same enqueue-ordering flaw but passes anyway, because its expected
    empty result holds either way — it passes for the wrong reason and should be corrected.

  **This completes Wave F, and with it Phase 7 as scoped** — audiobooks, requests, Android
  Auto and offline downloads are all in place.

#### Android Auto is a design constraint, not a feature toggle

Auto does not render the app's UI. It renders **its own templated UI** from a browse tree
the app publishes, so the playback layer has to be built as a
`MediaLibraryService` (`MediaSessionService` + a browsable hierarchy) from the first commit.
Bolting a browse tree onto a session-only player later means restructuring playback, which
is precisely the sort of rework this roadmap is ordered to avoid.

What that implies concretely:

- **A shallow, driving-safe browse tree.** Auto caps how many items it will show and how
  deep a user may navigate while moving. The root is therefore intent-shaped, not
  library-shaped: _Continue_, _Downloaded_, _Books_, _Series_, _Podcasts_, _Music_ — with
  "Continue" first, because in a car it is almost always the right answer.
- **Chapters are the skip target.** In the car, "next" must mean _next chapter_, not next
  file or next book. Audiobook chapter boundaries drive `seekToNext`/`seekToPrevious`, and
  the media metadata advertises chapter titles so the head unit displays something useful.
- **Voice.** `onPlayFromSearch` / `onSearch` wired so "play <title>" and "resume my book"
  work without touching the screen — the only genuinely safe interaction while driving.
- **Playback resumption.** Auto asks for a recent-items root after a reboot so playback can
  resume from the head unit before the phone is unlocked.
- **Offline matters more here.** Signal is worst exactly where cars go, so downloads are a
  prerequisite for Auto being usable, not an optional extra.
- **Manifest plumbing:** `automotive_app_desc.xml` plus the
  `com.google.android.gms.car.application` meta-data, and an intent filter for
  `MediaBrowserService` compatibility. Scaffolded in 5a so CI validates it early.

**Two honest caveats.** First, Android Auto cannot be tested here or on CI — verification
needs the Desktop Head Unit on a real machine, or an actual car. It will be on the user to
confirm, and phase 7 will ship a written test script for doing so. Second, because Auralis
is sideloaded rather than Play Store distributed, it will not appear in Auto until
**"Unknown sources" is enabled in Android Auto's developer settings** on the phone; that
step will be documented, since without it the app simply never shows up and looks broken.

### 8 — Podcasts

Podcast library browse, feed search and subscribe, episode lists with download state,
new-episode shelf, podcast player affordances — on web and Android together, now that both
shells exist.

- **Wave A — podcast discovery backend: done (`87595f0`).** Three operations against
  Audiobookshelf 2.36.0 (verified against real upstream source): `searchPodcastDirectory`
  (proxies ABS's iTunes-backed podcast search), `previewPodcastFeed` (fetch+parse RSS before
  subscribing), `subscribePodcast` (create library item). New BFF routes/schemas in
  `apps/server/src/routes/podcasts.ts` + `schemas.ts`, plus matching `abs-client` additions
  (`client.ts`, `domain.ts`, `normalize.ts`, `schemas/raw.ts`). Along the way fixed a
  pre-existing bug where 403 and 401 both mapped to the same auth-error code, wrongly
  logging non-admins out instead of returning "forbidden"; review also caught episode
  duration/chapter data being silently dropped and a podcast title of exactly `".."`
  defeating the folder-sanitizer, both fixed.
- **Wave B — podcast discovery on web: done (`1079228`).** Search the podcast directory,
  preview the parsed RSS feed, subscribe — consuming Wave A's three BFF routes, no server
  changes. New `apps/web/src/features/podcasts/` (`PodcastDiscoverPage`,
  `PodcastFeedPreview`, a pure `subscribeMetadata`), a `/podcasts/discover` route, and an
  entry point from the podcast `LibraryPage` rather than a new top-level nav destination —
  discovery is not scoped to a library id the user may not have yet. The preview step is
  the point: subscribing writes a library item, so a confirmation dialog would ask the user
  to approve something they cannot see. Verified in a real browser: 4 Playwright specs in
  `e2e/app/podcasts.spec.ts` covering the nav entry point, search → preview → subscribe, and
  the paste-a-URL path. Independent review found no confirmed defects, checking the client
  types field-by-field against the server's zod schemas and confirming the double-submit
  guard is react-query's own mutation lifecycle rather than something a re-render can
  invalidate. Two open items, neither a defect: subscribing always targets `folders[0]` of
  the podcast library (fine for the single-folder setups that dominate; a folder picker is
  the follow-up if multi-folder turns out common), and `PodcastFeedPreview` has no unmount
  guard around an in-flight subscribe (console-only, no data effect).
- **Wave C — podcast detail, episode list and playback on web: done (`95e42f8`).** The
  podcast detail view, episode list, and episode playback. Threading `episodeId` through the
  player proved unnecessary: the play route opens a session already scoped to the episode
  upstream, so `playerStore`/`progressSync` needed no changes — sync/close operate on that
  opaque session id. Per-episode progress reads `/me/progress`, because Audiobookshelf never
  populates item-level progress on a podcast container. A follow-up (`dca99f2`, fixed
  `0ce770d`) made the player show the **episode** title rather than the show's, including on
  the lock screen via `useMediaSession`. Its own unmount-guard side-fix shipped a StrictMode
  bug — a cleanup-only `mountedRef` is permanently `false` after StrictMode's simulated
  remount, so the subscribe success state never rendered — now fixed.
- **Android wave A — data layer: done (`8c689fa`).** Discovery (directory search, feed
  preview, subscribe), episode listing via the expanded item detail, `playEpisode(itemId,
episodeId)`, and `myProgress()`. Each operation was checked against its server route
  rather than inferred from the web client. Nullability was verified against the BFF's
  **own normalizer**, not the domain interface: fields that look optional upstream are
  filled with `?? 0`/`?? false` fallbacks before serialization, so non-nullable Kotlin types
  are correct — widening them would push imaginary null-handling into every consumer.
- **Android wave B — discovery, detail and playback UI: done (`58a2aa2`, test fix
  `774e592`).** Discovery, a podcast detail screen with per-episode progress, and episode
  playback. `PlaybackItemResolver.resolveEpisode` is a **sibling** of `resolve`, not a
  branch inside it: it calls `playEpisode` and shares `buildResolvedPlayback` unchanged,
  since both endpoints decode the identical session shape. The episode stream URL is built
  from the **container** item id, verified against web's own `useAudioElement` and against
  `media.ts` (a pure range-forwarding proxy with no book/podcast distinction) rather than
  assumed. `774e592`'s lesson is worth keeping in mind for any future coroutine test:
  `UncaughtExceptionsBeforeTest` names the test that runs _next_, not the one at fault — an
  earlier test's `subscribe()` launches an independent list reload, asserted only to have
  been _sent_, not applied, so the coroutine was still suspended when teardown reset the
  main dispatcher out from under it. The reload fixture had to be made distinguishable from
  the pre-subscribe one before a test could wait for it to actually complete.

**This completes Phase 8** — backend, web and Android all shipped.

### 9 — Music

Jellyfin browse (albums, artists, genres, playlists), Spotify-depth search, gapless queue
playback, a synced lyrics view, music request provider — web and Android together.
**Lyrics search** (typing a remembered line to find the track) is scoped separately from the
synced lyrics view below: it needs Auralis's own lyric index and is blocked on a product
decision, not on remaining build time — see the bullet at the end of this section.

- **`packages/jellyfin-client`: done (`07282f8`).** A typed, tested Jellyfin client: auth,
  music browsing (artists/albums/tracks), search, and pure stream/artwork URL builders.
  Every endpoint, the `MediaBrowser` auth-header format and the PascalCase response
  convention verified against `jellyfin/jellyfin`'s own source rather than recalled.
  `BaseItemDto` is Jellyfin's single DTO for every item kind, so only `Id` is required on
  the raw schemas and all defaulting happens visibly in `normalize.ts`.
- **Credential storage, decided (`184fc82`).** Jellyfin authenticates per account like
  Audiobookshelf, so its token is **user-scoped**, in its own `jellyfin_secrets` table —
  not `provider_configs` (whose `kind` column is typed to the request pipeline's
  indexer/download roles) and not a widened `secrets` (whose primary key is `user_id`
  alone). An undecryptable ciphertext reads as unconfigured rather than erroring. The
  server URL needs no new storage — `settingsRepo` already supports a `jellyfin` upstream.
- **BFF routes: done (`2de121d`).** Config, login, artists/albums/tracks with pagination
  and the upstream's `TotalRecordCount`, search, and **proxied** stream and artwork. The
  proxy is the wave's security requirement: Jellyfin's URL builders embed the auth token in
  the query string, so those URLs never reach a browser or an APK — the BFF builds them,
  fetches them, and returns only the bytes. A transport failure becomes a typed network
  error whose message never echoes the URL. Tests assert the token appears in no response
  body across every route, and sweep response headers too.
- **`586742e`** — the package had to be added to the container image: `apps/server`'s
  `start` runs `tsx` against TypeScript sources, so a workspace import is a **runtime**
  dependency, not just a build-time one. The image built fine and the container died on
  boot. Its own `node_modules` must come along too, since pnpm's isolated layout means its
  `zod` is only reachable through it. The Dockerfile enumerates workspace packages by hand,
  so this same failure mode — image builds, container dies on boot — recurs for every
  future package `apps/server` depends on until that's automated.
- **Web wave A — connect flow, browse, search: done (`d99888e`).** The connect flow (in
  Settings, following the existing provider pattern), artist/album/track browse with
  `TotalRecordCount`-driven pagination, and search. Shipped with **no play affordance**,
  deliberately, because the player had no seam for a non-Audiobookshelf source. It also
  fixed a pre-existing bug it was the first to trigger: the global 401 handler signed the
  whole app out on any 401, so a wrong Jellyfin password logged the user out before the
  connect form's own error could render. It now keys on the `unauthenticated` code
  `requireSession` actually sends; the same collision already existed for Audiobookshelf's
  `upstream_auth_expired` and nothing had exercised it.
- **The player seam: done (`fe12a77`).** A `PlaybackSource` bundling a progress reporter
  (`onTick`/`onEnd`) and a `resolveTrackUrl`. The Audiobookshelf implementation was **lifted
  intact, not rewritten**; the wall-clock `timeListened` arithmetic and its tests are
  untouched. `onEnd` takes a **nullable** body, because teardown must still close the
  upstream session when no sync payload was ever produced — a body-only signature would
  have compiled, passed every test, and silently stopped closing those sessions. There is
  deliberately **no `onStart` hook**: session-opening is a network round-trip already owned
  by the call site's mutation, and Jellyfin's equivalent shares no shape with it, so
  abstracting it with one implementation would have been guessing.
- **Web wave B — music plays: done (`2a2edf7`, `de2f908`, merged `d98cc9e`).**
  `jellyfinSource` uses the proxied stream route and, honestly, a **no-op progress
  reporter** — Jellyfin's own `PlaybackProgress` API is not wired up, so music reports
  nothing upstream. Album queueing needed **no new store concept**: an album's tracks lay
  end to end on the same cumulative `startOffset` timeline multi-file audiobooks already
  use, plus a pure `nextTrack()` and an `ended` listener. Two latent bugs affecting _books_
  were found and fixed along the way: nothing listened for the audio element's `ended` event
  at all, and reassigning `audio.src` while playing did not resume (the `[isPlaying]` effect
  fires on a play/pause transition, not a track change), so audio went silently quiet
  mid-book.
- **Unified search: web done.** `/search` fans one typed query out to Audiobookshelf _and_
  Jellyfin, gated on `useJellyfinConfigQuery()` so an unconfigured Jellyfin fires no request
  and shows no music section — the page reads exactly as it did before this wave in that
  case, including the announced text: the status line always echoes the query as typed
  (whitespace included), never a trimmed version of it. Music renders as three subsections
  (artists/albums/tracks), each omitted when empty, after Books and Podcasts (audiobooks
  stay priority 1 in section order); when Jellyfin is configured but a settled search found
  no music at all, the section reads "No music matches." rather than an empty heading, the
  same pattern Books and Podcasts already use. Each section shows neither results nor a "no
  matches" placeholder while its own upstream is still loading — Audiobookshelf and Jellyfin
  resolve independently, so one finishing first must never render a negative claim about the
  other still in flight. An artist or album result navigates straight to its page; a **track
  result navigates to its album page** rather than playing directly — a search result carries
  no track list to build a playback queue from, and the album page already has one. A track
  with no `albumId` renders as a non-interactive card instead of a dead click target. The
  status-line wording (the single `aria-live` announcement the page has ever had) is
  generated by a pure, unit-tested `searchStatus.ts` rather than an inline ternary; the
  three music clauses (artists/albums/tracks) join the sentence only once at least one of
  them is non-zero, not merely because Jellyfin is configured, so a query that only ever
  matches books stays a short, two-part sentence. The no-music, Jellyfin-unconfigured wording
  matches what `browse.spec.ts`'s pre-existing search tests already assert, so that suite
  needed no changes. No Android UI yet.
- **Lyrics search is blocked on a product decision, not on Jellyfin.** Verified against
  `jellyfin/jellyfin` source (this project's standing rule for Jellyfin claims — recall isn't
  trusted): Jellyfin's search never matches lyric text — `SqlSearchProvider.cs`'s `WHERE`
  clause and relevance scoring both cover only `CleanName` and `OriginalTitle` — and its
  lyrics API (`GET /Audio/{itemId}/Lyrics`) is strictly per-item, with no endpoint that
  searches lyric text across a library. The **synced lyrics view** above is unaffected by
  this and stays ordinary remaining phase-9 work: the per-item endpoint already returns
  per-line timestamps, so it needs only a client method, a BFF route and a UI. **Lyrics
  search** needs Auralis to build and maintain its own lyric index instead, and which of the
  two viable approaches to take — index only what the server already has, or also backfill
  from an external provider (which carries a privacy opt-in decision) — is the user's call,
  not this wave's. `docs/INTEGRATIONS.md`'s "Discovery layer" section has the full breakdown.

- **Web wave C — Jellyfin progress reporting: done (`fb59f64`).** Music now reports upstream,
  so Jellyfin records plays, advances "recently played" and can resume. Client methods for
  `POST /Sessions/Playing{,/Progress,/Stopped}` (verified against `PlaystateController.cs`
  and `PlaybackProgressInfo.cs`, not recalled — all three return 204 with an empty body),
  three session-guarded BFF routes, and a real reporter replacing `jellyfinSource`'s no-op.
  The client's public API takes **seconds** and converts to Jellyfin's 100ns ticks internally,
  so no caller ever handles the upstream's unit. Two things the wave had to get right:
  `ProgressSyncBody.currentTime` is a position on the **cumulative queue timeline**, so the
  reporter maps it to (track item id, per-track position) by reusing `playback.ts`'s existing
  `trackAt` rather than walking the queue a second time; and the `PlaybackProgressReporter`
  interface still has **no `onStart` hook** — Jellyfin needs a start report to populate
  `NowPlayingItem`, so `jellyfinSource` fires one lazily from its own first `onTick` and again
  on each track change, tracked in a closure, keeping the shared seam unchanged. `onEnd(null)`
  sends no stop report: a null body means duration was never learned, so no track was ever
  resolved to stop. Known limitation: `IsPaused` is always reported `false`, because
  `ProgressSyncBody` carries no pause signal — it affects Jellyfin's own UI hints, not resume
  correctness.

- **Android wave A — music data layer: done (`821ec42`, merged `924cc2c`).** Android had no
  music at all. This is the data layer only, deliberately: DTOs, `ApiClient` methods against
  the existing `/jellyfin/*` BFF routes, a `MusicRepository` and its `AppContainer` wiring —
  no Composable, no ViewModel, no nav entry, so the UI wave builds against a surface that
  already exists and is unit-tested. Written blind like every `apps/android` change here (no
  JDK/SDK/Gradle on this machine); the Android workflow compiled it green on the merge commit,
  which is the only real signal. Independent review confirmed the DTOs match
  `packages/jellyfin-client/src/domain.ts` field-for-field and the query parameters match
  `routes/schemas.ts` param-for-param — the pagination field is `total`, not Jellyfin's own
  `TotalRecordCount`, which the BFF already normalizes away. The stream URL builder targets
  the BFF's proxied route and is asserted token-free, and the login DTO has no token field at
  all, so no Jellyfin credential is ever persisted Android-side. Result types are non-generic
  per call (`ArtistsPageResult`/`AlbumsPageResult`/`TracksPageResult`) rather than one generic
  page type: the generic version star-projects to `List<*>` at the call site and does not
  compile, and every other sealed result in the app is non-generic too.

- **Web wave D — synced lyrics view: done (`c0c05f3`, merged `08a1cc6`).** Client method, BFF
  route, and a player panel that highlights the current line and scrolls it into view.
  Lyrics _search_ stays out of scope and blocked (see the bullet below it). Three things this
  wave established that are worth not rediscovering, all verified against
  `jellyfin/jellyfin` source rather than recalled:
  - **The draft lyric schemas an earlier session left in `schemas/raw.ts` were wrong.**
    `LyricLine.Text` was nullable-optional; the C# model requires a non-null string. And
    `LyricMetadata.IsSynced` — the field that looks like it answers "is this synced" — is
    **never populated** by either `LrcLyricParser` or `TxtLyricParser`. Whether a file is
    synced is derived from whether every line carries a `Start` tick instead. This is what a
    schema with no consumer and no test costs.
  - **`GET /Audio/{id}/Lyrics` returns a bare 404 for two different things** — item not found,
    and item has no lyrics — indistinguishably. The client folds _only_ `not_found` into a
    typed `null`; every other status still throws, so a real upstream failure stays
    distinguishable from the overwhelmingly common "this track has no lyrics".
  - Line order is trusted, not re-sorted: `LrcLyricParser` pre-sorts server-side and
    `TxtLyricParser` has no timestamps to sort by.

  No `aria-live` on the lyrics container, deliberately — it would re-announce every few
  seconds. Scroll behaviour is driven from `ThemeProvider`'s own `prefersReducedMotion`, not
  from a library prop, for the reason the Mantine notes below already record.

  Playwright coverage followed in `b35bba8` (merged `90b2485`), closing the gap below for
  the branches that matter: active-line tracking across a real timestamp boundary, unsynced
  lyrics staying unhighlighted, the no-lyrics copy not being announced as an alert, a book
  firing **no** lyrics request (asserted on the network, since a fetched-and-discarded request
  passes a UI-only check), reduced motion reaching `scrollIntoView`, and the active line
  actually scrolling. Stable across three consecutive runs; full suite 243/243.

**A real bug that coverage pass found in `packages/ui`, now fixed (`a6c61d4`)**:
`Slider.tsx` collected props into `...rest` and never spread it, so **every** pass-through
prop was silently dropped — `data-testid` was only how it surfaced, and `aria-label` survived
by accident because the component hand-plucked that one attribute back out of `rest`. Fixed
by spreading `rest` last onto the `role="slider"` element, which is what every other component
in the package already does. Covered by Playwright rather than a unit test, because
`packages/ui` has **no component-render path in Vitest at all**: the config globs only
`*.test.ts` under a `node` environment, so a `.tsx` render test would not even be collected.
No other component in the package has the same bug.

**A repo-wide testing gap this wave surfaced, not caused**: `vitest.config.ts` collects only
`apps/web/src/**/*.test.ts` in a `node` environment, and neither jsdom/happy-dom nor
`@testing-library/react` is installed — there is **no `.test.tsx` anywhere in the repo and no
harness that would run one**. So every React component in `apps/web` is covered only by
whatever pure logic it delegates to, plus Playwright. For `LyricsView.tsx` specifically that
leaves its four render branches, its `scrollIntoView` effect and its reduced-motion wiring
unverified by any automated test. Playwright runs locally on this machine and is the cheaper
of the two fixes; installing a DOM environment is the other.

- **Android wave B — music browse UI: done (`b73c246`, entry point `52307c7`, fixes
  `ad3ecbf`).** Library browse (paginated artists + albums), artist detail and album detail,
  with ViewModels, navigation and unit tests. No playback, no search, no connect form — each
  is a later wave and each would have collided with a package this one was told to leave
  alone. A Jellyfin connect form is deliberately _not_ needed to make this usable: credentials
  are user-scoped and stored server-side, so a user who connected in the web app is already
  connected on Android, and "not connected" is therefore a calm empty state rather than
  something to fix here.

  **Album tracks are requested with `sortBy=ParentIndexNumber,IndexNumber` explicitly**,
  because the BFF's default of `SortName` sorts alphabetically by title rather than by track
  number.

  Two defects were caught after merge, both now fixed in `ad3ecbf`. Worth recording because
  neither is specific to music:

  - **A leaked-coroutine test race turned Android CI red**, and the two tests that _reported_
    the failure were innocent — `UncaughtExceptionsBeforeTest` lands on whichever test's
    `runTest` happens to run next. The cause was a test awaiting only a _partial_ state match
    (`artistsState is Loaded`) while the same ViewModel coroutine was still fetching the
    albums page, then enqueuing another `MockWebServer` response — racing two requests against
    a strictly-FIFO response queue. `features/podcasts/PodcastsViewModelTest.kt` already
    documents this exact mechanism and its fix; await the whole of `load()`, not half of it.
  - **The two section-level Retry buttons were dead.** They were wired to `loadMoreArtists`/
    `loadMoreAlbums`, which open with an `as? Loaded ?: return` — so from a `Failed` state they
    were a silent no-op. No test exercised the path, which is why it shipped.

**A real, shipped web bug the Android wave surfaced, now fixed (`4f8cddf`, merged
`f00f336`)**: `apps/web/src/api/queries.ts`'s `useJellyfinTracksQuery` never set `sortBy`, so
it got the BFF's `SortName` default and the web album page listed tracks **alphabetically by
title, not in track order** — and because the album page is what builds the playback queue,
albums also _played_ alphabetically. Now `ParentIndexNumber,IndexNumber`, verified against
`Jellyfin.Data/Enums/ItemSortBy.cs` and `AudioFileProber.cs` (which assigns both from a
track's own disc/track tags). Two things the fix turned up: `apps/web/src/api/client.ts`'s
`getJellyfinTracks` query type had no `sortBy` field at all, so the parameter had no way to
reach the request even though the BFF already accepted it; and a hook _can_ be unit-tested in
this repo after all, without a DOM — `apps/web/src/api/queries.test.ts` follows
`queryClient.test.ts`'s existing `vi.mock` idiom, mocking `useQuery` and `useApi` and calling
the hook as a plain function. That does not close the component-test gap below, but it does
mean query-shape bugs like this one are testable.

- **Android wave C — music playback: done (`5d3d4e7`, merged `ed60f1b`).** Tapping a track
  plays the album from there. It needed **no change to the Media3 stack**: the service's
  `onAddMediaItems` already passes through any item carrying a real URI, which is the same
  mechanism single-item book and episode playback relies on, so it accepted a multi-item queue
  unchanged. `MiniPlayerBar` and the lock-screen metadata needed nothing either. The queue is
  built by a pure `albumPlaybackQueue(...)` so its ordering is unit-testable directly rather
  than through a ViewModel. Every queued track carries **album-level** artist/album/artwork,
  matching the web client — which will show the wrong artist on a compilation. Not yet
  reported to Jellyfin: Android playback sends no progress upstream (web does).

- **The paused-reporting gap below is fixed (`4b11b22`).** The whole path — BFF route,
  `jellyfin-client`, the web API client — already carried `isPaused` end to end; only
  `jellyfinSource.onTick` never passed it through. `PlaybackProgressReporter.onTick` now takes
  a second argument, `PlaybackTickState`, kept **out of** `ProgressSyncBody` deliberately:
  that type is Audiobookshelf's literal wire shape, so a field added there would leak into an
  upstream request that has no such parameter. `audiobookshelfSource` ignores the new argument
  and a test pins its payload byte-for-byte so a future refactor cannot start sending a pause
  field to Audiobookshelf. `useProgressSync` reads `isPlaying` **fresh at tick time** via
  `getState()`, because the interval's effect depends on `[collect, sessionId]` and a
  closed-over value would be frozen at session change and never see a play/pause toggle.

  One consequence worth knowing: the lazy start report still hardcodes `IsPaused: false`
  (Jellyfin's start DTO has no pause parameter), and the progress report that corrects it is
  fired unawaited immediately after — so the two requests have no guaranteed wire ordering.
  Pre-existing, not introduced by the fix.

- **Web wave E — favourites: done (`25cee48`, merged `905cd60`).** Mark and unmark tracks,
  albums and artists, plus a `/music/favorites` view. Verified against Jellyfin's source: the
  live routes are `POST`/`DELETE /UserFavoriteItems/{itemId}` — the `Users/{userId}/
FavoriteItems/{itemId}` shape that reads as the obvious one is an **obsolete alias** — and
  no Jellyfin user id has to be threaded through at all, because `RequestHelpers.GetUserId`
  falls back to the id inside the caller's own token. Favourite state comes from
  `BaseItemDto.UserData.IsFavorite`, which is populated by default (`DtoOptions()`'s
  parameterless constructor sets `EnableUserData = true`, and nothing here sends the parameter
  that would override it) — worth knowing, because if it had needed an explicit request
  parameter, every item would have read as un-favourited and looked like a sync bug rather
  than a missing flag. Listing is `filters=IsFavorite` on `/Items`.

  The toggle updates optimistically across **every** cached Jellyfin query rather than only
  the list it was clicked in, so the same album shows the same state everywhere at once, and
  rolls back with a snackbar on failure — a silent revert would leave the user believing a
  toggle landed. Three separate sections rather than one merged list, because Jellyfin has no
  single "all favourites" endpoint to merge from.

  Not covered: `MusicHomePage`'s artist grid and search results have no toggle yet.

  **Two defects found in review and fixed (`f78a00d`, `26d7b00`, merged `08436b0`)**, both
  worth knowing before writing the next optimistic mutation:

  - **The standard optimistic recipe has a rollback race, and it was reachable by
    double-clicking one heart.** Each `mutate()` call snapshotted the whole cache in
    `onMutate` and restored it unconditionally in `onError`, so a first request failing
    _after_ a second had already written clobbered the second. `onError` now restores a query
    only if the cache still holds exactly what that mutation wrote — one guard that closes
    both the same-item and the cross-item case. The identity check works because "what I
    wrote" is read back from the live cache rather than computed from the updater's return
    value; React Query's structural sharing would otherwise break reference equality.
  - **An `ids` filter that parsed to zero ids returned the full unfiltered listing**, because
    an empty array reads identically to "no filter" downstream. It now short-circuits to an
    empty page; `ids` genuinely absent still means unfiltered.

  The regression test is worth a note of its own: written first as a click-then-click-back, it
  could not distinguish fixed code from buggy — for any two-click flip-back the stale snapshot
  coincides with the second click's target. It only exposes the bug as a same-target double
  fire.

- **Web wave F — playlists: done (`f143107`, merged `d090a95`; pagination `2d30008`).** List,
  view, create, add to and remove from playlists, and play one. Two Jellyfin facts shaped it,
  both verified against `PlaylistsController.cs`:
  - **There is no list-playlists route.** A playlist is a `BaseItemKind`, so listing reuses
    `/Items?includeItemTypes=Playlist&recursive=true` like every other item kind here.
  - **Removal keys on `PlaylistItemId`, a per-entry id distinct from the track's own `Id`** and
    set only by `GetPlaylistItems`. That is what lets one of two identical tracks be removed
    rather than both or neither. Add, by contrast, keys on item ids — the asymmetry is real.

  Playlist order needs no sort parameter: the handler builds from the playlist's own stored
  `LinkedChildren` and never goes through the sort machinery that made album pages alphabetical.
  Pinned by tests at the client and route layers anyway, each seeding **out of natural id
  order** so the assertion cannot pass by coincidence. Playing a playlist reused the album
  queueing untouched — it only ever needed a list of tracks — so the player boundary was never
  crossed. Review caught that the page shipped without pagination, hiding the 40-track limit
  worse than the album page it borrowed from; fixed by reusing that page's existing
  `summarizePage` helper.

- **Android wave D — music search: done (`4eaa78c`, merged `18bced1`; fixes `0de5a31`,
  `6246aa0`).** Debounced query, three result sections, and the same decision the web client
  made: a track result navigates to its album rather than playing, since a search result
  carries no track list to build a queue from; a track with no album id is non-interactive
  rather than a dead target.

  **Its stale-response test turned Android CI red for three commits, and the two obvious
  diagnoses were both wrong** — worth recording in full, because the failure mode is not
  specific to search:

  - Widening the teardown sleep did nothing; it was never a teardown-timing problem.
  - Adding a sequence-number guard to the ViewModel did not fix the test either — though it
    **is** a real fix and was kept. Cancellation cannot stop a resumption from an
    already-completed _blocking_ OkHttp call inside `withContext(Dispatchers.IO)`: what
    cancellation stops is the resumption onto Main, so a resumption already queued before
    `cancel()` runs still writes. The sequence check closes that outright.
  - The actual cause was in the test: **`MockWebServer` serves enqueued responses in the order
    requests arrive at the socket, not the order they were enqueued.** Two concurrent real
    requests raced, and whichever connected first took the other's body — a content mismatch
    with nothing to do with staleness. Fixed with a `Dispatcher` keyed on the request's own
    `term` parameter, so a response is bound to its query rather than to arrival order.
  - **And the assertion was a tautology.** `uiState.first { it is Results }` returned the
    instant the fast response landed, before the slow one had arrived at all — so it would have
    passed with the production guard deleted. Any test asserting "X never overwrites Y" has to
    keep observing _past_ the moment X could arrive.

  Mixing `runTest`'s virtual time with `MockResponse.setBodyDelay`'s real wall-clock time is
  the underlying trap: a test that needs a real background thread to reach a point _before_
  virtual time advances cannot express that ordering, only hope for it.

- **Android wave E — favourites: done (`6e90595`).** Toggles on album header, track rows and
  artist header, plus a favourites screen. **Playlists were deliberately deferred** and not
  started — the wave was already large and a clean partial beats a shaky whole. Optimistic
  toggling is guarded by a **per-item generation counter** captured synchronously before the
  only suspension point and re-checked at both the success and failure write sites, which is
  the same mechanism `MusicSearchViewModel` uses and closes the same race the web client
  shipped once.

- **Web wave G — shuffle, repeat, cross-page queue: done (`58cc2d3`, merged `788bbd9`).** The
  three gaps this section recorded as deliberate are closed, and the reason they existed is
  worth keeping: the player had **no ordered play-list at all**. Album tracks were laid end to
  end on the same cumulative `startOffset` timeline multi-file audiobooks use, and "what plays
  next" was derived from position on it — a representation that cannot express shuffle (which
  breaks "tracks are already in play order"), repeat, or a queue beyond the page on screen.

  The fix adds an explicit queue **alongside** that timeline rather than replacing it: a
  canonical order that only ever grows, a permutation describing play order, and a cursor.
  Shuffling rewrites only the permutation after the cursor, so the current track is untouched
  and unshuffling restores the original order exactly, including tracks already passed.
  `startOffset` keeps the job it is genuinely good at — resolving a position _within_ the
  playing item.

  **Audiobooks and podcasts are untouched by construction**: the ended-track override defaults
  to `null`, is always reset by `load()`, and is set only by the two music call sites, so a
  book runs the pre-existing logic. A regression test pins that reset contract.

  Cross-page fetching is **lazy** — the queue asks for more only when playback reaches the
  loaded edge — so an album that fits on one page fetches nothing extra and a large "play all"
  never blocks playback starting. Repeat's three states use a dynamic `aria-label` plus a
  boolean `aria-pressed`, since `aria-pressed` cannot carry three states; the label is what
  distinguishes "all" from "one" for assistive tech.

  **Review found one real bug in it, fixed in `42cb5cf`**, and it is the kind worth
  recognising: `jellyfinSource` captured the track list **once at construction**, while
  shuffle, cross-page append and repeat-all's reshuffle all replace `playerStore.tracks`
  without reconstructing the source. So exactly the three behaviours this wave added were
  reporting the **wrong item id and position** to Jellyfin — and because `trackAt` has no
  upper bound against a track's own duration, a stale shorter list does not fail loudly, it
  keeps resolving to its last track forever with the position running past that track's real
  end. Silent corruption of play history for a track that is not audible. Nothing caught it
  because the queue's unit tests never touch `playbackSource.ts` and the e2e spec asserts
  control state, not reporting.

  The reporter now takes a **getter** rather than an array, so it reads the live list at tick
  time. Refreshing the source alongside every `setTracks` call was rejected: it leaves the same
  forgettable-second-call shape that caused the bug. `features/music/queue.ts`'s dead
  `albumQueue` was deleted in the same commit.

- **Android wave F — playlists: done (`ad2f9f8`, merged `a1cb367`; test fix `67b3ee0`, merged
  `101ad19`).** Android reaches web parity on playlists: browse, create, add a track or a whole
  album, remove, and play. The Jellyfin facts web wave F established were reused rather than
  re-derived — removal keys on the per-entry `playlistItemId`, add keys on plain item ids,
  order comes from the playlist's stored `LinkedChildren` with no sort parameter — and the BFF
  routes already existed, so this wave was client-only.

  It went red on CI once, on a failure class worth knowing: six tests collected one-shot
  `SharedFlow` events with `launch { … collect … }`, which subscribes too late to see an
  emission from a synchronous unconfined action. `docs/HANDOVER.md`'s Android test section has
  the full account and the `async(UNDISPATCHED)` fix. Review also turned up two things fixed in
  the same commit: no test covered the _reason_ removal keys on `playlistItemId` (the same
  track appearing twice), and the optimistic rollback re-inserted at a numeric index captured
  before the suspension point, so a page landing in between could restore the entry at the
  wrong position — it now anchors to the preceding entry's id instead.

  Left out deliberately: no pagination on the add-to-playlist picker (mirrors `FavoritesViewModel`),
  and no playlist rename or delete.

- **Android wave G — Jellyfin progress reporting: done (`e0c183a`).** Music played on Android
  now reports start, periodic progress and stopped, so play state and resume position survive
  leaving the phone. The decision logic sits in a plain-Kotlin `JellyfinPlaybackReporter` tested
  against a fake sender, with the Media3 `Player.Listener` wiring kept deliberately thin — the
  same split the web reporter uses, and the reason the logic is testable at all on a machine
  with no Android SDK.

  Two web-side lessons were carried over rather than re-learned: `reportPlaybackStart` has no
  `isPaused` field, so a paused track must keep sending progress reports carrying
  `isPaused = true` or Jellyfin shows it playing forever; and reporting is gated to music items
  only, by the `track:` mediaId prefix that distinguishes them from `PlaybackItemResolver`'s
  `book:`/`episode:` schemes, so audiobooks and podcasts keep reporting to Audiobookshelf
  through their own untouched path.

- **Android wave H — shuffle and repeat: done (`ce15dc2`, merged `dc54085`; fix `f01409f`).**
  The web equivalent needed a canonical order, a permutation and a cursor built from scratch;
  Android needed none of it. Media3 already owns queue, shuffle and repeat, so this wave is
  `Player.shuffleModeEnabled` / `Player.repeatMode` plus the two listener callbacks that report
  them back, and the only real logic is which mode a tap moves to next. State is read from the
  controller rather than written optimistically at click time, so the UI cannot drift from what
  the player actually holds.

  The controls are hidden unless the current item is music, reusing
  `jellyfinItemIdFromMediaId`'s `track:` prefix gate rather than a second copy of the rule —
  shuffling a multi-file audiobook would be actively harmful. Repeat's three states get a dynamic
  content description, since a boolean toggle semantic cannot carry three; the shuffle control is
  a genuine two-state toggle and uses ordinary `Role.Switch` semantics.

  **A decision, not a defect:** with `REPEAT_MODE_ONE`, each loop fires
  `onMediaItemTransition`, so the Jellyfin reporter sends a stopped-then-start pair for the same
  track. Independent review flagged this as spurious. It is kept deliberately — a repeat _is_ a
  fresh play of that track, and Jellyfin's play history should record it as one. Suppressing it
  would make repeated plays invisible.

  CI caught one defect review had misread: `nextRepeatMode`'s unknown-mode branch returned
  `REPEAT_MODE_OFF` while its own doc comment and test said the value is _treated as_ off — which
  means the tap should yield `ALL`. A tap from an unknown mode therefore did nothing. Fixed in
  `f01409f`; worth noting that a reviewer reading for intent read the branch as already correct,
  and only running it settled it.

- **Android wave I — cross-page album and playlist queueing: done (`731cdcf`).** "Play album" used
  to queue only the loaded 40-track page, so a 60-track album stopped two thirds of the way
  through; the same applied to playing a playlist. The queue now covers every track.

  Fetching is **lazy and non-blocking**, the same constraint the web wave settled on: playback
  starts from what is already loaded, and the remaining pages are appended to the live Media3
  queue with `addMediaItems` as they arrive. An album that fits on one page fetches nothing extra
  and a large "play all" never delays the first note. Capped at `QUEUE_APPEND_CAP = 2000` tracks;
  at the cap the append simply stops and what is queued keeps playing.

  The risk this wave introduced is a **stale-append race** — start album A, start album B while
  A's background fetch is still running, and A's late pages must not land in B's queue. Guarded
  by a generation counter captured synchronously before the first suspension point and re-checked
  immediately before every `addMediaItems` call. That is the same mechanism the favourites waves
  use, and independent review traced it as correct — but it landed with no test, and
  `PlayerViewModel` had never had a test file at all. A follow-up wave closes that.

  A page fetch that fails is non-fatal by construction: the append loop returns, playback
  continues on what is queued, and nothing retries. Pinned by a test asserting exactly one fetch
  call, so a retry loop would fail it.

- **`PlayerViewModel`'s first test file (`ce080fe`).** Wave I's stale-append guard was the
  highest-risk logic in the music feature and had no test, because `PlayerViewModel` had never
  had a test file at all. The obstacle was concrete: `ResolvedPlayback.toMediaItem()` calls
  `MediaItem.Builder.setUri`, which reaches `android.net.Uri.parse` and throws under the unmocked
  test `android.jar`, and `playQueue` converts its whole queue before touching the controller —
  so no controller-only fake could get past it.

  Two narrow seams fix that: a `PlaybackHandle` interface covering exactly the commands the
  ViewModel issues (with a thin adapter over the real `MediaController`), and an injectable
  `MediaItem` conversion. Both default to the previous behaviour, `connectedController()`'s own
  service connection and listener wiring are untouched, and the production call site passes
  neither. The real guard code now runs under test.

  The headline test parks album A's page fetch on an incomplete deferred, starts album B, then
  releases A's page and asserts A's tracks never reach the player — and it asserts the release
  actually happened, so it cannot pass by returning early. Deleting the generation check makes it
  fail, which was verified by tracing the path rather than taken on the author's word.

  Worth knowing for the next Android test that needs a framework class: this is the first one
  here to construct one (`ContextWrapper(null)`), and `app/build.gradle.kts` sets no
  `testOptions.unitTests.returnDefaultValues`, so unstubbed `android.*` methods throw. It works
  because the wrapper's constructor is a field assignment and `context` is never dereferenced on
  the tested path — not because the stub jar is lenient.

- **Android wave J — synced lyrics view: done (`24d01bb`, merged `54b1335`).** Android reaches
  parity with web's lyrics view; the BFF route already existed, so this was client-only.
  Independent review found no defects.

  Two things worth carrying forward. **`lyrics: null` is a normal outcome, not an error** — the
  BFF deliberately folds Jellyfin's "no lyrics" 404 into a `200` with a null body, and the Android
  path models that as a distinct non-error state all the way to a calm "No lyrics for this track"
  message. Anything else here would surface a missing-lyrics track as a failure.

  **The highlight needs a much finer clock than the reporter does.** The existing 15s Jellyfin
  progress ticker is far too coarse to follow a lyric line, so lyrics get their own 200ms position
  flow — cold, started only by the screen collecting it, and stopped by ordinary structured
  concurrency when the screen leaves composition. Raising the reporter's own rate instead would
  have multiplied upstream traffic by roughly fifty for an unrelated reason.

  Auto-scroll follows the active line unless the user is touch-dragging or within 3s of stopping.
  That distinction is safe because Compose's drag interaction source reports genuine gestures
  only, never the screen's own `animateScrollToItem` — had it reported both, auto-scroll would
  have disabled itself permanently after the first line change. The active line is distinguished
  by weight and size as well as colour, and there is deliberately no live region: a highlight that
  moves every few seconds would make a screen reader unusable.

  `activeLineIndex` is a pure function ported from web's own, with the same boundary semantics,
  and is tested at exact positions — on a line's start time, just before the first, past the last,
  empty, single, and unsynced — rather than merely asserting that some line is active.

- **Android wave K — music requests on Android: done (`93908ee`, merged `c2aa038`).** Mirrors the
  existing Android book-request feature against the music-request routes that landed server-side
  the same day. Search a provider, submit a request, and see the list with its real statuses.

  Two contract details differ from the book pipeline and are easy to get wrong: search errors are
  keyed by **`providerId`**, not `indexerId`, and a request row carries the **`candidate`** frozen
  at creation rather than a `release`. There is no title-only request path — the server requires a
  candidate — so the client offers none.

  **Status labelling is deliberately literal.** `importRequested` is a real terminal status,
  distinct from `completed`, which exists precisely because the Jellyfin rescan confirmation a
  true "completed" would need does not exist yet. The UI shows it as itself, and a failed request
  shows its `statusDetail`; nothing is relabelled into something friendlier that would make a
  stuck request look fine. Retry is offered only from `failed`, matching the server's own
  transition table rather than a guess.

  Nothing is written optimistically — every mutation updates state from the server's response — so
  the generation-counter pattern the favourites and queue waves needed does not apply here.

  One gap left open, judged small: the book path has a stale-search-cancellation regression test
  and this one does not. The cancellation code was verified as structurally identical to the
  tested original, so the risk is confined to a future edit that touches only the music path.

- **Three review-flagged Android test gaps closed (`3a63115`).** Test-only; all three pieces of
  production code were already correct and were re-verified rather than changed.

  The music-request search now has the stale-cancellation regression test the book pipeline
  already had. Writing it turned up something worth knowing about this suite's own conventions:
  the shared `UnconfinedTestDispatcher` these tests normally inject as both `Main` and
  `ApiClient`'s IO dispatcher makes `withContext` run **inline**, so a "slow" request would block
  the caller instead of racing a second one — the race is unobservable under the very dispatcher
  the rest of the file depends on. This one test therefore uses the real `Dispatchers.IO`
  deliberately, as the book original does.

  The book original was checked rather than assumed, since a test that races is exactly where a
  latent flake hides: it is sound. It calls `takeRequest()` after firing the slow search, which
  blocks until that request has actually reached the server, forcing arrival order to match
  enqueue order — so `MockWebServer`'s "responses follow arrival, not enqueue" trap is closed by
  synchronisation rather than by luck, and no keyed `Dispatcher` is needed.

  Also closed: a literal `book:`-prefixed id in the reporter's music-gate coverage (it had
  `episode:` and a bare id but not the scheme audiobooks actually use), and the first
  ViewModel-level tests for wave H's `isMusic` gate and the shuffle/repeat commands.

  **One thing deliberately left unreachable.** `onShuffleModeEnabledChanged` /
  `onRepeatModeChanged` are registered inside `connectedController()`, which the test seam
  bypasses, so a listener-driven state update cannot be exercised without widening production
  surface. Rather than paper over it, the tests pin what the code actually does: the commands
  reach the handle and do **not** write UI state themselves, and play seeds shuffle/repeat from
  the handle's real state rather than a default.

**The Android favourites wave cost four red-CI iterations**, all one failure class, now fixed
structurally in `6644ff6` + `ef98321`: `ApiClient` did its work in a hard-coded
`withContext(Dispatchers.IO)` that the test scheduler could not see, so tests returned with
requests still in flight and the resulting throw surfaced as `UncaughtExceptionsBeforeTest` on
whichever unrelated test ran next. The reported failure never named the culprit, which is why
three point fixes each moved the failure instead of removing it. `ApiClient` now takes its
dispatcher as a parameter defaulting to `Dispatchers.IO`. **`docs/HANDOVER.md` carries the full
account and what it means for writing any future Android ViewModel test** — read it before
touching one.

- **Music requests — server side: done (`a6ae38b`, `a7ec008`, merged `51c5613`).** A full slskd
  client, a `music/registry.ts` mirroring `indexers/`/`download/`, credentials in
  `provider_configs` under a new `kind: 'music'`, the existing `/providers` routes extended to
  list/configure/test slskd, and `GET /music-requests/search`. Verified against slskd's own
  source: auth is `X-API-Key`, and **search is asynchronous** — `POST /searches`, then poll —
  which shapes the whole client.

  **slskd does not fit `IndexerProvider`/`DownloadClientProvider`** and was not forced into
  them: it unifies search and download in one upstream with no magnet, URL or seeder concept.
  It gets its own `MusicRequestProvider` interface reusing the existing download-option and
  status types.

  **Create and list are deliberately absent, and this is the blocker for the rest.** The
  `requests` table has no column distinguishing a music request from a book one, and
  `GET /requests` filters only by status — so a music row written there would appear in the
  book list. The fix is a `media_type` column defaulting to `'book'`, or a sibling table; it
  needs a schema change. The provider's download half (`add`/`status`/`remove`) is built and
  tested and is unreachable over HTTP only because nothing persists a request yet.

  Known and documented in code: `artist`/`album` are path heuristics, since slskd's file DTO
  carries neither; `contentPath` is always `null` because slskd never reports a resolved local
  path; `remove(deleteData: true)` only untracks; and a poll hitting its ceiling is
  indistinguishable to the caller from a genuinely empty search. Two things could not be
  verified against source and are flagged in the file: the JSON casing (framework default, not
  a captured response) and `AverageSpeed`'s unit.

  **Still open, and the user's to settle**: they already run `deemix`, which cuts against the
  slskd decision. The pluggable interface is what makes that reversible — deemix would be a new
  file, not a refactor — but it is worth asking before building the UI on top.

- **Music requests — persistence: done (`d1152c1`, merged `8983546`).** `requests` gained
  `media_type` (existing rows default to `'book'`) and a `candidate_json` column, rather than a
  sibling table: every other column on that table already means the same thing for a track as
  for a book, and only the payload genuinely differs — a slskd candidate has no seeders, magnet
  or download URL, so storing one under `Release`'s type would be a type lie. Book and music
  routes each reject the other's request ids, so one shared table cannot cross-contaminate the
  two pipelines. The migration is tested against a database that **already has book rows in
  it**, not only against a fresh schema.

  **Music requests stop at `downloading`.** They flow through the existing status pipeline as
  far as that, then stop — there is no Jellyfin rescan capability in this codebase the way a
  book grab has Audiobookshelf's `scanLibrary`, so slskd's transfer states have nothing to map
  onto past that point. That import step is the remaining gap, and it needs a Jellyfin library
  refresh before it can be built.

  `GET /music-requests` deliberately inherits the unscoped-by-caller behaviour `GET /requests`
  already has, rather than diverging music from books on a decision that is the user's.

- **Music requests — web UI: done (`12ec3eb`, merged `f5c8e1e`).** Search, request and a status
  list at `/music/requests`, reached from Music home. Two things it presents honestly rather
  than prettily, both worth keeping:
  - A slskd search runs **synchronously server-side for up to ~17s** with no separate progress
    signal, so the page distinguishes in-flight from settled-empty through a tested pure
    function rather than rendering an unfinished search as "no matches" — the same mistake
    `/search` had to fix once.
  - A music request really does end at `downloading`, so it shows a plain note saying Jellyfin
    needs a rescan, **not** a progress bar. There is no `pollDownloads` for music, so a bar
    would sit frozen at 0% and imply completion was coming.

  An unset or invalid save path surfaces slskd's own actionable message verbatim rather than a
  raw upstream error — slskd's destination is relative-only, so an absolute path is rejected
  before it ever reaches the upstream.

  **A latent gap it found in the book path, not fixed:** `useGrabRequestMutation` is never
  called for books either, so a request that reaches `approved` by any route other than the
  UI's own create/approve action has no grab affordance. The music UI works around it by
  chaining create/approve straight into `grab()`; books have no such chain.

- **Music requests — Jellyfin rescan: done (`6dfcafb`, merged `8ae8448`).** A music request can
  now advance past `downloading`, because the Jellyfin client can ask for a library refresh the
  way a book grab asks Audiobookshelf. Scoped to the music library folder rather than the whole
  server: refreshing a `CollectionFolder` cascades to its children, so it picks up newly
  downloaded files without rescanning unrelated libraries.

  **The terminal state is `importRequested`, not `completed`, and that distinction is the whole
  point.** Verified against `LibraryController.cs`/`ItemRefreshController.cs`: Jellyfin's
  refresh is genuinely fire-and-forget — it enqueues a task and returns — and **there is no API
  to observe scan progress or completion at all** (`IProviderManager.GetRefreshQueue()` exists
  but is wired to no controller). So "the file is in your library" is a claim this code cannot
  support, and it does not make it. Failure paths land in the same state with a static note
  that never echoes an upstream message.

  **A real product limitation, tested rather than hidden**: both refresh endpoints require
  `Policies.RequiresElevation`, so a **non-admin** connected Jellyfin account 403s on every
  call. Worth knowing before wondering why a rescan silently never happens.

  **An inherited gap this surfaced, not fixed**: `pollDownloads` is not wired to any scheduler
  in production, for books or music. Nothing advances a request's download state on its own.

**Android wave L — per-track artist: done (`2c1b476`).** This was recorded here for a long time
as a product caveat awaiting a decision, on the grounds that the track model had no per-track
artist to read. That reasoning was wrong: `normalize.ts` sets `artistNames` per track and it
already reached `JellyfinTrack` on Android — the queue builder simply dropped it. So a
compilation credited the album artist on every track's lock screen, notification and Android Auto
entry, and no decision was needed to fix it.

The fallback is `track.artistNames ?: queue-level artist`, joined with the same `", "` convention
the playlist and search models already used, and an empty list becomes `null` rather than `""` —
an empty string is non-null and would have defeated the fallback, producing a blank artist line,
which is worse than the bug being fixed. The append path needed no separate fix because
cross-page appending routes through the same queue builder; that was verified rather than assumed.

The regression test uses a track artist that genuinely differs from the album artist
(`"Led Zeppelin"` against `"Various Artists"`), so it cannot pass with the fix reverted — the
failure mode two earlier tests in this repo shipped with.

**Web is fixed too (`226fcd5`)**, the same way and for the same reason, threaded through
`playerUi.ts`, `NowPlaying`, `MiniPlayer` and `useMediaSession` — fixing the queue alone would
have left the OS lock screen still reading the album artist, which is the visible symptom.

**Everything that paragraph used to list as a deliberate gap has since shipped** — the
cross-page queue, shuffle and repeat, the synced-lyrics view, playlists, favourites, music
requests, and music on Android, which now has browse, search, playback, favourites, playlists,
shuffle/repeat, progress reporting and requests of its own.

**What is genuinely left in phase 9:**

- ~~`pollDownloads` is wired to no scheduler~~ — **fixed (`a0f849b`, merged `2570bdd`).** It
  existed and was tested for both pipelines but had no caller in production, so a request that
  reached `downloading` stayed there forever while the UI looked alive. Now driven by a poller
  owned by `buildServer` and stopped from an `onClose` hook, so it cannot outlive a test's app
  or leak a timer into the next suite; auto-start is gated on `nodeEnv`. Interval is
  `AURALIS_DOWNLOAD_POLL_INTERVAL_MS`, default 30s. Book and music pollers each run in their own
  try/catch within a tick, so one pipeline failing neither blocks the other nor stops future
  ticks — a poller that dies silently on the first error would be worse than none, because the
  UI would still look alive. Not yet verified against a real slskd or qBittorrent under load.

**Phase 9 is done (2026-08-06).** Every wave listed above shipped on both surfaces, and the
last open item in the list above — `pollDownloads` having no scheduler — is fixed. Three things
stay open and are deliberately _not_ phase-9 work:

- **Lyrics search** is blocked on a product decision (index only what the server has, or also
  backfill from an external provider, which carries a privacy opt-in). Not effort-bound.
- **The download poller is unverified against a real slskd or qBittorrent under load** — it is
  tested, wired and running, but only against fakes.
- **A music request's import can never be confirmed**, by design: Jellyfin exposes no API to
  observe scan progress, so `importRequested` is the honest terminal state.

### What is actually left, as of 2026-08-06

Phase 10 has shipped its bundle budget, Lighthouse budgets, `arm64` publishing, release
automation, two accessibility passes and the web design comparison. **Two things remain**, and
neither is startable from this machine by a session reading this now:

- The accessibility audit's last surfaces — the podcasts UI and a full keyboard tab-walk — were
  claimed by a concurrent session on 2026-08-06. Check `docs/HANDOVER.md`'s claim list before
  touching them.
- **The Android half of the holistic `DESIGN.md` comparison has not been done and cannot be
  done here**: no JDK, no Android SDK, no emulator. It needs either a machine with the SDK
  installed or a real device. Do not substitute a source-level reading for it — the web pass
  showed that reading source and screenshots produced a confidently wrong headline finding that
  measuring the live DOM overturned.

Phase 11 is **blocked on a decision only the user can make**, not on effort — see below and
`docs/HANDOVER.md`.

### 10 — Release polish

Performance budgets enforced in CI (bundle size, Lighthouse on the desktop and mobile
layouts), a full accessibility audit, and the rest of the release story. CI already
publishes `linux/amd64` images to GHCR (`ghcr.io/patakihara/auralis:latest` and
`:${{ github.sha }}`) on every green build of the working branch, which is what
`compose.yaml` and a server-side Watchtower pull from.

**`arm64` is done (`ci.yml`'s `publish` job, 2026-08-06).** `docker/setup-qemu-action` now
precedes buildx — the order matters, because buildx enumerates the platforms it can emulate at
startup and registering binfmt handlers afterwards leaves it advertising amd64 only — and
`platforms:` is `linux/amd64,linux/arm64`. Both architectures land under one tag as a multi-arch
manifest list, so `:latest` keeps meaning what it meant: a client pulls the image matching its
own architecture, and nothing in `compose.yaml`, `docs/SELF_HOSTING.md` or the Watchtower setup
on mediaserver changes. A Pi or an arm64 NAS is now a supported target rather than an
aspiration. The emulated half makes `publish` the slowest job in the workflow by a wide margin;
that is accepted rather than worked around, since it falls only on `main` pushes and is cached
between runs.

Verified on the registry rather than on a green job: `ghcr.io/patakihara/auralis:latest` is an
OCI image index listing `linux/amd64` and `linux/arm64` (plus buildx's two attestation
manifests), pulled anonymously from GHCR on 2026-08-06.

**Adding it exposed a second, worse bug, now fixed in the same file.** `publish` was cancelled
on three consecutive runs and nobody would have noticed: `concurrency.cancel-in-progress` was
`true` for every branch, so a superseded run took its `publish` job down with it, and `publish`
is coupled to a live deployment — mediaserver auto-updates from `:latest`. Under back-to-back
pushes the registry silently stops updating while every run still reports green, because the
cancelled jobs are not the ones anyone reads. `arm64` widened the window sharply, since the
emulated build made `publish` by far the longest job here. `main` now queues rather than
cancels; every other branch is unchanged. **The general shape is worth remembering: a job
coupled to a deployment must not be cancellable by the next push, and a cancelled job is not a
failed one, so nothing in the UI calls it out.**

**Release automation is done (`.github/workflows/release.yml`).** A pushed `v<x.y.z>` tag —
optionally with a prerelease suffix — validates the version, builds the same multi-arch image,
pushes it as `:<version>` and `:stable`, generates a changelog from `git log <prev-tag>..<tag>`,
and creates a GitHub Release with the Android APK attached.

**It is additive, and that is the whole design.** `:latest` still means what it always meant —
written by `ci.yml`'s `publish` on every green `main` push, which is what the user's own
Watchtower follows. Changing that would have changed what runs on a live box tonight, so
releases got their own channel instead: `:latest` for continuous, `:stable`/`:<version>` for
tagged. `docs/SELF_HOSTING.md` documents both and the one-line compose change to switch.

Details worth not rediscovering:

- **`fetch-depth: 0` on the release job only.** `actions/checkout` defaults to a shallow,
  tagless fetch, which would make `git describe --tags` and the `<prev>..<tag>` range silently
  wrong rather than loudly broken. Only the job that reads history sets it; the build jobs do
  not need it and do not pay for it.
- **A malformed tag fails before anything is built.** `v1.2`, `1.2.3` and `v1.2.3.4` are
  rejected by a gating job, so a mislabelled image is never pushed in the first place.
- **The APK is debug-signed**, identical to what `android.yml` already produces, and the
  release notes say so. Release signing is one of the irreversible decisions phase 11 leaves
  to the user — see `docs/research/FDROID_DISTRIBUTION.md`.
- **Nothing has been tagged yet.** The workflow has never executed; a static review checked the
  mechanics against `ci.yml`'s `publish` job, but the first real tag is still the first real
  test.

A final holistic pass of the `docs/DESIGN.md` reference-app comparison belongs here too —
not just the per-surface checks noted against phase 7's waves above, but the whole app,
web and Android together, side by side with YouTube Music and Symfonium one more time before
release.

**The Android half of the holistic comparison is done, as a source-level audit
(`docs/research/ANDROID_DESIGN_AUDIT.md`), and it turns up more than the per-surface checks
above ever surfaced.** No JDK/SDK/emulator exists on this machine, so nothing here is a visual
verification — every claim is labelled source-verified (read directly, or a whole-tree grep
proving a pattern's absence) or inferred, per the same honesty convention
`docs/research/WEB_DESIGN_AUDIT.md` used. Three structural gaps, all confirmed from source
rather than assumed: **there is no full Now Playing surface at all** — `MiniPlayerBar` (94
lines: a title and text play/pause/shuffle/repeat/lyrics buttons) is the entirety of Android's
playback UI, with no artwork, no seek bar, no split-view, self-acknowledged in the app's own
doc comments as unbuilt; **there is no persistent navigation shell** — every one of the 16
screens is an independent `Scaffold`+`TopAppBar` reached by pushing onto the back stack, no
`NavigationBar`/`NavigationRail` exists anywhere, and the mini player is wired into only
`HomeScreen`'s own `Scaffold`, so it vanishes the moment you navigate anywhere else while
something plays; and **only colour is themed, and it's the wrong colour model** — Android uses
wallpaper-derived Material You dynamic colour, not the artwork-derived
`@material/material-color-utilities` pipeline `DESIGN.md`/Symfonium call for, while type, shape
and the whole spring-motion table are entirely unwired (`MaterialTheme(colorScheme = ...)` is
the one call site, no `typography`/`shapes` argument). Most of the smaller, surface-level
divergences (every control rendering as `TextButton` rather than `IconButton`, no back-arrow
icons anywhere) trace to one repeated, documented decision: `material-icons-extended` was never
added as a dependency, out of caution over an unconfirmed glyph set. **One fix was made, in the
only class safe to apply blind**: `LyricsScreen.kt`'s active/inactive lyric line size was two
hardcoded `fontSize` literals, the single instance in the entire tree not using a
`MaterialTheme.typography` role that every sibling screen already uses — changed to reference
the theme's own `titleLarge`/`bodyLarge` roles, which needed no rendered check because it
swaps which existing token applies rather than inventing a new visual value. Two product-scope
questions named for the user rather than decided: Android's search is Jellyfin-music-only where
web's is unified across books/podcasts/music, and Android has no Settings screen at all. Every
genuinely visual finding — building a real Now Playing surface, a persistent nav shell, an
artwork-derived theme — is named and left for a session with a device or emulator, per this
wave's own constraint that a source-level reading must not be mistaken for a visual one.

**The web bundle-size budget is done.** `scripts/bundle-budget.mjs` measures
`apps/web`'s production build straight from `dist/index.html` and `dist/assets` (entry
chunk vs. every lazily-loaded route, both raw and gzip, plus a per-chunk ceiling on the
largest lazy chunk so one page can't quietly balloon under the total budget's slack) and
compares it against `scripts/bundle-budget.config.mjs`, which carries the reasoning for
every number in its own doc comments. Wired into `ci.yml` as the `bundle-budget` job,
gating `publish` alongside the other jobs that can say a build is wrong.

Baseline measured 2026-08-05 (commit `9c162c2`): entry chunk 949 KB raw / 248 KB gzip,
total bundle 1043 KB raw / 284 KB gzip, largest lazy chunk (`SettingsPage`) 13.3 KB raw.
Route-level code splitting already existed (`apps/web/src/router/routeTree.ts`'s
`lazyRouteComponent` on every leaf route) — nothing to add here. Worth a look, not fixed in
this wave since a budget change and a bundle refactor in one commit would make neither
reviewable: the entry chunk is Mantine + React + react-query + the router + zustand +
`material-color-utilities`, all eagerly bundled together because the app shell
(`RootLayout`) uses `@auralis/ui` components directly rather than lazily — undifferentiated
today, but a candidate for `manualChunks` vendor splitting later if cache-busting on
unrelated app-shell changes ever becomes a real cost.

**The Lighthouse performance budget is done**, the other half of "performance budgets" this
phase names. `scripts/lighthouse-budget.mjs` boots the built web app the same way
Playwright's `webServer` does (`AURALIS_FAKE_UPSTREAMS=1`, `DATA_DIR=:memory:`, its own port
so a local `pnpm test:e2e` run can coexist with it), launches a real headless Chrome via
`chrome-launcher` using the Chromium binary Playwright already manages (there is no system
Chrome, locally or on the CI runner), and audits `performance` for both `desktop` and
`mobile` form factors — Lighthouse's own `desktop-config.js` preset for the former, its
default (simulated slow 4G, 4x CPU throttle) for the latter. Each form factor runs three
times by default and every metric is judged on the **median**, with the observed min/max
reported alongside, because Lighthouse's own timing metrics turned out to be genuinely noisy
on this hardware — see below. `scripts/lighthouse-budget.config.mjs` carries every budget
number's reasoning the same way `bundle-budget.config.mjs` does. Wired into `ci.yml` as the
`lighthouse-budget` job (needs `playwright install --with-deps chromium`, unlike
`bundle-budget`), gating `publish` alongside every other job that can say a build is wrong.

Baseline measured 2026-08-06 (commit `814a595`), audited against `/` only — a fresh
in-memory server starts unconfigured, so that URL serves the onboarding/setup screen, not
the authenticated library/home experience, and the fake upstreams respond near-instantly
from the same process, so this says nothing about real-network latency either. Desktop:
score 0.95, FCP/SI 1.1s, LCP 1.2s, TBT ~0ms, CLS 0. Mobile: score ~0.6, FCP/SI ~6.1s, LCP
~6.6s — reflecting an un-code-split ~705KB main JS chunk (see the bundle-budget entry above)
parsed and executed under simulated 4x CPU throttling, not something this wave fixed.

**Total Blocking Time under mobile's simulated throttling was far noisier than everything
else measured**, worth recording so a future CI failure here isn't mistaken for a regression
on sight: the 5-run baseline had TBT at a tidy 27–31ms, but repeated re-verification of the
_same unchanged build_ on the _same machine_ kept finding worse individual samples than the
last check had (112ms, then 351ms, then 940ms), with mobile's performance score — downstream
of TBT — dipping as low as an individual sample of 0.39 along the way. That escalating
pattern is itself the finding, not a series of regressions: Lighthouse's simulated throttling
models a 4x CPU slowdown on top of whatever the real CPU was doing that millisecond, so
ordinary scheduling jitter on the host gets amplified 4x into the metric, and chasing a
"worst observed sample" on a distribution that heavy-tailed has no fixed stopping point.
What stayed stable across every one of those same re-verification runs was the **median of
three runs** — the number `evaluateBudget` actually gates on, never the max — which held in a
consistent band (TBT medians at or under ~310ms; mobile score medians at 0.55 or above) even
while individual samples swung far wider. The shipped budget (`tbt: 600`, `score: 0.5` on
mobile) sits with real margin above that median range, not above any one sample; see
`scripts/lighthouse-budget.config.mjs`'s own comments on `tbt` and `score` for the full
run-by-run detail. If `lighthouse-budget` ever goes red in CI, the first move is `--runs 7` or
more locally to see whether the _median_ moved, not to assume the app regressed from one red
run.

**Entry-chunk wave — done (`a25d2ea`).** The candidate flagged next to the bundle-size
baseline above (manualChunks vendor splitting, or making the shell itself lazier) was picked
up. `RootLayout.tsx`'s `Shell` import — nav chrome, mini player, the full Now Playing sheet
and everything it reaches (chapters, lyrics, sleep timer, bookmarks) — moved from a static
import to `lazy()`, since none of it is needed for the page this budget actually audits (a
fresh unconfigured server's onboarding/setup screen never renders `Shell` at all) and `AuthGate`
already shows a loading spinner on every page load before `children` is reached, giving a
pre-existing async gap to load it in. Measured (`node scripts/bundle-budget.mjs`): entry raw
949.5 KB → 887.3 KB (−6.5%), entry gzip 248.1 KB → 230.7 KB (−7.0%); `Shell`'s own chunk
(34.1 KB raw) is now the largest lazy chunk, comfortably inside budget. Both budget configs
were tightened to the new, real numbers in a separate commit (`docs/HANDOVER.md`'s "do not
touch" scope kept that split — a budget change and a bundle refactor in one commit make
neither reviewable), not just left at the old, looser ones.

**`manualChunks` vendor splitting was tried and rejected, not merely left undone.** Splitting
`react`/`@mantine`/`@tanstack`/`zustand` into separate vendor chunks measured **zero**
first-paint benefit under Lighthouse (mobile score and every timing metric held within
existing run-to-run noise) — expected, since every one of those packages is still on the
entry critical path for the audited page, so five smaller chunks are still five chunks the
browser must fetch and parse before anything renders. It also broke `scripts/bundle-budget.mjs`'s
own measurement, which treats only the `<script type="module">` tag in `index.html` as "entry"
and has no notion of the `<link rel="modulepreload">` tags a manualChunks build adds for each
vendor chunk — with the split in place, "entry, raw" read as an artificially tiny ~330 KB while
the always-loaded ~190 KB React chunk got bucketed as "lazy" and blew through the
accidental-whole-library-import guard. See `apps/web/vite.config.ts`'s own comment for the full
account. It may still be worth doing purely for redeploy cache-hit-rate, but only once
`bundle-budget.mjs` (out of this wave's scope) learns to treat `modulepreload` links as entry.

**The mobile Lighthouse score did not move — 0.61–0.62, same as before `a25d2ea`.** Re-verified
twice (a 6-run then a 5-run pass): median 0.61 then 0.62, both within the pre-existing
0.55–0.62 band. This is the honest result, not a shortfall in the fix: the audited page
(onboarding/setup, unauthenticated) never rendered `Shell` in the first place — the ~7% entry
reduction it bought is real and will matter for every _authenticated_ page load, but the
specific page this Lighthouse budget measures was never paying for `Shell` to begin with. What
actually gates mobile's score on this page is React + Mantine's base components + react-query +
the router + zustand, all genuinely needed before `SetupPage` can render at all, plus
`@material/material-color-utilities`'s `Hct`/`SchemeExpressive` (used by `ThemeProvider` to
compute the initial M3 palette synchronously — this is _not_ the artwork-quantization path;
`sourceColorFromImageData`/`QuantizerCelebi`/`Score` are already absent from every build, dead
code no route calls, confirmed by grep against the built output before assuming there was
anything left to defer there). None of that is deferrable without either breaking boot order or
flashing an unthemed shell, which this wave's constraints ruled out. Moving the mobile score
for real would mean auditing a heavier, more representative page than the onboarding screen, or
accepting a slower-loading but correctly-themed shell — both product decisions past this wave's
scope.

**Not covered by this wave**: any page beyond the unauthenticated onboarding screen (the
audiobook library grid, the player, any Jellyfin-backed music page — all heavier and
unaudited), a real Audiobookshelf/Jellyfin over a real network, and every Lighthouse category
except `performance` (no accessibility, best-practices, SEO or PWA score budget here — the
accessibility audit above is separate, manual, and covers more ground than Lighthouse's own
automated a11y category would).

**The Lighthouse budget now audits an authenticated page too — done (2026-08-06, base
commit `daa7c8b`).** The gap the two paragraphs above name (every number came from the
unauthenticated onboarding screen, so `a25d2ea`'s `Shell` lazy-load bought nothing this
budget could see) is now closed for the page that matters most: `scripts/lighthouse-budget.mjs`
audits both `signedOut` (unchanged) and a new `home` page — the signed-in Home/library
screen, chosen over the player or a music page because it is the first thing a returning
user sees and it already exercises `Shell`, the nav chrome, the mini player and a real shelf
grid; auditing it properly beat auditing three pages shallowly, since each extra page
multiplies run time by samples × form factors.

Both pages sit at the app's own root URL (`/`) — the SPA renders an entirely different page
there depending on session state, not on the path. Lighthouse drives its own Chrome, not
Playwright's, so there is no `page.context()` to hand a `storageState` file to; instead
`establishAuthenticatedSession` drives `POST /api/v1/setup` then `POST /api/v1/auth/login`
directly over `fetch` (the same calls `e2e/app/onboarding.spec.ts` makes through a browser),
once per script invocation — `POST /auth/login` is rate-limited to 10/min per IP, so signing
in per sample would 429 well before `--runs 6` — and attaches the resulting cookie to `home`
audits via Lighthouse's `extraHeaders`. **Every single run's `finalDisplayedUrl` is checked**
(`assertAuthenticated`) and a redirect to `/login` or `/setup` fails the whole run loudly
(exit 2, not exit 0/1) instead of silently reporting `signedOut` numbers under the `home`
label — this is the exact failure mode the wave exists to close, and it was verified by
deliberately handing the script a garbage cookie: `signedOut` still audited and passed, and
the `home` audit failed immediately with `finalDisplayedUrl` reported as
`http://127.0.0.1:4320/login`, exit code 2.

Measured 2026-08-06 on the same commit and machine as the baseline above, two independent
passes (`--runs 6` then `--runs 5`): desktop `home` — score median 0.94 (0.93–0.95), FCP
median 1125–1134ms, LCP median 1303–1316ms, TBT median 1–3ms, CLS 0.001 (non-zero, unlike
`signedOut`'s 0.000 — real shelf content shifts slightly on load), SI same as FCP. Mobile
`home` — score median 0.59–0.61, FCP median ~6.0s, LCP median 6.78–6.85s, TBT median
137–179ms (samples ranged 112–355ms, the same simulated-4x-CPU heavy-tailed noise the
`signedOut` mobile `tbt` paragraph above documents), CLS 0.008, SI same as FCP. **`home` is
not meaningfully heavier than `signedOut` on this machine** — both pages pay for React,
Mantine, react-query, the router and zustand before anything paints, and that shared cost
dominates mobile's simulated throttle regardless of which page sits on top of it, so `home`'s
budgets landed within a few percent of `signedOut`'s own numbers rather than measurably
worse. `scripts/lighthouse-budget.config.mjs`'s `home` comments carry the full per-metric
reasoning and flag that this baseline rests on two verification passes, not `signedOut`'s
longer multi-commit history — a future CI failure here should be treated as needing
re-derivation before being trusted as a real regression.

CI keeps the same `--runs 3` default for both pages (not reduced for `home`) since the two
pages' numbers are close enough that a thinner sample would add noise exactly where it is
least affordable. **Still not covered**: the player, any Jellyfin-backed music page, and a
real Audiobookshelf/Jellyfin over a real network — `home` closes the specific hole the
`Shell` lazy-load exposed, not every authenticated page.

**The accessibility audit has started: done (`d3b2791`).** Two real defects fixed: search
state changes were invisible to a screen reader (a plain paragraph, no live region), and the
sleep timer's menu had no `aria-haspopup`/`aria-expanded` with Escape closing the entire Now
Playing sheet — because Mantine's `Drawer` listens for Escape on `window` in the **capture**
phase, ahead of any bubble handler the menu could register. The reduced-motion gap flagged
earlier in `LinearProgress`/`CircularProgress` turned out already covered by a global
catch-all in `packages/ui`'s stylesheet, verified in a browser and now pinned by regression
tests. Contrast is asserted against real rendered elements in both themes.

**Accessibility audit — a second pass, and four fixes (`663ffad`, merged `ae7d985`).** An
earlier pass swept the player, search and overlay surfaces; this one covered music, playlists,
favourites and settings, and verified every claim in a real browser rather than from source —
one hypothesis (`Loader`/`Progress` ignoring reduced motion) died that way before being
reported, because a global `!important` rule already handled it.

The most instructive finding: **Now Playing did not restore focus on Escape, while the shared
`Sheet` component's own gallery spec passed.** `NowPlaying` returned `null` the instant `open`
went false, so the whole `Sheet` unmounted before Mantine's Drawer could observe the `opened`
prop transition its focus-return effect is wired to. The component was correct; its caller was
not, and the isolated spec could never have caught it because the gallery only toggles `open`
and never unmounts. It affected books and podcasts too — one `NowPlaying` serves every media
kind.

The other three: unfavouriting removed the focused row with no announcement and dropped focus
to `<body>`; the theme-mode buttons conveyed selection only through their visual variant, while
the colour swatches directly below them already set `aria-pressed`; and `color-scheme` was
never synced to the resolved theme the way `data-theme` is, so native placeholder text rendered
for the wrong scheme whenever the pinned theme disagreed with the OS — measured **2.07:1**
against WCAG AA's 4.5:1.

**Left as product decisions, not fixed**: `FavoriteToggle` uses one heart glyph in both states
(differentiated by colour at 1.61:1 plus a 15% scale bump — screen readers are unaffected, but
a proper fix needs an outline/filled glyph pair, i.e. a change to the icon set), and
`SearchField` has no visible label besides its placeholder across six call sites, one of which
is deliberately chrome-minimal.

**Not covered by this audit**: real assistive technology (VoiceOver/NVDA/JAWS) — everything is
DOM/ARIA/computed-style verification in Chromium — the podcasts UI beyond a source grep, and a
full tab-walk of pages other than Home, album and Now Playing. `@axe-core/playwright` would
catch more of the `aria-pressed` class quickly but would not have caught the focus, live-region
or contrast findings, which needed real interaction sequences; adding it is the user's call and
was deliberately not taken.

**Accessibility audit — a third pass: the podcasts UI and a keyboard tab-walk of the surfaces
the first two skipped (`e2e/app/podcasts.spec.ts`, `podcast-detail.spec.ts`).** Three real
defects, all found by measuring in a real browser rather than by reading source, and all
fixed:

- **A link inside a directory search result's description also selected the card.**
  `PodcastDiscoverPage.tsx` renders each result's untrusted `descriptionPlain` through
  `RichDescription`, which can produce a real `<a>` — nested inside the result `Card`'s own
  `<button>`, an HTML5 interactive-content violation the browser still renders (React builds
  the DOM directly, never through the HTML parser that would otherwise reject it). Confirmed
  live: intercepting the search response with a description containing a link and clicking it
  opened the link **and** fired the card's `onClick`, starting an unwanted feed preview at the
  same moment — true for both a mouse click and a keyboard Enter on the nested link, since
  both dispatch a bubbling `click`. Fixed with `event.stopPropagation()` on a wrapper around
  just the description, so every other part of the card still selects it as before.
- **Subscribing had no announcement for assistive tech.** The only observable change on
  success was the "Subscribe" `Button` being replaced by a "Subscribed" `Chip` — a purely
  visual swap, no live region, nothing moving focus. Fixed in `PodcastFeedPreview.tsx` with the
  same `Snackbar` (`role="status"`, `aria-live="polite"`) pattern `MusicFavoritesPage.tsx`
  already uses for a discrete, user-triggered action's result.
- **The podcast search field had no visible keyboard focus indicator at all.** Measured, not
  assumed: `getComputedStyle` before and after a real `Tab`-driven focus showed byte-identical
  `border-color`, `outline-style: none` and `box-shadow: none`, despite the element correctly
  matching `:focus-visible`. Root cause: Mantine's own `TextInput` CSS sets `outline: none` on
  focus and instead swaps a `--input-bd` custom property to a themed colour, expecting the
  border-colour change alone to read as the ring — and that swap never reached this field's
  underlying `<input>` (the exact break in the variable cascade wasn't chased further).
  `packages/ui`'s global `:where(...):focus-visible` rule, deliberately zero-specificity so it
  never fights a real component stylesheet, is exactly why it lost here silently. Fixed with an
  explicit `.m3-search-field input:focus-visible` rule in `SearchField.css`, one specificity
  point above Mantine's own selector so it wins regardless of load order — this is a shared
  `@auralis/ui` component, so the fix reaches every `SearchField` call site, not just
  podcasts'.

**Verified already correct, with regression tests pinning it**: the episode list's `ListItem`s
render as real `<button>`s (reachable, activatable, no ARIA needed beyond what's native);
episode "Played"/"In progress" state is folded into the same visible supporting-text string a
sighted user reads, not a colour- or icon-only signal; the episode-order `Chip`s are real
checkbox inputs whose `checked` state is native, needing no manual `aria-pressed`; per-episode
play errors use `role="alert"` scoped to that row; and text contrast on the episode list clears
WCAG AA (4.5:1) in both themes. A full keyboard tab-walk of the podcast detail page (focus
order, a visible ring at every stop) also came back clean once the walk itself stopped
accidentally starting playback — `body.click()`'s bounding-box centre depends on the full
document height, not the viewport, and on this page that centre lands on an episode row;
clicking the page's own `<h1>` instead gives the page real keyboard focus without side effects,
and is the pattern to reuse for any future page-level tab-walk here.

**Not covered by this pass**: a keyboard tab-walk of the settings sub-sections, search results
grid and request flows was attempted but not completed to the same regression-test standard as
podcasts — spot checks found nothing broken (every stop had a visible ring, no traps), but they
are not pinned by a test the way the podcasts findings above are. Real assistive technology is
still out of scope, as in both earlier passes.

**The holistic `docs/DESIGN.md` comparison is done for the web surfaces
(`docs/research/WEB_DESIGN_AUDIT.md`, merged `27bde64`).** Six surfaces — Home, book detail,
Now Playing collapsed and expanded, Search, Music home and album, Settings — at 1440x900 and
390x844. Android was not covered and still needs its own pass.

**Its first draft got the headline wrong, and the correction is the useful part.** It reported
every surface as a phone layout stretched to desktop width with 30-40% dead space. An
independent re-measurement of the live DOM found the opposite: a real 220px navigation rail, a
real 320px Now Playing side panel flush to the viewport's right edge with nothing beyond it, an
852px content column inside a 900px slot (~5% margin), and `.auralis-card-grid`
(`repeat(auto-fill, minmax(200px, 1fr))`) rendering **four live columns** on Search and on the
Music grids. Home's horizontal-scroll shelves and the album tracklist's single column are
deliberate patterns, not failures. The desktop layout is closer to this file's "not a stretched
phone UI" target than the audit first concluded. The document now says what was measured.

Worth generalising: a design finding read off screenshots is a hypothesis. `getComputedStyle`
and `boundingBox` settle it, and they disagreed with the eye on the single largest claim here.

**Four real defects, none yet fixed** — the next web wave's list:

- **The mini player is not fixed or sticky.** `MiniPlayer` renders `position: relative` as a
  sibling after `.auralis-shell__row`, so on a page tall enough to scroll (item detail reached
  921px against a 900px viewport) it is pushed below the fold — in the DOM, `isVisible()`, and
  off-screen. It appeared to "come back" on interaction only because the browser scrolled it
  into view before the click. Secondary: at 360px wide it overlaps ~140px past the 220px rail
  rather than docking at the rail's foot as `DESIGN.md` specifies.
- **Music's Jellyfin artwork has no `onError` fallback.** Home's `ShelfCard` already implements
  `coverFailed`/`onError` -> a styled on-theme icon; the Music artist and album cards render a
  bare `<img>` and fall through to the browser's native broken-image glyph. The pattern to copy
  already exists in this repo, so this is a defect, not a design question.
- **Two overflow bugs at 390px**: the book-detail title/byline header (`flex-wrap: nowrap`,
  `body.scrollWidth` 405 against a 390px viewport) and the Music page's link row plus search
  button (`scrollWidth` 419), which visibly clips "Requests"/"Search".
- **Settings still reads "Source colour (Phase 5 will set this automatically from artwork)"** —
  stale copy naming an internal phase number to the user, for work that shipped.

**All four defects are fixed (`47179c7`), and a browser pass measured the result rather than
trusting the tests.** The mini player is `position: fixed` and docks to the rail's 220px edge at
1440 (measured x:0, width 220, bottom:0) — the original defect condition was reproduced first, on
the same 921px-tall item page the audit found it on. Music artwork now goes through a shared
`CoverImage` that reuses Home's fallback, and every Music surface renders the tonal placeholder
instead of the browser's broken-image glyph. `document.body.scrollWidth` is exactly 390 at a
390px viewport on **every** route checked, not just the two originally flagged. Settings no
longer names an internal phase number to the user.

**All three follow-ups are now fixed (`1925402`), verified by interaction rather than
geometry.** At medium the mini player docks to the rail's right edge and spans the content
column (`left: var(--auralis-rail-width); right: 0`) — measured `x:80, width:944` against an
80px rail, flush, with 1440 and 390 unchanged. `DESIGN.md` says only "docked above the bottom
bar or at the foot of the rail" and does not settle medium; shrinking the bar to 80px is not
possible without a new narrower layout, so spanning was chosen and the reasoning is in the CSS.
Compact now reserves the mini player's own height on top of the navigation bar's, but only when
playback is active — driven off the same store field `MiniPlayer` renders from, so padding is
never reserved for a bar that is not there. `MiniPlayer`'s cover is on the shared `CoverImage`.

The acceptance check was **clicking** the play toggle and the expand control at 1024, 1440 and
390 and asserting the state change, not measuring boxes — measuring is what passed the broken
version a commit earlier.

**One trap found on the way**: the first medium rule used a selector with _lower_ specificity
than the base `:not(.auralis-shell--compact)` rule it had to override, so `left` silently
stayed `0` no matter the source order. Chaining `.auralis-shell.auralis-shell--medium` matched
specificity. A CSS override that appears later and still loses is a specificity problem, not an
ordering one.

**The two gaps that prompted this work, for the record:**

- **The medium breakpoint has the identical bug that was just fixed at expanded.** At 1024x768
  the mini player is `fixed` but its width computes to ~347.5px against an 80px rail, so it
  overlaps ~267px into the content column — the exact defect class the fix was written for, at
  a breakpoint the fix deliberately did not scope. The stated reason (80px cannot hold a cover
  plus a button) is a real constraint, so closing this needs a narrower medium-specific layout,
  not just another width rule.
- **At compact, content scrolled behind the mini player** — `.auralis-shell--compact` reserved
  80px of bottom padding for the navigation bar but not the mini player's 64px stacked above
  it, obscuring the last ~48px of a long page. **Fixed in `1925402`**, which reserves the full
  height and only while a mini player is actually rendered
  (`.auralis-shell--compact[data-mini-player-active='true']` in `apps/web/src/styles/app.css`).

`MiniPlayer`'s own cover was noted here as still lacking the fallback the Music cards gained.
**That was fixed in the same commit** — it renders through `CoverImage`. Both were re-verified
in the source on 2026-08-06 rather than taken from a report.

**The docking fix shipped broken once, and the reason generalises (`aebee4a`).** Moving the
mini player to `position: fixed` put it in a new stacking context, and at `z-index: 9` it lost
to Mantine's `AppShellNavbar` — which writes its own `z-index: 101` **regardless of `mode`**,
including the static, in-flow mode the rail uses here. The rail occupies exactly the rectangle
the docked mini player does (left:0, the rail's width, the viewport's bottom edge), so it
painted over the mini player and swallowed every click aimed at it — play/pause, expand, cover
art — while neither element changed size or appearance.

The browser verification pass measured `boundingBox` and computed `position` and passed it
clean, because the geometry _was_ right. Three Playwright specs caught it, timing out on
`locator.click`, and `main` was red for one run.

**`position: fixed` is a stacking change, not just a layout change.** Geometry assertions
cannot see it; only an interaction can. The fix is `z-index: 101`, which clears the rail on DOM
order and stays under Mantine's modal/popover/overlay bands (200/300/400) so `Dialog` and
`Sheet` still stack above.

**On the tests**: this repo has **no DOM test environment** — `vitest.config.ts` runs
`environment: 'node'` with no jsdom anywhere — so the layout tests assert that the CSS rules
causing the right layout are present in `app.css`. Reviewed and judged honest revert-guards
rather than tautologies (they parse rule bodies through selector-anchored regexes and would fail
if a rule were weakened), but they cannot catch either gap above, because both are about a
rule's real-world sufficiency rather than its presence. **Layout work here needs a Playwright
pass to be believed; the suite cannot supply one.**

**One design decision left to the user**: what a missing-artwork placeholder should actually
look like. The defect above is that Music has no fallback at all; what the fallback _is_ was
never decided.

Not covered by this pass, and each still open: Android entirely, the 600-1240px tablet
breakpoint, motion and cross-fade, hover states, the light colour scheme, real assistive
technology, and the Podcasts, Lyrics, Playlists, Favourites and Requests pages. One environment
note for whoever picks it up: the fake upstreams serve synthetic random bytes labelled
`image/jpeg` (HTTP 200, not 404), so no artwork decodes under `pnpm dev:fake` — artwork-derived
colour cannot be checked there at all, and a "broken image" seen in that environment is the
fixture, not the app.

**The 600–1240px tablet breakpoint is now audited, in a real browser, at 600/768/900/1024/1200px
on Home, Search, Settings, an item detail page, and Music (browse and album) — the pages the
earlier desktop/phone passes covered at other widths.** `docs/DESIGN.md`'s three-tier layout
(bottom bar / rail / expanded rail, with the mini player "docked ... at the foot of the rail")
holds across the whole range, not just the 900px width `player.spec.ts` already pinned:
`.auralis-card-grid`'s `repeat(auto-fill, minmax(200px, 1fr))` produced 2–5 columns with card
widths measured 200–250px at every width checked — never a single giant column, never an
unreadable six-up — and the medium-breakpoint mini-player docking fix (`1925402`) holds
edge-to-edge at 768/1024/1200px too, confirmed by clicking the play toggle through it at each
width rather than trusting `boundingBox`, per this project's own lesson that geometry
assertions passed the broken version once already. No horizontal overflow at any width on any
page checked. `e2e/app/tablet-breakpoint.spec.ts` pins all of this.

**The two follow-up items this section used to carry forward — the ~48px of content obscured
behind the docked mini player at compact width, and `MiniPlayer`'s own cover lacking a
fallback — were already fixed by `1925402`, before this wave started.** Read in a real browser
rather than assumed from the commit message: `app.css`'s `.auralis-shell--compact
[data-mini-player-active='true']` rule reserves 144px (80px bottom bar + ~64px mini player) only
while a track is loaded, and `MiniPlayer.tsx` already renders through the shared `CoverImage`
component. Nothing to fix there.

**One real defect was found instead, by the same real-browser pass, and is fixed.** `ItemPage.tsx`
(book detail) and `PodcastDetailPage.tsx` (podcast detail) both still rendered their cover as a
bare `<img>` — the exact pattern the Music cards and `MiniPlayer` were fixed for, just not
carried to these two pages. Confirmed by forcing the cover request to fail and watching the
browser's native broken-image glyph render at 600px, on `item-dune`'s detail page. Both now go
through `CoverImage`, with `book_2`/`podcasts` fallback icons matching `MiniPlayer`'s own
mapping. `e2e/app/tablet-breakpoint.spec.ts`'s last two tests pin this — verified to fail
without the fix (reverted, watched both go red, restored) before being trusted.

Still uncovered: Android, motion/cross-fade, hover states, the light colour scheme, real
assistive technology, and the Podcasts/Lyrics/Playlists/Favourites/Requests pages specifically
at tablet widths (this pass covered Home/Search/Settings/item-detail/Music only, the same set
the desktop/phone passes used).

**Phase 10 is done (2026-08-06).** Everything this section named has landed: bundle-size and
Lighthouse budgets enforced in CI (two pages x two form factors, the signed-in page included),
`arm64` published alongside `amd64`, tag-driven release automation, the accessibility audit
across the player, search, overlays, music, playlists, favourites, settings, podcasts and a
keyboard tab-walk, the web design comparison against `DESIGN.md` with its defects fixed, the
600-1240px tablet range, and the Android half of the design comparison.

What remains is genuinely outside this phase rather than deferred within it, and each item is
blocked on something this environment cannot supply:

- **Real assistive technology.** Every accessibility claim here is Chromium DOM/ARIA/computed-
  style verification. VoiceOver, NVDA and JAWS have exercised none of it.
- **Android on hardware.** No JDK, SDK or emulator exists on this machine, so every Android
  visual claim is source-derived. `docs/research/ANDROID_DESIGN_AUDIT.md` found real gaps —
  no full Now Playing surface, no persistent navigation shell — and closing them is feature
  work on a surface nobody here can look at. `docs/HANDOVER.md` carries the summary and the
  three product questions it raised.
- **Open-ended polish** that has no completion criterion: motion and cross-fade, hover states,
  the light colour scheme, and the remaining pages at tablet width. Worth doing; not worth
  calling a phase.
- **The mobile Lighthouse score, ~0.58 on both pages measured.** Diagnosed rather than fixed:
  the app shell pulls the whole design system in before first paint, splitting it was tried and
  measured nothing, and improving it means changing what the shell depends on. That is product
  work, not build config.

### 11 — Alternative app-store distribution (F-Droid / Droid-ify)

Sideloading an APK from a CI artifact is fine for the person who builds it and hostile to
everyone else — no update notifications, no signature continuity, no discovery. The goal of
this phase is that Auralis is installable and **updatable** from a normal F-Droid client
(Droid-ify, Neo Store, F-Droid itself), which all speak the same repository format.

**Start this phase by delegating an investigation**, not an implementation. The requirements
are exacting, they change, and getting them wrong is expensive in a way that is hard to
reverse — a signing key, in particular, is a one-way door. The agent's first deliverable is
a written findings document naming which distribution route to take and what the repo must
change to satisfy it; only then does anything get built.

What that investigation must settle:

- **Which route.** Roughly three, in ascending order of effort and reach: publish our own
  F-Droid repository (fully under our control, users add a URL — `fdroidserver` or one of
  the GitHub-Actions repo generators); submit to **IzzyOnDroid**, which indexes APKs from
  GitHub releases and is already enabled in most Droid-ify installs; or submit to the
  **official F-Droid** repo, the widest reach and the strictest bar, since they build from
  source on their own infrastructure. These are not exclusive.
- **Whether we can meet the FOSS bar.** F-Droid proper refuses proprietary dependencies.
  Audit what `apps/android` actually pulls in — note that the Android Auto plumbing is only
  a `com.google.android.gms.car.application` meta-data _string_ and an XML descriptor, not a
  Play Services dependency, so it is very likely fine; confirm rather than assume. Anything
  that genuinely needs a proprietary library has to become a build flavour.
- **Reproducible builds**, which the official repo wants and which our current
  `assembleDebug` pipeline does not attempt. This is the item most likely to force real
  changes to the Gradle config.
- **Signing.** A release keystore, kept out of git, in CI as a secret. Decide the key and
  the `applicationId` **once** — F-Droid identifies an app by package name plus signature,
  and changing either later means users cannot update, they must uninstall and reinstall,
  losing their data. Treat this as irreversible.
- **`versionCode` discipline and release automation** — a monotonic code derived from tags,
  signed release APKs attached to GitHub releases, and a changelog in the layout F-Droid
  metadata expects (`metadata/en-US/changelogs/<versionCode>.txt`), plus store listing text,
  screenshots and an icon.

**Do not start this before phase 7 ships a real Android app.** Everything here is packaging
around a working artifact, and the irreversible decisions above should be made once the app
they identify actually exists.

**The investigation is done (`beaebf2`, merged `d40a515`): `docs/research/FDROID_DISTRIBUTION.md`.**
Independently reviewed; three citation defects were corrected before merge. It is research, not
a decision — nothing was built and neither one-way door was walked through.

**It found a blocker no one had anticipated, and it is the reason this phase cannot simply
proceed.** IzzyOnDroid's own inclusion policy states: "We are strongly opposed to apps which are
fully or in part created by generative AI tools," and concludes that such an app's "request for
inclusion will most likely be rejected"
(<https://izzyondroid.org/docs/general/AppInclusionPolicy/>, fetched and read directly by both
the investigating and the reviewing agent, 2026-08-06). The scope is "fully or in part" — this is
not a rule about spam submissions. Auralis was written almost entirely by Claude subagents, so on
a plain reading it is exactly what the policy excludes. IzzyOnDroid was the recommended first
route precisely because it is the cheap one that is enabled by default in most Droid-ify installs;
if it is closed, the recommendation collapses to "own repo, or official F-Droid, or neither."
**The user has since decided, and the phase is no longer blocked (2026-08-06, queue entry
`019f22b`):** _"we will not violate IzzyOnDroid's anti-AI policy. We won't submit the app
there. I'll just add it as a custom repo to my droidify."_ So the route is **our own F-Droid
repository**, added to Droid-ify by URL. IzzyOnDroid and official F-Droid are both out of
scope; the paragraphs above are the record of why, not an open question.

Two decisions remain the user's and are still unmade: the **release signing key** (where the
keystore lives, who holds it) and the **`applicationId`**. Both are one-way doors — F-Droid
identifies an app by package name plus signature — so nothing generates a key on the user's
behalf. Everything that does not depend on them can proceed.

Findings that stand independently of that decision:

- **`apps/android` clears the FOSS bar as it is.** Every declared dependency is Apache-2.0 or
  EPL-1.0 — AndroidX, Compose, Kotlin/kotlinx, OkHttp, Media3/ExoPlayer, Coil, JUnit. No Google
  Play Services, no Firebase, no tracking library. No build flavour needed. This is a
  **first-order** audit: `./gradlew :app:dependencies --configuration releaseRuntimeClasspath`
  is the one thing that would close it fully, and it cannot run on this machine.
- **The Android Auto hypothesis above is confirmed, not merely plausible.** It is a single
  `com.google.android.gms.car.application` meta-data string in `AndroidManifest.xml` pointing at
  a two-line `res/xml/automotive_app_desc.xml`. `grep -rn "gms\|play-services\|firebase"` over
  `apps/android/` returns that one hit and nothing else — there is no Play Services Gradle
  coordinate anywhere. Whether `fdroidserver`'s scanner would still flag it is reasoned, not
  tested (the scanner matches compiled DEX class references, not manifest values); testing it
  needs a built APK and `fdroid scanner`, neither available here.
- **The app has no launcher icon.** `apps/android/app/src/main/res/` contains only `xml/` and
  `values/` — no `mipmap-*` at anything — and the `<application>` tag sets no `android:icon`, so
  it ships with Android's default. Not a build error, which is why nothing has caught it; it is
  a missing asset, and it blocks every distribution route equally. It also needs a design
  decision about what the icon _is_, so it is not a mechanical fix.
- **Reproducible builds are a best practice for official F-Droid, not a hard gate** — the
  `AllowedAPKSigningKeys`/`Binaries` mechanism lets a project ship its own signed binaries
  verified against an F-Droid-built one. That is less disruptive to our Gradle config than the
  phase description above assumed.

---

## Spec addendum — navigation, search-as-requests, For You, and queues (2026-08-06)

**This is the user's own clarification of the product, given after phases 4–10 were marked
done. It supersedes parts of them.** Where a section above describes a shipped surface that
this addendum contradicts, the addendum is the spec and the section above is the record of
what was built. Phase 12 is the work of closing that gap; nothing here is optional, and none
of it is a question.

The user attached four reference screenshots — Spotify's Home screen under its `All`,
`Music` and `Podcasts` filters. **They are deliberately not in git.** They are screenshots of
the user's own Spotify account, showing their subscriptions and playlist names, and this repo
is public; that is personal data they shared as a design reference, not something to publish.
They sit at `docs/research/spec-addendum/` on the development machine and are gitignored, so
a session working there should read them rather than infer from this prose — a written
description of a layout defaults to a generic one. A session working from a fresh clone will
not have them, and that is the accepted cost until the user says otherwise.

### 12 — Product-spec addendum: five views, unified search, per-type queues

| Area                                                    | Status |
| ------------------------------------------------------- | ------ |
| 12a — Five-view navigation shell (web + Android)        | todo   |
| 12b — Search view: unified library + request results    | todo   |
| 12c — In-view search and artist/author full discography | todo   |
| 12d — For You: uniform album-card carousels             | todo   |
| 12e — Context menus (long-press / right-click)          | todo   |
| 12f — Per-content-type queues                           | todo   |

#### 12a — The five views

The nav bar (phone) and side bar (desktop/tablet) expose exactly five destinations:
**For you, Music, Books, Podcasts, Search.**

- In the **side bar**, Search sits at the **top**, rendered as a search _bar_ rather than a
  nav item.
- In the **nav bar**, Search sits on the **far right**.

This is a persistent shell: the navigation and the mini player stay put across every
destination. **On Android that shell does not exist at all today** — all sixteen screens are
independent `Scaffold`s and `MiniPlayerBar` is wired into `HomeScreen` alone, so playback UI
vanishes on any navigation. That finding (`docs/research/ANDROID_DESIGN_AUDIT.md`, phase 10)
and this requirement are **one piece of work, not two**.

#### 12b — Search doubles as the requests view

There is no separate requests destination. Search _is_ the requests surface, and the same
query returns both.

- **Chips at the top filter by content type.** Selecting one reveals a second row of
  type-specific filters: `Music` → All / Songs / Albums / Artists; `Books` → All / Books /
  Series / Authors.
- **With no filter selected**, every kind of result shows, grouped by content type and sorted
  by relevance, as a list.
- **Library items and requestable items are visually and clearly separated.** Pressing a
  requestable item requests it.

This supersedes the shipped web `/requests` and `/music/requests` pages as the _primary_
entry point, and supersedes Android's music-only search entirely.

#### 12c — In-view search, and artist/author pages

Each content view (Music, Books, Podcasts) has its own search icon. That search covers the
**library only** — it is not the unified search of 12b.

**Artist and author pages show the artist's whole discography**, not just what is in the
library. Content that is not in the library renders **greyed out**, and pressing it requests
it. This is behind a setting: **"Show non-library content in artist/author pages."**

#### 12d — For You

The **quick-selection grid** at the top of the view — the two-column rows of small thumbnail
plus title, as in `01-for-you.jpg` — is correct as a shape and stays.

**Everything below it must be album-card carousels, all of the same card size.** The
reference screenshots show Spotify doing the opposite (`04-for-you.jpg`: a four-column icon
grid for shows, then full-width episode cards) and that is explicitly what the user does not
want. One card geometry, one carousel pattern, repeated.

For You mixes content types, and **carries the same content-type filter chips** the Search
view does (`All / Music / Podcasts / Audiobooks`, per `01`–`04`).

#### 12e — Context menus

Long-press (Android, and touch on web) or right-click (web) on a song shows **at least**:
Play next · Play last · Go to album · Go to artist.

#### 12f — Queues are per content type

**Each content type has its own queue; they never share one.** Switching from a podcast to a
song and back to the same podcast does **not** clear the podcast queue. The reverse is not
guaranteed — song queues are ephemeral and may be discarded.

The queue view must be able to **clear the queue, for every content type**.

**Audiobook chapters must be queueable.**

### What this addendum changes about phases already marked done

Recorded here rather than by editing those sections, so the history stays readable:

- **§4 (web shell)** — the shell's navigation is not the five destinations above.
- **§8 / §9 (podcasts, music)** — search is per-type and separate from requests; this
  addendum unifies them.
- **§9 (music, Android)** — Android search is Jellyfin-music-only; 12b makes it unified.
- **§10 (release polish)** — the Android design audit's "no persistent navigation shell" and
  "no full Now Playing surface" findings are prerequisites of 12a, not separate polish.
- **§7 / §9 player work** — the queue is currently one queue; 12f makes it one per type.
