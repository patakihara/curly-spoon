<div align="center">

# Auralis

**A Material 3 Expressive client for your home media server.**
Audiobooks · Podcasts · Music — web + Android, one backend.

</div>

---

## What it is

Auralis is a self-hosted front end for the media you already run at home:

- **Audiobooks** via [Audiobookshelf](https://www.audiobookshelf.org/) — with a built-in
  **request flow** that searches AudiobookBay (and any Prowlarr indexer), sends the grab to
  your torrent client, and drops it where Audiobookshelf will pick it up.
- **Podcasts** via Audiobookshelf's podcast libraries — subscribe, auto-download, listen.
- **Music** via [Jellyfin](https://jellyfin.org/) — with lyrics search, synced lyrics, and a
  pluggable music request provider.

## Status

Early, actively built. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what is done and what is next.

## Quick start (development)

```bash
pnpm install
pnpm dev          # server on :8787, web on :5173
```

No media server handy? Run against the fixture-backed fakes:

```bash
pnpm dev:fake
```

## Testing

```bash
pnpm test         # unit + integration (Vitest)
pnpm test:e2e     # end-to-end + UI (Playwright)
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Design language](docs/DESIGN.md)
- [Roadmap](docs/ROADMAP.md)
- [Self-hosting](docs/SELF_HOSTING.md)
- [Upstream integrations](docs/INTEGRATIONS.md)
- [Handover](docs/HANDOVER.md) — context for a Claude instance picking this up
- [My setup](docs/setup/MY_SETUP.md) — the actual media server this plugs into, and
  [host report](docs/setup/HOST_REPORT.md) / [stack excerpt](docs/setup/compose/arr-stack.excerpt.yml)

## Licence

MIT — see [LICENSE](LICENSE).
