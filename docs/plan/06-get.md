---
id: get
nav: Getting things
part: The product
---
## Getting what you don't have

One pipeline and one status vocabulary for music, books and podcasts. Only the search and fulfil steps differ per medium, which is also why Browse and Search can render every request the same way.

::: diagram get

- **"Done" means it plays.** A request only reaches <span class="pill t-lib">In library</span> once the item shows up in the local index, so the card turns into a playable one by itself. The old `importRequested` dead end goes away.
- **A Requests view** (a Browse chip in the Sonora mock-up) lists every album and book in flight with source, size and status, plus retry or cancel. Podcasts never appear there: subscribing is instant.

### Music

- **Songs: kept from YouTube Music.** A song you stream is **added automatically once about 90% of it has played**; a few seconds and a skip doesn't count. You can also add one by hand, but that's a **menu option** (_Add to library_ in the song's three-dot menu), not a button on the card or in Now Playing. The server saves the original Opus stream without re-encoding, reusing whatever is already cached, and writes tags from the matching MusicBrainz release (artist, album, track number, cover art) so Jellyfin files it properly. It lands in `/data/media/Music` and turns into an owned card.
- **Albums: always by torrent, in lossless.** _Add to library_ on an album never keeps it from YouTube Music; it requests the album by torrent. Until it arrives, the album still streams from YouTube Music. This doesn't go through Lidarr. You find it patchy, and its logs from the last month show why. Its indexers are public ones (Knaben, The Pirate Bay, BT.etree), which keep hitting request limits and getting disabled. It also insists on an exact edition match, which music torrents rarely fit. And its catalogue is a mess in practice: artist pages mix different editions of one album and miss albums outright. So Auralis does what you do by hand:
  - searches Prowlarr with several query forms (artist + album, album alone, discography packs), with results cached and spread across indexers so it stays under their limits;
  - scores each release on format (FLAC over 320 over the rest), how well its track list fits one of the album's editions, a sensible size and seeders;
  - picks automatically only when one release clearly wins. Otherwise the request shows <span class="pill t-req">Needs choice</span> with the candidates listed, so choosing takes one tap instead of a manual hunt;
  - imports itself: tags against the edition whose track list matches the files, tags them, files them under `/data/media/Music` (hardlinked, so seeding continues) and refreshes Jellyfin. Any songs from that album already kept from YouTube Music are replaced by the lossless copies, with play history and favourites following the MusicBrainz ids.
  - **A clean album catalogue.** Lidarr's catalogue is MusicBrainz served through its own metadata server, and it shows MusicBrainz's structure raw. Auralis uses MusicBrainz too (for tagging and artist pages), so it avoids the same mess:
    - **one entry per album**, with its editions, remasters and regional releases folded under it, never listed side by side;
    - EPs, singles, compilations and live albums shown in their own groups rather than hidden;
    - **gaps filled from YouTube Music and Deezer**: albums they list that MusicBrainz lacks still appear, play through YouTube Music, and can be added like any other.

  Which indexers Prowlarr has matters more than any of this code: public trackers carry little lossless music. deemix, which already runs here, can slot in as another source.

### Books

- **Books are request-only**, a hard line. A book you don't own is greyed out. Tapping it requests it and shows _Requested_, with download progress visible in search. Requests show up in the library under their own filter, next to _Downloaded_ (on the phone).
- **Book imports are Auralis's job, not yours.** Today a finished download still needs hand fixes, which is why mediaserver has four Claude commands for it (in `~/.claude/commands/`). Each becomes a step of the book fulfil job:
  - `audiobook-import`: hardlink the download into `/data/media/Books/<Author>/<Book>`, wrapping loose audio files in their own book folder, without copying data, so seeding continues;
  - `audiobook-narrator-tag`: write a clean title to `metadata.json`, and add the narrator's name only when you own the same book in more than one narration;
  - `audiobook-series-tag`: set the series and its number from Audible and Audnexus, one narration per series so the series view has no duplicates or gaps;
  - `audiobook-author-image`: add an author photo when the folder has none (Audnexus has author images, so no web scraping).

  Then Audiobookshelf picks up **only the new folder**, through its folder watcher (on for your Books library), never a full library scan. Which step of today's pipeline is slow hasn't been pinned down, so the book work in the "Play or get anything" milestone starts by timing each step on a real request: Prowlarr search, the download, the import and the scan.

### Podcasts

- **Podcasts are subscriptions**, and per your notes **you subscribe to listen**. Episodes of shows you don't follow are greyed out, and playing one subscribes you automatically. Subscribing gives you the whole show as stubs within the hour. The episodes stay in Audiobookshelf too, so Audiobookshelf keeps working on its own if Auralis ever breaks: no lock-in, as you said. YouTube channels come in the same way; they have their own section next.
