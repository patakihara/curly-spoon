# Host report

Collected 2026-08-02 on the media server itself, by a Claude session running on that box.

> **Assembled by hand, not by `scripts/collect-setup-info.sh`.** The script was blocked by
> the local permission policy (running a shell script fetched from a repo). Every fact below
> was gathered with the equivalent read-only commands, so the content matches what the
> script would have produced, minus the parts that were not safe to publish.

> **This repository is public.** Values are scrubbed accordingly: no public hostnames, no
> VPN/tracker/API credentials, no WAN address, no remote-access identities. Private
> `192.168.100.0/24` addresses are kept because they are unroutable and the topology is
> unreadable without them. Where a real value is omitted the placeholder says so.

---

## Host

```
os:      Linux 6.12.74+deb13+1-amd64 x86_64
distro:  Debian GNU/Linux 13 (trixie)
cpus:    4
memory:  3.7 GiB total, ~2.1 GiB available
```

**This is a small box, and it is busy.** 22 containers plus a native Jellyfin already run on
it. See "Build constraints" at the bottom — this is the single most likely thing to bite a
session that assumes a roomy CI sandbox.

## Disk layout

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda2       113G   46G   62G  43% /
/dev/sdb1       932G  466G  466G  50% /data/btrfs
/dev/sdb1       932G  466G  466G  50% /data/media
```

Media lives on a 932 G btrfs volume at `/data/media`, ~466 G free.

```
/data/media/Books       231 ABS items, 16 author folders
/data/media/Music       548 tracks, 36 albums, 12 artists
/data/media/Movies      14
/data/media/Shows       13
/data/media/Downloads   181 entries — flat, all content types mixed
```

## Container runtime

```
docker:  Docker version 26.1.5+dfsg1, build a72d7cd
compose: v2.26.1-4
stack:   /home/mediaserver/docker/arr/docker-compose.yml   (21 services)
```

GPU: `Intel Corporation 3rd Gen Core processor Graphics Controller` (Ivy Bridge iGPU),
`/dev/dri/renderD128` present — so QSV-capable hardware exists, though Jellyfin is not
currently configured to use it.

Three stacks live on the box; only `arr` is relevant to Auralis. The other two are a DNS
resolver and an unrelated proxy, and are deliberately not documented here.

### Running containers (relevant subset)

| Container        | Image                                      | Host port     | Relevance |
| ---------------- | ------------------------------------------ | ------------- | --------- |
| `audiobookshelf` | `ghcr.io/advplyr/audiobookshelf:latest`    | `13378 -> 80` | **Priority 1 + 2 upstream** |
| `qbittorrent`    | `linuxserver/qbittorrent:latest`           | via `gluetun` | download client |
| `gluetun`        | `qmcgaw/gluetun:latest`                    | `8080`, `5000`, `5010` | VPN namespace owner |
| `prowlarr`       | `bitlessbyte/prowlarr:latest`              | `9696`        | indexers — **see fork note** |
| `shelfarr`       | `ghcr.io/pedro-revez-silva/shelfarr:latest`| `5056 -> 80`  | **existing book-request app — prior art** |
| `bookshelf`      | `ghcr.io/pennydreadful/bookshelf:hardcover`| `8787`        | **occupies Auralis's default port** |
| `deemix`         | `ghcr.io/bambanah/deemix:latest`           | `6595`        | music downloader, already wired to the library |
| `lidarr`         | `linuxserver/lidarr:latest`                | `8686`        | music automation |
| `feishin`        | `ghcr.io/jeffvli/feishin:latest`           | `9180`        | existing Jellyfin music client |
| `byparr`         | `ghcr.io/thephaseless/byparr:latest`       | `8191`        | Cloudflare solver for indexers |
| `caddy`          | custom build                               | `80`, `443`   | reverse proxy, DNS-01 TLS |

Not containerised: **Jellyfin runs as a host systemd service.**

### Mounts that matter

```
audiobookshelf   /data/media -> /data        (library root)
                 ./audiobookshelf-config -> /config
qbittorrent      /data/media/Downloads -> /data/Downloads
shelfarr         /data/media -> /data
deemix           /data/media/Music -> /downloads
```

### Networks

```
arr_default   bridge   <- every container above
host          host
```

Jellyfin is **not** on `arr_default`; it is on the host network stack.

## Service reachability

Probed from the host:

```
audiobookshelf   http://localhost:13378/healthcheck              200
audiobookshelf   http://localhost:13378/api/status               401  (reachable, needs auth)
jellyfin         http://localhost:8096/System/Info/Public        200
qbittorrent      http://localhost:8080/api/v2/app/version        403  (reachable, needs auth)
prowlarr         http://localhost:9696/api/v1/system/status      401  (reachable, needs auth)
lidarr           http://localhost:8686/api/v1/system/status      401  (reachable, needs auth)
deemix           http://localhost:6595/                          200
slskd            —                                              not installed
navidrome        —                                              not installed
transmission     —                                              not installed
```

Listeners confirmed on `0.0.0.0` for both `8096` (Jellyfin) and `13378` (ABS).

## Versions

```
audiobookshelf:  2.36.0        (GET /status -> serverVersion)
jellyfin:        10.11.8       (server name «redacted — echoes the public domain»)
```

Record these in any fixture you re-baseline — `docs/HANDOVER.md` is right that ABS payloads
drift between versions.

## How Auralis must address each upstream

This is non-uniform, and a session that assumes one mechanism will be wrong twice.

| Upstream       | From a container on `arr_default` | Why |
| -------------- | --------------------------------- | --- |
| Audiobookshelf | `http://audiobookshelf:80`        | internal port is **80**; `13378` is only the host publish |
| qBittorrent    | `http://gluetun:8080`             | it has `network_mode: service:gluetun`, so **`qbittorrent` is not a resolvable name** |
| Prowlarr       | `http://prowlarr:9696`            | normal |
| Jellyfin       | `http://host.docker.internal:8096` with `extra_hosts: ["host.docker.internal:host-gateway"]` | host service, **never** a container name |

The `caddy` service already declares that `extra_hosts` line — copy the pattern.

## Ports

`8787`, the port `docs/HANDOVER.md` and the README use for the BFF, is **taken** by the
`bookshelf` container. `5173` (the Vite dev port) is free.

## Build constraints

4 CPUs and ~2.1 GiB RAM available, with 22 containers plus Jellyfin already resident. A
full `pnpm install` plus a Playwright Chromium download and an e2e run is tight on this box
and may contend with live services the household is using. Prefer building images or running
the heavy suite when nothing is streaming, and expect `pnpm test:e2e` to be slower than in a
cloud sandbox. `better-sqlite3` and `esbuild` compile from source here.

---

Narrative answers, and the things this report cannot know, are in
[`MY_SETUP.md`](./MY_SETUP.md). A scrubbed excerpt of the stack definition is in
[`compose/arr-stack.excerpt.yml`](./compose/arr-stack.excerpt.yml).
