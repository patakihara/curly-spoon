# Auralis — Upstream integration reference

Verified endpoint shapes for every service Auralis talks to. Kept here so the clients in
`packages/*` and the request providers in `apps/server` are written against reality rather
than guesswork.

---

## Audiobookshelf (audiobooks + podcasts)

Auth: `Authorization: Bearer <token>`, obtained from `POST /login`.

| Purpose              | Endpoint                                                                               |
| -------------------- | -------------------------------------------------------------------------------------- |
| Login                | `POST /login`                                                                          |
| Libraries            | `GET /api/libraries`                                                                   |
| Items (paged)        | `GET /api/libraries/:id/items?limit&page&sort&desc&filter`                             |
| Home shelves         | `GET /api/libraries/:id/personalized`                                                  |
| Series / collections | `GET /api/libraries/:id/series`, `/collections`, `/playlists`                          |
| Search               | `GET /api/libraries/:id/search?q&limit`                                                |
| Item detail          | `GET /api/items/:id?expanded=1&include=progress`                                       |
| Cover                | `GET /api/items/:id/cover?width&height&format`                                         |
| Start playback       | `POST /api/items/:id/play[/:episodeId]`                                                |
| Sync / close session | `POST /api/session/:id/sync`, `POST /api/session/:id/close`                            |
| Progress             | `GET /api/me/progress/:id`, `PATCH /api/me/progress/:itemId`                           |
| In progress          | `GET /api/me/items-in-progress`                                                        |
| Bookmarks            | `POST` / `PATCH /api/me/item/:id/bookmark`, `DELETE …/bookmark/:time`                  |
| Audio bytes (Range)  | `GET /api/items/:id/file/:fileId`                                                      |
| Podcast feed search  | `POST /api/podcasts/feed`, `GET /api/search/podcast`                                   |
| Podcast episodes     | `GET /api/podcasts/:id/episode/:episodeId`, `POST /api/podcasts/:id/download-episodes` |
| New episodes shelf   | `GET /api/libraries/:id/recent-episodes`                                               |
| Trigger scan         | `POST /api/libraries/:id/scan`                                                         |

Realtime updates arrive over Socket.io on the same origin.

### Fixture/schema reconciliation pass — 2026-08-04

`packages/abs-client`'s fixtures and zod schemas were written from documented endpoint
shapes, never checked against a live server. This pass attempted that check and hit a real
blocker worth recording so the next session doesn't rediscover it: **no Audiobookshelf
login credential is available to a session in this worktree.** `docs/setup/MY_SETUP.md`
itself says so (§"Verify against reality before building more" — `«have it»` is a
placeholder the user holds, deliberately never committed to this public repo) and names
getting one "the first ask." Only the two unauthenticated endpoints below could actually be
exercised against the real box.

**Live-verified against the real server, Audiobookshelf 2.36.0** (`192.168.100.34:13378`):

- `GET /status` — matches `rawStatusResponseSchema`.
- `GET /ping` — matches `rawPingResponseSchema`.

**Source-derived, NOT live-verified** — cross-checked against
`github.com/advplyr/audiobookshelf` at tag `v2.36.0` (the version `MY_SETUP.md` records for
the real server) instead of a live authenticated response. This is a real check — it reads
the actual serializer code the server runs — but it is not a substitute for hitting the live
endpoints once a credential exists; a future session with one should still do that.

- `POST /items/:id/play` (`rawPlaybackSessionSchema`): confirmed `currentTime` is
  **seconds**, matching this project's "unsuffixed = seconds" convention. Traced
  `server/objects/PlaybackSession.js` → `PlaybackSessionManager.js`
  (`userStartTime = Number.parseFloat(userProgress.currentTime)`) → `MediaProgress.js`'s
  `currentTime`, compared directly against `duration` (itself seconds, from ffprobe) with
  no scaling anywhere in the chain. Documented on `PlaybackSession.currentTime` and
  `MediaProgress.currentTime` in `packages/abs-client/src/domain.ts`.
- Library item minified vs. expanded shape (`server/models/LibraryItem.js`,
  `server/models/Book.js`): found and fixed a real divergence — **real minified metadata
  (every list/shelf/`personalized` response) never sends the structured `authors`/`series`
  arrays, only the flattened `authorName`/`seriesName` strings.** `normalizeMedia`
  (`packages/abs-client/src/normalize.ts`) had a `authorName` fallback for `authors` but no
  equivalent for `series`, so a real minified item that's actually in a series normalized to
  `series: []` — home-shelf and library-browse cards would silently drop series membership
  for every book, since those endpoints only ever return minified items. Fixed with a
  `seriesName` fallback mirroring the existing `authorName` one (same accepted limitation:
  a multi-series `seriesName` string isn't split back into separate entries, matching how
  a multi-author `authorName` string already wasn't). The fake server's own
  `stripToMinified` (`apps/server/src/testSupport/fakes/fakeAbs.ts`) had the same gap — it
  only stripped `tracks`/`chapters`/`episodes`, leaving `authors`/`series` in "minified"
  fixture responses — which is _why_ no existing test caught this: nothing exercising the
  fake server's list/shelf endpoints ever saw a real minified shape. Both are fixed, with a
  regression test in `packages/abs-client/src/normalize.test.ts`.
- Everything else already resilient by construction: every raw schema in
  `packages/abs-client/src/schemas/raw.ts` uses `.passthrough()`, and the fields checked
  against source (`path`/`relPath`/`mtimeMs`/etc. on `LibraryItem`, `lastUpdate` on
  `MediaProgress`, `numAudioFiles`/`numChapters`/`ebookFormat` on minified `Book`) were
  either already `.optional()` or safely ignored as passthrough extras — no tightening was
  needed or done. Source alone can only justify _loosening_ a schema, never tightening it
  (loosening can't break a payload that previously parsed); nothing here needed loosening
  either.

**Not covered by this pass** (still fixture-derived, unverified against source or a live
server): `GET /api/libraries`, `GET /api/libraries/:id/items`,
`GET /api/libraries/:id/personalized`, `GET /api/libraries/:id/search`,
`GET /api/items/:id?expanded=1&include=progress`, `GET /api/me/*`, bookmarks, and all three
podcast-discovery operations (`searchPodcastDirectory`, `previewPodcastFeed`,
`subscribePodcast` — phase 8 wave A already verified these against source, not repeated
here). A session with a real credential should prioritize actually calling the live server
over more source-reading — source review is a fallback for when live access is blocked, not
a preferred substitute for it.

---

## Jellyfin (music)

Auth: `POST /Users/AuthenticateByName` → `AccessToken`. Subsequent requests carry:

```
Authorization: MediaBrowser Token="…", Client="Auralis", Device="…", DeviceId="…", Version="…"
```

| Purpose            | Endpoint                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| Authenticate       | `POST /Users/AuthenticateByName`                                               |
| System info        | `GET /System/Info/Public` (used to validate a URL during setup)                |
| Views              | `GET /UserViews`                                                               |
| Albums / artists   | `GET /Items?IncludeItemTypes=MusicAlbum,MusicArtist&Recursive=true`            |
| Album tracks       | `GET /Items?ParentId=…&SortBy=ParentIndexNumber,IndexNumber`                   |
| Playlists          | `GET /Items?IncludeItemTypes=Playlist`                                         |
| Search             | `GET /Items?searchTerm=…&Recursive=true`                                       |
| Artwork            | `GET /Items/:id/Images/Primary?maxWidth&quality`                               |
| Stream             | `GET /Audio/:id/universal` (transcoding-aware) or `/Audio/:id/stream` (direct) |
| Lyrics             | `GET /Audio/:id/Lyrics`                                                        |
| Playback reporting | `POST /Sessions/Playing`, `/Progress`, `/Stopped`                              |
| Favourites         | `POST` / `DELETE /Users/:userId/FavoriteItems/:id`                             |

---

## LRCLIB (lyrics, including lyrics **search**)

Public, no auth, no key. Base `https://lrclib.net/api`.

| Purpose                           | Endpoint                                              |
| --------------------------------- | ----------------------------------------------------- |
| Exact match (preferred)           | `GET /get?artist_name&track_name&album_name&duration` |
| Fuzzy lookup                      | `GET /search?track_name&artist_name&album_name`       |
| **Free-text / lyric-line search** | `GET /search?q=<any words, including a lyric line>`   |

Responses carry both `plainLyrics` and `syncedLyrics` (LRC format). The `q` form is what
makes Spotify-style "search by a line you remember" possible; Auralis intersects those
results with the local Jellyfin library so a hit is playable, and offers it as a request
when it is not.

A polite `User-Agent` is required. Auralis caches responses in SQLite and honours
rate limits; the entire lyrics layer is optional and degrades to "no lyrics" cleanly.

---

## AudiobookBay (book requests, primary source)

No API — HTML, scraped server-side.

| Purpose        | URL                                    |
| -------------- | -------------------------------------- |
| Search         | `/page/{n}/?s={query}&tt={types}`      |
| Browse by type | `/audio-books/type/{category}/{page}/` |
| Browse by tag  | `/audio-books/tag/{tag}/{page}/`       |
| Detail         | `/{slug}/`                             |

Parsing (verified against the live markup):

- Result rows: `div.postTitle h2 a` → title + detail href; `.postContent img` → cover;
  `.postInfo` → categories and language; the centred `<p>` carries posted date, format and size.
- Detail page: iterate `.postContent table tr`; a row whose first cell is `Info Hash:` gives
  the infohash, and each `Tracker:` row contributes a tracker. The magnet is **constructed**
  client-side from `xt=urn:btih:<hash>`, `dn=<title>` and the collected `tr=` values — the
  site does not publish magnet links directly.

Mirrors rotate (`.is`, `.lu`, …), so the base URL is configurable and the provider
health-checks it. Auralis treats AudiobookBay as one _indexer provider_ among several.

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

---

## Discovery layer (researched, not yet integrated)

Research pass only — no code written, no decision made. The idea: a **discovery layer**
decoupled from acquisition, the same separation Overseerr draws between TMDB (catalog
browsing) and its indexers (finding a specific release). Everything in this section is a
candidate for a future phase, documented now so the research isn't re-done from scratch.

This also feeds the recommendations goal in `docs/HANDOVER.md` §1 ("Spotify... cleverly
serve me audiobooks it thinks I will enjoy") — a recommender needs genre/similar-author/
similar-artist metadata that the acquisition indexers don't carry, which is exactly what a
discovery layer would supply.

The three candidates are not equally clean: music and podcasts are straightforward adds;
audiobooks are the case where "decoupled from acquisition" runs into real ToS exposure and
reliability gaps, detailed below.

### MusicBrainz (music catalog)

Anonymous lookup/search/browse needs no API key, only a descriptive `User-Agent` (required
by policy, not optional). Rate limit is a strict **1 req/s per IP average** — exceed it and
the IP gets `503`-denied until it backs off; some allowlisted user-agents get 50 req/s, but
nothing suggests Auralis would qualify without contacting MetaBrainz directly. Non-commercial
use is free; commercial use needs a data license, which is not a concern for a self-hosted
personal client.

Cover art comes from the companion **Cover Art Archive** (`coverartarchive.org`), keyed by
MusicBrainz release MBIDs. No rate limit currently enforced there, but its licensing is
**not** a clean CC0/public-domain grant — it defers to Internet Archive's terms ("use at
your own risk," "be respectful of artist/label rights"). Treat that as unconfirmed/murky,
not resolved.

Recommended client: **`musicbrainz-api`** (npm) over hand-rolled `fetch` calls — pure ESM,
full TS types, and built-in throttling that respects the 1 req/s rule. That throttling is
load-bearing here, not a convenience: violating the rate limit risks an IP ban, not just a
slow response.

### PodcastIndex.org (podcast catalog)

Complements the iTunes search Auralis's podcast backend already uses (see the
Audiobookshelf section above). Confirmed active and free as of 2026; mission-driven,
non-commercial, co-founded by Adam Curry.

Auth is four headers, no OAuth flow:

| Header          | Value                                 |
| --------------- | ------------------------------------- |
| `User-Agent`    | descriptive string                    |
| `X-Auth-Key`    | API key (free on signup)              |
| `X-Auth-Date`   | unix timestamp, ~3 min validity       |
| `Authorization` | `sha1(apiKey + apiSecret + unixTime)` |

Endpoints: Search, Podcasts (by feed ID/URL/iTunes ID/GUID/tags/medium/trending/dead
feeds), Episodes, Recent, Value (Value4Value/Lightning monetization metadata — iTunes has
nothing equivalent), Stats/Categories, and a Hub for feed-change push notifications. It does
**not** do full-text episode-content search — search is podcast/title/person-level, same
class as iTunes. Its actual edge is independently indexing raw RSS, so better indie/
self-hosted feed coverage than Apple's catalog admits.

Verdict: worth adding **alongside** iTunes, not replacing it — complementary, not a superset.

### Audiobooks (Audnexus) — the messiest of the three

Hosted at `api.audnex.us` (not `bundlebutton.com` — that's a stale URL some older
references use). Actively maintained (2,481+ commits, 210+ stars, ongoing PRs/issues as of
this research), GPL-3.0.

Exposes book/author/series metadata, chapters and narrator info via ASIN-based lookup,
aggregated from multiple sources built on the `mkb79` Audible Python library. Rate limit is
roughly 100 req/min per source by default. Known rough edge: non-US-region ASINs can `404`
— lookups take no region parameter, and it's an open issue upstream.

A fork, **AudiMeta** (Vito0912), exists specifically because Audnexus has historically
thrown 500s and couldn't fetch series descriptions. AudiMeta doesn't error on 404, handles
region automatically, and has more endpoints (series/author browsing) — worth naming as a
fallback.

**How Audiobookshelf itself sources Audible metadata, confirmed**: ABS calls Audible's own
regional API/site directly to resolve ASINs, then queries Audnexus per-ASIN for enriched
metadata. So Audnexus is exactly the layer ABS already depends on today, not a riskier
alternative to something ABS does more safely in-house.

**Legal/ToS risk, stated plainly**: Audible's Conditions of Use explicitly prohibit
"collection and use of product listings, descriptions, or prices" and any "data mining,
robots, or similar data gathering and extraction tools." Audnexus is squarely that. It is
nonetheless an established, widely-tolerated pattern in the self-hosted community —
Audiobookshelf ships it as a default metadata provider, and there is no reported
enforcement action against either Audnexus or ABS. Read this as: technically against
Audible's ToS, practically the community norm, zero observed enforcement — a decision for
whoever owns product risk here, not something to wave away as fine.

**Lower-risk alternative worth spiking first, not yet done**: Audiobookshelf's own API
reference (`api.audiobookshelf.org`, itself marked "out of date, no longer maintained" by
ABS) lists a "Search for Books" endpoint that appears to query external providers
(including Audible/Audnexus) by free-text query — distinct from the per-owned-item
`/api/items/{id}/match` endpoint. If its shape holds up, this would mean Auralis never
needs a direct Audnexus integration at all — ABS would proxy the discovery query the same
way it already proxies playback. But the exact request/response shape is **not confirmed**
(the doc site is unmaintained), and it needs a real spike against the actual Audiobookshelf
server (`docs/setup/MY_SETUP.md` has connection details) before anything is decided. This is
the recommended next step, not a settled fact.
