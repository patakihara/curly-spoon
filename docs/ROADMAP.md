# Auralis — Roadmap

Delivery is phase by phase; each phase lands on `claude/media-client-app-k7v9by` as a
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
| 7   | **Android — audiobooks + requests** (Compose + Media3)          | in progress |
| 8   | Podcast client (web + Android) — backend wave A done            | in progress |
| 9   | Music client (Jellyfin) + lyrics + requests (web + Android)     | planned     |
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
- **Wave E — Android Auto**: browse tree, `onPlayFromSearch`/`onSearch`, playback resumption —
  see below for why this can't be bolted on after the fact. Split into sub-waves the same
  way phase 6's requests work was, since the data `ApiClient` had was insufficient for a
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
  - **Wave E2c — voice search + playback resumption: not started.** `onSearch`/
    `onGetSearchResult` (so "play <title>" works hands-free) and `onPlaybackResumption`
    (Auto asks for a recent item after a reboot, before the phone is unlocked). Inherits
    Wave E2b's Media3-free-construction constraint: keep decision logic out of any class
    that touches `MediaItem`.

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
- **No web or Android UI yet** — explicitly deferred to a later wave. Next: a UI wave
  consuming this backend, on whichever surface makes sense to build first.

### 9 — Music

Jellyfin browse (albums, artists, genres, playlists), Spotify-depth search including
**lyrics search**, gapless queue playback, synced lyrics view, music request provider —
web and Android together.

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
