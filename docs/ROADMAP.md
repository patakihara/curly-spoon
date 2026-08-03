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
| 8   | Podcast client (web + Android)                                  | planned     |
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
- **Wave B2 — home/library Compose screens with real data.** Not started. Replaces the
  placeholder `HomeScreen` with real shelves/library data via wave A's `ApiClient`, needs an
  image-loading dependency (Coil is the natural pick, not yet added) for cover art. **This is
  the point where a visual comparison against YouTube Music / Symfonium first makes sense on
  Android** — see `docs/DESIGN.md`'s reference table and the note just below it. Do that
  comparison as part of closing this wave, not as an afterthought.
- **Wave C — player**: Media3 `ExoPlayer` behind the `MediaLibraryService` scaffolded in 5a,
  Now Playing / mini player surfaces, progress sync against the BFF. **A second, more
  important point for the same visual comparison** — the Now Playing surface is where the
  YouTube Music reference (split-view, thickening progress bar) and the Symfonium reference
  (artwork-derived theme colour) actually bite.
- **Wave D — requests**: the phase 6 request flow, native.
- **Wave E — Android Auto**: browse tree, `onPlayFromSearch`/`onSearch`, playback resumption —
  see below for why this can't be bolted on after the fact.

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

### 9 — Music

Jellyfin browse (albums, artists, genres, playlists), Spotify-depth search including
**lyrics search**, gapless queue playback, synced lyrics view, music request provider —
web and Android together.

### 10 — Release polish

Performance budgets enforced in CI (bundle size, Lighthouse on the desktop and mobile
layouts), a full accessibility audit, multi-arch image publishing (amd64 + arm64, so it
runs on a Pi or a NAS as happily as on a desktop), and release automation.

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
