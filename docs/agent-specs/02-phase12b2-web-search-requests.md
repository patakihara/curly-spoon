# 12b-2 (web) — Search: library vs requestable results, and requesting from Search

**Launch only after 12b-1 has merged** — it builds on that view. `model: "sonnet"`,
`isolation: "worktree"`. Fill the reset sha in at launch.

---

You are implementing **Auralis phase 12b-2, web half**: making the Search view the requests
surface as well as the library-search surface.

## FIRST ACTION

```
git reset --hard <SHA — the orchestrator fills this in at launch>
git log -1 --oneline
ls apps/web/src/features/search
pnpm install --frozen-lockfile
```

A fresh worktree has no `node_modules`. Do not run bare `pnpm install` or `pnpm add`. Do not
push. Do not create further worktrees.

## The spec (from the user, verbatim in `docs/ROADMAP.md` §12b)

> The "Search" view doubles as both the requests view, and a global library search.
>
> [...] Here, there is a clear separation between items in the library and items available
> to request. Pressing on an item available to request will request that item.

What to build:

1. **A clear visual separation** between results already in the library and results
   available to request. "Clear" is the user's word — a heading and a distinct treatment,
   not a subtle badge.
2. **Pressing a requestable item requests it**, using the existing request mutation. It must
   give feedback that the request was made, and it must not silently no-op on failure.
3. **Requestable results appear only when a request could actually be fulfilled.**
   `destinations.ts` already derives `hasEnabledIndexer` and `hasEnabledDownloadClient` from
   `GET /api/v1/providers` via `lookupProviders`, and **that is the intended signal for
   this** — they are currently computed and passed to `visibleDestinations`, which does not
   read them, precisely so this wave can use them. Read `destinations.ts`'s doc comment; it
   says so. You may read that file and thread the flags through; do not restructure the
   shell.

## Read exactly these files

- `apps/web/src/features/search/` — as 12b-1 left it.
- `apps/web/src/features/requests/` — the existing requests UI and its mutations. **Reuse
  the mutation; do not write a second one.**
- `apps/web/src/features/music/` — the `/music/requests` flow, for the music-request path.
- `apps/web/src/components/destinations.ts` — **read only**, for `lookupProviders`.
- `apps/server/src/routes/requests.ts` — the request API's real shape.
- `e2e/app/requests.spec.ts`, `e2e/app/music-requests.spec.ts`

## Decisions already made — do not re-litigate

- **`/requests` and `/music/requests` keep working as routes.** This wave changes where
  requests are _reached from_, not whether those pages exist. Deleting them is not your call.
- **A music request's terminal state is `importRequested`, not `completed`**, by design —
  Jellyfin exposes no API to confirm an import landed. Do not "fix" that.

## Tests — test-driven, strictly

- **Unit** for the partitioning: given a mixed result set, which items are library and which
  are requestable, and that with no enabled indexer or no download client the requestable
  group is empty rather than unfulfillable.
- **E2E**, extending `e2e/app/search-view.spec.ts`: the two groups render distinctly, and
  pressing a requestable item creates a request and shows feedback.
- Targeted specs while iterating. **One full `pnpm test:e2e` before committing**, in the
  **foreground**.

Playwright works here — look at the result, screenshot it.

## Do not touch

`apps/android/`, `packages/`, `.github/`, `scripts/`, `docs/ROADMAP.md`,
`docs/HANDOVER.md`, `.claude/`, `metadata/`, `playwright.config.ts`, and
`apps/web/src/components/` beyond reading.

## Before you finish

`pnpm format && pnpm lint`, `npx tsc -p apps/web/tsconfig.json --noEmit`. Commit on your
worktree branch. Do not push.

## Report

Prose, no file contents. Branch and sha, and the sha you reset to. What you changed, one
line per file. **How you made the separation visually clear**, and **what happens on a failed
request**. Which tests you ran and their results. Anything you decided that the spec did not
settle.
