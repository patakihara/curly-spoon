# 12b (web) — the Search view, doubling as the requests view

Ready to launch once **12a (web nav shell)** has merged. Reset the agent to the branch tip at
launch time, not to any sha written here. `model: "sonnet"`, `isolation: "worktree"`.

---

You are implementing **Auralis phase 12b, web half**: making the Search view the single
surface for both library search and requests.

## FIRST ACTION, before reading or touching anything

Your worktree's base is wrong by default. Run, literally first:

```
git reset --hard <CURRENT BRANCH TIP — the orchestrator fills this in at launch>
git log -1 --oneline
ls apps/web/src/features/search
pnpm install --frozen-lockfile
```

A fresh worktree has no `node_modules`, so that install is required before any test will
run. Do not run bare `pnpm install` or `pnpm add`. Do not push. Do not create further
worktrees.

## The spec (from the user, verbatim in `docs/ROADMAP.md` §12b)

> The "Search" view doubles as both the requests view, and a global library search.
>
> In the search view, chips at the top let the user filter for specific kind of content —
> and when pressing one, additional filters become available. For instance, if I go >
> Search > enter "hello" > select "Music", I then also get the filter for All / Songs /
> Albums / Artists. If I had instead selected "Books", I would then get All / Books /
> Series / Authors.
>
> If I don't select a filter, all possible results show up, grouped by content type, and
> sorted by relevance. They show up as a list. Here, there is a clear separation between
> items in the library and items available to request. Pressing on an item available to
> request will request that item.

Concretely, the behaviour to build:

1. **A chip row of content types** — All, Music, Books, Podcasts.
2. **Selecting a type reveals a second chip row** of type-specific filters. Music → All /
   Songs / Albums / Artists. Books → All / Books / Series / Authors. Podcasts → decide the
   set yourself from what the podcast API actually returns, and say what you chose.
3. **No type selected** → every kind of result, **grouped by content type**, **sorted by
   relevance**, rendered **as a list** (not a grid).
4. **Library results and requestable results are clearly separated** within the view.
5. **Pressing a requestable item requests it**, using the existing request mutation.

## Read exactly these files

Use `Grep` and offset/limit reads. Do not `cat` a directory. Do not read a file twice.

- `apps/web/src/features/search/` — the whole feature, which already does unified library
  search across books, podcasts and music. This is what you are extending, not replacing.
- `apps/web/src/features/requests/` — the existing requests UI and its mutations.
- `apps/web/src/features/music/` — for `/music/requests`, the music-request flow.
- `apps/server/src/routes/` — grep for the search and requests route handlers to learn the
  exact response shapes. **Do not change the server** unless the client genuinely cannot
  express this against the current API; if it cannot, stop and report rather than
  redesigning the API yourself.
- `e2e/app/search-music.spec.ts`, `e2e/app/requests.spec.ts`, `e2e/app/music-requests.spec.ts`

## Decisions already made — do not re-litigate

- **`/requests` and `/music/requests` keep working as routes.** This wave changes where
  requests are _reached from_, not whether those pages exist. Deleting them is a separate
  decision and not yours.
- **Relevance ordering is the server's job if the server already does it.** Check before
  writing a client-side scorer; a client-side re-rank over a server-ranked list is worse
  than either alone.

## Tests — test-driven, strictly

Failing test first. Tests read as behaviour descriptions, not `it('works')`.

- **Unit** for the chip-state logic: which second-row filters a given first-row selection
  reveals, and that clearing the first row clears the second. Pure function, own test file.
- **E2E** in a new `e2e/app/search-view.spec.ts`: the two-row chip behaviour with the
  user's own example (enter "hello", select Music, see All/Songs/Albums/Artists), the
  grouped-by-type list when nothing is selected, and the visible separation between library
  and requestable results.
- Run **targeted** specs while iterating. Run the **full `pnpm test:e2e` once** before
  committing — this view is reachable from the nav shell, so it can break specs that do not
  mention it.

Playwright works on this machine. Use it to look at what you built rather than inferring:
`pnpm exec playwright test <spec> --headed`, and screenshot.

## Do not touch

`apps/android/`, `packages/`, `.github/`, `scripts/`, `docs/ROADMAP.md`, `docs/HANDOVER.md`,
`.claude/`, `metadata/`, `playwright.config.ts`, and `apps/web/src/components/` (12a owns
the shell).

## Before you finish

`pnpm format && pnpm lint`, and `npx tsc -p apps/web/tsconfig.json --noEmit` — the root
`pnpm typecheck` runs five `tsc` processes at once and does not reliably complete on this
machine.

Commit on your own worktree branch. Do not push.

## Report

Prose, no file contents. Branch and commit sha, and the sha you reset to. What you changed,
one line per file. **Which podcast sub-filters you chose and why.** Whether relevance
ordering came from the server or from you. Which tests you ran and their results. Anything
the spec did not settle that you decided, and what you decided.
