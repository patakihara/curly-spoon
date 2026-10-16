---
id: api
nav: API surface
part: How it's built
---
## API surface

All under `/api`. Route names avoid "browse", so the UI name can change.

::: grid g3
::: card
#### Session

`GET/POST /setup` (first run or admin)\
`GET /auth/login` · `GET /auth/callback` · `POST /auth/token` · `POST /auth/logout` · `GET /auth/me`\
`GET /devices` · `PATCH/DELETE /devices/{id}` · `GET /sessions` (per device)\
`POST /sessions/{id}/continue-here` (later)\
`GET /health`
:::

::: card
#### Screens

`GET /feed` · `/feed/shelves/{id}`\
`GET /library/{medium}`\
`GET /items/{ref}` · `/people/{ref}` · `/series/{ref}`\
Each takes `?refresh` (pull to refresh)
:::

::: card
#### Search

`GET /search/suggest?q`\
`GET /search?q&kinds`
:::

::: card
#### Playback

`POST /play` → PlaybackPlan\
`POST /progress` · `POST /play/{id}/close`\
`GET/PUT /queues/{type}` · `POST /queues/{type}/items` (now, next, end, default)\
`POST /sessions/this/step` (next, back) · `PUT /sessions/this/active` (the meta-queue switch) · `PUT /sessions/this/style` (until M2.settings)\
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
`POST /keep {ref}` (a song, from YouTube Music)
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

`GET/PUT /settings` (theme, autoplay rules, queue style (YouTube Music or Spotify), artist-page catalogue, show everyone's library)\
`PUT/DELETE /settings/youtube-account` (connect or disconnect YouTube sync) · `GET /settings/youtube-account` (status, last sync, expired)\
`GET/PUT /shows/{ref}/youtube` (SponsorBlock categories, Shorts and livestreams)
:::
:::
