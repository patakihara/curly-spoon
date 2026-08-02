# Auralis — Upstream integration reference

Verified endpoint shapes for every service Auralis talks to. Kept here so the clients in
`packages/*` and the request providers in `apps/server` are written against reality rather
than guesswork.

---

## Audiobookshelf (audiobooks + podcasts)

Auth: `Authorization: Bearer <token>`, obtained from `POST /login`.

| Purpose               | Endpoint                                                     |
| --------------------- | ------------------------------------------------------------ |
| Login                 | `POST /login`                                                 |
| Libraries             | `GET /api/libraries`                                          |
| Items (paged)         | `GET /api/libraries/:id/items?limit&page&sort&desc&filter`    |
| Home shelves          | `GET /api/libraries/:id/personalized`                         |
| Series / collections  | `GET /api/libraries/:id/series`, `/collections`, `/playlists` |
| Search                | `GET /api/libraries/:id/search?q&limit`                       |
| Item detail           | `GET /api/items/:id?expanded=1&include=progress`              |
| Cover                 | `GET /api/items/:id/cover?width&height&format`                |
| Start playback        | `POST /api/items/:id/play[/:episodeId]`                       |
| Sync / close session  | `POST /api/session/:id/sync`, `POST /api/session/:id/close`   |
| Progress              | `GET /api/me/progress/:id`, `PATCH /api/me/progress/:itemId`  |
| In progress           | `GET /api/me/items-in-progress`                               |
| Bookmarks             | `POST|PATCH /api/me/item/:id/bookmark`, `DELETE …/bookmark/:time` |
| Audio bytes (Range)   | `GET /api/items/:id/file/:fileId`                             |
| Podcast feed search   | `POST /api/podcasts/feed`, `GET /api/search/podcast`          |
| Podcast episodes      | `GET /api/podcasts/:id/episode/:episodeId`, `POST /api/podcasts/:id/download-episodes` |
| New episodes shelf    | `GET /api/libraries/:id/recent-episodes`                      |
| Trigger scan          | `POST /api/libraries/:id/scan`                                |

Realtime updates arrive over Socket.io on the same origin.

---

## Jellyfin (music)

Auth: `POST /Users/AuthenticateByName` → `AccessToken`. Subsequent requests carry:

```
Authorization: MediaBrowser Token="…", Client="Auralis", Device="…", DeviceId="…", Version="…"
```

| Purpose            | Endpoint                                                        |
| ------------------ | --------------------------------------------------------------- |
| Authenticate       | `POST /Users/AuthenticateByName`                                 |
| System info        | `GET /System/Info/Public` (used to validate a URL during setup)  |
| Views              | `GET /UserViews`                                                 |
| Albums / artists   | `GET /Items?IncludeItemTypes=MusicAlbum|MusicArtist&Recursive=true` |
| Album tracks       | `GET /Items?ParentId=…&SortBy=ParentIndexNumber,IndexNumber`     |
| Playlists          | `GET /Items?IncludeItemTypes=Playlist`                           |
| Search             | `GET /Items?searchTerm=…&Recursive=true`                         |
| Artwork            | `GET /Items/:id/Images/Primary?maxWidth&quality`                 |
| Stream             | `GET /Audio/:id/universal` (transcoding-aware) or `/Audio/:id/stream` (direct) |
| Lyrics             | `GET /Audio/:id/Lyrics`                                          |
| Playback reporting | `POST /Sessions/Playing`, `/Progress`, `/Stopped`                |
| Favourites         | `POST|DELETE /Users/:userId/FavoriteItems/:id`                   |

---

## LRCLIB (lyrics, including lyrics **search**)

Public, no auth, no key. Base `https://lrclib.net/api`.

| Purpose                         | Endpoint                                                     |
| ------------------------------- | ------------------------------------------------------------ |
| Exact match (preferred)         | `GET /get?artist_name&track_name&album_name&duration`         |
| Fuzzy lookup                    | `GET /search?track_name&artist_name&album_name`               |
| **Free-text / lyric-line search** | `GET /search?q=<any words, including a lyric line>`         |

Responses carry both `plainLyrics` and `syncedLyrics` (LRC format). The `q` form is what
makes Spotify-style "search by a line you remember" possible; Auralis intersects those
results with the local Jellyfin library so a hit is playable, and offers it as a request
when it is not.

A polite `User-Agent` is required. Auralis caches responses in SQLite and honours
rate limits; the entire lyrics layer is optional and degrades to "no lyrics" cleanly.

---

## AudiobookBay (book requests, primary source)

No API — HTML, scraped server-side.

| Purpose        | URL                                                     |
| -------------- | ------------------------------------------------------- |
| Search         | `/page/{n}/?s={query}&tt={types}`                       |
| Browse by type | `/audio-books/type/{category}/{page}/`                  |
| Browse by tag  | `/audio-books/tag/{tag}/{page}/`                        |
| Detail         | `/{slug}/`                                              |

Parsing (verified against the live markup):

- Result rows: `div.postTitle h2 a` → title + detail href; `.postContent img` → cover;
  `.postInfo` → categories and language; the centred `<p>` carries posted date, format and size.
- Detail page: iterate `.postContent table tr`; a row whose first cell is `Info Hash:` gives
  the infohash, and each `Tracker:` row contributes a tracker. The magnet is **constructed**
  client-side from `xt=urn:btih:<hash>`, `dn=<title>` and the collected `tr=` values — the
  site does not publish magnet links directly.

Mirrors rotate (`.is`, `.lu`, …), so the base URL is configurable and the provider
health-checks it. Auralis treats AudiobookBay as one *indexer provider* among several.

---

## Prowlarr (book requests, secondary source)

Auth: `X-Api-Key`. `GET /api/v1/search?query&categories&indexerIds` returns normalised
releases with `downloadUrl`/`magnetUrl`, which slot into the same provider interface as the
AudiobookBay scraper.

---

## Download clients

**qBittorrent** (WebUI API v2): `POST /api/v2/auth/login` (sets an `SID` cookie), then
`POST /api/v2/torrents/add` as multipart with `urls`, `savepath`, `category`, `tags`;
`GET /api/v2/torrents/info?hashes=` to poll progress.

**Transmission** (RPC): `POST /transmission/rpc` with the `X-Transmission-Session-Id`
challenge/retry handshake; `torrent-add` with `filename` (magnet) and `download-dir`,
`torrent-get` to poll.

Both sit behind one `DownloadClient` interface so adding SABnzbd or Deluge later is a new
file, not a refactor.

---

## Music requests

Pluggable `MusicRequestProvider`, same shape as the book indexers. The reference
implementation targets a **slskd** (Soulseek daemon) instance — `POST /api/v0/searches`,
poll `GET /api/v0/searches/:id/responses`, then `POST /api/v0/transfers/downloads/:username`
— because deemix is unmaintained and stream-ripping services are unreliable to depend on.
Any provider that can accept "find this album, put the files here" satisfies the interface.
