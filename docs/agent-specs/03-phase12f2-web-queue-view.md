# Wave 12f-2 — the web queue view, clear-queue, and queueable chapters

**Depends on wave 12f-1** (the queue model). Do not start until 12f-1 is merged to `main`;
this wave consumes its exported API and builds nothing of the model itself.

Split from 12f-1 deliberately: agent cost is quadratic in turns, and one agent doing model
plus UI plus Playwright would run long. 12f-1 is logic and unit tests; this is the surface.

## STEP 0 — first actions, literally

You are in a fresh git worktree whose default base is wrong for this repo (it lands on an
empty `origin/main` scaffold). Before reading anything:

```
git reset --hard <FILL IN: git log --oneline origin/main -1 at launch>
git log --oneline -1
ls apps/web/src/state/
```

The `ls` must show `createQueueStore.ts`, `podcastQueueStore.ts` and
`audiobookQueueStore.ts`. If it does not, 12f-1 has not merged yet — **stop and report**,
do not build the model yourself.

Then `pnpm install --frozen-lockfile`. Never `pnpm add`, never an unfrozen install, never a
write to `pnpm-lock.yaml` — concurrent agents corrupt it, and that is this project's main
failure mode.

## What 12f-1 gives you

- `apps/web/src/state/createQueueStore.ts` — `SimpleQueueState<T>` (`order`, `cursor`) and
  `SimpleQueueStore<T>` (`queue`, `setQueue`, `enqueueNext`, `enqueueLast`, `advance`,
  `clearQueue`).
- `useMusicQueueStore` (now with `clearQueue()`), `usePodcastQueueStore`,
  `useAudiobookQueueStore`.
- `apps/web/src/features/player/queueEntries.ts` — `PodcastQueueEntry`,
  `AudiobookQueueEntry` (a `kind: \'item\'` / `kind: \'chapter\'` union), `QueueContentType`.
- `apps/web/src/features/player/queueRouter.ts` — `queueContentTypeOf(item)` and
  `attachQueueForCurrentItem()`.

Read those six files first and build only on their exported API.

## The requirement (roadmap §12f)

- The queue view must **clear the queue, for every content type**.
- **Audiobook chapters must be queueable.**

There is **no queue view in the web app at all today** — the only queue UI is
`NowPlaying.tsx`'s shuffle and repeat controls (~lines 175–192, gated by `showQueueControls`
at ~line 88). This wave creates the surface.

## Build

### 1. `apps/web/src/features/player/QueueView.tsx`

- Reads the queue belonging to `queueContentTypeOf(currentItem)`. Nothing else — one view,
  three sources, never a merged list.
- Renders the upcoming entries in order, with the current entry marked. Music entries render
  their **per-track** artist (`QueueTrack.artist`), never the album artist.
- Empty state per content type. Never a blank panel.
- A **Clear queue** control, present for every content type, calling that type's
  `clearQueue()`. It must not stop or unload what is currently playing — clearing the
  up-next list is not the same as closing the player, and conflating them is the obvious
  wrong turn here.
- Reuse `@auralis/ui` primitives (`ListItem`, `Button`, `IconButton`). Do not hand-roll a
  list, and do not add a new dependency.

Mount it from `NowPlaying.tsx` beside the existing shuffle/repeat controls. Keep the
music-only controls music-only — shuffle and repeat do not exist for podcasts or audiobooks,
by design.

### 2. Queueable chapters — `apps/web/src/features/player/ChapterList.tsx`

Keep the existing click-to-seek behaviour exactly as it is. **Add** a per-chapter overflow
action offering **Play next** and **Play last**, building an
`AudiobookQueueEntry` of `kind: \'chapter\'` and calling `enqueueNext`/`enqueueLast` on
`useAudiobookQueueStore`.

A chapter has no URL of its own, so an enqueued chapter resolves to "load the book, then
seek to `start`" — 12f-1's `audiobookQueueController` already does this, and already seeks
rather than reloading when the book is the loaded item. Do not re-implement that here, and
do not change it.

### 3. Accessibility, not as an afterthought

The clear-queue control needs an accessible name; the queue list needs a real list role and
a marked current item. Phase 10 audited this app for a11y — do not regress it.

## Tests

TDD, failing test first, tests read as behaviour descriptions.

- `apps/web/src/features/player/QueueView.test.tsx` — render-level, no network.
- One Playwright spec, `e2e/app/queue-view.spec.ts`.

**If your spec touches audio at all, neutralise the audio element in that spec file** —
`.src` inert, `play()`/`pause()` no-ops. The e2e fixture audio cannot decode, and two
independent async paths then revert the player store's "playing" state. This cost phase 5
real time; `e2e/app/player.spec.ts` is the pattern to copy.

Assertions that must exist:

1. Clear queue empties the list for a music queue, and leaves the currently-playing item
   playing.
2. The same, for a podcast queue.
3. The same, for an audiobook queue.
4. Clearing one content type's queue leaves the other two intact.
5. "Play next" on a chapter puts it immediately after the cursor; "Play last" appends.
6. The queue view shows the podcast queue when a podcast is loaded and the music queue when
   a track is loaded, without either leaking into the other.
7. A music queue entry displays its own track artist, not the album artist.

## Verify

Targeted while iterating. Before reporting, once each:

```
pnpm vitest run apps/web/src/features/player
npx tsc -p apps/web/tsconfig.json --noEmit
pnpm lint && pnpm format
npx playwright test e2e/app/queue-view.spec.ts --workers=1
```

Then the full Playwright suite **once**, `--workers=1`, and report the pass count.

## Do not touch

`apps/server/**`, `apps/android/**`, `packages/**` (except consuming `@auralis/ui`),
`docs/**`, `pnpm-lock.yaml`, `.claude/**`, and the 12f-1 model files — if the model is wrong,
report it rather than patching it here.

## Finish

Commit on your own worktree branch, message explaining the reasoning, with this repo's
`Co-Authored-By: Claude Opus 5` trailer. **Do not push, do not merge, do not spawn a
reviewer.** Report the branch and sha, which numbered assertions pass, each verify command's
result, every file touched, and anything the spec did not settle.
