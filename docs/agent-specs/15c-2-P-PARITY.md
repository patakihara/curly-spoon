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
