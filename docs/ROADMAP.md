# Auralis — Roadmap

Delivery is phase by phase; each phase lands on `claude/media-client-app-k7v9by` as a
self-contained, tested increment.

| #   | Phase                                                           | Status      |
| --- | --------------------------------------------------------------- | ----------- |
| 1   | Monorepo foundations, tooling, CI, test harness                 | done        |
| 2   | `@auralis/ui` — Material 3 Expressive design system             | done        |
| 3   | Server BFF core + Audiobookshelf client                         | done        |
| 4   | Web app shell + **Docker image** — routing, theming, onboarding | in progress |
| 5   | Audiobooks experience + player                                  | next        |
| 5a  | Android build skeleton + APK pipeline (parallel with 5)         | next        |
| 6   | Book requests — AudiobookBay, Prowlarr, torrents                | planned     |
| 7   | **Android — audiobooks + requests** (Compose + Media3)          | planned     |
| 8   | Podcast client (web + Android)                                  | planned     |
| 9   | Music client (Jellyfin) + lyrics + requests (web + Android)     | planned     |
| 10  | Release polish — performance budgets, a11y audit                | planned     |

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

The build environment used for development has no network access to `dl.google.com`, so the
Android SDK and Google's Maven repository are unreachable: **Android code cannot be compiled
or run locally at all.** It is written blind and validated only by CI, which does have
access.

That makes the pipeline itself a risk. 5a therefore lands a minimal Compose app that does
nothing but build, plus the workflow that produces a sideloadable debug APK, well before
there is real code depending on it. It runs in parallel with phase 5 because `apps/android/`
and `apps/web/` are disjoint.

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

The deliverable is not a feature — it is proof that a machine which cannot reach the Android
SDK can still produce an installable APK. Getting that wrong later, with a real app on top
of it, is far more expensive.

### 6 — Book requests

Pluggable indexers (AudiobookBay scraper, Prowlarr), pluggable download clients
(qBittorrent, Transmission), request queue with approval and status tracking, post-import
Audiobookshelf scan trigger. Completes priority 1 on the web, and freezes the API surface
that phase 7 builds against.

### 7 — Android: audiobooks + requests

The priority-1 experience, natively:

- Jetpack Compose with Material 3 Expressive and dynamic colour from wallpaper and artwork.
- Media3 `ExoPlayer` behind a `MediaSessionService` for background playback that survives
  the app being swept away, with lock-screen and notification controls.
- Offline downloads with resumable transfers, so a commute without signal still works.
- Progress synced through the same BFF, so a book continued on the phone resumes correctly
  in the browser and vice versa.
- Android Auto support, because a meaningful share of audiobook listening happens driving.
- The request flow from phase 6, so a book can be asked for from the phone.

Podcast and music screens follow in phases 8 and 9 as their APIs land.

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
