---
id: get
nav: Getting things
part: The product
---
## Getting what you don't have

One pipeline and status vocabulary for music, books and podcasts; only search and fulfil differ per medium, so Browse and Search render every request alike.

::: diagram get

- **"Done" means it plays.** A request reaches <span class="pill t-lib">In library</span> only once the item is in the local index, so the card turns playable by itself, with no `importRequested` dead end.
- **A Requests view** (a Browse chip in the Sonora mock-up) lists every album and book in flight with source, size, status, retry and cancel. Podcasts never appear: subscribing is instant.

### Music

- **Songs: kept from YouTube Music.** A song you stream is **added automatically once about 90% has played**; a few seconds and a skip doesn't count. By hand it's a **menu option** (_Add to library_ in the song's three-dot menu), not a button on the card or in Now Playing. The server saves the original Opus stream without re-encoding, reusing any cached copy, and writes tags from the matching MusicBrainz release (artist, album, track number, cover art) so Jellyfin files it properly. It lands in `/data/media/Music` and turns into an owned card.
- **Albums: always by torrent, in lossless.** _Add to library_ on an album never keeps it from YouTube Music; it requests the album by torrent. Until then, it streams from YouTube Music. Not through Lidarr, which you find patchy: its logs show public indexers hitting request limits and getting disabled, it insists on exact edition matches music torrents rarely fit, and its artist pages mix editions and miss albums. So Auralis does what you do by hand:
  - searches Prowlarr with several query forms (artist + album, album alone, discography packs), with results cached and spread across indexers so it stays under their limits;
  - scores each release on format (FLAC over 320 over the rest), how well its track list fits one of the album's editions, a sensible size and seeders;
  - picks automatically only when one release clearly wins. Otherwise the request shows <span class="pill t-req">Needs choice</span> with the candidates listed, so choosing takes one tap;
  - imports itself: tags against the edition whose track list matches the files, tags them, files them under `/data/media/Music` (hardlinked, so seeding continues) and refreshes Jellyfin. Any songs from that album already kept from YouTube Music are replaced by the lossless copies, with play history and favourites following the MusicBrainz ids.
  - **A clean album catalogue.** Lidarr shows MusicBrainz's structure raw through its own metadata server. Auralis uses MusicBrainz too (tagging, artist pages), so it avoids that mess:
    - **one entry per album**, with its editions, remasters and regional releases folded under it, never listed side by side;
    - EPs, singles, compilations and live albums shown in their own groups rather than hidden;
    - **gaps filled from YouTube Music and Deezer**: albums they list that MusicBrainz lacks still appear, play through YouTube Music, and can be added like any other.

  Prowlarr's indexers matter more than any of this code: public trackers carry little lossless music. deemix, which already runs here, can slot in as another source.

### Books

- **Books are request-only**, a hard line. A book you don't own is greyed out; tapping it requests it and shows _Requested_, with download progress in search. Requests sit among the library's items, greyed with their live status, with no separate filter.
- **Book imports are Auralis's job, not yours.** A finished download needs four hand-run Claude commands on mediaserver (`~/.claude/commands/`); each becomes a step of the book fulfil job:
  - `audiobook-import`: hardlink the download into `/data/media/Books/<Author>/<Book>`, wrapping loose audio files in their own book folder, without copying data, so seeding continues;
  - `audiobook-narrator-tag`: write a clean title to `metadata.json`, and add the narrator's name only when you own the same book in more than one narration;
  - `audiobook-series-tag`: set the series and its number from Audible and Audnexus, one narration per series so the series view has no duplicates or gaps;
  - `audiobook-author-image`: add an author photo when the folder has none (Audnexus has author images, so no web scraping).

  Audiobookshelf then picks up **only the new folder** through its folder watcher (on for Books), never a full scan.

### Podcasts

- **Podcasts are subscriptions**, and per your notes **you subscribe to listen**. Episodes of shows you don't follow are greyed out; playing one subscribes you. Subscribing gives you the whole show as stubs within the hour. Episodes live in Audiobookshelf, which works if Auralis breaks: no lock-in, as you said.

### YouTube channels

A channel you add comes in as an audio-only show in your Podcasts library, with SponsorBlock. **Auralis never shows video** (enforced in the build, see "Audio only, enforced").

- **Adding a channel** happens only in Search: find it there, ranked among podcasts, or paste its link. Auralis serves an ordinary podcast feed for it (`/feeds/youtube/{channel}.xml`): one episode per upload, carrying its title, description, date, and thumbnail as cover art. Each episode's file is the video's audio-only stream, SponsorBlock segments cut out. Audiobookshelf subscribes like any feed, so the show gets your others' progress, autoplay and digests. New episodes download automatically; older ones when you ask in either app, and all follow your other shows' 7-day clean-up. No stubs: an episode's length is known only once it's cut. Shorts and livestreams are left out by default, per channel. A channel needs Auralis running to fetch new episodes.
- **SponsorBlock.** Segments come from SponsorBlock's public API (no key; checked live). By default Auralis removes sponsor reads, self-promotion and "like and subscribe" reminders; intros, outros, filler and non-music sections in music videos can be switched on per channel. They are cut from the file without re-encoding, so the Audiobookshelf app, downloads and Android Auto get the clean version. The cut file is cached, so every fetch matches. Segments are community-submitted, often days after an upload, so an episode you haven't started is re-cut when new ones arrive; one you've started is left alone, so your position doesn't jump, and Auralis's players skip the new segments live.
- **Cut episodes, full videos.** Auralis keeps each episode's cut list, so position sync with your YouTube account maps between the cut episode and the full video, both ways.
