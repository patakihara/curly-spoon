# Auralis — Roadmap

Delivery is phase by phase; each phase lands on `claude/media-client-app-k7v9by` as a
self-contained, tested increment.

| #   | Phase                                               | Status      |
| --- | --------------------------------------------------- | ----------- |
| 1   | Monorepo foundations, tooling, CI, test harness     | in progress |
| 2   | `@auralis/ui` — Material 3 Expressive design system | planned     |
| 3   | Server BFF core + Audiobookshelf client             | planned     |
| 4   | Web app shell — routing, theming, onboarding        | planned     |
| 5   | Audiobooks experience + player                      | planned     |
| 6   | Book requests — AudiobookBay, Prowlarr, torrents    | planned     |
| 7   | Podcast client                                      | planned     |
| 8   | Music client (Jellyfin) + lyrics + requests         | planned     |
| 9   | Android app (Compose + Media3)                      | planned     |
| 10  | Packaging, docs, performance & a11y polish          | planned     |

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

### 4 — Web shell

Routing, adaptive navigation, onboarding (point at your server, sign in), offline shell,
error boundaries.

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

### 10 — Polish

Docker Compose deployment, self-hosting documentation, performance budgets, accessibility
audit, release automation.
