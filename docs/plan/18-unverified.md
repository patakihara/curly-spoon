---
id: unverified
nav: Not verified
part: Delivery
---
## What this plan hasn't verified

::: small
- Sonora was read through its docs and component APIs. The 43 reference screenshots were read through their per-screen notes, not opened one by one.
- Where audiobook previews come from (a retail sample URL keyed by ASIN) is to be confirmed at the start of M4.
- Why Lidarr misses music: a month of its warning logs (indexer request limits and outages), its strict edition matching, and your experience of its catalogue (editions mixed together, albums missing). Its matching wasn't tested directly, and the rebuild doesn't use it. How well YouTube Music and Deezer fill MusicBrainz's gaps for your artists is checked when music requests are built.
- The web multi-file stall is read from code, not reproduced. The Android first-file-only and missing progress sync are unambiguous in code but weren't run.
- Jellyfin's real lyrics and `ProviderIds` responses and the qBittorrent cookie name are unverified until M0's recordings. So is the current reliability of YouTube Music extraction from this server's IP; M3 starts with a canary.
- Whether the ThinkPad holds unpushed Auralis work newer than `781efd4`: it was unreachable when the repo was read.
- Which step of the book pipeline is slow. The four `audiobook-*` commands show what imports need fixing by hand, not where the time goes; timing it is the first book task.
- That Audiobookshelf's folder watcher reliably picks up a new book folder on its own (it's on for the Books library). If it doesn't, Auralis asks for a scan of that one library at a quiet moment instead.
- How Auralis acts as each user in Audiobookshelf and Jellyfin after a single sign-on login (both are on the sign-on already, but getting an API token per user hasn't been tried).
- Watched-state and position sync on your account: reading watch history and marking videos watched with sign-in cookies is known to work in the extractor, but hasn't been tried here. Setting YouTube's resume position by sending a real position instead of "the end" should work but isn't done by any tool known to this plan, and how long exported cookies last in practice is unknown.
- Cutting SponsorBlock segments without re-encoding is only as precise as the audio's frame size (tens of milliseconds for YouTube's audio), which should be inaudible. Audiobookshelf picking up a re-cut file of an unstarted episode cleanly (new length, no stale progress) is to be tested with the first channel.
- Where the Android signing keys are kept besides GitHub's secrets. If the app signing key were lost, the installed app could no longer update in place and would have to be reinstalled. A backup outside GitHub is checked before the first release.
- Recommendation quality: measured by the held-out replay score on your own history once phase 1 runs, not predicted here. The embedding and audio models' speed on this box needs a benchmark.
:::
