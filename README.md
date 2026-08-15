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

## Install

Auralis is a **client** — it needs an [Audiobookshelf](https://www.audiobookshelf.org/) server
to point at (required), and optionally a [Jellyfin](https://jellyfin.org/) server for music.
It doesn't store or serve media itself; installing it without something to connect to leaves
it with nothing to show.

It is not on Google Play or the official F-Droid repo. Getting it onto a phone or a server
means one of the routes below.

### Android

Auralis distributes itself as a **self-hosted F-Droid repository** rather than through
IzzyOnDroid or official F-Droid (`docs/research/FDROID_DISTRIBUTION.md` has why — in short,
IzzyOnDroid's inclusion policy opposes AI-authored apps, and self-hosting is F-Droid's own
sanctioned route for anything outside its criteria). A repository is what a client like
[Droid-ify](https://github.com/Iamlooker/Droid-ify) adds as a source, so installs and future
updates both come through the client rather than a one-off APK download.

1. In Droid-ify: **Settings → Repositories → `+`**, and add
   `https://patakihara.github.io/curly-spoon/repo`
2. Install Auralis from the repo. Updates then arrive the same way as any other F-Droid app.

Prefer [Obtainium](https://github.com/ImranR98/Obtainium) instead? It consumes
[GitHub Releases](https://github.com/patakihara/curly-spoon/releases) directly, so point it at
this repository and it will track tagged releases without the repository step above.

**Not live yet.** Both routes publish on a pushed `v*` tag, and none has been pushed —
`docs/FDROID_REPO.md` has the remaining setup steps. Once the first tag lands, the repo URL
and the Releases page above start serving real builds; nothing about these instructions
changes when that happens.

### Web / server (Docker)

One container serves the API and the web UI on a single port. [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md)
is the full guide — reverse proxying, joining an existing arr-stack compose file, release
channels; the minimum to see it running:

```yaml
# compose.yaml
services:
  auralis:
    image: ghcr.io/patakihara/auralis:latest
    ports: ['8787:8787']
    environment:
      SESSION_SECRET: '<32+ random characters>' # required — encrypts stored upstream credentials
      DATA_DIR: /data
    volumes:
      - ./auralis-data:/data
    restart: unless-stopped
```

Then open `http://<host>:8787` and finish setup in the browser — point it at Audiobookshelf,
sign in, and optionally add Jellyfin, a torrent client and indexers.

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
