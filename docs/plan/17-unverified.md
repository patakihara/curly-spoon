---
id: unverified
nav: Not verified
part: Delivery
---
## What this plan hasn't verified

Each line names the item that checks it, and goes once that's done.

::: small
- The 43 Spotify reference screenshots were read through their per-screen notes, not opened one by one (M0.canvas).
- Where audiobook previews come from (a retail sample URL keyed by ASIN) (M4.browse).
- How well YouTube Music and Deezer fill MusicBrainz's gaps for your artists (M3.catalog). Lidarr's matching wasn't tested directly; the case against it rests on its logs and your experience.
- Jellyfin's real lyrics response (M1.shell) and the qBittorrent cookie name (M3.books).
- MusicBrainz ids in Jellyfin's `ProviderIds`: every recorded track carries none (M4.identity).
- How reliably YouTube Music extraction works from this server's IP; a canary comes first (M3.ytmusic).
- Which step of the book pipeline is slow; the four `audiobook-*` commands show what needs hand fixes, not where the time goes (M3.timing).
- That Audiobookshelf's folder watcher (on for Books) reliably picks up a new book folder; if not, Auralis scans that one library at a quiet moment (M3.books).
- Watched-state and position sync on your account: reading watch history and marking videos watched with sign-in cookies works in the extractor but is untried here; setting YouTube's resume position by sending a real position instead of "the end" is done by no tool this plan knows; how long exported cookies last is unknown (M3.ytsync).
- Cutting SponsorBlock segments without re-encoding is only as precise as the audio's frame size (tens of milliseconds on YouTube), which should be inaudible; and whether Audiobookshelf takes a re-cut file of an unstarted episode cleanly, new length and no stale progress (M3.ytshows).
- Whether the Android signing keys are backed up outside GitHub's secrets (losing them forces a reinstall), asked in the outbox (M0.repo).
- Recommendation quality, measured by the held-out replay score on your history; your Spotify and YouTube Music exports, requested, not yet seen (M4.reco).
:::
