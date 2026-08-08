# 12d (Android) — For You: uniform album-card carousels

Mirror the shipped web wave (`694e042`, `58d3fd7`) on Android. Web's design is settled; this is
a port, not a design task. `apps/android/**` only.

---

## First action, before reading or touching anything

You are in a git worktree whose base is `origin/main`'s empty "Initial commit" scaffold, not
this project's history. Run, as your literal first command:

```bash
git reset --hard <BRANCH_TIP_SHA>
git log --oneline -1
ls apps/android/app/src/main/java/net/auralis/app/features/home/
```

The third command must list `HomeScreen.kt`, `HomeShelvesContent.kt`, `HomeViewModel.kt`. If it
does not, stop and report — do not proceed on the wrong base.

## Standing rules for this wave

- **Never make an `Agent` call at all**, for any reason, including a one-word follow-up. A
  stray `Agent("continue")` on 2026-08-08 resumed an unrelated agent and pushed three
  unreviewed commits to `main`.
- **Do not push. Do not merge. Do not touch `main`.** Commit on your own worktree branch only.
- **Do not run `pnpm install` / `pnpm add`.** Dependencies are pre-installed.
- **Commit before you background any long-running command**, then amend or follow up with the
  result. An agent that backgrounds a run and stops holds its whole wave in a worktree that is
  deleted with its session; this has cost two waves already.
- **Do not touch `docs/HANDOVER.md`.** You may append to `docs/ROADMAP.md` §12d — nothing else
  in docs.
- Keep context small: `Grep` over reading whole files, read with offset/limit, never re-read a
  file you wrote, never `cat` a directory, run targeted tests rather than the whole suite.

## Do not touch

`apps/web/**`, `packages/**`, `apps/server/**`, `e2e/**`, `docs/HANDOVER.md`, and everything
under `apps/android` outside the files named below.

---

## What you cannot verify, and what to do instead

**This machine has no JDK, no Android SDK, no emulator and no Playwright for Android.** You
cannot compile, run, or look at this screen. CI is the only compiler. The web version of this
wave was verified by measuring real bounding boxes at 390/834/1440px, and `ROADMAP.md` records
that class-name assertions passed while the layout was visibly broken — so the visual
requirement genuinely cannot be checked the way it was checked on web.

**The substitute is structural, and it is required, not optional:**

- Every card geometry number lives in **named `Dp`/`TextUnit` constants in one file**
  (`ForYouCarousel.kt`), used by every card composable. No literal `160.dp` anywhere else.
- There is exactly **one** card composable (`ForYouCard`) rendering books, podcasts and albums.
  A content type never gets its own card composable, its own size, or its own branch that
  changes height.
- Unit tests assert on those constants and on the mapping functions — they cannot assert on
  pixels. That is the limit, and your report must **state plainly that visual conformance is
  unverified on this machine**, the same disclosure Android Auto and the design audit carry.

Budget for **two or three red Android CI rounds** after this merges. That is normal here: two
independent source reviews of Android 12a both returned "merge as-is" and CI rejected the wave
three times over toolchain facts (a `Modifier.weight` import that resolves to an internal
property; a backtick test name containing `..`, legal in Kotlin and illegal as a JVM method
name). Prefer `AutoMirrored` variants for directional icons.

---

## The requirement (from `docs/ROADMAP.md` §12d)

The reference screenshots are the spec. **They are gitignored, so they are not in your
worktree.** Read them from the main checkout by absolute path — do this, it is not optional,
and prose alone has historically produced generic library layouts here:

```
/home/sofiapata/src/auralis-src/docs/research/spec-addendum/01-for-you.jpg
/home/sofiapata/src/auralis-src/docs/research/spec-addendum/02-for-you.jpg
/home/sofiapata/src/auralis-src/docs/research/spec-addendum/03-for-you.jpg
/home/sofiapata/src/auralis-src/docs/research/spec-addendum/04-for-you.jpg
```

1. A **quick-selection grid** at the top: two-column rows of a small thumbnail plus a title.
2. A **content-type filter chip row**: `All / Music / Podcasts / Audiobooks`, single-select,
   clicking the active chip clears back to `All`.
3. **Everything below is album-card carousels, all at exactly one card size.** Spotify does the
   opposite (`04-for-you.jpg`: a four-column icon grid, then full-width episode cards) and the
   user explicitly does not want that. One card geometry, one carousel pattern, repeated.

---

## The settled model to mirror

Read these three web files — they are the design, already reviewed and shipped:

- `apps/web/src/features/home/forYouFeed.ts` (128 lines) — pure aggregation
- `apps/web/src/features/home/forYouFilters.ts` (40 lines) — pure chip state
- `apps/web/src/features/home/Carousel.tsx` (218 lines) — the single card geometry

Mirror their **behaviour and their doc-comment reasoning**, not their syntax. In particular:

- `shelfToCarousel` takes `contentType` from **the library the shelf came from**, never from
  `shelf.type` — a podcast library's shelves can carry `type: "episode"`.
- `filterCarousels` degrades: an unrecognised filter value shows everything rather than nothing.
- `buildQuickPicks` takes items **round-robin across carousels** (one from each, then wrap),
  capped at 8 — not by draining the first carousel. That is what mixes content types in the grid.

---

## Data sources — already present, no `ApiClient` work needed

Verified against `data/network/ApiClient.kt` at the branch tip. Do not go looking for a unified
feed endpoint; there is none, and the fan-out is the design.

| Need                 | Call                                                         |
| -------------------- | ------------------------------------------------------------ |
| Which libraries      | `apiClient.libraries()` -> `List<Library>` (has `mediaType`) |
| Book/podcast shelves | `apiClient.libraryHome(libraryId)` -> `List<Shelf>`          |
| Music albums         | `apiClient.jellyfinAlbums(favoritesOnly = true, limit = 20)` |

Cover URLs are built as `"${baseUrl.trimEnd('/')}/api/v1/media/$id/cover?width=200"` — the exact
shape `playback/BrowseTree.kt:280` already uses. Resolve the base URL **once in the ViewModel**
via `serverConfigRepository.getBaseUrl()`, never per-composition: `HomeViewModel`'s own doc
comment explains why (it suspends, and the value never changes for the ViewModel's lifetime).

Jellyfin album artwork: mirror whatever `features/music/` already does for album covers — grep
for it rather than inventing a second URL shape.

### Degradation is per-source and structurally load-bearing

A user with no Jellyfin server must still get book and podcast carousels; a failing
`GET /libraries` must still yield music. **Put the `try`/`catch` inside each `async`, never
around the enclosing `coroutineScope`** — a failing `async` child cancels its parent _and its
siblings_, so a catch on the outside silently loses the other sources' results too. This is
exactly the mistake `UnifiedSearchViewModel.kt` documents avoiding; read its fan-out and copy
the structure. `ApiClient.execute()` only ever throws `ApiException`, so each catch is total.

---

## Files

**Create:**

| File                                            | Contents                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/home/ForYouFeed.kt`                   | Pure: `ForYouContentType`, `FeedItem`, `FeedCarousel`, `shelfToCarousel`, `albumsToCarousel`, `filterCarousels`, `buildQuickPicks`. No Android imports, no `ApiClient`. |
| `features/home/ForYouFilters.kt`                | Pure: `FOR_YOU_FILTER_OPTIONS`, `DEFAULT_FOR_YOU_FILTER`, `selectForYouFilter`. Mirrors `forYouFilters.ts` exactly, labels and order included.                          |
| `features/home/ForYouCarousel.kt`               | The **single** `ForYouCard` composable, the `ForYouCarouselRow`, the quick-pick grid, and every geometry constant.                                                      |
| `features/home/ForYouViewModel.kt`              | Fan-out, per-source `try`/`catch`, `ForYouUiState`, filter state, cover-URL resolution.                                                                                 |
| `features/home/ForYouScreen.kt`                 | `Scaffold` + `TopAppBar("For you")`, chip row, quick-pick grid, carousels, loading and error states.                                                                    |
| `test/.../features/home/ForYouFeedTest.kt`      | See assertions below.                                                                                                                                                   |
| `test/.../features/home/ForYouFiltersTest.kt`   | See assertions below.                                                                                                                                                   |
| `test/.../features/home/ForYouViewModelTest.kt` | See assertions below.                                                                                                                                                   |

**Edit:** `navigation/AuralisNavHost.kt` — `composable(Routes.HOME)` now mounts `ForYouScreen`.
Nothing else in that file changes; `Routes.HOME` keeps its string, so `ShellDestinations.kt` and
its test need no edit (resolution is by route, not by what is mounted).

**Delete only if genuinely unreferenced after your change:** `features/home/HomeScreen.kt`. Grep
for references first. **`HomeShelvesContent.kt` and `HomeViewModel.kt` must stay** —
`features/books/BooksScreen.kt` uses both and is not in this wave's scope. If deleting
`HomeScreen.kt` breaks anything at all, leave it and say so in the report.

### Name the reader

Four features on this project shipped a writer with no reader, all green on unit tests. Your
report must state, per surface: **what mounts it, and how a user reaches it from the running
app.** Specifically: which route mounts `ForYouScreen`, what consumes the chip-filter state, and
what happens when a card is tapped. If a card tap has no destination, say so explicitly rather
than leaving a dead `onClick`.

**Card taps:** a book or podcast card starts it playing via `PlayerViewModel`, exactly as
`HomeShelvesContent.kt` does today — read that file for the call. A music album card navigates to
`Routes.musicAlbumDetail(albumId)`. Do not invent a third behaviour.

---

## Test assertions (these are requirements, not suggestions)

`ForYouFeedTest.kt`:

- `shelfToCarousel` uses the passed `contentType`, **not** `shelf.type` — assert with a shelf
  whose `type` is `"episode"` mapped as `podcasts`.
- A book item's subtitle prefers structured `authors[]` over free-text `author`, and falls back.
- `albumsToCarousel` yields `progress = null` for every album.
- `filterCarousels("music")` keeps only music; `filterCarousels("nonsense")` keeps **all**.
- `buildQuickPicks` is round-robin: three carousels of three items each yield the _first_ item of
  each carousel before the second of any. Assert the exact resulting id order.
- `buildQuickPicks` caps at 8, and terminates on carousels of unequal length without looping
  forever.

`ForYouFiltersTest.kt`:

- The option list is exactly `All / Music / Podcasts / Audiobooks` in that order, with those
  labels — "Audiobooks", not "Books".
- `selectForYouFilter(current = "music", "music") == "all"` (re-clicking the active chip clears).

`ForYouViewModelTest.kt` — **read `docs/HANDOVER.md`'s "Android CI: read this before touching an
Android test" section before writing a line of this file.** The traps it records have cost four
red rounds:

- Build `ApiClient` with `ioDispatcher = testDispatcher`, the **same** dispatcher passed to
  `Dispatchers.setMain`. Nine ViewModel test files here do this; the one file that injected into
  `setMain` only, and not into `ApiClient`, cost a red round and survived a review that
  explicitly checked for it. Nothing in this wave is timing-dependent, so the convention applies.
- Assert on `uiState.value` directly. Do **not** add a `Flow.first { ... }` await — the call is
  synchronous under an unconfined dispatcher and an await for a state already passed never
  returns.
- Key `MockWebServer` responses with a `Dispatcher` on the **request path**, never by enqueue
  order: this ViewModel issues several concurrent requests and responses arrive in
  request-arrival order.
- **Assert through to observable state, never only to a function's return value.** A green state
  assertion on this project locked a real no-op in as correct (`QueueStore`'s `advance`).
- Backtick test names must contain no `.` — legal in Kotlin, illegal as a JVM method name, and
  it has turned CI red here once already.

Behaviours to pin:

- A Jellyfin failure still produces book and podcast carousels (and vice versa) — this is the
  per-source degradation above, and it is the assertion most worth having.
- Total failure of every source produces `Error`, not an empty `Loaded`.
- Changing the filter changes which carousels `uiState` exposes, without refetching.

Add a `ForYouCarousel.kt` geometry test only if it can assert something real about the shared
constants without a device; if it would be a tautology, skip it and say so.

---

## Definition of done for this wave

1. `git status --short` clean, work committed on your worktree branch, **not pushed**.
2. A report naming: the branch and commit sha; the reader for each new surface; what you deleted
   and why it was safe; and an explicit statement that **visual conformance is unverified on this
   machine**.
3. Anything you could not verify, named. Do not round "did not run" up to "passes".
