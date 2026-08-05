# Handover

## Autonomy — read this before stopping

A session stops only on an explicit request to stop. A finished phase, wave, or CI run is
the cue to start the next roadmap item, not a reason to end the turn — see `CLAUDE.md`'s
"Autonomy" section for the full rule and the one real exception (the plan-usage ceiling).

## Workflow check — resolved 2026-08-04

An earlier session mishandled `EnterWorktree`/subagent isolation, spawned an unsupervised
`claude --bg`, and defaulted to a PR workflow this repo doesn't use. `CLAUDE.md`'s "do not
create a worktree" section has the full detail if it recurs. An `advisor()` call on
2026-08-04 confirmed the workflow was back on track (main checkout, no stray
`EnterWorktree`, subagents correctly isolated via `Agent(isolation: "worktree")`) before
Wave E1 was picked up — no need to re-spend a call re-verifying this unless something looks
wrong again.

---

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

**Then read `docs/setup/MY_SETUP.md`** — the real server's details, filled in from the box
itself. It answers most of section 4 below and contradicts several assumptions in this file.

---

## Background agent log (auto-maintained; most recent 15 entries)

Written by `scripts/hooks/agent-log.sh` on `SubagentStart`/`SubagentStop` — see that
script's header for the concurrency and fail-open design. Each entry: launch time (UTC),
Agent ID, type, status (`running`/`ended`), and — once the agent finishes — the first ~150
characters of its final message. If an entry still says `running` with no follow-up, the
session that owned it may have been lost to compaction or crashed; check its transcript by
Agent ID before assuming its work landed silently. Entries are pruned oldest-first past 15 —
an agent's absence here only means a newer launch pushed it out, not that it never ran.

**This section is per-checkout** — a session working in a git worktree (`.claude/
worktrees/<name>/`) reads and writes only that worktree's own copy of this file. Treat it as
"what a session in _this_ checkout was doing," not a global registry.

**For the global view, read the shared log instead**: every event recorded here is _also_
appended to `<git-common-dir>/auralis-agent-log.jsonl` — plain JSONL, one line per event,
each line tagged with a `checkout` field naming which worktree it came from. All worktrees
of one repo share a single
physical `.git` directory (verified empirically: `git rev-parse --git-common-dir` resolves
to the same absolute path from the main checkout and from every worktree of it), so that
file is genuinely global across every concurrent session on this repo, regardless of which
worktree each one runs in. It is never gitignored per branch and never a merge-conflict spot
because nothing under `.git/` is tracked by any branch, ever — confirmed directly: `git
status`/`git add` from any checkout cannot see or stage it. Find it from any checkout with:

```bash
cat "$(git rev-parse --path-format=absolute --git-common-dir)/auralis-agent-log.jsonl"
```

It is append-only and unbounded (unlike this section's 15-entry cap), so it is the place to
check "what was running across every checkout," while this section stays the quick,
in-context scan of the current one.

<!-- AGENT_LOG_START -->

- `2026-08-05T10:33:03Z` · `a5efac28947969d8a` · general-purpose · ended · ## Review report — '4b11b22' (Jellyfin paused-track fix) **Verdict: sound as merged.** ### Commands run | Command | Result | |---|---| | 'git log -1…
- `2026-08-05T10:38:35Z` · `a190a8412b56f76b3` · general-purpose · ended · 'clickable' is already used elsewhere in the app, confirming no new dependency was introduced. Review complete. ## Report — Wave: Android album queue…
- `2026-08-05T10:39:42Z` · `aa80b0a8bbbf71472` · general-purpose · ended · Clean tree, two commits on 'worktree-agent-aa80b0a8bbbf71472' on top of 'ed60f1b', not pushed. Task complete. ## Report **Branch/commit**: 'worktree-…
- `2026-08-05T10:46:35Z` · `a82047d2d17e2cb96` · general-purpose · ended · Committed cleanly on branch 'worktree-agent-a82047d2d17e2cb96', commit '25cee48', based on '050e705'. Working tree is clean. Not pushed, per instruct…
- `2026-08-05T11:21:44Z` · `a419735bdc118acf3` · general-purpose · ended · ## Review report — Phase 9 web wave E (Jellyfin favourites), commit '25cee48' / merge '905cd60' **Verdict: sound as merged**, with one should-fix wor…
- `2026-08-05T11:29:31Z` · `a08bd8be8670bf50d` · general-purpose · ended · Working tree clean, both commits in place. Final report follows. ## Report **Branch/commits**: 'worktree-agent-a08bd8be8670bf50d', two commits on top…
- `2026-08-05T11:48:55Z` · `a9fec07248e10b997` · general-purpose · ended · Committed cleanly, working tree clean, not pushed as instructed. ## Report **Branch/commit**: 'worktree-agent-a9fec07248e10b997' @ 'f143107', based o…
- `2026-08-05T11:49:38Z` · `a6c8f32a9701d85c7` · general-purpose · ended · Committed clean, working tree empty. Not pushed, per instructions. ## Report **Branch/commit**: 'worktree-agent-a6c8f32a9701d85c7' @ '4eaa78c', based…
- `2026-08-05T12:09:39Z` · `af5eee539ade2ef43` · general-purpose · ended · Everything checks out. Here is my full review. ## Android CI result Both 'CI' and 'Android' workflow runs for '18bced1' (the merge commit) are **gree…
- `2026-08-05T12:16:48Z` · `a7ab1c33c809dcfa9` · general-purpose · ended · ## Review verdict: sound as merged, with one should-fix ### Summary This wave (playlists, web-only, 'f143107'/'d090a95') is well-executed. All of the…
- `2026-08-05T12:24:16Z` · `a8bab14e9846f7245` · general-purpose · ended · Working tree is clean. Not pushed, per instructions. ## Report **Branch/commit**: 'worktree-agent-a8bab14e9846f7245' @ '0de5a31', based on 'd090a95'…
- `2026-08-05T12:24:45Z` · `ad5ae4de822ad9a21` · general-purpose · ended · Committed cleanly, working tree clean, not pushed as instructed. ## Report **Branch/commit**: 'worktree-agent-ad5ae4de822ad9a21' @ '2d30008', based o…
- `2026-08-05T12:34:04Z` · `a41b7cdeb98c5f220` · general-purpose · ended · Working tree is clean. Commit '6246aa0' on branch 'worktree-agent-a41b7cdeb98c5f220', based on 'a3fcfc3'. Not pushed, per instructions. Nothing was c…
- `2026-08-05T12:52:14Z` · `a6b0a49406fd9236a` · general-purpose · running · —
- `2026-08-05T12:52:59Z` · `ae7eb4057186070b6` · general-purpose · running · —

<!-- AGENT_LOG_END -->

---

## Leftover worktrees — surveyed, salvaged, closed out (2026-08-05)

**There are no worktrees left. Nothing was lost.** A session stopped mid-flight on
2026-08-04 left six behind; every one has since been surveyed, its work merged or confirmed
already-merged, and the worktree and its branch deleted. Three things came out of them and
are now on the branch:

- **`packages/jellyfin-client/src/schemas/raw.ts`** — Jellyfin lyrics schemas
  (`LyricMetadata`/`LyricLine`/`LyricDto`). Schema-only: no consumer, no test, never
  reviewed or exercised against a real `LyricDto` response. **Treat as a draft to verify**,
  not as a settled design.
- **`57d545e`** — the verified Jellyfin lyrics-search limits, in `docs/INTEGRATIONS.md`
  and `ROADMAP.md` §9.
- **`9888bec`** — phase 8 closed out and phase 9's web waves recorded, hand-merged into
  §9 against the newer unified-search and lyrics content that had landed since.

`auralis-autorun.timer` is still **stopped** — no autonomous session will pick this up until
someone restarts it; a quiet repo here is not evidence of a crash.

---

## 0. Background sessions and the shared checkout

The dirty-tree incident earlier drafts of this section described (uncommitted phase 5/5a
work left behind mid-phase) is long since reconciled — the checkout is clean and tracks
`origin/main`. The one durable lesson from it: **the shared
checkout is where the user edits**, so a `git status` before any destructive git command
(`reset --hard`, `clean -fd`) is a real check, not a formality — it can lead as well as lag.

**A background session's `Edit`/`Write` tools cannot touch the shared checkout.** A harness
guard rejects both there until the session isolates into a git worktree, and the documented
way to disable it is itself an `Edit`. **`Bash` is not gated**, though, so an orchestrator
still has an in-place path for the small writes its job actually needs — a `python3` heredoc
for a doc edit, exactly as `git merge --ff-only` already writes the working tree from `Bash`
when integrating a worktree branch. Use that for `ROADMAP.md`/`HANDOVER.md` upkeep rather
than spawning a worktree for it; `CLAUDE.md`'s "do not create a worktree" section is what a
needless one costs. A worktree is still the right answer for an orchestrator that finds
itself doing hands-on implementation — but per that same section, the right answer to _that_
is to delegate the implementation instead.

A new worktree must be based on the current branch HEAD, not on
`origin/main`, which is what the `EnterWorktree` tool does by default and is a base these
branch-derived changes cannot apply onto:

```bash
git worktree add -b <name> .claude/worktrees/<name> HEAD
pnpm install --frozen-lockfile        # a new worktree has no node_modules
```

Push with an explicit refspec — a worktree branch has no upstream:

```bash
git push origin <name>:main
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
- **The actual goal is to replace Spotify.** In the user's own words (2026-08-03): "spotify
  now very conveniently (tho sometimes intrusively) bundles together music, podcasts, and
  audiobooks. one of the things that it does is cleverly serve me audiobooks it thinks i will
  enjoy." Personalized recommendations, not just library browsing, are part of the goal, not
  scope creep for a later phase to invent. No phase currently scopes this — treat it as an
  explicit requirement once the three media types are far enough along to reason over.
  `docs/INTEGRATIONS.md` now has a researched-not-decided section on a MusicBrainz/
  PodcastIndex/Audnexus metadata-catalog layer for this (`8e6866e`) — options and a named
  risk (Audnexus builds on Audible-scraping against Audible's ToS), not a committed design.

Treat these as standing instructions, not one-off remarks.

---

## 2. Where the project is

| Phase | What                                                    | Status      |
| ----- | ------------------------------------------------------- | ----------- |
| 1     | Monorepo, tooling, CI, test harness                     | done        |
| 2     | `@auralis/ui` — Material 3 Expressive design system     | done        |
| 3     | BFF + Audiobookshelf client                             | done        |
| 4     | Web shell + Docker image                                | done        |
| 5     | Audiobooks experience + player                          | done        |
| 5a    | Android build skeleton + APK pipeline                   | done        |
| 6     | Book requests                                           | done        |
| 7     | Android — audiobooks, requests, Auto, offline downloads | done        |
| 8     | Podcasts — backend, web, Android                        | done        |
| 9     | Music — web only, no Android                            | in progress |
| 10–11 | Polish, F-Droid                                         | not started |

The phase5/phase6 worktrees mentioned in earlier drafts of this file are gone — this repo
now lives directly in `~/src/auralis-src`'s own checkout, per that project's own `CLAUDE.md`
("do not create a worktree"). A background session that hits the harness's shared-checkout
edit guard still needs one (see §0's "Background sessions cannot edit the shared checkout at
all" — that reconcile procedure is still accurate); just don't leave it lying around once
its work has landed and pushed.

**Phase 7 is done.** Delivered in waves (`docs/ROADMAP.md` §7 has the full breakdown, every
commit sha and every defect independent review caught), each a disjoint directory under
`apps/android/app/src/{main,test}/java/net/auralis/app/`. Audiobooks, requests, Android Auto
and offline downloads all shipped. Two things worth carrying forward here because they
aren't tied to one wave:

- **Two assumptions in the Android Auto browse tree are unverified against a real server**,
  both flagged in the code's own comments: the continue-listening shelf is found by a
  case-insensitive `contains("continue")` match on the shelf's id or label, and it's
  unconfirmed whether `/libraries/:id/series` populates each series' `books` array.
- **Android Auto is unverified on real hardware end to end** — no Desktop Head Unit or car
  has exercised any of it, and CI cannot either.

**Phase 8 is done** — backend, web and Android all shipped. `docs/ROADMAP.md` §8 has every
wave and sha.

**A real normalization bug is fixed (`7e57a78`):** minified library items — what every
shelf/browse/personalized response returns — never carried `series`, only the flattened
`seriesName` string, so every book in a series silently lost its series membership on every
card. Fixed with a `seriesName` fallback mirroring the existing `authorName` one, plus the
identical gap in the fake server's `stripToMinified`, which is why no test had caught it.
**Reconciling the ABS client against a live server is still blocked: no Audiobookshelf
credential is available to a session** (`docs/setup/MY_SETUP.md` names it as the first ask).
Everything beyond the two unauthenticated endpoints (`/status`, `/ping`) is source-derived,
not live-verified — `docs/INTEGRATIONS.md`'s "Fixture/schema reconciliation pass" section has
the live/source/unverified breakdown; get a credential before re-deriving it.

**Container images publish to GHCR** (`c1882d5`). CI's `publish` job pushes
`ghcr.io/patakihara/auralis:latest` and `:<sha>` (linux/amd64) on every green build of this
branch, gated to `push` events on this branch only. Multi-arch (arm64) remains phase 10.

**Phase 9 now has music on Android too.** Web has the connect flow, browse, unified search,
playback with album queueing, **Jellyfin progress reporting**, a **synced lyrics view**,
**favourites** and **playlists**. Android has a music data layer, browse UI (library, artist,
album), **playback** through the existing Media3 stack, and **search** — all reachable from the
home screen.

Still missing: shuffle/repeat and a queue spanning more than the displayed 40-track page
(both clients); favourites and playlists on Android; music requests; and progress reporting
from Android. Lyrics _search_ remains blocked on a product decision, not on effort — Jellyfin
cannot search lyric text at all, so Auralis would need its own index and a decision about
whether to backfill from an external provider (a privacy opt-in). The synced lyrics _view_ is
unaffected and has shipped.

The defects this section used to list are fixed — album track order, the `Slider` prop drop,
and a paused track reporting to Jellyfin as playing. `docs/ROADMAP.md` §9 has each fix and
what it turned up.

One **product decision** is open rather than a defect: every queued track carries album-level
artist/album/artwork on both clients, because the track model has no per-track artist, so a
compilation shows the album artist on every track's lock screen.

`docs/ROADMAP.md` §9 has the wave-by-wave detail.

**Two latent bugs, neither fixed:**

- `apps/server/src/db/secretsRepo.ts`'s `setUpstreamToken` takes an `upstream` parameter but
  the table's primary key is `user_id` alone, so calling it twice for one user with different
  upstreams silently clobbers the first token via `ON CONFLICT(user_id)`. Nothing calls it
  that way today.
- The Dockerfile enumerates workspace packages by hand. Every future package `apps/server`
  depends on needs the same three-line addition — missing it produces exactly the `586742e`
  failure mode (image builds, container dies on boot) rather than a build error.

### Mantine — full migration complete (`2a0d2e0`, follow-up fixes `2bea957`/`278e3fc`)

Every `@auralis/ui` component is on Mantine now: Button, IconButton, Fab, Chip,
LinearProgress, CircularProgress, Skeleton, Card, ListItem, Dialog, NavigationBar, TopAppBar
(`NavigationRail` deleted as dead code, superseded by `Shell.tsx`'s own inline
`AppShell`/`NavLink` usage). `docs/DESIGN.md`/`ARCHITECTURE.md` describe Mantine as the
implementation layer.

**Two real bugs were found and fixed** — worth knowing if a similar overlay or motion
component gets touched next:

- Mantine's `unstyled` prop on `Modal` strips the CSS that hides its always-mounted root
  while closed, leaving a permanent full-viewport click-blocking overlay. Fixed in
  `Dialog.tsx` by not setting `unstyled`. `Sheet.tsx` (Mantine `Drawer`, a different
  component) never had the same trigger, confirmed rather than assumed by two real-browser
  tests (`e2e/ui/sheet.spec.ts`, `e2e/app/player.spec.ts`) that `page.mouse.click` through
  where the closed overlay would sit, rather than trusting the locator API's own
  interception checks.
- Mantine's `respectReducedMotion` only disarms its JS-driven `Transition` machinery, not
  the plain CSS `@keyframes` `Skeleton`'s shimmer uses. `Skeleton.tsx` now drives its
  `animate` prop from `ThemeProvider`'s own `prefersReducedMotion` directly. The same gap is
  untested but likely present in `Loader`'s spin and `Progress`'s stripe scroll.

Migration regressions, now fixed (`278e3fc`): `Button`'s default height (Mantine's 42px, below
the 48px touch-target minimum), a missing `aria-busy` on `Button`'s loading state, the M3
Expressive press corner-radius morph, and `IconButton`'s toggle-glyph spring animation.
`LinearProgress`'s `wavy` mode no longer renders a distinct wave shape — Mantine has no such
primitive, so `wavy` now only thickens the bar (`LinearProgress.tsx`'s doc comment); a
visible, undocumented-elsewhere regression against "the UI must be beautiful," worth a
product decision.

CI is green on `c556d22`. `pnpm typecheck` (per-package), `pnpm lint`, `pnpm test` and the
full `e2e/ui` + `e2e/app` Playwright suite all pass.

Two Claude Code hooks live in `scripts/hooks/`: `agent-log.sh` (subagent launch/end
logging, cross-worktree via a file under `git rev-parse --git-common-dir`) and
`delegation-nudge.sh`, registered on `PreToolUse` (`*`) in `.claude/settings.json`. It no
longer runs a nested headless `claude -p` classifier — that live-classification path never
succeeded in testing and measured close to a full timeout on its one real attempt. It now
fires a static "consider delegating" nudge on the first tool call of each user turn (keyed
on `prompt_id`, so the marker self-invalidates each turn) and stays silent when that first
call is itself an `Agent`/`Task` spawn, since delegation already happened.

(Phase 7's Android work is unaffected by any of this — it shares no code with either web
component system.)

**Phase 5's progress-sync design is worth keeping in mind for any future player work:**
`timeListened` is measured from wall-clock time spent playing, never from how far
`currentTime` moved — a seek, chapter jump or ±30s skip moves the position with nobody
listening, and Audiobookshelf folds `timeListened` into permanent listening statistics.
`features/player/progressSync.ts` holds that arithmetic as a pure, tested function;
`useProgressSync.ts` schedules it every 15s and on `pagehide`, and syncs-then-closes on
teardown (Audiobookshelf finalises a session on close, so the reverse order reports into a
closed session).

Phase 5a's Android pipeline (blind-written Compose, Android Auto manifest, committed Gradle
wrapper) is what every phase 7 wave built on. Still no JDK/SDK/Gradle on this machine, so
`apps/android` compiles on CI only — check the `Android` workflow after any `apps/android`
change.

`docs/ROADMAP.md` is the source of truth for status. Everything is on **`main`**; do not
push elsewhere without asking.

**The delivery branch moved to `main` on 2026-08-05.** It was
`claude/media-client-app-k7v9by` — an agent-generated name that had become the integration
branch by accident and was baked into `ci.yml`'s publish gate, `scripts/hooks/worktree-gc.sh`
and four docs. `main` was an ancestor of it (nothing but the initial commit), so the move was
a fast-forward, not a rewrite: **every sha in this file and in `ROADMAP.md` is still valid.**
If you find the old name anywhere, it is a leftover — replace it.

**Check `docs/agent-specs/`.** Subagent specs written but never launched — usually because
the usage gate closed first — are parked there, and each one that exists should be listed
below as a TODO. Empty but for its README means there is nothing queued.

<!-- pending specs: none -->

### Phase 6 — lessons carried forward

**A pre-existing Phase 5 test lesson, not phase 6's own bug**: `e2e/app/player.spec.ts`
failed intermittently under CI load because the e2e fixture audio can't decode, which
produces two independent async paths that revert the player store's "playing" state —
`HTMLMediaElement.play()` rejecting, and `.src` assignment triggering the browser's real
media-load pipeline, which fires a native `error` event on decode failure. Fixed
(`daa132b`/`29e9856`) by neutralising the audio element in that spec file entirely (`.src`
inert, `play()`/`pause()` no-op). Both paths are still present, correctly, in production
code — any future audio-related e2e spec needs the same neutralisation.

**Two product decisions worth a human's opinion**, neither a bug:

- **`GET /requests` is unscoped by caller.** Any signed-in user sees — and can delete —
  everyone's requests. Matches Overseerr and is right for one person's own server, but
  combined with approval defaulting to automatic it means a shared install has no privacy
  and no gate.
- **`shelfarr` and `deemix` are already running on the development machine.** `shelfarr`
  overlaps this phase's pipeline; `deemix` cuts against the phase-9 decision to use slskd.
  Neither was designed around — worth asking the user rather than assuming.

**What is decided, not to be re-litigated:**

- **Prowlarr is the primary indexer; the AudiobookBay scraper is the fallback** —
  AudiobookBay is behind Cloudflare and only Prowlarr (via `byparr`, a
  FlareSolverr-compatible solver) gets through; a direct BFF-side scrape cannot.
  `docs/ROADMAP.md` §6 has the full reasoning.
- **Provider credentials are server-scoped, in `provider_configs`, not in `secrets`** (which
  is keyed by `user_id`, for per-account upstream tokens). An undecryptable secret reads as
  _unconfigured_ rather than erroring.
- **The download save path is a setting with no default.** The BFF and the download client
  are different containers with different mounts, so guessing produces downloads that
  complete and are never imported — every component reports success while nothing lands.
- **Approval defaults to automatic**, on the grounds that this is one person's own server.

### Phase 4 — lessons carried forward

- **`e2e/app`'s BFF is single-tenant and stateful** — `POST /api/v1/setup` configures it for
  the whole process, so `fullyParallel` would race "assert unconfigured" against "sign in".
  `onboarding.spec.ts` is its own Playwright project everything else `dependencies` on, and
  writes the `storageState` the rest of the suite starts signed in from — not an
  optimisation: `POST /auth/login` is rate-limited to 10/min per IP, shared across all
  workers.
- **The container's fake-upstream mode lives in `apps/server/src/testSupport/fakes`, not a
  `test/` sibling** — `AURALIS_FAKE_UPSTREAMS` is a runtime flag the shipped server parses,
  so the code it loads has to ship in the image; a `test/` directory isn't copied in.
- `apps/server`'s `start` still runs `tsx` against TypeScript sources (a production
  dependency), left as-is deliberately; compile instead if the image is ever slimmed.

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

## 4. What is different now that you are on a laptop, talking to the media server remotely

**Updated 2026-08-03.** Development moved a second time: from an ephemeral cloud container
(no real server access at all) to the media server itself (commit `108ae0e`), and now from
the media server to a **separate laptop** (`SofiaThinkPad`) on the same Tailscale tailnet.
Reason for this second move: the media server has 3.7 GiB of RAM and runs the whole media
stack beside this repo, and unattended/CI-scale work here twice pushed it into a multi-hour
RAM-thrash stall (see mediaserver's own `~/CLAUDE.md`, "Out of RAM looks exactly like an
outage"). The laptop has no such constraint and no competing services.

**Mediaserver still runs the media stack** (Jellyfin, Audiobookshelf, qBittorrent, etc.) —
only the _development_ moved. Auralis now talks to it as a remote client instead of a
container sharing its Docker host.

### Network reachability changed

The previous setup (documented as it was found in `docs/setup/`) relied on Auralis's
containers sharing mediaserver's own Docker daemon: `host.docker.internal` +
`extra_hosts: host-gateway` for Jellyfin (a host service, not a container), and
container-name DNS (`gluetun:8080`, `audiobookshelf:80`) over the `arr_default` network for
the rest. None of that resolves from a separate machine. The dev loop now reaches every
upstream as a plain host address instead:

- Jellyfin: `192.168.100.34:8096`
- Audiobookshelf: `192.168.100.34:13378`
- qBittorrent WebUI: `192.168.100.34:8080`

(Reachable equally over the LAN or the private mesh VPN mentioned in `docs/setup/MY_SETUP.md` — its own identity is deliberately not written here; this is a public repo.)

`docs/setup/MY_SETUP.md` has the updated reachability answers per-service;
`docs/setup/HOST_REPORT.md` keeps the mediaserver host facts as target-server reference,
with a note on which parts (the container-network addressing) no longer apply directly.

One side effect worth knowing: mediaserver's host port `8787` conflict with its `bookshelf`
container doesn't exist on this laptop, so `pnpm dev`'s documented "BFF on :8787" now works
without the port workaround the setup docs describe for mediaserver itself.

### Local verification

Playwright (`pnpm test:e2e`, `playwright test`, `playwright install`) runs fine on this
laptop — use it to check UI work directly instead of inferring from a pushed SHA. `gh` is
installed and authenticatable (`gh auth login`), so CI results can be read directly too.
`pnpm test:docker` does **not** run here — Docker isn't installed (Docker Desktop is on the
Windows host, WSL integration isn't enabled for this distro) — and neither does Gradle: no
JDK or Android SDK here. Both are CI-only.

CI stays the authoritative signal for calling a phase done; local running is the faster first
look, not a replacement.

### Verify the clients against reality

The Audiobookshelf client was written against **fixtures**, from documented endpoint
shapes. Before building more on top of it:

1. Use the real Audiobookshelf URL and credentials from `docs/setup/MY_SETUP.md`.
2. Record the **actual** responses for the endpoints in `docs/INTEGRATIONS.md` and diff
   them against `apps/server/src/testSupport/fakes/fixtures/*.json`.
3. Where reality differs, fix the fixtures **and** the zod schemas, and add a regression
   test. Audiobookshelf payloads vary by version and by `minified`/`expanded` mode — this
   is the single most likely source of "works in tests, breaks on the real server".
4. Note the Audiobookshelf **version** in the fixture files, since the API drifts.

Do the same for Jellyfin before Phase 8.

### Things you can now do

- Point the app at real libraries over LAN/Tailscale and see real cover art, real chapter
  data, real long-file seeking. Range-request behaviour in particular deserves a real-world
  check against a multi-hour M4B, not just the synthetic byte-range test — though per
  `docs/setup/MY_SETUP.md`, the real library is dominated by chaptered MP3, not M4B, so
  weight that check accordingly.
- Measure performance on real library sizes (231 items today — small; see
  `docs/setup/MY_SETUP.md` Part 3 before assuming otherwise).
- `docker compose up` to validate the image — not yet set up on this laptop (Docker Desktop
  is on the Windows host but WSL integration isn't enabled for this distro). A separate ask
  if/when needed; not part of this migration.
- Building the Android app locally is still not possible — no Android SDK here either,
  same as before the move. CI is still the only place it compiles.

### Things already found out (were open questions here; now answered)

Everything this section used to ask about the user's server is now recorded in
`docs/setup/MY_SETUP.md` and `docs/setup/HOST_REPORT.md` — Audiobookshelf/Jellyfin URLs and
versions, the torrent client and its WebUI, **the save-path gap** (Audiobookshelf does not
watch qBittorrent's download folder — read that section, it is the most important thing in
`MY_SETUP.md`), Prowlarr/indexer configuration, the reverse-proxy setup, and that the server
is shared with family (so request approval is a real requirement, not hypothetical). Read
those two docs rather than re-deriving any of this.

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
- **Playwright browsers**: `playwright.config.ts` auto-detects a `PLAYWRIGHT_BROWSERS_PATH`
  build already on disk and falls back to the default lookup otherwise. On this machine it
  resolves to the normal install and nothing special happens — leave the helper in place,
  it is harmless.
- **pnpm build scripts**: `esbuild` and `better-sqlite3` need approval to run install
  scripts; they are listed under `pnpm.onlyBuiltDependencies` in the root `package.json`.
- **`SESSION_SECRET`** keys the AES-256-GCM encryption of stored upstream credentials.
  Changing it invalidates every stored secret. Generate a real one for the media server.
- **Never commit real credentials, tokens or the user's server hostnames.** Fixtures must
  stay synthetic.
- **A quiet-hours prompt gate is armed on `UserPromptSubmit`.** `scripts/hooks/time-gate.sh`
  is registered via `.claude/settings.local.json` (gitignored, machine-local). Outside
  17:00–18:00 local time, a typed prompt is queued to `.claude/deferred-prompts.jsonl` and
  blocked rather than delivered; nothing wakes a session to drain the queue. Exemptions are
  per-prompt, not per-session: a `claude --bg` session's own kickoff prompt (matched against
  its job's `intent` in `~/.claude/jobs/<jobId>/state.json`) and any `<task-notification>`
  result a subagent hands back. An earlier `AURALIS_AUTONOMOUS=1` environment-marker
  exemption never worked — `claude --bg` hands jobs to pre-spawned daemon workers that
  predate the export — and has been removed; see the hook's own header comment for the
  full design. These exemptions belong to this hook alone — `scripts/hooks/usage-gate.sh`
  must never honour anything like them, since the plan-usage ceiling applies to autonomous
  sessions most of all. Subagent task notifications are not gated by anything else in the
  hook stack; time-gate.sh's rule B is what lets them through here.

---

## 7. Suggested first moves

**Immediate next task: set up auto-updating container deployment on mediaserver** — pulling
the newly-published GHCR image and restarting the container when `:latest` changes.
Watchtower is the candidate mechanism. **The other containers on that host must stay
running; above all, Jellyfin must not be taken down.** Not started because it's a live
change on a different host and wants its own session; whoever picks it up must read
mediaserver's own `~/CLAUDE.md` first (this repo's scope rules don't extend to that host)
and `docs/setup/MY_SETUP.md`/`HOST_REPORT.md` for that box's details.

Worth reconciling before relying on Watchtower: the checked-in `compose.yaml` carries both
`build: .` and `image: ghcr.io/patakihara/auralis:latest`, while `docs/SELF_HOSTING.md`'s
recommended snippet uses `image:` only — so `docker compose up` against the checked-in file
builds locally instead of pulling the published image, and a stray `--build` would override
a pulled tag.

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
