# Auralis — Architecture

Auralis is a self-hosted **audiobook, podcast and music client** for a home media server,
delivered as a **web app (PWA)** and a **native Android app**, sharing one backend.

## Priorities

| Prio | Domain     | Backing service | Request/acquisition integration                              |
| ---- | ---------- | --------------- | ------------------------------------------------------------ |
| 1    | Audiobooks | Audiobookshelf  | Prowlarr indexers (primary), AudiobookBay scraper (fallback) |
| 2    | Podcasts   | Audiobookshelf  | RSS / iTunes + podcastindex search                           |
| 3    | Music      | Jellyfin        | Pluggable (slskd / deemix-compatible)                        |

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
        (Prowlarr, AudiobookBay fallback)
```

### Why a BFF and not direct-to-server calls?

1. **Secrets stay server-side.** Indexer credentials, torrent-client passwords and the
   Jellyfin/ABS API keys are never shipped to a browser or an APK.
2. **CORS and mixed-content.** Audiobookshelf and Jellyfin do not emit CORS headers for
   arbitrary origins; a browser client would be blocked. The BFF proxies.
3. **Indexer access.** Prowlarr is the primary way audiobook releases are found: it already
   sits behind a FlareSolverr-compatible challenge solver, which is how it gets through
   AudiobookBay's Cloudflare protection. A direct BFF-side scrape cannot do that delegation,
   so the AudiobookBay scraper is the fallback for installs without Prowlarr configured, not
   the primary path — and it, too, can only run server-side.
4. **One contract, two clients.** Web and Android consume the identical typed API, so
   feature parity is structural rather than aspirational.

The BFF is deliberately **thin**: it does not re-model the upstream domain, it normalises
it. Playback bytes are streamed through with range-request passthrough.

## Workspace layout

```
packages/
  core/             domain model, zod schemas, pure logic (player state machine, formatting)
  ui/               @auralis/ui — Material 3 Expressive design language, component layer
                    migrating to Mantine (see "Component implementation" below)
  abs-client/       typed Audiobookshelf client
apps/
  server/           Fastify BFF
  web/              React 19 + Vite PWA
  android/          Kotlin + Jetpack Compose + Media3
e2e/                Playwright end-to-end + UI tests
```

There is no `packages/jellyfin-client/` — Jellyfin is Phase 9 (Music) and Phase 9 has not
started (see `docs/ROADMAP.md`); no Jellyfin API client exists anywhere in the repo yet.
Today `packages/abs-client/` is the only typed upstream client; a Jellyfin equivalent is
expected to land alongside Phase 9's work, most likely as its own `packages/jellyfin-client/`
following the same pattern, but that is a plan, not present code.

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

### Component implementation

The design language above is the target; it is unchanged. The **components** that realise
it in `packages/ui` are migrating from a hand-built set (`Button`, `Card`, `Sheet`, `Icon`,
etc.) to [Mantine](https://mantine.dev) (`@mantine/core`) — confirmed by the user as a full
migration, not a partial spike, on 2026-08-04. Theming bridges the two systems by deriving a
Mantine colour ramp from the same artwork-derived M3 primary colour the rest of the shell
uses (`packages/ui/src/theme/mantineColors.ts`, wired up in
`packages/ui/src/theme/ThemeProvider.tsx`); other token families (type, shape, motion,
spacing) are still applied as CSS custom properties independent of Mantine's theme object
as of this writing. See `docs/DESIGN.md`'s "Implementation layer" section for the full
detail, and `docs/HANDOVER.md`'s "Mantine" section for the migration's status and history.

## Testing strategy (TDD)

| Layer                    | Tool       | What it proves                             |
| ------------------------ | ---------- | ------------------------------------------ |
| Pure logic, clients, BFF | Vitest     | Behaviour, protocol shapes, edge cases     |
| Design system components | Playwright | Rendering, states, a11y, visual regression |
| Full flows               | Playwright | Onboarding → browse → play → request       |

Tests are written **before** the implementation of each unit of behaviour. Upstream
services are replaced by fixture-backed fakes (`apps/server/src/testSupport/fakes`), which double as
the offline development environment: `pnpm dev:fake` boots the whole app with no media
server present.
