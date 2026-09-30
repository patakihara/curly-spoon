---
id: play
nav: Playback & queues
part: The product
---
## Playback & queues

This is the part most visibly broken today, and the first thing to get right. The rule: **the server works out how to play something; the clients just play the plan.**

::: diagram play

### What each player does

- **Gapless across files.** A multi-file book or an album is one plan. Web keeps two audio elements and preloads the next track about 20&nbsp;s before the end; Android hands the whole plan to ExoPlayer as a playlist. Chapters are positions on one timeline, so they work across file boundaries.
- **Dirty-streamed tracks** (YouTube Music) are resolved by the server when the plan is built, then passed through the same range proxy as everything else, with no transcoding, so seeking and the lock screen behave identically. The next track in the queue is resolved and fetched ahead of time, in ranged chunks (as AbleMusicPlayer does, which dodges throttling) into a small capped cache, so there's no gap. Playing a stream reports to the taste profile just like a Jellyfin play.
- **Transcode, made to work.** When the server has to transcode, the backend proxies Audiobookshelf's `/hls/` playlist and segments. Web plays them with `hls.js`, Android with Media3's HLS module. Offline downloads always use the original files.
- **Controls on both platforms:** speed (pitch preserved), sleep timer (including "end of chapter"), bookmarks synced to Audiobookshelf, next/previous, shuffle and repeat for music; spoken: skip back/forward, next/previous only at episode/chapter start/end. Lock screen and notification controls use the same actions (`setPositionState` on web).
- **SponsorBlock, live.** On a YouTube channel's episode, the players also skip segments submitted after its file was cut.

### Queues and autoplay

Queues belong to a device's listening session (see "Library and accounts"). They're stored on the server so each device resumes its own, and they don't follow you to another device unless you say "Continue here".

::: grid g2
::: card
#### Two queues

- **Music queue.** **Spoken queue**, shared by podcasts and audiobooks by default. A book enters as its chapters, since a chapter is roughly an episode.
- Switching is a **meta-queue** over the two. Play next on an episode or chapter while music plays makes it play right after the current song, and playback moves over to the spoken queue there. Starting one queue pauses the other; it isn't cleared.
- **Back walks your play history, Forward walks the queue.** Nothing leaves the queue unrecoverably (the Spotify flaw you called out).
- **Autoplay** always comes at the end and continues from the last queue that played.
:::

::: card
#### Music queue: two styles, a setting

- **YouTube Music style, the default.** No "playing from": an album goes into the queue whole. _Play next_ inserts after the current item; _Add to queue_ appends after everything, album included. Then autoplay.
- **Spotify style.** Current → your queue → the "playing from" album or playlist → autoplay.
- Default button actions: a **song → Play next**, an **album → end of queue**. When a podcast or book is playing, music's default becomes **Play**. Long-press or double-tap for the other action (to be tried in design). Buttons never move.
:::
:::

| Queue runs out | What autoplay does |
|---|---|
| Music | First version: YouTube Music's own radio for the last track (not personalised, as you noted), mixed with similar music you own. Then the autoplay algorithm in the recommendation section takes over. |
| Spoken | The next unplayed episode of the same show (oldest first for serial shows, newest first for episodic ones, from the feed's `itunes:type`), or the next chapter or book in the series. Later, the next entry of your listening list. |

### Lists that aren't queues

- **Listening lists** (books, and limited-run podcasts): a watch list you tick through, with finished items crossed off. At the bottom, recommendations for what to add next, filterable by type.
- **Podcast playlists**: episodes you pick. **Digests**: a rule over shows. _The Digest_ covers every subscription; custom digests cover a group you name. Played in chronological or reverse order, and an episode leaves once played. Playing an episode from a digest marks it played but never moves your place in a show you're working through, oldest-first or newest-first. Playing a digest switches to its own queue, saving the queue that was playing. Playing that queue's current episode, or the next if it had just finished, goes back to it; playing the digest, or an episode from the digest's page, returns to the digest's queue.
- **Later**: alternating two books, meaning a generated spoken queue that interleaves their chapters, skips each chapter's intro where chapter metadata allows, and can be edited.
