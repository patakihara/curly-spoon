# Auralis — Self-hosting

Auralis is one container plus a config file. It does not store your media, does not
duplicate your library, and does not need to be on the same host as your media server — it
only needs to be able to reach it.

## What you need

| Requirement                | Why                                             |
| -------------------------- | ----------------------------------------------- |
| Audiobookshelf             | Audiobooks and podcasts (priority 1 and 2)      |
| Jellyfin                   | Music (priority 3) — optional                   |
| A torrent client           | Book requests — qBittorrent or Transmission     |
| A slskd instance           | Music requests — optional                       |

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

| Variable                | Default | Meaning                                            |
| ----------------------- | ------- | -------------------------------------------------- |
| `PORT`                  | `8787`  | HTTP listen port                                   |
| `DATA_DIR`              | `/data` | SQLite database and cache location                 |
| `SESSION_SECRET`        | —       | **Required.** Session signing + secret encryption   |
| `AURALIS_FAKE_UPSTREAMS`| `0`     | Boot against built-in fakes; for development only  |

## Android

The Android app points at the same Auralis URL. It downloads for offline listening,
plays in the background through a media session, and syncs progress back to
Audiobookshelf, so a book continued on your phone resumes correctly in the browser.
