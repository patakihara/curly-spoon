# Handover

You are picking up **Auralis** from a session that ran in an ephemeral cloud container with
no access to the user's actual media server. Development moved to a **local machine** at
commit `108ae0e`, because the container's limits had become the binding constraint: no
Docker, no Android SDK (`dl.google.com` was blocked), and an ephemeral disk.

You can therefore do things the previous session could not: talk to the real Audiobookshelf
and Jellyfin, inspect the real library layout, run Docker, and — if the Android SDK is
installed — actually build the Android app.

**Two standing instructions carried over from the end of that session:**

1. ~~Do not spawn subagents.~~ **Lifted on 2026-08-02** — the user asked for delegation to
   Sonnet agents to resume, on token-consumption grounds. `CLAUDE.md`'s delegation rules
   apply again in full; the usage gate in `.claude/settings.json` is the only remaining
   gate.
2. **Work stops at 90%** of the session or weekly window, with a hand-off band from 85%.
   Both numbers are the user's, set on 2026-08-02. `scripts/hooks/usage-gate.sh` enforces
   them on `SessionStart`, `UserPromptSubmit` and every `PreToolUse` — so past 90% you
   cannot commit, push or write this file. Hand off in the band, not after it. See §5.

Read this file first, then `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and
`docs/INTEGRATIONS.md`. Those four are the spec; this file is the context around them.

---

## 0. Read this before you touch the working tree (2026-08-03)

**The clone at `~/src/auralis-src` has a dirty working tree whose contents are already
committed and pushed.** Do not try to finish that work — it is done. On 2026-08-03 a session
found ~1,300 lines of uncommitted phase 5 / 5a work left behind by a session that was cut
off mid-phase, fixed it (the tree did not typecheck and the e2e gate spec was broken),
and committed it as `4dcbeb5`, `3675b24`, `07ce0c3` on
`origin/claude/media-client-app-k7v9by`. The files still sitting dirty in that checkout are
the _pre-fix_ copies. Reconcile before doing anything else:

```bash
cd ~/src/auralis-src
git fetch origin
git status                     # confirm nothing here is newer than origin
git reset --hard origin/claude/media-client-app-k7v9by
git clean -fd                  # drops the now-redundant untracked copies
```

**Why it was left dirty rather than reconciled automatically:** discarding a user's working
tree is destructive and was not something to do unattended.

**That `git status` on line 41 is a real check, not a formality.** On 2026-08-03 the dirty
checkout turned out to hold a `CLAUDE.md` that was _newer_ than the branch's — two
working-agreement sections the user had written there while the code was being committed
from the worktree. A blind `reset --hard` would have destroyed them. They are on the branch
now (`88c8501`), so the reconcile above is safe as written; the lesson is that the shared
checkout is where the **user** edits, so it can lead as well as lag.

**A worktree already exists — reuse it.** `.claude/worktrees/phase5` is on branch
`claude/phase5`, tracks the tip of the work, and has `node_modules` installed. Just
`EnterWorktree` with that `path`. Only build a new one if you want a genuinely separate line
of work.

**Background sessions cannot edit the shared checkout at all.** A harness guard rejects
every `Edit`/`Write` there until the session isolates into a git worktree, and the
documented way to disable it is itself an edit — so there is no in-place path. Do not burn
turns rediscovering this. A new worktree must be based on the current branch HEAD, not on
`origin/main`, which is what the `EnterWorktree` tool does by default and is a base these
branch-derived changes cannot apply onto:

```bash
git worktree add -b <name> .claude/worktrees/<name> HEAD
pnpm install --frozen-lockfile        # a new worktree has no node_modules
```

Push with an explicit refspec — a worktree branch has no upstream:

```bash
git push origin <name>:claude/media-client-app-k7v9by
```

`.claude/worktrees/` is gitignored as of `07ce0c3`; git does not auto-ignore a nested
worktree, and untracked it reads as a mountain of phantom work.

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

| Phase | What                                                | Status      |
| ----- | --------------------------------------------------- | ----------- |
| 1     | Monorepo, tooling, CI, test harness                 | done        |
| 2     | `@auralis/ui` — Material 3 Expressive design system | done        |
| 3     | BFF + Audiobookshelf client                         | done        |
| 4     | Web shell + Docker image                            | done        |
| 5     | Audiobooks experience + player                      | done        |
| 5a    | Android build skeleton + APK pipeline               | done        |
| 6     | Book requests                                       | awaiting CI |
| 7–11  | Android app, podcasts, music, polish, F-Droid       | not started |

**Work in phase 6 happens in a git worktree**, `.claude/worktrees/phase6` on branch
`claude/phase6`, pushed to `claude/media-client-app-k7v9by`. There is also a leftover
`.claude/worktrees/phase5`. Both are ordinary worktrees of this repo; `git worktree list`
is the truth.

The shared checkout is **still** stale and its dirty files are **still** already pushed —
§0 has the reconcile. Two sessions have now spent time re-deriving that, so the check
`git log origin/claude/media-client-app-k7v9by` before believing a dirty tree is real work
is worth doing first, every time.

**Phase 5 is complete.** Home shelves, library browse with filter and sort, typed search
results, the player's logic layer (`features/player/playback.ts`, `state/playerStore.ts`,
`state/settingsStore.ts`) and now its surface: `NowPlaying` (a `Sheet` under the `expanded`
breakpoint, embedded directly above it), `MiniPlayer`, `ChapterList`, `BookmarkControls`,
`SleepTimerControl`, and variable speed / ±skip transport. `Shell.tsx` mounts the three
argument-free hooks — `useAudioElement`, `useMediaSession`, `useProgressSync` — once, for
every signed-in route.

Progress sync was the last gap and is the one piece worth knowing the reasoning behind:
**`timeListened` is measured from wall-clock time spent playing, never from how far
`currentTime` moved.** A seek, chapter jump or ±30s skip moves the position with nobody
listening, and Audiobookshelf folds `timeListened` into permanent listening statistics.
`features/player/progressSync.ts` holds that arithmetic as a pure, tested function;
`useProgressSync.ts` schedules it every 15s and on `pagehide`, and syncs-then-closes on
teardown (Audiobookshelf finalises a session on close, so the reverse order reports into a
closed session).

**Phase 5a closed on 2026-08-03.** Its first CI run went green and uploaded a 12 MB
`auralis-debug-apk`, which is the proof the phase existed to get: blind-written Compose
compiles, the Android Auto manifest merges, and the committed Gradle wrapper passes
`gradle/actions/wrapper-validation`. Phase 7 has a working pipeline to build on. Still no
JDK/SDK/Gradle on this machine, so CI is the only place Android compiles — check the
`Android` workflow after any `apps/android` change, since you cannot build it locally.

Green as of `07ce0c3`: `pnpm typecheck`, `pnpm lint`, **354 unit tests**, **181 Playwright
tests** (156 UI + 25 app end-to-end), and `pnpm test:docker` (the container smoke test).

`docs/ROADMAP.md` is the source of truth for status. Everything is on the branch
**`claude/media-client-app-k7v9by`**; do not push elsewhere without asking.

**Check `docs/agent-specs/`.** Subagent specs written but never launched — usually because
the usage gate closed first — are parked there, and each one that exists should be listed
below as a TODO. Empty but for its README means there is nothing queued.

<!-- pending specs: none -->

Both phase-6 specs were launched and deleted in the commits that landed their work — this
directory means _unlaunched_, and a spec left here after the fact reads as a TODO that is
already done.

### Phase 6 — what is built, and what has not been verified

**Everything is written and every local gate is green: 729 unit tests, five packages
typechecking, lint clean.** What follows is what that does _not_ cover, because the next
session should spend its first minutes on the right thing.

**No CI run has been read.** `gh` is not installed here, so the Actions run for the final
commit needs checking on github.com. Two commits on this branch are expected **red**:
`61889ba` and `5507467` caught subagent files mid-write, because `git add -A` does not know
an agent is still typing. Everything from `958fbb5` onward should be green. If a run before
that is red, that is why — do not go hunting.

**`e2e/app/requests.spec.ts` has never executed.** Not "written and expected to pass" —
never run, because Playwright is denied on this machine. It is the highest-risk artifact of
the phase. If the first CI run is red, look there before looking at the providers. It runs
in `serial` mode deliberately: unlike the rest of `e2e/app`, its tests build on each other's
BFF state, and `fullyParallel` would race them.

**The web wave's presentational layer is unreviewed.** `polling.ts`, `providerForm.ts`,
`requestAnyway.ts`, `format.ts` and `destinations.ts` are pure, unit-tested, and their tests
were read. The components around them were not reviewed, and CI is their first real check.
The server side _was_ reviewed, twice, and both rounds found real defects.

**Two product decisions worth a human's opinion**, neither a bug:

- **`GET /requests` is unscoped by caller.** Any signed-in user sees — and can delete —
  everyone's requests. That matches Overseerr and is right for one person's own server, but
  combined with approval defaulting to automatic it means a shared install has no privacy
  and no gate. Worth deciding before anyone else gets an account.
- **`shelfarr` and `deemix` are already running on the development machine.** `shelfarr`
  overlaps this phase's pipeline; `deemix` cuts against the phase-9 decision to use slskd.
  Neither was designed around — worth asking the user rather than assuming.

### Phase 6 — what is decided, so it is not re-litigated

- **Prowlarr is the primary indexer; the AudiobookBay scraper is the fallback.** The
  development machine already runs Prowlarr with AudioBook Bay, MyAnonamouse, EBookBay and
  Knaben configured, plus `byparr` (a FlareSolverr-compatible solver). AudiobookBay is
  behind Cloudflare, Prowlarr gets through by delegating to the solver, and a direct
  BFF-side scrape cannot. `docs/ROADMAP.md` §6 has the full reasoning.
- **Provider credentials are server-scoped, in `provider_configs`, not in `secrets`.** The
  `secrets` table is keyed by `user_id` because an Audiobookshelf token belongs to whoever
  signed in. A Prowlarr API key belongs to the installation. An undecryptable secret reads
  as _unconfigured_ rather than erroring, so rotating `SESSION_SECRET` sends you to the
  settings screen instead of 500ing every search.
- **The download save path is a setting with no default.** The BFF and the download client
  are different containers with different mounts — here, qBittorrent sees
  `/data/media/Downloads` as `/data/Downloads` while Audiobookshelf sees `/data/media` as
  `/data`. Guessing produces downloads that complete and are never imported, which is the
  worst failure mode available because every component reports success.
- **Approval defaults to automatic**, on the grounds that this is one person's own server.

### Phase 4 — what closing it changed

The three open items are closed. Two of them turned up things worth knowing:

1. **`e2e/app` now has 18 specs** across onboarding, navigation, session and errors. The
   structural thing to understand before adding more: the `app` project's BFF is
   **single-tenant and stateful** — `POST /api/v1/setup` configures it for the whole
   process — so `fullyParallel` would race "assert the unconfigured state" against "sign
   in". `onboarding.spec.ts` is therefore its own Playwright project that everything else
   `dependencies` on, and it also writes the `storageState` the rest of the suite starts
   signed in from. That second part is not an optimisation: `POST /auth/login` is rate
   limited to **10/min per IP** and all workers share one, so a suite that signed in per
   test 429s partway through. `playwright.config.ts` says all of this in place.
2. **The container is built, booted and covered by CI.** `scripts/docker-smoke.sh`
   (`pnpm test:docker`, and the `container` job in CI) builds the image, waits on its own
   HEALTHCHECK, asserts the SPA/asset/API-404 split, authenticates end to end against
   `AURALIS_FAKE_UPSTREAMS=1`, and times `docker stop`.

   Closing it moved the fake upstream from `apps/server/test/fakes` to
   **`apps/server/src/testSupport/fakes`**. `AURALIS_FAKE_UPSTREAMS` is a runtime flag the
   _shipped_ server parses alongside `PORT`, so the code it loads has to be in the image;
   a `test/` sibling is not copied in, and that mode died on an unresolvable import inside
   the container while working perfectly outside it.

3. `apps/server`'s `start` still runs `tsx` against TypeScript sources, which is why `tsx`
   is a production dependency. Left as-is deliberately; if the image is slimmed later,
   compile instead.

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
   them against `apps/server/src/testSupport/fakes/fixtures/*.json`.
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

**Delegation — active again since 2026-08-02.** `CLAUDE.md` has the full rules; the two
that matter most, both learned the hard way:

- **Agent cost is quadratic in turns per agent**, because every turn re-reads the whole
  accumulated context. Measured here: ~300 turns each, context growing 63k → 275k tokens,
  48–61M cache reads apiece, and the user's own usage report attributed **81% of
  consumption to requests above 150k context**. So scope agents _small_ — under ~150 turns —
  and write specs precise enough that they never explore. Bigger agent tasks are **not**
  cheaper.
- **Pre-install dependencies and pre-create manifests before spawning**, and forbid agents
  from running `pnpm install` or committing. Concurrent agents corrupt the lockfile.

**Plan usage.** `scripts/usage-guard.py` reads the account's real utilisation from the same
endpoint `/usage` uses, and fails open on every error path. `.claude/settings.json` runs
`scripts/hooks/usage-gate.sh` on `SessionStart`, `UserPromptSubmit` and every `PreToolUse`
— reporting under 85%, urging a hand-off between 85 and 90, denying **every tool call**
past 90.

Two things to know before trusting a reading:

- **Hand off inside the 85–90 band.** Past the ceiling the denial covers the tools you
  would need to hand off with — no commit, no push, no edit to this file — and whatever
  replaces you is a fresh session that reads only what is on disk. Unlaunched subagent
  specs go to `docs/agent-specs/` and get listed here as the next TODO.
- **A passing gate is not the same as affordable.** The number is whole-account, and one
  Sonnet subagent runs 48–61M cache reads. At 74% the gate says go and a subagent still
  does not fit in the remaining 6 points.

The **estimating** version of this guard is gone, and the history is worth one line so it
is not rebuilt: it projected usage from local transcript files, calibrated against a
percentage a human read out of `/usage`, and was wrong by a factor of about thirty-three —
transcripts are filed per working directory and it counted one of them. The lesson kept is
"do not estimate", not "estimate better".

**Work from the repo root.** Claude Code resolves `CLAUDE.md` and `.claude/settings.json` by
walking _up_ from the session's working directory. A session started elsewhere loads no
hooks, silently — and unloaded hooks do not run the guard at all.

**Verify agent output — do not trust it.** Two real defects reached the branch and passed a
glance-level review: bottom-sheet detents snapped to the _nearest_ detent, silently fighting
the user's drag direction, and `registerStaticServing` declared a return type it did not
return. An agent that stopped has not necessarily finished; run the full suite and read the
diff. And never commit a red tree — CI builds this branch.

**Commits**: descriptive body explaining the reasoning, `Co-Authored-By: Claude Opus 5` and
the session trailer. Deliver phase by phase; keep `docs/ROADMAP.md` statuses current.

---

## 6. Environment gotchas

- **`pnpm typecheck` from the repo root did not complete on this machine**, across three
  attempts on 2026-08-03; it runs five `tsc` processes in parallel. Typechecking one package
  at a time — `npx tsc -p apps/server/tsconfig.json --noEmit`, and the same for `apps/web`,
  `packages/core`, `packages/abs-client`, `packages/ui` — finished cleanly every time, and
  is what phase 6 was verified with. The cause was **not** established: the box is memory-
  tight, which makes a cap plausible, but each attempt also ended in a way that could have
  been the harness rather than the kernel, and no OOM evidence was collected. Use the
  per-package form; do not repeat the memory explanation as though it were measured.
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
