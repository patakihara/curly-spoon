---
id: api
nav: API surface
part: How it's built
---
## API surface

Grouped by what they serve. Every response shape lives in the one schema; route names avoid "browse", so the UI name can change freely.

::: grid g3
::: card
#### Session

`GET/POST /setup` (first run or admin)\
`POST /auth/login|logout` · `GET /auth/me`\
`GET/POST /devices` · `GET /sessions` (per device)\
`POST /sessions/{id}/continue-here` (later)\
`GET /health`
:::

::: card
#### Screens

`GET /feed` · `/feed/shelves/{id}`\
`GET /library/{medium}`\
`GET /items/{ref}` · `/people/{ref}` · `/series/{ref}`
:::

::: card
#### Search

`GET /search/suggest?q`\
`GET /search?q&kinds`\
`GET /search/lyrics?q`
:::

::: card
#### Playback

`POST /play` → PlaybackPlan\
`POST /progress` · `POST /play/{id}/close`\
`GET/PUT /queues/{type}`\
`GET/POST/DELETE /bookmarks`\
`GET /lyrics/{ref}`
:::

::: card
#### Media bytes

`GET|HEAD /media/{ref}/tracks/{n}` (range)\
`GET /media/{ref}/hls/*`\
`GET /media/{ref}/art?size` (resized, cached)\
`GET /media/{ref}/preview` (sample)
:::

::: card
#### Library actions

`POST/DELETE /favorites/{ref}`\
`/playlists` (CRUD)\
`POST/DELETE /subscriptions` (a podcast feed, or a YouTube channel)\
`GET /feeds/youtube/{channel}.xml` · `/feeds/youtube/{channel}/{video}` (audio only)\
`PUT /items/{ref}/played`
:::

::: card
#### Requests

`POST /requests {ref | query}`\
`GET /requests` · `/requests/{id}`\
`POST /requests/{id}/retry|cancel|choose`\
`POST /keep {ref}` (a song, from YouTube Music)\
`POST /requests {ref}` on an album: always a lossless torrent
:::

::: card
#### Admin

`/admin/providers` (CRUD + test)\
`/admin/settings` (paths, approval)\
`/admin/jobs` (status, run now)\
`GET /admin/users` (who can sign in, and their role)
:::

::: card
#### Settings

`GET/PUT /settings` (theme, accent, autoplay rules, artist-page catalogue toggle on by default, show everyone's library off by default)\
`PUT/DELETE /settings/youtube-account` (connect or disconnect watched-state and position sync for YouTube shows) · `GET /settings/youtube-account` (status, last sync, expired)\
`GET/PUT /shows/{ref}/youtube` (SponsorBlock categories, Shorts and livestreams)
:::
:::
