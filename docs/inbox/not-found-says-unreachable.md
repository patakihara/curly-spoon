# A 404 is reported as "couldn't reach Auralis"

> btw, 404 is reporting "couldn't reach auralis", which is incorrect

The words "couldn't reach Auralis" appear nowhere in the repo's source (web, server, Android,
Sonora or the canvas, searched by the orchestrator). A missing page on staging answers a plain 404.
The Android sign-in maps any failed request to `unreachable` (`android/app/src/main/java/net/develivarr/auralis/auth/SignIn.kt`).

(Sofia, chat with the orchestrator session, 2026-09-30)
