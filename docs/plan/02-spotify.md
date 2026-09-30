---
id: spotify
nav: Replacing Spotify
part: Why and what
---
## What replacing Spotify means

Spotify does seven jobs. Each column shows where Auralis does that job for one medium, from sources already decided.

| Job | Audiobooks | Podcasts | Music |
|---|---|---|---|
| Play it, seamlessly | Audiobookshelf, gapless across files, chapters, speed, sleep timer, bookmarks | Audiobookshelf, via your podcast stubs (first play hydrates the file) | Jellyfin for what you own; **YouTube Music for everything else**, playing straight away |
| Keep going | Next in series, when owned | Next unplayed episode of the show | Rest of the album or playlist, then a radio: YouTube Music's own radio for the seed track, mixed with similar music you own |
| Your library | Books, series, authors, progress | Subscriptions, new episodes, in progress | Albums, artists, playlists, favourites, history |
| Get what you don't have | Prowlarr → AudiobookBay → qBittorrent, then Auralis's own import (folder layout, metadata, series, author photo), which Audiobookshelf picks up without a full library scan | Subscribe in Audiobookshelf; for a regular feed the stub reconciler fills in the back catalogue, and a YouTube channel arrives as audio, downloaded as it's cut | It already plays. A **song** is saved from YouTube Music in seconds (from its menu, or by itself once mostly played). An **album** added to the library is always torrented in lossless (Prowlarr → qBittorrent, Auralis's own matching and import), replacing any songs kept from it when it lands |
| Discover | Audible's "listeners also enjoyed", seeded from books you've listened to | Apple Podcasts' "You Might Also Like", seeded from shows you listen to | YouTube Music radio and related, plus ListenBrainz similar artists |
| Find by memory | Search with suggestions | Search with suggestions | Search your library and YouTube Music together, with suggestions, plus lyrics search (LRCLIB) and synced lyrics |
| Anywhere | Web and PWA on desktop and phone; Android with background playback, downloads and Android Auto for all three media; progress shared between devices, each device keeping its own queue |  |  |

::: callout
This closes the biggest gap to Spotify, **instant play of music you don't own**, as you asked, its costs budgeted for. YouTube keeps changing its internals, so a daily job updates the extractor, gated by a canary (AbleMusicPlayer bumps its pin daily). A broken day shows a clear "streaming unavailable" state; owned and kept music keeps working.
:::
