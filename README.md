<div align="center">

# Auralis

**A self-hosted client for your home media server — audiobooks, podcasts and music, one
backend, web and native Android.**

</div>

---

## What it is

Auralis is the front end for the media you already run at home. It doesn't store or serve
media itself — it's a client for:

- **Audiobooks**, via [Audiobookshelf](https://www.audiobookshelf.org/) — with a request
  flow that searches Prowlarr indexers (or scrapes AudiobookBay as a fallback), sends the
  grab to your torrent client, and drops it where Audiobookshelf will pick it up.
- **Podcasts**, via Audiobookshelf's podcast libraries — subscribe, auto-download, listen.
- **Music**, via [Jellyfin](https://jellyfin.org/) — with lyrics search and synced lyrics,
  and a pluggable music request provider (slskd today; the interface is written so a
  different backend is a new file, not a refactor).

On top of that: **personalized recommendations** that mix items already in your library
with external discovery, so "For You" isn't just your own collection re-sorted; and
**global search with suggestions** across everything Auralis knows about.

It ships two clients against one identical typed API — a web app (installable as a PWA,
with an offline shell and OS media-key integration) and a native Android app (Compose +
Media3, with background playback, offline downloads and Android Auto).

## Status

Actively built, not finished. Audiobooks, podcasts, music, requests and recommendations
work end to end on both web and Android. Two things are honestly incomplete right now:

- **The visual design is mid-migration.** A new design system (internally "Sonora") is
  being adopted component by component; some screens reflect it and some don't yet.
- **Android's UI is not verified on a real device.** CI runs JVM unit tests and, for
  Compose UI, semantics assertions under Robolectric (a JVM shadow of the Android
  framework) — that catches a missing accessibility label or a broken layout invariant,
  not what the screen actually looks like or how TalkBack reads it on hardware.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phase-by-phase detail behind both of
those.

## Install

Auralis needs an [Audiobookshelf](https://www.audiobookshelf.org/) server to point at
(required), and optionally a [Jellyfin](https://jellyfin.org/) server for music. Installing
it without something to connect to leaves it with nothing to show.

It is **not** on Google Play, and it is deliberately not submitted to the official F-Droid
repository or to IzzyOnDroid (IzzyOnDroid's inclusion policy opposes AI-authored apps, and
this project is largely written by Claude subagents). Getting it onto a phone or a server
means one of the routes below.

### Android

Auralis distributes itself as a **self-hosted F-Droid repository**. A repository is what a
client like [Droid-ify](https://github.com/Iamlooker/Droid-ify) adds as a source, so
installs and future updates both come through the client rather than a one-off APK
download.

1. In Droid-ify: **Settings → Repositories → `+`**, and add
   `https://patakihara.github.io/curly-spoon/repo`
2. Install Auralis from the repo. Updates then arrive the same way as any other F-Droid app.

Prefer [Obtainium](https://github.com/ImranR98/Obtainium) instead? It consumes
[GitHub Releases](https://github.com/patakihara/curly-spoon/releases) directly, so point it
at this repository and it will track tagged releases without the repository step above.

The application id is `net.develivarr.auralis`. [`docs/FDROID_REPO.md`](docs/FDROID_REPO.md)
has the full operator's-eye view of how the repository is built and signed, if you're
curious or running your own fork.

### Web / server (Docker)

One container serves the API and the web UI on a single port.
[`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md) is the full guide — reverse proxying,
joining an existing arr-stack compose file, release channels; the minimum to see it
running:

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

Then open `http://<host>:8787` and finish setup in the browser — point it at
Audiobookshelf, sign in, and optionally add Jellyfin, a torrent client and indexers.

CI publishes `ghcr.io/patakihara/auralis:latest` (and a per-commit `:<sha>` tag) on every
green build of `main`, so `docker compose pull` always gets the current build.

## Why a backend at all

Audiobookshelf and Jellyfin don't emit CORS headers for arbitrary origins, so a pure
browser client can't talk to them directly from a third-party origin. AudiobookBay has no
API and can only be scraped server-side. And indexer, torrent-client and slskd credentials
must never ship inside a browser bundle or an APK. So a thin Fastify BFF sits between the
clients and the media servers — it's the only thing that holds credentials, and it's the
one place request logic and recommendation scoring live, so web and Android consume one
identical typed API instead of reimplementing behaviour twice.

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

`apps/android` is built and tested by its own Gradle toolchain (`android.yml` in CI runs
`./gradlew test assembleDebug`), not by the commands above.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Design language](docs/DESIGN.md) — and the in-progress Sonora migration,
  [`docs/design/SONORA.md`](docs/design/SONORA.md)
- [Roadmap](docs/ROADMAP.md)
- [Self-hosting](docs/SELF_HOSTING.md)
- [F-Droid repository](docs/FDROID_REPO.md)
- [Upstream integrations](docs/INTEGRATIONS.md)
- [Handover](docs/HANDOVER.md) — context for a Claude instance picking this up
- [My setup](docs/setup/MY_SETUP.md) — the actual media server this plugs into, and
  [host report](docs/setup/HOST_REPORT.md) / [stack excerpt](docs/setup/compose/arr-stack.excerpt.yml)

## Licence

MIT — see [LICENSE](LICENSE).
