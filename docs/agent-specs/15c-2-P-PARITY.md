# `15c-2-P` — parity review of the mixed-recommendation client triple

**Written before either implementing wave reported, deliberately.** `16e-foryou-P` was once handed
a brief that stated a divergence backwards, and the rule adopted afterwards is that a reviewer's
brief must be derived from the spec, never from an implementing agent's paraphrase. Writing this
ahead of the reports is how that rule is enforced rather than merely stated.

## Your position

You wrote neither half. Read **`docs/agent-specs/15c-2-CLIENTS.md`** — the shared behaviour spec
both waves were dispatched from — and review both implementations against it. **Cite the spec
directly.** If an agent's report and the spec disagree, the spec wins and the disagreement is itself
a finding.

**Decide for yourself and keep moving.** Escalate only a genuine ambiguity about intended behaviour
or a design decision above a reviewer's pay grade. Routine judgement calls are yours to make and
state. A reviewer that escalates everything has moved the reading back into the orchestrator, which
is the thing this project's delegation rule exists to prevent.

Report **findings, not file contents** — what is wrong, where, why. Never paste what you read.

## What this wave did

For You's per-medium recommendation carousels were **replaced** by one `GET /api/v1/recommended`
call, whose shelves can span books, podcasts and albums. Home's other three sources are untouched.

## READ THE ADDENDUM AT THE END OF THIS FILE FIRST

This brief was written before either wave reported, and since then both waves were **reverted and
re-landed** and a server wave landed underneath them. The checks below are all still valid; the
addendum adds the ones that only exist because of that history, including the single
highest-priority check in this review. Read it, then come back here.

## The checks, in priority order

### 1. Both type-label pins exist AND discriminate

`itemLabels` supplies the literal strings `"Audiobook"`, `"Podcast"`, `"Album"`. Each wave was told
to pin them **as literals**, never re-derived from `kind`.

**A test that re-derives its expectation from the same mapping the code uses cannot fail.** Check
each side's assertion for that shape specifically. A pin that cannot fail is not a proof, and this
project has shipped that distinction wrong before.

### 2. The label is ANNOUNCED, not merely drawn — the highest-value check here

Web splits name and description via `aria-describedby`; Android merges into one node with
`Modifier.semantics(mergeDescendants = true) { contentDescription = … }`. **Different mechanism,
same required outcome — that is idiom, and must not be graded as drift.**

**Web is the plausible failure case.** If the label lands in a visually-rendered subtitle `<span>`
while the card's `aria-describedby` still points only at the shelf's reason paragraph, it renders
perfectly and announces nothing. Verify the label actually reaches the accessible name or
description on each platform, by reading the code — not by trusting the report's claim that it does.

Each wave was required to prove its assertion discriminates by blanking the label and reporting the
literal failure. **Confirm that claim independently on at least one side** rather than accepting it.

### 3. The absent-`itemLabels` case

A single-kind shelf carries no `itemLabels` — the server omits it below a kind-count of two,
deliberately. Confirm both clients then render the subtitle **alone**: no label, no orphaned `•`
separator, no invented label derived from `kind`.

### 4. `item.kind` is authoritative

Chrome, routing and cover resolution must branch on `item.kind`. **Nothing may infer what an item is
from the presence or value of a label** — `itemLabels` is a `Record<itemId, string>` and on a true
literal id collision can hold only one label per key, which is exactly why `kind` is the source of
truth. Check both sides for a branch on the label instead of the kind.

### 5. No progress bar was carried over

Both waves were told **not** to render a progress bar on the mixed card, because a recommended item
is by construction one the user has no progress on (`profile.ts:123` + `score.ts:38`; the spec has
the full reasoning). Confirm neither client renders one, and that neither quietly added a progress
field to its model to feed one. **If you find a progress bar, it is unreachable code, not a
feature.**

### 6. The loading gate still holds Home until every source settles

Sofia's own closed decision, and it exists to kill a measured layout-shift race (14c). Web composes
`pageLoading` from per-source `*Settled` booleans; Android sets `_uiState` exactly once after all
`async` children `.await()`. **A `*Settled` left pointing at a deleted query, or one silently
dropped, regresses it and every test stays green.** Check the arithmetic on both sides.

### 7. The `availability` guard exists on both

Anything other than the literal `"owned"` must not reach a player or a detail route. **This route
emits only `'owned'` today**, so the guard is genuinely defensive and cannot be exercised. Confirm it
exists; do **not** accept — or write — a claim that an external item was proved blocked. Android
matters most here: `15e-podcasts` is held on a branch precisely because Android routed an external
id into `playItem()`.

### 8. Placement matches on both platforms

Replacement, not addition, on both. Home's other three sources — book home shelves, podcast home
shelves, Jellyfin favourite albums — untouched on both. Music recommendations on the separate music
screen untouched on both.

## Pre-ruled — do NOT report these as defects

- **Web deletes one fetch; Android deletes two.** Android called the per-library recommended route
  for the book _and_ podcast libraries; web called it for books only. The asymmetry is
  **pre-existing and is closed by this wave**, not introduced by it.
- **Cross-carousel dedupe on For You does not exist on either platform.** Grepped by the
  orchestrator before dispatch. Pre-existing, explicitly out of scope, and replacement reduces the
  duplication surface rather than creating it. Record it as inherited if you like; do not grade it.
- **`RecommendedLibraryItem.progress` on the older routes can never be non-null**, and both clients
  hold progress-bar code for it that can never fire. Pre-existing and harmless.
- **The `--accent-contrast` WCAG failure** across all 17 accent presets (with Sofia, queue
  `c9887cb`).

## Be precise about what Android's harness proves

Robolectric confirms a node exists with the semantics you meant. It does **not** tell you what
TalkBack announces, how the row looks, or what is reachable by touch. There is no device here.
**State that asymmetry rather than papering over it** — this project has twice recorded parity that
did not exist because a document asserted it.

## For every divergence you find: say which it is

**Platform idiom or accidental drift.** Per item, with the reasoning. A bottom tab bar is not a
navigation rail; a merged `contentDescription` is not `aria-describedby`. Deliberate divergence is
fine and must be labelled; the review's whole job is separating the two.

## Working rules

- You may take screenshots (a bounded allowance — the last reviewer granted one found a real shipped
  defect). **Leave the tree clean**: delete any temporary spec in the same command that created it.
- **Do not run the full Playwright suite.** The orchestrator runs it from the main checkout.
- **Never make an `Agent` call of any kind**, including a one-word "continue".
- Do not push. Do not fix what you find — report it.

## Keep your context small

Cost is roughly quadratic in turn count. `Grep` over whole-file reads, `offset`/`limit` reads,
never re-read a file, never `cat` a directory. You are reading two diffs, not two codebases:
`git show <sha>` and `git diff <base>..<tip> -- <path>` are your primary tools.

---

# ADDENDUM — reconciled 2026-08-21, after the revert and the three-commit re-land

Everything above was written before either wave reported and is still accurate about **intent**.
This section is what changed in the world since, and it is not optional context: one item here is
the highest-priority check in the review, because it is the defect that caused the revert.

## What actually happened

The two client waves landed, **broke For You, and were backed out**. They have since been re-landed
on top of a server wave that fixes the underlying cause. The commits you are reviewing:

| sha       | wave                | what                                                                   |
| --------- | ------------------- | ---------------------------------------------------------------------- |
| `5fecc57` | `15c-2-S-4`         | gives `GET /api/v1/recommended` its **own external-discovery shelves** |
| `9d7a9d5` | `15c-2-W` (re-land) | web For You reads the aggregator                                       |
| `45ad429` | `15c-2-A` (re-land) | Android For You reads the aggregator                                   |
| `7a6c8fb` | `15c-2-W2`          | re-points an e2e mock at the new route                                 |

Base for the client diffs is `5fecc57`. The re-landed `-W`/`-A` content is **byte-identical** to the
originals (verified by the orchestrator with `git diff`), so the reverts introduced no drift — but
`5fecc57` underneath them is new, and `7a6c8fb` on top of them is new.

## CHECK 0 — external book discovery still reaches For You. **Do this one first.**

**This is what broke.** Replacement dropped external book discovery from For You entirely — the one
thing Sofia said the feature is useless without: _"It is not useful to me if recommendations only
show things already in my library."_

The mechanism: `GET /libraries/:id/recommended` **led its response** with an Open Library external
shelf (wave `15e-books`). The aggregator had no external provider at all — its own doc comment said
so. So swapping one fetch for the other silently deleted a whole shelf. `5fecc57` is the fix.

**The lesson this cost, and it is the one to apply here:** _I asked what the CARD loses. I should
have asked what the RESPONSE loses._ A field-level comparison compares the leaves; whole branches
can vanish without any leaf changing shape.

So: **enumerate every shelf, section or collection the OLD per-medium route could emit, and confirm
the aggregator emits an equivalent** — on both platforms, and for **podcasts as well as books**,
since Android called the old route for the podcast library too. Do not stop at the book case just
because that is the one that was caught. If a category of shelf reachable before is unreachable now
on either platform, that is a blocking finding.

`e2e/app/for-you-external-book.spec.ts` is the discriminating test on web. Note what `7a6c8fb` did
to it and judge whether it still discriminates — see the next section.

## CHECK 0b — `7a6c8fb` re-pointed a mock, and a mock is not an observation

`for-you-external-book.spec.ts` mocked the network with a `page.route` glob naming the **old** route.
Once web fetched the aggregator instead, that intercept matched nothing, no external card rendered,
and the tests failed looking **exactly like "the aggregator's external shelf is broken"** — the most
expensive possible false signal, indistinguishable from the real regression.

`7a6c8fb` re-points the glob and reshapes the mocked payload to the aggregator's flat card shape. It
claims no assertion changed.

**Verify that claim, and then ask the harder question: does this spec still prove anything about the
server?** It impersonates the route rather than observing it. If every external-shelf assertion on
web now runs against a hand-written mock, then `5fecc57`'s actual output is unproven on the client
path, and the thing that proves it is elsewhere (server unit tests, or a live-response e2e). **Say
which, and say whether the coverage is sufficient.** A test that was re-pointed to keep passing is
worth exactly as much as its new target.

## CHECK 0c — the `contentType` divergence. This is a REAL divergence and it is yours to rule on.

**Both agents independently hit a design question the shared spec did not answer, and answered it
with different types.** A carousel carries a `contentType` used to filter For You by medium, and a
genuinely mixed shelf has no single medium to report.

- **Web** widened it to `ForYouContentType | 'mixed'`, and states the behaviour: a mixed shelf
  renders under "All" only, never under a specific chip.
- **Android** made it **nullable**, `null` meaning mixed, to keep every existing exhaustive `when`
  untouched.

**The types differ; whether the BEHAVIOUR differs is unverified, and establishing that is your first
job after CHECK 0.** If both render mixed shelves under "All" only, this is idiom — record it as
such, with the reasoning. If Android's `null` falls through a filter branch differently — showing a
mixed shelf under a medium chip, or hiding it from "All" — **that is drift, and it is the kind that
renders correctly in the default view and is wrong one tap away.** Trace the actual filter branch on
each side; do not infer the behaviour from the type.

## Three things to look at specifically in `-A`, beyond the checklist above

1. **`ForYouViewModelTest.kt` had its dispatcher "fully rewritten" (184 lines changed).** This is the
   single most dangerous file in the Android suite to touch mechanically. This project's record: the
   inject-the-test-dispatcher convention is **not universal**; one class of exception **hangs**
   rather than failing visibly; and a previous mechanical pass of exactly this kind was reverted.
   Read the diff for tests that assert real `MockWebServer` interleaving via `setBodyDelay` — those
   must keep a real dispatcher or they become tautologies that pass for the wrong reason.
   **Mitigating fact you should know:** this Kotlin is byte-identical to the pre-revert version, and
   the `Android` workflow ran **green** on `1e1f088`, which carried it. So it compiles and its tests
   passed at least once. That is evidence, not proof — the race in this suite is a coin toss and a
   single green run has misled this project before.
2. **`FeedCarousel.contentType` became nullable** — a change to a **shared type** rather than a new
   enum case, chosen to keep existing exhaustive `when` blocks untouched. Judge it. It is defensible
   and it is a design decision the spec did not make. See CHECK 0c.
3. **`ForYouScreen.kt` gained `isExternal` guards on `PODCASTS` and `MUSIC`.** These extend an
   existing `BOOKS` guard, so they change behaviour for the **pre-existing** carousels too, not only
   the new mixed one. In scope by the availability requirement (check 7), but wider than the mixed
   shelf. Confirm the widening is correct rather than incidental.

## Two deviations from the dispatch spec, both self-reported. One was the spec's fault.

1. **`-W` declined the spec's "parse with zod at the boundary" instruction, and was right to.**
   `apps/web` has no zod dependency at all, and `client.ts`'s `request<T>()` is a plain `JSON.parse`
   cast across all ~30 of its methods. The instruction was the orchestrator's and it was wrong for
   that package — parse-at-the-boundary governs **upstream** boundaries in `apps/server`, not the web
   client's own BFF calls. **Do not report this as a defect**, and do not recommend "fixing" it; one
   validated method among thirty would be a lone convention.
2. **`-W` could not build a genuine cross-kind e2e scenario without widening a shared fixture, and
   deliberately did not.** This project's history says a widened fixture invalidates every existing
   assertion that counted it while every unit suite stays green — only a full run sees it. Instead
   its e2e fetches the route's live response and asserts every rendered card's `aria-label` matches
   the server's `itemLabels` exactly, whatever shape the data takes. **The multi-kind render path is
   therefore proven at unit level only. Say whether that is sufficient** — this is a judgement call
   the orchestrator is explicitly asking you to make, not to escalate.

## What `15c-2-S-4` already had reviewed, so you do not redo it

`5fecc57` was **independently reviewed by an agent that did not write it**, which verified
empirically rather than by reading — it scratch-reverted the fix below and confirmed two tests failed
on point. Verdict: merge, no blocking defects. Treat the server wave as reviewed and spend your turns
on the two clients. What follows is handed to you as fact so you neither re-derive nor re-check it.

**The silent bug S-4 found and fixed, because it is the exact shape this review hunts.**
`buildExternalDiscoveryShelf` resolves seeds via `albumsById.get(seedInfo.itemId)`. On the aggregator,
`profile.facetSeeds` carries **`jf:`-namespaced** ids while `albumsById` is **bare-keyed** (it feeds
`toMixedItem`). The bare map would have resolved **zero** seeds on every request — no error, no
failing test, just a music external shelf that could never appear. Fixed with a namespaced-keyed copy
at that one call site. **The book path was separately confirmed to have no analogous hazard**:
`buildBookExternalDiscoveryShelf` builds seeds from name-keyed affinities and never does an id-map
lookup. This is the same id-namespacing hazard `15c-2-S-2` closed, resurfacing at a new call site —
if you find a third id-map lookup anywhere in the aggregator, check its key space.

**A contract fact, so you do not trust a wrong table.** The external book shelf's `type` is
`BOOK_EXTERNAL_SHELF_TYPE = 'discover'` (`libraries.ts:81`, reused by the aggregator), **not
`'recommended'`**. A recon agent had this wrong once and the implementer caught it by reading the
route instead of the table. If any document hands you `'recommended'` for this, the document is wrong.

**One non-blocking follow-up already named, so do not report it as new.** S-4 added
`client.getArtists({ limit: 500 })` to `tryBuildJellyfinPool`, deliberately **outside** the existing
`Promise.all` with its own `try`/`catch`, so a failed artist fetch loses only the music external shelf
rather than the owned recommendations — strictly better than `/music/recommended`, which fails the
whole request. The cost is one serial round trip per request when Jellyfin is configured. **Latency
only; the correctness call is right.** Judge it if you like, but it is known.

## The asymmetry the re-land commit message asks you to name

**Android was reverted alongside web even though nothing ever caught it failing** — because Android
has no e2e, so its half _looked_ clean while carrying the identical regression. That is recorded in
`45ad429`'s message, and **it is still true after the re-land**: web's half is re-proved by
`for-you-external-book.spec.ts` in a real browser, and Android's half is proved by unit tests plus
whatever you establish by reading.

**Name that asymmetry explicitly in your report rather than quietly accepting it.** It is the same
standard that passed on all four of this project's historical writer-with-no-reader failures. You are
not being asked to fix it — there is no device here and building Android e2e is not this wave. You
are being asked not to let the report imply both halves are verified to the same depth.

## One thing that is settled — do not re-litigate it

**Replacement, not addition**, was the orchestrator's decision and it stands: Sofia asked for mixed
carousels _rather than_ one shelf per medium, and neither client can dedupe across independently
fetched responses. **"Have the client call both routes" is pre-ruled wrong** — it is the shape
replacement was chosen over, it reintroduces the duplication, and it leaves the aggregator
permanently unable to serve For You alone. If you believe replacement is wrong, say so once with
reasoning and move on; do not design around it.
