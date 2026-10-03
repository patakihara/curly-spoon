---
id: arch
nav: Architecture
part: How it's built
---
## Architecture

The shape you chose stays: **one container, one port**, a TypeScript backend holding every secret and talking to every service, and two clients on one API. What changes is inside.

::: diagram arch

::: cap
Features sit on a shared index and store. Only adapters talk to the outside world, and only the server holds secrets.
:::

### Eight rules the rebuild is organised around

::: grid g2
::: card
#### 1 · One schema, generated clients

Server routes are declared with zod; an OpenAPI document is emitted from them. The web client (TypeScript) and Android models (Kotlin, kotlinx.serialization) are **generated** by `pnpm gen` and committed under `generated/` folders; CI regenerates them and fails on any difference, and a change that breaks either fails the build. Nothing is hand-copied. The server parses every response through its zod schema, so clients don't re-check.
:::

::: card
#### 2 · Screen-shaped endpoints

Every screen gets one call returning what it draws, with fields named for the UI (`status`, `progress`, `reason`, `kind`). Clients never stitch calls together, so web and Android can't drift in combining data.
:::

::: card
#### 3 · A local index, refreshed in the background

A job mirrors the Audiobookshelf and Jellyfin libraries into SQLite as shared metadata (ids, titles, creators, genres, external ids); each person's progress is read with their own token (M1.progress). Browse, search, ownership checks and recommendations read that index, not live fan-out, so screen APIs stay fast on this RAM-starved box.
:::

::: card
#### 4 · Recorded reality, not guesses

Each adapter's `record` mode captures real responses from mediaserver, secrets scrubbed, as fixtures. Tests run on those, and a nightly re-record and diff turns upstream drift into a failing diff, not a silent break. Recordings are made from the laptop over Tailscale with Auralis's own API keys, named Auralis in each service, kept in a 0600 file on mediaserver; no other service's key is reused. The Audiobookshelf key belongs to `auralis`, a listen-only non-admin user. A second ABS key, an admin's, kept only on mediaserver, creates a member's missing ABS account and mints each person's key at first sign-in; Jellyfin's key (always admin) mints each person's session through Quick Connect. Upstream calls carry the person's own token, encrypted at rest.
:::

::: card
#### 5 · One request pipeline

Books, music and podcasts share one state machine, table and status vocabulary. Only _search_ and _fulfil_ are per medium, and music has two fulfil routes: a single song is kept from YouTube Music, and an album is always torrented in lossless.
:::

::: card
#### 6 · Secure by default

Setup claims the admin role once, with a one-time code the server writes to its data folder on first start; after that only an admin, who owns providers, paths and approvals, can run it. Download URLs come only from the server's own search results, never the client. Forwarded headers are trusted only from the proxy named in config, and the cookie is `Secure` whenever the request came in over HTTPS, so login works on plain LAN HTTP and behind Caddy. A signed-in write is refused unless its Origin, or failing that its Referer, is `PUBLIC_ORIGIN`, or, when that is unset (as in development), the request's own origin.
:::

::: card
#### 7 · The extractor lives in the server

The server runs `yt-dlp`, the equivalent of AbleMusicPlayer's on-phone NewPipeExtractor, in the one container: both clients get it, and there's one place to update. Per your notes it should **point and forward, not burden the server**: no transcoding, bytes passed straight through, a small capped cache only for streamed tracks (the next one preloaded, a recent one replayed, a song being kept) and cut channel episodes. The same path would let **people without a media server** use Auralis for streaming. Audiobooks always come from Audiobookshelf. The extractor only asks YouTube for audio-only formats, for music and channels alike. A daily job promotes a new extractor only once a canary search-and-resolve passes, else keeps the last that passed; failures show on the admin jobs page. Android may later add NewPipeExtractor as an offline fallback.
:::

::: card
#### 8 · Audio only, enforced

No video path exists to switch on by mistake. The extractor adapter's type has only audio-only formats, and a test fails if a recorded response would hand a client a video stream. Web plays everything through audio elements, and lint rejects `<video>` anywhere in the app. Android builds Media3 with no video renderer, so a podcast episode published as video plays its soundtrack. Sonora has no video component, and none gets added.
:::
:::

### The shared domain model

These types carry every screen.

| Type | What it is | Key fields |
|---|---|---|
| `MediaRef` | A pointer to anything: book, episode, show, track, album, artist, author, series, owned or not | `kind`, `source` (abs · jellyfin · ytmusic · external), `ids` (local id, ASIN, ISBN, MBID, feed GUID, provider id), `parentRef` (show, album or series, which is what the per-podcast dedupe keys on) |
| `Availability` | Where you stand with it, on every card and row | `owned` · `streamable` (plays now, can be kept) · `requested{status, progress}` · `external{requestable}`. Maps straight onto Sonora's four tones: <span class="pill t-lib">In library</span> <span class="pill t-prog">Downloading · 87%</span> <span class="pill t-req">Not in library</span> <span class="pill t-err">Failed</span> |
| `PlaybackPlan` | Everything a player needs to play one item, from the start or a resume point | ordered `tracks[]` (url, mime, duration, offset), `chapters[]`, `startAt`, `progressTarget` (where the server reports progress), `next` (the autoplay rule) |
| `User` · `Device` | Who is listening, and on what | An Auralis user maps to their own Audiobookshelf and Jellyfin accounts, so progress, favourites and play history stay theirs upstream too. Each device (a browser or a phone) registers under a user. |
| `ListeningSession` | What's playing on one device | Owned by (user, device): its queues, current item and position, and play history. **Sessions on different devices don't mix by default.** |
| `Shelf` | A carousel on Browse or a library home | `eyebrow` ("More like"), `title`, `subject` + `subjectArt` (what the shelf is about), `subtitle` (names the types in a mixed shelf), `items[]` of `MediaCard` or `FeatureCard` data, `mixed` flag |
