---
id: milestones
nav: Milestones
part: Delivery
---
## Milestones

Each milestone is a slice that runs end to end, from the Sonora screen through the API to your real servers, on web and Android at the same time. It ends when **you** have used it, not when CI is green.

### M0 · Foundations

- **[M0.repo]** The rebuild happens **in the same GitHub repository** (`patakihara/curly-spoon`), so the F-Droid repository address, the signing secrets and the release workflows carry over untouched. The old code stays at the git tag `legacy`, read-only. The first real Android build is released through the F-Droid repository and installed over 0.2.0 as an update, proving the path end to end; a release names its server from a repository secret, since the repo names no host. New layout: `server`, `web`, `android`, `schema`, `design/sonora` (moved in with its history), `design/app` and `docs/plan`.
  _Done when:_ (a) a test asserts the tag `legacy` exists and `main` has the top-level folders `server`, `web`, `android`, `schema`, `design/sonora`, `design/app` and `docs/plan`, and none of the legacy tree's `apps/` or `packages/`; (b) a test asserts nothing under `design/sonora/assets/reference/spotify/` is tracked, that path is gitignored, and every commit touching `design/sonora` has an author in the repo's allowed identity list; (c) a live test reads the F-Droid repository's `index-v2.json` and asserts `net.develivarr.auralis` at a version code above 0.2.0's, with an APK URL that answers 200; (d) Sofia's sign-off: it installed on her phone over 0.2.0 without uninstalling; (e) a test asserts both release workflows pass `-PauralisServer` from the `AURALIS_SERVER` secret, and CI asserts a release build without it fails.
- **[M0.schema]** zod → OpenAPI → generated TS and Kotlin clients, enforced in CI.
  _Done when:_ (a) a test regenerates the OpenAPI document and both clients from `schema/` and fails on any difference from what is committed; (b) a test adds a field to a zod schema in a temporary copy and asserts it appears in both the generated TS and Kotlin clients.
- **[M0.record]** Adapter record mode; the first recordings from mediaserver's Audiobookshelf and Jellyfin, with secrets scrubbed. The audio file call keeps its real status and headers, with a synthesized clip as its body.
  _Done when:_ (a) a test runs an adapter in record mode against a local fake upstream and asserts it writes the request and response as a recording; (b) a test asserts recordings from mediaserver exist for Audiobookshelf's library list, item detail and play calls and Jellyfin's library list and item detail; (c) a test scans every committed recording and fails on any token, API key, cookie, password or real hostname.
- **[M0.security]** Security baseline: one-time setup, admin role, cookie and proxy config.
  _Done when:_ (a) a test calls setup twice and asserts the second call is refused without an admin session; (b) a test asserts every admin route rejects a signed-in non-admin user; (c) a test asserts the session cookie is `HttpOnly`, `Secure` and `SameSite=Lax`, and forwarded headers are trusted only from the configured proxy.
- **[M0.sso]** **Multi-user from day one**: an `auralis` OpenID Connect client in the household sign-on (Authelia, backed by LLDAP), sign-in mapped by username to each person's Audiobookshelf and Jellyfin accounts, and device registration. Each person's upstream token is minted without their password: ABS by an admin key's `POST /api/api-keys`, Jellyfin by an API key authorizing a Quick Connect request.
  _Done when:_ (a) a test signs in through a recorded OpenID Connect exchange and asserts the username maps to that person's Audiobookshelf and Jellyfin accounts; (b) a test registers two devices for one user and asserts each gets its own device id; (c) a test asserts two users' upstream calls each carry their own token, never the other's.
- **[M0.uikit]** **Sonora pipeline**: web UI package built from Sonora's components, by generators in `design-codegen/`, Android props generated from the `.d.ts` files, and every check in "Staying on track".
  _Done when:_ (a) a test rebuilds the web UI package and the Android props from `design/sonora`, fails on any difference from what is committed, and asserts every Sonora component with a `.d.ts` has a web export and a generated Kotlin props class; (b) a test feeds the repo's Claude Code hook an edit to a generated folder and asserts it is refused; (c) a test asserts the merge check fails when `design/` or `docs/plan` differs from the tree recorded in `design/published.json`; (d) a test asserts the commit check rejects an app change without a `Plan:` line naming an existing item; (e) a test runs the session-start hook on a fixture repo and asserts it prints milestone, done items, work in flight, next step, failing checks and outbox; (f) a test asserts the end-of-session hook blocks while a design or plan change is unpublished.
- **[M0.canvas]** **The Auralis canvas** in `design/app`: first the structure, every screen's purpose, sections, empty state and links in `nav.json`, shown on the canvas as plain text beside a generated navigation flowchart. After your pass through those, the full screen map as pages, every one drawn before the item is done, then Sonora pruned to what those pages use and reordered into its hierarchy. Generators for the web router, the Android nav graph and the pages, and their CI checks. **Both apps navigate the whole map with placeholder data** before any screen gets real content.
  _Done when:_ (a) a test asserts the web routes and the generated Android nav graph's destinations both equal the pages in `nav.json`; (b) a test asserts every Sonora component is used by at least one page; (c) a Playwright test visits every page in `nav.json` and asserts it renders with placeholder data; (d) an emulator test in `android/app/src/androidTest` navigates to every destination in the generated Android nav graph and asserts each shows its page title with placeholder data; (e) a test asserts every page in `nav.json` has a comparison in `design/app/compare` with its phone and desktop renders, the Sonora UI kit render it names, a differences list and the hash of the page it was made from, and fails when the page has changed since; (f) a test asserts every page in `nav.json` has a complete structure block whose links name existing pages and a page file, and that the canvas build generates the structure and flowchart artboards from it.
- **[M0.tokens]** Sonora tokens generated for web (CSS) and Android (`SonoraTokens.kt`), fonts and icons; web gallery and Android Paparazzi screenshots in CI. Every Sonora component gets a preview card in Sonora before the gallery counts as complete.
  _Done when:_ (a) a test regenerates the CSS tokens and `SonoraTokens.kt` from Sonora's token export, fails on any difference, and asserts both carry the same names and values; (b) a test asserts the container serves every font and icon itself, with no request to an outside host; (c) a Playwright gallery test produces a screenshot of every Sonora component in CI, and a Paparazzi test produces a screenshot of each token specimen and of each Compose component in `ui/sonora`.
- **[M0.plan]** This plan moved into `docs/plan` and published from there, with its checks, badges and hooks.
  _Done when:_ (a) a test runs the plan checks on `docs/plan` (unique ids, a done-when on every item, the size limit, no dated notes, the outbox format) and they pass; (b) a test renders a fixture plan and asserts the done, in-progress and next badges, the waiting-on-you box, recent decisions, the inbox ideas waiting to be sorted and the footer commit; (c) a test runs `progress.mjs --summary` on a fixture repo and asserts every summary line; (d) a test asserts `design/published.json` records the current tree of `docs/plan`; (e) a test runs the session-start hook and asserts it tells the orchestrator to read all of `docs/plan` first, on startup and after a compaction; (f) a test asserts the plan has a standing-rules section and that the subagent brief template begins with it.
- **[M0.staging]** The existing Auralis container on mediaserver (unused today) follows `main` as the test instance.
  _Done when:_ (a) a live test asserts the staging container's health endpoint reports the commit of the latest green `main` build within 30 minutes of its publish.
- **[M0.emulator]** The Android emulator in CI actually runs the app (a smoke test: log in, open Browse, play 5&nbsp;s). It builds the thin direct-play slice M1.play and M1.shell extend (a one-track `PlaybackPlan`, `POST /api/play`, a stream route, Android's `Playback`), with the recorded-upstreams server in `server/e2e/`, never in the image.
  _Done when:_ (a) an emulator test in CI logs in against the server with recorded upstreams, opens Browse and asserts playback passes 5 seconds.

**[M0.exit] Done when** you sign in to the staging container with your Delivarr account, it reaches your own Audiobookshelf and Jellyfin, and both clients render the shell from generated types.
_Done when:_ (a) Sofia's sign-off.

### M1 · It plays

- **[M1.index]** Local index job for Audiobookshelf and Jellyfin.
  _Done when:_ (a) a test runs the index job on the Audiobookshelf and Jellyfin recordings and asserts every recorded book, show, episode, album and track is indexed with its upstream ids; (b) a test asserts a second run after a recorded change updates only the changed items.
- **[M1.play]** `POST /play` with direct play and a working HLS path; gapless multi-file playback; chapters across files; the web and Android players that M1.shell's Books, Podcasts and Music lists and its Now Playing start.
  _Done when:_ (a) a test on the Audiobookshelf recording that answers with an HLS playlist asserts `POST /play` returns a plan whose URLs the server proxies, and a segment returns audio; (b) a test on a direct-play recording asserts the plan's track URLs answer range requests with 206; (c) a Playwright test plays a two-file fixture book and asserts the second file starts without a pause and position continues across the boundary; (d) an emulator test asserts the same on Android; (e) a test asserts chapters spanning files map to the right absolute positions in the playback plan.
- **[M1.progress]** Progress fan-out to Audiobookshelf and Jellyfin; bookmarks; speed; sleep timer; media session and notification controls.
  _Done when:_ (a) a test asserts one progress update reaches Audiobookshelf's and Jellyfin's recorded progress calls, with wall-clock listening time; (b) a test creates, lists and deletes a bookmark and sees each Audiobookshelf call; (c) a Playwright test asserts speed changes the playback rate, the sleep timer pauses playback, and Media Session metadata and actions are set; (d) an Android test asserts the same speed and sleep behaviour and the notification's play, pause and skip actions.
- **[M1.sessions]** Per-device listening sessions, stored on the server and never mixing by default. Their queues: music plus the shared spoken queue, the meta-queue switch, YouTube Music style with Spotify style as an option, history-based Back, default button actions, and autoplay (next episode, next in series, album then radio).
  _Done when:_ (a) a test asserts two devices of one user keep separate sessions and queues on the server; (b) a test asserts the music and spoken queues advance independently and the meta-queue switch changes which one the controls drive; (c) a test asserts YouTube Music style and Spotify style insert "play next" items in their documented orders; (d) a test asserts Back returns to the previously played item across both queues; (e) a test asserts autoplay continues with the next episode, the next book in the series, and the rest of the album followed by radio.
- **[M1.shell]** Sonora's backdrop shell, mini-player, Now Playing (stacked), queue, synced lyrics (Jellyfin's own for now); basic Books, Podcasts and Music lists to start playback from.
  _Done when:_ (a) Playwright screenshot tests of the shell, mini-player, Now Playing, queue and lyrics match their canvas renders in each recorded state; (b) Paparazzi tests of the same screens match the same canvas renders; (c) a test asserts synced lyrics highlight the current line from Jellyfin's recorded lyrics; (d) web and Android tests each start playback from the Books, Podcasts and Music lists.
- **[M1.android]** Android: background playback, and Android Auto browse for all three media (continue, books, shows, albums).
  _Done when:_ (a) an emulator test asserts playback continues for 60 seconds with the app in the background and the screen off; (b) a Robolectric test asserts the Auto browse roots are continue, books, shows and albums, each listing recorded items.

**[M1.exit] Done when** you listen for a week, on phone and desktop, and resume across both without thinking about it. This also replaces the ABS app for you.
_Done when:_ (a) Sofia's sign-off.

### M2 · My library

- **[M2.screens]** Library homes and every detail screen (book, show, episode, album, artist, author, series, playlist, favourites), drawn on the canvas first where Sonora lacks them.
  _Done when:_ (a) a test asserts each of these screens is a page in `design/app` and a route in both apps; (b) Playwright screenshot tests render each screen's loading, empty, full and error states and match the canvas; (c) Paparazzi tests render the same states and match the canvas.
- **[M2.search]** Search: suggestions plus library results with relevance ranking; context menus (Play next, Play last, Go to album or artist).
  _Done when:_ (a) a test asserts `GET /search/suggest` returns suggestions from the index for a two-letter prefix; (b) a test asserts an exact title match ranks above partial matches in library results; (c) a Playwright test uses Play next, Play last and Go to album or artist from a result's menu; (d) an Android test does the same.
- **[M2.lrclib]** LRCLIB lyric backfill and cache.
  _Done when:_ (a) a test on an LRCLIB recording asserts a track without Jellyfin lyrics gets synced lyrics stored in the cache; (b) a test asserts a second request for those lyrics makes no LRCLIB call.
- **[M2.downloads]** Android downloads (whole plan: every file of a book), with a Downloads screen.
  _Done when:_ (a) a test asserts downloading a multi-file book fetches every file in its playback plan; (b) an emulator test plays a downloaded book offline across a file boundary; (c) a Paparazzi test of the Downloads screen matches the canvas.
- **[M2.lists]** Listening lists, podcast playlists, The Digest and custom digests.
  _Done when:_ (a) a test creates a listening list and a podcast playlist through the API and plays each in order; (b) a test asserts The Digest holds the new unplayed episodes of subscribed shows by its rule in "Lists that aren't queues"; (c) a test creates a custom digest from chosen shows and asserts its episodes.
- **[M2.grid]** Library grid/list with Random sort; Up next and second-most-recent on Browse (from owned content).
  _Done when:_ (a) a Playwright test in `web/` and an emulator test in `android/` each switch a fixture library from grid to list and back, assert both layouts show the same items, and assert Random sort with a fixed seed gives that seed's order; (b) a test asserts Browse's Up next and second-most-recent shelves hold only owned items from the user's history.
- **[M2.settings]** Settings, including theme, queue style and autoplay switches.
  _Done when:_ (a) a test round-trips every setting through `GET/PUT /settings`; (b) web and Android tests change theme, queue style and autoplay and assert each takes effect.

**[M2.exit] Done when** you can find and play anything you own faster than in Spotify, Audiobookshelf or Jellyfin's own apps.
_Done when:_ (a) Sofia's sign-off.

### M3 · Play or get anything

- **[M3.requests]** The unified request pipeline and status vocabulary.
  _Done when:_ (a) a test drives one request per medium through every status of the shared vocabulary on recorded upstreams; (b) a test asserts a failed step leaves the request in a named error status with its reason, and a retry resumes from that step.
- **[M3.timing]** Books: first, time each step of today's pipeline on a real request to find what's slow.
  _Done when:_ (a) a test asserts a committed timing recording from a real request covers the Prowlarr search, the download, the import and the scan.
- **[M3.books]** Then Prowlarr and AudiobookBay (real tracker rows, recorded markup), qBittorrent, and the import job that replaces the four `audiobook-*` commands (folder layout, clean titles, narrator only where needed, series, author photo), with Audiobookshelf picking up just the new folder.
  _Done when:_ (a) a test on Prowlarr and AudiobookBay recordings picks the expected release; (b) a test on a qBittorrent recording adds the torrent and follows it to completion; (c) a test imports a fixture download and asserts folder layout, clean title, narrator only where needed, series and author photo; (d) a test asserts Audiobookshelf is asked to pick up only the new folder, never a full scan.
- **[M3.ytmusic]** Music: YouTube Music adapter (extractor in the container, daily canary-gated update), search, instant streaming with a disk cache.
  _Done when:_ (a) a test on YouTube Music recordings returns search results and a stream the server proxies; (b) a live canary test resolves and plays 10 seconds of a known track from this server; (c) a test asserts a second play of a track is served from the disk cache with no upstream call; (d) a test asserts the extractor update job runs daily, records the version it promoted, and keeps the last passing version when a new one fails the canary.
- **[M3.keep]** Songs: _Add to library_ in the song menu and automatically at ~90% played, saved as the original Opus with MusicBrainz tags, then a Jellyfin refresh.
  _Done when:_ (a) a test asserts Add to library saves the original Opus stream unchanged, with MusicBrainz tags; (b) a test asserts a track played past 90% is kept automatically, once; (c) a test asserts a Jellyfin library refresh follows each save.
- **[M3.albums]** Albums: always a lossless torrent via Prowlarr → qBittorrent, with multi-query search, release scoring, a one-tap picker for unclear matches and Auralis's own tagging import, replacing any kept songs from that album on arrival.
  _Done when:_ (a) a test on Prowlarr recordings runs several queries and ranks lossless releases by the scoring rules; (b) a test asserts an unclear match produces a picker choice instead of a download; (c) a test imports a fixture album with Auralis's tagging and asserts kept songs from that album are replaced.
- **[M3.spotify]** Spotify playlist import (read the public playlist, resolve each track on YouTube Music), as AbleMusicPlayer does.
  _Done when:_ (a) a test reads a recorded public Spotify playlist, resolves each track to a YouTube Music id and reports the unmatched ones; (b) a test asserts the imported playlist plays in its original order.
- **[M3.podcasts]** Podcasts: subscribe or unsubscribe through PodcastIndex/iTunes search; greyed-out episodes that subscribe you when played.
  _Done when:_ (a) a test searches recorded PodcastIndex and iTunes results and subscribes and unsubscribes through Audiobookshelf's recorded calls; (b) a test plays a greyed-out episode of an unsubscribed show and asserts the subscription is created.
- **[M3.ytshows]** YouTube channels as audio-only shows, through the generated feed, with SponsorBlock segments cut from the files and skipped live, and per-show category settings, once a test channel has run through stubs, hydration and playback.
  _Done when:_ (a) a test asserts a channel's generated feed lists audio-only enclosures and no video; (b) a test cuts SponsorBlock segments from a fixture file and asserts the new length, and that live playback skips the segments; (c) a test asserts per-show category settings choose which segments are cut; (d) a live test runs the test channel through stubs, hydration and playback on staging.
- **[M3.ytsync]** Watched-state and position sync for YouTube shows, opt-in per person, starting with a test on your account: episodes of your YouTube shows marked played and resumed at the same spot both ways, nothing else from your YouTube history, each person's sync kept to their own account, and the "sign-in expired" warning.
  _Done when:_ (a) a test on recorded YouTube responses asserts played state and position sync both ways, only for channels added as shows; (b) a test asserts sync stays off until a person opts in and uses only that person's cookies; (c) a test asserts expired cookies show the "sign-in expired" warning; (d) Sofia's sign-off: sync works both ways on her account.
- **[M3.catalog]** Search's requestable section; artist and author catalogue with unowned titles greyed out (on by default, with a setting to hide it); Requests view; lyrics search.
  _Done when:_ (a) a test asserts search returns library and requestable results in separate sections and owned titles are never requestable; (b) web and Android tests render an artist and an author page with unowned titles greyed out, and hidden with the setting off; (c) web and Android tests render the Requests view with a request in each status; (d) a test on an LRCLIB recording finds a track from a line of its lyrics.

**[M3.exit] Done when** any song you think of plays within a couple of seconds, your Spotify playlists are imported and playing, and a lossless album you add arrives and replaces any songs you kept from it. Five books and two shows you request also turn into playable cards without you touching anything else.
_Done when:_ (a) Sofia's sign-off.

### M4 · Browse like Spotify

- **[M4.identity]** Identity fields end to end (ASIN, feed GUID, MBID).
  _Done when:_ (a) a test asserts the index stores ASIN, feed URL and GUID, and MusicBrainz ids from the recordings, and the generated client models expose them; (b) a test asserts an external candidate matches an owned item by identifier before title.
- **[M4.providers]** ListenBrainz (music), Audible similar products with an Audible-ID backfill (books), Apple Podcasts "You Might Also Like" (podcasts), YouTube Music radio, all as background jobs feeding the candidate pool.
  _Done when:_ (a) a test per provider, on its recording, asserts candidates land in the pool with their source and seed; (b) a test asserts the Audible-ID backfill finds ids by title and author for recorded books; (c) a test asserts serving Browse makes no provider call.
- **[M4.browse]** Browse composer: mixed shelves with context headers, one episode per show, feature cards with previews. External music plays straight away, external books and shows are requestable. Loading state held until ready. Plus the shelf review page.
  _Done when:_ (a) a test asserts composed shelves mix media, carry a context header and hold at most one episode per show; (b) a test asserts feature cards carry a playable preview; (c) web and Android tests assert Browse holds its loading state until every shelf has arrived; (d) tests assert external music plays directly and external books and shows open the request flow; (e) a test renders the shelf review page with each shelf's items and reasons.
- **[M4.reco]** Recommendation phases 1–2: history import (Spotify, YouTube Music takeout), co-occurrence and next-item tables, provider candidates scored against taste, source logging, and the held-out replay score. Phase 3's exploration share ships with Browse.
  _Done when:_ (a) a test in `server/` imports fixture Spotify and YouTube Music takeout history files and asserts every play lands in the play-history table with its track, time and source, and a second import adds no rows; (b) a test builds co-occurrence and next-item tables from fixture history and asserts known neighbours; (c) a test asserts candidates are ordered by taste score, not provider order, with their source logged; (d) a test computes the held-out replay score on fixture history and asserts it beats a random ordering; (e) a test asserts Browse includes the exploration share.
- **[M4.hardcover]** A short Hardcover check first: if its API exposes "readers also liked", it strengthens books.
  _Done when:_ (a) a test on a Hardcover recording asserts its "readers also liked" results enter the book candidate pool, or this item is removed with a `Decision:` line.

**[M4.exit] Done when** Browse puts at least one thing you didn't own, and then wanted, in front of you each week. That's the bar from your brief: _"cleverly serve me audiobooks it thinks i will enjoy."_
_Done when:_ (a) Sofia's sign-off.

### M5 · Everywhere, polished

- **[M5.auto]** Android Auto voice search and resumption on a real head unit or DHU.
  _Done when:_ (a) a Robolectric test asserts Auto voice-search queries resolve to playable items for each medium; (b) Sofia's sign-off: voice search and resumption work on a real head unit or the DHU.
- **[M5.offline]** Offline behaviour on Android: queue and progress catch-up after reconnecting.
  _Done when:_ (a) an emulator test plays offline, changes the queue, reconnects and asserts the server has the new progress and queue; (b) a test asserts conflicting progress resolves to the most recent listen.
- **[M5.perf]** Performance budget on this box (RAM ceiling for the container, Lighthouse on phone).
  _Done when:_ (a) a test runs the container under a recorded load and asserts its memory stays under the ceiling set in the test; (b) a Lighthouse test on the mobile profile meets the budget for Browse and Now Playing.
- **[M5.contrast]** Contrast fixes wherever the accent or the play rose fails WCAG.
  _Done when:_ (a) a test computes the accent's and the play rose's text and UI contrast pairs on every surface, in both web tokens and `SonoraTokens.kt`, and asserts WCAG AA.
- **[M5.handoff]** "Continue here" and "Play on…" between a user's devices.
  _Done when:_ (a) a test moves playback from one device to another with Continue here and asserts position and queue carry over; (b) a test asserts Play on reaches the user's own other device and never another user's.
- **[M5.streaming]** A streaming-only account for people without a media server.
  _Done when:_ (a) a test signs in a user with no Audiobookshelf or Jellyfin account and asserts Browse, search and YouTube Music playback work and library screens show their empty state.

**[M5.exit] Done when** Spotify is uninstalled.
_Done when:_ (a) Sofia's sign-off.

### M6 · Later, and separate

- **[M6.readalong]** EPUB downloaded with the audiobook, read-along via cheap speech-to-text matched against a small window of the text.
  _Done when:_ (a) an emulator test in `android/` downloads a fixture book for offline use and asserts its EPUB is saved beside the audio and opens with the network off; (b) a test aligns fixture narration to its text and asserts the highlighted sentence is within two seconds of the spoken position.
- **[M6.spotify]** Spotify: import your history, sync listening from Spotify, push the Auralis queue into a Spotify Jam if that's possible, browse public playlists.
  _Done when:_ (a) a test imports a fixture Spotify history export; (b) a test on Spotify recordings syncs recent plays into history; (c) a test browses a recorded public playlist; (d) a test pushes a queue into a recorded Jam session, or the Jam clause is removed with a `Decision:` line.
- **[M6.alternate]** Alternating two books in one generated queue.
  _Done when:_ (a) a test generates a queue from two books and asserts their chapters alternate.
- **[M6.lyricshot]** Lyric screenshot formatting.
  _Done when:_ (a) a test renders a lyric screenshot for chosen lines and matches the canvas render.
- **[M6.lbpersonal]** ListenBrainz personal recommendations (tier 2), if you create an account and connect Jellyfin scrobbling.
  _Done when:_ (a) a test on a ListenBrainz recording of personal recommendations adds them to the pool for that user only.
