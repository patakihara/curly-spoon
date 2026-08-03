# My setup

**Filled in on the media server, 2026-08-02**, by a Claude session running on the box
itself. Companion to [`HOST_REPORT.md`](./HOST_REPORT.md) (raw facts) and
[`compose/arr-stack.excerpt.yml`](./compose/arr-stack.excerpt.yml) (scrubbed stack).

> **This repository is public**, so this follows `docs/HANDOVER.md` §6: no credentials, no
> public hostnames, no WAN address, no remote-access identities. `«have it»` means the
> credential exists and can be handed to Auralis at runtime. Private `192.168.100.x`
> addresses are published deliberately — they are unroutable and the topology is
> unreadable without them. Public domain names are written `«public domain»`; ask the
> user, or read them from the Caddyfile on the box.

> **Updated 2026-08-03: development moved off the media server**, onto a separate laptop
> on the same Tailscale tailnet (see `docs/HANDOVER.md` §4). The facts below about what
> exists on the media server (libraries, accounts, indexers, the save-path gap) are all
> still accurate — mediaserver keeps serving the stack. What changed is _how Auralis
> reaches it_: the dev loop is no longer a container sharing mediaserver's own Docker
> network, so container-name addressing (`audiobookshelf:80`, `gluetun:8080`,
> `host.docker.internal`) no longer resolves. The three "URL Auralis will use" answers
> below are updated to the LAN/Tailscale addresses that now apply; everything else in this
> document is unchanged.

---

## Part 1 — What I already have

### Audiobookshelf (required — priority 1 and 2)

| Question                                                       | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL Auralis will use to reach it (container name or host:port) | **`http://192.168.100.34:13378`** — the dev loop runs on a separate laptop now, not a container on `arr_default`, so it uses the host-published port (reachable the same way over the private mesh VPN mentioned above; its own identity is deliberately not written here). The container-internal address (`http://audiobookshelf:80` on `arr_default`, internal port **80** — `13378` is only the host publish) still applies only if Auralis is ever deployed as a container back onto mediaserver itself. |
| Version (web UI footer, or `GET /api/status`)                  | **2.36.0** (`GET /status` → `serverVersion`). Auth is local (`authMethods: ["local"]`).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Libraries — name, type (book / podcast), rough item count      | Exactly one: **"Books"**, mediaType `book`, **231 items**, metadata provider `google`. **There is no podcast library.**                                                                                                                                                                                                                                                                                                                                                                                       |
| Host path(s) each library folder maps to                       | Library folder is `/data/Books` inside the container = **`/data/media/Books`** on the host. Whole-media bind is `/data/media -> /data`.                                                                                                                                                                                                                                                                                                                                                                       |
| Is it behind a reverse proxy / subpath (e.g. `/abs`)?          | Reachable directly on the LAN at `:13378`. Caddy also fronts it on a public subdomain at the **root path, no subpath**. Talk to it directly over `arr_default` and ignore the proxy.                                                                                                                                                                                                                                                                                                                          |
| Do other people have accounts on it?                           | **Yes — 4 accounts**: 1 `root`, 1 `admin`, 2 standard `user` accounts, all active. Family. Names omitted; they are real people.                                                                                                                                                                                                                                                                                                                                                                               |

### Jellyfin (priority 3 — music)

| Question                                             | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL Auralis will use                                 | **`http://192.168.100.34:8096`** — reached directly now that Auralis runs on a separate laptop, so the `host.docker.internal` + `extra_hosts: host-gateway` pattern (needed only when a container shares mediaserver's own Docker host) no longer applies. Jellyfin is a **host systemd service, not a container**, and listens on `0.0.0.0:8096`, which is why the plain host address works.                                                                                                                                    |
| Version                                              | **10.11.8**, startup wizard completed. (Server name omitted — it echoes the public domain.)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Is music its own library? Name and rough track count | Yes — **"Music"**, one of four libraries (Books, Movies, Music, Shows). **~548 tracks, 36 albums, 12 artists.** Small; do not design around a large collection.                                                                                                                                                                                                                                                                                                                                                                  |
| Host path the music library maps to                  | **`/data/media/Music`** (native service, so host path = real path, no container mapping).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Transcoding available (is ffmpeg configured)?        | ffmpeg ships with the Jellyfin server package, so software transcoding works. **Hardware acceleration is available but switched off**: the box has an Intel Ivy Bridge iGPU with `/dev/dri/renderD128` present, but `/etc/jellyfin/encoding.xml` has `<HardwareAccelerationType>none</HardwareAccelerationType>`. So transcodes today are CPU-bound on 4 cores that are already busy. Assume direct play/stream for music and avoid anything that leans on server-side transcode; QSV could be enabled later if it ever matters. |

### Download client

| Question                                                                                            | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which one (qBittorrent / Transmission / Deluge / SABnzbd / none)                                    | **qBittorrent** (`linuxserver/qbittorrent`).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| WebUI URL                                                                                           | **`http://192.168.100.34:8080`** — the dev loop reaches it as a plain host address now. (Background: on `arr_default` it would be `gluetun:8080`, **not** `qbittorrent:8080`, since qBittorrent runs with `network_mode: "service:gluetun"` and has no network identity of its own — relevant again only if Auralis is deployed back onto mediaserver as a container.) Credentials `«have it»`.                                                                                                       |
| **Save path where completed audiobooks must land** (host + container view)                          | Today qBittorrent saves to **`/data/Downloads`** in-container = **`/data/media/Downloads`** on the host — one **flat** directory, 181 mixed entries (films, TV, music, books together). **Audiobookshelf does not watch it.** See the gap note below — this is the most important thing on the page.                                                                                                                                                                                                  |
| Categories / labels already in use                                                                  | Nothing category-based that the request pipeline can rely on; everything lands flat in `Downloads`. A dedicated `audiobooks` category is free to take.                                                                                                                                                                                                                                                                                                                                                |
| Is it routed through a VPN, and does that VPN's network namespace also reach the rest of the stack? | **Yes** — gluetun (commercial VPN provider `«redacted»`, OpenVPN, port forwarding on). gluetun sets `FIREWALL_OUTBOUND_SUBNETS=192.168.100.0/24` and `FIREWALL_INPUT_PORTS=8080,5000`, so the LAN and the published WebUI ports stay reachable while everything else egresses through the tunnel. gluetun itself is on `arr_default`, so a container there can reach the qBittorrent WebUI at `gluetun:8080`. **Auralis must not be put inside that namespace** — it needs to reach ABS and Jellyfin. |

> ### ⚠️ The save-path gap — read this one
>
> `HANDOVER.md` calls this "the single most important answer on this page", and here the
> honest answer is that **the pipeline it assumes does not exist yet**. qBittorrent writes
> to flat `/data/media/Downloads`; Audiobookshelf watches only `/data/media/Books`. Nothing
> automatically bridges the two.
>
> Today the bridge is **manual**: the user runs Claude Code skills on this host
> (`audiobook-import`, `audiobook-narrator-tag`, `audiobook-series-tag`) that hardlink an
> author folder from `Downloads` into `Books`, normalise the folder naming, add narrator
> brackets and resolve series order. That is real curation work, not a `mv`.
>
> So "drop it where Audiobookshelf will pick it up" is an **open design decision**, not a
> known quantity. Roughly three options:
>
> 1. Dedicated qBittorrent category + save path + a **new ABS library folder** that watches
>    it. Simplest; produces an unstructured shelf next to the curated one.
> 2. Save to a staging dir, then have Auralis do the hardlink-and-rename into
>    `/data/media/Books` itself — i.e. reimplement the import skills server-side.
> 3. Hand off to Shelfarr, which already does a version of this (see Part 3).
>
> **Do not silently assume option 1 works and move on.** Ask the user; they have opinions
> about how `Books` is organised, and the existing structure is hand-maintained.

### Indexers / automation already running

Tick what exists: Prowlarr ☑ · Jackett ☐ · Lidarr ☑ · Readarr ☑ _(fork — "Bookshelf")_ ·
Sonarr/Radarr ☑ · Jellyseerr ☑ _(as Seerr)_ · slskd ☐ · Navidrome ☐ · none of these ☐

Also present and relevant: **Shelfarr** (audiobook/ebook request frontend), **deemix**
(Deezer downloader), **Byparr** (Cloudflare solver), **Bazarr**, **FileBrowser**,
**Feishin** + **Fladder** (existing Jellyfin clients), **Watchtower**.

| Question                                            | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| If Prowlarr: URL, and is AudiobookBay configured?   | `http://prowlarr:9696` (host `:9696`), API key `«have it»`. **Yes — "AudioBook Bay" is already a configured indexer.** ⚠️ The image is **`bitlessbyte/prowlarr`, not `linuxserver/prowlarr`** — a drop-in fork that patches the User-Agent specifically so ABB works. Stock Prowlarr cannot scrape it. Do not "fix" the image.                                                                                                                                                                                                                                  |
| Any other indexers you would want book results from | 11 configured: **AudioBook Bay**, **EBookBay**, **MyAnonamouse**, 1337x, BT.etree, EZTV, Internet Archive, Knaben, LimeTorrents, The Pirate Bay, TorrentsCSV. For books the useful three are ABB, EBookBay and MAM. ⚠️ **MyAnonamouse is a private tracker with ratio and hit-and-run rules** — automated grabbing can cost the account. Treat MAM as opt-in with explicit user confirmation, never a silent default. There are already two MAM helper services (a cookie helper and a search UI) sharing gluetun's namespace, which shows the account matters. |

**This settles the open question in `HANDOVER.md` §4:** Prowlarr is present _and_ already has
AudioBook Bay working. Prefer the Prowlarr path; the built-in ABB scraper drops to a
fallback and should not be the default.

### Access and networking

| Question                                                                                       | Answer                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How do you reach the server from outside (VPN / Tailscale / reverse proxy + TLS / not at all)? | Both: a mesh VPN for private services, and **Caddy + TLS on public subdomains** for the user-facing ones. Details omitted — public repo.                                                                                                                                                                                                                  |
| Reverse proxy in use (Caddy / nginx / Traefik / NPM / none)                                    | **Caddy**, custom-built image with a DNS-01 provider plugin, so certificates issue with **no inbound reachability required**. Pattern to copy: public vhosts are open; private vhosts are gated by a source-IP allowlist (LAN + the VPN's CGNAT range) and return 403 otherwise.                                                                          |
| Hostname you would want Auralis on                                                             | **Not yet decided — ask.** The stack's convention is one subdomain per service under a single apex. A new vhost is a short Caddyfile block. ⚠️ Operational note for whoever edits it: after changing the Caddyfile, **`caddy restart`, not `reload`** — the config is an atomically-replaced bind mount and reload orphans the old inode.                 |
| Docker network(s) the media stack shares                                                       | **`arr_default`** — one user-defined bridge, every stack container on it. Jellyfin is the exception (host service). **Not relevant to the current dev loop**: Auralis runs on a separate laptop and reaches everything over LAN/Tailscale instead of joining this network. Would matter again only for a container deployed back onto mediaserver itself. |
| Does the box have outbound internet? (needed for AudiobookBay, LRCLIB lyrics)                  | **Yes**, unrestricted outbound. Note the box runs a **LAN-wide DNS filter** that every household device resolves through; a handful of social domains are blackholed. Nothing media-related is blocked, and LRCLIB/ABB are unaffected — but if a domain ever resolves to `0.0.0.0` from inside a container, that is the cause, not a bug in Auralis.      |

### Usage

| Question                                                                        | Answer                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Just you, or shared with family/friends?                                        | **Shared** — 4 Audiobookshelf accounts (1 root, 1 admin, 2 standard users), family.                                                                                                                                                                                                                                                                                                                                            |
| If shared: should their requests need your approval?                            | **Not confirmed — ask the user.** But the account structure (an explicit admin tier above two plain users) means **multi-user request approval is a real requirement, not a hypothetical.** This answers `HANDOVER.md` §8 question 1 as far as the box can: build for approval, then confirm the policy. Seerr is already deployed for films/TV and has an approval model the user is used to — worth mirroring its semantics. |
| Devices you actually listen on (phone model, desktop OS, tablet, car, speakers) | **Ask.** Known from the setup: an Android phone (the user drives this host from the Claude mobile app) and a desktop that reaches the server over SSH.                                                                                                                                                                                                                                                                         |
| Do you use Chromecast / DLNA / Sonos today?                                     | **Ask.** No DLNA/Chromecast-specific service is deployed, so probably not — leaves `HANDOVER.md` §8's Chromecast question open.                                                                                                                                                                                                                                                                                                |
| Do you read ebooks too, or audio only?                                          | **Mixed, but overwhelmingly audio.** Under `/data/media/Books`: **2193 `.mp3`**, **23 `.m4b`**, **1 `.epub`**. Ebook infrastructure exists anyway (EBookBay indexer, a Readarr-fork "Bookshelf", Shelfarr handles ebooks), so ebooks are wanted at least a little — but audio is the product.                                                                                                                                  |

---

## Part 2 — What you will need to add

Narrowed to this box, per the template's promise.

### Always

- **Somewhere to run the Auralis container**, if and when it is deployed. Join
  `arr_default`, one volume for its SQLite DB. ⚠️ **Host port `8787` is already taken** by
  the `bookshelf` container (a Readarr fork) _on mediaserver_. Either pick another host
  port or — better, matching how everything else here works — publish nothing and put it
  behind Caddy on its own vhost. `5173` is free. Inside a container the BFF can still
  listen on `8787`; only the host publish conflicts.

  **This no longer bites at development time** — that EADDRINUSE gotcha was specific to
  running the dev server directly on mediaserver, which shared the host with the
  `bookshelf` container. The dev loop is now a separate laptop with no such conflict, so
  `pnpm dev`'s documented "BFF on :8787" works as written there. The port-8787 conflict
  still applies if Auralis is ever _deployed_ as a container back onto mediaserver.

- **A `SESSION_SECRET`.** Generate on the box with `openssl rand -base64 48`, keep it out
  of git. ⚠️ The existing stack has secrets **inline in `docker-compose.yml`** rather than
  in the `.env` it already has. Do not copy that habit for Auralis — put its secret in the
  `.env` file.

### If you want book requests (priority 1)

- **Torrent client: already there**, and its WebUI API is enabled and reachable at
  `gluetun:8080`. No new container. Needs a dedicated **category** (`audiobooks` is free).
- **Save path wired into ABS: NOT there.** This is the one piece of real work — see the
  gap box above. It is a design decision, not a config line.
- **Prowlarr: already there, with AudioBook Bay already configured**, on a fork that exists
  precisely to make ABB work. Prefer it; keep the scraper as a documented fallback.
- **VPN egress: already handled.** qBittorrent is inside gluetun. Auralis stays outside and
  talks to `gluetun:8080`.

### If you want music requests (priority 3)

- **slskd is not installed.** deemix **is**, and mounts `/data/media/Music` directly as its
  download dir — so a music-request path already exists end to end.
- `HANDOVER.md` chose slskd on the grounds that deemix is unmaintained, and told you to
  flag it if the user pushed back. **The user running deemix in production is that
  pushback.** Report it, do not quietly overturn either decision: the pluggable provider
  interface means supporting the deemix that is already here is one file. Recommend
  implementing the **deemix provider first** because it needs zero new infrastructure, and
  leaving slskd as the maintained-alternative escape hatch.

### If you want lyrics search

- Outbound internet works, LRCLIB is reachable, nothing to install. Note that the ~548-track
  library is small, so lyrics search will feel sparse in testing — that is the data, not the
  feature.

### Nothing needed for

- **Podcasts** — except that **there is no podcast library in Audiobookshelf yet**, so
  priority 2 has no server-side substrate to develop against. One needs to be created
  (ABS handles the feeds) before any of it can be validated against reality.
- Desktop (PWA) and Android (sideloaded APK) — unchanged.

---

## Part 3 — Anything else

**Shelfarr already exists, and it is close to what priority 1 describes.**
`ghcr.io/pedro-revez-silva/shelfarr` runs at `:5056` with
`depends_on: [prowlarr, qbittorrent, audiobookshelf]` and `/data/media` mounted — an
audiobook/ebook request frontend wired to the same three services Auralis wants. **Read it
before designing the request flow.** It is prior art on this exact stack, it shows the
integration points that already work, and it reframes the product question: Auralis's
value over Shelfarr is the unified client (audiobooks + podcasts + music, Material 3,
Android, playback), not the request plumbing on its own. Worth asking the user directly
whether Auralis should replace Shelfarr or delegate to it.

**The library shape contradicts the testing plan.** `HANDOVER.md` §4 proposes validating
range requests against "a multi-hour M4B", and worries about a user with 2,000 audiobooks.
Reality: **231 items**, **2193 `.mp3` files vs 23 `.m4b`**. The dominant format is
**many-file chaptered MP3 audiobooks**, not single-file M4B. So the real risks are
multi-file chapter assembly, cross-file progress/resume, and correct ordering — the M4B
seek path is the _minority_ case, and the perf worry is off by an order of magnitude in the
other direction. **Re-baseline the fixtures against a chaptered-MP3 item first.**

**Verify against reality before building more.** ABS 2.36.0's payloads are what
`packages/abs-client` has only ever seen as fixtures. Both `GET /api/status` and the
qBittorrent/Prowlarr/Lidarr endpoints return `401`/`403` — reachable, needing auth — so
recording real responses needs a credential from the user. That is the first ask.

**This box is small and in production.** 4 cores, 3.7 GiB RAM (~2.1 GiB free), 22
containers plus native Jellyfin, and the household actually uses it — the same machine is
the LAN's only DNS resolver. `pnpm install` + Playwright Chromium + a full e2e run is tight
here. Prefer building when nothing is streaming, do not casually restart shared services,
and never restart networking without a rollback plan (the maintainer administers this over
SSH).

**Also worth knowing:** the box already runs _two_ Jellyfin clients (Feishin for music,
Fladder) and Seerr for film/TV requests — so the user has lived with the alternatives and
has informed opinions about what is wrong with them. Ask what specifically annoys them
about Feishin; that is the most direct route to the music UI they actually want. A
co-maintainer also administers this machine and prefers Podman, so avoid hard dependencies
on Docker-only behaviour where a Podman-compatible option exists.

**What is deliberately not in this document.** Public domain names, the WAN address, the
mesh-VPN identity and node addresses, router details, and the host's own operational
runbook — all omitted because **this repository is public**. They are not needed to build
Auralis. If the repo is made private, ask the user and this can be filled in from the
host's own documentation.
