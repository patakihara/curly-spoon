# Auralis — Roadmap

Delivery is phase by phase; each phase lands on `claude/media-client-app-k7v9by` as a
self-contained, tested increment.

| #   | Phase                                                           | Status  |
| --- | --------------------------------------------------------------- | ------- |
| 1   | Monorepo foundations, tooling, CI, test harness                 | done    |
| 2   | `@auralis/ui` — Material 3 Expressive design system             | done    |
| 3   | Server BFF core + Audiobookshelf client                         | done    |
| 4   | Web app shell + **Docker image** — routing, theming, onboarding | next    |
| 5   | Audiobooks experience + player                                  | planned |
| 6   | Book requests — AudiobookBay, Prowlarr, torrents                | planned |
| 7   | Podcast client                                                  | planned |
| 8   | Music client (Jellyfin) + lyrics + requests                     | planned |
| 9   | Android app (Compose + Media3)                                  | planned |
| 10  | Release polish — performance budgets, a11y audit                | planned |

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

### 6 — Book requests

Pluggable indexers (AudiobookBay scraper, Prowlarr), pluggable download clients
(qBittorrent, Transmission), request queue with approval and status tracking, post-import
Audiobookshelf scan trigger.

### 7 — Podcasts

Podcast library browse, feed search and subscribe, episode lists with download state,
new-episode shelf, podcast player affordances.

### 8 — Music

Jellyfin browse (albums, artists, genres, playlists), Spotify-depth search including
**lyrics search**, gapless queue playback, synced lyrics view, music request provider.

### 9 — Android

Jetpack Compose Material 3 Expressive UI, Media3 `ExoPlayer` + `MediaSessionService` for
background playback, offline downloads, dynamic colour from wallpaper and artwork.

### 10 — Release polish

Performance budgets enforced in CI (bundle size, Lighthouse on the desktop and mobile
layouts), a full accessibility audit, multi-arch image publishing (amd64 + arm64, so it
runs on a Pi or a NAS as happily as on a desktop), and release automation.
