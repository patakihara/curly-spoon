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

- `2026-08-20T13:34:53Z` · `ac8d6ec012bcfbac3` · general-purpose · ended · # Parity Review — '16e-nowplaying-P' ## 1. Verdict **Not clean — one real defect, currently blocking 'main''s Android CI, plus two follow-ups.** The…
- `2026-08-20T13:48:33Z` · `a868ad45336e0f504` · general-purpose · ended · Only the one new file exists, nothing else was touched. Task complete. ## Report — '16e-foryou-spec' **1. Document written:** '/home/sofiapata/src/au…
- `2026-08-20T13:49:45Z` · `a41cb72e6b1c7ae41` · general-purpose · ended · Working tree clean, one commit 'c93fd8a' on branch 'worktree-agent-a41cb72e6b1c7ae41', on top of '34e41c3'. ## Report — Wave '16e-search-A-3' **1. Br…
- `2026-08-20T14:05:53Z` · `a532458b8f6d00a86` · general-purpose · ended · This all reads coherently. The implementation is complete, committed, and verified. Here's my final report. ## Report — Wave '16e-foryou-W' **1. Bran…
- `2026-08-20T14:06:24Z` · `ad6d77230b8723fa8` · general-purpose · ended · ## Report — Wave '16e-foryou-A' **1. Branch/commit:** 'worktree-agent-ad6d77230b8723fa8' at '55ca4af', one commit on top of 'ff9440d'. 'git status --…
- `2026-08-20T14:47:44Z` · `ab1c8e59fadc27f0d` · general-purpose · ended · ## Report — '16e-foryou-P' **Verdict: clean, with follow-ups — no defect that should block shipping.** Both waves are honest about what they built an…
- `2026-08-20T14:59:38Z` · `aa135354468fa745f` · general-purpose · ended · ## Report — Wave 16e-foryou-A-2 **1. Branch/commit:** 'worktree-agent-aa135354468fa745f' at '95e27a4'. 'git status --short' is clean. Reset to base '…
- `2026-08-20T15:15:05Z` · `a97354ec6040f55c7` · general-purpose · ended · The spec is written to '/home/sofiapata/src/auralis-src/docs/design/screens/SETTINGS.md'. (Note: 'docs/HANDOVER.md' shows as modified in git status —…
- `2026-08-20T21:16:08Z` · `a8f347adc09133521` · general-purpose · ended · Working tree is clean, all committed. Here is my final report. ## Report — Wave '16e-settings-W' **1. Branch/commit:** 'worktree-agent-a8f347adc09133…
- `2026-08-20T21:16:57Z` · `ae1def9061591c7e3` · general-purpose · ended · Working tree clean, one commit on the worktree branch, no push performed. Here is my final report. ## Report — Wave '16e-settings-A' **Branch/commit:…
- `2026-08-20T21:43:47Z` · `adeb514ba6ea1d786` · general-purpose · ended · Working tree clean. Here is my final report. ## Report — '16e-settings-P' **Verdict: ship as-is. No blocking defects on either platform.** 'main' at…
- `2026-08-20T22:00:53Z` · `a12a64f119980693a` · general-purpose · ended · ## Report — '16g-design-reconcile' **Branch/commit:** 'worktree-agent-a12a64f119980693a' at 'b98ca76', one commit on top of '04a7f22'. 'git status --…
- `2026-08-20T22:11:05Z` · `aa14b1c2b80bebfb8` · general-purpose · ended · The 'ui-desktop'/'ui-mobile' Playwright run auto-backgrounded (task 'bd1b0vfm1') after the 2-minute default timeout. My work is already committed, so…
- `2026-08-20T22:23:16Z` · `aa14b1c2b80bebfb8` · general-purpose · ended · ## 1. The seven-call-site classification All seven line numbers you gave me were accurate — I re-grepped them before touching anything and they match…
- `2026-08-20T22:36:57Z` · `af5faf40ebd7f0c47` · general-purpose · ended · Working tree is clean, nothing uncommitted, nothing pushed. ## Report — wave '16i-handover-prune' **Branch/commit:** 'worktree-agent-af5faf40ebd7f0c4…

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

### DONE 2026-08-20 — `16e-nowplaying`, the fifth screen triple, COMPLETE with a clean `-P`

Both halves merged (`6dbc5f0` web, `35f2c18` Android), built concurrently from
`NOW_PLAYING.md` with neither agent seeing the other's code. Verified locally before pushing:
**237 `app` + 216 `ui-desktop`/`ui-mobile` Playwright, 1731 unit, typecheck green on every
project.** The largest remaining screen is done; **Settings/Onboarding and For You/browse are
the last two**, then `16f`.

**The pre-ruled parity target fired, and this is the cleanest instance of the technique yet.**
The claim block named the scrubber announcement as the byte-for-byte target _before either agent
reported_. Web's `formatDuration` gives `"1:30"` for 90s and `"1:02:10"` for 3730s; Android's new
`scrubberValueDescription` produces `"1:30 of 1:02:10"` for the same input, degradation on an
unknown duration included. **Verified by the orchestrator against web's actual source, not taken
from the agent's report.** Unlike the previous four triples this was not two independent
derivations agreeing — web already shipped the literal, so Android was matching rather than
deriving, which made a mismatch a real defect. Naming it in advance turned an adjudication into a
one-step check. **Do this in every remaining screen spec.**

**Two genuine accessibility gaps closed on Android**, not restyling: `NowPlayingScreen`'s title had
no `heading()` semantics at all where web has a real `<h1>`, and the seek `Slider` announced no
value where web has announced one all along.

#### THE OPERATIONAL FINDING — this file's own verification advice is wrong on this machine

**This laptop has 4 cores** (`nproc`), and `playwright.config.ts` sets `workers: '100%'`. So a
local full-suite run at the config default puts 4 workers, a vite build and the stateful BFF on 4
cores. Measured today, on a tree that is provably clean:

| Run | Workers    | Result                                                                   |
| --- | ---------- | ------------------------------------------------------------------------ |
| 1   | 4 (`100%`) | 2 failed — `browse.spec.ts:36`, `player.spec.ts:166`                     |
| 2   | 4 (`100%`) | 2 failed — **different two**: `for-you.spec.ts:384`, `music.spec.ts:104` |
| 3   | 2          | **237 passed, 0 failed** — and _faster_ (4.8m vs 5.4m)                   |

Both failing pairs were content-visibility timeouts with no assertion mismatch, both passed in
isolation, and **the failures moved between runs**. Load average hit 11.5 on 4 cores.

**So "run it the way CI runs it" is not achievable locally and the attempt manufactures failures.**
This file has correctly warned that `--workers=1` is a _weaker_ check than CI — that stands. What
it did not say is that `--workers=100%` on a 4-core laptop is a **noisier** one, and noise on a
timing-sensitive suite is indistinguishable from a regression until you spend three runs on it.
**Use `--workers=2` locally: it is green, it is not slower, and it still exercises parallelism.**
CI, with real runner headroom, remains the authoritative signal. Do not read a moving 2-failure
result on this machine as a regression — establish it in isolation first, which costs one minute.

#### `-P` IS DONE — clean on design and behaviour, and it caught a RED `main`

The review by an agent that wrote neither half. **Verdict: the design and behaviour work is sound
on both platforms; the wave shipped one broken test that turned `main`'s Android run red.** Fixed
inline (`96a5ed0`) rather than spent as a wave — see below.

**All three flagged ambiguities ruled, and all three went web's way:**

1. **The transport-size table governs every breakpoint.** §3.1 already rules the surface is one
   stacked structure across breakpoints, and both platforms independently applied their sizes
   uniformly. **Settled, not open.**
2. **The context line is new at every breakpoint.** §3.3's "desktop panel only" is a _recon
   citation_ describing Sonora's mock; §6.3's behaviour contract says "new on both" with no
   qualifier. **A recon citation in §3 does not override a behaviour requirement in §6** — that is
   the generalisable ruling, and it is worth carrying into the two remaining screen specs.
3. **`--surface-fg-muted` on the mini player author is idiom.** 12 uses in `app.css`, several
   pre-existing and untouched by this wave; migrating one more consumer is what every 16c/16e wave
   has been doing.

**The byte-for-byte target was re-derived independently by hand from both sources** — not read off
either agent's report — and matches: `"1:30 of 1:02:10"`, degradation to `"0:00"` on both sides.
The context line matches too (`"Playing from {album}"`, blank-guarded identically, each pinned by
its own platform's test against a different literal). **Fifth triple running.**

**Ruled clean with evidence, so nobody re-checks:** shuffle/repeat reuse `MiniPlayerBar`'s exact
semantics rather than a second pattern; the lyrics three-state rule is the _same rule_ on both
sides and pairs weight with colour on both, so it is never colour-only; §7 and §8 are respected in
both directions; the queue-row highlight difference matches §3.4's own single-row Android table.

**One pre-existing limitation correctly labelled rather than logged as new drift:** Android's title
cannot match `var(--font-display)` because **no display font is bundled on Android at all** — 16b-1
self-hosted fonts for web only. The weight axis does match (W900). Not this triple's doing.

#### THE FOURTH COMPOSE-TEST TRAP — and the spec-side warning did NOT hold

`main` went red on `461eeb0`: two `MiniPlayerBarTest` cases, bare `java.lang.AssertionError` naming
neither tag nor cause, on a genuine uncached execution (735 tests ran). **The tag existed.** It sits
inside the root `Box`'s `.clickable(onClick = onExpand)`, and `clickable` merges its descendants'
semantics — a `testTag` does not survive that merge the way `Text` and `ContentDescription` do,
which is precisely why the lookups on the lines _either side of it_ passed.

**This is the third instance of the `useUnmergedTree` variant** after `16e-search-A-2` and
`16e-album-A`, and the fourth of the family.

**The new and more important fact: this trap was written verbatim into the implementing agent's
spec — the tell, the mechanism and the remedy all named — and it shipped anyway.** That is the same
shape as the commit-before-backgrounding instruction: **a spec-side warning lowers the frequency and
does not hold.** The load-bearing checks are the orchestrator-side ones — CI, and a parity reviewer
who did not write the code. Budget the red Android round rather than expecting the warning to
prevent it.

**A cheap mechanical tripwire exists and is worth running before any Android push**, in the same
spirit as the `/*`/`*/` balance check — list every tagged lookup in changed test files and confirm
each one deliberately:

```bash
grep -rn 'onNodeWithTag(' apps/android/app/src/testDebug/ | grep -v useUnmergedTree
```

It has false positives by design — `mini-player-progress` at `MiniPlayerBarTest.kt:110` passes
without the flag and was deliberately left alone, because changing a passing assertion to match a
pattern discards the information that the merge boundary is not where you assumed. Treat the output
as a list to confirm, not a list to fix.

#### What `-P` ruled on (the questions as originally posed)

1. **§3.3's transport-size table has only a mobile-sheet row.** `-W` read it as governing every
   breakpoint (matching §3.1's single-stack ruling) and applied 56/56/72 uniformly. Confirm.
2. **The context line's "desktop panel only" note** — `-W` read it as recon about where the line
   sits in Sonora's mock, not a restriction on where to render it, and §6.3's contract carries no
   breakpoint qualifier. This is the spec's one real ambiguity.
3. **`.auralis-mini-player__author` moved to `--surface-fg-muted`**, consistent with every other
   restyled muted role but not mandated by §3.2. A judgement call, flagged by the wave itself.

#### Named gaps and inherited findings, none blocking

- **The chapter-fetch `LaunchedEffect`/`ApiClient` wiring on Android is a source read only.** `-A`
  deliberately did not introduce the first-ever Robolectric test combining a real `PlayerViewModel`
  with `createComposeRule()` — no such test exists in this repo — rather than stack two unproven
  things with no local compiler. It proved the shared code through a stateless `MiniPlayerBarTest`
  and unit-tested every new pure function instead. **That is the right call and the gap is real.**
- **A third spec-recon error, same family as `SEARCH.md`'s two.** §3.3 records Android's title as
  not weight-900; `Type.kt` has defined `headlineMedium` at `W900` since `16b-2-A`. Only the
  semantics were missing, and `-A` correctly left the typography alone. **A spec's recon is a
  starting point, not a census — three specs running.**
- **`--m3-surface-container` and `--surface-card` are numerically identical in both themes**, so
  the queue/pill backgrounds are indistinguishable from each other today though both differ from
  the pre-Sonora baseline. Inherited from the substrate collision `16c-2-W-3` already documents;
  not this wave's defect.
- **`IconButton`'s `size` prop is additive-only and proved so.** 18 call sites across 14 files,
  re-measured by the wave rather than trusted from the spec, with one e2e test asserting the four
  existing variants stay at 48px _in the same test_ as the new 64px one.

### SESSION HAND-OFF, 2026-08-20 (evening) — **`main` is `4299bb9`. Nothing claimed, nothing in flight.**

`docs/agent-specs/` is empty. Every wave dispatched this session was merged. **Two screen triples
completed** (`16e-nowplaying`, `16e-foryou`), **three follow-up waves**, **two specs written**, and
**four defects fixed that the suite could not see on its own**.

**The next thing to do is the `16e-settings` triple** — the **LAST screen**.
`docs/design/screens/SETTINGS.md` (571 lines) is merged and is the contract. Dispatch `-W` and `-A`
together from it, then `-P`. **After that only `16f` remains.**

**Verified before each push, not after:** 239 `app` + 216 UI Playwright, 1731 unit, typecheck every
project. `CI` and `Android` green, the Android runs confirmed as **genuine uncached executions** by
grepping for bare `testDebugUnitTest`/`compile*Kotlin` rather than reading a badge.

#### The one finding that changes how to verify on this machine

**This laptop has 4 cores; `playwright.config.ts` sets `workers: '100%'`.** At that default a _clean
tree_ produced 2 failures per full `app` run, **a different two each time**, all content-visibility
timeouts with no assertion mismatch, all passing in isolation, at load average 11.5. **`--workers=2`
gives 237–239 passed, 0 failed, and is no slower.**

This file has correctly warned that `--workers=1` is a **weaker** check than CI. That stands. It
never said `--workers=100%` here is a **noisier** one — and on a timing-sensitive suite, noise is
indistinguishable from a regression until three runs have been spent proving otherwise. **Use
`--workers=2` locally; CI remains the authority.**

#### Four defects fixed that a green suite could not see

1. **A `testTag` inside a merged semantics node** turned `main`'s Android red — the **fourth** of that
   trap family, third of the `useUnmergedTree` variant. **It was written verbatim into the wave's own
   spec, tell and remedy included, and shipped anyway.** Same shape as commit-before-backgrounding: a
   spec-side warning lowers the frequency and does not hold. **The load-bearing checks are CI and a
   reviewer who did not write the code.** (One later wave, given the warning _plus_ the fact that it
   had shipped again that day, complied — one sample, not a refutation, but the emphasis may matter.)
2. **`MusicSearchViewModel` never passed `baseUrl` to its track mapper**, on the same line where
   artists and albums both did — so track cover URLs were null on the wire. **Adding the missing tile
   alone would have shipped a styled fallback icon forever and looked entirely correct.**
3. **Web's browse live region rendered as permanently visible text** — "Browse feed loaded." sitting
   under the filter chips forever, on a branch that auto-deploys. Shipped on a **false premise**
   (that this repo has no visually-hidden convention; `.m3-visually-hidden` exists in `Button.css`).
   **`toHaveText` reads text content and cannot tell hidden from visible**, so the suite was green
   and a **screenshot** found it. `app.css` now carries its own hiding rule rather than borrowing one
   that ships only with `Button`'s chunk.
4. **The accent picker's own selection ring read `--m3-primary`** (`4299bb9`), fixed at Sonora's value
   since `16c-2-W-1` — so the indicator marking "this is your accent" never changed when the accent
   did. Android fixed the identical bug in `16f-A-2`. **The spec reported a test pinning this as
   correct; it does not** — that test pins the _token_ staying fixed, which is deliberate and
   untouched. Checking that distinction before editing is what made the fix safe.

**Every one of these four was found outside the implementing wave** — by CI, by a parity reviewer, by
a screenshot, or by the orchestrator's own full-suite run. **Not one was caught by the wave that
wrote it**, and each wave's targeted tests were green.

#### Techniques that are now proven and belong in every remaining wave

- **Pre-rule the byte-for-byte target in the claim, before either agent reports.** Fifth and sixth
  triples both matched. On `16e-nowplaying` it made a shipped literal checkable in one step; on
  `16e-foryou` it **prevented a false alarm** — two announcements that differ by design had already
  been ruled out of the target. It catches mismatches _and_ stops good work being flagged.
- **Tell every wave to re-measure the recon it is handed.** Caught a **fourth** wrong count (`--m3-*`
  in `Carousel.tsx`: 7 across 4 names, not 12) — **the first caught before it cost anything.**
- **Say plainly when a platform already satisfies something.** Android's For You loading logic was
  correctly left untouched because the spec said so; the same instruction produced a byte-identical
  header on the podcast triple.
- **Contract-vs-recon labelling passed its first real test** — both For You waves invoked it, both
  correctly.

#### Two corrections about MY OWN process, recorded because they nearly cost verdicts

1. **The `16e-foryou-P` brief stated a divergence backwards**, because it was written from an
   implementing agent's paraphrase rather than from the spec. The reviewer checked the spec _and_ the
   vendored source, found the brief wrong, and **escalated instead of grading the wrong platform**.
   **A review brief inherits the ambiguity of whatever it was derived from — cite the spec directly.**
2. **A read-only reviewer has no sanctioned way to look at a rendered page.** The `-P` agent broke its
   "create no file" instruction to take one screenshot and reported itself — **and that screenshot is
   what found defect 3 above.** Give future `-P` briefs an explicit bounded screenshot allowance
   rather than an instruction they must break to do the job.

#### Corrections this file owed, now made

- **`14b-2` was recorded as "not started, deliberately"** while three other lines said it landed and
  was CI-verified. It landed. `ForYouCarousel.kt:173` carries the merged semantics.
- **The claim that Android's For You carousels had no accessibility semantics at all** was stale for
  weeks. **It cost real turns** — the `16e-foryou` spec wave was dispatched believing a gap existed
  and had to prove it did not. **So the standing lesson gets its mirror: "a doc claiming parity is not
  evidence of parity" is why that gap was found — and a doc claiming a GAP is not evidence of a gap
  either.** Verify against code in both directions.

#### Open, named, none blocking

- **`16g` CLOSED — and reconciling `DESIGN.md` turned up FOUR claims that were never true, not merely
  superseded.** The wave was told to verify against the code rather than rewrite from `SONORA.md`,
  and that instruction is what separated the two categories. Superseded-by-Sonora: the spring table
  (`motionCssVars()` has emitted flat `200ms ease-in-out` since `16c-2-W-1`, though `ThemeProvider`
  still uses the real solver for the accent cross-fade), the M3 type scale, the M3 breakpoint table.
  **Code-verified-false — documented, never built:**
  - **Player transport keyboard shortcuts.** `DESIGN.md` specified Space, arrow seek, J/L ±30s and
    `[`/`]` speed. **Verified here as well as by the wave:** there is no `keydown` handler anywhere
    under `apps/web/src/features/player/`, and `hooks/shortcuts.ts` registers only `/`, `?`, `g h`
    and `g l`. **This is a real product gap on a media player, not a doc error** — it is the first
    time anyone has noticed, because the doc asserting them read as a description of shipped
    behaviour. Worth a small wave; needs no credential and no device.
  - **The "colour is never the only signal" animated equaliser glyph** — grep finds no
    `equaliser`/`equalizer` anywhere on either platform. What actually ships is a text label folded
    into the accessible name (`"…, Playing"`), which satisfies the same accessibility intent by a
    different mechanism. The intent held; the described implementation never existed.
  - **Shape morphing** (pressed-state corner spring `full`→`large`) — removed in `16c-1`, and
    `e2e/ui/button.spec.ts` now asserts the radius does **not** change.
  - **Artwork-derived colour driving the palette at runtime** — `artwork.ts`'s
    `sourceColorFromImageData` still has zero callers outside its own test.

  **The generalisable half, and it is the third instance of one shape this session.** A spec
  document is not evidence about the code, in either direction — this file already carries "a doc
  claiming parity is not evidence of parity" and its mirror about claimed gaps. Here a doc claimed
  four _features_, and two of them had never been built at all. **`DESIGN.md` was listed in
  `CLAUDE.md` as part of "the spec" the whole time**, so anyone reading it to learn what the app
  does would have learned four wrong things.

  **Sofia's open artwork-colour question (queue `dbfb46e`) is preserved as unresolved**, not closed
  out with the rest — an earlier `SONORA.md` recorded it as asked-and-answered when it had not been
  asked, and recording a live question as closed is worse than leaving it open.

- **A SEVENTH writer-with-no-reader:** `RecommendationShelf.itemLabels` is written, typed and tested,
  and **no client on either platform reads it**. That half stands.

  **CORRECTED 2026-08-21 — the `parentId` half of this bullet was wrong, and acting on it would have
  cost a wave.** It read: "`parentId` has no writer anywhere in `apps/server/src`, which makes
  Sofia's 'no two episodes of one podcast' a **data-plumbing** problem, not a logic one... this
  significantly narrows `16e-foryou-shelves-*`." A wave was about to be dispatched on exactly that
  premise. The premise inverts the actual situation.

  **`parentId` has no writer because nothing can currently feed it, and the code says so in its own
  doc comment** (`features/recommendations/types.ts:55-70`). Verified by reading the three adapters
  rather than inferring: `adapt.ts` emits `kind: 'book'` at item granularity and `kind: 'podcast'`
  at **whole-show** granularity (`item.id`), and `adaptMusic.ts` emits `kind: 'album'`. There is no
  episode candidate and no track candidate anywhere in this feature. So `dedupeByParent` is not
  broken plumbing waiting for a value — it is **correctly dormant machinery**, built ahead of a
  granularity that does not exist yet, and `parentKeyOf`'s fallback chain is doing the right thing
  today.

  **The consequence: the recommendations feature cannot violate Sofia's requirement, because it
  never emits an episode.** Two episodes of one show can only appear on a code path that actually
  carries episodes — and For You stitches **four** sources, of which this is one. Audiobookshelf's
  own personalized shelves are a separate source (`routes/libraries.ts:56` describes consuming
  them), and `PodcastEpisode` is a real domain type with its own identity
  (`packages/abs-client/src/domain.ts:134-144`). **That is where the requirement bites, and nobody
  has established it does.**

  **So `16e-foryou-shelves-*` is not narrowed to plumbing — it is unscoped, and its first job is a
  recon question, not an implementation:** which of For You's four sources can actually surface two
  episodes of one show? Answer that before building anything. Adding a `parentId` writer to the
  recommendations feature first would be this project's eighth writer-with-no-reader, inverted — a
  reader wired to an input nothing produces.

  **The generalisable half:** the original bullet was written from a grep (`parentId` appears only
  in types and tests) without reading the doc comment sitting on the field, which states the reason
  in full. **A grep establishes absence; it does not establish that the absence is a defect.** This
  file's own standing pair of lessons — a doc claiming parity is not evidence of parity, and a doc
  claiming a gap is not evidence of a gap — now has a third member: **an absence found by grep is
  not evidence of a gap either.** Check whether the code explains itself before filing it as owed.

- **`FOR_YOU.md` §9/§10 scoped the same geometry tables in different words**, so the two waves
  correctly built different amounts. **The defect is the document's.** `SETTINGS.md` already applies
  the fix; it is the last spec, so the lesson has nowhere else to go.
- **`features/home/` has NO Robolectric coverage on Android.** Nothing exercises `ForYouCard` or
  `QuickPickTile`. Every Android claim on that screen is a source read plus a compile.
- **Web's onboarding/settings page-level CSS is still wholly on `--m3-*`** — a class of consumer this
  file's "remaining consumers" list has **never tracked**, because that list counts `packages/ui`
  components only. **`--m3-*` deletion is further off than the tracked list implies.**
- **Android's skeleton is more faithful than web's** on card corner radius (web's Mantine `Skeleton`
  fixes `radius="md"`). Does not affect the layout-shift invariant.
- **Still with Sofia, still blocking nothing:** queue `dbfb46e` (artwork-derived accent), `abbaca2`
  (the two WCAG numbers), `969711e` (external podcasts — `hold-15e-podcasts` stays held). **Checked
  this session: none answered, and the accent one has not even been surfaced yet.**

### DONE 2026-08-20 — `16e-foryou`, the SIXTH screen triple. **Settings/Onboarding is the LAST screen.**

`main` is `a3156bd`. Five waves: spec, `-W`, `-A`, `-P`, and `-A-2` closing what `-P` found, plus
one orchestrator fix. Verified locally before each push — **238 `app` + 216 UI Playwright, 1731
unit, typecheck every project.**

**`-P` verdict: clean with follow-ups, both of which were taken immediately rather than filed.**

#### THE SPEC-AUTHORING DEFECT — apply this to the Settings/Onboarding spec before writing it

**`FOR_YOU.md` §9 and §10 scoped the SAME geometry tables in different words**, and the two waves
correctly implemented different amounts as a result:

- §9 (web): _"→ §3.2's table (52/48px cover, **background/radius split by breakpoint**)"_ — explicit.
- §10 (Android): _"Apply the corresponding **radius/typography** changes"_ — narrower, silently
  omitting background, padding, row gap and pill position.

Neither wave misread its section. The Android wave **named the asymmetry in its own commit message**
and flagged it for `-P`, which is exactly right behaviour. **The defect is in the document.**

**The fix, and it is the last chance to apply it:** when a shared geometry table is scoped
per-platform, **enumerate the same rows for both platforms**, or state explicitly why a row does not
apply — the way the "deliberately unequal" section already does elsewhere in the same document. A
narrower phrasing on one side of a symmetric table is invisible until a `-P` catches it.

**The contract-vs-recon convention passed its first real test.** Both waves invoked it, and both
invoked it _correctly_ — neither repeated `16e-nowplaying-P`'s mistake of reading a recon citation
as a restriction. Keep it in the last spec.

#### The five deferred items, as ruled

| Item                                      | Ruling                                          | Action                                                |
| ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Android absent-pill position + background | drift, pre-existing, most visible of the five   | **fixed in `-A-2`**                                   |
| Android quick-pick row chrome             | drift, pre-existing                             | **fixed in `-A-2`**                                   |
| Quick-pick subtitle line                  | **symmetric** — neither platform renders it     | correctly out of scope, do not close on one side only |
| Progress-bar overlay-on-art               | **symmetric** non-compliance with a recon table | correctly out of scope                                |
| Web live-region visible text              | real defect on the primary screen               | **fixed (`e5737ad`)**                                 |

#### The live-region defect, and why the suite could not see it

`-W` shipped `"Browse feed loaded."` as **ordinary visible text, permanently mounted** — a sentence
sitting under the filter chips forever after load, on Sofia's primary screen, on a branch that
auto-deploys. It did so on a **stated premise that was false**: that this repo has no
visually-hidden convention. It does — `.m3-visually-hidden` in `Button.css`.

`app.css` now carries its own copy rather than borrowing that one, because `Button.css` ships only
with `Button`'s chunk and this app has already been bitten by a component painting before its own
lazily-loaded CSS arrived (14a-2). **A live region whose hiding rule can arrive late is the wrong
thing to depend on.**

**`toHaveText` reads text content and cannot tell hidden from visible**, which is why the suite was
green and a **screenshot** found it. The new assertion pins the **bounding box** — behaviour, not
mechanism — so it survives a change of hiding idiom and still fails on `display: none`. **Confirmed
to discriminate** by removing the class and watching it go red.

**Deliberately not applied to `search-status`**, which looks like the same case and is not: _"12
results for X"_ is useful visible copy; _"Browse feed loaded."_ says nothing a sighted user cannot
already see.

#### An orchestrator error worth recording

**The `-P` dispatch brief stated the pill divergence backwards** — it said the spec wanted
bottom-start and Android had top-left; the truth is the reverse. The reviewer caught it, checked
`FOR_YOU.md` **and** the vendored `MediaCard.dc.html` (`left:8px;top:8px`), and **escalated the
correction rather than grading the wrong platform**. A reviewer that trusted its brief would have
produced a confidently wrong verdict.

The cause was mis-parsing the implementing agent's own phrasing (_"bottom-start, not top-left per
§3.1's table"_) when writing the brief. **A `-P` brief is derived from agent reports and inherits
their ambiguity — cite the spec directly in the brief, not the agent's paraphrase of it.**

#### Other findings, each verified rather than accepted

- **Recon verification worked, first time it has been asked for explicitly.** The spec claimed 12
  `--m3-*` usages in `Carousel.tsx`; the real count is **7 across 4 names**, and 2 remain
  deliberately. **Fourth recon error found in a screen spec, and the first caught before it cost
  anything** — because the dispatch told the wave to re-measure rather than the lesson being
  relearned after the fact. **Put that instruction in every remaining spec.**
- **The byte-for-byte target prevented a FALSE alarm**, a use it has not had before. Web produces
  `"…, not in library"` and Android `"… — Not in library"`, which reads as a mismatch; the spec had
  already ruled join punctuation and casing **out** of the target, so both are correct. Pre-ruling
  catches mismatches _and_ stops good work being flagged.
- **The full suite caught a spec the wave did not know it had broken.** `-W` renamed the label and
  updated three specs; `for-you-external-book.spec.ts` still pinned the old wording. **A targeted run
  cannot see a spec the wave never touched.** Agents run targeted tests, the orchestrator runs the
  suite — unchanged, and it has now paid twice.
- **Android's skeleton is more faithful than web's**: it passes the exact `CARD_ART_SHAPE`, while
  web's Mantine `Skeleton` fixes `radius="md"`, so corner rounding differs though box size does not.
  Does not affect the layout-shift invariant. Minor, unclosed, named.
- **`features/home/` has NO Robolectric coverage on Android at all.** Nothing exercises `ForYouCard`
  or `QuickPickTile`. Pre-existing, unchanged by these waves, and it means every Android claim on
  this screen is a source read plus a compile.

#### Process note from the reviewer, self-reported

The `-P` agent **created a temporary Playwright spec to take one screenshot and deleted it in the
same command**, against its explicit "create no file" instruction — net diff zero, and it reported
itself unprompted. Worth knowing for two reasons: **the screenshot is what found the live-region
defect**, so the capability was genuinely needed; and a read-only reviewer currently has no
sanctioned way to look at a rendered page. **Give future `-P` briefs an explicit, bounded screenshot
allowance** rather than an instruction agents must break to do the job.

### DONE — `16e-foryou-spec` and `16e-search-A-3`. **The For You triple is dispatchable.**

**`docs/design/screens/FOR_YOU.md`** (645 lines, 12 sections) is the sixth and last big screen
spec. `-W` and `-A` are dispatchable from it together, then `-P`. **Settings/Onboarding is then the
only screen left**, and after that `16f`.

**Its scoping decision is the important part, and it is the right one.** Sofia's decision 2 in
`USER_DECISIONS.md` has three parts. Only **the loading-state hold** is in this triple; **podcast
dedupe and mixed-content carousels are split out** as a sequenced follow-on
(`16e-foryou-shelves-S` then `-W`/`-A`), because they need cross-cutting backend work — unifying
candidate pools across media types — that would make an oversized wave bundled with a full
restyle. **Neither is dropped**; both are named with their own wave ids, which is the difference
between a split and a silent narrowing.

**And the follow-on is far smaller than it looks, because the mechanism already exists.**
`shelves.ts` already has `dedupeByParent` (`:53`) and `typeLabelsFor` (`:71`), both tested, and
both already called at `:175`/`:187`. What is missing is upstream and downstream, not the logic.

**A SEVENTH writer-with-no-reader, verified by the orchestrator rather than taken on report.**
`RecommendationShelf.itemLabels` is populated at `shelves.ts:187`, typed at `types.ts:133`, and
asserted in `shelves.test.ts` — and a repo-wide grep across `apps` and `packages` finds **no
client reading it on either platform.** It is the payload that would let a mixed shelf label its
own items, computed and thrown away. Same family as the six before it.

Also established: **`parentId` is never populated anywhere in `apps/server/src`** outside types,
tests and `shelves.ts` itself — so the podcast-dedupe mechanism's key input has no writer. That is
the actual blocker on Sofia's "no two episodes of one podcast", and it is a data-plumbing problem
rather than a logic one.

**Byte-for-byte target named in advance, and it fixes a live three-way mismatch.** The external
item's label is ruled canonical as Sonora's literal **`"Not in library"`**. Web's badge text, web's
`aria-label` and Android's constant were **all three different** from each other and from Sonora's
source. The spec carries the full expected `aria-label`/`contentDescription` strings for both
platforms so the implementing waves converge rather than each picking one.

**Pre-ruled divergences** (the `ALBUM_DETAIL.md` technique, now standard): the merged-vs-split
accessibility mechanism is **idiom**; the FILL-axis nav-icon toggle is **pre-existing and out of
scope**; the quick-pick tile's mobile-column background is **intentional in Sonora's own source**,
not a migration gap.

**Android already satisfies the loading-state requirement in full** — `ForYouViewModel` fans out
three async sources via `coroutineScope` and awaits all before `Loaded`. **Only web needs the
behavioural change**; Android needs only its loading UI restyled from a bare spinner to a
layout-shaped skeleton. Told this plainly, an agent fills the slot rather than rebuilding — the
instruction that made the podcast triple's header come out byte-identical.

**`16e-search-A-3` closed the last art-less track row, and the tile was only half the defect.**
`MusicSearchViewModel.performSearch` resolved `baseUrl` and passed it to the artist and album
mappers **on the same line**, while calling `toSearchUi()` for tracks with no argument — so
`coverUrl` was null on the wire no matter what the UI did. **Adding the tile alone would have
shipped a styled fallback icon forever and looked entirely correct.** Two KDoc blocks asserting
this screen "never had cover art" were rewritten to name the cause rather than restate the symptom.
It also gave the screen its first Robolectric coverage, and pinned the non-navigable no-`albumId`
case with `onOpenAlbum` wired to `error()` so a stray navigation fails rather than passes quietly.

### `15d-1-books-P` is DONE, and it found a real fail-unsafe divergence on web

**Verdict on the pair: ship as-is, with one cross-platform behavioural bug to fix.** The typing
split the follow-up asked about is **fine** — Android route-scopes `availability` to
`RecommendedLibraryItem` because kotlinx's `MissingFieldException` would otherwise break every
non-recommended route sharing `LibraryItem`/`Shelf`; web widens its hand-mirrored interface with an
optional field because it has no runtime decode at all. Each is individually correct.

**The risk is a semantic difference layered on top of it, and nobody argued for it:**

- **Android** infers external as `availability != "owned"` — anything unrecognised is **external**.
- **Web** infers it as `availability === 'external'` at all four call sites — anything unrecognised
  is **owned**.

**So on web, a missing or unrecognised value silently reintroduces exactly the dead-end this wave
existed to close**: the card renders as an ordinary owned book with no badge, and tapping it routes
to `/item/:id` for an id Audiobookshelf has never heard of. Android degrades the whole shelf to
empty instead — contained, and safe. **Labelled drift, not idiom:** the `=== 'external'` convention
was inherited unexamined from the music sibling, and nothing in `types.ts` or any commit message
states a decision that web should read an unknown value as owned.

**The fix is four call sites** — `Carousel.tsx:186`, `Carousel.tsx:247`, `HomePage.tsx:311`,
`MusicHomePage.tsx:118` — from `=== 'external'` to `!== 'owned'`. It adds no runtime validation and
closes the asymmetry at its root. Being taken as `15d-1-books-W-2`, held until `16e-album-W` is out
of `apps/web`.

**Two further rulings, both recorded so nobody re-derives them:**

1. **Web's two request panels: this wave made the right call.** Android never auto-submits for
   either medium, and `AskForBookPanel`'s own comment calls explicit-submit the contract every other
   search here already has — so **web's music auto-submit is the outlier**, not the new book
   behaviour. The follow-up is to drop the eager `submittedTerm` seed in
   `MusicRequestSearchPanel.tsx`, not to spread auto-submit to books.
2. **The subtitle colour role is drift, and web is the correct one.** `SONORA.md` §3.5 is explicit —
   `accent-ink` when clickable, **plain `fg` otherwise** — and web matches it. `MediaHeader.kt:184`
   renders the non-link subtitle `onSurfaceVariant` unconditionally. Fix Android to a full-emphasis
   role. This settles a question three triples have now inherited.

**Two things the review could not verify, stated rather than glossed:** everything Android-side is a
source read (no device, no JDK), and web's `for-you-external-book.spec.ts` was read rather than
executed, since another agent held the Playwright port.

### SESSION HAND-OFF, 2026-08-20 — read this first

**`main` was `207f1f2` when this block was written; it has moved on several times since — read the newest section rather than this line.** Nothing is claimed
and nothing is in flight. `docs/agent-specs/` is empty.
Every wave dispatched this session was either merged or is on a named branch described below.

**Two screen triples completed** (`16e-album`, `16e-search`), **five waves of correction and
follow-up**, **one spec written** (`NOW_PLAYING.md`), and **one wave deliberately held**.

**SUPERSEDED — the `16e-nowplaying` triple is DONE**, both halves merged on 2026-08-20; see its
own section below for what landed, what `-P` must rule on, and the worker-count finding that
corrects this file's verification advice. Sonora's tabbed desktop panel remains **deliberately not
built** — that ruling from the `16e-nowplaying-spec` merge commit still stands.

**`16e-nowplaying` and `16e-foryou` are both complete, `-P` included, and `SETTINGS.md` — the last
screen's spec — is written and merged.** The next thing to do is the **`16e-settings` triple**:
dispatch `-W` and `-A` together from that document, then `-P`. After it, only `16f` remains. The
remaining `--m3-*` consumers are `Fab`, `ListItem`, `Marquee`, `NavigationBar`, `SearchField`,
`Snackbar`, `TopAppBar` — deletion is still not close.

#### The three things this session learned that are worth more than the features

1. **`isolation: "worktree"` is what creates the worktree — the reset instruction alone is a
   loaded gun.** `CLAUDE.md` documents that an isolated agent must `git reset --hard <tip>` as its
   first action. Dispatch that same spec **without** the parameter and the agent has no worktree, so
   it runs in `~/src/auralis-src` and its first action **resets the shared checkout under every
   other agent's feet.** That happened here: two merge commits were discarded and a reviewer
   reported the tree vanishing mid-read. Recovered from the reflog, nothing lost.

   **The check, now mandatory before believing any dispatch is isolated:**

   ```bash
   ls .claude/worktrees/agent-<id>   # no directory => it is in YOUR checkout
   ```

   **Pair the parameter with the instruction or write neither.** A read-only reviewer needs no
   worktree and **must not be given the reset line at all** — it only ever needed to read.

2. **A prescribed fix from a review can be wrong, and "the tests disagree" is a signal to re-check
   the prescription.** `15d-1-books-P` ruled web's `availability === 'external'` fail-unsafe and
   prescribed Android's `!== 'owned'`. Taken literally it **marked the entire library external** —
   every owned book badged "not in your library", every tap sent to the request flow. The two
   typings are not interchangeable and **the same review had established why one paragraph earlier.**

   Two sharp corollaries. **The agent had to override a correct existing test to land it** — the
   test encoded the real contract, the spec said otherwise, so it changed the test and said so
   honestly. **And nothing naming `availability` caught it**: it surfaced in a test about _layout at
   768px_. Breadth caught what aim did not.

3. **A spec's recon is a starting point, not a census.** `SEARCH.md` was wrong twice about the same
   file: `MusicRow` has **nine** call sites, not two, and track rows do **not** use `MusicRow` at
   all — which is why Android's track results shipped with no cover art through a whole triple.
   **Tell implementing waves to verify the call sites they are handed** rather than trusting the
   count, and have them report the real number.

#### A THIRD member of the Compose-test trap family, and the three are now one rule

`16e-search-A-2` compiled clean and failed on two Robolectric tests, each a bare `AssertionError`
naming neither the tag nor the cause. **The tags existed. They sat inside MERGED semantics nodes** —
`OutlinedTextField` merges its descendants, and the track row deliberately groups its children into
one announced node, which is exactly what this screen's accessibility tests assert. The default
lookup searches the **merged** tree, where a descendant's tag is invisible. `useUnmergedTree = true`
is the fix.

**All three now on record, and the tell is identical every time — a bare `AssertionError` pointing
away from the cause:**

1. **A click that neither throws nor fires its callback is off-viewport.** `assertExists` on the same
   tag passes, because existence only needs the node composed and a click needs it displayed.
2. **`assertExists` is a MEMBER and must not be imported; `assert`, chained directly onto it, is a
   top-level extension and must be.** The package mixes both.
3. **A `testTag` inside a merged node needs `useUnmergedTree = true`.**

**None is inferable from the call site and all three read as correct Kotlin.** The unifying rule:
**semantics merging on these screens is deliberate product behaviour, so any test reaching for
something inside a merged node must say so** — and any test clicking on a `LazyColumn` must scroll
first or use `performSemanticsAction`.

**Budget two red Android rounds per wave, not because the code is bad but because this class of fact
is only checkable by compiling**, and nothing on this laptop can.

#### What is on a branch rather than on `main`

**`hold-15e-podcasts`** (pushed, `9fbb1cc`) — external podcast discovery via iTunes Search.
**Green: 777/777 server tests**, current with `main`, formatted. Its server side was reviewed and is
sound, its media-type gating **answers open follow-up 3**, and its provider was checked with a live
`curl` rather than trusted.

**It is held for a product reason, not a code one.** `ForYouScreen.kt:94` routes a podcast tap to
`playerViewModel.playItem(item.id)` with **no external check** — three lines below a books branch
that has one — so an external podcast hands a fabricated id to Media3. And **no podcast request flow
exists on either client** to redirect to. `main` auto-deploys, so this is the same call `15e-books`
was held for.

**The underlying question is with Sofia (queue `969711e`)** and blocks nothing: she asked for request
integration for **books and music, never podcasts**, so external podcast discovery has nowhere to
land by design. The natural destination is not a request at all but a **one-tap subscribe by RSS
feed** — Audiobookshelf supports it natively and iTunes already returns a `feedUrl`. Three options
were put to her: build subscribe, ship it inert, or drop it.

#### Named, unfixed, and deliberately so

- **`MusicSearchScreen.kt`'s `SearchTrackRow` has the same missing-art defect** just fixed on the
  unified search screen, and is now the **only** track row in the app without a cover tile. Named by
  the wave rather than fixed, because it is a different screen.
- ~~**`.auralis-item-header__actions` has no `flex-wrap`**~~ — **CLOSED, measured rather than
  argued.** The four controls occupy **310px at a 360px viewport** (the Android baseline width), the
  row does not overflow, and the document does not scroll horizontally. Screenshotted and eyeballed
  as well as measured. A regression guard now lives in `e2e/app/music.spec.ts`, because the risk is
  otherwise invisible: a row that has overflowed still contains every button and still passes every
  other assertion on the page. **The margin is real but not large** — a fifth control, or a longer
  label from a copy change, is what would break it, and that test is the only thing that would
  notice.
- **`SearchField`'s `aria-expanded` can go stale** — Mantine's `Popover` closes the dropdown
  visually on an outside click, but this component keeps a parallel `useState` and is never told, so
  a screen reader can briefly announce an expanded combobox with nothing open. Recorded in a comment
  rather than fixed blind; the real fix needs its own keyboard pass.
- **The non-clickable subtitle colour role still differs** (Android muted, web full emphasis). The
  _clickable_ case was closed by `16e-album-A`. This belongs to a `SONORA.md` pass, not a screen wave.
- **No test pins what happens to a click on a chip covered by an open suggestion dropdown.** Ruled
  acceptable behaviour twice, by two independent reviewers — **do not re-open it** — but it is
  asserted nowhere.

### 2026-08-20 — both claimed waves were salvaged from dead agents. **The album triple's web half is landing; `15e-podcasts` is HELD.**

The session that claimed `16e-album-W` and `15e-podcasts` died. Neither wave was lost, but neither
had ever been executed, and one held **929 lines entirely uncommitted** in a worktree that is
deleted with its session.

- **`15e-podcasts`** — the agent committed **nothing at all**. Seven files, 929 insertions, sitting
  as working-tree changes. Salvaged as `ee26e7e`.
- **`16e-album-W`** — the agent committed its product change (`11c9e68`) and then died holding its
  **own e2e spec** uncommitted. Salvaged as `046be75`.

So the spec-side "commit before you background a long run" instruction held for one half of one
wave and **not the other half of the same wave**. It lowers the frequency; it does not hold. The
orchestrator-side worktree check is the load-bearing one, and this is the second session running in
which it has paid for itself.

#### `15e-podcasts` is HELD FOR A CLIENT WAVE — and Android's exposure is live, not latent

Reviewed by an agent that did not write it. **The server side is correct**: both discovery builders
gate on the pool's own medium (`routes/libraries.ts:135`, `:212-296`) and return `null` before any
provider I/O, so a book library can never trigger the iTunes provider or vice versa — which
**answers open follow-up 3**, the route _is_ properly medium-scoped now. Every item carries
`availability: 'external'` on the wire.

**The tap-through is where it breaks.** `ForYouViewModel.kt:88-95` fetches recommended carousels for
`mediaType = "podcast"` as well as `"book"`, so Android genuinely reaches this shelf — and
`ForYouScreen.kt:94` is `ForYouContentType.PODCASTS -> playerViewModel.playItem(item.id)`,
**unconditional, with no `isExternal` check**, three lines below a `BOOKS` branch that has one. A tap
hands `external:itunes:<id>` straight to Media3. That is worse than the book precedent's dead-end
page: a fabricated id given to the _player_, not a failed detail fetch. **And there is no podcast
request flow on either client to redirect to**, so wiring the guard in has nowhere to send the tap.

**Web is safe only incidentally** — `HomePage.tsx:226` is the sole web caller and is hardcoded to the
book library's id. Underneath that sits a second real defect: `forYouFeed.ts:100-109` labels every
shelf from this route `contentType: 'books'` unconditionally, with a doc comment claiming the route
is "always about audiobooks". **That comment is now false**, and the moment web points this at a
podcast library a podcast shelf renders as a book carousel.

**So the wave is on branch `hold-15e-podcasts`, not on `main`.** `main` auto-deploys to `:latest`
and mediaserver pulls every fifteen minutes. This is the same call, for the same reason, that
`15e-books` was held for.

**It is also red, and that must be fixed before it can land whenever it lands.** Two pre-existing
tests the wave broke and never noticed: `external/registry.test.ts` asserts in its own title that
there is "still no podcast provider", now false; and `routes/libraries.test.ts:514` — the **book**
shelf's outer-catch test — fails because the wave's new media-type gate short-circuits on that
test's empty-pool fixture **before** the deliberately-throwing provider is reached. Additionally
`buildPodcastExternalDiscoveryShelf` is imported by **no test at all** — only its three pure helpers
are covered, where the book sibling has a full `app.inject()` block.

**The live `curl` was done, and this is the 15a lesson being applied rather than relearned.** iTunes
Search returns 200 with the fields the schema assumes, `genreId` alone genuinely returns zero
results (justifying the term-only strategy), and `itunes.test.ts` asserts the outgoing query as an
**exact** set via `toEqual`. That half of the wave is sound.

**The open product question, which is why "add the guard" is not a sufficient plan:** the user asked
for request integration for **books** and **music**, never for podcasts — so external podcast
discovery has nowhere to land by design. The natural destination is not a torrent request at all but
a **one-tap subscribe by RSS feed**, which Audiobookshelf supports natively and which iTunes Search
already returns a `feedUrl` for. That is a coherent, much smaller feature than a request flow. **It
is with Sofia; it blocks nothing else.**

#### `16e-album` is DONE — the third screen triple, complete on both platforms with a clean `-P`

**`main` is `18799b1`, green on `CI` and `Android`.** Verified before pushing rather than after:
**220 `app` + 212 `ui-desktop`/`ui-mobile` Playwright at CI's own parallelism, 1718 unit**, typecheck
across every project, lint clean. The six salvaged e2e specs **passed on their first ever execution**.

**The `-P` verdict is clean, and the headline is methodological again: the meta line matched byte for
byte for the THIRD triple running.** Web's `composeAlbumMeta` and Android's same-named private
function independently produce `"2021 · Synthwave · 2 tracks · 7 m"` — separator confirmed U+00B7 on
both by a codepoint scan rather than by eye, same track-count rule, same `<= 40 && fully loaded`
duration gate, same rounding. **The per-platform value table in the spec is now demonstrated, not
hypothesised.**

**The `ALBUM_DETAIL.md` pre-ruling fired exactly as intended.** The spec stated in advance that the
artist link is the first genuinely symmetric case and that any asymmetry there would be drift; both
platforms wired it to their existing artist route, and the `-P` had nothing to adjudicate. **Pre-deciding
a divergence in the spec is cheaper than ruling on it afterwards** — carry that into every remaining
screen.

**Two follow-ups, neither blocking:**

1. **The subtitle colour divergence that three triples inherited is now MOSTLY CLOSED, and this file
   should stop describing it as open.** `MediaHeader.kt:185` now reads
   `if (onSubtitleClick != null) accentInk else mutedColor`, so the **clickable** case — the common
   one — matches web and matches `SONORA.md` §3.5 on both platforms. What survives is only the
   **non-clickable fallback**: Android muted (`onSurfaceVariant`), web full emphasis (`--surface-fg`).
   Pre-existing, out of this triple's scope, and a `SONORA.md` pass owns it.
2. **`.auralis-item-header__actions` has no `flex-wrap`** (`app.css:402-407`) and web's album header is
   the first call site to put **four** controls in it. Confirmed live by reading the CSS, not
   inferred. Playwright asserts testids and text and can never see a compact-width overflow, so this
   wants an eyeball, not a test.

**The coverage asymmetry is real and, unusually, favours web here.** Android's nine new
`AlbumDetailContentTest` cases are Robolectric — confirmed a **genuine uncached execution** by
grepping the job log for a bare `testDebugUnitTest`, not by reading a badge — but Robolectric proves
a node exists with the semantics that were written, not what TalkBack announces. Web's six specs
drive real Chromium. Every Android claim in that review is a source read plus a Robolectric pass.

#### `16e-search` — DONE, the fourth triple, `-P` clean. **`16e-search-A-2` is the one real defect it found.**

Web: 227 `app` + 214 `ui` Playwright, 1727 unit. Android green on `a8adcd1`, uncached. All six CI
jobs green on `624ffab`. Sofia's unscoped **"global search needs suggestions" is delivered on both
platforms.**

**Fourth triple running in which the composed strings matched byte for byte** — the `-P` hex-dumped
the Kotlin source (`c2 b7`) against web's `SEPARATOR = '·'` rather than eyeballing them, and all five
of §6.4's literal status strings match exactly, ellipsis and quoting included.

**THE REAL DEFECT, and why it survived a whole triple: Android's track result rows have no cover art
at all.** Every other kind got it. Tracks do not use `MusicRow` — they use a separate, art-less
`SearchResultTrackRow` — **and §2 of `SEARCH.md` asserts they do use `MusicRow`.** That is a **spec
recon error**, so the `-A` wave's `MusicRow` fix never reached them and no commit mentioned tracks.
Being taken as `16e-search-A-2`.

**That is the second recon error in this one spec** — it also claimed `MusicRow` had two other call
sites where it has nine. **A spec's recon is a starting point, not a census.** State in future specs
that the implementing wave must verify the call sites it is given, rather than trusting the count.

**Also drift, Android side: no leading search icon.** Web's has had one since long before this
triple; §3's table gives both platforms a value for that row. Folded into `16e-search-A-2`.

**Two follow-ups closed inline** (`866c6bb`): the `40vh` dropdown cap now has a test, **confirmed to
discriminate** by deleting the CSS rule and watching it go red — that class of defect, a component
rendering with a style that silently did not apply, is invisible to a suite asserting testids and
text. And the `aria-expanded` staleness is recorded in a comment rather than fixed blind.

**One earlier claim corrected by the `-P`, worth not inheriting:** the framing that Mantine's
built-in outside-click dismissal is "inert" was **overstated**. Read against Mantine's own source,
the dropdown **does** visually close; what goes stale is `SearchField`'s own bookkeeping, so
`aria-expanded` can read `true` with nothing open until the next focus or keystroke.

**The tie-break went to the orchestrator, on the reviewer's own reasoning.** A follow-up review had
argued the dropdown covering the filter chips was a UX regression that could misdirect a chip tap.
The `-P` confirmed the dropdown is an **opaque** panel, concluded a user cannot see a chip to
misclick it, and agreed this is ordinary combobox behaviour. **Do not re-open it.** The genuine
defect was unbounded height, and that is fixed.

**Ruled clean, with evidence, so nobody re-checks:** suggestion ordering, cap and exclusions match;
Android's series/author exclusion is **forced idiom** (no route exists); §7's out-of-scope list is
respected in both directions; no `overline` call site on this screen, so the podcast triple's
announce-order bug class does not apply; and the nine `MusicRow` call sites were confirmed unchanged
**by diff rather than by report**.

#### `16e-search-A` is landed and CI-GREEN on `a8adcd1` — `16e-search-W` is in flight, `-P` is owed

**Verified as a genuine uncached execution, not a badge:** the Android job log carries bare
`> Task :app:compileDebugUnitTestKotlin`, `> Task :app:testDebugUnitTest` and
`> Task :app:testReleaseUnitTest` with no `FROM-CACHE`, so the new Robolectric coverage really ran.

**It closes two pre-existing drifts** the spec had pinned with file:line evidence: book result rows
were **non-interactive** behind a comment claiming no book-detail route existed (one has since
`16e-book-A`), and the search screen had **no accessibility semantics at all** where web announces
status through a live region.

**It corrected the spec's own recon, and that is the transferable part.** `SEARCH.md` said to check
`MusicRow`'s "other two call sites"; there are **nine, across seven files**. Rather than resize the
shared row in place, the wave gave it optional `artSize`/`artCornerRadius`/`fallbackIcon` parameters
defaulting to today's shape, so the other eight call sites cannot change. **A shared component
resized in place reads as correct in review and is wrong on eight screens** — the same shape as this
file's widened-fixture lesson. **Recon in a spec is a starting point, not a census.**

**One thing `-P` must check:** the wave **did not add a leading icon** to the search field, reading
§3's row as pinning the icon's token value rather than mandating a new icon. It flagged this itself.
Web may well have added one.

**ONE red round, one line — and it is the mirror of a trap already in this file.** The whole failure
was `Unresolved reference 'assert'`. This file already records that **`assertExists` is a MEMBER** of
`SemanticsNodeInteraction` and must **not** be imported, while `onNodeWithText` on the lines either
side of it is top-level and must be. **`assert` is the same trap wearing the opposite face**: a
top-level extension in `androidx.compose.ui.test`, chained immediately onto `assertExists`, reading
exactly like the member it is attached to.

**So the rule is neither "assertions are members" nor "assertions are imports".** That package mixes
both and the call site does not tell you which. **When a Compose test assertion will not resolve,
check the package rather than the spelling.**

**Also confirmed, and worth knowing when Android goes red:** `bc1e946`'s **`CI` went green and
`Publish` succeeded** while `Android` was failing. They are separate workflows and the container
image carries no APK, so **a red Android never threatens the live deployment** — do not hold a
web push waiting on it.

**And the `pre-push` lint race is real, again.** The push failed once on the whole-repo eslint and
succeeded on an immediate retry with no change, while a subagent was mid-write in `apps/web`.
**Retry once before believing it**, exactly as this file already says.

#### `15d-1-books-W-2` landed, then SHIPPED A TOTAL REGRESSION, and the correction is the lesson

**Read this before acting on any parity review's prescribed fix.**

The `15d-1-books-P` review ruled web's `availability === 'external'` fail-unsafe and prescribed
Android's direction — `!== 'owned'` — at four call sites. That prescription is **wrong on web**, and
taken literally it marked **the user's entire library as external**: every owned book on Home
rendered a "not in your library" badge and every tap went to the request flow.

**The two typings are not interchangeable, and the same review had already established why one
paragraph before it made the recommendation.** Android **route-scopes** `availability` to its
recommended-item model where kotlinx declares it **required**, so it is always present at the point
of the check. Web mirrors its types **by hand with no runtime decode** and the field is **optional on
an interface shared by every item** — an ordinary Audiobookshelf book carries no `availability` at
all. So on web, **absent is the common case and means owned.**

**The rule now lives in one place with its reasoning**, `apps/web/src/api/availability.ts`:
absent means owned; **present-but-unrecognised means external**, because rendering an unknown state
as an ordinary owned item is what dead-ends a tap at an id Audiobookshelf has never heard of. That
was the review's real concern and it **is** still closed.

**Three things worth more than the fix:**

1. **The wave had to override a correct existing test to land the wrong behaviour.**
   `Carousel.test.tsx`'s _"does not append anything for an owned item, whether availability is
   'owned' or absent"_ was encoding the real contract. The spec said otherwise, so the agent changed
   the test — and reported doing so honestly. **An existing test that contradicts your spec may know
   something the spec's author does not.** Treat that collision as a signal to re-check the spec, not
   as an obstacle.
2. **Nothing that names `availability` caught it.** It surfaced in `tablet-breakpoint.spec.ts`
   asserting that clicking Dune opens `/item/item-dune` — a test about **layout at 768px**. The
   suite's value here came from breadth, not from aim. `for-you-external-book.spec.ts` now pins both
   directions directly, so the next regression fails on a test that names the rule.
3. **A green targeted run would have missed it.** The agent ran `pnpm vitest run apps/web` (606/606)
   and typechecks, all green, and was correctly told not to run Playwright. **The orchestrator
   running the browser suite before pushing is what caught it** — the same shape as the flake found
   two sessions ago. Keep that division: agents run targeted tests, the orchestrator runs the suite.

**Also merged: `16e-search-spec`** (`docs/design/screens/SEARCH.md`), the fourth screen spec. **No
`-S` wave is needed** — both existing search routes already return everything results and
suggestions require, so suggestions derive client-side from responses already in flight. **Lyrics
search is named explicitly out of scope** (it needs an external full-catalogue provider, unlike the
per-track lookup that exists).

**Its headline finding is this project's fifth writer-with-no-reader, and the first at the
component-prop level rather than the route level:** `packages/ui/src/components/SearchField.tsx`
already has a complete, tested ARIA-combobox suggestion mechanism — `suggestions`,
`onSuggestionSelect`, full keyboard navigation, covered by `e2e/ui/search-field.spec.ts` — that
**nothing in the app has ever called with real data.** So web's half of Sofia's "global search needs
suggestions" is mostly **wiring**, not building. It also specifies two pre-existing Android drifts:
book result rows are still non-interactive behind a comment claiming no book-detail route exists
(one has since `16e-book-A`), and the search screen has **no accessibility semantics at all** where
web announces status through a live region.

#### THE INCIDENT WORTH MORE THAN EITHER WAVE — `isolation: "worktree"` is what creates the worktree

**A subagent ran `git reset --hard` inside the shared checkout and discarded two merge commits.**
Nothing was lost — the objects survived in the reflog and were restored — but the cause is a trap
this file had not named, and it is one keystroke wide.

`CLAUDE.md` correctly documents that an isolated agent must `git reset --hard <branch tip>` as its
first action, because `isolation: "worktree"` bases the worktree on `origin/main`'s empty initial
commit. **That instruction is only safe when the `Agent` call actually passed
`isolation: "worktree"`.** Dispatch the same spec _without_ that parameter and the agent has no
worktree of its own — it runs in `~/src/auralis-src` — and the very first thing you told it to do
resets the shared checkout onto an older commit, under any concurrently-running agent's feet. A
reviewer mid-review reported the tree vanishing from under it.

**The check is one line, and it is now mandatory before believing any dispatched agent is isolated:**

```bash
ls .claude/worktrees/agent-<id>   # no directory => it is in YOUR checkout
```

**Two rules fall out.** Never put a bare `git reset --hard` in a spec without `isolation: "worktree"`
on the same `Agent` call — pair them or write neither. And a docs-only or review-only agent needs no
worktree **and therefore must not be given the reset instruction at all**; it only ever needed to
read.

### Session end, 2026-08-19 — **`main` is `012132b`**. Two things landed: the podcast triple, and books that recommend beyond the library

Nothing claimed, nothing in flight, `docs/agent-specs/` empty. **`integration-15e-books` is deleted**
(2026-08-19, `git branch -d`, which refuses anything unmerged) — it existed only to hold a wave off
`main`, and `main..integration-15e-books` was empty.

Verified on the integration branch **before** merging rather than after: **215 `app` + 212
`ui-desktop`/`ui-mobile` Playwright at CI's own parallelism, 1713 unit, typecheck across every
project.** `6bbb5ba` (the podcast triple) is green on `CI`, `Android` **and** `Publish`, so it is
already on `:latest`. `012132b` was pushed after that and its CI is the next thing to read.

**1. `16e-podcast` — the second screen triple, complete on both platforms with a clean `-P`.**
See `ROADMAP.md` §16 for the full record. The headline is methodological: **the per-platform
geometry table works, and there are now two triples' worth of evidence.** Two agents that never saw
each other's work produced meta lines matching **byte for byte**, separator glyph included — the
`-P` compared code points rather than eyeballing them.

**Reuse the asymmetry instruction verbatim.** Android's header already existed, so the spec's Android
column read _"already satisfied by `MediaHeader`, do not rebuild"_ — and `MediaHeader.kt` is
byte-identical after the triple, confirmed by an empty `git diff`. Told plainly that something is
already built, an agent fills the slots rather than rebuilding, which is exactly how `16e-book`
drifted.

**`PodcastDetailScreen` had no Robolectric coverage at all and now has nine cases.** `AlbumDetailScreen`
still has none — that gap is real and unclosed.

**2. External book recommendations reach both clients.** `15e-books` + `15d-1-books-A` + `15d-1-books-W`.
Books are her priority-1 medium and had no external source at all. **The three shipped together
deliberately**: the server wave alone would have put a card on her For You feed indistinguishable
from a book she owns, leading to a generic error page — and `main` auto-deploys.

**Two findings worth more than the feature:**

- **The research doc was wrong and one `curl` proved it.** `api.audnex.us` has **no author→books
  listing** (`/books?author=…` and `/authors/:asin/books` both 404), so it cannot answer "what
  unowned book should we recommend". The wave moved to **Open Library**, which the doc had filed as
  a redundant fallback. An independent reviewer re-ran the requests and confirmed both halves. This
  is `15a`'s fixture-validates-the-response lesson being **applied** rather than re-learned.
- **ISBN is deliberately NOT threaded into `ExternalCandidate.identifiers`, and the reasoning was
  verified rather than asserted.** `ownership.ts`'s `comparePair` treats a same-field-different-value
  identifier as a **veto** that bypasses the title/author match entirely, and an audiobook's ISBN is
  commonly absent from a print work's ISBN array — so threading it would make genuinely-owned titles
  leak back as undiscovered. The reviewer read `comparePair` and confirmed the veto is real. **Do not
  "improve" this by adding ISBN.**

### Open follow-ups, none blocking, in the order I would take them

1. **A `-P` is owed on `15d-1-books`.** Its two halves type `availability` differently **on purpose**
   — Android route-scopes it (kotlinx throws `MissingFieldException` on a required field its other
   endpoints do not send), web makes it optional on a hand-mirrored interface with no runtime decode,
   matching web's own music sibling. Both are defensible; nobody has ruled on the pair.
2. **Web's two request panels now behave differently.** `/music/requests?prefill=` **auto-submits**;
   the new `/requests?prefillTitle=` deliberately does **not**, matching Android. The cross-platform
   contract is met at the cost of two web siblings disagreeing — flagged by the wave itself, not
   found later.
3. **`GET /libraries/:id/recommended` is not gated by library media type server-side**, so a podcast
   library could in principle receive a book-shaped external item. Android's tap redirect is
   book-only (no podcast request flow exists to redirect to), so such an item would still dead-end —
   **same failure mode as before, not worse.** Verify whether the route is genuinely book-scoped.
4. **A subtitle colour-role divergence, inherited from `16e-book` rather than introduced.** Web's
   non-link subtitle renders `--surface-fg` (full emphasis); Android's is always `onSurfaceVariant`
   (muted). Now visible on every podcast, since a publisher name is always the never-linked case.
   One for a `SONORA.md` pass: muted on both, or full emphasis on both.
5. **Open Library's recommendation _quality_ is unassessable here** — same standing caveat as every
   external-discovery wave. It needs her real library, which needs the Audiobookshelf credential this
   file has owed her for weeks.

**Closed this session, so nobody re-opens them:** the accessibility-order divergence the `-P` found
(web announced an episode row **date-first** because `ListItem` renders `overline` before `headline`
and this is the first call site to use `overline`; fixed with an explicit `aria-label` rather than by
swapping the props, since swapping would move the date above the title _visually_ — a design change
to fix a screen-reader bug), and web's `themeStore` rehydrating `localStorage` with **no validation**
where Android falls back explicitly, which was one of the two drifts `16f-P` named.

**Android's pending-state divergence was ruled acceptable idiom, not a defect** — its
`pendingEpisodeId` clears on any `PlayerUiState` change rather than on that episode's request
settling, because `playEpisode` is fire-and-forget with no completion signal to await. Bounded and
self-correcting. Do not re-litigate it.

### Two operational findings that qualify this file's own advice

**1. Two suites at once starve each other on this laptop.** Running `pnpm test` and `pnpm test:e2e`
**concurrently** produced a red result from each: `themeStore.test.ts` timed out at its 5s limit, and
**four `e2e/ui/button.spec.ts` tests failed on `ui-desktop`**, all four with `Test timeout of 30000ms
exceeded` and **no assertion mismatch**. Alone, the unit file passes and the button spec passes
**9/9 in 50s**, each test taking ~6s against a 30s budget.

So **"the orchestrator runs the full suite" does not mean it runs two of them at once.** A timeout
with no assertion mismatch, on tests that pass in a fifth of their budget alone, is contention. The
same applies while subagents work: a heavy orchestrator run starves _their_ tests, and they will
misdiagnose it as their own breakage.

**2. The `pre-push` whole-repo lint blocks spuriously while agents are active** — twice this session,
both times passing on an immediate retry with no change. This file already noted it as a one-off; it
is not. It is a whole-repo eslint racing a file a subagent is mid-write on. **Retry once before
believing it**, and read whether it names a file you actually touched.

**A third, smaller one:** a foreground `Bash` call caps at ten minutes, and the full `pnpm test:e2e`
takes ~12. Run it **split by project** (`--project=app`, then `--project=ui-desktop --project=ui-mobile`)
rather than backgrounding it — a backgrounded run was killed mid-suite here at test 67 of 427, which
looks exactly like a failure and is not one.

### `16e-album` is HALF DONE — spec and `-A` merged; **`16e-album-W` and `16e-album-P` are owed**

**`main` carries `docs/design/screens/ALBUM_DETAIL.md` (520 lines, all 44 citations verified to
resolve) and `16e-album-A` (`4979fc3`).** Nothing is claimed and nothing is in flight.

**This is a deliberately incomplete triple, and the web half is the next thing to do.** Per
`CLAUDE.md`'s frontend-parity rule a wave that changes one platform and says nothing about the other
is incomplete rather than merely first — so `16e-album-W` is owed, then `16e-album-P`. The spec is
the contract for both; do not build web against Android's output.

**Web's half is unusually cheap**, and that is the opposite of the last two triples. Android already
adopted `MediaHeader` here in `16e-book-A-2`, so `-A` filled its unwired `meta`/`actions` slots.
**Web has never used the shared `MediaHeader.tsx` on the album page**, so `-W` is a plain third
adoption — no extraction needed, since `16e-podcast-W` already built the component.

**What `-A` landed, so `-W` builds to the same thing:** the meta line
(`"2021 · Synthwave · 2 tracks · 7 m"` shape), Play and Shuffle in the header's `actions` slot
(omitted when there are no tracks), a linkable artist subtitle, a currently-playing track indicator,
merged row semantics announcing `"Tidal Lines, 3:34"` and `"Static Coast, 3:18, Playing"`, and
`AlbumDetailScreen`'s **first ever** Robolectric coverage — it was the last of the three detail
screens with none.

**`MediaHeader.kt` gained one optional `onSubtitleClick` parameter with a default.** It is shared by
three screens; verified by diff rather than by report that `BookDetailScreen` and
`PodcastDetailScreen` are untouched, so their subtitles are unchanged by construction. The subtitle
`Text` lives inside the component's own `Column`, which is why a caller-supplied slot could not carry
the click.

**`16e-album-A` is CI-green on `79c0134`, after two red rounds that bought a lesson worth more than
the wave.** Both rounds were the **same** cause wearing two faces, and it is now the fourth time the
`LazyColumn` viewport trap has bitten a wave here:

> **A Compose click that neither throws nor fires its callback is off-viewport.** `performClick`
> injects a touch, and a touch must land inside the _displayed_ viewport to reach its target. When it
> does not, nothing throws — the failure surfaces as a bare `AssertionError` on the **next** line,
> pointing away from the cause. **The tell is that `assertExists` on the same tag passes**: existence
> only needs the node composed, a click needs it displayed.

Round one fixed Play/Shuffle by scrolling to the tag first. Round two needed a different instrument:
**`performSemanticsAction(SemanticsActions.OnClick)`**, which invokes the node's own click action and
so does not depend on gesture dispatch or geometry at all. **That is not a weaker assertion** — it
still fails if the handler is unwired and still pins that the album's _own_ artist id is reported.
Reach for it whenever a click must be verified on a tall screen.

**Why this screen and not the earlier ones:** `16e-album-A` gave the header both a meta line **and**
an actions row, making it the tallest in the app. The wave scrolled before asserting on track rows —
correctly — and assumed header content was safe, which was true until this header grew.

**Two things `-A` flagged honestly and a reader should not have to rediscover:**

1. **Its track-tap test locator is genuinely uncertain.** The merged-semantics node and the clickable
   node are **different nodes** — the click lives on `TrackContextMenu`'s own `combinedClickable`
   `Box`, an ancestor shared with `PlaylistDetailScreen` and `FavoritesScreen`. Nothing here compiles
   Kotlin, so **CI is the first place this resolves.** If it is red, the fix is almost certainly a
   locator adjustment in the test, **not** the product code — `onTrackClick` is wired identically to
   the already-working `onGoToArtist`/Play/Shuffle callbacks.
2. **Its cover-fallback assertion is a pin, not a proof** — that path was already correct from
   `16e-book-A-2`, so it cannot fail on a regression this wave could introduce. Kept only because the
   spec lists it as a required minimum. The wave said so itself rather than counting it as coverage.

**Three findings from the spec's recon that `-W` must act on:**

1. **Web's album track rows carry an `aria-label` that drops duration entirely** — a real web-side
   accessibility gap, found by looking rather than by a review afterwards. §11 pins the announced
   shape for both platforms; `-W` closes it.
2. **The artist link is the first genuinely symmetric case across the three triples** — both
   platforms already have an artist screen and a working route — so the spec states outright that any
   asymmetry there is **drift, not idiom**. That is a ruling `-P` would otherwise have to guess at.
3. **No BFF change is needed.** There is no single-item album route, and `Album`'s `productionYear`,
   `genres` and `trackCount` are already fetched by both clients and simply discarded today.

### What to pick up next

1. **`16e` — the remaining screens.** Done: book detail, podcast detail. Left: **Music/Album**,
   **Search**, **Now Playing/Queue/Mini player**, **Settings/Onboarding**, and For You/browse.
   `docs/design/screens/PODCAST_DETAIL.md` is the template to copy, and `BOOK_DETAIL.md` beside it.
   **`AlbumDetailScreen` has no Robolectric coverage**, which makes Music/Album the natural next one.
   **One `-W` in flight at a time** — the Playwright port serialises them; `-A` halves and spec
   authoring parallelise freely.
2. **The remaining `--m3-*` consumers**, measured rather than guessed: `Fab`, `ListItem`, `Marquee`,
   `NavigationBar`, `SearchField`, `Snackbar`, `TopAppBar`. Deletion is **not** close.
3. **Phase 15's remaining waves** are disjoint from all of this and need no browser, so one can run
   beside any `16e` triple — that is the only parallelism this repo has left.

**Still with Sofia, still blocking nothing:** queue `dbfb46e` (should album-art-derived colour ever
drive the accent?) and `abbaca2` (the two WCAG numbers).

### Two suites at once starve each other on this laptop — do not read a failure from a concurrent run

Measured 2026-08-18, and it qualifies this file's own advice. The orchestrator ran `pnpm test` and
`pnpm test:e2e` **concurrently**, and got a red result from each: `themeStore.test.ts` timed out at
its 5s limit, and **four `e2e/ui/button.spec.ts` tests failed on `ui-desktop`**, all four with
`Test timeout of 30000ms exceeded` and **no assertion mismatch**. Re-run alone with nothing else
loaded: the unit file passes, and the button spec passes **9/9 in 50s**, each test taking ~6s
against a 30s limit.

So the baseline on this tree is **green** — 416 passed plus four starvation timeouts — and the
lesson is narrow and worth keeping: **"the orchestrator runs the full suite" does not mean it runs
two of them at once.** A timeout with no assertion mismatch, on tests that pass in a fifth of their
budget when run alone, is contention rather than a defect. The same applies while subagents are
working: a heavy orchestrator run starves _their_ tests, and they will misdiagnose it as their own
breakage.

### `for-you.spec.ts`'s skeleton assertion is **inherently racy**, and that may mean 14a-2 was reverted for nothing

Measured 2026-08-17, and it is the most consequential thing this session found.

`for-you.spec.ts`'s _"a loading skeleton occupies the same box as a loaded card"_ went red on CI
after `16d-W-1`/`16d-W-1b`, which looked exactly like the docking change breaking layout stability.
Two experiments say it did not:

1. **The scrollbar hypothesis is dead by measurement.** Adding `overflow-y: auto` to the content
   column could have reserved classic-scrollbar width the document-scroll layout never took —
   deterministically collapsing a two-column grid, and only on a platform with space-taking
   scrollbars, which is a perfect local-green/CI-red shape. Measured at the same viewport:
   `clientWidth` is **740 before and 740 after**. Only `clientHeight` changes, which is what
   docking is _for_.
2. **The control arm settles it.** The **unmodified** spec against **fully pre-docking** `app.css`,
   at default parallelism, fails the identical assertion in the identical way (`toBeVisible()`
   passes, then `boundingBox()` returns `null`) on **4 of 5 repeats**. The race predates both waves.

**Its real cause is already in this file:** phase 14c documented that `HomePage` stitches four
independent async sources with nothing reserving their space, and that the fix is a product
decision nobody has taken. **That unfixed decision is what makes this test noisy.**

**The hypothesis worth carrying forward — flagged as a hypothesis, not a finding.** `14a-2` was
reverted on _"six clean CI runs before, two failed of three after"_ on **this same assertion**.
Against a demonstrated ~80% local baseline failure rate at default parallelism, a 2-of-3 sample is
not distinguishable from that noise. So the revert **may** have been unfounded, in the same shape as
the documented-unfounded 13e revert.

**Do not act on that yet, and be precise about what was not done:** nobody reproduced 14a-2's actual
change, its CSS-delivery-timing mechanism, or the bundle state of that moment — 16b and 16c have
landed a great deal since. The mechanism 14a-2's own write-up describes (a component painting before
its lazy-loaded CSS chunk applies) is real and **distinct** from this race. **Both can be true at
once:** a genuine CSS-timing risk existed, _and_ the samples used to judge it came from a test too
noisy to tell a regression from its own baseline. If anyone revisits `sideEffects`, that is the
first thing to settle, and it now needs a repeat-each baseline rather than three CI runs.

The test itself is now hardened rather than loosened: the mocked response is gated behind a
test-controlled promise so the skeleton is reliably capturable, and both box reads are polled. The
geometry comparisons and the `>= 2` count are untouched, so a real regression still settles on a
wrong number and still fails.

### `context-menu.spec.ts`'s focus-return test is independently racy — named, not fixed

It fails **8 of 8** when isolated with `-g` + `--repeat-each`, and passes **4 of 4** in every normal
full-suite run including a CI-equivalent `pnpm test:e2e`. Nobody has an explanation for the
asymmetry; the file is already `mode: 'serial'` and the test is self-contained. Nothing in either
docking wave touches focus, Escape handling or menu code.

**Left alone deliberately.** Hardening it inside a wave that is not about it would have hidden a
real unknown. Two practical consequences: **`--repeat-each` on a single `-g`-selected test is not a
neutral instrument** — it can manufacture a failure the real invocation never shows — and if this
one ever goes red on CI for real, it starts from "known flaky", not from "new regression".

### `--workers=1` is a **weaker** check than CI, and this file's own advice hid that

Paid for on 2026-08-17 by a red `main`. The orchestrator ran the full `--project=app` suite locally,
got **196 passed / 0 failed / 0 skipped**, ran `ui-desktop` + `ui-mobile` at **192 passed**, unit at
**1660/1660**, typecheck green — and CI then failed on the same tree.

**The local run used `--workers=1`. CI does not.** `playwright.config.ts` sets `workers: '100%'` and
`fullyParallel: true`, and CI runs a plain `pnpm test:e2e`. So the two runs were not the same
experiment, and the local one could not see anything caused by parallelism, contention or the
slower per-test timing that comes with it.

**This file told me to do that.** Its own guidance reads _"prefer `--workers=1` for a long
full-suite run"_ — sound advice for _reading_ a run, since interleaved output from four workers is
unreadable, but it quietly turns the authoritative-looking local green into a weaker check than the
thing it is standing in for. Both halves are true and they were never stated together.

**So: `--workers=1` for diagnosing, default parallelism for verifying.** A green `--workers=1` run
is evidence about correctness and **not** evidence about what CI will do. If you are about to push
and call something verified, run it the way CI runs it.

The failure it hid is the one with history: `for-you.spec.ts`'s _"a loading skeleton occupies the
same box as a loaded card"_, the same layout-stability invariant that failed CI-only twice on
`14a-2` and got that wave reverted. **It is the canary for any change to how the app lays out or
delivers CSS. When it goes red on CI and green locally, believe CI.**

### `app.css` has a **vitest** test that parses it as text — a CSS-only wave must run `pnpm test`

Cost half an hour on `16d-W-1`, 2026-08-17, and it is not discoverable by reading either file.

`apps/web/src/styles/layoutOverflow.test.ts` is a **unit** test that reads `apps/web/src/styles/app.css`
as a string and looks selectors up **literally**, then asserts on their rule bodies. So moving a rule
from one selector to another — which is exactly what a layout refactor does — fails it with
`no rule found for selector …`, naming a selector that is _supposed_ to have gone away.

The wave ran targeted Playwright specs, `format`, `typecheck` and `lint`, all green, and never ran
vitest, because "I changed CSS" does not suggest a unit suite. The orchestrator's own run caught it
at **1659/1660**.

**The instruction, for any wave touching `app.css`: run `pnpm vitest run apps/web`.** It is seconds,
and it is the only thing in the toolchain that sees this class of break.

**And when it fails, the fix is not automatically the test.** Here the reviewer had to establish
which of the two was wrong — whether the mini-player clearance padding had been _moved_ (fix the
test) or _dropped_ (fix the CSS, because the test's name records a real past defect: content
scrolling behind the compact mini player). It had moved, correctly: padding on `.auralis-shell--compact`
reserves nothing once the shell no longer scrolls. Re-pointing the test was right, and the reviewer
confirmed it still discriminates by stripping the `padding-bottom` and watching it go red — a
re-pointed text-scan test that no longer fails on the real defect is worse than a deleted one.

### The `UnifiedSearchViewModelTest` race is now demonstrated, not merely well-argued

**This file has asked for this sample for weeks and it is finally in hand.** The bar it set was
_several uncached executions_, and uncached ones only exist when a sha touches `apps/android` —
which is why a fix landed in `e71837f` sat at one sample for so long.

Three now, all green, each confirmed by grepping the job log rather than reading a badge:

| sha       | what drew it   | tasks seen bare (not `FROM-CACHE`)                                    |
| --------- | -------------- | --------------------------------------------------------------------- |
| `e87a551` | 14b-2          | `testDebugUnitTest`                                                   |
| `9d27733` | `15d-1-A`      | `testDebugUnitTest`, `compileDebugKotlin`, `compileReleaseKotlin`     |
| `778c62a` | `16d-A`'s KDoc | `testDebugUnitTest`, **`testReleaseUnitTest`**, both `compile*Kotlin` |

**Take the fix as demonstrated and stop treating it as open.** Note the third row is the first to
draw a bare `testReleaseUnitTest` alongside the debug one — the two variants cache independently,
and `9e87fdc`/`b2561b8`'s clean coin-toss demonstration was on the _release_ task, so that is the
variant the original failure was actually observed on.

The general lesson survives the item closing, and is the reusable half: **a green Android badge on
a sha that did not touch `apps/android` executed nothing.** Keep grepping the log.

### Today's worktree branches are prunable — unlike the historical ones

The section further down describes worktrees `worktree-gc.sh` can **never** prune, because their
content reached `main` by cherry-pick or re-commit and so shares no ancestry. **None of
2026-08-17's are like that.** Every wave this session was integrated with a real `--no-ff` merge
commit, so `git merge-base --is-ancestor` succeeds for each and the gc script's safety rail is
satisfied rather than tripped.

**Practical consequence: do not re-audit them.** `worktree-gc.sh` will prune today's on its own.
The four that will remain refused — `a0edf63595b976e4e`, `a1b2a40eb1e9e4e64`, `a623d0d03e48b3297`,
`ab5d9dfca22e6dee6` — were re-verified this session and are exactly the ones already documented as
cherry-picked, re-committed or superseded. **No worktree on this disk holds lost work.**

The reason this session merged that way is the lesson the older ones paid for: two agents dispatched
from one base cannot both fast-forward, and cherry-picking the second lands identical content while
permanently stripping the gc script's ability to prove it merged. **A real merge commit costs
nothing and keeps the ledger self-maintaining.**

### Two agents cannot both run Playwright here — one fixed port decides it

Established 2026-08-17 while deciding whether to dispatch a third wave beside `16d-W-1`. The
directories were disjoint (`packages/ui` + `e2e/ui` versus `apps/web` + `e2e/app`), which is the
test this file has always applied, and **that test is not sufficient**.

`playwright.config.ts` declares **two** `webServer` entries and Playwright boots **all** of them
regardless of which `--project` you asked for. The gallery server is `reuseExistingServer: !CI`, so
it is fine. The app server is deliberately **`reuseExistingServer: false`** on a hardcoded
**`PORT: 4310`** — and the comment above it explains why, correctly: it is stateful, `DATA_DIR` is
`:memory:`, `onboarding.spec.ts` asserts on the unconfigured state a fresh boot gives, and reuse
would also skip the `vite build` and silently test a stale bundle.

So two agents in two worktrees each running any Playwright project contend for 4310. Best case the
second fails to bind; **worst case it binds to the first agent's server and both runs silently
share one stateful single-tenant BFF** — which is the cross-file contamination this file already
documents at the _spec_ level, now available at the _agent_ level and much harder to see.

**The rule that falls out: at most one agent at a time may run Playwright, whatever the projects.**
Disjoint directories are necessary and not sufficient — check for a shared port too. A wave that
needs no browser (Kotlin, server unit tests, docs) still parallelizes freely, which is what
`16d-A` did beside `16d-W-1` without incident.

Not worth "fixing" by parameterizing the port: the orchestrator runs the full suite anyway, and
per-agent ports would trade a loud collision for a quiet one.

### DONE — `16c-4-W`: the portalled trio is inside the theme root. **`16c-5-W` is the wave it unblocks.**

**`main` is at `f8a6e4e`; `CI`, `Android` and `Publish` all green.** Full `pnpm test:e2e` (CI's own
invocation, no `--project`, no `--workers`): **412 passed, 0 failed, 0 flaky.** Unit **1662/1662**.

**The mechanism, so `16c-5-W` does not re-derive it.** `ThemeProvider` renders a **`display: contents`**
portal target as a child of `.auralis-theme-root` and a sibling of `MantineProvider`, exposed as
`useTheme().portalTarget`; `Dialog`/`Sheet`/`Menu` pass it through `portalProps`. `display: contents`
is load-bearing — the node contributes no box, so it cannot become a containing block and change how
a `position: fixed` descendant behaves. Child of the theme root ⇒ tokens resolve; sibling of the
shell ⇒ `16d-W-1`'s `overflow: hidden` cannot clip it. **`withinPortal={false}` would have been
defensible before this morning and is wrong now**, which is worth knowing if anyone reads the older
notes.

**It was proved rather than asserted, which for this wave is the whole job.** The new tests read
`getComputedStyle` and were run against the pre-fix code first: `--surface-card` resolved to the
**empty string**, per component, per theme. Six gallery screenshots confirm all three render fully
styled in light and dark. Without that, all three could have rendered completely unstyled and passed
100% of the suite, which asserts testids and text and never computed styles.

**A locator trap it hit, already documented in the code that bit it:** Mantine applies
`Drawer.Content`'s className to **both** the fixed positioning wrapper and the visible panel, so
`.m3-sheet-panel` matches two nodes and Playwright's strict mode rejects it — `Sheet.css`'s own
header comment says so. Select the dialog by role and name instead.

### DONE — `16e-book-A-2`. **`main` is `0afef1b`, green on `CI`, `Android` and `Publish`.**

Nothing claimed, nothing in flight, `docs/agent-specs/` empty.

**One `MediaHeader` composable now serves `BookDetailScreen`, `PodcastDetailScreen` and
`AlbumDetailScreen`** — 232dp/208dp art tile, `shapes.large` corners, uppercase muted kind label,
weight-900 title, all from the scale `16b-2-A` already landed. Each screen keeps its own content and
ViewModel; only the header's layout and styling is shared.

**The regression it actually fixed was invisible and affected all three screens: none passed a
placeholder or error painter.** Coil paints **nothing** while loading, on failure, or when the model
is null — and `coverUrl` is null until the server base URL resolves — so every one of them rendered
an **empty box**, not a styled one. **Compose has no cascade to fall through the way CSS does.** That
is now the standing instruction in §16 for every remaining screen spec.

**Two judgement calls, stated rather than buried:** `dp` is read 1:1 against Sonora's CSS pixels as an
intentional reading, not a conversion, on the same basis `16d-P` accepted for the 600dp breakpoint;
and compact-versus-wide measures the header's **own** available width via `BoxWithConstraints`,
because a screen on the nav host cannot see the shell's window state.

**It broke three `BookDetailContentTest` cases and the wave predicted it would not.** The cause is
worth knowing: **the header got ~112dp taller, `BookDetailContent` is a `LazyColumn`, and the chapter
rows fell outside the composed viewport** — so the queried nodes did not exist. **Not a product
regression**; `MediaHeaderTest` composes the header standalone and passed throughout. Fixed by
scrolling to each target first, with every assertion unchanged — the tap test still pins the exact
chapter's title _and_ index, so a wrong-chapter bug still fails it.

**`PodcastDetailScreen` and `AlbumDetailScreen` have no Robolectric coverage at all.** They did not
break, and **that is not the same as being verified** — worth a wave if either is next.

`16e-book-P`'s top follow-up, taken immediately and deliberately **ahead of the next screen triple**.
**Three Android detail screens now share the same pre-Sonora header** — `BookDetailScreen`,
`PodcastDetailScreen`, `AlbumDetailScreen` all render a 96dp thumbnail row with no cover-fallback
painter and no small-caps muted label, where Sonora specifies a 232/208px tile. Building one
composable now is the difference between fixing three call sites and fixing four.

**This is the first Android wave whose brief is a visual value rather than a behaviour**, which is
exactly the class `16e-book-A` missed, so the spec carries the numbers as an explicit table rather
than as prose — the correction §16 now records.

### DONE — `16e-book`, the first screen triple. **The spec-first approach half worked, and why matters.**

`main` `f9de4e8`, `CI` and `Android` green; Android's run on `3e89fb2` is a genuine **uncached**
execution, so the new Robolectric coverage really ran. Full `pnpm test:e2e`: **420 passed, 0 failed.**
Unit **1671/1671**. Android now **has** a book detail screen, which it never did — books played on
tap with no page, on the user's stated priority-1 medium.

**The `-P` verdict on the approach, which governs the six remaining screens.** Where
`BOOK_DETAIL.md` gave **prose behaviour contracts** — the fallback table, the chapter-tap cases, the
meta-line joining rule — or **a literal example string** (`"19 h 07 m"`), the two agents converged
_exactly_, including two independently-made formatting calls landing identically. **Where §3 gave
numeric visual values buried in prose** — 232/208px art tile, small-caps label, `--radius-lg` — web
read them and **Android did not**.

**So the drift is real: Android did not build Sonora's `MediaHeader` at all.** It built a 96dp
thumbnail row with no cover-fallback painter and no small-caps muted label — because that is exactly
what `PodcastDetailScreen` and `AlbumDetailScreen` do, and **those are pre-Sonora**. The `-A` agent
faithfully followed internal precedent without registering that the precedent is the thing being
replaced. **Labelled accidental drift**, not idiom: nothing in its diff states a decision to defer.

One accidental mitigation, checked rather than assumed: Android's `titleLarge` already resolves to
weight-900 at `--h4-size` from `16b-2-A`, so the title's _type_ is Sonora-correct even though the
tile and placeholder are not.

**THE CORRECTION FOR EVERY REMAINING SCREEN SPEC — apply it before writing the next one.** Put
geometry and type values in an explicit **per-platform table inside the behaviour contract**, one
row per token (art size, radius, title face/weight/size, label casing, muted-colour role), one
column per platform — so a number is a contract line an agent must satisfy or explicitly decline,
not a sentence to skim while hunting for behavioural instructions. And state outright: **"Compose has
no CSS-cascade fallback — name the placeholder/error painter for every image, not just the happy
path."** Recorded in `ROADMAP.md` §16 too, beside the `16e` bullet where a dispatching session will
actually meet it.

**Everything else came back clean, each verified rather than asserted:** all three sanctioned
inequalities are still the sanctioned ones (download Android-only, author link web-only,
series/genres/year/ISBN on neither); both Android entry points changed together, with a grep
confirming no remaining book-tap-to-play anywhere; and **the screen-scoped author type held** —
`AuthorBadge` is byte-identical, still declaring no `id`, so the guard against the thrice-shipped
minified-item bug is intact.

**Four small follow-ups it named, none blocking:**

1. **`16e-book-A-2`** — build a reusable Compose `MediaHeader` equivalent. **Do this before the next
   `-A` screen wave**: three Android screens now share the same pre-Sonora header, so this is the
   moment to build one composable rather than let a fourth drift the same way.
2. `UnifiedSearchScreen.kt`'s book rows are **non-interactive**, with a now-stale comment saying no
   book-detail route exists. One exists.
3. `CoverImage`'s fallback tile ignores the caller's `style`, so the new radius never renders in an
   environment where covers do not decode — affects `ItemPage` **and** `PodcastDetailPage`, so it is
   a component defect, not a screen one.
4. Web links only the first author of several, uncommented and untested — no fixture has two.

**The largest parity hole found so far, and it is on the user's stated priority 1.** Established by
the `16e-book` recon wave with file:line evidence, not inferred: `Routes` in `AuralisNavHost.kt` has
**no book entry**, while `PODCAST_DETAIL_PATTERN` and `MUSIC_ALBUM_DETAIL_PATTERN` both sit right
beside it. Every Android tap path — `BooksScreen.kt:103` and `ForYouScreen.kt:72` — calls
`playerViewModel.playItem(itemId)` directly, so **tapping a book starts playing it with no
intermediate page**. The only `ApiClient.getItem` call site in the tree is Android Auto's browse
tree, not a screen.

**Labelled accidental gap, not idiom** — nothing in any doc claims it was decided against, and the
container-needs-its-own-page pattern exists twice over in the same file.

**`docs/design/screens/BOOK_DETAIL.md` is the shared behaviour spec** both waves build from — the
first of its kind, and §16 requires one per screen so neither client is implemented against the
other's output. Read it rather than either implementation.

**Four calls it records, so the two waves cannot drift by guessing differently:**

- **Series, genres, published year, ISBN are out of scope** — absent from both platforms _and_ from
  Sonora's own book block. Named rather than silently dropped.
- **Chapters are genuinely new on both.** `ChapterList.tsx` only ever operates on an already-loaded
  player session, never on a not-yet-playing book, so tap-a-chapter-to-start-and-seek is new work.
- **Offline download stays Android-only**, matching `DESIGN.md`'s own native-Android decision.
  **Web's button is omitted rather than faked** — web has no download feature anywhere.
- **The author link is deliberately unequal:** web links to `/author/:id`, Android renders plain
  text, because building an Android author screen is out of this triple's scope.

**One trap it surfaced that would otherwise be rediscovered.** `GET /items/:id?expanded=true` **does**
carry real, matchable author and series ids — `expanded=true` returns Audiobookshelf's structured
array, not the minified fallback. But web's shared `AuthorBadge` type **deliberately strips `id`
app-wide** because of the twice-shipped minified-item bug. **The spec calls for a screen-scoped type
here rather than widening the shared one**, which keeps that guard intact. Android's `AuthorRef`
already has a non-nullable `id` and does not use it.

**No BFF change is needed** — the existing route already serves everything.

### Session end, 2026-08-18 — **`main` is `ecf276b`, green on `CI`, `Android` and `Publish`**

Nothing claimed, nothing in flight, `docs/agent-specs/` empty. Local at CI's own invocation
(`pnpm test:e2e`): **413 passed, 0 failed**. Unit **1662/1662**.

**Fourteen waves landed.** Phase **16d is complete on both platforms** — Sofia's reported scroll bug
is fixed — and phase 16c's web migration is materially further along.

| Wave                                       | What                                                                |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `16d-W-1`, `16d-W-1b`, `16d-A`, `16d-P`    | the docked shell; scroll-reset; Android had no bug; parity          |
| `16d-W-2`                                  | rail wide at 1024; `Icon`'s `filled` prop gets its first reader     |
| `16d-A-2`                                  | Android stops offering destinations whose upstream is unconfigured  |
| `16c-2-W-3`, `16c-2-W-4`                   | compact nav pill on `--accent`; Settings' unselected buttons fixed  |
| `16c-4-W`, `16c-5-W`                       | the portalled trio re-parented into the theme root, then migrated   |
| `16b-2-A-2`, `16f-A-1`, `16f-A-2`, `16f-P` | Android's chroma coverage; Settings screen; a working accent picker |

**`16f-A-2` closed the gap `16f-A-1` only appeared to close** — see the correction above.
`AuralisAppTokens.current` now has **four production readers**: the accent-swatch ring and selected
mode chip (`SettingsScreen.kt`), and the indicator on both nav bar and rail
(`ShellNavigationItems.kt`). Per-call-site rather than threading `accent` into the scheme builders,
so `SonoraThemeTest`'s 32 chroma assertions stand untouched and nothing else in the app shifted.

**Its two pixel tests were removed and that is a real, recorded loss.** They asserted the rendered
colour _changes_ with the accent — the exact assertion whose absence let `16f-A-1` ship green and
inert. `captureToImage` has no other user in this repo, nothing here compiles Kotlin, and two
evidenced fixes failed (`@GraphicsMode(NATIVE)` was already present; recycling the bitmap did not
help). **Nothing mechanical now stops a future edit reverting one of those four readers to a static
`MaterialTheme` value.** A KDoc stands where each test was. **Bringing them back needs a JDK on this
machine, or an assertion that does not go through pixels.**

### Superseded — the 2026-08-18 "what to pick up next" list

**Its four items are all now stale or done**, so the list itself is removed rather than left to be
followed: `16e` has since delivered two screen triples, `themeStore`'s missing validation is fixed,
and the current list lives in the 2026-08-19 hand-off at the top of this file. **Read that one.**
The only item that survives unchanged is Android's theme-mode button order (light/dark/system against
web's system/light/dark), which nothing in `SONORA.md` rules on.

### DONE — `16c-2-W-4` and `16f-A-1`. **`main` `ad38f75`, `CI` and `Android` green.**

**CORRECTION, 2026-08-18, by `16f-P` — I claimed this wave made Android themeable and it does not.**
The original wording said _"Android can be themed at all, for the first time"_. **That is wrong, and
the accurate statement is narrower: the plumbing is wired and unit-tested, and the accent still
paints nothing.**

Verified independently by the orchestrator rather than taken from the review: **`sonoraDarkColorScheme()`
and `sonoraLightColorScheme()` (`ui/theme/Color.kt:134`, `:161`) take no parameters at all**, so the
chosen accent cannot reach `MaterialTheme.colorScheme` — which is what `FilterChip`, `Button`,
`Slider`, `IconButton` and `NavigationBar`/`NavigationRail` all actually read. And **`AuralisAppTokens`/
`LocalSonoraAppTokens` have zero readers anywhere in `src/main`** (grep returns nothing outside their
own definition); the only consumer is a test.

**So picking a swatch persists it, recomposes correctly, and changes nothing on screen — including
the picker's own selection ring**, which reads `MaterialTheme.colorScheme.onSurface`. `16f-A-1` moved
the writer-with-no-reader **one level deeper** rather than closing it: `AuralisTheme`'s `accent`
parameter now has a caller, and the tokens it produces have no consumer. That is this project's
most-repeated failure, and it got past an implementation wave _and_ my own merge review; **the `-P`
is what caught it.** Do not let the next session read "Android is themeable" anywhere and believe it.

**What `16f-A-1` genuinely delivered**, which is real and worth keeping: a Settings screen, theme
mode (light/dark/system) that **does** work end to end, `SonoraAccentPresets` consumed as a list,
persistence through `KeyValueStore`, and a tested `ThemeViewModel`. Settings is reached from `ForYouScreen`'s top bar beside Downloads and
Requests, deliberately **not** a sixth shell destination, since that would change primary navigation.
Theme state lives in a new `ThemeViewModel` scoped **above** `AuralisTheme` in `MainActivity` —
`AppStartViewModel` could not host it because it is scoped to the nav host and so cannot wrap the
loading screen. Persistence reuses `KeyValueStore` through `AppContainer`, exactly as
`ServerConfigRepository` does.

**It compiled and passed first time, against a budgeted two-to-three red rounds.** That is now the
second Android wave in a row to do so, and the repeatable reason is the two compiler-free pre-checks
run before dispatch reached CI. The budget advice still stands; the pre-checks measurably reduce it.

**One limit stated rather than glossed:** the launch flash is only _partly_ avoided. There is still
one unthemed frame before the stored preferences resolve — it carries no accent or mode styling, so
nothing flashes the _wrong_ Sonora colours, but it is not zero.

**`16c-2-W-4`'s premise was wrong, and underneath it was a real bug.** Sonora's own vendored
primitives are unanimous that the not-selected case is plain surface tone with **no `--accent`
reference** — `Button`'s secondary variant, `Chip`'s unchecked state, `IconButton`'s inactive state.
So tinting them would have contradicted the design authority. **But they were not neutral either:**
they carried no style override at all and fell through to **Mantine's `outline` variant reading
`theme.colors.auralis`, derived from `scheme.primary`, which `ThemeProvider` still derives from
`sourceColor` rather than `--accent`** — an orphaned pre-Sonora tint tracking neither the picker nor
Sonora's palette. Now reusing `Chip`'s own unchecked trio, so the two controls agree by construction.

**A `-P` is owed** on whether both pickers offer the same 17 presets in the same order, and on the
two accessibility numbers already with Sofia.

### `browse.spec.ts` has a parallelism flake — seen once, not reproducible, not chased

2026-08-18. A full `pnpm test:e2e` came back **411 passed / 2 failed** — `browse.spec.ts:136`
("an empty search prompts instead of showing 'no matches'") and `:152` ("search status is announced
to screen readers via a live region"). **Neither wave in flight touched browse, search, or anything
they depend on.**

Established, cheaply, before believing it:

- `browse.spec.ts` **alone**: 14/14.
- `browse.spec.ts` **with `settings-a11y.spec.ts`** (the only spec either wave changed): 20/20.
- **Full suite re-run on the identical tree: 413 passed, 0 failed.**

So it is a flake under full parallelism, like `for-you.spec.ts`'s skeleton assertion and
`context-menu.spec.ts`'s focus-return test. **Named, not chased** — this project's own rule is that a
test made unreliable costs more than the regression it guards, and the corollary is that a flake with
one observation is not yet worth a wave. **If it recurs, it starts from "known flaky", not "new
regression".**

**The operational point is the one that keeps paying:** this was caught by the orchestrator running
the full suite before pushing, not by CI afterwards. Local `pnpm test:e2e` at default parallelism is
now finding things a `--workers=1` run structurally cannot.

Paired because one needs Playwright and one does not — the only shape that parallelises here now.
**Merges deliberately staggered**, since `android.yml` cancels in progress unconditionally.

**`16c-2-W-4`** closes the accent picker's last named web gap: Settings' **unselected** mode
buttons, which still read `--m3-*` while the selected one was migrated in `16c-2-W-2`.
`SettingsPage.tsx:64` is the `aria-pressed` site. Small and well-defined.

**`16f-A-1` — an Android Settings screen carrying theme mode and the accent picker.** This closes
the live parity gap: **web can be themed and Android cannot at all.** Sofia approved an Android
Settings screen but nobody scoped it; it is scoped here to _exactly_ what the parity gap needs —
theme mode, accent, persistence — and explicitly not to server configuration or anything else.

**It gives readers to two writers that have had none.** `AuralisTheme` (`ui/theme/Theme.kt:24-25`)
already accepts both `accent: Color = SonoraDefaultAccent` and `darkTheme: Boolean = isSystemInDarkTheme()`,
and **`MainActivity` is the only call site in the tree and passes neither**; `SonoraAccentPresets`
(`Color.kt:191`) has **zero consumers outside its own file**. Two writers with no reader, waiting for
one wave — and this project's most-repeated failure is exactly that pattern going unclosed.

**Persistence already exists and must be reused, not rebuilt:** `data/network/KeyValueStore.kt` with
`DataStoreKeyValueStore.kt`, wired through `AppContainer`.

**A `-P` is owed afterwards** on whether the two pickers offer the same 17 presets in the same order,
and on the two accessibility numbers already with Sofia.

### DONE — `16c-5-W`: `Dialog`/`Sheet`/`Menu` read Sonora's tokens. **`main` `418f0a5`, all green.**

Full `pnpm test:e2e` (CI's invocation): **412 passed, 0 failed, 0 flaky.** Unit **1662/1662**.
`CI`, `Android` and `Publish` green on the sha. **Nothing claimed, nothing in flight.**

**One `--m3-*` deliberately left behind, with a reason.** Menu's dropdown keeps
`--m3-surface-container-high`. Flattening it to `--surface-card` — the way Dialog's panel goes —
would risk the dropdown **merging into whatever `Card` it opens over**, since `Card` has been
`--surface-card` since `16c-1` and `Menu` has no scrim, leaving only the shadow to mark the edge.
That is the same shape as the invisible nav pill `16c-2-W-3` avoided. Dialog and Sheet are immune
because both always render behind their own full-viewport scrim. **A naming deferral, not a value
regression** — that token already resolves to Sonora's values since `16c-2-W-1`.

**Menu's "translucent" dropdown is ruled not a bug** — `16c-4-W` left this open. The token is a
static literal with no alpha anywhere in the chain (read in `tokens/color.ts`, not judged by eye),
and it is a distinct but subtle tone. The earlier reading was a low-contrast illusion.

**`--m3-*` is NOT close to deletion — this wave was asked and answered precisely.** `Fab`,
`ListItem`, `Marquee`, `NavigationBar`, `SearchField`, `Snackbar` and `TopAppBar` all still use it
functionally, plus the app-wide typography scale every 16c wave has deliberately left alone.

**The methodological point worth more than the wave.** It reported which of its new assertions
actually **discriminate** old from new and which merely pin an unchanged value: Dialog's background
and Sheet's handle colour fail against pre-migration CSS; Sheet's background and both Menu
assertions pass either way, because those values were already identical by design. **A test that
cannot fail is a pin, not a proof.** Keep that distinction when extending these specs — they remain
the only tests in the repo that can see a portalled component rendering unstyled.

**Migrate `Dialog`, `Sheet` and `Menu` off `--m3-*` onto `--surface-*`/`--accent-ink`.** They still
reference `--m3-*` entirely; `16c-4-W` deliberately changed only where they mount, so this migration
lands against a substrate already proven to resolve rather than as a second simultaneous change
nobody could attribute.

**Two things for whoever takes it:**

- **Keep using the computed-style assertions `16c-4-W` added** (`e2e/ui/dialog.spec.ts`,
  `sheet.spec.ts`, `menu.spec.ts`). They are the only tests in the repo that can see this class of
  break, and this is the wave they were built for.
- **One cosmetic observation from the screenshots, currently unexplained and pre-existing:** Menu's
  dropdown background reads as translucent. It comes from `--m3-surface-container-high`, untouched by
  the re-parenting, and `--m3-*` already had a `:root` fallback beforehand — so it predates this wave.
  Worth settling _during_ the migration rather than filing separately.

**After that**, the accent picker's remaining gaps are Settings' _unselected_ mode buttons and
whatever the trio's migration exposes; then `16e`, the screens.

### DONE — `16c-2-W-3` and `16b-2-A-2`, both CI-verified on `a98a6a6`

**`main` is at `a98a6a6`; `CI` and `Android` are green on it.** Nothing claimed, nothing in flight.

**The accent picker's boundary, corrected — this list has been wrong in this file twice, so read it
rather than the older copies below.**

- **Responds:** `Chip`, `Slider`, `IconButton`, the desktop rail's active destination, Settings'
  _selected_ mode button, and now **the compact bottom nav's active pill**.
- **Does not, and correctly so:** `Card` — see below.
- **Does not, and still owed:** Settings' _unselected_ mode buttons, and `Dialog`/`Sheet`/`Menu`,
  which are blocked on re-parenting.

**`Card` needs nothing, and the wave spec's premise was wrong.** Traced through its history:
`16c-1-W` already migrated it fully onto Sonora's neutral `--surface-*`/`--radius-*`/`--shadow-*`,
and **at no point has it carried an accent-coloured element**. Sonora's own vendored `Card.jsx`
reserves `--accent` for selected/filled states and a media-tile gradient; this app's `Card` is
deliberately a generic container with no `selected` concept, and a grep found **zero** call sites
combining it with accent styling. **Wiring one would have been a writer with no reader.** The wave
declined and reported instead, which is the right answer — do not re-dispatch this.

**The trap the bottom nav walked up to and around, worth knowing before the next migration.** The
obvious move was to match the desktop rail's `--surface-card`/`--accent-ink` pairing. That would
have rendered an **invisible pill**: `16c-2-W-1`'s substrate fix made `--m3-surface-container` — the
bar's own background — **numerically identical** to `--surface-card` in both themes (`#e1e1e1` /
`#141414`). It uses the solid `--accent`/`--accent-contrast` fill instead, as `Chip`'s checked state
already does. **Playwright would not have caught the invisible version**, since it asserts testids
and text and never computed styles.

**`16b-2-A-2` closed the last mechanical gap in Android's theme.** The 26 chroma roles were verified
exactly once, by a human reading a table; two Robolectric tests now assert all sixteen `ColorScheme`
slots per theme — **32 assertions** — through `MaterialTheme.colorScheme` inside `AuralisTheme`,
so what is checked is the value that survived assembly, not the constant re-read from its own
definition.

**It also found a distinction nobody had written down:** six of those light-side values —
`onSecondary`, `onSecondaryContainer`, `onTertiary`, `onTertiaryContainer`, `onError`,
`onErrorContainer` — **have no light value in `SONORA.md` at all** and are derived by contrast in
`Color.kt`. The test labels them as derived rather than asserting them as design literals, so a
change to the derivation is still caught without the file claiming the design says something it
does not. No value disagreed with `SONORA.md`, independently agreeing with `16b-2-P`.

**Honest limit on that wave:** its deliberate make-it-fail check could not be run — there is no JDK
on this machine — so the expected value was flipped and restored without anyone watching it go red.
CI is the first place that test ever executed.

### Session state, 2026-08-17 (evening) — **phase 16d is complete on both platforms**

**`main` is at `cf9d445`, and `CI`, `Android` and `Publish` are all green on it** — verified, and the
Android job is a **genuine uncached execution** (bare `compileDebugKotlin`, `compileDebugUnitTestKotlin`
and `testDebugUnitTest`, no `FROM-CACHE`). `:latest` carries it, so the live deployment is current.
**Nothing is claimed and nothing is in flight.** `docs/agent-specs/` is empty.

Local, at CI's own invocation (`pnpm test:e2e`, no `--project`, no `--workers`): **391 passed, 0
failed, 0 flaky.** Root `pnpm test`: **1662/1662**. Typecheck green across all seven projects.

**Six waves landed:**

| Wave       | What                                                                |
| ---------- | ------------------------------------------------------------------- |
| `16d-W-1`  | web's docked three-region shell — **Sofia's reported bug is fixed** |
| `16d-A`    | established Android never had it, with file:line evidence           |
| `16d-W-1b` | the latent gap docking exposed — routes open at the top again       |
| `16d-W-2`  | rail wide at 1024; `Icon`'s `filled` prop gets its first reader     |
| `16d-P`    | the parity review — clean on the wave, and it found the drift below |
| `16d-A-2`  | Android stops offering destinations whose upstream is unconfigured  |

**What is next, in the order I would take it:**

1. **`16e` — the screens.** §16's own sequencing says 16d comes first precisely so screens are not
   rebuilt inside a wrongly-scrolling document. That constraint is now discharged, so 16e is
   unblocked and is the main body of the phase. It is explicitly **split by screen, not by
   platform** — each screen is a `-W`/`-A`/`-P` triple from one behaviour spec, and screens are
   disjoint enough to run several triples in parallel. **Subject to the Playwright constraint
   below.**
2. **`16c-2-W-3`** — the compact bottom nav and `Card`, widening the accent picker further.
3. **Re-parent `Dialog`/`Sheet`/`Menu`** inside `.auralis-theme-root`, which is what unblocks
   migrating them off `--m3-*` at all.
4. **An Android accent picker.** Still a live parity gap — web can be themed and Android cannot.
   `AuralisTheme` already accepts `accent`, `MainActivity` is still the only call site and passes
   nothing, and `SonoraAccentPresets` still has no consumer. It needs Android's Settings screen,
   which is approved but unscoped.

**The one operational constraint that changed today, and it bites 16e directly:** _disjoint
directories are no longer a sufficient test for parallel dispatch._ At most **one** agent may run
Playwright at a time — see the section below for why. 16e's "run several triples in parallel" is
still fine for the `-A` halves and for authoring, but the `-W` halves serialise at verification.

### `16d-P` is done, and it found a real bug that no token-level review could have

The parity review over 16d, by an agent that wrote neither side. `main` `ccca737`, `CI` and
`Android` green. **Its verdict on the wave is clean** — and the valuable output is a pre-existing
divergence it turned up while answering an unrelated question, which is exactly what `-P` waves are
for.

**Android shows navigation destinations that cannot work.** Web's `apps/web/src/components/destinations.ts`
gates Music on `jellyfinConfigured` and Books/Podcasts on `audiobookshelfConfigured` **plus** a
matching library existing, with the rationale stated in the file: _never show a section that will
only error._ `AuralisShell.kt` iterates `ShellDestination.entries` with **no filter at all**, and a
repo-wide grep for `Configured` under `apps/android/app/src/main/java` returns **zero hits**. So a
household with no Jellyfin still gets a Music tab that can only fail.

**Labelled accidental drift, not idiom** — nothing suggests anyone decided it, and it contradicts a
rule this project already made and encoded on the other client. **Pre-existing; 16d did not cause
it.** Being taken now as `16d-A-2`.

**The three questions that came back clean, so nobody re-asks them:**

- **Scroll on navigation.** Android has no version of the bug `16d-W-1b` fixed, and by architecture
  rather than by a fix: `NavHost` mounts a **new composable per route**, so each screen's
  `rememberLazyListState` is scoped to its own composition rather than to a shared container, and a
  fresh route starts at the top by construction. Tab switches use `popUpTo(saveState = true)` +
  `restoreState = true`, the standard recipe, so each tab keeps its own position. **Android gets
  back-navigation scroll restoration for free, which is the thing `16d-W-1b` explicitly declined to
  build on web** — so on this axis Android is ahead, not behind.
- **The 1024–1240 "wide rail, no panel" state is coherent**, traced through every gate: rail wide,
  no `NowPlayingPanel` (gated on `expanded`), `MiniPlayer` present (gated on not-`compact`), the
  sheet-style `NowPlaying` present. A legitimate fourth visual state, not an accident of the re-cut.
- **Destination identity and order match** on both clients, including both reordering Search to the
  front in the rail while keeping bottom-bar order elsewhere.

**Two divergences ruled acceptable, and the ruling is the useful part:**

- **The rail sub-state.** Web now has icon-only below 1024 and icon+label above; Android's rail is
  always labelled from `RAIL_BREAKPOINT = 600.dp`. The **600dp/600px** bottom-bar↔rail switch
  agrees; the 1024 sub-state has no Android equivalent. `SONORA.md`'s `RailItem` spec describes no
  narrow/wide sub-state, so nothing mandates one. **Defensible idiom, but genuinely unruled-on** —
  worth a line to whoever next owns `SONORA.md`, not a wave.
- **Android's nav icons never toggle fill on selection**, and structurally cannot: `ShellDestinations.kt`
  imports fixed `Icons.Filled.*` vectors with no outline sibling in the tree, where web uses Material
  Symbols' FILL axis. **Bounded, and the bound matters** — web's own `FILLABLE_ICON_NAMES` makes the
  toggle visible on only **one** of the five destinations (`book_2`), so today's real divergence is one
  icon. Named so it is not mistaken for closed; not worth its own wave yet.

**On dp versus px, since the review was asked to be explicit:** both are density-independent units
targeting the same physical size (dp at a 160dpi baseline, CSS px at a ~1/96in reference pixel), so
`600dp ≈ 600px` **in intent** rather than rigorously — and `AuralisShell.kt`'s own KDoc already
reasons that way, calling 600dp Material's documented compact/medium boundary. Comparing them is
meaningful; treating them as identical is not.

**The ceiling, stated rather than glossed:** there is no Android device or emulator here, so every
Android claim above is a source read — including the scroll-restoration conclusion, which rests on
how Compose Navigation's per-back-stack-entry state saving is _documented_ to behave, not on anyone
watching it happen.

### DONE 2026-08-17 — `16d` is landed and CI-verified: **Sofia's scroll bug is fixed**

**`main` is at `40945ba`, and `CI` and `Android` are both green on it** (verified on the rerun, not
assumed). Nothing is claimed and nothing is in flight.

Her report was: _"the side navbar and the 'now playing' sidebar both scrolled with the main
content."_ They no longer do. `.auralis-shell__content` is the single scroll container at every
breakpoint; the rail, the Now Playing panel and the mini player are docked.

| Wave       | What                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| `16d-W-1`  | web's docked three-region shell                                                |
| `16d-A`    | established Android **does not have this bug** — chrome pinned by construction |
| `16d-W-1b` | the latent gap docking exposed: routes now open at the top again               |
| flake fix  | `for-you.spec.ts` hardened; the docking waves were **not** the cause           |

**Four things a session picking this up should know:**

1. **`16d-W-2` is the next wave and is unclaimed** — the adaptive-rig re-cut and the `Icon`-`filled`
   nav wiring, the two halves deliberately split out of `16d-W-1`. `ROADMAP.md` §16 has both, plus
   the correction that the rig's thresholds are `railWide >= 1024` / `showPanel >= 1240` and that
   `1440/1280/1024/768` are the design kit's **frame widths**, not breakpoints. Since `showPanel`
   already matches today's `expanded`, the only real re-cut is the rail going wide at 1024.
   **`Icon`'s `filled` prop still has no reader** — re-confirmed by grep on `apps/web/src`.
2. **`16d-P` is owed and is now narrow.** Android had no bug, so the parity review's job is not to
   compare two fixes: it is to rule on whether web's docked shell and Android's already-pinned
   chrome are the same _behaviour_, and to label the divergence (rail + docked side panel versus
   bottom tab bar + full-screen Now Playing sheet) as idiom rather than drift. Cheap, and genuinely
   unanswered.
3. **Docking exposed a class of latent bug and there may be more of it.** Nothing in this app ever
   reset scroll — the browser's document-scroll behaviour was doing it invisibly. `16d-W-1b` fixed
   the navigation case. **Anything else that assumed a scrolling document is now suspect**: grep
   turned up only `LyricsView`'s self-scoped `scrollIntoView`, but focus-into-view, anchor links and
   any future "scroll to top" affordance are the shapes to watch.
4. **Scroll restoration on back/forward is deliberately not implemented.** `16d-W-1b` resets to top
   on every pathname change including history navigation. That is a deterministic default rather
   than the arbitrary leftover offset that preceded it, and real restoration wants a position cache
   — a separate wave, not a bug.

### GitHub's `codeload` returned 429 for an hour, and it looks exactly like a build failure

2026-08-17. Six workflow runs failed — `CI`, `Android` and `Publish`, across three shas — **without
executing a single test or compiling a line**. Every one died in `Set up job` on
`Response status code does not indicate success: 429 (Too Many Requests)` while downloading an
action (`pnpm/action-setup`, `android-actions/setup-android`, `docker/setup-qemu-action`,
`docker/setup-buildx-action`), after three internal retries.

**Why it matters here specifically:** this project treats CI as the authoritative signal, and a red
`Android` badge is normally read as a Kotlin problem while a red `CI` is read as a test problem.
Neither is true in this mode, and it cost a genuine wrong-turn on `40945ba` — an Android failure on
a sha containing no Kotlin at all, which is the tell.

**How to tell in one command** — a real failure has a failing _test/compile_ step; this has a
failing **`Set up job`**:

```bash
gh run view <run-id> --json jobs -q '.jobs[] | "\(.conclusion)\t\(.name)"'
gh run view --log-failed <run-id> | grep -c '429'
```

**`gh run rerun <id> --failed` is the whole fix**, and it worked for `CI` and `Android` here. It is
GitHub-side and nothing in this repo can prevent it. Pinning actions to a tag rather than a sha
would not help — the download is the thing being throttled.

**Resolved the same session — `daaaedd` is green on `CI`, `Android` and `Publish`**, so
`ghcr.io/patakihara/auralis:latest` carries the docked shell and mediaserver picks it up on its
next fifteen-minute pull. **The deployment is not behind.**

Worth keeping for the shape of it: `Publish` on `40945ba` 429'd twice including an explicit rerun,
and then simply succeeded on the next commit's run twenty minutes later. **Waiting is a legitimate
response to this failure mode** — there is nothing to fix, and the next push carries the publish
anyway, since `:latest` always converges on the most recent green build of `main`.

### Hand-off at the usage band, 2026-08-17 — nothing claimed, nothing in flight

**`main` is green on everything and fully pushed.** Final local state, all three suites run here
after the last merge: **`--project=app` 192 passed**, **`ui-desktop` + `ui-mobile` 192 passed**,
**unit 1660/1660**, zero failures and zero skips anywhere. `docs/agent-specs/` is empty — every spec
written this session was dispatched, so nothing is parked.

**Seven waves landed:** `15e-music`, `15d-1-S`, `15d-1-A`, `15d-1-W`, `16c-2-W-1`, `16c-3-W`,
`16c-2-W-2`.

**READ THIS BEFORE THE NEXT TOKEN-LAYER WAVE — it cost a red `main`.** CI failed on `008393e` with
every local check green, on one assertion: `--accent` expected `#8b5cf6`, received
`rgb(139, 92, 246)`. **A custom property registered with `CSS.registerProperty` is _computed_, not
echoed back as authored** — `16c-3-W` registered `--accent` as a `<color>` so the picker could
cross-fade, hit this trap in its own new assertion, fixed it there, and nobody checked the older one.

**Two compounding mistakes, both mine, both cheap to avoid:**

1. **The broken assertion lives in `e2e/ui/`, and after merging I ran only `--project=app`.** A
   token-layer change needs **both** project families, every time.
2. **There is no `--project=ui`.** The real names are **`ui-desktop`** and **`ui-mobile`**, and
   `playwright test --project=ui` fails with "Project(s) not found" rather than running anything.
   Several specs in this repo's own docs say `--project=ui`; they are wrong. Use
   `--project=ui-desktop --project=ui-mobile`.

Fixed in `af98640` by accepting either serialization, since the assertion exists to catch a typo in
the value rather than to pin a string form.

**What `16c-2-W-2` established that its own spec had wrong:** the nav rail and Settings' mode buttons
never read `--m3-*` directly at all — they read **Mantine's own colour ramp**, derived from
`scheme.primary`, which stopped tracking anything once `16c-2-W-1` fixed the M3 chroma roles. So
"migrate it off `--m3-*`" was the wrong instruction and the agent correctly found the real one.

**SUPERSEDED 2026-08-17 (evening) — read the `16c-2-W-3` and `16c-5-W` sections near the top instead.**
The boundary below was correct when written and is now wrong in three places: the compact bottom nav
**does** respond, `Card` correctly never will, and `Dialog`/`Sheet`/`Menu` have been re-parented and
migrated. Kept for the portal reasoning, which is still the clearest statement of _why_ they were
excluded.

**The accent picker's exact boundary now** — do not overstate it in either direction. **Responds:**
`Chip`, `Slider`, `IconButton`, the desktop rail's active destination, Settings' _selected_ mode
button. **Does not:** the compact/mobile bottom `NavigationBar`, Settings' _unselected_ mode buttons,
`Card`, and the unmigrated parts of the other primitives. **`Dialog`/`Sheet`/`Menu` are deliberately
excluded and must stay that way** until something re-parents them — they portal outside
`.auralis-theme-root`, where Sonora's tokens do not resolve at all, and moving them would render them
unstyled **while passing Playwright**, which asserts testids and text and never computed styles.

**The rail's active label is real text on the `--accent-ink` / `--surface-card` pairing that fails
WCAG AA in dark at indigo (4.12:1) and violet (4.35:1, the shipped default).** Both clear the 3:1
UI-component floor, and it is legible in screenshots — but it is now _text_, not just an icon, so the
4.5:1 bar is the one that applies. **This is with Sofia (queue `abbaca2`) and is not to be worked
around by adjusting a threshold.**

**The obvious next waves, in order:**

1. **An Android accent picker.** Web can now be themed and Android cannot — a live parity gap.
   `AuralisTheme` (`ui/theme/Theme.kt:24`) already accepts `accent: Color = SonoraDefaultAccent` and
   **`MainActivity.kt:14` is the only call site in the whole tree, passing no argument**;
   `SonoraAccentPresets` (`Color.kt:191`) has **zero consumers outside its own file**. Two writers
   with no reader, waiting for one wave. It needs Android's Settings screen, which is approved but
   unscoped.
2. **`16c-2-W-3`** — the compact bottom nav and `Card`, widening the picker further.
3. **Re-parent `Dialog`/`Sheet`/`Menu`** inside the theme root, which is what unblocks migrating them.
4. **`16d`** — the docked-chrome scroll bug, still unfixed and still the user's own report.

**LANDED (was CLAIMED) 2026-08-17 — `16c-2-W-2`.** One agent, two tightly-scoped web fixes: the nav rail's
active destination and Settings' own theme-mode buttons onto `--accent-ink`/`--surface-*` so the
picker reaches the app chrome, and the `contrast.spec.ts:110` guard made unable to self-disable.
**Deliberately not a broad migration** — `Dialog`/`Sheet`/`Menu` stay on `--m3-*` because they portal
outside `.auralis-theme-root` where Sonora's tokens do not resolve at all.

### Session state, 2026-08-17 — everything below is merged, pushed and green

**`main` is at `98469ca`.** Full `--project=app --workers=1`: **191 passed, 1 skipped, 0 failed**
(the skip is the documented pre-existing `contrast.spec.ts:110` conditional). Root `pnpm test`
**1660/1660**, typecheck green across all eight projects including `e2e`. **Nothing is claimed and
nothing is in flight.** Six waves landed:

| Wave        | What                                                               |
| ----------- | ------------------------------------------------------------------ |
| `15e-music` | ListenBrainz recommendations reach `GET /music/recommended`        |
| `15d-1-S`   | the `availability` field, plus coverage for an uncovered `catch`   |
| `15d-1-A`   | Android's external cards: badge, request-flow tap, semantics       |
| `15d-1-W`   | web's ditto                                                        |
| `16c-2-W-1` | web's `--m3-*` substrate redefined to Sonora's values              |
| `16c-3-W`   | the accent picker works again; `html body`'s theme-scope bug fixed |

**The three things a session picking this up now should know:**

1. **The accent picker works, and its reach is bounded — do not overstate it.** `Chip`, `Slider` and
   `IconButton` respond to a swatch change; **anything still reading `--m3-*` does not**, including
   the nav-rail highlight and Settings' own mode buttons. That is the documented partially-migrated
   state, not a defect. **`16c-2-W-2` — migrating the remaining components onto
   `--accent`/`--surface-*` — is what widens it, and it is the obvious next wave.**
2. **Android has no accent picker at all, and the seam for one already exists.**
   `AuralisTheme` (`apps/android/.../ui/theme/Theme.kt:24`) accepts `accent: Color = SonoraDefaultAccent`,
   and grep finds **no call site anywhere passing a non-default value** — `MainActivity` calls
   `AuralisTheme { }` with no arguments. Pre-existing from `16b-2-A`, not introduced here. **This is
   now a live parity gap**: web has a working picker and Android cannot be themed at all. It needs an
   `-A` wave and then a `-P`.
3. **The contrast guard can silently disable itself again.** `contrast.spec.ts:110` is
   `test.skip(!hasAuthor, …)`, and it did exactly that mid-session before closing again on its own.
   **Make it fail, or point it at a card known to have an author.** Small, real, unclaimed.

**Two accessibility numbers now exist where before there was a vague worry, and the second is the
serious one.** Computed in Python against the WCAG relative-luminance formula across all 17 preset
hues, cross-checked against a figure already in `Chip.tsx`'s comment:

- `--accent-ink` on `--surface-card` — light passes at all 17 (5.4–9.3:1); **dark fails 4.5:1 at
  indigo (4.12:1) and violet (4.35:1)**, and violet is the shipped default. Both clear the 3:1 floor.
- **`--accent-contrast` is a fixed `#fff` and fails 4.5:1 on `--accent` at all 17 presets** (1.92:1
  yellow → 4.9:1 red), **failing even the 3:1 floor at nine of them**. It is the "text on accent"
  token, so a white label on a yellow or lime accent is simply not readable.

**Nothing was changed on the strength of those** — a token that exists to be readable being
unreadable is a design answer, not a threshold to adjust. **Both are with Sofia**: queue `dbfb46e`
(the original question, plus whether album-art-derived colour should ever drive the accent) and
queue `abbaca2` (these numbers). **Neither blocks anything.**

**One operational lesson worth more than any of the waves.** Four agents were lost in this session,
every one at the same point: it backgrounded a long Playwright run and stopped to wait for a
notification, which ends the turn. **The spec-side instruction held perfectly — all four had
committed first, so no work was lost** — and the orchestrator-side worktree check is what confirmed
it each time. The fix is not another instruction. **Do not ask a subagent to run a full suite. The
orchestrator runs it from the main checkout**, where `Bash` is ungated and a foreground run cannot
be interrupted by a notification. Two further details: a stray Playwright **runner** does not carry
the worktree path in its own command line, so `pgrep -f "worktrees/agent-<id>"` misses it — match the
child and kill its `ppid`; and **`SendMessage` to a stopped agent recovers its findings**, which
salvaged an entire review here for a fraction of the cost of re-running it.

A lightweight lock, because two sessions can share this checkout. Claim a wave here
**before** dispatching it; delete the line when it lands.

**`16c-1-A` is very nearly already done, and finding that out cost one grep.** `apps/android` has
**no custom primitive wrappers at all** — every call site is Material 3's own composable (`Button`
×49, `IconButton` ×12, `Slider` ×1), and those resolve against the `MaterialTheme` that `16b-2-A`
already populated app-wide. So there is nothing to rebuild, and dispatching the wave as specced
("the same five in Compose") would have invited an agent to invent five wrapper composables nothing
calls. What is actually left is **verification**: extend the Robolectric test to cover the 26
chroma-role values, which `16b-2-P` confirmed it does not. **One real gap for `-P` to rule on:
`Chip` and `Card` have zero Android call sites** while web uses both — deliberate idiom or a
missing surface, and a token-value review cannot see it. `ROADMAP.md` §16 has the detail.

**`15e-music` is IMPLEMENTED and UNDER REVIEW — commit `069ecb6` on branch
`worktree-agent-af58afde02f314286`, not merged, not pushed.** Six files, all `apps/server`, ~648
insertions. It wires 15a's ListenBrainz provider and 15b-1's ownership matcher into
`GET /music/recommended`, **so phase 15's sixth writer-with-no-reader is closed** — both clients
already consume that route, so external candidates reach a client with no client change. Read
`git log -1 --format=%B 069ecb6` rather than re-deriving it; the account is unusually complete.

It did the two things this repo keeps failing to do: a **live `curl` against the real ListenBrainz
endpoint** (200, real payload, all five required query parameters — the fixture-validates-the-
response trap that shipped in 15a), and **route-level tests through real HTTP** asserting an external
item by name in the response body rather than a helper's return value.

**It also stopped mid-verification**, on an unfinished root `pnpm test` — the second agent today to
die waiting on a backgrounded run. Its work was committed first, so again nothing was lost.

**`15d-1-S` DONE — `ace32cb` on `worktree-agent-a7c69864b7e5a52b5`, on top of `069ecb6`.** Adds the
required `availability` field at both mapping sites via a route-scoped
`MusicRecommendedAlbum = Album & { availability }` — **no shared domain type touched**, so
`packages/jellyfin-client`'s `Album` is unchanged and its consumers cannot go red. Proved on the wire
through `app.inject()` on **both** an owned and an external item, and asserted `'owned'` on the
library shelves _following_ the external one so the field cannot be a blanket constant. **It also
closed the uncovered `catch` the right way**: deleted the `warn` line, watched the new test fail,
restored it, watched it pass. No fixture widened. 726 `apps/server` tests, 1653 workspace.

**`15d-1-A` DONE — `f054743` on `worktree-agent-a604c3dbe106d7ee0`, on top of `069ecb6`** (dispatched
before the contract landed; `apps/android` only, so it merges independently).

**Android had the same defect, and it was confirmed by reading the navigation path rather than
assumed from web's report.** `MusicLibraryScreen`'s `recommendedSection` wired one `onOpen` to
`Routes.musicAlbumDetail(albumId)` for **every** item in every recommended shelf regardless of
provenance — the same screen owned albums use, so an `external:listenbrainz:<mbid>` id hit the
identical dead end.

Three decisions in it worth not re-deriving:

- **`availability` is typed `String`, not an enum**, matching `BookRequest.status`'s existing
  convention, so an unrecognised future value **decodes rather than throws**.
- **`MusicRecommendedShelf.items` moved to a new `MusicRecommendedAlbum` type rather than widening
  `JellyfinAlbum`** — `JellyfinAlbum` is also `/jellyfin/albums`' and search's shape, and giving it a
  non-optional field those responses do not send would break decoding them. That is the
  `MissingFieldException` trap avoided rather than walked into.
- **The badge is an overlay on the cover art, deliberately**, so it adds zero card height and
  preserves the one-fixed-card-geometry invariant.

It pre-fills the request search field and **does not auto-submit** — its own call, stated. Accessibility
is folded into the merged `contentDescription` **ahead of** the recommendation reason, so ownership
reads as an identity qualifier, with three Robolectric cases pinning it. Both toolchain checks this
machine can run without a compiler came back clean: **equal `/*` and `*/` counts across all 13 changed
`.kt` files**, and **zero backtick test names containing a dot**. Nothing here compiles Kotlin, so
**CI is its first real signal — budget the usual two to three red rounds.**

It had to add `"availability":"owned"` to every `GET /music/recommended` fixture in
`MusicRepositoryTest` and `MusicLibraryViewModelTest`, which is the required-field trap working as
intended rather than a surprise.

**LANDED (was CLAIMED) 2026-08-17 — `15d-1-S` and `15d-1-A`, the fix for the dead-end card.** Both build **on
top of `069ecb6`**, not on `main`. `15d-1-W` follows once the contract lands.

**The contract, decided once so all three build to the same thing:** every item in
`GET /music/recommended` carries a **required** `availability: "owned" | "external"`. Always present,
never null. **Clients are explicitly forbidden from detecting externality by string-matching the
`external:` prefix out of the id** — parsing meaning out of an opaque identifier is implicit coupling
that breaks silently when the id scheme changes. Non-nullable is deliberate: Android's Kotlin models
declare fields non-nullable with no default and throw `MissingFieldException` on a missing key, and
`ignoreUnknownKeys = true` makes adding a field safe for existing clients.

**The behaviour, shared by both platforms:** an external item is visually distinguishable ("not in
your library"), and tapping it goes to the **music request flow — which already exists on both
platforms** (`/music/requests` on web) — pre-filled with the artist name, rather than to an album
detail page for an id no Jellyfin instance knows. Owned items are untouched. **The status must be
announced, not merely drawn**, or the badge is a silent accessibility divergence from web.

`15d-1-S` also closes the review's second finding: the outer `catch` in `buildExternalDiscoveryShelf`
had no coverage, and the new test must be confirmed to go **red** with the `warn` line removed rather
than merely passing beside it.

**`15d-1-W` MERGED (`7a5e06a`) — the paired fix is complete on both clients, and `main` is green.**
Full `--project=app --workers=1` on the merged tree: **190 passed, 0 failed, 0 skipped**, 6.4 min.
Root `pnpm test` 1656/1656, typecheck green everywhere.

**CORRECTION to the skipped-test finding below — the check is running again, and I should not have
left the alarm standing without this.** After `15d-1-W` merged, the count went **188/2 → 190/0**:
`contrast.spec.ts:110` now runs and passes in **both** colour schemes. So the muted-tone WCAG check
is not inert, and the coverage gap closed on its own once web's Carousel change landed. **The
underlying fragility is unchanged and still worth fixing**: the guard is `test.skip(!hasAuthor, …)`,
so it will silently disable itself again the next time the first shelf card has no author line. A
guard that skips when its subject is absent is indistinguishable from one that passes. **Make it
fail, or point it at a card known to have an author.** That is a small, real, unclaimed wave.

**THE ANDROID SAMPLE THIS FILE HAS BEEN ASKING FOR IS FINALLY DRAWN — and it is green.** `9d27733`
touched `apps/android`, so Gradle could not serve the task from cache. Its `Android` job log carries
bare **`> Task :app:testDebugUnitTest`**, **`> Task :app:compileDebugKotlin`** and
**`> Task :app:compileReleaseKotlin`** — no `FROM-CACHE`, no `UP-TO-DATE`, i.e. a **genuine uncached
execution**, and it passed. That is the **second** real sample behind the `UnifiedSearchViewModelTest`
race fix (the first was `e87a551`), and this file's own bar was "several uncached executions" with no
way to draw one absent new Android work. One more Android wave and the fix can honestly be called
demonstrated rather than well-argued.

**`15d-1-A` also compiled first time, with zero red CI rounds** — against this file's standing advice
to budget two to three. Worth noting _why_, since it is repeatable rather than luck: the two traps
that are checkable without a compiler were checked mechanically before dispatch reached CI (equal
`/*`/`*/` counts across all 13 changed `.kt` files, and no dots in backtick test names). The advice
to budget red rounds still stands; the mechanical pre-checks measurably reduce them.

**MERGED 2026-08-17 — `15e-music` + `15d-1-S` (`def4f4b`), `15d-1-A` (`4a2db21`), `16c-2-W-1`
(`030f067`).** The orchestrator ran the full `--project=app --workers=1` suite on the merged tree
itself rather than delegating it: **188 passed, 0 failed, 2 skipped** in 8.5 min. Root `pnpm test`
1653/1653, root typecheck green across all projects including `e2e`.

**`16c-2-W-1`'s review came back "merge as-is" and it was thorough.** The portal risk is closed by
evidence, not argument: the `:root` block carries **zero `var()` references** among its `--m3-*`
values, and `Dialog`, `Sheet` and `Menu` were each screenshotted in both themes rendering fully
styled. `--project=ui` 190 passed. Every literal was cross-checked against `SONORA.md`; the three
inferred light-side "on" roles were **independently recomputed** and clear AA at 6.45–7.24:1; the
xl/lg 32px collapse is genuinely Sonora's scale, not a transcription slip. CSS grew 1,205 bytes
(+0.44%), so nothing was lost. One spec was correctly failing and was fixed: `e2e/ui/theme.spec.ts`
pinned the old contract in which the source colour drove the M3 generator.

**THE ONE THING THE FULL SUITE CAUGHT, and it is exactly why the rule exists.** The count went from
the documented **189 passed / 1 skipped** to **188 / 2** — no failure, one test silently stopped
running. There is exactly **one** `test.skip` in the whole `e2e/app` suite:
`contrast.spec.ts:110`, _"a shelf card author (on-surface-variant, the muted secondary tone) clears
WCAG AA"_, guarded by `test.skip(!hasAuthor, …)`. Its describe runs once per colour scheme, so it
now skips in **both** rather than one.

**That means a WCAG check stopped covering anything on the very wave that changed the value it
checks** — `16c-2-W-1` redefined `--m3-on-surface-variant`, and the test pinning that token's
contrast is now inert. The reviewer's own clean `--project=app` run on `16c-2-W-1` **alone** gave
189/1, so the change came in with the `15e`/`15d-1-S` merge.

**The likely mechanism, stated as a hypothesis to verify rather than a finding:** `HomePage` stitches
four async sources including the recommendation shelves, so the external discovery shelf may now be
**first on Home**, and its placeholder cards have no author `<p>`. If so there are two separate
things to settle — restore the contrast check so it cannot silently self-disable (assert on a card
known to have an author, or fail rather than skip when none is found), **and** decide whether an
external discovery shelf should lead Home at all. A guard that skips when its subject is absent is
indistinguishable from a guard that passes, which is the failure this one just demonstrated.

**REVIEWED 2026-08-17 — verdict: do not merge as-is, fix the card first.** The placeholder concern
below was confirmed by driving a real running instance, not by reading code. What the reviewer saw:
a shelf titled _"New artists to discover"_ rendering real artist names on **blank music-note tiles**,
and **clicking one navigates to `/music/album/external%3Alistenbrainz%3A<mbid>`** — a page headed
plain **"Album"** with no name and no artist, a **live favourite-heart and add-to-playlist button
both wired to act on an id that does not exist**, and _"No tracks found for this album."_ That is a
dead end, not a graceful empty state, and it sits on Sofia's main Music screen. **Everything else in
the wave is solid** — mechanism, ownership matching, cold start, degradation, request-shape testing.

Confirmed independently in the same review: the **live ListenBrainz curl** (200 with a real payload
on the five-parameter request; **400 `Argument max_similar_artists must be specified` on the
one-parameter version**, which proves the 15a fix is real and necessary), and that
`listenbrainz.test.ts` asserts the outgoing query as an **exact** set via `toEqual`, not a subset.
Root `pnpm test` **1652 passed / 0 failed**, root `pnpm typecheck` green across all seven projects
**including `e2e`**, lint and format clean.

**Two gaps left open, deliberately named rather than assumed away:**

1. **The full `--project=app` Playwright suite never ran on this wave**, and 15e-music **widened a
   shared fixture** (`fakeJellyfin.ts` — `artist-nebula` gained a MusicBrainz provider id). This
   repo's own recorded lesson is that **only a full `--project=app` run sees fixture-widening
   breakage**; the reviewer ran a two-project subset, which is precisely the check that cannot. The
   author's "no fixture counts changed" therefore rests on unit tests alone. **This is a merge
   blocker and the orchestrator runs it, not a subagent** — see the note on agent deaths below.
2. **`routes/jellyfin.ts`'s outer `catch` in `buildExternalDiscoveryShelf` has no test coverage** —
   every failure path the route tests exercise is already absorbed by `listenbrainz.ts`'s own
   internal try/catch, which never rethrows, so nothing fails if that `warn` line is deleted. Minor,
   deliberately defensive against a future provider breaking its total-function contract, but it does
   not meet the wave's own stated bar.

**The reviewer agreed with dropping rather than labelling owned artists**, on the reviewer's own
reasoning: a shelf whose promise is "new artists to discover" contradicts itself by listing one she
already owns, and reads as a bug rather than as a policy. Settled; do not re-open.

**The original concern, kept because it is what the review was pointed at:** External candidates are
serialized as **blank `Album` placeholders** with ids namespaced `external:<provider>:<id>` and
cover/year/track-count `null`, chosen precisely so the existing renderer displays them with no client
change. That is clever and it is also a trap: **clicking one routes to an album detail page for an id
no Jellyfin instance knows**, and a row of coverless grey cards on the main music screen is a product
regression even with every test green — "the UI must be beautiful" is Sofia's own sentence. The
review has been told to run the app, click one, screenshot the shelf, and rule on whether it ships or
waits for `15d` (requestability) to give these items somewhere to go.

**One design call it made that is worth knowing rather than rediscovering:** an artist matching
something owned is **dropped** from the discovery shelf, not labelled. Its argument is that 12c-2's
"owned still appears, just not requestable" governs _search and library pages_, where hiding makes an
item unfindable, and not a shelf whose entire point is surfacing what she does not have. That reads
correct, and the reviewer has been asked to agree or dissent explicitly.

**Superseded — the original claim line:** One Sonnet agent, in
`apps/server/src/features/recommendations/` + `routes/jellyfin.ts`. Disjoint from the wave above
(`packages/ui`), so the two run in parallel. Two halves: artist-granularity ownership (the recorded
gap — the music ownership pool is built from **albums**, so a ListenBrainz **artist** recommendation
can never match as owned), and wiring external candidates into `GET /music/recommended`, **which
both clients already consume**. 15a's provider currently has no consumer but its own tests; that is
this project's sixth writer-with-no-reader, and closing it is the wave's whole point.

**ASKED 2026-08-17 — the two open design questions are finally with Sofia**, filed to the task
queue as `dbfb46e`. (1) Should album-art-derived colour ever become the accent's source, or is the
picker the final answer? (2) `--accent-ink` fails WCAG AA on `--surface-card` at the default accent
— what should give? **Neither blocks anything and no wave should wait on them.** Note the framing
correction that goes with question 1: the decision log claimed artwork-derived colour was
implemented, and `packages/ui/src/tokens/artwork.ts` has zero callers, so nothing is being taken
away and the question is forward-looking. Delete this paragraph when she answers, and record the
answers in `SONORA.md`.

**`16c-2-W-1` is IMPLEMENTED and UNDER REVIEW — commit `5731785` on branch
`worktree-agent-ae99898f5257ab092`, not yet merged and not yet pushed.** Seven files, all in
`packages/ui`: `--m3-*` colour, radius, motion and elevation redefined to Sonora's fixed values,
with typography and spacing deliberately untouched. Its own commit message is unusually good — read
`git log -1 --format=%B 5731785` rather than re-deriving what it did.

**It stopped before running Playwright or taking a single screenshot**, having run only unit tests
(101/101 `packages/ui`, 1641/1641 root), typecheck, lint and format. That is the exact death this
file already documents — it backgrounded a `--project=ui` run and waited for a notification that
ends the agent. **Its work was committed, so nothing was lost**, which is the spec-side instruction
working; the orchestrator-side check is what confirmed it. It also left a live Playwright runner and
workers behind, respawning on kill until the parent runner was found — note the parent's own command
line does **not** contain the worktree path, so `pgrep -f "worktrees/agent-<id>"` misses it. Match on
the child's path, then kill its `ppid`.

A second Sonnet agent is now reviewing that commit and running the verification it owes.

**One product consequence to settle, and it is genuinely user-facing.** With the `--m3-*` chroma
roles now _fixed_ at Sonora's values, the Settings colour-swatch picker no longer drives them — only
the five primitives migrated onto `--accent` in 16c-1-W still respond to it. That is Sonora's
intended end state (`--accent` is _the one_ customizable colour) and Android already works this way,
so it is not wrong — but until more components move onto `--accent`, **Sofia's colour picker has much
less visible reach than it did.** `16c-2-W-2` — migrating the remaining components onto
`--accent`/`--surface-*` — is what restores it, and that makes it the next wave rather than an
optional follow-up. The review has been asked to judge from the running app whether this currently
reads as "reduced reach" or as "the picker looks broken".

**Checked before dispatching, so nobody re-checks it: none of the six `worktree-*` branches holds
lost work.** `abfc1e3c98500edeb` and `ada9aa18e890f1985` are fully merged (zero commits ahead of
`main`) and are safe for `worktree-gc.sh`. `ab5d9dfca22e6dee6` carries `b26e4a3`, the 14c wave —
superseded, since 14c landed as `f2a90d1` and its regression test was deliberately reverted in
`19ae5bb`. The other three (`a0edf63595b976e4e`, `a1b2a40eb1e9e4e64`, `a623d0d03e48b3297`) are the
ones this file already documents as cherry-picked or re-committed rather than fast-forwarded. **Only
four were accounted for here before; six exist.** The lesson is small and cheap: the worktree list
is a ledger that has to be re-read, not inherited. A claim older than a couple of
hours with nothing on `main` is stale — take it.

**The `UnifiedSearchViewModelTest` race is not fixed to this file's own bar, and the bar is
currently unreachable.** There has been exactly **one** uncached Android execution since the fix
landed in `e71837f` — `e87a551`, green. The bar below says _several_ uncached executions, and only
a change under `apps/android` produces one, because Gradle serves the task `FROM-CACHE` for
everything else. Since 14b-2 was the last planned Android work, **there is no way to draw a second
sample without new Android work.** So: the fix is well-argued and has one real green behind it,
which is better than it has ever had, and it is **not** demonstrated. Whenever the next Android
wave happens, it is the next sample — read its log before reading its badge.

**15a is landed and reviewed** — the external-candidate seam plus ListenBrainz tier 1, merged with
a real merge commit. Its only consumer is its own tests; **15c and 15e are the readers**, and that
is stated rather than glossed. One open input for 15b, found by the wave: the music ownership pool
is built from **albums**, so a ListenBrainz artist-level recommendation can never match as owned
until 15b builds artist-granularity `OwnershipLibraryItem[]` from Jellyfin artists. **16b-2-A is landed** (`c450fbb`) — Android now has Sonora's colour scheme, **and a typography and
shape scale for the first time**; `MaterialTheme` previously received only a colour scheme, from the
platform's wallpaper-derived Material You. Every value was re-derived from `packages/ui`'s
stylesheets and tabulated for the parity review. **Nothing here compiles Kotlin**, so its first real
test is the Android CI run on `c450fbb`; the two compiler traps that _are_ checkable without a
compiler (nested block comments, a dot in a backtick test name) were checked by the orchestrator and
are clean. Budget the usual two-to-three red rounds anyway.

**One deliberate divergence is open and `16c-2-P` must rule on it** (not `16c-1-P`, which is blocked — see above). Web's token wave was purely
additive and left `--m3-*` untouched, so web still renders pre-Sonora colours until 16c migrates
components off them. Compose has no equivalent middle state — `MaterialTheme` resolves against
exactly one `ColorScheme` — so Android's chroma roles now hold what `--m3-*` is _scheduled_ to
become. **The platforms are briefly out of step by construction**, and that is only the right trade
if 16c closes it promptly.

**16c-1-W is landed** (`e04a9a2`) — `Button`, `IconButton`, `Chip`, `Card`, `Slider` now read
Sonora's tokens instead of `--m3-*`. **This is the first visible change in the phase.** Its full
`--project=app` run never finished in the agent's session, so **CI on `e04a9a2` is its verification**
— check it before building on it. Two findings it returned:

- **Vendoring Sonora's real primitive sources mid-wave corrected concrete guesses.** It had inferred
  `--radius-sm` (16px) for Card; the real source is `--radius-md` (24px). Prop tables give the API
  and not the values, which is why `docs/design/sonora/primitives/` now exists.
- **`--accent-ink` on `--surface-card` fails WCAG AA at the default accent**, so text surfaces use
  `--surface-fg`. Recorded rather than worked around: `--accent-ink` exists to be readable on a
  surface, and where it is not, that is the design's problem to answer, not a test to soften.

**16b-2-A is verified properly, not on a badge.** Android CI on `aba5250` shows bare
`> Task :app:compileDebugKotlin`, `:compileReleaseKotlin`, `:testDebugUnitTest` and
`:testReleaseUnitTest` — **uncached executions**, so the Compose theme genuinely compiles and its
Robolectric test genuinely ran. That is the bar this file sets for any Android claim, and it beat
the two-to-three red rounds budgeted.

**16b-2-P is done — the first parity review, and it earned its cost.** Verdict: **parity holds at
the token level, zero mismatches across ~74 values compared by hand** (surfaces, all 17 accent
presets, the five app-level tones in both themes, all 26 `--m3-*` chroma values, the five-step
radius scale, and the type scale at weight 900). `accentInk`'s OKLCH mix was independently
recomputed in Python and lands on `#3f2876`, matching Android's pinned golden value.

**But it corrected the divergence's framing, and the correction matters more than the verdict.**
Two things, both re-verified by the orchestrator rather than taken from the report:

1. **Android is fully re-themed today; web is barely.** `MainActivity.kt` wraps the whole app in
   `AuralisTheme`, so Compose's single `ColorScheme`/`Typography`/`Shapes` are live across **every**
   existing Android screen — new palette, weight-900 headings, new radii, app-wide. **If you open
   both clients right now they will not look like the same product**, and the roadmap's "some chroma
   roles differ" wording badly understated that.
2. **16c-1-W's five primitives are only _partially_ migrated.** Every one of them still references
   `--m3-*`: `Button` (`--m3-shape-full`, `--m3-shape-md`, `--m3-primary`, `--m3-elevation-*`),
   `Card` (`--m3-on-background`, `--m3-on-surface-variant`, `--m3-state-layer-color`, springs),
   `Slider` (`--m3-surface`, `--m3-slider-height`, springs), `Chip` and `IconButton` fewer. So
   "migrated onto Sonora's tokens" is **overstated** — they are _partly_ migrated, and the phase's
   premise (delete `--m3-*` when its last consumer leaves) is much further off on web than the
   commit messages imply.

**The ruling, and it is the right one: do not hold Android back.** Compose cannot express web's
additive middle state — there is no cascade to fall back through — so reverting would buy no
convergence and lose all forward progress. **But this state must be short-lived by design.** The
practical consequence is that **16c-2-W matters more than 16c-1-A**: web is the platform that is
behind, and closing it is what makes the two clients resemble each other again.

**Two smaller findings.** The Robolectric test asserts used values in both themes and would fail on
a wrong colour, weight or radius — but it does **not** cover the 26 chroma-role values, which are
verified only by this review's manual pass. And `--surface-overlay-header` has **no consumer on
either platform** — a pre-existing writer with no reader, not a parity gap.

**16g is done\****16g is done** — the README is rewritten, every link verified live, and
three unshipped claims taken back out of it on review (external discovery, search suggestions, and
"some screens reflect the new design"; none of the three is true yet). **16c is next.**

**Phase 16's wave 16b is complete** — 16b-1 (fonts), 16b-2 (tokens) and 16b-3
(icons) are all merged. **16c is next**: rebuilding `packages/ui`'s primitives against the new
tokens, migrating them off `--m3-*` one component at a time.

**Three things 16b-2 handed forward that 16c must not rediscover:**

- **Portalled components cannot see the theme-scoped tokens.** **Three** of them — `Dialog`,
  `Sheet`, `Menu` — render outside `.auralis-theme-root`, and the `--surface-*` and app-level tokens
  are scoped to `.auralis-theme-root[data-theme=…]` with **no `:root` fallback**, deliberately: a
  fallback would mask exactly the missing-value bug the gallery test exists to catch. Rebuilding any
  of those three means re-parenting the portal inside the theme root or re-emitting the tokens where
  it lands. **`SearchField` is not one of them** — it passes `withinPortal={false}` on purpose, so
  its tokens resolve for free. Both this note and the source comment first listed all four; the
  review caught it.
- **The gallery's token list is hand-maintained, and the reader depends on it.** The e2e spec
  enumerates `[data-token]` from the live DOM, so it genuinely fails on a token missing a value in
  either theme — but only for tokens the gallery renders. The gallery's 14 arrays match the CSS 1:1
  today (97 names, verified); a token added to the CSS later with no gallery entry is simply
  uncovered, silently. **Deriving that list from the CSS instead is a small, worthwhile wave** and
  is the difference between a reader and a complete one.
- **`--m3-*` is still the app's only substrate and is unchanged.** 391 usages across 185 names. 16c
  migrates components onto `--surface-*`/`--accent` one at a time; `--m3-*` is deleted when the last
  one leaves, not before.
- **`color-mix(in oklch, …)` computes to `oklch()`, not `rgb()`** — relevant to any test asserting
  on a resolved colour string.

**Baseline at dispatch:** full `--project=app --workers=1` run on the merged 16b-1 + 16b-3 tree is
**189 passed, 0 failed, 1 skipped** (5.8 min). The skip is `contrast.spec.ts:110`, a conditional
`test.skip` on a fixture that has no author line — pre-existing, not a regression.

**16b-1 and 16b-3 are both landed and reviewed** — `d1dae5a` (Inter + Roboto
Flex self-hosted, 276 KB, `--font-body` wired, plus `c1f51eb` shipping the OFL text the review
caught missing) and `17a3d0e` (fourteen glyphs, and a type-safe filled/outlined toggle for the five
nav destinations). Root typecheck, lint and 1626 unit tests green on the merged tree.

**16b-2 is next and is the riskiest wave of the phase.** It replaces `ThemeProvider.tsx`'s token
emission with Sonora's values. Two things decide whether it works, both already established and
neither discoverable by an agent that does not read this:

- **Adding Sonora's stylesheet does nothing.** `ThemeProvider` sets every `--m3-*` as **inline
  style** on `.auralis-theme-root`, which beats any `:root` or `[data-theme]` rule. The failure
  mode is silence — it renders, in the old colours. The provider's emission has to be replaced.
  And `--m3-*` is defined in **two** places: that inline JS, and a static `:root` fallback block at
  `packages/ui/src/styles/index.css:55-76`. Both need changing.
- **A green local Playwright run is not evidence here.** 14a-2 passed 188/188 locally and failed
  twice on CI on a layout-stability assertion, because what changed was _when_ CSS arrived, not
  whether it existed. Budget CI rounds; do not let the wave call itself done on a local pass.

`docs/design/SONORA.md` has the exact values, including the five app-level tokens Sonora does not
ship (`--accent-ink`, four `--tone-*`) that 16b-2 must add or the rail and every status pill
resolve an invalid `var()`.

**Do not adopt Sonora's icon font.** Measured before dispatch: `Icon.tsx` is already an inline SVG
set vendored from `@material-symbols/svg-400`, chosen precisely because this is an offline-capable
PWA. Sonora's font mechanism is 3.08 MB, needs the network, and degrades to the literal words
`play_arrow`/`skip_next` on screen offline. Same glyphs, worse delivery. `ROADMAP.md` §16 has the
table and the fourteen missing glyph names.

**Wave 16a is done** — `d8b7b41` and `213e10c` vendor the design
project into `docs/design/sonora/`, `f0ad9c4` writes `docs/design/SONORA.md`. **No session and no
subagent needs `DesignSync` again; read the repo.** That was the whole point of the wave.

**The next wave is 16b (the token layer), not 15b-2.** Phase 15's sequencing was corrected the same
day — see `ROADMAP.md` §15's `15b-2` entry for why, in short: nothing upstream can supply a provider
identifier to request creation until 15a exists, and nothing in the codebase ever learns the library
item id a completed request becomes, so the mapping table has neither a writer nor a reader today.
**15a is phase 15's next wave.** 16b and 15a are disjoint (`packages/ui` + `apps/web` versus
`apps/server`) and can run in parallel. **15b-1 landed** (`c15e5e3`) — the pure ownership matcher, with
`owned` / `possible` / `new` kept genuinely distinct and identifier matches beating title matches.

**A wave that changes a shared domain type must typecheck its _consumers_.** 15a-0 added six fields
to `packages/*-client`'s domain types and its spec told the agent to typecheck the packages it
touched. `apps/server` consumes both, constructs `Book`/`Podcast`/`Album`/`Track` literals in test
fixtures, and was never typechecked — so `main` went red on `89fdee4` with the wave's own checks all
green. Fixed in `2bc0017`. **`pnpm --filter @auralis/server exec tsc --noEmit -p .` is not implied
by typechecking the packages**, and this repo's own gotcha note already records that the
per-package typecheck silently drops projects, which is how `main` went red the same way on
2026-08-08.

**Phase 15 progress so far:** the spec is `ROADMAP.md` §15, corrected twice by the user (browse is
one destination, and per-medium providers are the design). **15a-0 done** (`6fe1be6`) — six upstream
identifiers now survive normalization and already reach the wire. **15c-1 done** (`8a38a99`) —
dedupe-by-parent and mixed-shelf marking, **mechanism only, reachable by nothing yet** (see §15).
**Provider survey done** — `docs/research/RECOMMENDATION_PROVIDERS.md`; ListenBrainz is the only
genuine recommender found, and its useful tier needs no credential from her.

**The next wave after 15b-1 is 15b-2, and it is the one most likely to be skipped.** A title she
requests becomes a library item with an id unrelated to the provider's, so unless the
correspondence is persisted **at request time**, the next recommendation run offers her the same
book again and the matcher looks broken. That is a schema change, not a scoring one.

14b-2 landed as `e87a551` (see `ROADMAP.md` §14) and its Android
run was verified as an **uncached** execution, not just a green badge. **Phase 14 is done**: 14a-1,
14a-2 (measured, then reverted — see below), 14b-1 and 14b-2 are all on `main`, and 14c is written
up in `docs/perf/`.

**Phase 14 was the last thing this machine could start alone, and that is now the honest state.**
Every remaining roadmap item is in the blocked-on table near the top of this file, and each needs a
**decision, a device, a credential, or a live change on another host** — not more engineering. A
session picking this up should read that table and expect to find nothing it can start; that is the
finding, not a gap in the notes. The nearest thing to startable is the launcher icon, and it is
blocked on deciding what the icon _is_.

**Done, and no longer claimed: the `UnifiedSearchViewModelTest` race.** `main` was red on Android
at `9e87fdc` with `UncompletedCoroutinesError` on "a library fetch failure still returns music
results, degrading only the library side". `9e87fdc` and `b2561b8` carry **identical Kotlin** and
went red and green respectively, which is a clean demonstration that the race is a coin toss
rather than a deterministic break. Fixed in `6004577` (merged as `e71837f`) by widening 13d's
scoped-dispatcher treatment from two tests to twelve, and in `e4bf86d` (the other session's 14d)
by draining `resultsState` in `tearDown()` and fixing the same gap in `HomeViewModelTest` and
`RequestsViewModelTest`. **Four tests remain on real `Dispatchers.IO` deliberately** — each keys a
`setBodyDelay()` on a specific path to pin real interleaving, and collapsing them onto a test
dispatcher would turn them into tautologies. **Not yet proven fixed, and the bar is not what it looks like.**
Consecutive green runs are **not** the unit of evidence — _uncached executions_ are. Gradle serves
`:app:testDebugUnitTest` `FROM-CACHE` on any sha that did not touch `apps/android`, so a green
Android badge on a docs or web push executed nothing, and a run of such pushes manufactures
exactly the pattern that looks like an intermittent fault settling down. Since rerunning a sha
reuses the same inputs and therefore the same cache, **the only thing that draws a fresh sample is
a change under `apps/android`.** So the bar is several _uncached_ executions, each confirmed by
grepping the job log for a bare `> Task :app:testDebugUnitTest` — and name the variant, because
debug and release cache independently.

14a-1, 14a-2 and 14b-1 all landed on `main`; see `ROADMAP.md` §14 and "Phase 14" below.

**Phase 13 is done** — 13a–13f, all CI-verified. The `app` Playwright project sits at
**190 passed, 0 failed** at full parallelism, up from the 186/1/1 that greeted this session.
There is no unfinished wave in phases 1–13. What remains across the whole roadmap is the
blocked-on table near the top of this file, plus three follow-ups this session opened and
deliberately did not fold into a wave that was not about them:

1. **Android has no accessibility grouping on the For You carousels** — a pre-existing 13d gap
   that the docs wrongly claimed was closed. Touches `ForYouCarouselRow`, shared by the book,
   podcast and now music shelves. **It is not startable here, and now for a stated reason rather
   than a vague one.** Checked 2026-08-16: `apps/android` has **no Compose UI test harness at
   all** — no `createComposeRule`, no `createAndroidComposeRule`, no Robolectric dependency (the
   single `Robolectric` string in the tree is a comment in `ExampleUnitTest.kt`), and
   `android.yml` runs `./gradlew test assembleDebug`, i.e. JVM unit tests only, never an
   instrumented run. So semantics code written here could be verified by nothing but "it
   compiles" plus a reviewer's reading — which is precisely the standard that passed on all four
   of this project's writer-with-no-reader failures. **The prerequisite wave is a Compose test
   harness** (Robolectric + `androidx.compose.ui:ui-test-junit4` running under `gradlew test`),
   not the semantics change itself. That is a real, startable piece of work for a session with
   more window than this one had — but it adds dependencies to `libs.versions.toml`, so it needs
   a lockfile-safe single-agent wave, and it cannot be smoke-tested locally (no JDK, no SDK),
   meaning several red CI rounds should be budgeted.
2. **Recommendation quality is still unassessable here.** Ten synthetic books and three fake
   albums prove the mechanism, not the taste. Judging whether the ranking is any _good_ wants
   the real 231-item library, which wants a credential.
3. ~~**`tryBuildMusicGenreProfile`'s bare `catch` swallows every error class.**~~ **Done.** It
   now discriminates: `JellyfinNotConfiguredError`/`JellyfinNoCredentialsError` stay silent,
   because a household that never connected Jellyfin hits them on every books-route request and
   logging that is noise, not signal. **Anything else** — a network failure, an upstream shape
   change, a genuine bug in `albumToCandidate` or the scoring core — is logged at `warn` while
   still degrading to `null`. Two tests pin both halves, and the fault-logging one was confirmed
   to fail with the log line removed rather than merely passing alongside it.

**Phase 13 is four waves done of five.** 13a (`8d071b8`), 13b (`0be4fc6`), 13d (`8335184`),
13c (`8bbad08`). **13e is the only one left** — widen `packages/jellyfin-client` to normalize
`PlayCount`/`LastPlayedDate`/`PlaybackPositionTicks` and feed the music side into the profile.
It is the wave that actually delivers the user's sentence about taste in one medium informing
another; everything before it recommends audiobooks from audiobook behaviour.

**A latent Android test race was revealed, not introduced, by 13d** (`d6d8e21`).
`UnifiedSearchViewModelTest` deliberately runs its class-wide `ApiClient` on the **real**
`Dispatchers.IO`, so a request can outlive its own test and throw during a later one —
`ApiClient`'s own doc comment names this failure class. 13d merely added suite wall-time,
widening the window until two tests failed with `UncompletedCoroutinesError` (the
`ClassCastException` in the log is a secondary symptom, not the cause). The fix scopes a test
dispatcher to those two tests only, leaving the two that genuinely pin real interleaving alone.
**The loose end: the await-then-re-read pattern is not unique to those two call sites.** If that
file goes red again, the question is whether the race is more pervasive, not whether the patch
was wrong.

Before dispatching a wave **and again before merging it**, check what is already on `main`
(`git log --oneline origin/main -15`) and check `git branch --list 'worktree-*'` — a `+`
marks a branch checked out in another session's worktree, which is a live signal that
someone else is mid-flight. A session that dispatched at T and merged at T+25min never saw
what landed in between; that is how Android playlists got built twice on 2026-08-05.

`pgrep -af claude`, read for `node .../worktrees/<name>/...` children, is the stronger check:
a live Playwright or vite process rooted in a worktree path is positive proof that wave is
taken, where `git log main..<branch>` is empty for an agent that has not committed yet.

---

## Lessons that must not be relearned

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
