# Auralis

Audiobooks, podcasts and music from your own Audiobookshelf and Jellyfin, in one app, on the
web and on Android.

## Layout

| Path            | What it is                                                     |
| --------------- | -------------------------------------------------------------- |
| `server/`       | The one backend: TypeScript, Fastify, zod. Holds every secret. |
| `web/`          | The web app and PWA: React and Vite, served by the server.     |
| `android/`      | The Android app: Kotlin, Compose.                              |
| `schema/`       | The OpenAPI document and the generated clients.                |
| `design/sonora` | The Sonora design system.                                      |
| `design/app`    | The Auralis canvas: navigation and one page per screen.        |
| `docs/plan`     | The plan: what is being built and why.                         |

## Develop

```bash
pnpm install
pnpm dev                                                   # server on :8787, web on :5173
pnpm format && pnpm typecheck && pnpm lint && pnpm test    # before every commit
```

## Run it

```bash
docker run -d -p 8787:8787 -v auralis-data:/data ghcr.io/patakihara/auralis:latest
```

The Android app installs from a self-hosted F-Droid repository; see
[docs/FDROID_REPO.md](docs/FDROID_REPO.md).

## License

CC0 1.0. See [LICENSE](LICENSE).
