---
id: search
nav: Search & lyrics
part: The product
---
## Search & lyrics

- **One tap opens Search with the keyboard up.** Typing brings suggestions; results come only when you submit.
- **Suggestions as you type** come from a prefix index over your local catalogue (titles, creators, series) plus recent searches, served by one `GET /search/suggest` within about 50&nbsp;ms. Spotify-style: each suggestion names its kind.
- **Results are one global ranking.** One call searches your library and every outside source (YouTube Music, MusicBrainz, PodcastIndex, the book indexers, LRCLIB) and ranks it all together: the **most relevant result of any kind or source comes first** (possibly a carousel). The list renders once, when every source has answered or timed out, so the top result never snaps to another. Each row shows whether it's owned (plays), streamable (plays straight away) or requestable (a request or subscribe button with live status); an owned title is never requestable. The back layer's kind buttons only filter, never sort or group.
- **Lyrics.** LRCLIB fills in synced and plain lyrics for every owned track as a background job and caches them. Now Playing shows synced lyrics. Song results also match a remembered line, from the local lyric index then LRCLIB's full-text search, and show the matching line; a hit you own plays, and one you don't is found on YouTube Music and plays too.
