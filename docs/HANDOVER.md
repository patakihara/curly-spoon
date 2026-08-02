# Handover

You are picking up **Auralis** from a session that ran in an ephemeral cloud container with
no access to the user's actual media server. You are (presumably) running **on that media
server**, which means you can do things the previous session could not: talk to the real
Audiobookshelf and Jellyfin, inspect the real library layout, and run Docker.

Read this file first, then `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and
`docs/INTEGRATIONS.md`. Those four are the spec; this file is the context around them.

---

## 1. What the user asked for, in their words

> "a web app + android app, in a material U style, that serves as three things"
>
> - **prio 1** — Audiobookshelf client + book request integration, pulling primarily from
>   AudiobookBay. "i have a mediaserver setup at home that id like to plug-in into it."
> - **prio 2** — podcast client.
> - **prio 3** — music client, as a Jellyfin client, ideally with a music request
>   integration (something like deemix). "my mediaserver also already has a music component."
>
> References they love: **YouTube Music**'s UI, **Symfonium**, **Spotify**'s search
> (specifically **lyrics search**), and the **Claude app**'s design language.
>
> "I want the experience to be fully-featured, no compromises. The UI must be beautiful and
> performant. The UX must be simple and friendly. Make use of test driven development,
> including end-to-end testing and UI testing with playwright (TS preferred)."
>
> "Plan out all of your steps, and deliver things task by task."

Later clarifications:

- **"work autonomously"** — do not stop to ask permission for ordinary decisions. Make the
  call, state it, keep moving. Only escalate things that genuinely change the product.
- **"outsource the implementation to sonnet agents"** — the orchestrating instance writes
  detailed specs and reviews/integrates; Sonnet subagents write the code. Keep doing this.
- **"web app" includes desktop** — the browser app must be a real desktop experience and
  the whole thing must run **in Docker**.

Treat these as standing instructions, not one-off remarks.

---

## 2. Where the project is

| Phase | What                                                                       | Status                |
| ----- | -------------------------------------------------------------------------- | --------------------- |
| 1     | Monorepo, tooling, CI, test harness                                        | done                  |
| 2     | `@auralis/ui` — Material 3 Expressive design system                        | see `docs/ROADMAP.md` |
| 3     | BFF + Audiobookshelf client                                                | see `docs/ROADMAP.md` |
| 4–10  | Web shell + Docker, audiobooks, requests, podcasts, music, Android, polish | planned               |

`docs/ROADMAP.md` is the source of truth for status and is kept current. Everything is on
the branch **`claude/media-client-app-k7v9by`**; do not push elsewhere without asking.

---

## 3. Decisions already made, and why

Do not silently re-litigate these. If you disagree, say so and make the case.

**A thin Fastify BFF sits between the clients and the media server.** Three independent
reasons: Audiobookshelf and Jellyfin do not emit CORS headers for arbitrary origins, so a
pure browser client is blocked; AudiobookBay has no API and can only be scraped
server-side; and indexer/torrent credentials must never ship inside a browser bundle or an
APK. A side benefit is that web and Android consume one identical typed API, so parity is
structural rather than aspirational.

**No animation library.** Material 3 Expressive is spring-based. Rather than ship
Framer Motion, the token layer compiles spring physics into CSS `linear()` easing strings
at build time, so animation runs on the compositor with no per-frame JS. This is the main
reason the app can be both "beautiful" and "performant". Gesture-driven surfaces (sheet
drag, Now Playing expansion) use raw pointer events plus transforms.

**Colour is derived from artwork at runtime** with `@material/material-color-utilities` —
the Symfonium behaviour the user called out. Every generated `on*`/container pair is
asserted to clear WCAG AA in unit tests, in both light and dark.

**PWA, not Electron.** The desktop story is an installable PWA served by the same
container: own window, offline shell, OS media keys, nothing extra to bundle or update. If
the user later wants a true native desktop binary, Tauri is the cheap addition.

**slskd, not deemix, as the reference music-request provider.** deemix is unmaintained.
The provider interface is pluggable, so deemix or anything else is a new file, not a
refactor. Flag this to the user if they push back — they asked for "something like deemix",
and slskd is the working equivalent.

**Native Android (Compose + Media3), not a webview wrapper.** "No compromises" rules out a
Capacitor shell: background playback, offline downloads, media-session integration and
Android Auto all want the real thing.

**One container, one port.** The BFF serves the built web assets on its own origin, so
there is no separate nginx and no CORS configuration for the user to get wrong.

---

## 4. What is different now that you are on the media server

This is the main reason the session moved, so lead with it.

### Verify the clients against reality

The Audiobookshelf client was written against **fixtures**, from documented endpoint
shapes. It has never spoken to a real server. Before building more on top of it:

1. Ask the user for their Audiobookshelf URL and a credential, or find the container.
2. Record the **actual** responses for the endpoints in `docs/INTEGRATIONS.md` and diff
   them against `apps/server/test/fakes/fixtures/*.json`.
3. Where reality differs, fix the fixtures **and** the zod schemas, and add a regression
   test. Audiobookshelf payloads vary by version and by `minified`/`expanded` mode — this
   is the single most likely source of "works in tests, breaks on the real server".
4. Note the Audiobookshelf **version** in the fixture files, since the API drifts.

Do the same for Jellyfin before Phase 8.

### Things you can now do that the previous session could not

- Run `docker compose up` and actually validate the image.
- Point the app at real libraries and see real cover art, real chapter data, real
  long-file seeking. Range-request behaviour in particular deserves a real-world check
  against a multi-hour M4B, not just the synthetic byte-range test.
- Measure performance on real library sizes. A user with 2,000 audiobooks will find
  different problems than a fixture with twelve.
- Possibly build the Android app, if the Android SDK is available (it was not before).

### Things to find out from the user or the box

- Audiobookshelf: URL, version, library names/types (book vs podcast), how many items.
- Jellyfin: URL, version, whether music is a separate library.
- Torrent client: which one, its WebUI URL, and **the exact save path Audiobookshelf
  watches** — the request pipeline is worthless if downloads land somewhere unmonitored.
- Whether they use Prowlarr already (if so, prefer it over the raw AudiobookBay scraper as
  the default, and keep the scraper as a fallback).
- Reverse proxy / TLS setup and the hostname they will actually use.
- Whether anyone else uses the server, which decides whether request approval matters.

---

## 5. How to work in this repo

```bash
pnpm install
pnpm dev            # BFF on :8787, web on :5173
pnpm dev:fake       # same, against built-in fake upstreams (no media server needed)

pnpm test           # Vitest — pure logic, clients, BFF routes
pnpm test:e2e       # Playwright — UI + end-to-end
pnpm typecheck && pnpm lint && pnpm format
```

**Test-driven, strictly.** The user asked for it explicitly and the codebase is built that
way. Write the failing test first. Tests read as behaviour descriptions, not as
`it('works')`. No network in unit tests — the clients take an injected `fetch`.

**House style**: total functions that degrade rather than throw; doc comments that explain
_why_, not _what_; zod parsing at every upstream boundary so shape drift surfaces as a
typed error instead of `undefined` deep in a component; no `any` used to dodge a type error.

**Delegation pattern that has been working**: the orchestrator writes a long, precise spec
naming the exact files, the exact API surface, the test assertions required, and an
explicit "do not touch" list, then spawns Sonnet agents in parallel on **disjoint
directories**. Pre-install dependencies and pre-create `package.json`/`tsconfig.json`
before spawning, and tell agents not to run `pnpm install` or commit — otherwise concurrent
agents corrupt the lockfile. Review their work, run the full suite, then commit.

**Commits**: descriptive body explaining the reasoning, `Co-Authored-By: Claude Opus 5` and
the session trailer. Deliver phase by phase; keep `docs/ROADMAP.md` statuses current.

---

## 6. Environment gotchas

- **Playwright browsers**: the previous sandbox pre-installed Chromium under
  `PLAYWRIGHT_BROWSERS_PATH` at a build number that did not match the installed Playwright,
  and downloads were blocked. `playwright.config.ts` auto-detects and points at whatever
  build is on disk, falling back to the default lookup when `playwright install` has run
  normally. On a normal machine this resolves to `undefined` and nothing special happens —
  leave the helper in place, it is harmless.
- **pnpm build scripts**: `esbuild` and `better-sqlite3` need approval to run install
  scripts; they are listed under `pnpm.onlyBuiltDependencies` in the root `package.json`.
- **`SESSION_SECRET`** keys the AES-256-GCM encryption of stored upstream credentials.
  Changing it invalidates every stored secret. Generate a real one for the media server.
- **Never commit real credentials, tokens or the user's server hostnames.** Fixtures must
  stay synthetic.

---

## 7. Suggested first moves

1. Read the roadmap; confirm which phases are actually complete by running the suite.
2. Collect the real service details from section 4 and get the app talking to the real
   Audiobookshelf.
3. Reconcile fixtures and schemas against real responses; add regression tests.
4. Continue the roadmap from the first unfinished phase — likely Phase 4 (web shell +
   Docker image), since that is what turns the work so far into something the user can
   actually open in a browser and judge.
5. Get it in front of the user early. They have strong visual references and opinions;
   a screenshot of the real shell against their real library is worth more than another
   phase of unreviewed work.

---

## 8. Open questions the previous session did not resolve

- Does the user want request **approval** (multi-user) or is it a single-user box where
  every request should just go straight to the torrent client?
- Which torrent client, and the exact save path Audiobookshelf watches.
- Do they want ebook support alongside audiobooks? Audiobookshelf handles both; the
  roadmap currently covers audio only.
- Android distribution: sideloaded debug APK, self-hosted F-Droid repo, or Play Store?
- Do they want Chromecast / DLNA output? Symfonium has it and they cited Symfonium, but
  they never asked for it directly.
