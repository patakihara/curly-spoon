# Auralis — Self-hosting

Auralis is one container plus a config file. It does not store your media, does not
duplicate your library, and does not need to be on the same host as your media server — it
only needs to be able to reach it.

## What you need

| Requirement      | Why                                         |
| ---------------- | ------------------------------------------- |
| Audiobookshelf   | Audiobooks and podcasts (priority 1 and 2)  |
| Jellyfin         | Music (priority 3) — optional               |
| A torrent client | Book requests — qBittorrent or Transmission |
| A slskd instance | Music requests — optional                   |

Everything except Audiobookshelf is optional; features whose backing service is not
configured are hidden rather than shown broken.

## Deploy

```yaml
# compose.yaml
services:
  auralis:
    image: ghcr.io/patakihara/auralis:latest
    ports: ['8787:8787']
    environment:
      SESSION_SECRET: '<32+ random characters>'
      DATA_DIR: /data
    volumes:
      - ./auralis-data:/data
    restart: unless-stopped
```

Then open `http://<host>:8787` and complete setup in the browser: point Auralis at your
Audiobookshelf URL, sign in with your Audiobookshelf account, and optionally add Jellyfin,
your torrent client and your indexers.

Credentials you enter are encrypted at rest with a key derived from `SESSION_SECRET` and
are never returned by the API — not even to an authenticated admin client.

## Joining an existing arr-stack compose file

If you already run Audiobookshelf, Prowlarr, qBittorrent and friends in one big
`docker-compose.yml` — the common "arr stack" pattern — you can add Auralis as another
service in that same file instead of running it as a second, separate compose project.

Two things differ from the standalone deploy above:

- **Build from a checkout, not this repo's root.** `build: .` above assumes the compose
  file lives in this repo. An arr stack's compose file usually lives elsewhere (e.g.
  `~/docker/arr/docker-compose.yml`), so clone Auralis somewhere on the host (e.g.
  `~/src/auralis-src`) and point `build:` at that path instead.
- **No network configuration needed.** A typical arr-stack compose file has no explicit
  top-level `networks:` block, which means every service in it already shares Compose's own
  implicit default network (named `<directory-name>_default`). Adding Auralis to the same
  file puts it on that network automatically — reach the other services by container name
  and their _internal_ port (e.g. `http://audiobookshelf:80`, not whatever host port it
  publishes), rather than a LAN IP. That's the main benefit of joining an existing stack
  instead of running standalone: onboarding can point straight at `http://audiobookshelf:80`
  instead of `192.168.x.x:13378`.

Reuse the stack's existing `.env` for secrets rather than introducing a separate one for
Auralis — reference `SESSION_SECRET` the same way the other services already reference
their own secrets:

```yaml
# added to the arr stack's existing docker-compose.yml
services:
  # ...existing services (audiobookshelf, prowlarr, qbittorrent, etc.)...

  auralis:
    container_name: auralis
    build: /home/you/src/auralis-src
    restart: unless-stopped
    environment:
      SESSION_SECRET: ${AURALIS_SESSION_SECRET}
      DATA_DIR: /data
    volumes:
      - ./auralis-data:/data
    ports:
      - '5173:8787'
```

`5173:8787` is just an example host port unlikely to collide with the rest of the stack —
swap it for whatever's actually free against your own compose file's existing `ports:`
entries.

One thing _not_ to copy from the neighbouring services: Auralis doesn't need `PUID`/`PGID`.
Those are a linuxserver.io-image convention; Auralis's container runs as its own baked-in
non-root user, so setting them does nothing.

## Release channels

There are two ways to get the image, and they update differently:

| Channel                  | Written by                         | Updates                                    | Pick this if                                                                                                                                                                                 |
| ------------------------ | ---------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:latest`                | Every green build of `main`        | Continuously, on every merged change       | You want the newest working code and are fine tracking active development. This is what the compose snippet above uses, and what mediaserver's own Watchtower auto-updates from — unchanged. |
| `:stable` / `:<version>` | Pushing a `v*` tag (e.g. `v0.2.0`) | Only when a version is deliberately tagged | You want to pin a specific, named version and upgrade on your own schedule, with a changelog to read before you do.                                                                          |

`:stable` always points at the most recently tagged release; `:<version>` (e.g. `:0.2.0`) pins
one exact release forever, the way most self-hosted software expects a version tag to behave.
Both are multi-arch (`linux/amd64` + `linux/arm64`), same as `:latest`.

To switch a running deployment from continuous to tagged releases, change one line in
`compose.yaml`:

```diff
- image: ghcr.io/patakihara/auralis:latest
+ image: ghcr.io/patakihara/auralis:stable
```

Each tagged release also gets a [GitHub Release](https://github.com/patakihara/curly-spoon/releases)
with a changelog and a **release-signed** Android APK attached, for anyone who'd rather sideload
a named version than build from a checkout or run against whatever `android.yml` last built on
`main`.

That APK is signed with the app signing key held in the `ANDROID_KEYSTORE_*` secrets, so it
updates in place like any normally-distributed app. This paragraph used to say _debug_-signed,
which was true when written and became wrong once `release.yml` grew a signing config —
and it mattered: a debug-signed release is signed with a keystore CI regenerates per run, so
each build would carry a different certificate and the second install would fail with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. See `docs/FDROID_REPO.md` for the key's storage and
rotation notes.

## Reverse proxy

Auralis speaks plain HTTP and expects to sit behind your existing TLS terminator. It
honours `X-Forwarded-*`. Range requests must be passed through untouched or seeking in long
audiobooks will break:

```nginx
location / {
  proxy_pass http://auralis:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
}
```

## The request pipeline

```
you search  →  indexer (AudiobookBay / Prowlarr)
            →  you pick a release
            →  Auralis sends the magnet to your torrent client
               with the save path and category you configured
            →  the client downloads into your Audiobookshelf folder
            →  Auralis triggers a library scan
            →  it appears in your library
```

Auralis never downloads anything itself and never proxies torrent traffic; it hands work to
the client you already run. Requests can require approval, so shared users can ask for a
book without being able to fill your disk.

## Environment variables

| Variable                 | Default | Meaning                                           |
| ------------------------ | ------- | ------------------------------------------------- |
| `PORT`                   | `8787`  | HTTP listen port                                  |
| `DATA_DIR`               | `/data` | SQLite database and cache location                |
| `SESSION_SECRET`         | —       | **Required.** Session signing + secret encryption |
| `AURALIS_FAKE_UPSTREAMS` | `0`     | Boot against built-in fakes; for development only |

## Android

The Android app points at the same Auralis URL. It downloads for offline listening,
plays in the background through a media session, and syncs progress back to
Audiobookshelf, so a book continued on your phone resumes correctly in the browser.
