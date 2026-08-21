# `15c-2-S-4` — give `GET /api/v1/recommended` its own external-discovery shelves

**This is the wave that unblocks re-landing `15c-2-W`/`-A`.** Read the
`REVERTED 2026-08-21` section of `docs/HANDOVER.md` first — it records why the client triple was
backed out and why this must land before it goes back.

## Why

Both clients' For You carousels were replaced by the cross-medium aggregator, and that **deleted
external book discovery from For You**, because:

- `routes/libraries.ts:330` leads `GET /libraries/:id/recommended` with
  `buildBookExternalDiscoveryShelf(...)` — the Open Library shelf `15e-books` built.
- `routes/jellyfin.ts:563` does the same for music with `buildExternalDiscoveryShelf(...)`.
- `routes/recommended.ts` has **no external provider at all** (`:164`), and its own doc comment
  frames adding one as **additive and non-breaking** (`:167`).

Sofia's requirement, verbatim: _"It is not useful to me if recommendations only show things already
in my library."_ Discovery of unowned titles mixes into **For You only**. So the aggregator cannot
serve For You until it carries this.

## The change

**You own `apps/server/src/routes/recommended.ts` and its test. Nothing else.** Do not modify
`libraries.ts` or `jellyfin.ts` — both routes stay exactly as they are; their clients still use them.

Both builders are **already exported** and reusable:

```
buildBookExternalDiscoveryShelf(app, profile, pool: {items: LibraryItem[]}, libraryId, providerFactories?)
  -> { id, label, type, reason, items: RecommendedLibraryItem[] } | null      (libraries.ts:115)

buildExternalDiscoveryShelf(...)                                              (jellyfin.ts:192)
```

The aggregator already has everything they need: a `TasteProfile` (`recommended.ts:381`) and both
pools (`tryBuildAbsPool` / the Jellyfin equivalent).

### The real work is the adaptation, and it is where this will go wrong

Those builders return **`RecommendedLibraryItem`/`MusicRecommendedAlbum`-shaped** items. This route
serializes **`MixedRecommendedItem`** — a flat card projection (`recommended.ts:176-184`). You must
adapt, not splice. For each external item:

- `kind` — `'book'` or `'album'` as appropriate. **Authoritative**; clients branch on it.
- `availability: 'external'`. **This is the first time this route can emit a non-`'owned'` value.**
  Both clients guard on it and both guards are currently untestable for exactly that reason — your
  wave is what makes them real. Say so in your report.
- `id`, `title`, `subtitle`, `coverPath`/`imageTag` per the existing `toMixedItem` conventions
  (`:306-353`).
- **`progress: null`** if that field exists by the time you run — but note it probably does not;
  `15c-2-S-3` was cancelled as vacuous. Do not add it.

### Ordering and `itemLabels`

- **External shelves lead**, mirroring both existing routes (`libraries.ts:345`,
  `jellyfin.ts:583`): `[...externalShelves, ...libraryShelves]`.
- **`itemLabels` on an external shelf**: it is populated by `typeLabelsFor` from
  `candidatesById`, and external items are **not** in the candidate pool. Decide deliberately
  whether an external shelf spanning kinds needs labels, and **state your decision and reasoning**.
  Getting this wrong ships a map matching no rendered card — the exact trap `a1c0075` closed.
- **A `null` return means "not this response"**, never an empty placeholder shelf. Both existing
  routes already have that contract; match it.

### One decision the existing signature forces on you

`buildBookExternalDiscoveryShelf` takes a **`libraryId`**, but this route spans **every** library.
Pick one deliberately — the book library whose pool contributed the profile is the obvious choice,
since the id is used downstream for the request pre-fill flow — and **say which you picked and
why**. If no book library exists, the external book shelf must be absent, not broken.

## Tests

Strictly TDD, failing test first, asserting **through to the serialized HTTP response** the way the
existing tests in `recommended.test.ts` do — never to an internal return value.

Cover: (1) an external shelf appears and **leads**; (2) its items carry `availability: 'external'`
and the correct `kind`; (3) the whole shelf is **absent**, not empty, when the provider yields
nothing; (4) a provider that throws degrades to no external shelf and does not fail the request —
the `ExternalRecommendationProvider` contract says never throws, and both existing builders take an
injectable `providerFactories` parameter **specifically so a test can hand in one that violates it**.
Use that seam; do not mock around it.

**Do not assert exact `reason` strings** — copy is deliberately free to change server-side.

## Then, and only then

Re-land the client triple by reverting the two reverts (`git revert` of `5e03ccd` and `b31e724`;
the originals are `5ce4bde` and `710461f`), and **run the full `--project=app` suite**.
`e2e/app/for-you-external-book.spec.ts` is the discriminating check — it is what caught this. Then
dispatch `-P` from `docs/agent-specs/15c-2-P-PARITY.md`.

## Working rules

- Worktree-isolated. **Literal first action:** `git reset --hard <current main tip>` inside your
  worktree, verified with `git log -1` — with no `worktree.baseRef` configured you otherwise land on
  an empty scaffold. Then `pnpm install --frozen-lockfile` once; never `pnpm add`.
- **Commit before running any long command.** Run targeted tests
  (`pnpm vitest run apps/server/src/routes/recommended.test.ts`), then `pnpm vitest run apps/server`
  and `pnpm typecheck` once each. **Do not run Playwright** — the orchestrator runs it.
- **Never make an `Agent` call of any kind.** Do not push.
- Keep context small: `Grep` over whole-file reads, `offset`/`limit` reads, never re-read a file you
  wrote. Cost is roughly quadratic in turn count.
