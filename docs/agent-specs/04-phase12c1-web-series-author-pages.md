# 12c-1 (web) — series and author detail pages

**The unblocked half of 12c.** Ready to launch now: these routes and pages are needed
whichever way the user answers the one open question (queue entry `440b217` — whether a
title already in the library should still be offered as requestable). That answer only
governs whether _non-library_ content also appears on these pages, which is **12c-2**.

`model: "sonnet"`, `isolation: "worktree"`. Fill the reset sha in from
`git log --oneline origin/main -1` at launch.

---

You are implementing **Auralis phase 12c-1, web half**: detail pages for a series and for an
author.

## FIRST ACTION, before reading or touching anything

Your worktree's base is wrong by default, and a fresh worktree has no `node_modules`. Run,
literally first:

```
git reset --hard <SHA — the orchestrator fills this in at launch>
git log -1 --oneline
ls apps/web/src/features/search/searchFilters.ts
pnpm install --frozen-lockfile
```

`--frozen-lockfile` cannot rewrite the lockfile, which is why this one install is allowed.
Do not run bare `pnpm install` or `pnpm add`. Do not push. Do not create further worktrees.

**A second session may be working in this repo concurrently.** Read
`docs/HANDOVER.md`'s "Claimed work" block before you start and stay out of whatever it names.

## Why this wave exists

Phase 12b-1 shipped Series and Author results in Search. They render **inert** — there is
nowhere to go, because no `/series/:id` or `/author/:id` route exists anywhere in the app.
That is the gap you are closing.

## What to build

1. **`/series/$seriesId`** — the series, its books in series order, each book linking to its
   existing item page.
2. **`/author/$authorId`** — the author, and their books in the library.
3. **Make the Search results for series and authors interactive**, pointing at these routes.
   `apps/web/src/features/search/SearchPage.tsx` renders them with
   `ListItem interactive={false}` today precisely because there was no destination.

**Out of scope — 12c-2 owns it, do not build it**: showing content that is _not_ in the
library, greying it out, making it requestable, or the "Show non-library content in
artist/author pages" setting. This wave is library content only. It is scoped this way
deliberately so it can land before the user's answer arrives.

## Read exactly these files

Use `Grep` and offset/limit reads. Do not `cat` a directory. Do not read a file twice.

- `apps/web/src/router/routeTree.ts` — every leaf route uses `lazyRouteComponent`; match it.
- `apps/web/src/features/music/MusicArtistPage.tsx` — the closest existing analogue (an
  entity page listing its children). **Follow its shape rather than inventing one.**
- `apps/web/src/features/item/` — the book item page these link to.
- `apps/server/src/routes/libraries.ts` — grep for what the BFF exposes for a series and for
  an author. **Do not change the server** unless the client genuinely cannot express this
  against the current API; if it cannot, stop and report rather than designing an endpoint
  yourself.
- `packages/abs-client/src/schemas/raw.ts` — grep only, for the series/author shapes.
- `apps/web/src/features/search/SearchPage.tsx` — the inert rows to make interactive.

## Decisions already made — do not re-litigate

- **Mantine is the implementation layer.** No new UI library.
- **Parse at every upstream boundary with zod** on the server side; the web API client does
  not parse, by existing convention.
- **Total functions that degrade rather than throw.** A series id that does not resolve
  shows a real "not found" state, not a blank page and not a crash.

## Tests — test-driven, strictly

Failing test first. Tests read as behaviour descriptions, not `it('works')`.

- **Unit** for any pure logic (ordering books within a series is the obvious candidate —
  series sequence is not the same as alphabetical, and an unnumbered entry has to go
  somewhere predictable).
- **E2E**, new `e2e/app/series-author.spec.ts`: a series page lists its books in series
  order; an author page lists theirs; a search result for each navigates there; an unknown
  id shows a not-found state rather than an empty page.
- Targeted specs while iterating. **One full `pnpm test:e2e` before committing**, in the
  **foreground** — a backgrounded run is orphaned when your turn ends, which has cost three
  agents a turn each. Do not background it.

**Known flakiness, so you read a failure correctly**: this suite flakes under CPU load, and a
second session may be running its own tests — including a port clash on 4310 that reads as
"already used". If a spec fails, re-run it alone before concluding you broke it, and say in
your report which failures reproduced in isolation and which did not.

**And test the test.** Two tests in this phase have passed vacuously — one inherited state
from a neighbouring test and passed with the feature reverted. For at least your most
important new assertion, revert the code it covers, confirm it goes red, and restore. Say in
your report that you did.

Playwright works on this machine. Look at what you built: `pnpm exec playwright test <spec>
--headed`, and screenshot.

## Do not touch

`apps/android/`, `.github/`, `scripts/`, `docs/`, `.claude/`, `metadata/`,
`playwright.config.ts`, `apps/web/src/state/`, `apps/web/src/features/player/`,
`apps/web/src/features/podcasts/`, and anything the current "Claimed work" block assigns to
another session.

## Before you finish

`pnpm format && pnpm lint`, and `npx tsc -p apps/web/tsconfig.json --noEmit` (plus
`apps/server` if you touched it). The root `pnpm typecheck` runs five `tsc` processes at once
and does not reliably complete on this machine.

Commit on your worktree branch. Do not push.

## Report

Prose, no file contents. Branch and commit sha, and the sha you reset to. What you changed,
one line per file. **What the BFF already exposed for series and authors, and whether you
needed anything it did not have.** **How you ordered books within a series, and where an
unnumbered entry lands.** Which tests you ran and their results, distinguishing reproducible
failures from load flakes, and which assertion you verified by reverting. Anything you
decided that the spec did not settle.
