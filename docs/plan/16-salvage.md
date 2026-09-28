---
id: salvage
nav: Keep or rewrite
part: Delivery
---
## Keep or rewrite

Each carried-over part is taken from the git tag `legacy` at the start of the plan item that uses it, not up front.

::: grid g2
::: card
#### <span class="pill t-lib">Carry over</span>

- Session and crypto: `db/crypto.ts`, `sessionsRepo`, `auth/*` (fix the cookie flags)
- `packages/jellyfin-client`: the most complete module; re-record its fixtures
- Request building blocks: `requestStatus`, `torrentId`, `downloadPoller`, `prowlarr`, `qbittorrent`/`transmission` (check the cookie name live)
- Recommendation core: `profile`, `score`, `shelves`, `ownership` (pure functions), `listenbrainz.ts`
- Self-hosted Inter; Archivo and Sonora's Material Symbols Rounded icon font are self-hosted as Sonora uses them, and the legacy SVG icon set and Roboto Flex stay behind (tokens come fresh from Sonora; the old repo's copies have drifted)
- Android: `ApiClient` cookie jar, DownloadManager wiring, Auto `BrowseTree`, the service skeleton
- Release and F-Droid publishing (`release.yml`, `fdroid-repo.yml`, `docs/FDROID_REPO.md`), the app id and both signing keys
- The e2e idea: the real server with recorded upstreams
:::

::: card
#### <span class="pill t-err">Rewrite</span>

- Playback on both platforms: the file-id/HLS chain, the player core, queues and loaders
- Android `PlayerViewModel` (multi-file, progress, speed, sleep)
- The three hand-copied contracts → generated
- `abs-client` schemas (re-derived from recordings; request body; token type)
- Setup and the authorisation model
- AudiobookBay scraper; the duplicated book and music request services. The slskd single-file flow is dropped in favour of YouTube Music.
- Live fan-out in recommendations → index plus candidate pool
- Fake-upstream routing that ships in the image
:::
:::
