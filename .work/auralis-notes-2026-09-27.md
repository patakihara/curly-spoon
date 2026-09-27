# Auralis — Sofia's product notes (voice memo, cleaned up)

From a 52-minute voice memo, cleaned up on 2026-09-27 using the phone's timestamped
transcript, with Sofia's corrections. Timestamps (mm:ss) point back into the recording.
These are decisions and leanings, not a spec; where she was undecided, it says so.

---

## 1. Navigation (00:12, 05:24)

- The navigation bar has **Browse**, **the libraries** and **Search**.
- Undecided: one **Library** button with three sub-menus (one per content type), or
  **one button per content type**.
- **Mixed playlists** (content types mixed in one playlist): complicated, very low
  priority, and designing for them would change the whole design. **Not now.**

## 2. Browse (00:27)

- Mixes all three libraries. **No search bar.**
- At the top, a filter: **All, then one option per content type, single choice.**
  (Decided.)
- Selecting a single type makes the page look slightly different, tailored to that
  medium's content and suggestions.
- Purpose: things you might like, **including new things not in your library**, not
  just what you already have.

### Quick picks, "All" view (01:52): check Spotify for the reference

**Six small tiles**, always with the same kinds of content:

1. Last played **music**: album, playlist, song or radio
2. Last played **podcast** content: a podcast playlist (e.g. your digest), or the last
   podcast played **in the exact configuration you were listening to it in**
3. Last played **audiobook**
4–6. An **"Are you feeling lucky?"** recommendation for each of the three content
   types: something new to try quickly.

### Carousels (03:33, 39:33, 40:04)

- Below the quick picks, a set of carousels. Last played and most played are the
  important ones.
- **Most played shows no songs that are part of an album you listened to**, only
  "orphaned" songs. If you listened to the whole album, showing all its songs makes no
  sense; at most pick out one. An alternative is basing it on how much each song is
  played relative to the rest of its album ("two sigmas more" was dismissed as too
  complicated).
- **General rule: if a carousel shows a song from an album, it doesn't show another
  song from that album**, and probably not the album itself either.
- **No repeating content.** Recently added for podcasts shows recent episodes with **at
  most one episode per podcast**, dated by the episode's own publication date, not when
  it reached the library.
- "Podcasts you recently added to your library" is **not** relevant: adding something
  mostly means you remembered to add it.
- In **mixed** carousels, the line under the title names the **type of content** instead
  of the author.
- Most carousels can be opened into a bigger page. Most lists can be shown as grids and
  vice versa.

### Continuing where you left off (48:51)

- Track your **second most recently played** item too, not just the most recent. Real
  case: she switched books because the first got slow, then forgot to go back to it.
- **Up next** (like Jellyfin's "Next Up") on Browse, for podcasts and books: the next
  episode of a show, the next chapter of a book.

## 3. Play buttons (06:05)

- Spotify's primary button next to a song is Play. Auralis's per-item buttons are
  **Play next** and **Add to the end of the queue**, plus Play.
- The default depends on what's playing. **Music playing → music's default is Play
  next.** **Podcast or book playing → music's default is Play** (why else would you be
  looking at it?). You could still press Play next (see §4).
- Switching the action: maybe long-press or double-tap the button. Undecided, but
  could be cool. Could also be a setting.
- **Consistency beats clever defaults.** YouTube Music moving its Play Next button into
  a little square next to Add to queue killed her muscle memory.
- Rejected as too complicated: a default that depends on the last button pressed.

## 4. Queues (07:51–18:27)

The queues need a lot of thought; there are simple and complex ways to do them.

### Two queues

- **Music has its own queue.** **Podcasts and audiobooks share one queue, by default.**
- **Audiobooks are always split by chapter**, so a chapter is roughly one podcast
  episode. Not exact (Hardcore History episodes are very long; some books are very
  short), but there's no better model.
- Pressing **Play next on a podcast episode or book chapter while music is playing**:
  it plays right after the current song, **switching over to the spoken queue** at that
  point.
- More generally: Play next and Add to end work across content types; they only decide
  when to switch between queues. It's like a **meta-queue** over the queues.
- Open question: two or three queues, or n queues you can create? That gets
  complicated.
- **Autoplay always comes at the end and continues from the last queue played.**

### Music queue: Spotify style and YouTube Music style, user's choice

Three concepts: **1. playing from** (the album or playlist), **2. the queue**, **3.
autoplay** (an endlessly generated list that feeds into the queue).

- **YouTube Music style: the default** ("simpler, and better"). There's no "playing
  from". Playing an album puts the whole album in the queue. Play next inserts after the
  current item. Add to queue appends at the end, after the album. Autoplay starts when
  everything has played. (She usually plays albums on repeat, so rarely hits autoplay.)
- **Spotify style**: current song, then your queue, then the "playing from" context,
  then autoplay. Since the queue sits *before* the album, you can never add something to
  play *after* the album without interrupting it: "so, so, so stupid".
- **A Spotify flaw not copied:** played items vanish from the queue and you can't go
  back. In Auralis, **the queue and play history are preserved, and Back always walks
  the play history** (Forward walks the queue).
- Defaults, YouTube Music mode: a **song → Play next**; an **album → end of the
  queue**.
- It's configurable because people are used to one or the other.

### Autoplay and mixing (17:31)

- Autoplay might be the most powerful feature for audiobooks and podcasts.
- **Alternating two books**: a book is a queue of chapters, just as an album is a queue
  of songs. A mix could interleave the chapters of two books. It has to be clever and
  skip each chapter's intro (if chapter metadata makes that possible), and the mixed
  queue must be editable.
- The **autoplay algorithm**: no ideas yet (see §10).

## 5. Listening lists (18:32)

- A **listening list** for books: define what you want to listen to next and tick
  through. Not a queue, not quite a playlist: a watch list. Finished books get crossed
  off.
- Like a book series, except you define it.
- At the bottom it **recommends what to add next**: a book, or a **limited-run podcast**
  (e.g. six episodes, which in many ways is a book). Recommendations understand this
  kind of list. You can filter the suggestions by content type.

## 6. Podcast playlists and digests (19:49)

- Spotify's "Your Episodes" (or YouTube Music's, she can't remember which) mixed "play
  this podcast now" into her queue, and she couldn't clear the queue. Very frustrating.
- **Podcast playlists**: episodes you pick yourself.
- **Auto-generated, auto-updating playlists**, above all the **Digest**: the latest
  episodes of every podcast you're subscribed to.
- **Custom digests**: group a few podcasts, name it, and go through their latest
  episodes. A playlist holds specific existing episodes; a digest is a rule over shows.
- A digest plays in chronological or reverse chronological order. **Episodes leave it
  once played.**
- Back is still the listening history; for podcasts you'll mostly use skip back
  instead.

## 7. Now Playing controls (21:08)

- Controls match the content. **Podcasts and audiobooks get speed and skip buttons;
  music doesn't.**
- Music speed still exists, **buried elsewhere in the UI**, not removed.
- From Now Playing: open the queue, and info about the song and artist.

## 8. Search (21:39)

- One tap on Search opens it **with the keyboard up**. It searches everything; filter
  afterwards.
- **The most relevant result sits at the top, whatever type it is**, maybe as a
  carousel.
- **Search as you type**, with suggestions: one or two levels, or maybe just
  autocomplete.
- Library content ranks first and must be **indexed** for fast queries. Part of the
  recommendation work is that index, and anticipating what she'll search next.

### In library or not, and how you listen (23:24)

- **"Dirty streaming"** (her term) = playing from the NewPipe/YouTube route. The
  opposite is torrents, the "high quality" route.
- **In library** = on the server; for podcasts, subscribed (the stubs; same thing in
  practice).
- **Books**: can't be dirty streamed. **Request only**, a hard line. Not-in-library
  books are **greyed out**. Tapping requests it and shows **"Requested"**. **Download
  progress** is visible from search, and requests show up in the library.
- **Albums**: dirty stream **or request** (high quality).
- **Songs**: dirty stream. Added to the library when **~90% is played**, or when you
  add it yourself. A few seconds and a skip doesn't add it.
- **Podcasts**: subscribed or not, which is the podcast version of in the library.
  Subscribing generates the stubs (already built). Leaning: **you must subscribe to
  listen**. Episodes of unsubscribed shows are greyed out, and **playing one
  subscribes you automatically**.
- **Marking:** anything not immediately playable is greyed out. Streamable songs and
  albums aren't greyed out. Either they get a subtle "not in library" label, or,
  preferred direction, **in-library items get a small label, icon or dot**. Undecided.
- **Library filters:** Your library · **Downloaded** (to the phone) · **Requests** (on
  their way into the library).

### Audiobookshelf compatibility (27:52)

- Audiobookshelf shows every stubbed podcast episode as new and unplayed, which she
  doesn't love. She considered not adding every episode to Audiobookshelf, **but she
  doesn't want lock-in to Auralis**: it's in active development and a version could
  break. Audiobookshelf has to stay usable on its own, so the episodes stay in
  Audiobookshelf.

## 9. Streaming mode (29:40)

- It should be possible to run the app in **dirty streaming mode**.
- Candidate sources: Deezer was one option. Soulseek can't stream. She found an app
  using YouTube Music the NewPipe way; check it still works. **She'd love to do it that
  way.**
- In streaming mode you wouldn't need a media server: **create an account and just
  stream** songs and podcasts. **Audiobooks always fall back to Audiobookshelf.** This
  would let **other people use the app** too.
- It shouldn't burden her media server: the backend mostly **points users at the
  streams and forwards them**, no transcoding.
- Especially good if it ties into the Spotify Jam idea (§11).
- **Song identity / source of truth**: a stable ID that bridges a song on Spotify and
  the same song in Auralis. Maybe **iTunes' API** as the source of truth, with
  **MusicBrainz** metadata. iTunes matches files on metadata plus audio properties such
  as length. It doesn't matter much, as long as it works.

## 10. Recommendations and autoplay (41:05)

- Autoplay algorithm: **first approximation, use what YouTube serves** for related
  items. It isn't personalised without an account, so that's not ideal. Investigate how
  these systems work and how profiles are defined.
- Data: her **Spotify export** (plus an older account's, if she can find it), and her
  **YouTube Music history** (years of it). Analyse the long-term listening.
- Find **open-source recommendation algorithms** and integrate them. Especially: how the
  **old YouTube Music algorithm** worked. It was "so, so good".

## 11. Spotify integration (later)

- Use her Spotify data; maybe **sync listening from Spotify** into Auralis (one way; the
  same from YouTube Music would be nice but probably isn't possible). Per user.
- **Spotify Jam**: push Auralis's queue into a Jam so Spotify's queue matches it. Would
  be wonderful, if possible.
- **Browse public Spotify playlists.** Nice to have.

## 12. Lyrics (36:41)

- Auto-scrolling synced lyrics are annoying when out of sync or when you want to read.
  **Sync can be switched off**:
  - Off: every line at full opacity, and **a small dot** marks the current line.
  - The dot can be turned off from the lyrics' **three-dot menu** (not Settings).
    Already specified in Sonora.
  - Sync on/off is **one tap on a button always in the top corner** of the lyrics.
- Makes for clean screenshots. Maybe **screenshot detection like Spotify's**, with
  nicer lyric formatting and styling choices. Probably too much.

## 13. EPUB read-along (34:37)

- Download the **EPUB together with the audiobook**.
- **Sync**: the cheapest possible speech-to-text on what's playing, matched against a
  **small window** of the EPUB around the current position. Crude text, no
  punctuation, a "maximum fit" search rather than an exact match. In the right window it
  can't really be wrong. **Read and listen at the same time.**
- Complements lyrics. Podcast transcripts exist, but this is "way cooler".

## 14. Artist pages, shapes, library layout (38:42, 44:21)

- **Artist pages: do what Spotify does**, plus a bit more. **Not restricted to your
  library**, with an **"In your library" carousel** that opens as a list or grid.
- **Shapes, universal and never changing:** **artists, authors and hosts are circles;
  content is rounded squares.** Spotify separates podcasts (rounded) from playlists and
  albums (square) and isn't even consistent about it. Don't copy that.
- Library: a **3×n grid of small tiles** on mobile, bigger on desktop, with a **grid/list
  toggle**.
- Library sorting: alphabetical, by artist, **and random**. Keep tapping Random to
  reshuffle, then pick something you already own.

## 15. Users (43:20)

- **User management**, with **single sign-on across delivarr as a whole**, maybe based
  on **Jellyfin credentials** (Jellyfin may offer integrations; look into it).
- Maybe a concept of a **user library** that belongs to Auralis, not to delivarr as a
  whole.

## 16. Way later

- **YouTube videos at the podcast level** (video podcasts). An extra integration, kept
  distinct from dirty-streaming music from YouTube.
