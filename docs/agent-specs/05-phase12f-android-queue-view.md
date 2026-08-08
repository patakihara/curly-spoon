# 12f (Android) — the queue view

Web shipped this in `034c4cf` (`apps/web/src/features/player/QueueView.tsx`). Android has the
queue _model_ (wave 12f, `271aad7`/`24d9189`/`ca250f5`) and no UI for it at all. This wave is
the surface. `apps/android/**` only.

---

## First action, before reading or touching anything

You are in a git worktree whose base is `origin/main`'s empty "Initial commit" scaffold, not
this project's history. Run, as your literal first command:

```bash
git reset --hard <BRANCH_TIP_SHA>
git log --oneline -1
ls apps/android/app/src/main/java/net/auralis/app/features/player/
```

The `ls` must list `PlayerViewModel.kt`, `QueueStore.kt`, `QueueEntries.kt`, `QueueRouter.kt`,
`NowPlayingScreen.kt`. If it does not, stop and report — do not proceed on the wrong base.

## Standing rules

- **Never make an `Agent` call at all**, for any reason, including a one-word follow-up.
- **Do not push, do not merge, do not touch `main`.** Commit on your worktree branch only.
- **Do not run `pnpm install` / `pnpm add`.**
- **Commit before backgrounding any long-running command.**
- **Do not touch `docs/HANDOVER.md`.** You may append to `docs/ROADMAP.md` §12f.
- Do not touch `apps/web/**`, `packages/**`, `apps/server/**`, `e2e/**`.
- Keep context small: `Grep` over whole-file reads, read with offset/limit, never re-read a file
  you wrote.

There is **no JDK, no Android SDK and no emulator on this machine.** You cannot compile, run or
look at this. CI is the only gate. Say plainly what you could not verify; do not round "did not
run" up to "passes". Backtick test names must contain no `.` — legal in Kotlin, illegal as a JVM
method name, and it has turned CI red here before. Prefer `AutoMirrored` icon variants.

---

## The one thing that will make this wave wrong if you miss it

**On Android the music queue does not live in a `QueueStore`. It lives in Media3.**

`PlayerViewModel` exposes three `QueueStore`s — `podcastQueue`, `audiobookQueue`, `musicQueue`.
The first two are real. **`musicQueue` is write-once and read-never**: `QueueRouter.kt`'s own doc
comment says "there is never a music action for this router to take", because cross-track advance
for music runs on `MediaController`'s real playlist. Wave 12e already hit this — it inserted
"Play next" into `musicQueue`, the action reported success, and nothing was queued. That was the
fourth instance of this project's most persistent failure class and it was fixed in `51b2358` by
redirecting to Media3.

So:

| Content type | Where its queue actually is                   | Read it from                 |
| ------------ | --------------------------------------------- | ---------------------------- |
| Music        | Media3's playlist on the `MediaController`    | `PlaybackHandle` (extend it) |
| Podcast      | `PlayerViewModel.podcastQueue` (`QueueStore`) | `store.state`                |
| Audiobook    | `PlayerViewModel.audiobookQueue`              | `store.state`                |

**A queue view that renders `musicQueue.state` will display an empty list forever while music is
playing.** Do not mirror web's `QueueView.tsx` structurally on this point — web's music queue
genuinely is a store; Android's is not. Mirror the _product_ behaviour, not the data plumbing.

If, while reading, you conclude the table above is wrong, **say so in your report and stop rather
than guessing** — that is a real ambiguity about intended behaviour, which is the escalation case.

---

## What to build

### 1. Extend `PlaybackHandle` so Media3's playlist is readable

`PlaybackHandle` (in `PlayerViewModel.kt`) is the tested seam over `MediaController` — a unit test
substitutes a fake, because a real controller needs a live `Context` and a bound service that a
plain JVM test cannot provide. It currently exposes `currentMediaItemIndex` and `addMediaItem`
but nothing that _reads_ the playlist. Add, with doc comments in the file's existing style:

- `val mediaItemCount: Int`
- `fun getMediaItemAt(index: Int): MediaItem`
- `fun removeMediaItem(index: Int)`
- `fun clearMediaItems()`

Implement each on `MediaControllerPlaybackHandle` by delegation to the identically-named
`MediaController` method. Update the existing test fake(s) in the test sources to match — grep for
implementations of `PlaybackHandle` and update every one, or the module will not compile.

### 2. Expose which queue is live

`PlayerViewModel.currentContentType` is `private`. The view needs it. Expose it as a
`StateFlow<QueueContentType?>` (a `MutableStateFlow` written wherever `currentContentType` is
assigned today — grep for every assignment, there are several) rather than widening the `var`,
so the UI recomposes when it changes. Keep the private `var` as-is if that is simpler than
rewriting its readers; the point is that a _observable_ copy exists.

### 3. `QueueUi.kt` — the pure mapping layer

A pure file, no Android UI imports, holding:

```kotlin
data class QueueRowUi(
    val id: String,          // stable key for LazyColumn
    val title: String,
    val subtitle: String?,
    val isCurrent: Boolean,
)
```

plus pure functions building `List<QueueRowUi>` from each source:

- from a `SimpleQueueState<PodcastQueueEntry>?`
- from a `SimpleQueueState<AudiobookQueueEntry>?` (a sealed interface — handle every variant)
- from a Media3 playlist, taken as a plain `List<MediaItemSummary>` rather than `MediaItem`
  itself, where `MediaItemSummary` is a small data class you define (`id`, `title`, `artist`).
  **Do not put `MediaItem` in the pure layer** — it is an Android type and would make this file
  untestable on the JVM. The ViewModel adapts `MediaItem` → `MediaItemSummary`.

`isCurrent` marks the entry at the cursor / at `currentMediaItemIndex`. **Remember the cursor
convention**: a podcast/audiobook `QueueStore` does _not_ hold the item playing right now — that
lives on `PlayerViewModel` — and an empty queue bootstraps at `cursor = -1`, not `0`. Getting this
wrong shipped a silent no-op once already (`ca250f5`). Read `QueueStore.kt`'s doc comments before
writing this.

### 4. `QueueScreen.kt` — the surface

- A `LazyColumn` of rows, the current entry visually distinguished.
- **A clear-queue action for the live content type.** Web's requirement is "the queue view must
  be able to clear the queue, for every content type."
- An empty state that says which queue is empty rather than rendering a blank box.
- Reachable from `NowPlayingScreen.kt` — add a queue/up-next button to it, and a `Routes.QUEUE`
  entry plus a `composable(Routes.QUEUE)` in `AuralisNavHost.kt`.

**Clearing must clear the real queue**, which means: `QueueStore.clearQueue()` for podcast and
audiobook, and `clearMediaItems()` on the `PlaybackHandle` for music. A clear that only resets a
store while Media3 keeps playing its playlist is exactly the bug this spec's second section is
about.

### Name the reader

Your report must state, per surface: what mounts it, and how a user reaches it from the running
app. Four features on this project shipped a writer with no reader, all green on unit tests. If
any action you add has no observable effect, say so rather than leaving it in.

---

## Test assertions

Put ViewModel/queue tests beside the existing ones. **Read `docs/HANDOVER.md`'s section "Android
CI: read this before touching an Android test" first** — its traps have cost this project five
red rounds.

`QueueUiTest.kt` (pure, cheap, most of your coverage):

- A podcast queue at `cursor = -1` (bootstrapped, nothing consumed) marks **no** row `isCurrent`.
- A queue at `cursor = 1` marks exactly the index-1 row `isCurrent`.
- A `null` queue state yields an empty list, not a crash.
- Every `AudiobookQueueEntry` variant maps to a row with a non-blank title.
- A Media3 summary list marks the row at `currentMediaItemIndex` as current, and marks none when
  that index is `-1`.

`PlayerViewModel` tests:

- **Clearing the music queue calls `clearMediaItems()` on the `PlaybackHandle`** — assert on the
  fake handle, not on `musicQueue.state`. This is the assertion that pins the whole point of this
  wave; it must fail if someone redirects the clear back to the store.
- Clearing a podcast queue empties `podcastQueue.state` and does **not** touch the handle.
- Build `ApiClient` with `ioDispatcher = testDispatcher`, the same dispatcher passed to
  `Dispatchers.setMain`, if your test needs `ApiClient` at all.
- Assert on `.value` directly; do not add a `Flow.first { … }` await for a state already passed.
- **Assert through to observable behaviour, never only to a function's return value.** A green
  state assertion on this project locked a real no-op in as correct.

---

## Definition of done

1. `git status --short` clean, committed on your worktree branch, **not pushed**.
2. A report naming: branch and sha; the reader for each new surface; **which source each of the
   three content types' rows is read from**, stated explicitly so the orchestrator can check it
   against the table above; and everything you could not verify.
