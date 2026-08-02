# Handover

You are picking up **Auralis** from a session that ran in an ephemeral cloud container with
no access to the user's actual media server. Development moved to a **local machine** at
commit `108ae0e`, because the container's limits had become the binding constraint: no
Docker, no Android SDK (`dl.google.com` was blocked), and an ephemeral disk.

You can therefore do things the previous session could not: talk to the real Audiobookshelf
and Jellyfin, inspect the real library layout, run Docker, and — if the Android SDK is
installed — actually build the Android app.

**Two standing instructions carried over from the end of that session:**

1. **Do not spawn subagents** until the user says otherwise. They asked for this directly.
   The `PreToolUse` hook in `.claude/settings.json` enforces a usage ceiling, but the
   instruction is broader than the ceiling — it is a pause, not a budget.
2. **Keep plan usage under 80%** of the session and weekly windows. See §5.

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

| Phase | What                                                   | Status                         |
| ----- | ------------------------------------------------------ | ------------------------------ |
| 1     | Monorepo, tooling, CI, test harness                    | done                           |
| 2     | `@auralis/ui` — Material 3 Expressive design system    | done                           |
| 3     | BFF + Audiobookshelf client                            | done                           |
| 4     | Web shell + Docker image                               | **partially done — see below** |
| 5–10  | Audiobooks, requests, podcasts, music, Android, polish | not started                    |

Green at handover: `pnpm typecheck`, `pnpm lint`, **307 unit tests**, **156 browser tests**.

`docs/ROADMAP.md` is the source of truth for status. Everything is on the branch
**`claude/media-client-app-k7v9by`**; do not push elsewhere without asking.

### Phase 4 — precisely what is left

**Done:** React shell (TanStack Router + Query), typed BFF client that parses the server's
error envelope into typed errors, adaptive navigation driven by a single `useBreakpoint`
hook rather than scattered media queries, onboarding and login, error boundaries, keyboard
shortcuts, PWA wiring, Fastify static serving with SPA fallback, and an `app` Playwright
project configured to boot the real BFF serving the real built web app against the fakes.

**Not done — the phase is open until all three are closed:**

1. **`e2e/app` has helpers but no specs**, so that Playwright project boots a web server and
   runs zero tests. Write the flows: onboarding end to end, a bad server URL producing a
   _specific_ error, login failure and success, navigation adapting at 480px and 1400px, a
   hidden destination for an unconfigured service, 401 redirecting to login, and the error
   boundary catching a failed route.
2. **The container has never been built.** `Dockerfile`, `.dockerignore` and `compose.yaml`
   exist but Docker was unavailable in the cloud container, so none of it is verified. Build
   it, boot it against `AURALIS_FAKE_UPSTREAMS=1`, confirm the app loads and authenticates,
   and add a CI job that does the same. This is the phase's stated exit criterion — it is
   also the first point at which the user can open the app and judge it, so prioritise it.
3. `apps/server`'s `start` runs `tsx` against TypeScript sources, which is why `tsx` is a
   production dependency. Fine as-is; if the image is slimmed later, compile instead.

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

**Delegation — currently paused.** The user asked that no further subagents run until they
say otherwise. When it resumes, `CLAUDE.md` has the full rules; the two that matter most,
both learned the hard way:

- **Agent cost is quadratic in turns per agent**, because every turn re-reads the whole
  accumulated context. Measured here: ~300 turns each, context growing 63k → 275k tokens,
  48–61M cache reads apiece, and the user's own usage report attributed **81% of
  consumption to requests above 150k context**. So scope agents _small_ — under ~150 turns —
  and write specs precise enough that they never explore. Bigger agent tasks are **not**
  cheaper.
- **Pre-install dependencies and pre-create manifests before spawning**, and forbid agents
  from running `pnpm install` or committing. Concurrent agents corrupt the lockfile.

**Plan usage.** `scripts/usage-guard.py` measures this project's share of the session and
weekly windows. `.claude/settings.json` registers a `SessionStart` hook that reports both
windows into context, and a `PreToolUse` hook that denies subagent spawns past 80%.

**Work from the repo root.** Claude Code resolves `CLAUDE.md` and `.claude/settings.json` by
walking _up_ from the session's working directory, and files transcripts under a slug
derived from it. A session started elsewhere loads no hooks and is invisible to the guard,
silently in both cases. The guard diagnoses this itself when it finds no transcripts.

The session window's calibration is inherited from the cloud session; **the weekly window is
not calibrated and fails open**. Both need re-running against real local usage — the guard
now refuses to calibrate against an empty window rather than storing a zero that reads back
as "not calibrated" forever, so run this only once sessions have accumulated here:

```bash
./scripts/usage-guard.py --calibrate-session <pct> --calibrate-weekly <pct>
```

Model weighting was calibrated against the usage UI's breakdown: the plan meters Opus at
about **2.7× what the published price ratio implies**, which the stored multipliers correct
for.

**Verify agent output — do not trust it.** Two real defects reached the branch and passed a
glance-level review: bottom-sheet detents snapped to the _nearest_ detent, silently fighting
the user's drag direction, and `registerStaticServing` declared a return type it did not
return. An agent that stopped has not necessarily finished; run the full suite and read the
diff. And never commit a red tree — CI builds this branch.

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
