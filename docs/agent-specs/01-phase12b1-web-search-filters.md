# 12b-1 (web) — Search: the two-row content-type filters and grouped results

Launch first; **12b-2 depends on the view this builds.** `model: "sonnet"`,
`isolation: "worktree"`. Fill the reset sha in from `git log --oneline origin/main -1` at
launch — the current branch tip is `797dd51` or later.

---

You are implementing **Auralis phase 12b-1, web half**: the Search view's content-type
filter chips and its grouped, list-shaped results.

## FIRST ACTION, before reading or touching anything

Your worktree's base is wrong by default, and a fresh worktree has no `node_modules`. Run,
literally first:

```
git reset --hard <SHA — the orchestrator fills this in at launch>
git log -1 --oneline
ls apps/web/src/features/search
pnpm install --frozen-lockfile
```

`--frozen-lockfile` cannot rewrite the lockfile, which is why this one install is allowed.
Do not run bare `pnpm install` or `pnpm add`. Do not push. Do not create further worktrees.

## The spec (from the user, verbatim in `docs/ROADMAP.md` §12b)

> In the search view, chips at the top let the user filter for specific kind of content —
> and when pressing one, additional filters become available. For instance, if I go >
> Search > enter "hello" > select "Music", I then also get the filter for All / Songs /
> Albums / Artists. If I had instead selected "Books", I would then get All / Books /
> Series / Authors.
>
> If I don't select a filter, all possible results show up, grouped by content type, and
> sorted by relevance. They show up as a list.

What to build:

1. **A first chip row of content types** — All, Music, Books, Podcasts.
2. **Selecting a type reveals a second chip row.** Music → All / Songs / Albums / Artists.
   Books → All / Books / Series / Authors. Podcasts → choose the set from what the podcast
   API actually returns, and say in your report what you chose and why.
3. **Clearing the first row clears the second.**
4. **Nothing selected** → every kind of result, **grouped by content type**, **sorted by
   relevance**, rendered **as a list**, not a grid.

**Out of scope for this wave** — 12b-2 owns it, do not build it: the visual separation of
library results from requestable ones, and pressing a requestable item to request it.

## Read exactly these files

`Grep` and offset/limit reads. Do not `cat` a directory. Do not read a file twice.

- `apps/web/src/features/search/` — the whole feature. It already does unified library
  search across books, podcasts and music. You are extending it, not replacing it.
- `apps/server/src/routes/` — grep for the search route handler to learn the exact response
  shape and whether it already ranks by relevance. **Do not change the server** unless the
  client genuinely cannot express this against the current API; if it cannot, stop and
  report rather than redesigning the API yourself.
- `packages/ui/src/components/Chip.tsx` — use the existing chip, do not write a new one.
- `e2e/app/search-music.spec.ts`

## Decisions already made — do not re-litigate

- **Relevance ordering is the server's job if the server already does it.** Check before
  writing a client-side scorer; a client-side re-rank over a server-ranked list is worse
  than either alone.
- **Chip state belongs in a pure, tested function**, not scattered through the component.

## Tests — test-driven, strictly

Failing test first. Tests read as behaviour descriptions, not `it('works')`.

- **Unit**, own file: which second-row filters a given first-row selection reveals; that
  clearing the first row clears the second; that an unknown first-row value degrades to no
  second row rather than throwing.
- **E2E**, new `e2e/app/search-view.spec.ts`: the user's own example — type "hello", select
  Music, see All/Songs/Albums/Artists — and the grouped-by-type list when nothing is
  selected.
- Targeted specs while iterating. **One full `pnpm test:e2e` before committing** (~6.5
  min, run it in the **foreground** — a backgrounded run is orphaned when your turn ends).

Playwright works here. Look at what you built rather than inferring it:
`pnpm exec playwright test <spec> --headed`, and screenshot.

## Do not touch

`apps/android/`, `packages/` (except reading `Chip.tsx`), `.github/`, `scripts/`,
`docs/ROADMAP.md`, `docs/HANDOVER.md`, `.claude/`, `metadata/`, `playwright.config.ts`,
`apps/web/src/components/` (12a owns the shell — you may **read** `destinations.ts`, not
change it).

## Before you finish

`pnpm format && pnpm lint`, and `npx tsc -p apps/web/tsconfig.json --noEmit` — the root
`pnpm typecheck` runs five `tsc` processes at once and does not reliably complete here.

Commit on your worktree branch. Do not push.

## Report

Prose, no file contents. Branch and commit sha, and the sha you reset to. What you changed,
one line per file. **Which podcast sub-filters you chose and why.** **Whether relevance
ordering came from the server or from you.** Which tests you ran and their results. Anything
the spec did not settle that you decided, and what you decided.
