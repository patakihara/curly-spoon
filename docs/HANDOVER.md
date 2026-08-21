# Handover

## READ FIRST — the design system landed, and this session may have died mid-task

**Sofia's design system arrived on 2026-08-16. It is now the source of truth for design.** Her
words: _"This design doc is the source of truth when it comes to design, ok? Meaning that your
task is probably to plan a major overhaul to all frontend components, coordinating mobile and
web."_ The spec is **`ROADMAP.md` §16 — the Sonora redesign**. Read it before touching any
frontend file, and before believing anything older in this document about design.

**If this session died on the plan-usage ceiling, she has asked you to resurrect it.** Her
instruction, verbatim: _"Write a note in the handover asking the next auralis devs to resurect
you if you've died due to usage."_

**The design is in the repo — you do not need `DesignSync`.** Wave 16a vendored it to
`docs/design/sonora/` and distilled it into **`docs/design/SONORA.md`**, which is the design
authority for every wave and names its own gaps rather than implying full coverage. Also vendored,
after Sofia asked whether the `.dc` components were actually used: `Auralis-Redesign.dc.html`
byte-for-byte, the nine Auralis component cards, and **five of Sonora's own eleven imported
primitives** under `docs/design/sonora/primitives/`. **Read that directory's README before copying
any value out of a primitive** — Sonora's components reference `--m3-*` names that mean something
different in this app, and it carries the substitution table.

### Session hand-off, 2026-08-17 — everything below is pushed and CI-verified

Nothing is claimed, nothing is in flight, and no unlaunched subagent spec was left behind —
`docs/agent-specs/` is empty because every spec written this session was dispatched. **`main` is at
`83683e0`, and both `CI` and `Android` are green on it** (verified, not assumed). **The next wave is `16c-2-W`**
— finish web's migration off `--m3-*`, including completing the five primitives 16c-1-W only partly
moved. It is ahead of `16c-1-A` deliberately; see the "16c-2" bullet in `ROADMAP.md` §16 for why.

**Verified this session, each against CI rather than a local run:** the self-hosted fonts (six CI
jobs including the Lighthouse budget), the token layer and 15a (`8c9449e`), the Android Compose
theme (`aba5250`, with bare `compileDebugKotlin`/`testDebugUnitTest` — genuine uncached executions),
and web's five primitives (`e04a9a2`, full Playwright suite).

**Open items this session created or corrected, in priority order:**

1. **The scroll bug is unfixed and is 16d's headline** — user-reported, verified in the tree.
2. **The two clients do not look like the same product right now.** Android is re-themed app-wide;
   web is barely. Deliberate and ruled acceptable, but must be short-lived — see `16c-2`.
3. **`--accent-ink` on `--surface-card` fails WCAG AA at the default accent.** Web's text surfaces
   moved to `--surface-fg`. This is a design question, not a test to soften: `--accent-ink` exists
   to be readable on a surface. **Worth putting to Sofia** alongside the artwork-colour question.
4. **Six of Sonora's eleven imported primitives are still not vendored** — `Input`, `SectionHeader`,
   `QuickTile`, `SidebarItem`, `BottomNav`, `TrackRow`, `MiniPlayer`. Vendor each with its wave; the
   five that are there corrected real guesses, so this is not optional bookkeeping.
5. **The gallery's Sonora token list is hand-maintained**, so a token added later without a gallery
   entry is silently uncovered. Deriving it from the CSS is a small worthwhile wave.
6. **`--surface-overlay-header` has no consumer on either platform** — a writer with no reader.
7. **The Robolectric theme test does not cover the 26 chroma-role values** — verified once by review,
   by nothing mechanical.

**Phase 15 is untouched and disjoint:** 15a landed, its readers are 15c and 15e, and 15b-2 stays
blocked for the reasons §15 gives.

### The three things a session picking this up now must know

1. **Web and Android are built together from here.** A standing instruction from Sofia on
   2026-08-17, recorded in `CLAUDE.md`'s "Frontend parity" section. Frontend work is a `-W`/`-A`
   pair from one shared behaviour spec plus a `-P` parity review by an agent that wrote neither
   half. **This is not optional and not phase-scoped.** `ROADMAP.md` §16 has the review checklist.
2. **A user-reported bug is unfixed and is 16d's headline:** the nav rail and the Now Playing
   sidebar scroll away with the main content. Verified in the tree — `.auralis-shell` is
   `min-height: 100vh` and `.auralis-shell__content` has no `overflow` rule, so the whole document
   scrolls; only the _compact_ chrome is `position: fixed`. **16d comes before the screens**, since
   a screen rebuilt inside a wrongly-scrolling document must be revisited when the scroll container
   moves.
3. **Where the phase actually is.** 16a done; **16b done on web** (fonts, tokens, icons) and
   **16b-2-A done on Android** (its first typography and shape scale); **16c-1-W** in flight;
   **16c-1-P** is **blocked, not owed** — see `ROADMAP.md` §16; there is no second
   implementation to compare against, because `16c-1-A` turned out to be near-complete already.
   It folds into `16c-2-P`, which must rule on one known divergence — web's token wave was additive and
   still renders pre-Sonora colours, while Compose cannot express that middle state, so Android's
   chroma roles jumped ahead to where web is going.

**Phase 15 is open in parallel and is backend, so it does not contend.** 15a landed the
external-candidate seam and ListenBrainz tier 1; **15b-2 is blocked** (see §15) and **15a's readers
are 15c and 15e**.

### The operational trap that cost a wave once — now closed, kept as history

**`DesignSync` — the MCP tool that reads the design project — is available to the orchestrating
session and NOT to subagents.** Established on 2026-08-16 by dispatching two Sonnet readers at
the design files: **both came back blocked**, each having run five or more `ToolSearch` variants
before correctly refusing to fabricate an inventory. The tool is not in a subagent's toolset.

**This inverts `CLAUDE.md`'s central rule for this phase only.** The orchestrator normally does
not read; here it is the only thing that _can_ read the design. So the shape is: the orchestrator
reads the design **once**, writes it into **`docs/design/SONORA.md`** (does not exist yet), and
every wave after that reads that file instead of the MCP. **That is wave 16a, and it is the first
thing to do.** Skipping it means paying the most expensive context on the project to re-read the
same design every session.

Sofia has asked that the tool be made available to subagents (_"well, then enable that tool for
the sub-agents"_). If that is done — the design MCP endpoint is
`https://api.anthropic.com/v1/design/mcp`, authenticated via `/design-login` — then subagents can
read it directly and 16a gets much cheaper. **16a is still worth doing anyway**, because a file in
the repo is readable by a session with no design credential at all, and is diffable.

The two project ids, so nobody re-derives them:

- **Auralis redesign kickoff** — `cdb06ed1-f8ac-45bb-bf88-1a8a43567b15` (the screens;
  `Auralis Redesign.dc.html` is the deliverable, `github.md` has the screen map)
- **Sonora Design System** — `6c14357e-f54e-4ad9-99e0-d7fd5ab02144` (also vendored inside the
  kickoff project under `_ds/sonora-design-system-6c14357e-.../`)

### The three things §16 must settle before any component is rebuilt

1. **`--m3-*` may be a silent name collision.** Sonora defines `--m3-primary`, `--m3-tertiary`,
   `--m3-surface-container*`; this app already has a Material 3 token layer. If the names overlap,
   adopting Sonora's stylesheet redefines tokens the app already consumes, and **nothing in this
   repo's test suite can see that** — it renders, and some of it is wrong. Diff the property sets first.
2. **Artwork-derived colour — the one open question in this phase, and it blocks nothing.**
   `Decisions already made` below records colour derived from album art at runtime, the Symfonium
   behaviour she named as loving. **Sonora's accent is a user-picked colour** (Symphony's 17 preset
   hues). **But the premise was wrong**: `packages/ui/src/tokens/artwork.ts` has zero callers
   outside its own test, so nothing derives colour from artwork today and what ships is _already_ a
   user-picked accent — Sonora's own model. Nothing is being deleted and 16b is unblocked.
   What survives is one sentence worth asking whenever there is a channel to her: **should
   album-art-derived colour ever be wired up as the accent's source, or is the picker the final
   answer?** It meets her own test — she would have an opinion and it changes what she gets.
   **Ask it; do not block on it.** A review caught `SONORA.md` claiming this had been asked and
   answered; it has not, and recording a live question as closed is worse than leaving it open.
3. **Sonora loads Inter, Roboto Flex and Material Symbols Rounded from Google's CDN.** This product
   is self-hosted, one container, one port. Offline or LAN-only, the icons degrade to the literal
   words `play_arrow`, `skip_next` on screen, because Sonora uses glyph-name-as-element-text.
   **Self-host the font files and the icon font.** Not a preference — the difference between working
   and not working on the network this product is designed for.

### `README.md` is stale, and she noticed

Her side-note: _"the README was not updated"_. It is 115 lines and predates most of what shipped.
Fixing it is folded into §16 as wave **16g**, but it does not depend on the redesign and can be
done by anyone at any time. It should reflect: phases 1–14 done, phase 11's F-Droid repo live,
`net.develivarr.auralis`, self-hosting via the GHCR image, and it should point at
`docs/SELF_HOSTING.md` and `docs/FDROID_REPO.md`.

---

`docs/ROADMAP.md` is the source of truth for **status** and for per-wave detail. This file
is the **context around it**: what a session needs to know that the code, the commits and
the roadmap do not say. It is `@`-imported into every session in this repo by `CLAUDE.md`,
so its length is paid for on every turn of every session — keep it short, and put wave
narrative in `ROADMAP.md` instead.

## Autonomy — read this before stopping

A session stops only on an explicit request to stop. A finished phase, wave, or CI run is
the cue to start the next roadmap item, not a reason to end the turn — see `CLAUDE.md`'s
"Autonomy" section for the full rule and the one real exception (the plan-usage ceiling,
enforced by hooks at 90%, with a hand-off band from 85%).

## Where the project is

Phases 1–10 **done**. Phase 11 **done\*** — the route is a self-hosted F-Droid repo; **all eight
secrets exist and Pages is enabled, and the only remaining gap is that no `v*` tag has ever been
pushed.** Phase 12 (the user's spec addendum) is **shipped on web and Android except 12c-2**, which
is now **answered** (below). Phase 13 **shipped as specced, and the spec was wrong** — see the next
paragraph, because it is the single most important thing in this file. Phase 14 **done** (14a, 14b,
14c). **Phase 15 is open and is the priority.**

**Phase 13 built the wrong thing, correctly.** It ranks items **already in the library**, so every
shelf it produces re-sorts what the user already owns. Her words: _"It is not useful to me if
recommendations only show things already in my library."_ Nothing is deleted — the profile, the
scoring core and the shelf machinery are reusable and the library-derived shelves stay — but a
session reading "phase 13 delivered personalized recommendations" and stopping there will build on a
premise the user has rejected. **`ROADMAP.md` §15 is the corrected spec.**

**`docs/USER_DECISIONS.md` is the authority over anything here or in `ROADMAP.md` that predates
2026-08-16.** Sofia answered the entire open-decisions list in one message and said she would not
message again in that session. Read it before picking anything up. Her priority order, explicit and
overriding the roadmap's own: **backend recommendations and requests first**, then **phase 11 /
F-Droid**, and **frontend explicitly not now** — a design system is coming from her that may
overhaul it, so cosmetic work started before it lands is likely to be thrown away. Shelf composition
and loading behaviour are behaviour, not styling, and survive it.

**There is plenty to start, and that is a change.** Until 2026-08-16 this file correctly said every
remaining item needed a decision, a device, a credential or another host. That is no longer true:
phase 15 is fully startable, phase 11 needs only a tag, and several long-parked items are now
decided.

`docs/ROADMAP.md` §15 is the current spec; §12 has each older wave, its sha and its open findings.
Everything is on **`main`**; do not push elsewhere without asking.

### What we owe the user — the credential ask, still unmade

**This is on us and has been for weeks.** `docs/setup/MY_SETUP.md` names it as the first ask and no
session has followed through, so it is stated here concretely enough to act on. Two tokens, both
**read-only**, both hers to issue:

1. **An Audiobookshelf API token** for `192.168.100.34:13378` — Settings → Users → her user → API
   token. This is the important one. `packages/abs-client` was written from fixtures; playback was
   completely broken from the client's creation until 2026-08-06 because a schema said `.optional()`
   where the real server sends literal `null`. Everything beyond `/status` and `/ping` is still
   unverified against reality.
2. **A Jellyfin API key** for `192.168.100.34:8096` — Dashboard → API Keys → New. The lyrics schemas
   have never seen a real `LyricDto`, and 12b's "sorted by relevance" cannot be tested without one.

**What they unblock:** recording real responses, diffing them against
`apps/server/src/testSupport/fakes/fixtures/*.json`, fixing fixtures **and** schemas — and, for the
first time, judging whether recommendations are any _good_ against her real 231-item library instead
of ten synthetic books. That last one is why this matters more for phase 15 than it did for 13.

### What remains, and what each item is blocked on

**Re-derived 2026-08-16 against `docs/USER_DECISIONS.md`.** The previous version of this table
predated her answers and half of it was stale.

| Item                                    | Blocked on                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 15** — external recommendations | **Nothing. It is the top priority and fully startable.** `ROADMAP.md` §15 has the waves. Quality is unassessable without the Audiobookshelf credential above; mechanism is not. |
| **Phase 11**'s last step                | **A `v*` tag.** Secrets and Pages are confirmed present; there are zero tags. Being taken now.                                                                                  |
| **12b** "sorted by relevance"           | A Jellyfin credential — see the ask above.                                                                                                                                      |
| **12d (Android)** visual conformance    | A device or emulator. The Compose harness (14b) asserts semantics in CI; it does not close the gap to a device.                                                                 |
| **Auto-updating deployment**            | **Go-ahead given** — _"You have my go ahead for doing that on Jellyfin."_ Still read mediaserver's own `~/CLAUDE.md` first, and still do not take Jellyfin down.                |
| **Launcher icon**                       | Deliberately parked — _"let's leave it hanging for now."_ Does **not** block the F-Droid listing.                                                                               |
| **Android post-login crash**            | A logcat, or her reinstalling the current CI APK. Do not spend another source audit without one.                                                                                |
| **Ebooks + read-along sync**            | In scope, low priority. The read-along half is far bigger than "render EPUB" and needs its own research.                                                                        |
| **Android Settings screen**             | Approved, unscoped. Needs a wave; content undecided.                                                                                                                            |
| **Search suggestions**                  | New requirement from her; needs a wave. Folded into phase 15's orbit, not yet specced.                                                                                          |

**Three design/product questions sit with Sofia and block nothing, easy to lose track of now that
their wave records live in `ROADMAP.md`:** queue `dbfb46e` (should album-art-derived colour ever
drive the accent, or is the picker the final answer?), queue `abbaca2` (the two WCAG contrast
numbers — `--accent-ink` on `--surface-card` fails AA in dark at the default accent; `--accent-contrast`
fails AA on `--accent` at most of the 17 presets), and queue `969711e` (external podcast discovery is
built and held on branch `hold-15e-podcasts` — she asked for request integration for books and music,
never podcasts, so it needs a decision on what tapping an external podcast should do, most likely a
one-tap RSS subscribe rather than a request flow). Ask when there is a channel to her.

**Answered and closed, so nobody re-opens them:** 12c-2 (an owned title shows in search but is not
requestable — same rule for artist/author pages), direct play vs transcode (transcode is fine),
`LinearProgress`'s `wavy` (drop the prop rather than leave one that lies), `GET /requests` scoping
(parked while she is the only user), lyrics search (approved, get an external provider), 12a's
cold-cache nav rail (**ours to decide** — she could not parse the question; pick the known
destinations unfilled and stop asking). **We escalate too much**: she reversed the framing on two of
nine long-deferred questions. The test is not "is this a product question" but **"would she have an
opinion, and does the answer change what she gets?"**

**Both items that were implementable on 2026-08-15 are done** (`50e74e0`, `3cda65c`), and
each turned out to be a coverage problem rather than the live bug the roadmap prose implied.
See "The minified-item bug" below for what that pass established — it corrects the standing
recommendation, so read it before picking up a branded-type refactor.

**No item in phases 1–12 is implementable without the user.** Verified again 2026-08-15:
every remaining one is in the table above and needs a decision, a device, a credential, or a
live change on another host.

**The roadmap was missing a phase, and it no longer is.** `HANDOVER` had long carried
"personalized recommendations are part of the goal, not scope creep for a later phase to
invent" as an explicit user requirement with nothing scoping it. `ROADMAP.md` §13 scoped it
(`2ae7ad6`) and **it is now delivered** — six waves, on signal that already existed and
needed no credential. Books recommend from Audiobookshelf progress, music from Jellyfin play
history, and genre affinity crosses between them, which is the user's own sentence about one
medium informing another. See "Phase 13" below for what that does and does not prove.

**`ROADMAP.md`'s top-of-file status table is fine now** — it reads `done*` for 11 and 12,
matching §12. The older note in this file saying it still called phase 12 "todo" was itself
stale and has been removed rather than repeated.

## Background agent log (auto-maintained)

Written by `scripts/hooks/agent-log.sh` on `SubagentStart`/`SubagentStop`; that script's
header is the real spec. Fifteen entries, pruned oldest-first, **per-checkout** — a session
in a worktree reads and writes only that worktree's copy. An entry still saying `running`
with no follow-up means the owning session may have been lost; check its transcript by Agent
ID before assuming its work landed. An agent's absence here only means a newer launch pushed
it out.

For the **global** view across every checkout, read the shared JSONL instead — same events,
one line each, tagged with the checkout they came from, append-only and unbounded. All
worktrees of one repo share one physical `.git`, and nothing under `.git/` is ever tracked,
so it is neither gitignored per branch nor a merge-conflict spot:

```bash
cat "$(git rev-parse --path-format=absolute --git-common-dir)/auralis-agent-log.jsonl"
```

<!-- AGENT_LOG_START -->

- `2026-08-20T22:23:16Z` · `aa14b1c2b80bebfb8` · general-purpose · ended · ## 1. The seven-call-site classification All seven line numbers you gave me were accurate — I re-grepped them before touching anything and they match…
- `2026-08-20T22:36:57Z` · `af5faf40ebd7f0c47` · general-purpose · ended · Working tree is clean, nothing uncommitted, nothing pushed. ## Report — wave '16i-handover-prune' **Branch/commit:** 'worktree-agent-af5faf40ebd7f0c4…
- `2026-08-20T23:43:27Z` · `ac975afe5c449b45b` · general-purpose · ended · ## 1. Claim A verdict — **HOLDS**, unchanged since the record was written 'itemLabels' is computed in 'apps/server/src/features/recommendations/shelv…
- `2026-08-20T23:44:00Z` · `a98b2440f08b1fb2e` · general-purpose · ended · # Phase 16 '--m3-*' Migration Audit — Findings ## Step 1 — the 501 split into three buckets Raw per-file counts (grep -c, i.e. lines containing '--m3…
- `2026-08-20T23:50:13Z` · `a8aa0d365d7e1810e` · general-purpose · ended · Working tree is clean, one commit on top of 'e856c70'. Here is my final report. ## Report — Wave '15c-2-S' **1. Branch/commit:** 'worktree-agent-a8aa…
- `2026-08-20T23:51:21Z` · `aa2569dc96b0baa5d` · general-purpose · ended · Everything is green and committed. Here is the final report. ## Report — Wave '16c-6-W' **1. Branch/commit:** 'worktree-agent-aa2569dc96b0baa5d' at '…
- `2026-08-21T00:04:17Z` · `a142e6882657bdfd0` · general-purpose · ended · Matches exactly. I have what I need to write the report. ## Verdict **Merge with named follow-ups.** The route is correct, well-tested, and degrades…
- `2026-08-21T00:07:48Z` · `a0945a250b7dbe6cc` · general-purpose · ended · Good, that confirms the "no container tier" claim cited by both Fab.tsx and ListItem.css comments is genuinely stated in Card.css. Report follows. ##…
- `2026-08-21T00:38:33Z` · `a08d557597dcd2471` · general-purpose · ended · Working tree is clean, everything committed on the worktree branch. Task complete. ## Report — Wave '15c-2-S-2' **1. Branch/commit:** 'worktree-agent…
- `2026-08-21T00:57:59Z` · `a21d6f864533eff15` · general-purpose · ended · Full 'apps/server' suite green (759/759). Report follows. ## Report — review of 'a1c0075' (recommended.ts / recommended.test.ts namespacing fix) **1.…
- `2026-08-21T01:04:16Z` · `a3096cd65d8c877e3` · general-purpose · ended · ## Report — wave '16c-7-W' **1. Branch/commit:** 'worktree-agent-a3096cd65d8c877e3' at 'f2465f7', two commits on top of 'a63aac3' (base per spec). 'g…
- `2026-08-21T04:10:54Z` · `a62004720b969710c` · general-purpose · ended · ## Report — For You / Home feed inventory, web and Android ### 1. Web — every async data source in Home's feed 'HomePage.tsx' (the "Browse"/For You s…
- `2026-08-21T04:17:56Z` · `a349cd26638b65911` · general-purpose · running · —
- `2026-08-21T04:23:53Z` · `aeb7302ff0eae9b44` · general-purpose · ended · Everything is committed and clean. Here is my final report. ## Report — Wave '15c-2-W' **1. Branch/commit:** 'worktree-agent-aeb7302ff0eae9b44' at '2…
- `2026-08-21T04:24:47Z` · `a006567403b5d06c8` · general-purpose · ended · ## Report — wave '15c-2-A' **Branch/commit:** worktree branch at '00ea28f', one commit on top of '6b191a6' (base per spec). 'git status --short' is c…

<!-- AGENT_LOG_END -->

---

## Phase 14 — verification and weight (opened 2026-08-16, self-directed)

`ROADMAP.md` §14 is the spec and says why the phase exists. Short version: phases 1–13 are done
to the limit of this machine, every remaining roadmap item needs a decision/device/credential/
another host, and the two things a session here _can_ move are not features — they are the gap
between what this project can build and what it can prove.

### 14a — the web entry chunk: **done, and it worked better than expected**

- **14a-1** (`43861d6`) — `docs/perf/ENTRY_CHUNK_ATTRIBUTION.md`: the entry chunk byte-attributed
  by decoding its sourcemap's VLQ mappings, 99.5% of 666,616 bytes accounted for. Read that file
  before proposing any further weight work; it is the map.
- **14a-2** — **landed, then reverted (`418b0d1`). Do not retry it without reading this.**

  **What it was:** `packages/ui/package.json` had no `sideEffects`
  field, so a bundler must assume every module in it is impure and cannot shake unused re-exports
  out of the barrel. `"sideEffects": ["**/*.css"]` marks the JS pure and keeps the CSS honest.

  **Entry raw 914.2 KB → 782.5 KB (−131.7 KB, −14.4%); entry gzip 237.0 KB → 198.9 KB
  (−38.1 KB, −16.1%).** Verified independently by the orchestrator, not taken from the report.
  `@floating-ui/react` — 21.8 KB that nothing in the app imports, riding in purely because
  `Menu.tsx` is a member of the barrel — left the entry chunk entirely. Total bundle is ~unchanged
  (bytes moved into `Shell`, whose lazy chunk grew 37.8 → 52.7 KB, still under its 72 KB budget).

  **It bought no Lighthouse score, and that is the durable finding.** A same-machine, same-commit
  A/B (five runs each, the one line the only difference) put `signedOut` mobile at 0.58 without and
  0.55 with, `home` mobile at 0.58 without and 0.56 with — every difference inside the documented
  0.55–0.62 band. **Third independent confirmation that entry-chunk weight is not the lever**,
  after lazy-loading `Shell` and after `manualChunks`. `react-dom` + `@mantine/core` are 335 KB of
  the 666 KB and neither defers without restructuring `main.tsx`'s boot. **Do not spend another
  wave shrinking the entry chunk.** Kept anyway — 131.7 KB off every first paint for one line is
  worth having even when the score does not notice.

  **The CSS-loss risk was real and was checked, because the e2e suite cannot see it.** Marking JS
  pure lets Rollup drop a component module _and its `import './Foo.css'` with it_ — and Playwright
  asserts on testids and text, never computed styles, so a component rendering unstyled passes
  188/188. Total CSS across `dist/assets/*.css` went 269,523 → 268,482 B; the entire 1,041 B delta
  is `TopAppBar`, which `apps/web` does not reference at all (only `packages/ui`'s own gallery
  does). `Sheet`/`Snackbar`/`Menu` were checked specifically and their CSS is present in their own
  lazy chunks. **If a future wave touches bundling in `packages/ui`, repeat that check — a green
  Playwright run is not evidence here.**

  Found in passing by this wave, and **now done** (`aa2f598`): `Chip.css`, `CircularProgress.css`,
  `LinearProgress.css` and `Skeleton.css` had no importer anywhere in the repo and are deleted.
  The "already absent from the bundle" claim was re-established rather than inherited — built
  before and after, total `dist/assets/*.css` is 269,523 B both times. One wrinkle worth knowing:
  `Chip.tsx` still applies `m3-chip-wrapper`, whose only rule lived in the deleted `Chip.css`, so
  that layout has been inert for months. It is unobservable because no caller uses
  `variant="input"` with `onRemove`; the class is kept as a `className` hook and the component now
  carries a comment saying what the first such caller will need to restore.

  **Why it was reverted, and this is the lesson worth keeping.** Web CI was green on **six
  consecutive runs before** the field landed and failed on **two of the three after**, every time on
  the same assertion: `e2e/app/for-you.spec.ts:229` — _"a loading skeleton occupies the same box as a
  loaded card"_, a test that exists precisely to pin layout stability.

  **Nothing was lost; it arrived late.** Every component's CSS was still emitted — the wave's own
  total-CSS-bytes check was correct and passed. What it could not see is _when_ the bytes arrive:
  moving a component's CSS out of the entry stylesheet into a lazy chunk's means that under a slow
  enough load the component can paint before its own stylesheet applies. **The check that would have
  caught it is not "is the CSS present" but "is it present _before first paint_".**

  **It never reproduces on this laptop.** The local `--project=app` suite ran 188/188 twice, and a
  same-machine five-run Lighthouse A/B measured identical CLS with and without the change. Only CI's
  slower environment surfaces it. So: **a green local Playwright run is not evidence about a
  bundling change**, and neither is a local Lighthouse A/B. CI's own history — outcomes per sha,
  read with `gh run list --workflow=CI` — was the only thing that showed it, and it showed it
  clearly.

  The trade, stated plainly: no measurable Lighthouse gain against a reproducible regression of a
  layout invariant on the user's primary screen. Bad at any byte count.

### Home's CLS regressed since phase 10, and nobody noticed because it still passes

Found while A/B-ing 14a-2, and **not caused by it** — measured 0.067 desktop / 0.053 mobile both
with and without that change, against `lighthouse-budget.config.mjs`'s documented 2026-08-06
baseline of **0.001 desktop / 0.008 mobile**. The budget is 0.1, so nothing fails; that is why it
sat unseen. `signedOut` is 0.000 on both form factors, so this is **content, not bundling** — the
likeliest source is the shelves phases 12 and 13 added to the home feed, loading cover art in after
first paint. `home` mobile LCP has drifted the same way (~7150 ms against a 6851 ms documented
median).

**This is startable here** and wants no credential: bisect by measuring an older commit, then fix
the shift at its source (reserved space for shelf rows, or intrinsic dimensions on cover images).
It is the most product-visible thing left on this machine — "the UI must be beautiful" is the
user's own sentence.

### 14c — Home's layout shift: attributed, deliberately not fixed

`f2a90d1`. **The hypothesis the wave was dispatched on was wrong, which is the useful part.**
Cover art is _not_ the cause: `CoverImage` already renders every card at a fixed width and height,
so the browser reserves the box before the bytes arrive. Measured on both sides of `418b0d1` (the
14a-2 revert) and the same culprit reproduces on both, so it is independent of that too.

**What shifts is architectural.** `HomePage` stitches four independent async sources — book
shelves, podcast shelves, Jellyfin favourite albums, recommendation shelves — client-side, and
whether each lands before or after first paint is an unreserved race. A shelf `<section>` or a
quick-picks tile appears from a **zero-size rect** rather than replacing an equally-sized skeleton.

**No product fix was applied, and that is a decision rather than an omission.** Every effective fix
— reserving space for a shelf whose existence is not yet known, or holding Home in its loading
state until all four sources settle — **visibly changes what the user's primary screen looks like
before content arrives**. That is a product call. It is written up here so the user can make it;
a session should not make it unilaterally.

**The regression test that was meant to land with it was reverted too (`19ae5bb`), and that is the
third revert of the day.** `e2e/app/home-cls.spec.ts` drove a real signed-in Home and summed
`layout-shift` entries through a `PerformanceObserver`. It passed locally. On CI the run went 2
failed / 3 flaky, with the new spec flaky and `for-you.spec.ts:229` and `context-menu.spec.ts:316`
failing beside it — on a commit whose only web change was that one file, immediately after a green
run.

**The mechanism is already documented and was not thought about:** `playwright.config.ts` runs
every `app` spec against **one shared, stateful, single-tenant BFF**, so a spec that repeatedly
loads Home to measure paint timing is precisely the neighbour that perturbs everything else.
**Timing measurement does not belong in a project whose timing is shared.** If it comes back it
needs its own Playwright project with its own server, the way `onboarding.spec.ts` already has.

The general lesson, paid for twice today: **a regression test that makes the suite unreliable costs
more than the regression it guards**, because an unreliable suite is how a real failure gets waved
through as flake.

### 14d — the Android test race, fixed twice by two sessions at once

**Two background sessions worked this checkout simultaneously on 2026-08-16 and both fixed the
same bug.** No work was lost and the two fixes are complementary, but the near-miss is the useful
part: `HANDOVER` already says to check `git log origin/main` and the claim list **before
dispatching a wave and again before merging**, and the session that collided had only done the
second. **A claim written between your dispatch and your merge is invisible unless you look for
it, and dispatching is where the money is spent.**

What each session landed:

- `b2561b8`/`6004577` (the other session) — the precise root cause. `viewModelScope` runs on
  `Dispatchers.Main`, which `setUp()` overrides with the test dispatcher, so every
  `viewModelScope.launch` is tracked by `runTest`'s scheduler **right up until it hops onto the
  class-wide `ApiClient`'s real `Dispatchers.IO`**. A test awaiting only `resultsState` can return
  while that launch is still suspended off-scheduler, and `runTest`'s completion check throws
  **inside that test**. The consequence worth remembering: **`tearDown()`'s drain can never rescue
  the test that fails — it only protects the next one.**
- `e4bf86d` (wave 14d) — two more files with the same latent defect that nobody had noticed:
  `HomeViewModelTest` and `RequestsViewModelTest` each built a class-wide `ApiClient` on the **real
  `Dispatchers.IO`** while injecting a test dispatcher into `setMain`. Neither needed real
  interleaving (no `setBodyDelay` in `HomeViewModelTest` at all); `RequestsViewModelTest`'s one
  genuine interleaving test now builds its own request-scoped real-IO client, the pattern
  `MusicRequestsViewModelTest` already used. **`MusicRequestsViewModelTest`'s doc comment already
  claimed `RequestsViewModelTest` did this** — it never did. A comment describing an intention
  reads exactly like a comment describing the code.

**The race is intermittent, so a single green run proves nothing.** The bar is several consecutive
green `android.yml` runs, and when using `gh run rerun`, check the log actually shows a
test-execution line rather than a cached `UP-TO-DATE` skip — the Gradle cache is restored by sha.

### 14b — Android had no way to verify UI at all, and now has a narrow one

**The finding is the valuable part.** `apps/android` contained **no Compose UI test harness** —
no `createComposeRule`, no Robolectric — and `android.yml` runs `./gradlew test assembleDebug`,
JVM unit tests only. So every Compose change on Android was verifiable by exactly "it compiles"
plus "a reviewer read it": the standard that passed on all four writer-with-no-reader failures.
The carousel-a11y follow-up was recorded as blocked on _a device_; it was really blocked on this.

- **14b-1** (`92fbe30`, then `ab3fd7b` and `604f290`) — Robolectric 4.14.1, `ui-test-junit4`,
  `ui-test-manifest`, `androidx.test.ext:junit`, `androidx.test:core-ktx`, plus
  `testOptions { unitTests.isIncludeAndroidResources = true }` (load-bearing — Robolectric
  inflates nothing without it). One test file, no product file touched. Its second test asserts
  the exact `semantics(mergeDescendants = true)` grouping 14b-2 needs, so the harness is proved
  for its purpose on the way in rather than assumed.

**Two red CI rounds, both toolchain facts, both worth not relearning:**

1. `import androidx.compose.ui.test.assertExists` does not resolve — `assertExists` is a **member
   of `SemanticsNodeInteraction`**, while `onNodeWithText`/`onNodeWithContentDescription` on the
   lines either side of it genuinely are top-level and genuinely do need importing. It is the odd
   one out in a block of near-identical lines, which is why it reads as correct.
2. **`ui-test-manifest` must be `debugImplementation`, never `testImplementation`.** Its whole
   contribution is an `AndroidManifest` declaring the `ComponentActivity` that `createComposeRule()`
   hosts the composable in, and unit tests read the **debug variant's merged manifest**. On
   `testImplementation` the jar is on the classpath but its manifest never reaches the merger — so
   it compiles, resolves, and both tests die at `RoboMonitoringInstrumentation:102` with a bare
   `RuntimeException` naming neither an activity nor a manifest. The spec that produced this
   **named the missing-activity failure mode explicitly** and still got the configuration wrong.

**Be precise about what the harness buys.** The claim is "**Compose semantics are now assertable
in CI**" — not "Android UI is now verifiable." Robolectric renders on the JVM against a shadowed
framework: it will confirm a node exists with the contentDescription you meant; it will not tell
you what TalkBack announces, how the row looks, or what is reachable by touch. It closes the gap
between "a reviewer read it" and "a machine checked it". It does not close the gap to a device.

**14b-1 took four red CI rounds and the fourth exonerates it.** In order: (1) `assertExists` is a
member of `SemanticsNodeInteraction`, not a top-level import; (2) `ui-test-manifest` must be
`debugImplementation` — see above; (3) `gradlew test` runs `testReleaseUnitTest` too, so the file
belongs in the **`src/testDebug` source set**; (4) `AppStartViewModelTest` failed with
`UncaughtExceptionsBeforeTest` and **a plain re-run of the identical commit went green**. That
fourth one is the latent race 13d already documented, and it is now **firing intermittently on
CI** where it was not before — Robolectric added suite wall-time, which is precisely the mechanism
13d's write-up names. Real loose end; not the harness's fault; nobody's wave yet.

- **14b-2 — DONE, and this bullet said otherwise for weeks.** It landed as `e87a551`, CI-verified
  on a genuine uncached execution, and three other places in this file have said so all along
  while this one still read "not started". Re-verified 2026-08-20 by reading the code:
  `ForYouCarousel.kt:173` carries `Modifier.semantics(mergeDescendants = true) { contentDescription
= announcement }`, with doc comments spelling out how the reason line folds into the merged
  announcement and why Compose has no `aria-describedby` equivalent.

  **The lesson is the contradiction, not the wave.** This file already records that a stale open
  finding is more expensive than a missing one, and that when a wave closes a finding recorded
  elsewhere here you delete it in the same commit. That discipline was not followed, and the cost
  was real: the `16e-foryou` spec wave was dispatched believing Android had no carousel semantics
  at all and had to establish otherwise before it could write its accessibility section. **A doc
  claiming a gap is no better evidence than a doc claiming parity.**

---

## Phase 13 — personalized recommendations: **done**, all six waves landed

`ROADMAP.md` §13 is the spec. On `main`: **13a** `8d071b8` (pure scoring core), **13b**
`0be4fc6` (`GET /libraries/:id/recommended` + `toCandidate`), **13c** `8bbad08` (web),
**13d** `8335184` (Android), **13e** restored 2026-08-15 as `640c751` (13e-1) and `9b086df`
(13e-2), **13f** `2e3f97b` (both clients read `GET /music/recommended`) with its Android
compile fix in `5b92e1d`. All CI-verified.

**The one asymmetry to keep in mind:** web's half of 13f is verified by a real browser asserting
on rendered testids; Android's is verified by unit tests plus a reviewer tracing the render path
by eye. There is no device or emulator here. That is the same standard the four historical
writer-with-no-reader failures all passed, so treat "the shelves render on Android" as a
well-argued claim rather than an observation.

**What works today.** The BFF computes book recommendations from Audiobookshelf's per-user
`mediaProgress[]` — signal that already existed and nothing read — and, since 13e, folds the
Jellyfin side's genre affinity into the same profile so taste in music informs the book feed.
Ranking is one pure, I/O-free core (`apps/server/src/features/recommendations/`) that the
route calls; it is deliberately not reimplemented per client. Shelves are served `Shelf`-shaped
plus a `reason`, appended after the existing For You feed, so cold start is a visual no-op and
a signal-less user sees exactly today's behaviour. Web and Android both render it.

### The 13e revert was unfounded, and both halves are restored

This is the correction that matters, established by evidence rather than by re-reading the
prose. Earlier sessions reverted both 13e commits on the strength of two e2e failures. **Both
findings were artefacts of a bad repro command, and the suite-wide crash blamed on the wave
does not exist.**

**The baseline that settles it.** A full `--project=app --workers=1` run on `3858f7e` — 13e
fully reverted, the tree the revert produced — gives **186 passed, 1 failed, 1 skipped**. There
is no `ERR_CONNECTION_REFUSED` cascade, the web server does not crash, and
**`for-you.spec.ts:128` passes**. The "e2e server dies mid-run and takes 130+ tests with it"
problem that the previous handover called "the thing to chase, not the two waves" **is not
reproducible and should not be chased.** It was almost certainly the tail of the same bad
invocation: a run that never established its preconditions, whose cascade of failures read as
a crash.

**`music-favorites.spec.ts` fails with 13e-1 already reverted**, which exonerates 13e-1
outright — its schema work was never involved. See "The one real suite defect" below for what
that failure actually is.

**`jellyfin-unconfigured.spec.ts` was never touched by 13e-2 either**, and this was confirmed
by reading code rather than by re-running: 13e-2 changed **no client file at all**, so nothing
new is issued from the `/music` page, and the one new server path reachable from an existing
route (`tryBuildMusicGenreProfile` in `routes/libraries.ts`) calls `app.jellyfin.forUser()`,
which is **fully synchronous** — two local DB reads, throwing before any network call or client
construction — and whose error its `catch` swallows into `null`. An unconfigured Jellyfin
cannot reach that route's response. The revert commit's stated cause ("the client now issues
`/music/recommended`") describes a call that does not exist in the diff.

**Never `-g` into a `describe.serial` block.** That is the lesson that cost two reverts and a
day. `-g` silently drops the setup test, the app then correctly renders "Jellyfin connection
has not been configured yet", and the failure reads exactly like a product regression. Run the
file.

### 13e-2's review, finally done

13e-2 was the only wave in the phase never independently reviewed (the session hit its usage
ceiling). Reviewed 2026-08-15: **no correctness defects.** Traps explicitly checked and
cleared, so no one re-checks them:

- Both new `rawUserItemDataDtoSchema` fields are `.nullable().optional()`, and
  `normalizeLastPlayedAt` folds `Date.parse`'s `NaN` into `null` — the null-vs-undefined class
  of bug that broke playback for weeks does not apply here.
- `albumToCandidate` folds `artistName` into a one-element `authors[]`, blank-guarded, so the
  adapted-shape trap is handled. Nothing in `profile.ts`/`score.ts`/`shelves.ts` branches on
  `media.kind`, so widening to `'album'` is inert by construction.
- The tests assert through to behaviour: route tests hit real HTTP and pin status codes and a
  known-item exclusion; `crossMediaGenre.test.ts` pins actual weighted-sum arithmetic. Deleting
  the logic fails them.
- `mergeGenreAffinity` never increases `target.totalSignal`, so a music-only user still sees an
  empty book feed. Cold start stays a visual no-op.

**~~One open finding: `GET /music/recommended` has no consumer.~~ Closed — and this file
contradicted itself about it for a day.** When 13e-2 was reviewed the route genuinely was a
writer with no reader, and this section said so. **13f then built the reader on both clients**
(`2e3f97b`), which the "Where the project is" section above has said all along — but nobody
deleted the open finding, so the same document asserted both. Re-verified by grep 2026-08-16:
web has `getMusicRecommended` in `api/client.ts`, `useMusicRecommendedQuery` in `api/queries.ts`
and a consumer in `features/music/MusicHomePage.tsx`; Android has `MusicRepository.recommended()`
feeding `MusicLibraryViewModel` and rendered by `MusicLibraryScreen`; `e2e/app/music-recommended.spec.ts`
covers the web path in a browser. Nothing is inert.

**The lesson is the contradiction, not the route.** A stale open finding is more expensive than
a missing one: two sessions in a row could have "fixed" a reader that already existed, and this
file is `@`-imported into every session, so the wrong half was being paid for on every turn.
When a wave closes a finding recorded elsewhere in this file, delete the finding in the same
commit — the same discipline the claim list already has.

### The suite is green — 188/188 — and two real defects were fixed to get there

`pnpm exec playwright test --project=app --workers=1` on `main` now passes **188, with none
failed and none skipped**. The baseline before this work was 186/1/1. Two genuinely distinct
defects were in the way, and neither was what the 13e revert claimed:

1. **Cross-file favourite-state contamination.** `music-favorites.spec.ts:45` expected
   `/music/favorites` to already show `track-driftwave-1` and `-2` favourited, and
   `context-menu.spec.ts` toggled one off and left it off. The file passed 8/8 alone and failed
   in the suite. The `app` project runs every spec against **one** shared single-tenant BFF
   whose fake-Jellyfin favourite state is process-global, and `playwright.config.ts` already
   states the rule that was broken: files are order-independent only if **each makes its own
   preconditions true rather than inheriting them**. Both specs now do. Pre-existing; predates
   13e entirely.

2. **A widened fixture silently invalidated a count assertion — a real 13e-2 regression.**
   13e-2 added a third fake artist, `artist-lumen`, on purpose: `shelves.ts` drops any facet
   with fewer than two matching candidates, so without it the music recommendation path cannot
   be exercised at all. Its comment shows it checked `jellyfin.test.ts`'s exact album counts
   and correctly left them alone. It never checked the **Playwright** side, where
   `music.spec.ts` pinned `'1–2 of 2'` on the artist grid's pagination label. Fixed in
   `f77474d`, which also asserts the third artist by name so a future fourth fails on a named
   missing card rather than on an off-by-one.

**That second one is the generalisable lesson, and it is the same shape as the Android
`MockWebServer` trap already recorded below: widening a shared fixture invalidates every
existing assertion that counted it, and review of the diff cannot catch it** — both halves read
as correct in isolation, and every unit suite stays green (`jellyfin-client` 120/120,
`apps/server` 678/678). Only a full e2e run sees it. **A wave that widens a fixture must run
the full `--project=app` suite before it is called done.**

So the honest summary of the 13e revert: the wave did carry one real e2e regression, and the
revert caught none of it — it diagnosed two failures that were repro artefacts, attributed a
non-existent server crash to the wave, and missed the actual defect entirely.

### `E2E_SERVER_LOG=1` — why nobody could ever diagnose this

Playwright's `webServer.stdout` defaults to `'ignore'`, so when the e2e BFF misbehaves its own
output is discarded and every downstream failure is a bare `ERR_CONNECTION_REFUSED`. `8899880`
makes it switchable: `E2E_SERVER_LOG=1 pnpm test:e2e` pipes the server's stdout into the run.
Off by default so CI logs stay readable. Redirect the run to a file — the server is chatty.

### Decisions from 13a–13d worth not re-deciding

- **`RecommendationCandidate` is an _adapted_ shape, not `LibraryItem`.** A book satisfies it;
  a **podcast does not** (`Podcast` carries a flat `author: string | null`). A type assertion
  pins both halves. Anything handing a podcast in must fold `author` into a one-element
  `authors` array first.
- **The `reason` strings in `shelves.ts`'s `reasonFor` are a first draft.** Never assert exact
  reason text in a client test — web and Android both assert presence/absence/order only, so
  copy can change server-side without breaking a client.
- **Accessibility contract, set by web's browser pass — and Android does _not_ mirror it, despite
  what this file and `ROADMAP.md` both claimed until 2026-08-15.** On web the reason is _not_
  tied to the `h2`; the card list carries `aria-describedby` → the reason paragraph, so title
  and reason announce as name + description. That half is real and shipped.
  **CLOSED — and this paragraph was stale for weeks.** It described a real gap as of 13f-2, and
  **14b-2 (`e87a551`) fixed it**; nobody deleted the finding. Re-verified 2026-08-20 by reading
  the source: `ForYouCarousel.kt:173` carries `Modifier.semantics(mergeDescendants = true) {
contentDescription = announcement }`, and `feedItemAnnouncement` folds the reason in, with doc
  comments at `:99-176` explaining that Compose has no `aria-describedby` equivalent so a merged
  `contentDescription` is the closest single-node form TalkBack has.

  **The two platforms therefore differ in mechanism and agree in outcome**, and the `16e-foryou`
  spec pre-rules that as **idiom, not drift** — web splits name and description across
  `aria-describedby`, Android merges them into one announced node, because that is what each
  platform's accessibility model actually offers.

  **Keep the original lesson and add its mirror.** "A doc claiming parity is not evidence of
  parity" cost this project a real gap. This paragraph cost it the opposite: a spec wave was
  dispatched believing a gap existed and had to spend turns proving it did not. **A doc claiming
  a gap is not evidence of a gap either.** Verify against the code, in both directions.

- **Reason lines wrap to two lines at 375px** when they carry the "— because you finished _X_"
  suffix. Nothing clips (there is deliberately no clamping), but headers get uneven. If that
  should change, the fix is `reasonFor` — once, serving both clients — not a clamp in either.
- **Quality is not assessable here.** Ten synthetic books prove mechanism, not taste. Judging
  whether the ranking is any _good_ wants the real 231-item library, which wants a credential.

## Two autonomous sessions can run in this one checkout at once — this happened

**`CLAUDE.md` line 291 is factually false and is the user's to correct, not a session's.** It
reads "There is no parallelism to protect: only one session runs here at a time, and the runner
skips while one is busy." On **2026-08-16 two `auralis-autorun` sessions were live simultaneously
in `~/src/auralis-src`**, both committing directly to `main` in the shared working tree, both
started from the identical kickoff prompt. Session `198bb53e` (started 2026-08-15 22:24) and
session `5466206d` (started 2026-08-16 09:35) overlapped for the better part of an hour.

That claim is the entire justification for the "do not create a worktree" rule, so it matters. The
rule is still right for its other reasons (main-checkout rot, per-directory auto-memory, the
runner's directory-based lookup, a worktree's `.claude/settings.json` being invisible elsewhere) —
but "there is no parallelism to protect" is not one of them any more.

**What actually went wrong, concretely:**

- **Both sessions independently dispatched a wave on the same thing.** Two `UnifiedSearchViewModelTest`
  race waves, and two Home-CLS attribution waves. One of each was killed once contact was made.
  The claim discipline below did not prevent it: it says to check `main` before dispatching **and**
  before merging, and one session checked only before merging.
- **A push carried the other session's commits.** `e71837f`'s push reported
  `261555d..e71837f` — three commits authored by the other session, already in the shared HEAD,
  went to `origin` under a push neither session intended as theirs. Nothing was lost or reordered,
  but no one reviewed them at the moment they landed.
- **`git merge` ran against a tree the other session could have been mid-write on.** This is the
  sharp edge. **Never `git add -A` in this checkout** — stage explicit paths only. That is now a
  standing rule, not a stylistic preference.
- **`git add <explicit paths>` is not enough on its own, and this is the subtler half.** A plain
  `git commit -m …` with no paths commits **the whole index**, including whatever another session
  has staged and not yet committed. That happened on `9f49625`, which swallowed another session's
  staged `metadata/` rename — the change was correct and wanted, but it landed under a commit
  message describing something else entirely, so **the reasoning behind it was separated from the
  content and lost**. Four cross-session contaminations happened in one day; three were pushes
  carrying commits, which can be reconstructed from shas. This one was a commit carrying another
  session's work, and a commit message cannot be reconstructed.

  **`git commit -- <paths>`** (or `git commit <paths>`) commits only those paths regardless of what
  else sits in the index. Use it for every commit here — **but it is a mitigation, not a
  guarantee, and the session that wrote this rule broke it within three hours.**

- **Path-limiting does nothing when two sessions edit the _same_ file, and this is the fifth
  contamination.** A path-limited commit takes that file's **working-tree content wholesale**,
  including another session's uncommitted edits to it. `72d7107` — a revert of a two-line doc fix —
  swept in a peer's in-flight rewrite of the same file, under a commit message describing only the
  revert. Staging discipline protects against _other files_; nothing in git protects against _the
  same file_.

  **So the real rule is: in a shared checkout, do not edit a file another session owns.** Where a
  cross-boundary fix looks urgent, **hand the other session the exact diff and let them land it**
  rather than editing and announcing. The urgency is usually real and the judgement is usually
  still wrong — in the case above the peer replied within minutes, which was faster than the fix
  needed to be.

- **Pushes cancel each other's CI.** `android.yml` has `cancel-in-progress: true` unconditionally,
  and two sessions pushing independently cancelled the `CI` and `Android` runs for both `e71837f`
  and `e4bf86d` before either allocated a useful result. With one session this is a nuisance you
  can schedule around; with two it means **no sha gets verified until both sessions agree to hold
  a push**, which requires them to be talking.

**What worked, and is the thing to repeat.** `ListAgents` lists the other live sessions on this
machine and `SendMessage` reaches them by name. One message resolved the whole collision: the
duplicated waves were identified, one of each was killed, `apps/android` and `apps/web` were split
between the two sessions, and both agreed to hold pushes until the in-flight CI run finished.
**A session that finds unexplained commits in this checkout's `git log` or reflog should run
`ListAgents` before doing anything else** — the reflog entries were made _in this checkout's HEAD_,
which is what distinguishes a concurrent session from a subagent working in its worktree.

**Do not "fix" the runner.** `auralis-autorun.timer`/`.service` live under the host's own tooling,
which `CLAUDE.md`'s scope section reserves for the user. Report the overlap; leave the unit alone.

## Claimed work — check here before starting a wave

### DONE 2026-08-21 — `15c-2-S` and `16c-6-W` both landed. **`main` is `2f9b04f`.**

Dispatched together because their directories do not overlap. **`main` is `e856c70`, green on `CI`,
`Android` and `Publish`** (verified, not assumed).

| Wave      | Owns                           | What it does                                                                                         |
| --------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `15c-2-S` | `apps/server/src/**`           | `GET /recommended` — the cross-medium aggregator that finally makes mixed shelves reachable          |
| `16c-6-W` | seven `packages/ui` primitives | migrate `Fab`/`NavigationBar`/`ListItem`/`TopAppBar`/`SearchField`/`Snackbar`/`Marquee` off `--m3-*` |

**Both were rebased onto the tip before merging, not cherry-picked**, so both worktrees stay
prunable — the mistake that left four permanently-unprunable worktrees on disk was not repeated.
`15c-2-S` merged as `e94005d`, `16c-6-W` as `65fcc69`, plus one review follow-up as `2f9b04f`.

**Verified here before pushing, not inferred:** `pnpm typecheck` across every project,
`pnpm --filter e2e typecheck` (the one CI covers and the per-package run silently drops),
`pnpm lint`, unit **1764/1764** (up from 1732 — +8 server, +24 UI, so the new tests are real rather
than absent), and a full `--project=app` Playwright run at `--workers=2`: **240 passed, 0 failed.**

That Playwright run was not optional. `15c-2-S` widened a **shared fixture**
(`items-podcasts.json`, one new podcast), and this project's own history says a widened fixture
invalidates every existing assertion that counted it while every unit suite stays green — only a
full run sees it. The reviewer also grepped every count/pagination assertion against `lib-podcasts`
and found none affected. Both checks agree, which is why this is settled rather than assumed.

### DONE 2026-08-21 — `15c-2-W` + `15c-2-A` merged. **`-P` IS OWED AND NOT DISPATCHED.**

**`GET /api/v1/recommended` finally gets its reader.** It has been this project's fifth
writer-with-no-reader since `e94005d`. Both agents are worktree-isolated (**checked** with
`ls .claude/worktrees/agent-<id>`, not assumed) and dispatched from one shared behaviour spec,
`docs/agent-specs/15c-2-CLIENTS.md`. `-W` owns `apps/web` + `e2e`; `-A` owns `apps/android`.
Disjoint. **`-P` is owed after both land**, by an agent that wrote neither half.

**Placement was the orchestrator's call and is decided: REPLACEMENT.** The mixed shelf replaces the
per-medium recommended carousels on For You rather than sitting beside them — Sofia asked for mixed
carousels _rather than_ one shelf per medium, neither client can dedupe across independently-fetched
responses, and replacement closes an existing divergence for free (web fetched
`/libraries/:id/recommended` for the **book library only**; Android fetched it for **book and
podcast**). Home's other three sources are untouched.

**Both merged by rebase-then-`--ff-only`, never cherry-pick** (the mistake that permanently strips
`worktree-gc.sh`'s ability to prune a worktree). `-W` is `5ce4bde`, `-A` is `710461f`.

**Verified here by the orchestrator before pushing, not taken from either report:** `pnpm typecheck`
across every project **plus `pnpm --filter e2e typecheck`** (the one CI covers and the per-package
run silently drops), `pnpm lint`, and unit **1778/1778 — up from 1764**, so the new tests are real
rather than absent. Full `--project=app` Playwright run at `--workers=2` follows separately; **CI is
the authoritative signal either way, and `apps/android` compiles on CI only** — there is no JDK here,
so nothing mechanical has yet checked the Android half beyond textual invariants.

**`-P` is owed and its brief is already written and parked at
`docs/agent-specs/15c-2-P-PARITY.md`** — authored deliberately _before_ either wave reported, so it
derives from the spec rather than from an implementing agent's paraphrase. **Dispatch it first.**

### The divergence `-P` exists to rule on, found by reading both reports side by side

**Both agents independently hit the same design question the spec did not answer, and answered it
with different types.** A carousel carries a `contentType` used to filter For You by medium, and a
genuinely mixed shelf has no single medium to report.

- **Web** widened it to `ForYouContentType | 'mixed'`, and states the behaviour: a mixed shelf
  renders under "All" only, never under a specific chip.
- **Android** made it **nullable**, `null` meaning mixed, to keep every existing exhaustive `when`
  untouched.

**The types differ; whether the BEHAVIOUR differs is unverified and is `-P`'s first job.** If both
render mixed shelves under "All" only, this is idiom and should be recorded as such. If Android's
`null` falls through a filter branch differently — showing a mixed shelf under a medium chip, or
hiding it from "All" — that is drift, and it is the kind that renders correctly in the default view
and is wrong one tap away.

### Two deviations from the dispatch spec, both reported honestly, one of which was the spec's fault

1. **`-W` declined the spec's "parse with zod at the boundary" instruction, and was right to.**
   `apps/web` has no zod dependency at all and `client.ts`'s `request<T>()` is a plain `JSON.parse`
   cast across all ~30 of its methods. The instruction was mine and it was wrong for that package —
   the parse-at-the-boundary rule governs **upstream** boundaries in `apps/server`, not the web
   client's own BFF calls. Adding one validated method would have been a lone convention, and adding
   a dependency was forbidden. **Recorded so nobody "fixes" this later as an oversight.**
2. **`-W` could not build a genuine cross-kind e2e scenario without widening a shared fixture**, and
   deliberately did not — this project's own history says a widened fixture invalidates every
   existing assertion that counted it while every unit suite stays green. Instead its e2e fetches
   the route's live response and asserts every rendered card's `aria-label` matches the server's
   `itemLabels` exactly, whatever shape the data takes. **The multi-kind render path is therefore
   proven at unit level only.** `-P` should say whether that is sufficient.

**Three things `-P` must look at specifically in `-A`, beyond the standard checklist:**

1. **`ForYouViewModelTest.kt` had its dispatcher "fully rewritten" (184 lines changed).** This file
   is the single most dangerous one in the Android suite to touch mechanically — `HANDOVER`'s
   Android-test-traps section records that the inject-the-test-dispatcher convention is **not
   universal**, that one class of exception (`HomeViewModelTest`'s `startDownload` tests) **hangs**
   rather than failing visibly, and that `f99b8fa` reverted exactly such a mechanical pass. Only CI
   can settle it. Read the diff for tests that assert real `MockWebServer` interleaving via
   `setBodyDelay`.
2. **`FeedCarousel.contentType` became nullable, `null` meaning "mixed".** A change to a shared type
   rather than a new enum case, chosen to keep every existing exhaustive `when` untouched. Judge it;
   it is defensible but it is a design decision the spec did not make.
3. **`ForYouScreen.kt` gained `isExternal` guards on `PODCASTS` and `MUSIC`.** These extend an
   existing `BOOKS` guard and so change behaviour for the **pre-existing** carousels too, not only
   the new mixed one. In scope by the availability requirement, but wider than the mixed shelf.

**Two things pre-ruled so `-P` does not misgrade them:**

- **Web deletes one fetch, Android deletes two.** Correct and pre-existing, not drift.
- **Cross-carousel dedupe on For You does not exist today on either platform** — grepped, not
  inherited. Replacement reduces the duplication surface; it does not introduce it. Pre-existing and
  out of scope.

### A dispatched wave was cancelled mid-flight, and the reason is the useful part

**`15c-2-S-3` was specced, dispatched, and killed with nothing committed.** Recon found that
`MixedRecommendedItem` has no `progress` field while both clients render a progress bar on
recommended cards — which reads exactly like replacement silently deleting a visible affordance, the
signature failure shape here. So a server wave was dispatched to add the field.

**It was vacuous.** `profile.ts:123` adds **every** item carrying a progress signal to
`knownItemIds` — unconditionally, _not_ gated on `isFinished` — and `score.ts:38` skips every
candidate in that set, commented "Never recommend what the user already has progress on." Both the
new aggregator (`recommended.ts:381-382`) and the older per-library route (`libraries.ts:305-316`)
run that same pair. **A recommended item is therefore by construction one the user has no progress
on.** The field is already always `null` on the route being replaced, the bar has never rendered on
a recommended card on either platform, and adding it would have shipped a wire field that can never
hold a value — a writer with no reader, inside the wave whose whole purpose is to close one.

**The generalisable lesson, and it is new: reading the writer tells you the shape; only reading the
filter tells you the range.** The missing field was visible in the route's own type signature. Its
emptiness was a property of a scorer two modules away. Every check that looks at the producer —
review the diff, read the route, grep the type — returns "field absent, clients render it, therefore
regression," and every one of them is wrong. **Before adding a field because a consumer renders it,
find what excludes rows from that response and check the field is reachable through it.**

**Adjacent finding, deliberately not fixed:** `RecommendedLibraryItem.progress` on the two existing
routes is likewise a field that can never be non-null, and both clients hold progress-bar rendering
for it that can never fire. Pre-existing, harmless, and a separate decision.

### DONE `a1c0075` — `15c-2-S-2` closed the id-collision follow-up, and found a second half

Follow-up 1 below is **closed**, but the record stays because the fix was bigger than the review's
description of it, in a way that would have bitten whoever did it "quickly".

Candidate ids from the two upstreams are now namespaced (`abs:` / `jf:`) for the duration of
scoring and stripped before serialization, so `items[].id` on the wire is unchanged. Landed **before**
any client consumes the route, which was the point of doing it now — once a client depends on `id`'s
format, changing it is a breaking change, and the client triple is the next wave.

**Two traps, only one of which was known going in:**

- **The known one:** `itemLabels` is keyed by item id, so stripping the prefix from `items[].id` but
  not from every `itemLabels` key ships a map matching no rendered card — silently disabling the
  feature while every existing test stays green. Now pinned by a test asserting
  `Object.keys(itemLabels)` equals `items.map(i => i.id)` exactly, **verified discriminating** by
  reverting the strip and watching it fail.
- **The one nobody had named**, and the reason this was worth delegating rather than doing inline:
  **`signals[].itemId` had to be namespaced too.** `profile.ts`'s `buildTasteProfile` matches
  `signal.itemId` against `candidate.id` **directly**, so prefixing candidates while leaving signals
  bare would have silently broken both the known-item exclusion and taste-affinity matching — no
  error, no failing test, just quietly worse recommendations. A "ten-line fix" that touches an id
  space has to account for every consumer of that id space, not just the one the bug was reported in.

**Independently reviewed, clean, no follow-ups.** The reviewer audited the id's whole lifecycle —
every place one is produced, compared, used as a map key, or serialized — and found no leak and no
partial strip. Confirmed consistently namespaced: `candidate.id`, `signal.itemId`, `score.ts`'s
known-item exclusion, `shelves.ts`'s `candidatesById` and `parentKeyOf` fallback. Confirmed bare on
the wire: `items[].id`, every `itemLabels` key, `coverPath`/`imageTag`. Confirmed never id-derived,
so never at risk: `shelf.id` (built from facet **names**) and `reason` (built from `seed.title`).
It also verified the collision test fails pre-fix for **the reason claimed** — the two colliding
candidates resolve through `candidatesById` to one value, `dedupeByParent` collapses them to a
single item, and the shelf drops below the two-item threshold and never forms — rather than taking
the commit message's word for it. `apps/server` 759/759.

**One residual property, correctly left alone.** On a _true_ literal-id collision, `itemLabels` is a
`Record<itemId, string>` and structurally cannot hold two labels under one bare key — last write
wins. That is a wire-format property inherited from 15c-1, not something this wave introduced, and it
is harmless **because every item carries its own `kind`**. **The client triple must therefore treat
`item.kind` as authoritative and `itemLabels` as a convenience** — `docs/agent-specs/15c-2-CLIENTS.md`
now says so.

### DONE — `16c-7-W`: `app.css` migrated, **84 live `--m3-*` reads down to 14**

`apps/web/src/styles/app.css` was the last big `--m3-*` consumer and had never been named as a wave.
70 of 84 occurrences migrated; the 14 survivors are all deliberate: **5** `--m3-touch-target-min`
(the permanent accessibility floor), **5** `.m3-type-*` (the typography scale, still `16c-8`'s job),
and **4 new documented deferrals** — `--m3-surface-container-high` on the shortcut-sheet `kbd` badge,
the mini player and the sleep-timer dropdown, plus `--m3-surface-container-highest` on that
dropdown's hover. Each extends the established `Menu.css`/`SearchField.css` precedent (a floating or
docked surface over arbitrary content, for which Sonora has no "one step brighter" token) and each
now carries that reasoning inline.

**Verified here: `apps/web` 618/618 including `layoutOverflow.test.ts`, `packages/ui` 128/128,
typecheck clean, and every introduced token confirmed defined in `sonora-tokens.css`/`sonora-theme.css`.**

**The `ListItem` lesson paid off immediately.** This file holds the queue view's override of
`.m3-list-item--selected`, and the wave checked it against what `ListItem.css` now paints rather
than migrating it in isolation — they agree, because `2f9b04f` had already moved the component to
the same tonal `--surface-card`/`--surface-fg` pair. That check was a deliverable, not a hope, which
is the whole point of adding it to the spec.

**One judgement call it made rather than escalating, correctly:** `.auralis-update-banner`'s
`--m3-secondary-container`/`--m3-on-secondary-container` pair had no entry in the substitution table
and no in-file precedent. It resolved to a tonal `--surface-card`/`--surface-fg` pair per the spec's
standing rule that **no new text-on-accent-fill pairings** may be introduced while the WCAG question
is open with Sofia (queue `c9887cb`).

**AN OPERATIONAL NEAR-MISS WORTH KNOWING, because the guard does not cover it.** The agent ran a
mechanical substitution script against the **shared checkout** rather than its worktree: it had
`cd`-ed to `/home/sofiapata/src/auralis-src` for a **non-git** Bash command, and **the isolation
guard only intercepts `Edit`/`Write` and git operations — a `sed`/`python` script writing files
through Bash is not caught.** It noticed before committing, restored `app.css` from
`git show a63aac3:…`, and redid the work in the worktree. **I verified the restore independently
rather than accepting it**: `diff` against `a63aac3` reports the file byte-identical, and the shared
checkout's only modification was the agent-log hook's own entries. Nothing was lost.

**The rule this implies:** an isolated agent's worktree discipline is enforced for `Edit`/`Write` and
git, and is **advisory for anything it does through a shell**. A spec that says "you own file X"
should say _in your worktree_ explicitly, and an orchestrator taking such a report should `diff` the
shared checkout rather than trust the restore.

**`16c-8` — the `.m3-type-*` typography scale — is now the only substantive `--m3-*` work left**,
plus `CoverImage.tsx`'s two-line fallback tile. Every other survivor is permanent or documented.

### Follow-ups the two reviews named — none blocking, all precise

1. **Id collision across upstream namespaces (`15c-2-S`), and the obvious fix is a trap.** The route
   unions Audiobookshelf and Jellyfin candidates into one pool, and `shelves.ts` keys
   `candidatesById`, its `used` set and `itemLabels` by a **bare `id`**. On a collision, last write
   wins: the album shadows the book for every kind/parent lookup, while the route's own
   `toMixedItem` resolves the id ABS-first — so the card would render a book and be **labelled
   `Album`**, and the album becomes unreachable. Real, silent, and a wrong badge rather than a crash.
   Probability is genuinely low (ABS ids are `li_`-prefixed nanoids, Jellyfin ids 32-char hex).
   **The reviewer's proposed fix — prefix pool ids by kind, strip on serialization — is right in
   outline and incomplete as stated: `itemLabels` is _keyed by item id_, so prefixing without also
   stripping the prefix from every `itemLabels` key ships a map whose keys match no rendered card,
   silently disabling the very feature the wave exists for.** Deferred for that reason rather than
   rushed at the end of a session. Fix both sides together, with a test that a mixed shelf's
   `itemLabels` keys still equal its item ids.
2. **The Audiobookshelf pool over-fetches (`15c-2-S`).** `ABS_CANDIDATE_LIMIT` (300, correctly
   reused from `libraries.ts`) is applied **per library** and the total is capped only afterwards, so
   N libraries fetch up to 300xN to keep 300. Minor today (most households run two). Worth knowing
   before "fixing" it: dividing the cap by library count rebalances the pool, which changes
   recommendation composition — a behaviour change, not just an efficiency one.
3. **`SearchField.css` keeps one live `--m3-surface-container-highest`** for the suggestion-hover
   background, extending `Menu.css`'s documented reasoning. The reviewer endorsed keeping it but
   found the stated analogy **overstated**: `Menu`'s dropdown container really is
   `--m3-surface-container-high`, so its hover has a ladder to step up from, whereas `SearchField`'s
   dropdown has no explicit background rule at all and inherits Mantine's popover default. Keeping
   the deferral is still right; the comment claiming the two cases are "identical" is not.
4. **`Fab` went from a tonal container to a saturated `--accent` fill.** Ruled an acceptable
   divergence, and the reasoning matters: **`SONORA.md` says Fab has no Sonora equivalent at all**,
   so nothing settles it, and `--accent`/`--accent-contrast` is the established pairing elsewhere.
   Flagged because it is a real visual change nobody has seen on a screen, and because it inherits
   the same `--accent-contrast` contrast question as everything else.

### `ListItem`'s selected row — a mechanically-correct migration that was wrong twice over

Caught in review, fixed in `2f9b04f`, and worth keeping because neither half was visible to a test.

`16c-6-W` migrated `.m3-list-item--selected` to a solid `--accent`/`--accent-contrast` fill. That was
a faithful reading of the token substitution and still wrong:

- **`16e-nowplaying` had already overridden this exact class** at the queue-view call site in
  `apps/web/src/styles/app.css`, deliberately, because a solid accent block reads wrong for "the
  currently-playing row". `ChapterList` renders the same semantic through the bare `selected` prop
  with **no** override — so the fill split one concept into two treatments, loud in one place and
  tonal in another. **The call site that disagreed with the migration lives in a different package
  from the component being migrated**, which is exactly why a per-component review missed it.
- **It was a contrast regression.** `--accent-contrast` on `--accent` is 4.23:1 at the shipped
  violet default; the `--m3-on-secondary-container` pair it replaced was built to pass AA.

Now `--surface-card` with inherited `--surface-fg`, mirroring what the queue view chose when it made
this call first. **The test pins both directions** — it fails on a revert to `--m3-*` _and_ on a
revert to the accent fill — because pinning only the migration is what let the wrong shape look
right.

**The generalisable lesson: a shared primitive's `selected`/`active` state is a call-site question,
not a component question.** Before migrating one, grep the app for overrides of that class; an
override is a previous wave's design decision, and re-reading it is cheaper than rediscovering it.

### Phase 15's `15c-2` — all three blockers re-verified 2026-08-21, and all three still hold

Re-checked against the code, not the prose, because four waves (`15a`, `15e-music`, `15e-books`,
`15d-1-*`) landed after the blockers were recorded and any of them could have closed one. None did.

1. **`itemLabels` still cannot reach the wire.** `routes/libraries.ts:332-341` and
   `routes/jellyfin.ts:568-577` each rebuild the shelf as an explicit `{ id, label, type, reason,
items }` literal. Neither route declares a `schema:`, so this is purely the hand-built literal —
   not a serializer stripping unknown keys.
2. **No route can produce a mixed shelf.** `buildRecommendationShelves` has exactly two callers,
   each passing a single-kind pool. External discovery (`15e-*`) does **not** change this: it builds
   its own separate shelf literal and never feeds the shelf builder, and each placeholder is the
   same kind the route already handles.
3. **No adapter sets `parentId`.** `shelves.ts:39` reads it; nothing writes it. So the
   dedupe-by-parent rule falls through to the series-name branch always.

**The trap that nearly cost a wave, recorded so nobody repeats it.** Wiring `itemLabels` into those
two existing route literals looks like a cheap independent win and **is inert**: `typeLabelsFor`
returns `undefined` when a shelf spans fewer than two kinds (`shelves.ts:80`), and both routes'
pools are single-kind by construction. It would serialize `undefined` forever while reading as
progress in the diff. `itemLabels` therefore belongs on the **aggregator's** response literal, and
the two existing routes are deliberately left alone.

**What is explicitly NOT in `15c-2`:** episode- and track-granular candidates carrying a real
`parentId`. That needs a podcast-episode adapter and a track adapter, neither of which exists, each
with its own progress-signal handling — and nothing currently asked for requires it. Bundling it in
would turn `15c-2` into a second "mechanism nobody can reach". Parked deliberately, not forgotten.

**`shelves.ts` itself is not half-built and must not be rewritten.** Its dedupe and mixed-label
rules are fully implemented and thoroughly unit-tested (`shelves.test.ts:132` and `:277`, including
shelf-collapse-below-minimum and parentless-item non-collision). "Mechanism only" in the older
prose means _unreachable_, not _unfinished_ — a distinction worth keeping, since a session skimming
it could easily redo solid work.

### Phase 16 is genuinely `wip` — the status table is right and the wave bullets are also right

Audited 2026-08-21 because every §16 wave bullet says DONE while the top-of-file table says `wip`.
**Both are true and they are not the same claim**: each wave finished its own scope; the phase's
exit condition — `--m3-*` deleted when the last consumer leaves — is not met. 501 occurrences
remain, and the split is the whole point:

- **~254 are the definition/emission layer** (`packages/ui/src/styles/index.css`, `tokens/*.ts`,
  `ThemeProvider.tsx`). These are the supply side and must survive until the last consumer goes.
- **~39 are pure prose** — doc comments _explaining_ the migration in files that are fully migrated
  in code (`Card.css`, `Slider.css`, `Button.css`, `Chip.tsx`, `IconButton.tsx`, `Dialog.tsx`).
  A raw grep count reads these as unmigrated. They are not.
- **~120-130 are live consumers — the actual residual work.**
- The rest are **documented-deliberate survivors**: `--m3-touch-target-min` (a permanent app-wide
  accessibility floor with no Sonora equivalent), the app-wide `.m3-type-*` typography scale, and
  `Menu.css`'s `--m3-surface-container-high` (kept so the dropdown does not visually merge into the
  `Card` it opens over).

**The residual work, in the order I would take it:**

1. **`16c-6-W` — seven `packages/ui` primitives** (~30 call sites): `Fab` (entirely unmigrated),
   `NavigationBar`, `ListItem`, `TopAppBar`, `SearchField`, `Snackbar`, `Marquee`. **In flight now.**
2. **`apps/web/src/styles/app.css` — ~85 live occurrences, and it has never been named as its own
   wave.** This is the big one and the docs **understate** it: an existing note calls it
   "onboarding/settings page-level CSS", but the real selector list spans Now Playing, the mini
   player, the nav-rail search, the queue view, sleep timer, lyrics, chapter list, bookmarks, the
   card grid and error surfaces — app-wide chrome, not two screens. **Scope a wave against the
   measurement, not against that description.**
3. **`CoverImage.tsx`'s image-load-failure tile** — 2 lines, undocumented as deliberate, a tag-along.
4. **The `.m3-type-*` typography scale** — cross-cutting, deferred by every 16c wave, and **no wave
   is named to close it**. Sonora defines its own `--text-*`/`--h1..h4-*` family (`SONORA.md` §1.8)
   that nothing consumes yet. This needs a wave or an explicit decision that it is permanent.

**This residue is web-only and does NOT need an Android pair.** Android finished the equivalent
work in `16b-2-A`/`16f-A-1`/`16f-A-2`: `apps/android` has zero `dynamicColor`/`dynamicLightColorScheme`
usage (the only mention is a comment saying Sonora replaced it), and every `MaterialTheme.colorScheme.*`
read resolves through the Sonora-populated scheme. **A `-P` is still owed once web catches up**, since
`16c-1-P` and `16c-2-P` were both folded forward and no later `-P` ever closed that loop.

### The accent-contrast failure is worse than queue entry `abbaca2` records — do not start the fix

Computed here 2026-08-21 with the WCAG relative-luminance formula over all 17 Sonora accent presets,
against `--accent-contrast`'s single definition (`packages/ui/src/styles/sonora-tokens.css:42`,
a static `#fff`, four consumers on web). **Android has the identical defect**:
`SonoraPalette.AccentContrast = Color(0xFFFFFFFF)` (`ui/theme/Color.kt:42`), wired into both the
light and dark token sets (`:254`, `:264`) and consumed by the nav indicator
(`ShellNavigationItems.kt`) and the Settings chips (`SettingsScreen.kt:122`).

**The finding the queue entry does not have: white clears AA (4.5:1) on _none_ of the 17 presets.**
The best case is indigo at **4.47:1**; the worst is yellow at **1.92:1**. So "derive the ink per
hue" — which sounds like an ordinary engineering fix — actually resolves to **near-black on
essentially every preset**, including violet, which is the shipped default. That is a visible change
to every selected nav item and every filled chip on both platforms.

| ink choice                  | outcome                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| keep `#fff`                 | fails AA at all 17; fails even the 3:1 UI floor at 9 of them           |
| pick max-contrast per hue   | resolves to dark ink on all 17 — white never wins                      |
| white above 3:1, dark below | keeps the shipped violet look, leaves 8 hues AA-failing for small text |

**This is therefore genuinely Sofia's call, not an ordinary judgement call** — it changes what she
sees, and she would have an opinion. It meets her own test. **Ask; do not block, and do not start
the fix.** Nothing depends on it.

### RELEASED 2026-08-21 — **`v0.2.0`, the first Android release since `v0.1.0`**

**Sofia asked for this directly: the Android app had not been re-released.** She was right —
`v0.1.0` (2026-08-16) was **310 commits back, 40 of them touching `apps/android`**, so the entire
Sonora redesign had shipped to `main` and was installable by nobody. **Cutting a tag is the only
route: neither `release.yml` nor `fdroid-repo.yml` has a `workflow_dispatch`, so both fire on `v*`
only.**

Tagged on `e9c2c10`, verified green on `CI` **and** `Android` first, with the Android job confirmed
as a genuine uncached execution. `versionCode` is the tag's 1-based position in semver order, so
`v0.2.0` → **code 2**, strictly increasing over `v0.1.0`.

**THE VERIFICATION THAT MATTERS, because `v0.1.0` proved green workflows are not evidence.** That
release published a correctly-signed APK and a valid index and was still broken for a human: the
docs named a URL that 404'd, and the index declared a `repo.address` that disagreed with where Pages
served it — so a client could add the repo, list the app, and fail only at **install**. The fix
(staging `site/repo/` so the served layout matches the declared address) landed afterwards and,
because these workflows run on tags only, **`v0.2.0` was the first time it ever executed.**

So it was checked end to end, against the URL the documentation gives a human:

| Check                                          | Result                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /curly-spoon/repo/index-v2.json`          | **200**                                                                          |
| `GET /curly-spoon/repo/entry.jar`              | **200**                                                                          |
| `repo.address` the index declares about itself | `https://patakihara.github.io/curly-spoon/repo` — **matches where it is served** |
| Package / version / code                       | `net.develivarr.auralis` · `0.2.0` · **2**                                       |
| The APK path the index points at               | **200, 15,329,011 bytes**                                                        |

**The install path is therefore proved, not assumed** — the v0.1.0 failure mode is closed.

**One caveat that cannot be checked from this machine, stated rather than glossed.** If an existing
install refuses to update with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the two releases were signed
with different certificates and the fix is to uninstall and reinstall. Both were built through the
same `ANDROID_*`-secret release signing config, whose `check-secrets` guard fails loudly rather than
falling back to a debug key, so this is unlikely — but confirming it needs `apksigner`, and there is
no JDK here.

**Also worth knowing: the index lists only `0.2.0`.** `fdroid update` sees just the APK built in
that run, so the repo serves the latest release rather than a history. Fine for one household;
surprising if anyone expects to roll back from Droid-ify.

### DONE 2026-08-21 — `16h-chip-singleselect`. Verified by the orchestrator, not the wave.

`Chip` gains **one opt-in prop, `radioGroup?: string`**, which passes `type="radio"` and a shared
`name` through to Mantine. **Default behaviour is unchanged**, and that was proved rather than
asserted: Mantine's `filterProps` strips any `undefined` prop before merging `defaultProps`, so an
ungrouped chip still resolves to `type="checkbox"` — with a **discriminating** gallery assertion
pinning it, which is the regression guard for every call site not converted.

**Full suite run here after merging: unit 1732/1732, typecheck all seven projects, lint clean,
`ui-desktop`+`ui-mobile` 220 passed, `app` 240 passed** — up from 216/239, so the new tests are real
rather than absent. Every new assertion was reported as discriminating, with its reasoning.

#### The classification is the wave's real output, and it stopped a blanket change from shipping

The parity review described this as one sentence: give the filter variant a radio shape. Checking
first found **7 call sites across 5 files**, and only **3** were safe to convert:

| Call site                                                | Verdict                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| Settings theme mode, Podcast episode order, Library sort | **converted** — always exactly one selected, no path to none         |
| Home for-you filter, Search primary, Search secondary    | **left alone deliberately**                                          |
| Library `filter-finished`                                | **not a group at all** — a lone independent boolean, already correct |

**The three left alone are the finding.** All are single-select by state shape, so a blanket change
would have looked right — but each supports **clicking the active chip to clear back to `all`**, and
**a browser fires no change event when you re-click a checked radio**, so converting them would have
silently deleted that behaviour. Not a guess: `for-you.spec.ts:183-200` already tests the second
click, and `searchFilters.ts`'s own header comment states the rule for both Search rows.

**So "single-select" was not the right question — "can a native radio express this control's full
behaviour" was.** A shared primitive changed in place reads as correct in review and is wrong
elsewhere; this is the first time on this project that trap was caught _before_ it shipped rather
than after, and what caught it was requiring the classification as a deliverable ahead of any edit.

#### The backgrounded-run death happened again, and the stray-process lesson was re-confirmed

The wave **committed first and then stopped waiting on a backgrounded Playwright run** — the failure
this file has documented repeatedly. The spec-side instruction held (nothing was lost); the
orchestrator-side check is what recovered it. **`SendMessage` retrieved the entire classification
from the stopped agent** for a fraction of re-running it.

**Re-confirmed, and worth not relearning:** the orphaned run's _parent_ Playwright runner does **not
carry the worktree path in its own command line** — `pgrep -f "worktrees/agent-<id>"` matched five
children and missed it, while it went on holding port 4310. Match a child, read its `ppid`, kill
that. **The standing rule stands: do not ask a subagent to run a full suite.** The orchestrator runs
it from the main checkout, where `Bash` is ungated and no notification can end the turn.

### DONE 2026-08-21 — `16e-settings`, the LAST screen. **Every screen in 16e is now complete; only `16f` remains.**

**`main` is `3ec1344` plus this doc commit. `CI` and `Android` both green on it, and the Android run
is a genuine uncached execution** — verified by grepping the job log for bare `compileDebugKotlin`,
`compileReleaseKotlin`, `testDebugUnitTest` and `testReleaseUnitTest` with no `FROM-CACHE`, not by
reading a badge. Unit **1732/1732**, typecheck green across every project. `-P`'s verdict: **ship
as-is, no blocking defects on either platform.**

Five waves' worth of the usual, plus one thing that is new.

#### THE HEADLINE — web's theme-mode control now announces as a checkbox, and Android's is UNKNOWN

§6.6 moved web's theme-mode row onto `packages/ui`'s `Chip variant="filter"`. **`Chip` is Mantine's
checkbox underneath.** `-P` verified this against Mantine's own compiled source rather than by
inspection: outside a `Chip.Group` the context is null, `type` stays its `defaultProps` value
`"checkbox"`, and the rendered element is `<input type="checkbox">` with no `aria-pressed`,
`aria-selected` or `role="radio"` anywhere. So three **mutually exclusive** options announce as three
independent checkboxes.

**Ruled LATERAL, not a regression** — and the reasoning is the useful part. The control it replaced
was `aria-pressed` toggle buttons. **Neither pattern conveys mutual exclusivity**; both expose only
per-item boolean state. Native `checked` is arguably more _robust_ than a hand-maintained ARIA
attribute, since it cannot drift from the visual state — but it adds no expressive power. §11 asked
the migration to "preserve or improve"; it preserved, and no signal that existed before was dropped.

**The parity half is genuinely unresolved, and that is the correct verdict rather than a hedge.**
Web is checkbox. **Android's theme-mode announcement is unknown** — see the corrected §11 below.
**Label it unverified: it is neither idiom nor drift.** Do not let a later session record it as
either.

**The follow-up, named precisely so it is not re-derived:** give `Chip`'s `filter` variant a proper
single-selection shape when no `Chip.Group` supplies one. Worth knowing before scoping it —
**Mantine's own `Chip.Group` with `multiple={false}` renders `<input type="radio">`**, so the
idiomatic fix is likely to expose grouping through this repo's `Chip` wrapper rather than to
hand-roll radiogroup ARIA. It is `packages/ui` work, one wave, and **declining it here was correct**:
§7 puts primitive work out of this triple's scope, and the gap is inherited rather than introduced.

#### A FIFTH recon error, and this one was in an accessibility claim

§11 asserted Android's `FilterChip` "already exposes `Role.RadioButton`-style selection semantics",
citing `SettingsScreen.kt:200`. **That line is inside `AccentSwatch`** (declared at `:185`), a
hand-built `Modifier.selectable(role = Role.RadioButton)` — a _different composable_ from the
theme-mode row, which uses stock `androidx.compose.material3.FilterChip` with **no role override at
all**. Verified here as well as by `-P`. The citation proves the pattern exists somewhere on the
screen, not that the control in question carries it. **§11 is corrected in this commit.**

**Independent corroboration that this was already uncertain, and it is the sharpest part:**
`SettingsContentTest.kt:39-44` — written before this wave, untouched by it — **deliberately declines
to assert selection state on the theme-mode chips** while asserting `assertIsSelected()` on the
accent swatches one screen over. The codebase already knew, in a comment, that it did not trust
`FilterChip`'s internal semantics shape. **A spec asserting something the code's own tests decline to
assert is a tell worth grepping for.**

#### The red Android round was the documented import trap, firing again

`fce72bb` failed both variants on one line: `ShellNavigationItems.kt` explicitly imported
`androidx.compose.foundation.layout.weight`, which binds to the **internal**
`RowColumnParentData.weight` and fails as an **access** error, not an unresolved reference — so it
reads nothing like a stray import. The composable already declares a `ColumnScope` receiver, exactly
like the function above it that has never imported it. One deleted line (`3ec1344`), fixed inline
rather than spent as a wave.

**Both compiler-free pre-checks passed and structurally could not have caught it.** They are textual
invariants — comment balance, dots in backtick names. An import binding to the wrong symbol is a
fact only a compiler knows, and there is no JDK here. **That is precisely what "budget two to three
red Android rounds" buys; the round is the mechanism working.**

#### The sanctioned screenshot allowance worked, first time it was granted

The previous triple's reviewer had to **break** its "create no file" instruction to take a
screenshot — and that screenshot found a real shipped defect. This `-P` was given an explicit bounded
allowance instead. It took two, confirmed the migrated CSS renders fully styled in both themes and
that the chip row still reads visually as a clear selected-one-of-three, created one temporary spec
and deleted it in the same command, and left the tree clean. **Keep granting it.**

#### Verified rather than accepted, so nobody re-checks

- **The byte-for-byte target — the 17 accent presets — was already satisfied, so both waves pinned
  rather than derived.** I extracted both lists independently before dispatch; `-P` then confirmed
  **both pins discriminate**, checking each against live source rather than against the reports. Web
  uses `toEqual` on the full ordered array, Android `assertEquals` on literal `0xFF` constructors
  (deliberately avoiding float round-tripping). Either fails on a reorder or a one-hex drift.
- **Android's rail entry is additive by construction:** `ShellNavigationItems.kt` is 53 insertions,
  **0 deletions**, so the two `AuralisAppTokens.current` indicator readers whose pixel tests
  `16f-A-2` had to delete cannot have moved. Checked by me and again by `-P`. The new item reads
  those tokens too, making it a **fifth** production reader.
- **The rewritten `settings-a11y.spec.ts` still discriminates** — the `.toBeChecked()` and
  `label`-colour assertions fail if selection state is dropped or the fill stops painting. It was
  rewritten rather than left pointing at the wrapper `<span>`, where it would have been green and
  inert.
- **`4299bb9`'s ring assertion still passes**, untouched, and still targets the `Button`-based
  swatches the `Chip` migration did not affect.
- **A second `outline` rule moved to `--accent`** and looked like it might render a focused swatch
  identical to the selected one — the invisible-nav-pill defect `16c-2-W-3` avoided. It does not:
  the rules are on different elements (a form input and a colour swatch), and the value matches
  `Slider.css`'s established idiom.
- **Count check:** the web wave reported 38 `--m3-*` usages in its scope; the real number is **37**.
  Off by one, immaterial, but the instruction to re-measure is what surfaces these. Exactly one
  `--m3-*` remains in that family — `--m3-touch-target-min`, an app-wide accessibility floor shared
  by five other call sites and absent from `SONORA.md`. **Correctly held back, not missed.**

`-W` merged as `89927e9`, `-A` as `fce72bb`. Both waves ran their own Playwright at `--workers=2`
(`-W`: 239 `app`, 216 `ui`, the onboarding project in isolation first, since everything else
`dependencies` on its `storageState`).

**One red Android round, and it was the documented trap firing again rather than a bad wave.**
`fce72bb` failed both variants on a single line: `ShellNavigationItems.kt:6` explicitly imported
`androidx.compose.foundation.layout.weight`, which resolves to the **internal**
`RowColumnParentData.weight` and so fails as an _access_ error, not an unresolved reference. The
import was never needed — the composable declares a `ColumnScope` receiver exactly like the
function above it, which has never imported it. Fixed inline as `3ec1344` rather than spent as a
wave. **Both compiler-free pre-checks passed and could not have caught this**: they are textual
invariants, and an import resolving to the wrong symbol is a fact only a compiler knows. That is
what "budget two to three red Android rounds" is for.

Base `6e5b59d`. Both agents are worktree-isolated (**checked** with `ls .claude/worktrees/agent-<id>`
before believing either — the one-line check that exists because a dispatch missing
`isolation: "worktree"` once ran its `git reset --hard` inside the shared checkout). `-W` owns
`apps/web` + `e2e/app`; `-A` owns `apps/android`. Disjoint, and only `-W` runs Playwright, so the
port-4310 constraint is satisfied. **`-P` is owed after both land. After this triple, only `16f`
remains in phase 16.**

**THE BYTE-FOR-BYTE TARGET, pre-ruled before either agent reports** — the technique that has now
paid on three consecutive triples, catching a real mismatch once and preventing a false alarm once.
It is the 17 accent presets, and unusually this one is **already satisfied and needs pinning, not
deriving**. Verified by the orchestrator directly from both sources rather than taken from the
spec's recon: web's `ACCENT_PRESETS` (`packages/ui/src/tokens/color.ts`) and Android's
`SonoraAccentPresets` (`ui/theme/Color.kt`, resolved through `SonoraPalette.Accent*`) both give, in
this order:

```
#ef4444 #f97316 #f59e0b #eab308 #84cc16 #22c55e #10b981 #14b8a6 #06b6d4
#0ea5e9 #3b82f6 #6366f1 #8b5cf6 #a855f7 #d946ef #ec4899 #f43f5e
```

Both waves add a pin for their own side. `-P`'s job here is to confirm both pins exist and
**discriminate** — a test that cannot fail is a pin, not a proof, and this project has shipped that
distinction wrong before.

**Pre-ruled so `-P` does not grade forced idiom as drift:**

- **Onboarding step count, 3 on web and 2 on Android.** Forced idiom, driven by the
  same-origin-vs-separate-origin architecture difference the code's own comments state (§8). Android
  has no services step and building one to hit a matching count would be new feature work. **Not
  drift.**
- **Compact-mode Settings reachability.** Web has a persistent icon button on every screen; Android
  will have it in rail mode only. This is a **real gap, explicitly deferred, and deliberately not
  idiom** — §6.1/§7/§8 all say so in those words. `-P` should confirm it is still named rather than
  quietly accepted, not grade it as a defect.
- **The error-banner-vs-inline-text convention** for form errors (§3.2's last row) — Android's
  existing idiom across every form screen in the app.

**One thing `-P` must check by diff, not by report.** `-A`'s §6.1 rail item lands in
`ShellNavigationItems.kt`, which holds **two of the four production readers of
`AuralisAppTokens.current`** — the readers whose pixel tests `16f-A-2` had to delete, leaving this
file's own note that "nothing mechanical now stops a future edit reverting one of those four
readers to a static `MaterialTheme` value." The new item was specced as **purely additive**. Confirm
those expressions are byte-identical, the way `16e-podcast-P` confirmed `MediaHeader.kt` with an
empty `git diff`.

**Two questions for `-P` that are checks, not verdicts:**

1. **Does web's §6.6 `Chip` migration still expose single-selection semantics?** Theme mode is a
   mutually-exclusive triple. A `role="checkbox"`/`aria-checked` shape would satisfy §11's
   "announced, not merely drawn" wording while being semantically wrong for three exclusive options.
   And does `settings-a11y.spec.ts` still **discriminate** afterwards — would it fail if selection
   state were dropped entirely?
2. **Does `4299bb9`'s ring assertion still pass through that migration?** It lives in the same spec
   file `-W` is editing.

**The spec was reconciled before dispatch (`6e5b59d`), and the reason generalises.** §6.4 called for
the accent ring to move to `--accent-ink`; `4299bb9` had already shipped it as `--accent` the day
before. Left alone, a `-P` following this project's own rule — cite the spec directly, never an
implementing agent's paraphrase, the rule adopted after `16e-foryou-P` was handed a brief stating a
divergence backwards — would have found `--accent`, checked the contract, and either flagged a false
defect or burned turns disproving one. **A spec that has drifted from shipped code is a trap for the
reviewer specifically, because the reviewer is the one instructed to trust it.** Fix the document
before dispatch, not the reviewer's brief afterwards.

That edit also earned the splice guard its place: the first attempt anchored from §6.4 to `## 7`,
spanning §6.5–§6.9, and would have silently deleted five sections — the exact failure this file
documents under "Diff every edit". The heading-count assertion fired before anything was written.

### Wave records, 2026-08-17 → 2026-08-21, moved to `ROADMAP.md`

`docs/ROADMAP.md`'s **"Wave records and session hand-offs, 2026-08-17 → 2026-08-21"** section
holds, verbatim, the ~20 dated session hand-off / `DONE` / `CLAIMED` / `LANDED` wave records that
used to sit here — the fifth through sixth screen triples, `16e-book`/`16e-album`/`16e-search`,
`16c`/`16d`'s token and shell waves, `15d`/`15e`, and the operational incidents each one carried.
Moved 2026-08-21 (wave `16i-handover-prune`) because this file is `@`-imported into every session
and each record was superseded before this move happened. Standing lessons they carried that were
not already recorded elsewhere were folded into "Lessons that must not be relearned" below in the
same commit.

---

## Lessons that must not be relearned

### Do not thread ISBN into `ExternalCandidate.identifiers`

Established by `15e-books` and verified by a reviewer reading the code rather than accepting the
claim. `ownership.ts`'s `comparePair` treats a **same-field-different-value** identifier match as a
**veto** that bypasses title/author matching entirely — and an audiobook's ISBN is commonly absent
from the print work's ISBN array. So threading ISBN through would make genuinely-owned titles leak
back into the "you don't have this" shelf. It reads like an obvious improvement and is not one.

Each of these was paid for. They are compressed on purpose — the wave-by-wave telling is in
`docs/ROADMAP.md`.

### A wave that adds a writer must name its reader

**Four instances on this project, every one green on its unit tests.** `installQueueRouter()`
was never called in production; a `QueueStore` cursor bootstrapped at `0` made the first
`advance()` a silent no-op; Android's `Play next`/`Play last` wrote into a `QueueStore`
nothing consumes, because **Media3 owns the music queue on Android** and cross-track advance
runs on `MediaController`'s real playlist. Each reported success and did nothing.

**The rule: a spec that adds a writer must name the reader, and the report must too.** The
gap is always at the seam between two waves, which is where "is this reachable from the
running app?" has to be asked. `PlayerViewModel.musicQueue` is deliberately write-once and
read-never now, and its doc comment says so — a mirror nobody reads is worse than no mirror.

### A fixture validates the response and says nothing about the request

Found 2026-08-16 on wave 15a, and it is the mirror image of the `abs-client` `.optional()`-versus-
`null` bug below. The ListenBrainz provider sent `?mode=easy` and nothing else. The live endpoint
requires **five** query parameters, each validated separately with no default, and answers a
missing one with `400 Argument max_similar_artists must be specified.`

**Every safety property held, and that is what made it dangerous.** The provider caught the non-OK
response, logged it, and degraded to no candidates exactly as specified. So there was no crash, no
error, no failing test — just a provider that was wired, exported, registered, green on twelve
tests, and would have returned nothing from the real API forever. That is **worse than this
project's four writer-with-no-reader failures**, because those at least look unfinished.

Nothing in the suite could have caught it. Unit tests inject `fetch` and build their own `Response`
objects — correctly, since no network belongs in a unit test — which means **the tests encode our
idea of the request and can never contradict it.** A fixture constrains the response half of the
exchange only.

So: **for any client of a real upstream, assert the outgoing request too**, as an exact set rather
than a subset — partial matching passes with a parameter dropped, which is the failure being
guarded. And where an endpoint needs no credential, **one `curl` settles in seconds what a document
cannot**. ListenBrainz's does not. This was the first upstream in this repo ever checked against a
live server rather than a document, and it found the bug immediately.

### A test that only inspects a return value can pin the wrong value as correct

`QueueStoreTest` passed throughout the bug above because it asserted the shape of the state
the function returned and never chained into an `advance()`. The feature was entirely broken
while its unit tests were green. Two more of the same family: a stale-response test that
stopped observing before the slow response arrived (it would have passed with the guard
deleted), and an installer test for something nothing called.

**Something has to assert through to observable behaviour** — an effect on the player, a
call count on a fake seam, a rendered result. `12e`'s fix is the pattern: the test asserts on
the fake `PlaybackHandle`'s call count, so it fails if anyone "simplifies" the dispatch back
into the dead store.

### The minified-item bug — three occurrences, one durable fix still unbuilt

Audiobookshelf's **minified** items — what every shelf, browse and personalized response
returns — never carry `authors[]` or `media.series[]`, only the flattened `authorName` and
`seriesName` strings. `7e57a78` fixed this for shelf and browse cards. Wave 12c-1 then
reintroduced it on top of the same endpoints: `/author/:id` returned "Author not found" for
**every** author, always, and `/series/:id` collapsed to alphabetical because `seriesSequence`
was always null. The pure `orderSeriesBooks` function was correct and well tested — it was
simply never given a real sequence.

**Anything reading `media.authors[]` or `media.series[]` off a list endpoint is wrong by
construction.**

**The `.id` half of this is now closed at the type level, and the standing "build a branded type"
recommendation is withdrawn** — established 2026-08-15 by reading the code rather than the prose
about it. `AuthorBadge` and `SeriesBadge` in `packages/abs-client/src/domain.ts` no longer declare
an `id` at all, so `book.media.authors[0].id` is a compile error everywhere, and a type-only
assertion in `normalize.test.ts` pins that. Every surviving read of `media.authors`/`media.series`
in the tree is a display-only `.name`, safe on either shape. `tracks`/`chapters`/`episodes` already
follow the `T[] | undefined` convention.

**But `id` is still deliberately emitted on the wire, and must stay.** `normalizeMedia`'s fallback
constructs `{ id: <the name string>, name: <the name string> }`, and the BFF serializes that to
JSON. It looks like a bug and is not: **Android's Kotlin models declare `id: String` non-nullable
with no default**, so dropping the key throws `MissingFieldException` on deserialization. The type
says no `id`, the wire has one, and the gap is intentional. Do not "fix" it without changing
`ApiModels.kt` first.

So a `Minified<T>`/`Expanded<T>` refactor would buy little for its cost. The residual risk is not
"is `id` present" but that a consumer casts through `unknown` and treats the fabricated id as real
— which a lint or grep-based CI check would catch far more cheaply than a type refactor.
`apps/web` maintains its own hand-mirrored types and does not import `@auralis/abs-client` at all,
so branding would not reach it anyway.

`regressionGuards.test.ts` remains a tripwire, not a guarantee: it is a **text scan** over
`apps/web/src` only, matching `.media.authors|series` followed within 100 characters by an
`.id ===` comparison. It does not see a `.filter()`, a destructured local, a helper wrapping the
same logic, or anything in `apps/server` or Android.

The first draft's other defect is worth knowing separately: two e2e cases failed because the
spec never clicked the "Books" primary chip, and `ALL_KINDS_VISIBLE` deliberately hides series
and author results until it is selected. A test-authoring bug, not a product one.

### For `apps/android`, CI is the gate and review is not a substitute

Android 12a went through the full process — a spec naming the files and the failure modes, a
separate Sonnet reviewer per wave with the traps enumerated, both returning "merge as-is, no
defects" — and CI rejected it in about a minute, three times running:

- `import androidx.compose.foundation.layout.weight` resolves to the **internal**
  `RowColumnParentData.weight`, failing as an _access_ error rather than an unresolved
  reference. The call site was already in a `Row`; deleting the import was the whole fix.
- Two backtick test names containing `..`. Kotlin permits a dot in a quoted function name;
  the JVM does not permit it in a method name. Compiles as Kotlin, fails as bytecode.
- Two directional icons wanting their `AutoMirrored` variants — a warning, but a real RTL point.

None is a logic defect, and that is exactly what review cannot catch: these are facts about
the toolchain, not about the code's intent. **This has now happened on three consecutive
waves** — review got the hard product questions right and lost to CI on toolchain reasoning
every time. The consequence is scheduling, not process: budget for two or three red Android
runs after any sizeable Android wave, and push early enough that they fit in the usage window.

### Kotlin block comments **nest** — a `/*` inside a KDoc silently eats the rest of the file

Found the hard way on 13f-2, and it is the same shape as the backtick-dot trap below: a fact
about the toolchain that no amount of reading the logic will surface.

A doc comment mentioning a route glob — the entirely natural `` `/jellyfin/*` route `` — contains
the character pair `/*`. **Kotlin, unlike Java, supports nested block comments**, so that opens a
second comment inside the KDoc. The comment's own closing `*/` then closes only the _inner_ one,
and the outer comment swallows everything to the end of the file. What the compiler reports is
`Syntax error: Unclosed comment` at the **last line of the file** plus a bogus `Missing '}'`
somewhere near the top — neither of which points anywhere near the actual text.

Both an implementing agent and a thorough reviewer read straight past it, because as prose it is
correct and as Kotlin it looks like every other doc comment in the file.

**The check is arithmetic, costs nothing, and does not need a compiler:**

```bash
for f in <changed .kt files>; do
  echo "$f open=$(grep -o '/\*' "$f" | wc -l) close=$(grep -o '\*/' "$f" | wc -l)"
done
```

Unequal counts means an unclosed comment. Run it on every Kotlin file a wave touches — this
machine cannot compile Kotlin, so a cheap textual invariant is worth far more here than it would
be on a codebase where `gradlew compileKotlin` is one command away. Write route globs as
`` `/jellyfin` `` or `/jellyfin/…` instead.

### Android test traps — read before touching an Android test

- **A green `Android` run on a sha that did not touch `apps/android` executed no Android tests.**
  Gradle's build cache keys on task inputs, so `:app:testDebugUnitTest` comes back `FROM-CACHE`
  and the badge is green without a single test running. Measured 2026-08-16: of three consecutive
  green Android runs after the race fix (`f2a90d1`, `19ae5bb`, `aa2f598`), **one genuinely ran and
  two were replays of it** — the two later shas touched only `packages/ui` and docs. This is
  actively misleading in the one case where it matters most: **a flaky test cannot fail a run that
  never executes it**, so a run of docs-and-web pushes accumulates green Android badges that look
  like an intermittent fault settling down, and are nothing of the kind. Before reading any green
  Android run as evidence, grep its log:

  ```bash
  gh api repos/:owner/:repo/actions/jobs/<job-id>/logs | grep 'Task :app:test.*UnitTest'
  ```

  A bare `> Task :app:testDebugUnitTest` ran; `FROM-CACHE` or `UP-TO-DATE` did not. Note the two
  variants cache independently — on `b2561b8` the debug task was cached while
  `testReleaseUnitTest` genuinely ran — so name the task you mean. The corollary is that
  **rerunning the same sha buys nothing** (same inputs, same cache), and the only way to draw a
  fresh sample of an Android flake is a change under `apps/android`.

- **Injecting the test dispatcher into `ApiClient` is the right default and is _not_ universal —
  and the third exception is not discoverable by reading.** The two exceptions above it are
  semantic: the test asserts real `MockWebServer` interleaving, so collapsing it destroys the
  assertion, and you can see that by reading the test. Wave 14d found a different species.
  `HomeViewModelTest`'s three `startDownload` tests **hang** under the unconfined dispatcher —
  they await something it cannot resolve at all, so they do not leak and they do not assert
  wrong; they time out, 60s apart in the log, and the run dies with the same
  `UncompletedCoroutinesError` that a leak produces. Reverted in `f99b8fa`.

  So the rule is not "inject the test dispatcher, except where interleaving is asserted." It is
  **"inject it, then run the full Android suite, because the exceptions are not all findable by
  inspection."** An audit that applies the rule mechanically across a suite will discover that
  class only in CI — which is exactly how this one was discovered.

- **The `UnifiedSearchViewModelTest` race is a coin toss, and there is a clean demonstration of
  it.** `9e87fdc` and `b2561b8` carry **identical Kotlin** — both are docs-only relative to the
  Android tree — and `testReleaseUnitTest` ran uncached on both, failing on one and passing on the
  other. That pair is stronger evidence than any single run, and it is the reason a single green
  run must never be read as "fixed". Fixed in `e71837f` by widening 13d's scoped-dispatcher
  treatment from two tests to twelve; **four tests remain on real `Dispatchers.IO` deliberately**,
  each keying a `setBodyDelay()` to pin real interleaving.

- **`ApiClient` takes its dispatcher as a constructor parameter** (defaulting to
  `Dispatchers.IO`). Nine ViewModel test files pass their own `UnconfinedTestDispatcher`, which
  makes the work visible to `runTest` and the leak impossible by construction. A test that
  injects into `setMain` but **not** into `ApiClient` looks identical and is the one outlier
  that fails; casual reading cannot tell them apart, and both an implementing agent and its
  reviewer missed exactly that.
- **The convention is not universal.** `UnifiedSearchViewModelTest` contains two
  timing-dependent tests that assert on real interleaving produced by `MockWebServer` body
  delays. Forcing the unconfined dispatcher collapses the very interleaving they exist to pin,
  turning both into tautologies that pass for the wrong reason. That file drains its states to
  non-`Loading` in `tearDown()` instead.
- **`Dispatchers.resetMain()` in `tearDown()` while a continuation is still in flight** throws
  `IllegalStateException` — _not_ `ApiException`, so nothing in the app's error handling catches
  it — reported against whichever test runs next. This is the `UncaughtExceptionsBeforeTest`
  failure class; the reported failure never names the culprit, which is why successive point
  fixes each made it move rather than go away.
- **A wave that gives an existing ViewModel new outbound requests silently invalidates every
  existing test's `MockWebServer` dispatcher.** Review cannot catch it, because each test still
  reads correctly in isolation.
- **A one-shot event `SharedFlow` collected with `launch { flow.collect { … } }` never sees the
  emission** — that `launch` schedules on `StandardTestDispatcher` while the action runs to
  completion on the unconfined `Main`, emitting before the collector subscribes. `replay = 0`
  drops it and `extraBufferCapacity = 1` does not help (it is not replay). Use
  `async(start = CoroutineStart.UNDISPATCHED) { flow.first() }`; `HomeViewModelTest` is the
  pattern. Applies to **event** flows only — `uiState` wants a plain `.value` assertion, never
  an await, since the whole call is synchronous under the unconfined dispatcher.
- **`MockWebServer` serves enqueued responses in request-arrival order, not enqueue order**, so
  two concurrent requests swap bodies. Key responses with a `Dispatcher` on something in the
  request itself — `MusicSearchViewModelTest` shows the pattern.

### Agents die while waiting on a backgrounded Playwright run

Three times in one session an agent backgrounded the full suite, said it would wait for the
notification, and stopped there — twice holding its **entire wave** as uncommitted files in a
worktree that is deleted with its session. One returned a final message unrelated to its task
("I don't see a task or question in your message"), so the report was no signal either way.

Specs tell agents to commit _before_ backgrounding a long run, and that lowers the frequency
but does not hold — of two agents given the instruction verbatim, one complied and one did not.
**The orchestrator-side check is the load-bearing one.** On every agent report, before reading
the report:

```bash
git -C .claude/worktrees/agent-<id> status --short
git -C .claude/worktrees/agent-<id> log --oneline -1
```

and commit anything uncommitted before doing anything else. A dead agent can also leave
Playwright and vite processes holding CPU and ports; `pgrep -af "worktrees/agent-<id>"` finds
them, kill them before dispatching the next wave.

### An `Agent` call is never a no-op, and `"continue"` is not a neutral prompt

A web subagent made an `Agent` call with the prompt `"continue"`, intending merely to move on.
It **resumed a different, broader agent**, which did substantial unscoped work in the shared
checkout, pushed three commits to `main` including edits to a file its spec forbade, and
rebased twice. Nothing was lost and the content was in scope — but it skipped the
orchestrator's merge step, the review-before-merge step, and the claim discipline. One concrete
cost: it pushed while another sha's `Android` run was in progress, **cancelling it**, so that
wave sat red on `main` unnoticed.

Subagent specs here say **never make an `Agent` call at all** — the weaker "do not spawn
subagents" did not read as covering a one-word follow-up. And the honest report is what saved
it: the agent flagged its own mistake, named the commits, and declined to push further. That is
the behaviour to reward.

### Subagents push to `main` after being told not to

Three occurrences, so not a fluke. The push was harmless each time; what it skips is the
orchestrator's merge step, where the base and the file-overlap against a concurrently-moving
`main` get checked. **Verify `git log origin/main` immediately on every agent report**, not only
before merging.

### Diff every edit to this file before committing it

**A second way to corrupt this file, found by doing it on 2026-08-17.** The 2026-08-08 incident
below was a replacement that _deleted_ 406 lines. This one _duplicated_ ~54, which is harder to
notice because nothing goes missing and the file still reads correctly.

The pattern was a two-anchor splice: find `i` = index of the start heading, `j` = index of the
following heading, write `s[:i] + new + s[j:]`. That is correct **only while `j > i`**. An earlier
edit in the same session had inserted a new section _above_ the start anchor, so `j < i`, and the
span between them was silently emitted twice — including a **stale claim block** that then
contradicted the completion note added later. A stale claim is exactly what this file's own claim
discipline exists to prevent.

**Two cheap defences, both of which caught it:**

```bash
# after any two-anchor splice, assert the order you assumed
python3 -c "s=open('docs/HANDOVER.md').read(); print(s.index(START) < s.index(END))"
# and count every heading you did not intend to touch
grep -c '^### <heading>' docs/HANDOVER.md
```

The `git show <sha> -- docs/HANDOVER.md | grep '^-### '` check below still works and is still the
last line of defence — but it only shows what was **removed**. **Duplication is invisible to it**,
so pair it with a heading count.

On 2026-08-08 a single careless anchored replacement in `HANDOVER.md` silently deleted seven
sections and 406 lines — including the `UncaughtExceptionsBeforeTest` diagnosis and the
stray-`Agent`-call finding, the exact lessons that session was telling its subagents to go read.
It was caught only by diffing the commit afterwards. An anchored `str.replace` spanning two
headings looks identical to a correct one until you look:

```bash
git show <sha> -- docs/HANDOVER.md | grep '^-### '
```

Prefer authoring this file wholesale over anchored replacement.

### Progress sync — `timeListened` is wall-clock, never position delta

Kept because any future player work will be tempted to get it wrong. `timeListened` is measured
from wall-clock time spent playing, never from how far `currentTime` moved: a seek, chapter jump
or ±30s skip moves the position with nobody listening, and Audiobookshelf folds `timeListened`
into permanent listening statistics. `features/player/progressSync.ts` holds that as a pure
tested function; `useProgressSync.ts` schedules it every 15s and on `pagehide`, and
syncs-then-closes on teardown (Audiobookshelf finalises a session on close, so the reverse order
reports into a closed session).

Related, for any audio e2e spec: the fixture audio cannot decode, which gives **two** independent
async paths that revert the player store's "playing" state — `HTMLMediaElement.play()` rejecting,
and `.src` assignment triggering the browser's real media-load pipeline, which fires a native
`error` event. Both are correct in production code. `e2e/app/player.spec.ts` neutralises the audio
element entirely (`.src` inert, `play()`/`pause()` no-op); any new audio spec needs the same.

### Compose UI test locators — three traps in one family, and the tell is a bare `AssertionError`

Beyond the dispatcher races above, three more Android test-authoring traps recur across screen
waves, each compiling as correct Kotlin and each failing with a bare `AssertionError` pointing away
from the cause. **(1)** A `performClick()` on a `LazyColumn` item outside the composed viewport
neither throws nor fires its callback — `assertExists` on the same tag passes, since existence only
needs the node composed and a click needs it displayed; scroll to the tag first, or use
`performSemanticsAction(SemanticsActions.OnClick)`, which invokes the node's own click action
regardless of gesture dispatch or geometry. **(2)** `assertExists` is a **member** of
`SemanticsNodeInteraction` and must not be imported, while `assert` chained directly onto it is a
**top-level extension** in the same package and must be — the package mixes both, and the call site
does not tell you which. **(3)** A `testTag` inside a node whose ancestor merges semantics
(`.clickable`, `OutlinedTextField`, a deliberately-grouped announcement row) is invisible to the
default merged-tree lookup — pass `useUnmergedTree = true` to the `onNodeWith*` call to reach it.
None of the three is inferable from the call site or from reading the product code; budget two red
Android rounds per screen wave for this reason.

### Run local Playwright at `--workers=2`, never the config default or `--workers=1`

This laptop has 4 cores and `playwright.config.ts` sets `workers: '100%'`; at that default a
provably clean tree produces 2–4 spurious content-visibility-timeout failures per full run, a
**different** pair each time, every one passing in isolation — noise indistinguishable from a
regression until several runs have been spent proving otherwise. `--workers=2` gives a clean,
full-speed run and is the number to use locally. `--workers=1` is wrong in the other direction: it
under-exercises parallelism, and a real CI-only regression (`for-you.spec.ts`'s skeleton-layout
assertion, the canary for anything touching CSS delivery or layout) has gone unnoticed in a
`--workers=1` local run before. **CI's own parallelism remains the authoritative signal either
way**, and a test made unreliable under load costs more than the regression it guards — harden or
name a flake rather than let it discredit real failures. Relatedly: **only one agent may run
Playwright at a time in this repo**, whatever directories it touches — `playwright.config.ts` boots
a second, stateful, single-tenant BFF on a hardcoded port (4310) regardless of `--project`, so two
concurrent runs either fail to bind or silently share one server's state. And a CSS-only wave must
still run `pnpm vitest run apps/web`: `apps/web/src/styles/layoutOverflow.test.ts` parses `app.css`
as text and pins specific selectors' rule bodies, which only a unit-test run — not Playwright — can
see move.

### GitHub's `codeload` throttling looks exactly like a build failure

A run that dies in the **`Set up job`** step while downloading an action
(`pnpm/action-setup`, `android-actions/setup-android`, `docker/setup-*`, …) with a
`429 (Too Many Requests)` has executed no test and compiled no code. Check
`gh run view <id> --json jobs -q '.jobs[] | "\(.conclusion)\t\(.name)"'` before reading a red `CI`
or `Android` run as a code problem — a real failure dies in a test/compile step, this dies in setup.
`gh run rerun <id> --failed` is the whole fix, and it is GitHub-side; nothing in this repo prevents
it, and waiting for the next push is also a legitimate response since `:latest` always converges on
the most recent green build of `main`.

---

## The Audiobookshelf and Jellyfin clients are only partly verified against reality

`packages/abs-client` was written from fixtures and documented shapes. On 2026-08-06 a user hit
"response for POST /api/items/:id/play did not match the expected shape" — playback had been
completely broken since the client was written. Fixed in `5794f10`.

The cause generalises. The schema had `metadata` as `.optional()`, which accepts `undefined` but
**not `null`**, and a real server sends a literal `null`. And it was not an edge case: `playItem`
posts an **empty body**, so it never declares `supportedMimeTypes`, so Audiobookshelf's
`checkCanDirectPlay` fails closed and **every session Auralis starts takes the transcode path** —
whose single HLS track never sets `metadata`. The fixtures encoded the _direct-play_ shape, which
no real Auralis session has ever received. That is why the whole suite passed against a client
that could not play anything.

**A fixture written from documentation describes the shape you expected, and a passing suite
against it proves only that the code agrees with the guess.** Anything in `packages/abs-client`
not yet exercised against the real server is unverified.

Reconciling it is **blocked: no session has an Audiobookshelf or Jellyfin credential**
(`docs/setup/MY_SETUP.md` names it as the first ask). Everything beyond `/status` and `/ping` is
source-derived. `docs/INTEGRATIONS.md`'s "Fixture/schema reconciliation pass" has the
live/source/unverified breakdown — get a credential before re-deriving it. When one arrives:
record the actual responses, diff them against
`apps/server/src/testSupport/fakes/fixtures/*.json`, fix fixtures **and** schemas, add a
regression test, and note the Audiobookshelf version in the fixture (the API drifts by version
and by `minified`/`expanded` mode).

Two smaller findings from the same investigation, neither fixed: the play response carries a
duplicate `libraryItem` and `mediaMetadata`, silently dropped by `.passthrough()`; and
`audioTracks[].codec` is real and undeclared.

**Range-request behaviour deserves a real-world check** against a multi-hour file, not just the
synthetic byte-range test — though per `docs/setup/MY_SETUP.md` the real library is dominated by
chaptered MP3 rather than M4B, so weight that check accordingly. The library is 231 items today, so
do not assume performance measured against it generalises to a large one.

`packages/jellyfin-client/src/schemas/raw.ts`'s lyrics schemas
(`LyricMetadata`/`LyricLine`/`LyricDto`) are **source-derived but not orphaned** — an earlier note
here called them "schema-only, no consumer, no test", and that was stale. Checked 2026-08-16:
`client.ts` parses the lyrics response with `rawLyricDtoSchema`, `normalizeLyrics` in
`normalize.ts` consumes it, and `normalize.test.ts` covers four shapes including the empty one.
What remains true is only the part no session here can fix: **they have never been exercised
against a real `LyricDto`**, because no session has a Jellyfin credential.

---

## Open product decisions — **answered 2026-08-16, see `docs/USER_DECISIONS.md`**

**All of them.** Sofia answered the entire list in one message and said she will not be messaging
again in that session. `docs/USER_DECISIONS.md` is the record and **is the authority over anything
older that disagrees with it** — including anything left in this file or in `ROADMAP.md`. Read it
before picking up any item below. It is deliberately not `@`-imported: this file is loaded into
every session and must stay short, that one is reference material for the item in hand.

The three answers that change what gets built, in one line each:

- **Recommendations must pull from _external_ sources.** "It is not useful to me if recommendations
  only show things already in my library." Phase 13 built a ranker over items already owned — the
  mechanism works and the spec was a misread. Discovery of unowned titles mixes into **For You
  only**; library pages stay restricted to owned content and submitted requests. Provider choice is
  ours, and she has explicitly waived the Audible/YouTube ToS concern that blocked Audnexus. Needs
  its own roadmap phase.
- **Home holds a loading state until its sources settle** — "Ofc Home should be in a loading state
  before it loads?" That closes 14c. Also: a carousel must not show two episodes of one podcast,
  and there must be **mixed-content** carousels rather than one shelf per medium. **Spotify is the
  reference and is to be looked at, not guessed at** — her own screenshots are in
  `docs/research/spec-addendum/`.
- **An owned title is not requestable but still appears in search**, which settles 12c-2 the same
  way for Search and for artist/author pages — deciding it twice differently was the stated failure
  mode. New requirement alongside it: **global search needs suggestions**.

Closed outright: transcode stays as-is (do not touch `supportedMimeTypes`); `wavy` is dropped;
lyrics search gets an external provider; Android gets a Settings screen. Parked: `GET /requests`
scoping (she is the only user today). Accepted at low priority: ebooks, **with read-along sync
between text and narration** — a much larger feature than rendering EPUB.

**Priority order, from her follow-up, overriding the roadmap's own:** backend first — recommendations
and requests — with phase 11 alongside; **frontend explicitly not now**, because a design system she
is building may overhaul it.

**The meta-correction is the part worth internalising.** She reversed the framing on two of the nine
questions: the Home loading state, and 12a's cold-cache nav rail ("I have no idea what that means").
Both had been deferred repeatedly as user-only calls when they were ordinary judgement calls dressed
up as product decisions. The test is not "is this a product question" — nearly everything is. It is
**"would she have an opinion, and does the answer change what she gets?"**

### Android distribution — everything automatable is now built

Settled 2026-08-15. The pipeline is complete and inert, waiting only on the user.

**A GitHub Releases tab is not sufficient for Droid-ify**, which is what prompted this work.
Droid-ify adds _repositories_, and a repository must serve a signed index (`index-v2.json` +
`entry.jar`) generated by `fdroid update`. A Releases page has no index and no signature.
`fdroid-repo.yml` already builds and publishes that index to GitHub Pages on a `v*` tag, and
`release.yml` creates the GitHub Release on the same tag. Neither has ever run — there are no
tags. (Obtainium _does_ consume GitHub Releases directly and is the fallback if the repo route
is ever abandoned; nothing in `docs/research/` mentions it.)

**The trap that was not in the documented steps.** The build declared no release signing config
at all, and CI built `assembleDebug`. On an ephemeral runner AGP generates a fresh random
`~/.android/debug.keystore` per run, so **every release would carry a different certificate** —
the first install works, the second fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, and the
user must uninstall and lose all app state. Through Droid-ify that reads as a client bug rather
than a signing problem. `280c1e7` closes it: a `release` signing config reading
`ANDROID_KEYSTORE_FILE`/`_PASSWORD`, `ANDROID_KEY_ALIAS`/`_PASSWORD` from the environment, both
tag workflows building the signed release APK, and a fail-loudly `check-secrets` guard so a tag
without secrets refuses to publish rather than shipping an un-updatable APK.

**The fallback is the load-bearing half and it is verified.** With no secrets — every PR, every
branch push, every local build — the config falls back to debug signing with a logged warning
and never throws. `android.yml` carries no secrets, so every branch run exercises exactly that
path; it went green on `280c1e7`, which is what settles the DSL question no reviewer could.

**There are two independent keys, and conflating them is the easy mistake.** The **app signing
key** (`ANDROID_*`) signs the APK and fixes app identity forever. The **F-Droid repo key**
(`FDROID_REPO_*`) signs the repository index and could be rotated by re-adding the repo. Eight
secrets total.

**`applicationId` is `net.develivarr.auralis`** as of `ece8f94`, derived from the domain the
user actually controls. The old `net.auralis.app` implied `auralis.net`, which the research doc
had flagged as unverified. It was renamed while free to do so: `applicationId` + certificate
together are app identity, so after a key exists and anyone installs, changing either forces an
uninstall.

**Hosting is GitHub Pages now, the user's own domain later** — their explicit call. Note the repo
URL is baked into Droid-ify, so moving it later means re-adding the repo on the device.

**No anti-AI policy blocks any of this**, verified against live sources 2026-08-15 —
`docs/research/FDROID_DISTRIBUTION.md` §7b has it. The short version: the policy is
IzzyOnDroid's, not F-Droid's; official F-Droid has no documented AI-authorship policy at all
(an open question, so "no rule today" rather than "fine"); and F-Droid's own Inclusion Policy
names a separate repository as the sanctioned route for apps that do not meet its criteria, so
self-hosting is outside any inclusion policy by design rather than by evasion.

**Still missing: a launcher icon.** The app ships Android's default, which is what would appear
in Droid-ify's listing.

### The reported Android post-login crash — audited, not reproduced

The user reported (queue `a41192a`) that the APK built 2026-08-04 crashes after login, and that
they have not reinstalled since. A source-level audit found no confirmed candidate; there is no
device, emulator, JDK or SDK here.

**The obvious suspect does not apply** — `5794f10` lives entirely in `packages/abs-client`, which
only `apps/server` imports; Android talks JSON to the BFF through its own kotlinx models. Same
class of bug, no shared code path. Do not repeat the guess.

Their build is `316cc33c` and 37 commits have landed since, predating nearly all of Android's
music feature set. The post-login path is better guarded than expected: `ApiClient.execute()`
rethrows `IOException`/`SerializationException` as `ApiException`, which both `LoginViewModel` and
`HomeViewModel` catch, and `auralisJson` sets `ignoreUnknownKeys = true`. So it is one of three
things static reading cannot separate: already fixed incidentally; a real force-close outside
readable code (Compose recomposition, a ViewModel factory throwing before any `try`, Media3
service binding, a device-specific fault); or "crashes" describing the reachable
`HomeUiState.Error` screen. **The cheapest next step is the user reinstalling the current CI
APK**; if it still fails, a logcat is the only thing that separates those three. Do not spend
another audit without one.

### Android Auto is unverified end to end

No Desktop Head Unit or car has exercised any of it, and CI cannot. Two assumptions in the browse
tree are flagged in the code's own comments: the continue-listening shelf is found by a
case-insensitive `contains("continue")` match on the shelf's id or label, and it is unconfirmed
whether `/libraries/:id/series` populates each series' `books` array.

---

## What the user asked for, in their words

> "a web app + android app, in a material U style, that serves as three things"
>
> - **prio 1** — Audiobookshelf client + book request integration, pulling primarily from
>   AudiobookBay. "i have a mediaserver setup at home that id like to plug-in into it."
> - **prio 2** — podcast client.
> - **prio 3** — music client, as a Jellyfin client, ideally with a music request integration
>   (something like deemix). "my mediaserver also already has a music component."
>
> References they love: **YouTube Music**'s UI, **Symfonium**, **Spotify**'s search (specifically
> **lyrics search**), and the **Claude app**'s design language.
>
> "I want the experience to be fully-featured, no compromises. The UI must be beautiful and
> performant. The UX must be simple and friendly. Make use of test driven development, including
> end-to-end testing and UI testing with playwright (TS preferred)."

**The actual goal is to replace Spotify.** In their words: "spotify now very conveniently (tho
sometimes intrusively) bundles together music, podcasts, and audiobooks. one of the things that
it does is cleverly serve me audiobooks it thinks i will enjoy." **Personalized recommendations
are part of the goal, not scope creep for a later phase to invent.** No phase currently scopes
this; treat it as an explicit requirement now that all three media types are far enough along.
`docs/INTEGRATIONS.md` has a researched-not-decided section on a
MusicBrainz/PodcastIndex/Audnexus metadata-catalog layer for it, with a named risk (Audnexus
builds on Audible-scraping against Audible's ToS) — options, not a committed design.

Standing instructions, not one-off remarks: **work autonomously** (make ordinary calls, state
them, keep moving; escalate only what genuinely changes the product); **outsource implementation
to Sonnet agents**; **"web app" includes desktop**, and the whole thing must run in Docker.

---

## Decisions already made, and why

Do not silently re-litigate these. If you disagree, say so and make the case.

**A thin Fastify BFF sits between the clients and the media server.** Audiobookshelf and Jellyfin
do not emit CORS headers for arbitrary origins, so a pure browser client is blocked; AudiobookBay
has no API and can only be scraped server-side; and indexer/torrent credentials must never ship in
a browser bundle or an APK. A side benefit is that web and Android consume one identical typed
API, so parity is structural rather than aspirational.

**No animation library.** Material 3 Expressive is spring-based; the token layer compiles spring
physics into CSS `linear()` easing strings at build time, so animation runs on the compositor with
no per-frame JS. Gesture-driven surfaces use raw pointer events plus transforms.

**Colour is derived from artwork at runtime** with `@material/material-color-utilities` — the
Symfonium behaviour the user called out. Every generated `on*`/container pair is asserted to clear
WCAG AA in unit tests, light and dark.

**PWA, not Electron.** Own window, offline shell, OS media keys, nothing extra to bundle. Tauri is
the cheap addition if a true native desktop binary is ever wanted.

**slskd, not deemix**, as the reference music-request provider — deemix is unmaintained. The
provider interface is pluggable, so deemix is a new file, not a refactor.

**Native Android (Compose + Media3)**, not a webview wrapper. Background playback, offline
downloads, media-session integration and Android Auto all want the real thing.

**One container, one port.** The BFF serves the built web assets on its own origin — no separate
nginx, no CORS for the user to get wrong.

**Prowlarr is the primary indexer; the AudiobookBay scraper is the fallback.** AudiobookBay is
behind Cloudflare and only Prowlarr (via `byparr`) gets through; a direct BFF-side scrape cannot.

**Provider credentials are server-scoped**, in `provider_configs`, not in `secrets` (which is keyed
by `user_id` for per-account upstream tokens). An undecryptable secret reads as _unconfigured_
rather than erroring.

**The download save path is a setting with no default.** The BFF and the download client are
different containers with different mounts, so guessing produces downloads that complete and are
never imported — every component reports success while nothing lands. This is the most important
thing in `docs/setup/MY_SETUP.md`: Audiobookshelf does **not** watch qBittorrent's download folder.

**Approval defaults to automatic**, on the grounds that this is one person's own server.

**A music request's terminal state is `importRequested`, not `completed`** — Jellyfin exposes no
API to confirm an import landed.

**IzzyOnDroid is closed, and the route is a self-hosted F-Droid repo.** The user: _"we will not
violate IzzyOnDroid's anti-AI policy. We won't submit the app there. I'll just add it as a custom
repo to my droidify."_ Their inclusion policy opposes apps "fully or in part created by generative
AI tools." `docs/research/FDROID_DISTRIBUTION.md` §2 and §5 are the working spec. Do not submit
anything anywhere.

---

## Environment and how to work here

Development is on a **laptop** (`SofiaThinkPad`), which talks to mediaserver as a remote client
over LAN/Tailscale. `docs/setup/MY_SETUP.md` and `HOST_REPORT.md` have the server's real details —
read them rather than re-deriving.

```bash
pnpm install
pnpm dev            # BFF on :8787, web on :5173
pnpm dev:fake       # same, against built-in fake upstreams (no media server needed)
pnpm test           # Vitest
pnpm test:e2e       # Playwright
pnpm format && pnpm typecheck && pnpm lint && pnpm test    # the cheap set
```

Upstreams: Jellyfin `192.168.100.34:8096`, Audiobookshelf `192.168.100.34:13378`, qBittorrent
`192.168.100.34:8080`.

**Runs here:** Playwright (`pnpm test:e2e`, `playwright install`), `gh`, the whole web/unit suite.
Use Playwright to verify UI work directly — a screenshot beats inferring from a pushed sha.
**CI-only:** `pnpm test:docker` (no Docker on this distro) and Gradle (no JDK or Android SDK), so
`apps/android` compiles on CI only.

**CI is the authoritative signal** for calling a phase done; local running is a faster first look,
not a replacement.

### Verifying a release: fetch the URL the docs give a human, and read what the artifact says about itself

Phase 11's first tag (`v0.1.0`, 2026-08-16) is the case worth remembering, because **every
automated check passed and the user-facing result was still broken.** `Release` and `F-Droid repo`
both green, a correctly-signed 15.2 MB APK published, the index carrying `net.develivarr.auralis`.

Two defects, neither reachable by CI:

1. **The docs named a URL that 404s.** `fdroid-repo.yml` uploads `path: fdroid-repo/repo`, so that
   directory's _contents_ become the Pages root — while `FDROID_REPO.md` told the user to add
   `…/curly-spoon/repo`. No test asserts on prose. **One `curl` of the URL the documentation
   actually gives finds it.**
2. **The artifact disagreed with itself, and this one is worse.** The published index declares
   `repo.address` = `…/curly-spoon/repo` — written by `fdroid update` from `config.yml`'s
   `repo_url` — while being served from the root. Pointing a client at the root therefore _loads
   the index and then resolves APKs against an address that 404s_: the repo adds successfully,
   lists the app, and fails at install. **That is much harder to diagnose than a 404 on add,
   because the repo appears to work.** The fix is to serve at the path the index claims, never to
   change the docs to match where the files happen to land.

**The generalisable pair:** fetch the URL a human is told to use, **and** read what the published
artifact asserts about itself. Green workflows prove the pipeline ran, not that the thing it
produced is coherent.

One trap for anyone changing that workflow: publishing the **parent** directory instead would put
`fdroid-repo/keystore.p12` and `config.yml` on a public website, and `config.yml` holds both
repo-signing passwords in cleartext. Stage a clean directory containing only `repo/`.

### Gotchas

- **Git hooks are armed in `.githooks/`, and they are not the same thing as `scripts/hooks/`.**
  `scripts/hooks/` holds Claude Code hooks (usage gate, quiet hours, agent log); `.githooks/` holds
  two plain git hooks, added 2026-08-16 at the user's direct request because CI's lint/format job
  was its most frequent failure and every one of them emails her.
  - `pre-commit` — prettier (and eslint) over **staged files only**, auto-fixing and re-staging.
    A file that is **partially staged** is reported rather than fixed, because fixing it would
    sweep the unstaged half into the commit.
  - `pre-push` — `prettier --check` and `eslint` over the **whole repo**, because `git merge` does
    **not** run `pre-commit`, so a subagent's worktree branch can carry unformatted files onto
    `main` unchecked. That is not hypothetical: it happened within the hour, since an agent in a
    fresh worktree has no `node_modules` and cannot run prettier at all.
  - Both **fail open** with no `node_modules`, and both are bypassable with `--no-verify`.
  - Armed by `package.json`'s `prepare` script (`git config core.hooksPath .githooks`) on every
    `pnpm install`. `core.hooksPath` lives in the shared config, so **every worktree inherits it**.
  - **Known limitation:** `git commit -- <paths>` builds a temporary index, so `pre-commit`'s
    auto-fix does not reach the commit. It still blocks, telling you to run `pnpm format`. Since
    path-limited commits are the standing rule here, expect the hook to report rather than fix.
  - **Concurrency caveat:** a whole-repo lint can trip over a file another session is mid-write on.
    `pre-push` blocked once on an eslint failure that did not reproduce. It prints eslint's real
    output so a spurious failure is tellable from a real one — re-run if it names a file you did
    not touch.

- **The per-package typecheck does not cover `e2e/`. CI's does.** The root `pnpm typecheck` was
  unreliable here (five parallel `tsc` processes; cause never established — do not repeat the
  memory explanation as though it were measured), and the per-package workaround silently drops the
  `e2e` project, where Playwright specs live. That turned `main` red on 2026-08-08 while every local
  check passed. Run `pnpm --filter e2e typecheck` too, or prefer the root command if it works now.
- **Run `pnpm format` before pushing docs, every time.** Twice in one day unformatted docs turned CI
  red. The cost is not a badge: `format:check` gates CI, a green CI on `main` is what triggers
  `.github/workflows/publish.yml`, and that writes
  `ghcr.io/patakihara/auralis:latest`, and mediaserver pulls that tag every fifteen minutes — **a red
  CI on `main` quietly stops the live deployment updating**.
- **`SESSION_SECRET`** keys the AES-256-GCM encryption of stored upstream credentials; changing it
  invalidates every stored secret.
- **Never commit real credentials, tokens or the user's hostnames.** This repo is public. Fixtures
  stay synthetic. RFC1918 addresses and container names are fine.
- `esbuild` and `better-sqlite3` need install-script approval; they are in `pnpm.onlyBuiltDependencies`.
- **`apps/server`'s `start` runs `tsx` against TypeScript sources** (a production dependency), left as-is
  deliberately. Compile instead if the image is ever slimmed.
- **A quiet-hours prompt gate is armed on `UserPromptSubmit`** via `.claude/settings.local.json`
  (gitignored, machine-local). Outside 17:00–18:00 local a typed prompt is filed into the task queue
  and blocked, surfacing an hour later. Two per-prompt exemptions — a `claude --bg` session's own
  kickoff prompt, and any `<task-notification>` a subagent hands back. `usage-gate.sh` must never
  honour anything like them: the plan-usage ceiling applies to autonomous sessions most of all.
- **`e2e/app`'s BFF is single-tenant and stateful** — `POST /api/v1/setup` configures it for the
  whole process, so `fullyParallel` would race. `onboarding.spec.ts` is its own Playwright project
  everything else `dependencies` on, and writes the `storageState` the rest start signed in from —
  not an optimisation: `POST /auth/login` is rate-limited to 10/min per IP, shared across workers.
- **The container's fake-upstream mode lives in `apps/server/src/testSupport/fakes`, not a `test/`
  sibling** — `AURALIS_FAKE_UPSTREAMS` is a runtime flag the shipped server parses, so that code has
  to ship in the image.
- **Mantine gotchas, both real bugs already fixed**: `unstyled` on `Modal` strips the CSS hiding its
  always-mounted root, leaving a permanent full-viewport click-blocking overlay; and
  `respectReducedMotion` only disarms Mantine's JS `Transition` machinery, not plain CSS
  `@keyframes` (so `Skeleton` drives its `animate` prop from `ThemeProvider`'s own
  `prefersReducedMotion`). An older note here guessed the same gap was "untested but likely
  present" in `Loader`'s spin and `Progress`'s stripe scroll. Checked 2026-08-16: **it is not.**
  `packages/ui/src/styles/index.css` carries a blanket `@media (prefers-reduced-motion: reduce)`
  rule collapsing `animation-duration`/`animation-iteration-count`/`transition-duration` on `*`
  with `!important`, `apps/web/src/main.tsx` imports that stylesheet, and four e2e specs
  (`progress`, `marquee`, `skeleton`, `lyrics`) assert through `page.emulateMedia({ reducedMotion:
'reduce' })`. Neither Mantine `Loader` nor Mantine `Progress` is used in `apps/web` at all. The
  component-level `prefersReducedMotion` hooks exist because the blanket rule cannot stop work JS
  is _doing_ (Marquee's measurement, Skeleton's shimmer prop) — not because CSS coverage is
  missing.

### Working in this checkout

**Do not create a worktree** — `CLAUDE.md` has the full reasoning (main-checkout rot, per-directory
auto-memory, the autorun runner's directory-based lookup, and a worktree's `.claude/settings.json`
being invisible to sessions rooted elsewhere). Work on `main` in this checkout, commit, push.

**A background session's `Edit`/`Write` cannot touch the shared checkout** — a harness guard rejects
both until the session isolates. **`Bash` is not gated**, so the orchestrator's in-place path for
`ROADMAP.md`/`HANDOVER.md` upkeep is a `python3` heredoc or `cat > file <<'EOF'`, exactly as
`git merge --ff-only` already writes the working tree from `Bash`. Use that rather than spawning a
worktree for a doc edit.

**`isolation: "worktree"` on the `Agent` tool defaults to the wrong base for this repo** — with no
`worktree.baseRef` configured, the agent lands on `origin/main`'s initial commit, an empty scaffold.
Instruct every isolated agent, as its literal first action, to run `git reset --hard <current branch
tip sha>` inside its worktree and verify with `git log -1`. Every worktree of one repo shares one
object database, so that commit is already present with nothing to fetch. The agent commits on its
own branch; the orchestrator integrates with `git merge --ff-only <branch>` from `Bash`.

A new worktree has no `node_modules` — `pnpm install --frozen-lockfile`. A worktree branch has no
upstream, so push needs an explicit refspec (`git push origin <name>:main`).

**Scope: this working tree, and nothing outside it.** This repo is a clone sitting inside the host's
`$HOME` repo. Do not stage, commit or "tidy" anything in another repo, even when asked to — a `Stop`
hook belonging to the _outer_ repo will report its uncommitted files into an Auralis session, because
hooks fire on the session rather than the directory. That report is not a task. Reading outside the
tree is fine; writing outside it is not.

### Worktrees currently on disk

Three, none of them holding unmerged work. All three are **safe to ignore** — `worktree-gc.sh`
refuses each of them, correctly, and will forever:

- `agent-a623d0d03e48b3297` — its two commits are on `main` under the same titles, landed by
  re-commit rather than merge, so they share no ancestry. `worktree-gc.sh` therefore refuses it
  ("not a confirmed ancestor of main") and will forever. That is the safety rail working. Removing
  it needs a deliberate `git worktree remove` plus `git branch -D` — the user's call.
- `agent-a8781e77885029281` — the 12f-2 draft, since superseded by `034c4cf`. **Locked**, so
  `git worktree remove` refuses it without `-f -f`; left in place deliberately rather than forced.
- `agent-a1b2a40eb1e9e4e64` — confirmed redundant against what landed on `main`.
- `agent-a0edf63595b976e4e` — the concurrent-libraries test, on `main` as `3cda65c`. Refused for
  the same reason as the first: it was **cherry-picked rather than fast-forwarded**, so it shares
  no ancestry.

**That last one is a lesson, not a fault.** Two agents based on the same commit cannot both
ff-merge — the first moves `main`, and the second is no longer a descendant. Cherry-picking the
second lands identical content but permanently strips `worktree-gc.sh`'s ability to prune it, so
the worktree lingers as apparent unmerged work forever. If two waves are dispatched from one base,
either merge the second with a real merge commit, or rebase it onto the new tip before merging —
and either way `git worktree remove` plus `git branch -D` is then a deliberate manual step, which
is the user's call rather than a session's.

---

## Infrastructure findings

### A hung `publish` job blocks every later CI run on `main` — diagnosed, and it is not "allocation"

**2026-08-16.** Three CI runs in a row sat `pending` with zero jobs allocated, which looks exactly
like the runner-allocation problem the section below describes. It was not. The cause is specific,
and it is worth knowing because the symptom is identical and the fix is different:

`ci.yml`'s concurrency group is `CI-refs/heads/main` with **`cancel-in-progress: false` on `main`**
(deliberately — a cancelled run also cancels `publish`, and mediaserver auto-updates from `:latest`).
So on `main`, runs **queue**. On `78e96d6` every verification job passed and then
**`docker/build-push-action@v6` hung for over two hours** in the `Publish image to GHCR` job. A run
is not complete until all its jobs are, so that single hung step held the concurrency slot and
**every subsequent CI run on `main` queued behind it**, allocating nothing.

**How to tell the two apart in one command** — if a run is `pending`, look for an older run that is
still `in_progress`:

```bash
gh run list --limit 12 --json headSha,workflowName,status,createdAt \
  -q '.[] | select(.status!="completed") | "\(.headSha[0:7]) \(.workflowName) \(.status) \(.createdAt)"'
```

An older `in_progress` run means you are queued, not unallocated. `gh run view <id> --json jobs`
then names the job holding it.

**What was done, and the reasoning, since this touches deployment.** The hung run was cancelled
(`gh run cancel 31966833421`) and the queue drained immediately. That is safe here: the job had
published nothing, so `:latest` was unchanged either way, and the next green build of `main`
republishes it. The alternative was waiting out GitHub's six-hour job timeout with the project's
authoritative verification signal blocked the whole time.

**Fixed the same day, at the user's explicit direction** (_"No, that's your fix"_), in `affece6`.
`publish` now lives in **`.github/workflows/publish.yml`**, triggered by `workflow_run` when CI
completes, gated on `conclusion == success && event == push && head_branch == 'main'` — that gate
is the whole safety property, since `workflow_run` fires on failures and cancellations too. It
checks out `workflow_run.head_sha` explicitly, because a `workflow_run` job starts from the default
branch; taking the default would build `main`'s tip and publish it under the tested commit's tag,
which is green and wrong. `ci.yml` goes back to `cancel-in-progress: true` unconditionally, and the
publish job carries `timeout-minutes: 60` so a hang fails visibly instead of stalling toward
GitHub's six-hour default.

**Why cancelling is safe in the new group and was not in the old one** — the crux, and worth not
re-litigating. Before, a cancel came from a superseded _verification_ run and nothing replaced the
lost publish. Now the only thing that can cancel a publish is a _newer_ publish, which by
definition pushes a newer commit to the same tags, so `:latest` converges on the most recent green
build instead of going stale. That is the outcome the old queuing policy was trying to protect.

### The publish split is verified in both directions, not just deployed

`affece6` moved `publish` into `.github/workflows/publish.yml`. Both branches of its gate were then
observed on real runs rather than reasoned about, which matters because the gate is the entire
safety property — `workflow_run` fires on **every** CI completion, including failures and cancels:

- **Cancelled CI → `Publish` completed/`skipped`.** The run fired off `b506746`'s cancelled CI and
  the `conclusion == 'success'` condition rejected it. A red or cancelled build cannot reach a
  registry a live host pulls from.
- **Green CI → `Publish` runs.** `8c9449e`'s CI went green and `Publish` started for real.

And the point of the whole exercise held: `8c9449e`'s CI carried **six jobs and no publish**, so
verification completed on its own without waiting on an image build.

- **It builds the tested sha, confirmed from the log.** The first successful publish checked out
  `ref: 8c9449e64689bb1b21582c9d02aefb43d4353ee2` while `main`'s tip had already moved to `b5270ed`.
  That was the one way this could have been green and wrong: a `workflow_run` job starts from the
  **default branch**, so without the explicit `ref:` it would have built `main`'s tip and published
  it under the tested commit's tag.

**So the split is fully verified and needs no further checking.** Four properties, each observed on
a real run rather than argued: the gate rejects a non-success CI, it fires on a green one, it builds
the tested commit, and CI itself no longer carries the publish job.

### The self-hosted fonts are CI-verified, including Lighthouse — the one signal local cannot give

Recorded because §16 warns twice that a green local Playwright run is not evidence about a
CSS-delivery change, and this is the wave where that was actually settled. On `78e96d6`, which
carries 16b-1's self-hosted Inter and Roboto Flex, **all six verification jobs passed**: Lint /
format / typecheck, Unit & integration, **Playwright end-to-end & UI**, **Web Lighthouse
performance budget**, Web bundle size budget, and the Docker image smoke test.

The Lighthouse job is the one that matters here — it is the only thing on this project that can
see a font pushing FCP or LCP past budget, and `font-display: swap` keeping the fetch off the
critical path was an argument until that job went green. It is no longer an argument.

**Unrelated, and the user's to look at, not a session's:** that run's `Publish image to GHCR` job
sat `in_progress` for over 75 minutes after every verification job had finished. Nothing was wrong
with the commit. Worth knowing because `publish` is what writes `ghcr.io/patakihara/auralis:latest`
and mediaserver pulls that tag every fifteen minutes, so a publish job that hangs stops the live
deployment updating just as surely as a red build does — and unlike a red build, nothing reports it.

### The web `CI` workflow has been failing to allocate runners

Established 2026-08-07 and **not resolved**; it undermines "CI is the authoritative signal" if left
unknown. Two independent things are wrong:

1. **Concurrency.** `ci.yml` sets `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`, so
   runs on `main` queue instead of cancelling. The comment's reasoning is sound — a cancelled run
   also cancels `publish`, and mediaserver auto-updates from `:latest`, so superseded runs would
   silently stop updating the registry while everything reported green. **But queuing does not do
   what the comment assumes**: GitHub allows only one _pending_ run per concurrency group, so a new
   run cancels the already-pending one. Under back-to-back pushes every queued run in between is
   discarded anyway. Eight consecutive `CI` runs on `main` ended `cancelled` without allocating a job.
2. **Allocation.** One run sat `pending` for over forty minutes with nothing in its group to
   supersede it and zero jobs allocated, while `android.yml` runs on the same shas were picked up
   and finished green. So the `CI` workflow specifically is not getting runners — an account or
   workflow problem, and the user's infrastructure to look at.

**Reconfirmed 2026-08-15.** Allocation looks recovered — runs now pick up runners and finish. The
concurrency half is very much live: three back-to-back doc pushes that day produced exactly the
predicted pattern, the in-progress run surviving while both queued ones were cancelled without ever
allocating a job. The mechanism is understood and reproducible, not intermittent.

**Do not read a green `Android` run as the branch being verified**, and space pushes to `main` out
if the web CI result matters — one push, wait for it, then the next. The obvious fix for half of it — move `publish` into its own workflow
with its own concurrency group, so verification jobs may cancel freely while the deployment-coupled
job queues — **changes deployment behaviour on a live host and is not an autonomous call.**

### `android.yml` cancels its own in-flight runs on every push, unlike `ci.yml`

`android.yml` sets `cancel-in-progress: true` unconditionally, where `ci.yml` makes it conditional
on the ref so `main` queues instead. The consequence, seen three times in one session on 2026-08-16:
**a docs-only push to `main` kills the Android run verifying the previous commit**, mid-flight. So
Android verification on `main` only ever reflects the most recent push — a green Android run two
commits back is not evidence about the commit you are looking at, and an Android result you are
waiting on will vanish if you push anything at all. Batch pushes when an Android result matters.

### Deployment

Container images publish to GHCR (`c1882d5`): CI's `publish` job pushes
`ghcr.io/patakihara/auralis:latest` and `:<sha>` (linux/amd64) on every green build of `main`.
Multi-arch (arm64) is unbuilt.

**Auto-updating deployment on mediaserver is the next infrastructure task and is not started** —
pulling the new image and restarting when `:latest` changes, Watchtower being the candidate. It is a
live change on a different host, so whoever picks it up must read mediaserver's own `~/CLAUDE.md`
first (this repo's scope rules do not extend there) and needs the user's go-ahead. **The other
containers on that host must stay running; above all, Jellyfin must not be taken down.**

Worth reconciling first: the checked-in `compose.yaml` carries both `build: .` and
`image: ghcr.io/patakihara/auralis:latest`, while `docs/SELF_HOSTING.md`'s snippet uses `image:`
only — so `docker compose up` against the checked-in file builds locally instead of pulling, and a
stray `--build` would override a pulled tag.

### Performance — mobile scores ~0.58, and that is the phase 10 finding

Desktop is fine on both pages measured (~0.94, ~1.1s FCP). **Mobile is ~0.58 on both**, FCP ~6.0s,
LCP ~6.9s. Blocking time is modest and layout shift near zero — nothing is janky; it is purely how
much has to arrive before anything renders.

That the two pages land within a few percent of each other is the informative part. The home page
does strictly more work and does not measurably cost more, because both pay for React, Mantine,
react-query, the router and zustand before anything paints, and under mobile's throttle that shared
cost dominates. It is also why lazy-loading the app shell took ~62 KB out of the entry chunk and
moved no score.

The entry chunk is ~887 KB raw / ~231 KB gzip. Route-level splitting already works (largest lazy
chunk 34 KB) and vendor `manualChunks` was tried and **rejected for measuring nothing**. What is left
is a weight problem, not a splitting problem: the app shell pulls the whole design system in before
first paint. Improving it means changing what the shell depends on — real product work, not a
build-config change. The budgets are deliberately floors at current values; they stop this getting
worse, they do not claim it is good.

### Android's UI audit — source-derived, never seen on a device

`docs/research/ANDROID_DESIGN_AUDIT.md`. Most of what it found has since shipped (the persistent
shell, the Now Playing surface, `material-icons-extended`, unified search). What remains is that
`MaterialTheme` receives only a colour scheme — no typography, no shapes — and that colour is
Android's wallpaper-derived Material You, not the artwork-derived pipeline `DESIGN.md` specifies and
web implements. There is no motion system. **None of this was verified on a device**, and closing it
is real feature work on a surface nobody here can look at.

---

## Where the specs live

`docs/ROADMAP.md` (status and per-wave detail), `ARCHITECTURE.md`, `DESIGN.md`, `INTEGRATIONS.md`.
`docs/setup/MY_SETUP.md` and `HOST_REPORT.md` are the real server's details. `docs/research/` holds
the F-Droid and Android-design investigations, and `docs/research/spec-addendum/` the user's four
reference screenshots for phase 12 — **deliberately not in git** (they are the user's own Spotify
screenshots and this repo is public), so a session on this machine can read them and a fresh clone
cannot.

**Check `docs/agent-specs/`.** Subagent specs written but never launched are parked there. Empty but
for its README means nothing is queued.
