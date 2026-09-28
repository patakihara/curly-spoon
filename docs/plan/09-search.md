---
id: search
nav: Search & lyrics
part: The product
---
## Search & lyrics

- **One tap opens Search with the keyboard up.** It searches everything as you type, with the **single most relevant result at the top whatever its type** (possibly a carousel), then filters.
- **Suggestions as you type** come from a prefix index over your local catalogue (titles, creators, series) plus recent searches, served by one `GET /search/suggest` within about 50&nbsp;ms. Spotify-style: each suggestion names its kind.
- **Results** are one call with two sections. Your library, ranked by relevance, which plays and has no request action. Below it, results from outside the library, from each medium's own search. Music comes from YouTube Music and plays straight away. Books (Prowlarr/AudiobookBay) and podcasts (PodcastIndex) come with a request or subscribe button and live status. Kind chips filter them from the backdrop's back layer.
- **Lyrics.** LRCLIB fills in synced and plain lyrics for every owned track as a background job and caches them. Now Playing shows synced lyrics. Search gets a Lyrics chip that matches a remembered line against the local lyric index first, then LRCLIB's full-text search, so a hit you own plays, and one you don't is found on YouTube Music and plays too.
