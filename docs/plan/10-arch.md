---
id: arch
nav: Architecture
part: How it's built
---
## Architecture

The shape you chose stays: **one container, one port**, a TypeScript backend that holds every secret and talks to every service, and two clients on one API. What changes is inside that box.

::: diagram arch

::: cap
Features sit on a shared index and store. Only adapters talk to the outside world, and only the server holds secrets.
:::

### Eight rules the rebuild is organised around

::: grid g2
::: card
#### 1 · One schema, generated clients

Server routes are declared with zod; an OpenAPI document is emitted from them. The web client (TypeScript) and Android models (Kotlin, kotlinx.serialization) are **generated** in CI, and a change that breaks either fails the build. Nothing is hand-copied.
:::

::: card
#### 2 · Screen-shaped endpoints

Every screen gets one call that returns what the screen draws, with fields named for the UI (`status`, `progress`, `reason`, `kind`). Clients don't stitch five calls together, so web and Android can't drift apart in how they combine data.
:::

::: card
#### 3 · A local index, refreshed in the background

A job mirrors the Audiobookshelf and Jellyfin libraries into SQLite (ids, titles, creators, genres, external ids, progress). Browse, search, ownership checks and recommendations read that index, not live fan-out. The screen APIs stay fast on this RAM-starved box, and Browse can hold its loading state briefly and reliably.
:::

::: card
#### 4 · Recorded reality, not guesses

Each adapter has a `record` mode that captures real responses from mediaserver (secrets scrubbed) into fixtures. Tests run against those, and a nightly job re-records and diffs them, so upstream drift shows up as a failing diff, not a silent break.
:::

::: card
#### 5 · One request pipeline

Books, music and podcasts share one state machine, table and status vocabulary. Only the _search_ and _fulfil_ steps are per medium, and music has two fulfil routes: a single song is kept from YouTube Music, and an album is always torrented in lossless. This replaces the two near-identical request services in the old code.
:::

::: card
#### 6 · Secure by default

Setup can only run once (or by an admin). There's an admin role for providers, paths and approvals. Download URLs are only ever taken from the server's own search results, never from the client. `trustProxy` and cookie `secure` are set by config, so login works on plain LAN HTTP and behind Caddy.
:::

::: card
#### 7 · The extractor lives in the server

AbleMusicPlayer runs NewPipeExtractor on the phone. The research showed nothing in it needs the device, and that the server-side equivalent is `yt-dlp` run as a subprocess. That keeps it inside the one container, so web and Android both get it, as parity requires, and there's one place to update. Per your notes it should **point and forward, not burden the server**: no transcoding, bytes passed straight through, a cache only for preloading the next track and for songs being added to the library. The same path is what would let **people without a media server** use Auralis as a streaming app. Audiobooks always come from Audiobookshelf. The extractor only ever asks YouTube for audio-only formats, for YouTube Music and for YouTube channels alike. A daily job updates the extractor and runs a canary search-and-resolve; failures show up in the admin jobs page. Android can add NewPipeExtractor directly later as an offline fallback if that ever proves useful.
:::

::: card
#### 8 · Audio only, enforced

There is no video path to switch on by mistake. The extractor adapter's type only has audio-only formats, and a test fails if a recorded response would hand a client anything with a video stream. Web plays everything through audio elements, and lint rejects `<video>` anywhere in the app. Android builds Media3 with no video renderer, so a podcast episode published as video plays its soundtrack. Sonora has no video component, and none gets added.
:::
:::

### The shared domain model

Four types carry every screen. Getting them right early is most of the work.

| Type | What it is | Key fields |
|---|---|---|
| `MediaRef` | A pointer to anything: book, episode, show, track, album, artist, author, series, owned or not | `kind`, `source` (abs · jellyfin · ytmusic · external), `ids` (local id, ASIN, ISBN, MBID, feed GUID, provider id), `parentRef` (show, album or series, which is what the per-podcast dedupe keys on) |
| `Availability` | Where you stand with it, on every card and row | `owned` · `streamable` (plays now, can be kept) · `requested{status, progress}` · `external{requestable}`. Maps straight onto Sonora's four tones: <span class="pill t-lib">In library</span> <span class="pill t-prog">Downloading · 87%</span> <span class="pill t-req">Not in library</span> <span class="pill t-err">Failed</span> |
| `PlaybackPlan` | Everything a player needs to play one item, from the start or a resume point | ordered `tracks[]` (url, mime, duration, offset), `chapters[]`, `startAt`, `progressTarget` (where the server reports progress), `next` (the autoplay rule) |
| `User` · `Device` | Who is listening, and on what | An Auralis user maps to their own Audiobookshelf and Jellyfin accounts, so progress, favourites and play history stay theirs upstream too. Each device (a browser or a phone) registers under a user. |
| `ListeningSession` | What's playing on one device | Owned by (user, device): its queues, current item and position, and play history. **Sessions on different devices don't mix by default.** |
| `Shelf` | A carousel on Browse or a library home | `eyebrow` ("More like"), `title`, `subject` + `subjectArt` (what the shelf is about), `subtitle` (names the types in a mixed shelf), `items[]` of `MediaCard` or `FeatureCard` data, `mixed` flag |
