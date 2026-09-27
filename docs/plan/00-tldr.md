---
id: tldr
nav: The short version
part: Why and what
---
## The short version

::: hero
1. **Start a fresh codebase, keep the decisions and a few proven parts.** The old repo's product decisions and research stand as written. Its code mostly doesn't: audiobook playback breaks on your real server (checked today), Android plays only the first file of a book and never saves progress, and the API is hand-copied three times.
2. **The same stack, but every seam is shared.** One container and a TypeScript backend, a React web app and native Android, as you decided. What's new: one API schema generates both clients, one _playback plan_ drives every player, and one request pipeline serves all three media.
3. **Nothing counts until it works on your real servers.** Every upstream adapter is tested against responses recorded from mediaserver's own Audiobookshelf, Jellyfin, qBittorrent and so on, never against fixtures written from docs. This single rule would have prevented most of the old project's failures.
4. **Music works the way AbleMusicPlayer does.** Anything on YouTube Music is searchable and plays straight away, through a NewPipe-style extractor that runs in the server container. **Keep** saves it, tagged, into your Jellyfin library. Torrents stay for lossless albums; books and podcasts come through requests.
5. **Build in slices you can use, in Spotify's order.** First it plays, with no gaps between files and chapters and autoplay onward. Then your library, then play or get anything, then Browse recommending things you don't own. Each milestone ends with you using it for a week, not with CI going green.
6. **The frontend is Sonora from day one, on both platforms together.** Sonora already covers the Spotify affordances: "More like X" shelf headers, feature cards with preview, spoken-word transport, and offline and quality status. It also exports tokens for both web and Kotlin. **Everything in the app starts as a Sonora component**: the web app uses Sonora's own components, and Android's are generated against the same prop definitions. Every screen gets one API call returning exactly what its components take.
7. **Multiple users, one listening session per device.** Each person has their own accounts, taste and queues. Each of their devices keeps its own session, and sessions don't mix unless you choose to.
:::
