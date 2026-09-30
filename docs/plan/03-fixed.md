---
id: fixed
nav: Your decisions
part: Why and what
---
## Your decisions

::: lede
Fixed inputs, not re-opened.
:::

These come from `USER_DECISIONS.md`, the spec addendum and the research notes. The plan builds on them as written. Where a decision rested on a factual premise that turned out false, the plan keeps the decision and fixes the premise (one case, marked).

::: grid g2
::: card
#### Product and platforms

- Bundle music, podcasts and audiobooks and replace Spotify. _"spotify killer, don't forget ;)"_
- Spotify is the reference, and should be looked at rather than guessed at.
- **Browse** (icon `explore`) is the one discovery screen. Home, For You and Discover are the same thing and are distinct from **Search**. The name lives only in UI strings.
- Five destinations: Browse, Music, Books, Podcasts, Search, one button each (as Sonora draws it), not a single Library button with a sub-menu.
- Web includes desktop, runs in Docker, one container with one port, a PWA rather than Electron, native Compose + Media3 on Android.
- Web and Android are developed together, with parity.
- **Android installs through your own F-Droid repository**, added in Droid-ify (`https://patakihara.github.io/curly-spoon/repo`, live, serving 0.2.0), or through Obtainium from GitHub Releases. The rebuild keeps this path: same app id (`net.develivarr.auralis`), same signing key, same repository address, so the installed app updates in place.
- Downloads are Android-only; web leaves the button out rather than faking it. Android Auto is a design constraint, not a toggle.
- Android gets a Settings screen. Ebooks with read-along sync are wanted but lower priority. The launcher icon stays as it is for now.
:::

::: card
#### Playback

- **Queues**: a **music queue** and a **spoken queue that podcasts and audiobooks share** by default, with books split into chapters. The music queue works YouTube Music-style by default, Spotify-style as an option. **Back always walks play history.** Every queue can be cleared.
- Transcoding is acceptable. <span class="pill t-req">premise fixed</span> It was said to work; it doesn't (see "Where it stands"). The plan makes it work _and_ adds direct play, since offline downloads need the original files anyway.
- **Never video.** Auralis has no way to show video, anywhere: not for YouTube, not for music, not for podcast feeds that publish video episodes. Everything plays as audio, and YouTube thumbnails are only used as cover art.
:::

::: card
#### Library and getting things

- Library pages show only what you own plus what you've requested.
- **Each person sees their own library** (what they added, requested, subscribed to or played). Files stay shared; "show everyone's library" is a setting, off by default, and search always covers the household.
- Artist and author pages show the whole catalogue, with unowned titles greyed out and requestable. **On by default**, with a setting to turn it off.
- Books come through Prowlarr first, with the AudiobookBay scraper as fallback, via qBittorrent or Transmission. Approval is automatic by default.
- **Music follows AbleMusicPlayer's approach** (researched from its source, at your request): YouTube Music is the catalogue and the audio source, reached through a NewPipe-style extractor, with Spotify used only to import playlists.
- **Torrents stay for music too**, above all for higher quality. YouTube Music gives instant play and single-song keeps; **adding an album to the library always goes the torrent route**, for lossless.
- **A kept song is saved as the original stream** (YouTube Music's Opus, about 160 kbps) as-is, with no re-encoding.
:::

::: card
#### YouTube channels

- **YouTube channels can be added as podcasts**, as audio-only shows that behave like any other subscription.
- **SponsorBlock on YouTube channels**, in Auralis and in the Audiobookshelf app alike.
- **Watched state and position sync with your YouTube account only for channels you've added**, both ways, as an opt-in setting per person. The rest of your YouTube history never comes into Auralis, and YouTube videos and channels are never recommended.
:::

::: card
#### Discovery and search

- Recommendations come from **external** sources and are mixed into Browse. _"not useful to me if recommendations only show things already in my library."_
- Mixed-content carousels, at most one episode per podcast in a carousel, each card with a reason line, and a loading state that holds until everything has arrived.
- One provider per medium: _"Why would the recommendation services for the THREE different kinds of content we have be the same?"_ Provider choice is delegated. Audible and YouTube terms of service don't matter for your own install.
- Research picks: ListenBrainz for music; for books, Audible's "listeners also enjoyed", with Audnexus for metadata; for podcasts, Apple Podcasts' "You Might Also Like", with PodcastIndex and iTunes as the catalogue; for music, YouTube Music radio alongside ListenBrainz. All checked live.
- Things you already own show up in search but can't be requested. Global search has suggestions.
- Search doubles as the request view, with library results and requestable results clearly separated.
- Lyrics search uses an external provider (LRCLIB).
:::

::: card
#### Design

- Sonora is the design source of truth: flat surfaces, one violet accent that nobody picks plus a rose for Now Playing, playback controls and Browse's media filter, nothing green from Spotify, motion by named role, no emoji. From Spotify it takes **affordances, not visual design** (_"not to copy spotify's visual design, but moreso the affordances of the components"_), and no new search bar.
- **One Auralis repo holds the design and the apps**; the Sonora and canvas artifacts are published from it. You work on the design by commenting on the artifacts or asking in chat.
- **Some design inputs stay private.** The Spotify reference screenshots and the original Sonora author identities stay out of the public repo. The screenshots stay on the laptop, gitignored.
:::
:::

::: small muted
Also carried over: the escalation test _"would she have an opinion, and does the answer change what she gets?"_ Ordinary calls are made, not escalated. The research finding that the extractor is a poor _recommender_ still stands. ListenBrainz picks what to suggest, and YouTube Music makes it playable.
:::
