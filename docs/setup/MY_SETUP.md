# My setup

**Template — fill this in on the media server and commit it.** Pair it with
`docs/setup/HOST_REPORT.md`, produced by `./scripts/collect-setup-info.sh`.

> **Do not commit real passwords, API keys or tokens.** Write `«have it»` where a
> credential exists — Auralis reads secrets from its own encrypted store at runtime, never
> from the repo. Internal hostnames and ports are fine if the repo is private; if you would
> rather not, write `«internal»` and describe the topology instead.

---

## Part 1 — What I already have

### Audiobookshelf (required — priority 1 and 2)

| Question                                                       | Answer |
| -------------------------------------------------------------- | ------ |
| URL Auralis will use to reach it (container name or host:port) |        |
| Version (web UI footer, or `GET /api/status`)                  |        |
| Libraries — name, type (book / podcast), rough item count      |        |
| Host path(s) each library folder maps to                       |        |
| Is it behind a reverse proxy / subpath (e.g. `/abs`)?          |        |
| Do other people have accounts on it?                           |        |

### Jellyfin (priority 3 — music)

| Question                                             | Answer |
| ---------------------------------------------------- | ------ |
| URL Auralis will use                                 |        |
| Version                                              |        |
| Is music its own library? Name and rough track count |        |
| Host path the music library maps to                  |        |
| Transcoding available (is ffmpeg configured)?        |        |

### Download client

| Question                                                                                            | Answer |
| --------------------------------------------------------------------------------------------------- | ------ |
| Which one (qBittorrent / Transmission / Deluge / SABnzbd / none)                                    |        |
| WebUI URL                                                                                           |        |
| **Save path where completed audiobooks must land** (host + container view)                          |        |
| Categories / labels already in use                                                                  |        |
| Is it routed through a VPN, and does that VPN's network namespace also reach the rest of the stack? |        |

The save path is the single most important answer on this page. Auralis hands a magnet to
your client with a save path and a category; if that path is not one Audiobookshelf scans,
the request pipeline silently does nothing useful.

### Indexers / automation already running

Tick what exists: Prowlarr ☐ · Jackett ☐ · Lidarr ☐ · Readarr ☐ · Sonarr/Radarr ☐ ·
Jellyseerr ☐ · slskd ☐ · Navidrome ☐ · none of these ☐

| Question                                            | Answer |
| --------------------------------------------------- | ------ |
| If Prowlarr: URL, and is AudiobookBay configured?   |        |
| Any other indexers you would want book results from |        |

### Access and networking

| Question                                                                                       | Answer |
| ---------------------------------------------------------------------------------------------- | ------ |
| How do you reach the server from outside (VPN / Tailscale / reverse proxy + TLS / not at all)? |        |
| Reverse proxy in use (Caddy / nginx / Traefik / NPM / none)                                    |        |
| Hostname you would want Auralis on                                                             |        |
| Docker network(s) the media stack shares                                                       |        |
| Does the box have outbound internet? (needed for AudiobookBay, LRCLIB lyrics)                  |        |

### Usage

| Question                                                                        | Answer |
| ------------------------------------------------------------------------------- | ------ |
| Just you, or shared with family/friends?                                        |        |
| If shared: should their requests need your approval?                            |        |
| Devices you actually listen on (phone model, desktop OS, tablet, car, speakers) |        |
| Do you use Chromecast / DLNA / Sonos today?                                     |        |
| Do you read ebooks too, or audio only?                                          |        |

---

## Part 2 — What you will need to add

Based on what you tick above, here is what is actually missing. I will narrow this once I
can read your answers — this is the full conditional list.

### Always

- **A place to run the Auralis container.** One image, one port (`8787`), one volume for
  its SQLite database. It needs network reachability to Audiobookshelf, and ideally sits on
  the same Docker network so it can use container names instead of host ports.
- **A `SESSION_SECRET`** — 32+ random characters. This signs sessions _and_ keys the
  AES-256-GCM encryption of the upstream credentials Auralis stores. Generate with
  `openssl rand -base64 48`. Changing it later invalidates every stored credential.

### If you want book requests (priority 1, the thing you asked for first)

- **A torrent client with its WebUI API enabled.** qBittorrent is the best-supported path.
  If you already run one for other things, no new container — just a dedicated **category**
  (e.g. `audiobooks`) and a save path Audiobookshelf watches.
- **A save path wired into Audiobookshelf.** Either point the client at an existing ABS
  library folder, or add a new ABS library for it. Auralis triggers the scan after import,
  but it cannot make ABS watch a folder it has never been told about.
- **Optional but recommended: Prowlarr.** If you already run it, Auralis will prefer it and
  keep the AudiobookBay scraper as a fallback — Prowlarr gives you retries, multiple
  indexers and no dependence on a scraped site's markup surviving a redesign. If you do not
  run it, the built-in AudiobookBay provider works standalone; it is just more brittle.
- **Consider how that client egresses.** You are pulling from a public tracker. Most people
  running this put the torrent client behind a VPN container. If yours already is, tell me
  the network topology, because Auralis needs to reach its WebUI, which may sit inside that
  VPN's network namespace.

### If you want music requests (priority 3)

- **slskd** — a Soulseek daemon with an HTTP API. This is the piece you almost certainly do
  not have yet. It is one container plus a Soulseek account, and it needs a download
  directory that Jellyfin scans.
- I chose slskd over **deemix** deliberately: deemix is unmaintained. The provider
  interface is pluggable, so if you specifically want deemix (or Lidarr with a deemix
  indexer, which some people run), say so and it is one file rather than a redesign.

### If you want lyrics search (the Spotify feature you called out)

- **Outbound internet from the container**, for LRCLIB. No account, no API key, no cost.
  Responses are cached locally. If the box is fully airgapped, the feature degrades to
  "lyrics only where Jellyfin already has them embedded".

### Nothing needed for

- Podcasts — Audiobookshelf already does the feed handling; Auralis is the client.
- Desktop — it is the same web app, installable as a PWA. No extra install.
- Android — one APK, sideloaded, pointed at your Auralis URL.

---

## Part 3 — Anything else

Free text. Constraints, things that annoy you about your current apps, things you tried
before that did not work, hardware quirks, "this box also runs X and I do not want to
disturb it". Unstructured context here is genuinely useful — the more I know about how you
actually listen, the fewer wrong assumptions end up baked into the UI.
