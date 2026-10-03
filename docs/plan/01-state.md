---
id: state
nav: Where it stands
part: Why and what
---
## Where it stands

The old project shipped a lot, but almost none of it ran against your real servers or a real phone. Each row was checked live or in code.

| What | Evidence | Effect |
|---|---|---|
| Audiobook playback on the real server | <span class="pill t-err">live-checked</span> Auralis asks Audiobookshelf to play with an empty body; your server answers with an HLS playlist (`/hls/…/output.m3u8`), which both clients treat as a file id, and the backend has no HLS proxy. | Audiobooks don't play; the fixtures held only direct-play URLs, so no test caught it. |
| Android multi-file books | <span class="pill t-err">code</span> `firstPlayableTrack` in `PlaybackItemResolver.kt` | Only file 1 of a multi-file book plays, including downloaded books. |
| Android progress | <span class="pill t-err">code</span> `syncSession`/`closeSession` have no callers | No resume across devices, and no speed control, sleep timer or bookmarks. |
| Web multi-file books | <span class="pill t-req">code, not run</span> the queue router's `onTrackEnded` overrides the next-file step | Likely stops at the first file boundary. |
| Autoplay | <span class="pill t-err">code</span> the podcast/audiobook queue loaders are never called; web music has no next/previous buttons | Nothing continues after an episode or a book, as in the ABS app today. |
| API contract | <span class="pill t-err">code</span> server zod, web `types.ts` (800 lines), Android `ApiModels.kt` (1,141 lines) | Three hand-kept copies of one set of shapes, never checked against each other. |
| Recommendations | <span class="pill t-req">code</span> ListenBrainz and Open Library are wired in uncached, fanned out on every request (500 albums + 5,000 tracks + 300 books each time); no podcast provider | Slow; nothing external reaches podcasts. |
| Security | <span class="pill t-err">code</span> `POST /setup` is unauthenticated and can be called again; no admin role; a client-supplied `downloadUrl` is fetched by the server | Anyone reaching the port can point Auralis at their own server and collect passwords. |
| Process | <span class="pill t-req">docs</span> ROADMAP (6.7k lines) and HANDOVER (2.5k lines) | Features were built with nothing calling them (seven cases), CI badges went green without running tests, parallel sessions collided on `main`, and a blind Android build never ran. |

::: small muted
The deployed container on mediaserver runs; what it does is broken.
:::
