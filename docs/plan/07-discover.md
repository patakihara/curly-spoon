---
id: discover
nav: Discovery
part: The product
---
## Discovery

::: lede
Browse, recommending what you don't own.
:::

The old code's taste profile, from your library and play history, is kept. New: candidates come from outside, are matched against what you own, and Browse mixes them in.

::: diagram discover

### How it becomes Browse

- **Identity first.** The index keeps the ids the old code threw away: ASIN from Audiobookshelf books, feed URL and GUID from podcasts, MusicBrainz ids from Jellyfin's `ProviderIds`. Matching tries exact ids, then a normalised title plus creator, and treats "not sure" as owned rather than risk showing you something you have.
- **Browse layout, from your notes.** No search bar. A **single-choice filter**: All, Music, Podcasts, Books. Each single type gets its own tailored page. In "All", **six quick picks**: last played music, last played podcast content (in the exact configuration you left it), last played audiobook, and one _"Are you feeling lucky?"_ pick per type. Then **Up next** (next episode or chapter, like Jellyfin's Next Up), with your **second most recent** book or show kept visible too, so a paused book isn't forgotten. Then carousels.
- **Carousel rules** (your notes): _Most played_ shows only "orphaned" songs, never the tracks of an album you played whole. A carousel never shows two songs from one album, nor a song and its album. No repeating content: at most one episode per podcast, dated by publication. No "podcasts you recently added". Mixed carousels name the content type under each title. Any carousel opens into a full page, as a list or grid.
- **Context shelves follow the Spotify screens Sonora documented** (S05–S30), with headers that say why they're there. _More like_ an artist, show or episode, _Popular with listeners of_ a show, _Based on your interest in_ a genre, each with the subject's own art (Sonora's extended `SectionHeader`). Feature cards argue for single items at length, with a blurb and a **Preview**. The server sends each shelf's `eyebrow`, `subject` and `subjectArt`, not just a title. Each external card has a reason line. External **music** cards play straight away through YouTube Music; an album card offers _Add to library_ (a torrent request), a song keeps it only from its menu. External books have a request button, shows a subscribe button. Owned cards just play.
- **Previews before commitment** (Sonora's `PreviewButton`). Music previews play a YouTube Music clip, and episodes play the first minutes of the public feed enclosure. Audiobooks play the publisher's retail sample, looked up by ASIN (source to be confirmed in M4). A preview never touches your queue or library.
- **Precomputed, then composed.** Provider calls run as background jobs within their rate limits (MusicBrainz 1 req/s, Audnexus about 100/min). Browse only reads the pool and your live progress, so one fast call answers and the loading state is short.
- **Every provider is seeded from what you listened to**, weighted by how much you played, never from library contents.
- **YouTube is recommended only from your own channels.** Browse, autoplay and "Are you feeling lucky?" never suggest a channel you haven't added, or its videos; one you haven't added appears only in Search results. New videos from your channels show up like any other episode, in digests and Up next.
- **Quality gets judged on your real library**: 231 books, your podcast subscriptions and your Jellyfin history. A review page lists each shelf with its reasons.

### The recommendation algorithm

**Your taste comes from what you've actually listened to, not what's in your library:** plays, progress and completions (Jellyfin, Audiobookshelf, Auralis), plus your Spotify and YouTube Music history. Owning something only affects how it's shown: a book you own but never started says nothing about your taste.

Researched across Spotify's and YouTube's published work and open-source recommenders: documented techniques work at small scale, with no GPU or model trained from scratch.

| Phase | What it does | Why it fits |
|---|---|---|
| 1 · Seeded from your history | Import your Spotify export (and the older account's, if found) and your YouTube Music takeout into one play-history table per user, merged with Jellyfin and Audiobookshelf plays. From it: a **co-occurrence table** (what you play near what, within a listening session), weighted to damp popular items (PPMI), and a **next-item table** (what you tend to play after what). | Plain SQL, no training, works from day one on years of real data. Solves cold start without asking you anything. |
| 2 · Candidates from outside | Each medium gets its own listener-overlap source, all checked live: <ul><li>**Music**: YouTube Music's radio and "related" for a track (per track, no account, instant), ListenBrainz similar artists (by MusicBrainz ID), and Deezer related artists as a no-key fallback.</li><li>**Books**: Audible's "listeners also enjoyed" for each book you've listened to, plus series order.</li><li>**Podcasts**: Apple Podcasts' "You Might Also Like" for each show you listen to, read from the show page, plus iTunes and PodcastIndex search by genre.</li></ul> Description similarity (a small text-embedding model on the server) covers items those sources miss. All candidates are scored against your taste profile, not taken in the provider's order. | Uses the providers already chosen. Every shown item logs where it came from, so later phases learn which sources you actually like. |
| 3 · Learning from you | Your reactions become the signal: completions, **graded skips** (instant, early, late), favourites, adds to library, requests. Every Browse shelf and autoplay pick keeps a small **share of exploration** (about 10–20%) so taste can move. Later this becomes a per-source bandit that shifts weight to the sources you respond to. Once your own history is big enough, a nightly **item2vec** job learns "sounds like it belongs next to" vectors from your sessions. | Tiny counters in SQLite and one small batch job, the same pattern as Spotify's home-screen ranking (BaRT), at household size. |
| 4 · Maybe: audio similarity | Audio features from the files themselves (Essentia models), for "sounds like" radio. | Only if a benchmark on this box shows it fits in RAM overnight. Skipping it entirely is fine. |

- **Autoplay**, when a queue runs out: music takes the last track's next-item and co-occurrence neighbours, mixed with ListenBrainz and YouTube Music radio candidates. Spoken continues the show or series, then close matches by author, narrator and description.
- **"Are you feeling lucky?"** is the exploration share turned up: a strong candidate from outside your neighbourhood, one per medium.
- **Diversity is hard rules first** (one per artist, show and album per shelf, your carousel rules). Finer "not too similar to what's already shown" tuning comes only with similarity scores to tune.
- **Per user**: every table is keyed by user.
- **Measured, not guessed**: hold out your latest months of history and check whether each version would have put what you actually played next in its top 10; that score must not drop between versions.

**Checked live today.** Book and podcast seeds come from your library; the music seeds were picked for the test.

- **YouTube Music radio**: _Private Eye_ → blink-182, Green Day, Jimmy Eat World, Sum 41; _Motion Sickness_ → Big Thief, Mitski, Manchester Orchestra. Each track also exposes "You might also like" and "Similar artists".
- **ListenBrainz**: Alkaline Trio → Bad Religion, Yellowcard, Rise Against, Jimmy Eat World, My Chemical Romance. **Deezer**: → The Ataris, New Found Glory, MxPx.
- **Audible**: _If Anyone Builds It, Everyone Dies_ → _Life 3.0_, _The Alignment Problem_. Only 7 of your 233 books carry an Audible ID, but Audible's search finds them by title and author (3 of 3), so a job backfills them. Audnexus has no "similar" field; it stays for metadata.
- **Apple Podcasts**: _If Books Could Kill_ → _Maintenance Phase_, _You're Wrong About_, _5-4_, _You Are Good_, _American Hysteria_. Read from the page's HTML, it needs repair when Apple changes the page.

::: small muted
**Not established:** that the old YouTube Music algorithm worked in some knowable way (no public source explains it). Music-to-book taste transfer (no prior art found; treat it as an experiment). How fast the embedding and audio models run on this box (benchmark first).
:::
