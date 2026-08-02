# Auralis — Architecture

Auralis is a self-hosted **audiobook, podcast and music client** for a home media server,
delivered as a **web app (PWA)** and a **native Android app**, sharing one backend.

## Priorities

| Prio | Domain     | Backing service | Request/acquisition integration           |
| ---- | ---------- | --------------- | ----------------------------------------- |
| 1    | Audiobooks | Audiobookshelf  | AudiobookBay (primary), Prowlarr indexers |
| 2    | Podcasts   | Audiobookshelf  | RSS / iTunes + podcastindex search        |
| 3    | Music      | Jellyfin        | Pluggable (slskd / deemix-compatible)     |

## Topology

```
┌──────────────┐        ┌──────────────┐
│  Web (PWA)   │        │   Android    │
│ React + Vite │        │Compose+Media3│
└──────┬───────┘        └──────┬───────┘
       │      HTTPS/JSON       │
       └───────────┬───────────┘
                   ▼
          ┌──────────────────┐
          │  Auralis server  │  Fastify BFF
          │  (apps/server)   │  auth · secrets · aggregation · streaming proxy
          └───┬───┬───┬───┬──┘
              │   │   │   └──────────────┐
   Audiobookshelf │  Jellyfin       Download clients
                  │                 (qBittorrent / Transmission)
             Indexers
        (AudiobookBay, Prowlarr)
```

### Why a BFF and not direct-to-server calls?

1. **Secrets stay server-side.** Indexer credentials, torrent-client passwords and the
   Jellyfin/ABS API keys are never shipped to a browser or an APK.
2. **CORS and mixed-content.** Audiobookshelf and Jellyfin do not emit CORS headers for
   arbitrary origins; a browser client would be blocked. The BFF proxies.
3. **Scraping.** AudiobookBay can only be scraped server-side.
4. **One contract, two clients.** Web and Android consume the identical typed API, so
   feature parity is structural rather than aspirational.

The BFF is deliberately **thin**: it does not re-model the upstream domain, it normalises
it. Playback bytes are streamed through with range-request passthrough.

## Workspace layout

```
packages/
  core/             domain model, zod schemas, pure logic (player state machine, formatting)
  ui/               @auralis/ui — Material 3 Expressive design system (React)
  abs-client/       typed Audiobookshelf client
  jellyfin-client/  typed Jellyfin client
apps/
  server/           Fastify BFF
  web/              React 19 + Vite PWA
  android/          Kotlin + Jetpack Compose + Media3
e2e/                Playwright end-to-end + UI tests
```

Every network-facing package is written against an injectable `fetch`, so the whole stack
is testable without a live media server.

## Design language

Material 3 **Expressive** (the 2025/2026 revision), tuned by three references:

- **YouTube Music** — split-view Now Playing, thick interactive progress bar, icon-only
  toggles, bottom-sheet-first navigation, queue reachable by upward swipe.
- **Symfonium** — dynamic theme derived from the current artwork.
- **Spotify** — search depth, in particular lyrics search.
- **Claude** — restrained typographic rhythm, generous spacing, warm neutrals.

Implementation notes live in [`docs/DESIGN.md`](./DESIGN.md).

## Testing strategy (TDD)

| Layer                    | Tool       | What it proves                             |
| ------------------------ | ---------- | ------------------------------------------ |
| Pure logic, clients, BFF | Vitest     | Behaviour, protocol shapes, edge cases     |
| Design system components | Playwright | Rendering, states, a11y, visual regression |
| Full flows               | Playwright | Onboarding → browse → play → request       |

Tests are written **before** the implementation of each unit of behaviour. Upstream
services are replaced by fixture-backed fakes (`apps/server/test/fakes`), which double as
the offline development environment: `pnpm dev:fake` boots the whole app with no media
server present.
