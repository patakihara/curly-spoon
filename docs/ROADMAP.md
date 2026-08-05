# Auralis — Roadmap

Delivery is phase by phase; each phase lands on `main` as a
self-contained, tested increment.

| #   | Phase                                                           | Status      |
| --- | --------------------------------------------------------------- | ----------- |
| 1   | Monorepo foundations, tooling, CI, test harness                 | done        |
| 2   | `@auralis/ui` — Material 3 Expressive design system             | done        |
| 3   | Server BFF core + Audiobookshelf client                         | done        |
| 4   | Web app shell + **Docker image** — routing, theming, onboarding | done        |
| 5   | Audiobooks experience + player                                  | done        |
| 5a  | Android build skeleton + APK pipeline (parallel with 5)         | done        |
| 6   | Book requests — Prowlarr, AudiobookBay, torrents                | done        |
| 7   | **Android — audiobooks + requests** (Compose + Media3)          | done        |
| 8   | Podcast client (web + Android)                                  | done        |
| 9   | Music client (Jellyfin) + lyrics + requests (web + Android)     | in progress |
| 10  | Release polish — performance budgets, a11y audit                | planned     |
| 11  | **F-Droid / Droid-ify distribution** — alternative app stores   | planned     |

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

  Left behind deliberately: `features/music/queue.ts`'s `albumQueue` is now unused by any page
  but still present with its tests, rather than widening the diff to delete it.

**The Android favourites wave cost four red-CI iterations**, all one failure class, now fixed
structurally in `6644ff6` + `ef98321`: `ApiClient` did its work in a hard-coded
`withContext(Dispatchers.IO)` that the test scheduler could not see, so tests returned with
requests still in flight and the resulting throw surfaced as `UncaughtExceptionsBeforeTest` on
whichever unrelated test ran next. The reported failure never named the culprit, which is why
three point fixes each moved the failure instead of removing it. `ApiClient` now takes its
dispatcher as a parameter defaulting to `Dispatchers.IO`. **`docs/HANDOVER.md` carries the full
account and what it means for writing any future Android ViewModel test** — read it before
touching one.

**A product caveat, not a defect**: every queued track — on both web and Android — carries
**album-level** artist/album/artwork rather than its own, because `MusicTrackUi` has no
per-track artist field to read. On a compilation or a multi-artist album the lock screen shows
the album artist for every track. Worth a decision before phase 10 rather than a silent
inherit.

**Known gaps, all deliberate**: the album queue covers only
the displayed 40-track page, not across pagination; no shuffle/repeat/cross-source queue
(needs an explicit ordered play-list decoupled from `startOffset`, since shuffle breaks the
"tracks are already in play order" assumption); no synced-lyrics view, playlists, favourites
or music requests (lyrics _search_ is separately blocked, see the bullet above); and **no
music on Android at all**. One testing gap: the `ended` listener and the
resume-after-track-change fix cannot be exercised by the e2e suite, because the fixture
audio never decodes far enough to fire a real `ended` event — `nextTrack()` is unit-tested
directly and the billing behaviour is covered by crossing a track boundary via skip-forward,
but the `ended` path itself needs manual or real-server verification.

### 10 — Release polish

Performance budgets enforced in CI (bundle size, Lighthouse on the desktop and mobile
layouts), a full accessibility audit, and the rest of the release story. CI already
publishes `linux/amd64` images to GHCR (`ghcr.io/patakihara/auralis:latest` and
`:${{ github.sha }}`) on every green build of the working branch, which is what
`compose.yaml` and a server-side Watchtower pull from — what's left here is the `arm64`
half (so it runs on a Pi or a NAS as happily as on a desktop, which needs QEMU and roughly
triples build time) plus release automation proper (tags, changelogs, a `main`-based flow
instead of publishing straight off the working branch).

A final holistic pass of the `docs/DESIGN.md` reference-app comparison belongs here too —
not just the per-surface checks noted against phase 7's waves above, but the whole app,
web and Android together, side by side with YouTube Music and Symfonium one more time before
release.

**The accessibility audit has started: done (`d3b2791`).** Two real defects fixed: search
state changes were invisible to a screen reader (a plain paragraph, no live region), and the
sleep timer's menu had no `aria-haspopup`/`aria-expanded` with Escape closing the entire Now
Playing sheet — because Mantine's `Drawer` listens for Escape on `window` in the **capture**
phase, ahead of any bubble handler the menu could register. The reduced-motion gap flagged
earlier in `LinearProgress`/`CircularProgress` turned out already covered by a global
catch-all in `packages/ui`'s stylesheet, verified in a browser and now pinned by regression
tests. Contrast is asserted against real rendered elements in both themes.

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
