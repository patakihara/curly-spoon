---
id: play
nav: Playback & queues
part: The product
---
## Playback & queues

The rule: **the server works out how to play something; the clients just play the plan.**

::: diagram play

### What each player does

- **Gapless across files.** A multi-file book or an album is one plan. Web keeps two audio elements, preloading the next track about 20&nbsp;s before the end; Android hands ExoPlayer the whole plan as a playlist. Chapters are positions on one timeline, so they cross file boundaries.
- **Dirty-streamed tracks** (YouTube Music) are resolved by the server when the plan is built and passed through the same range proxy, untranscoded, so seeking and the lock screen behave alike. The next queued track is resolved and fetched ahead, in ranged chunks into a small capped cache, so there's no gap. A streamed play feeds the taste profile like a Jellyfin play.
- **Episodes don't wait for files.** One still a stub, or not stubbed yet, plays from its feed enclosure through the same range proxy.
- **Transcode, made to work.** When the server transcodes, it proxies Audiobookshelf's `/hls/` playlist and segments, played with `hls.js` on web and Media3's HLS module on Android. Offline downloads always use the original files.
- **Controls on both platforms:** speed (pitch preserved), sleep timer (including "end of chapter"), bookmarks synced to Audiobookshelf, next/previous, shuffle and repeat for music; spoken: skip back/forward, next/previous only at episode/chapter start/end. Lock screen and notification controls use the same actions.
- **SponsorBlock, live.** On a YouTube channel's episode, players also skip segments submitted after the cut.

### Queues and autoplay

::: grid g2
::: card
#### Two queues

- **Music queue.** **Spoken queue**, shared by podcasts and audiobooks by default. A book enters as its chapters, since a chapter is roughly an episode.
- Switching is a **meta-queue** over the two. Play next on an episode or chapter while music plays puts it right after the current song, where playback moves to the spoken queue. Starting one queue pauses, not clears, the other.
- **Back walks your play history, Forward walks the queue.** Nothing leaves the queue unrecoverably.
- **Autoplay** always comes at the end and continues from the last queue that played.
:::

::: card
#### Music queue: two styles, a per-user setting

- **YouTube Music style, the default.** No "playing from": an album goes into the queue whole. _Play next_ inserts after the current item; _Add to queue_ appends after everything, album included. Then autoplay.
- **Spotify style.** Current → your queue → the "playing from" album or playlist → autoplay. **Play** on a second album makes it "playing from", the first's unplayed rest after it.
- Default button actions: with nothing playing, any item's button plays it. While music plays, a **song → Play next** and an **album → Add to queue**; while a podcast or book plays, a song or album → **Play**. Either way, an episode or book → **Play next**. Tapping an episode or book opens its page. Long-press or double-tap for the other action (to be tried in design). Buttons never move.
:::
:::

| Queue runs out | What autoplay does |
|---|---|
| Music | The rest of the album, then similar music you own (Jellyfin's Instant Mix); from M3, YouTube Music's radio for the last track (not personalised) joins it. Then the recommendation algorithm under Discovery takes over. |
| Spoken | The next unplayed episode of the same show (oldest first for serial shows, newest first for episodic ones, from the feed's `itunes:type`), or the next chapter or book in the series. Later, the next entry of your listening list. |

### Lists that aren't queues

- **Listening lists** (books, and limited-run podcasts): a list you tick through, with finished items crossed off. At the bottom, recommendations for what to add next, filterable by type.
- **Podcast playlists**: episodes you pick. **Digests**: a rule over shows: unplayed episodes of the last 14 days. _The Digest_ covers every subscription; a custom digest, a group you name. Each digest plays oldest or newest first, and an episode leaves once played. Finishing or skipping one marks it played, but the play is ignored: autoplay and Up next keep your place in the show. Playing a digest saves the spoken queue and puts the digest's in its place; when it runs out, nothing autoplays. Playing the saved queue's current episode, or its next if that had finished, restores it; playing the digest, or an episode from its page, restores the digest's queue.
- **Later**: alternating two books: a generated spoken queue that interleaves their chapters, skips each chapter's intro where chapter metadata allows, and can be edited.
