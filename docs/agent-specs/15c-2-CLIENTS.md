# `15c-2-W` / `15c-2-A` / `15c-2-P` — render mixed-content shelves on both clients

**Written 2026-08-21. Reconciled against shipped code before dispatch.** Base is `main` at
**`b788e35`** — that literal sha is what each agent's `git reset --hard` must name.

This is one **shared behaviour spec** for a web wave and an Android wave dispatched **together**,
followed by a parity review by an agent that wrote neither half. That shape is a standing
instruction from Sofia (`CLAUDE.md`, "Frontend parity"), not a preference for this wave.

## Why this wave exists, and why it is urgent

Wave `15c-2-S` (`e94005d`) shipped `GET /api/v1/recommended` — the first and only code path in this
project that can produce a **mixed-content shelf**, i.e. one carousel spanning more than one media
kind. **It has no reader.** Until this triple lands, the route is an instance of this project's
most-repeated failure: a writer whose reader never comes, four historical occurrences, every one
green on its own tests.

The user's requirement, `docs/USER_DECISIONS.md` decision 2, in her own framing: there must be
**mixed-content carousels rather than one shelf per medium**, and a card in a mixed shelf must name
its type in the subtitle. Spotify is the reference and is **to be looked at, not guessed at** — her
own screenshots are in `docs/research/spec-addendum/` (deliberately untracked; they exist on this
machine and not in a fresh clone).

## The contract — already built, do not change the server

```
GET /api/v1/recommended        (behind requireSession)

{ shelves: [ {
    id: string,
    label: string,
    type: 'recommended',
    reason: string,
    itemLabels?: Record<itemId, 'Audiobook' | 'Podcast' | 'Album'>,
    items: [ {
      kind: 'book' | 'podcast' | 'album',
      id: string,
      title: string,
      subtitle: string | null,
      coverPath: string | null,     // book/podcast
      imageTag: string | null,      // album
      availability: 'owned' | 'external',
    } ]
} ] }
```

Three properties that are contract, not incidental:

- **`itemLabels` is present ONLY when a shelf spans more than one kind.** `typeLabelsFor`
  (`apps/server/src/features/recommendations/shelves.ts:80`) returns `undefined` below a kind-count
  of two, deliberately. A single-kind shelf carries no labels and its cards must not invent one.
- **`itemLabels` is keyed by item id**, and those ids are the same `id` the item carries.
- **`item.kind` is authoritative; `itemLabels` is a convenience derived from it.** On a true
  literal-id collision between the two upstreams, `itemLabels` — a `Record<itemId, string>` — can
  only hold one label per bare key. Every item carries its own `kind` regardless, so **render chrome
  from `item.kind` and use `itemLabels` only for the display string.** Never branch on the presence
  of a label to decide what an item _is_.
- **`availability` is always `'owned'` from this route today — verified, not inherited.** The
  orchestrator re-checked it: `routes/recommended.ts` writes the literal `'owned'` at three
  construction sites (`:325`, `:335`, `:349`) and no external-discovery provider feeds this
  route's pool (`:162-168` states why, and the field stays typed as the full union so a future
  external wave is additive rather than breaking). **So the guard you must still write is
  genuinely defensive, not load-bearing** — say so in your report rather than claiming you
  proved an external item is blocked, because no external item can reach the route to test with.
  Treat anything other than the literal `"owned"` as external, and never derive externality by
  string-matching an `external:` prefix out of `id`.

**BYTE-FOR-BYTE TARGET, pre-ruled — do not re-derive it.** Extracted from
`shelves.ts`'s `MEDIA_KIND_LABEL` by the orchestrator:

```
book -> "Audiobook"      podcast -> "Podcast"      album -> "Album"
```

Each wave pins these on its own side, and `-P` confirms **both pins discriminate** — a test that
cannot fail is a pin, not a proof, and this project has shipped that distinction wrong before.
Do **not** assert the labels by re-deriving them from `kind`; assert the literal strings.

## What each client renders

A mixed shelf is a carousel of cards. Each card shows cover, title, and a subtitle that **leads with
the type label** when `itemLabels` supplies one — her reference disambiguates a mixed shelf exactly
this way (`Playlist • …`). Follow each platform's existing recommendation carousel rather than
inventing a new card.

- **Type label placement**: `itemLabels[item.id]`, then the item's own `subtitle`, e.g.
  `Audiobook • Ursula K. Le Guin`. When `itemLabels` is absent, render `subtitle` alone.
- **Cover**: `coverPath` for book/podcast, `imageTag` for album. Two nullable fields deliberately —
  the upstreams resolve covers through different URL shapes. Reuse each client's existing cover
  resolution for that kind; do not build a third.
- **Tap**: route by `kind`, to the same destination that kind already has. **An external item must
  never be handed to the player or to a detail route** — `15e-podcasts` is held on branch precisely
  because Android routed an external id straight into `playItem()`. Everything from this route is
  `'owned'` today, so the correct behaviour is reachable; guard on `availability` regardless.

## Placement — the one real decision, and it is yours to make

Home stitches four independent async fetches client-side (see `HANDOVER.md`'s 14c section). Adding a
fifth source either **duplicates** items already shown by the per-medium recommendation carousels or
**replaces** them. Her decision — mixed carousels _rather than_ one shelf per medium — argues for
replacement.

**Decide it in the spec before dispatch, and make it identical on both platforms.** The hard
constraint either way: **no item may appear twice on For You.** Cross-shelf dedupe across
independently-fetched responses is not something either client can do well, which is itself an
argument for replacing the two per-medium recommendation fetches rather than adding to them.

Note also her closed decision that **Home holds a loading state until its sources settle** — if this
wave changes which sources Home waits on, it must not regress that.

## Accessibility

Web and Android differ in **mechanism** and must agree in **outcome**; that is idiom, not drift, and
`-P` should not grade it as drift. The precedent is already set and reviewed: web splits name and
description via `aria-describedby`; Android merges them into one node with
`Modifier.semantics(mergeDescendants = true) { contentDescription = … }`, because Compose has no
`aria-describedby` equivalent (`ForYouCarousel.kt:173` is the pattern).

**The type label must be announced, not merely drawn — and your report must make that
falsifiable.** A sighted user learns the kind from the subtitle; a screen-reader user must too.
This is where this project keeps shipping gaps, so state two things explicitly, per platform:

1. **The mechanism.** Name the exact route by which the type label reaches the node's accessible
   name or description — which attribute or modifier, on which element, at which `file:line`.
   **Web is the risk case:** if the label lands in a visually-rendered subtitle `<span>` inside
   the card while the card's `aria-describedby` still points only at the shelf's reason
   paragraph, it renders perfectly and announces nothing. "It is in the subtitle" is not an
   answer to this question.
2. **The assertion that pins it, and proof that the assertion discriminates.** Delete or blank
   the label in your working tree, watch the test fail, restore it. Report that you did this and
   what the failure said. A test that passes with the feature removed is a pin, not a proof.

Be precise about what Android's harness proves: Robolectric confirms a node exists with the
semantics you meant. It does not tell you what TalkBack announces or what is reachable by touch.
There is no device here. State that asymmetry rather than papering over it.

## Rules for both implementing agents

- `model: "sonnet"`, `isolation: "worktree"`, and the agent's **literal first action** is
  `git reset --hard <current main tip sha>` inside its worktree, verified with `git log -1` — with no
  `worktree.baseRef` configured, an isolated agent otherwise lands on an empty scaffold.
- `-W` owns `apps/web/**` and `e2e/**`; `-A` owns `apps/android/**`. Disjoint.
- **Do NOT run a full Playwright suite. Neither of you.** This supersedes any older instruction
  that `-W` may run one. `-W` runs **one targeted spec** for a fast signal
  (`pnpm exec playwright test --project=app e2e/app/<your-one-file>.spec.ts --workers=2`) plus
  `pnpm vitest run apps/web`, and stops there. **The orchestrator runs the full suite from the
  main checkout after merging**, where `Bash` is ungated and no task notification can end the
  turn. The reason is measured, not stylistic: agents on this project have repeatedly died
  waiting on a backgrounded full run, twice losing an entire wave, and the orphaned runner does
  not carry the worktree path in its own command line so it is painful to even kill.
- **Never make an `Agent` call of any kind**, including a one-word "continue".
- **Commit before running any long test command.** Agents here have died waiting on a backgrounded
  Playwright run and lost entire waves; the orchestrator-side worktree check is what recovers them.
- Do not push. Commit on the worktree branch; the orchestrator rebases onto the tip and `--ff-only`
  merges. **Rebase, never cherry-pick** — cherry-picking permanently strips `worktree-gc.sh`'s
  ability to prune the worktree.
- `pnpm install --frozen-lockfile` once; never `pnpm add`.

**Budget two to three red Android CI rounds.** Not pessimism — the documented pattern here. Review
catches product defects and loses to the toolchain every time: an import binding to the internal
`RowColumnParentData.weight` (an _access_ error, not an unresolved reference), a `..` inside a
backtick test name (legal Kotlin, illegal JVM method name), and a `/*` inside a KDoc, which **nests**
in Kotlin and silently eats the rest of the file. That last one has a free textual pre-check worth
running on every touched `.kt`:

```bash
for f in <changed .kt>; do echo "$f open=$(grep -o '/\*' "$f" | wc -l) close=$(grep -o '\*/' "$f" | wc -l)"; done
```

Also budget the three Compose locator traps: a `performClick()` on an item outside the composed
viewport neither throws nor fires; `assertExists` is a **member** and must not be imported while
`assert` chained onto the same call **is** a top-level extension and must be; and a `testTag` under a
semantics-merging ancestor needs `useUnmergedTree = true`.

## What `-P` must actually check

- **Cite the spec directly, never an implementing agent's paraphrase.** `16e-foryou-P` was once
  handed a brief that stated a divergence backwards.
- Both label pins exist and **discriminate**.
- The type label is **announced** on both platforms, not just rendered.
- The absent-`itemLabels` case: a single-kind shelf renders no label on either client.
- Placement matches on both platforms, and **no item appears twice on For You** on either.
- The `availability` guard exists on both, and no external id can reach a player or detail route.
- Whether any divergence found is **platform idiom or accidental drift** — say which, per item. A
  bottom tab bar is not a navigation rail; a merged `contentDescription` is not `aria-describedby`.

`-P` may take screenshots (a bounded allowance — the last reviewer granted one found a real shipped
defect), but must leave the tree clean.

## Known follow-ups this triple inherits and should NOT fix

- ~~The **id-collision** risk in `recommended.ts`~~ — **CLOSED on `main` as `a1c0075`**, after
  this spec was first drafted. Candidate ids are now namespaced `abs:`/`jf:` for the duration of
  scoring and stripped before serialization, so **`items[].id` on the wire is unchanged** and
  every `itemLabels` key still equals an item id (pinned by a test asserting
  `Object.keys(itemLabels)` equals `items.map(i => i.id)` exactly, verified discriminating).
  **What survives, and is why `item.kind` is authoritative:** on a _true literal_ id collision,
  `itemLabels` is a `Record<itemId, string>` and structurally cannot hold two labels under one
  key — last write wins. Harmless, because every item carries its own `kind`. Do not re-open
  this; do not add a client-side workaround for it.
- The **ABS pool over-fetch** (300 per library, capped only in total).
- `--accent-contrast` failing WCAG AA on all 17 accent presets (queue `c9887cb`, with Sofia).
