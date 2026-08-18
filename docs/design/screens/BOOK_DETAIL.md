# Book detail — shared behaviour spec (wave 16e-book)

Status: **spec only, nothing implemented against it yet.** This is the shared spec both the
`16e-book-W` (web) and `16e-book-A` (Android) waves build from, independently, followed by a
`16e-book-P` parity review by an agent that wrote neither half. Per `ROADMAP.md` §16, this screen
is one of several triples in the `16e` set — see that section for the sequencing rule ("one `-W` in
flight at a time; `-A` halves and spec authoring parallelise freely").

This document describes **behaviour and structure**, not a React tree or a Compose tree. Where the
design (`docs/design/SONORA.md`, `docs/design/sonora/`) doesn't cover something, that is stated
explicitly rather than invented.

---

## 1. What the screen is for

Audiobooks are the user's stated priority 1 (`HANDOVER.md`, "What the user asked for"). This is the
screen a listener lands on after tapping a book anywhere in the app — a shelf card, a library grid,
a search result, an author's or series' own page. Its job is:

1. **Show enough about the book to decide whether to start it** — who wrote and narrates it, how
   long it is, what it's about, where the listener already got to if they've started it.
2. **Start or resume playback in one tap.**
3. **Jump to a specific chapter** without having to scrub through the whole book.
4. **Reach the author** (web only today — see §7).

It is a detail page, not a library browser: it shows one book. Browsing "all books" is
`BooksPage.tsx` / (on Android, currently `BooksScreen.kt`'s shelves) — a different screen, out of
scope here.

---

## 2. Content inventory — what each platform shows today

**Evidence, not assumption.** Web's implementation is `apps/web/src/features/item/ItemPage.tsx`
(112 lines, read in full). Android has **no book detail screen at all** — confirmed by grep and by
reading the navigation graph; see §2's own note below and §6.

| Content / control | Web today | Android today |
| --- | --- | --- |
| Route | `/item/$itemId` (`router/routeTree.ts:60-65`) | **none** |
| Cover art | `CoverImage`, 200px, `book_2` fallback icon (`ItemPage.tsx:63-76`) | shown only on the shelf card (120dp), never on a detail surface |
| Title | `<h1>{item.media.title}</h1>` (`:78`) | shelf card title only, 1 line, truncated (`HomeShelvesContent.kt:83-91`) |
| Subtitle | shown if present (`:79`) | not shown anywhere |
| Author(s) | comma-joined names, plain text, **not a link** (`:80-82`) | not shown anywhere |
| Narrator | "Narrated by X" if present (`:83`) | not shown anywhere |
| Series | **not shown** | not shown |
| Genres | **not shown** | not shown |
| Published year | **not shown** | not shown |
| ISBN / ASIN | **not shown** | not shown |
| Duration | **not shown as text** (only implied by the progress bar) | not shown |
| Chapter count | **not shown** | not shown |
| Description | `RichDescription`, full text, no clamp (`:105-109`) | not shown anywhere |
| Progress | `LinearProgress` bar if `item.progress` exists (`:99-103`) | not shown (only a per-shelf-card download-state label, `HomeShelvesContent.kt:91-99`) |
| Chapter list | **not present on this page** — exists only inside Now Playing, `ChapterList.tsx`, gated on an active playback session | not present anywhere |
| Play / Resume | `Button`, label toggles on `item.progress` (`:84-90`) | tapping the shelf card **plays immediately** — `BooksScreen.kt:103`, `ForYouScreen.kt:72` — there is no intermediate stop |
| Play error | inline `role="alert"` message (`:91-95`) | none — errors surface as a `PlayerUiState.Error` snackbar at the shell level |
| Download / offline | **not present** — see §7, web has no offline-download feature at all | exists, but only as a per-shelf-card action (`BooksScreen.kt:104`, `startDownloadWithPermissionPrompt`), never on a detail surface because there is no detail surface |
| Loading state | `<p>Loading…</p>` (`:26-30`) | N/A |
| Error state | throws to `RouteErrorBoundary` (`:38`) | N/A |

**Note on the "Android today" column.** Every row reading "not shown anywhere" or "N/A" reflects
one underlying fact: **Android has no book detail screen.** `Routes` in `AuralisNavHost.kt` has no
book/item detail entry at all (compare `PODCAST_DETAIL_PATTERN`, `MUSIC_ALBUM_DETAIL_PATTERN`,
`MUSIC_ARTIST_DETAIL_PATTERN` — a book has no equivalent). The only Android call site for
`ApiClient.getItem` is Android Auto's browse tree (`ApiClient.kt:192-204`, "used by Android Auto's
browse tree (a later wave)"), not a screen. Tapping a book, on every Android surface that lists one
(`BooksScreen`, `ForYouScreen`, presumably search — not checked further, out of scope for this
screen), calls `playerViewModel.playItem(item.id)` directly.

**This is accidental gap, not deliberate idiom.** Podcasts got their own detail screen
(`PodcastDetailScreen.kt`) and albums got theirs (`AlbumDetailScreen.kt`, `ArtistDetailScreen.kt`)
on Android — the pattern exists elsewhere in the same codebase for the exact same reason (a
container needs a page to show what it contains and let the user choose where to start). Books
alone skip it. Nothing in `HANDOVER.md` or `ROADMAP.md` frames this as intentional; it reads as
"never built" rather than "decided against." **A doc claiming parity is not evidence of parity** —
there is no doc claiming parity here, which is itself the finding: this gap was never even written
down.

---

## 3. The Sonora treatment

**Authority: `docs/design/sonora/Auralis-Redesign.dc.html`** (the real deliverable — `SONORA.md`
and `github.md` are prose *about* it and have been wrong before; this section was written by reading
the `.dc.html` source directly, not the prose). The book screen's content is built at line 701-705:

```js
book: [
  { isHeader: true, kindLabel: 'Audiobook', playLabel: 'Resume', secondLabel: 'Download',
    headTitle: 'The Fellowship of the Ring', headArtist: 'J. R. R. Tolkien',
    onArtist: () => this.go('author'),
    meta: 'Narrated by Rob Inglis · 19 h 07 m · 24 chapters · 38% listened' },
  { isNote: true, note: 'One Ring to rule them all. …' },
  { hasHeading: true, title: 'Chapters', isTracks: true, items: trackItems(…, { activeIndex: 1 }) },
]
```

### Structure

Three stacked blocks, top to bottom, inside the standard docked-content scroll area (`16d` already
fixed the shell so only this area scrolls, not the whole document):

1. **`MediaHeader`** (`docs/design/sonora/components/MediaHeader.dc.html`, read in full) —
   - A fixed square art tile, 232px desktop / 208px mobile, `var(--radius-lg)` corners (**not**
     round — `round` defaults false and the book screen never sets it true; `round: true` is for
     artist avatars).
   - `kindLabel` — small caps, muted: **"Audiobook"**.
   - `title` — the book title, `var(--font-display)`, weight 900, `--h2-size` desktop / `--h4-size`
     mobile.
   - `subtitle` — **the author name**, clickable (`onSubtitle` → author page), rendered in
     `var(--accent-ink)` when clickable, `var(--text-lg)` desktop / `var(--text-md)` mobile.
   - `meta` — one muted line composed as `Narrated by {narrator} · {duration} · {n} chapters ·
     {progress}% listened`. See §5 for exactly what to omit when a field is absent.
   - Two buttons: primary **`{playLabel}`** ("Resume" if in progress, "Play" otherwise — matches
     web's existing logic, `ItemPage.tsx:89`) and secondary **"Download"**.
   - **Colour trap, already in `docs/design/sonora/primitives/README.md`'s substitution table**:
     `MediaHeader.dc.html`'s mobile-platform branch (`:31-32`) reads `--m3-on-background` /
     `--m3-on-surface-variant` for its two text colours. In this app those must become
     `var(--surface-fg)` / `var(--surface-fg-muted)` respectively — the desktop branch already uses
     the right names (`--surface-fg` / `--surface-fg-muted`) directly. Do not copy the mobile
     branch's `--m3-*` names verbatim.
2. **A note paragraph** — the book's description, plain text, `max-width: 70ch`,
   `var(--surface-fg-muted)`, `var(--text-md)`, `line-height: 1.6`, no clamp. This is a direct
   restyle of what `RichDescription` already renders; no content change.
3. **"Chapters"** — a `SectionHeader` (title only, no "See all" action — the whole list is already
   on-screen) followed by a track-row list. Each row: 1-based index, chapter title, no `sub`/`album`
   (both blank strings in the mock — this is a flat chapter list, not grouped), the chapter's
   formatted time, and an `active` flag on whichever chapter the user is *currently listening to in
   this book* (not "currently playing" globally — see §5). Row primitive is **`TrackRow`**, one of
   the six Sonora primitives **not yet vendored** (`docs/design/sonora/primitives/README.md`'s "six
   still to vendor" list). Its exact geometry/values are not in this repo; the `-W`/`-A` waves must
   either vendor it from the design tool first or build from the composed shape above (index, title,
   time, active-state) using existing primitives (`ListItem` already renders headline +
   supportingText + `selected`/`aria-current`, which is what `ChapterList.tsx` already uses for the
   Now-Playing chapter list — a reasonable fallback shape if `TrackRow` isn't vendored first).

### What the design does not cover — named, not invented

- **Series, genres, published year, ISBN/ASIN are not in the composed `meta` string and appear
  nowhere else in the `book` block.** The design is silent on them. Since neither platform shows
  them today either, **this is not a regression** — leave them out. If this changes later it is a
  design question for Sofia, not a call this wave should make.
- **No back-navigation affordance is in the `book` block's markup** (compare the `shelf` screen,
  which has an explicit `{ isBack: true, backLabel: 'Browse', onBack: … }` block — `book` has
  nothing like it). The design relies on the persistent rail/bottom-nav chrome plus platform-native
  back (browser back on web, system back on Android). **Call: do not add a bespoke back button** —
  match the design's own choice and rely on existing chrome/OS back, consistent with how every other
  detail screen in this app already works (`PodcastDetailPage`, `MusicAlbumPage`, etc. — none of
  them have one either).
- **A book with no cover, no author, no narrator, no chapters is not modeled in the mock data at
  all** (`CHAPTERS` always has 5 entries, `headArtist` is always populated). §5 states the fallback
  contract; it is this document's own call, not a transcription from the design.
- **The secondary "Download" button assumes offline download exists.** It does on Android
  (`DownloadRepository`, wired today from the shelf card) and **does not exist on web at all** — no
  PWA offline-audio-caching feature exists anywhere in `apps/web` (confirmed by grep: no
  `Downloads`/`offline` feature directory, unlike Android's real one). This is `DESIGN.md`'s own
  decision ("Native Android … Background playback, offline downloads … all want the real thing") —
  **deliberate platform idiom, not a gap to close in this wave.** §6 states the call for each
  platform.
- **`kindLabel: 'Audiobook'` is a static string in the mock.** Nothing else needs it to vary — this
  screen only ever shows books (podcasts are `PodcastDetailPage`'s screen).

---

## 4. What the BFF serves vs. what each client uses

**Route:** `GET /items/:id?expanded=true&include=progress` (`apps/server/src/routes/items.ts:10-25`,
read in full). This is the **only** route this screen needs — no new endpoint, no new field.

The response is `{ item: Book-shaped-thing }`, and because `expanded=true` is passed, the upstream
Audiobookshelf response carries the *structured* `metadata.authors[]`/`metadata.series[]` arrays,
not just the flattened `authorName`/`seriesName` strings — see
`packages/abs-client/src/normalize.ts:92-105`. **This matters for the minified-item bug this project
has hit three times** (`HANDOVER.md`, "The minified-item bug"): that bug is about *list/shelf*
endpoints, which only ever get the minified summary. `GET /items/:id?expanded=true` is not one of
those — it genuinely receives the structured arrays, so **`authors[].id` and `series[].id` are real,
matchable ids on this endpoint**, not the name-echoed-as-id fallback that bit `findAuthorBooks` and
the old `SeriesPage`. State this explicitly because it is exactly the kind of trap this project has
paid for twice already, and getting it backwards here (treating a real id as fake, or vice versa)
would either silently disable a working feature or reopen a fixed bug.

**What each client's *own* type currently allows through:**

- **Web's hand-mirrored `MediaSummary`/`AuthorBadge`** (`apps/web/src/api/types.ts:68-70, 134-156`)
  **deliberately strips `id` off `authors[]`** — the type comment explains why (the two historical
  bugs) and is correct for every *other* consumer of `AuthorBadge` in this codebase, all of which
  read shelf/list data. **It is wrong for this one screen**, which is the one place in the app that
  legitimately has a real author id and needs it (to link to `/author/:id`, an existing route —
  `router/routeTree.ts:93-98`, reached today from search and from `AuthorPage.tsx`/`SeriesPage.tsx`
  book grids, never from item detail). **Call, made here so the `-W` wave doesn't have to re-derive
  it:** do not widen the shared `AuthorBadge` type app-wide (that would reopen the trap everywhere
  else). Instead, this screen's own data-fetching code should type its `authors`/`series` fields
  locally (a screen-scoped type, e.g. `ItemDetailAuthorRef { id: string; name: string }`) fed from
  the same `GET /items/:id` response, distinct from the shared `LibraryItem`/`AuthorBadge` shape
  used by shelves and lists. Web already does something structurally similar elsewhere
  (`packages/abs-client`'s own `AuthorRef` vs. `AuthorBadge` split) — this is the same pattern
  applied at the `apps/web` layer.
- **Android's `MediaSummary`** (`data/model/ApiModels.kt:158-179`) already types `authors:
  List<AuthorRef>?` and `series: List<SeriesSequence>?` **with non-nullable `id` fields on both** —
  it was built expecting a real id and never got a screen to use it on. No type change needed on
  Android; the seam already exists (`AuthorRef`, `SeriesSequence` at `:104-108, 130-138`). The
  caveat above (fabricated id on *other*, minified-sourced responses) still applies to those same
  Kotlin types when *other* screens populate them from shelf data — the id is only trustworthy when
  the response came from `GET /items/:id?expanded=true`.
- **`chapters`** is typed and already flows through both clients' shared types (`Chapter` on both
  sides), just never rendered on a detail screen on either platform. No BFF or type change needed —
  this is purely a "wire it up" wave for chapters, on both platforms.
- **Author/series linking is web-only, and this is a real, out-of-scope-to-fix gap.** `/author/:id`
  and `/series/:id` exist on web (`AuthorPage.tsx`, `SeriesPage.tsx`). **Android has neither route**
  (confirmed: no `AUTHOR`/`SERIES` entries anywhere in `Routes` in `AuralisNavHost.kt`), and
  building them is not in `ROADMAP.md` §16's `16e` screen list (`For You/browse, Music/Album, Book
  detail, Podcasts, Search, Now Playing/Queue/Mini player, Settings/Onboarding` — no Author/Series
  entry). **Call:** on Android, render the author name as **plain, non-interactive text** for this
  wave. Do not build an Android author screen to make it tappable — that is bigger than this
  screen and belongs to its own wave if it's wanted at all.

---

## 5. Behaviour contract — both platforms must satisfy this

**Precondition:** this screen renders for `item.media.kind === 'book'` only. A podcast reaching this
component is a routing bug elsewhere, not this screen's problem (mirrors web's existing split at
`routeTree.ts:67-71`'s comment).

**Loading.** Show a loading state while the item fetch is in flight. No skeleton is specified by
the design for this screen; a platform-idiomatic spinner/placeholder is fine. Do not render the
Play button (or make it tappable) before the item has loaded — there is nothing to play yet.

**Error (fetch failed).** Hand off to the platform's existing top-level error surface rather than
inventing a bespoke one — web already does this (`itemQuery.isError` throws to
`RouteErrorBoundary`, `ItemPage.tsx:38`); Android should use whatever its equivalent top-level error
handling is for a failed detail fetch (there is no existing Android precedent for a book-detail
error specifically, since the screen doesn't exist yet — follow the pattern `PodcastDetailScreen`
or `AlbumDetailScreen` already use for their own fetch failures).

**Play error (starting playback failed, after the item loaded fine).** This is different from the
fetch error above — the item is showing, the button was tapped, and `POST /items/:id/play` failed.
Web already has this exact case (`ItemPage.tsx:43-58`, `playError` state, inline `role="alert"`
message, network-vs-other-error message split). Keep the same two-message split: a "couldn't reach
the server" message for a network failure, the server's own message otherwise. Do not throw to the
top-level error boundary for this one — the rest of the page (cover, chapters, description) is
still valid and should stay visible; only the play action failed.

**Empty / missing fields — the fallback contract (this document's own call, not drawn from the
design):**

| Field | If absent |
| --- | --- |
| Cover | tonal placeholder, same pattern as `CoverImage`'s existing `fallbackIcon="book_2"` |
| Subtitle | omit the line entirely (web already does this — `:79`) |
| Author(s) | omit the subtitle-link row entirely; do not render an empty clickable region |
| Narrator | omit `Narrated by …` from the composed meta string |
| Description | render nothing (matches `RichDescription`'s existing null-degrade) |
| Chapters | omit the whole "Chapters" section — no heading, no empty list, no "no chapters" message. A single-file audiobook (no chapter markers) is a normal, common case, not an error state. |
| Progress | button reads "Play", not "Resume"; no progress figure in the meta line |
| Duration | omit that segment of the meta line (do not show `· ·` — join only the parts that exist) |

**Meta-line joining rule, stated once so both platforms build it the same way:** compose the meta
string from whichever of `narrator`/`duration`/`chapterCount`/`progressPercent` are present, joined
with ` · `, in that order, with no separator artifacts when a field is missing. This is a small
pure function worth writing once per platform and testing directly (empty item, item with only a
title, item with everything) rather than four ad hoc conditionals.

**Play / Resume.** Tapping the primary button starts playback exactly as web's existing
`handlePlay` does today (`ItemPage.tsx:43-58`): call the play-session endpoint, load the result into
the shared player, start playback. Label is "Resume" iff `item.progress` is non-null — **do not**
add new logic for `isFinished`; this matches existing behaviour on web today (a finished book still
reads "Resume"), and the design doesn't address the finished case either, so this wave should not
invent new state for it.

**Chapter tap.** Two cases, and both platforms must handle both:

1. **This book is not the currently-loaded player item.** Tapping a chapter starts playback of this
   book (same as the Play button) and then seeks to that chapter's `start` time. There is no
   existing precedent for this exact sequence on either platform — `ChapterList.tsx` (Now Playing)
   only ever operates on an *already-loaded* session. This is new behaviour for both `-W` and `-A`.
2. **This book is already the currently-loaded player item** (the user navigated back to a book
   they're mid-listen to, from wherever). Tapping a chapter seeks within the existing session —
   this is the same as `ChapterList.tsx`'s existing `onClick={() => seek(chapter.start)}`
   (`ChapterList.tsx:63`).

**Active-chapter highlighting** only applies in case 2 above (there is no "currently playing"
position in a book that isn't loaded). Do not highlight a chapter based on stored progress alone —
progress is a point-in-time position, not necessarily aligned to a chapter boundary the UI should
visually claim as "active" outside of live playback. If this book is not loaded, no chapter is
marked active.

**Download.** Android: wire the existing `DownloadRepository`/download-state machinery
(`BooksScreen.kt` already has the pattern — `startDownloadWithPermissionPrompt`,
`downloadActionLabel`) to this screen's secondary button, matching the shelf-card behaviour that
already exists rather than building a second one. Web: **omit the secondary button entirely** — no
offline-download feature exists to wire it to, and building one is out of scope for a screen-rebuild
wave (it would be its own phase-16-scale feature). This is a deliberate visible asymmetry between
platforms, consistent with `DESIGN.md`'s existing "native Android … offline downloads" decision —
name it in the `-P` review as idiom, not drift.

**Author tap.** Web: navigate to `/author/$authorId` using the real id from this endpoint's
`authors[]` (see §4's typing note). Android: render as plain text, no navigation (see §4).

---

## 6. Accessibility requirements (behaviour, not markup)

- **The cover image is decorative** — it duplicates the title text right next to it. Both platforms
  should mark it non-semantic to a screen reader (empty `alt`/`contentDescription`), matching
  `ItemPage.tsx`'s existing `alt=""` on `CoverImage` (`:65`).
- **Play/Resume state must be announced as what it does, not just its icon** — the existing text
  label already satisfies this on web (`Button` renders its own accessible name from children); the
  Android build must give its equivalent control a real accessible name ("Play", "Resume"), not an
  icon-only button with no label.
- **The progress figure, if shown, must be announced as a value, not just visually implied** — web's
  `LinearProgress` already carries `aria-label="Listening progress"` (`ItemPage.tsx:101`); Android's
  equivalent needs a `contentDescription` conveying the same thing (percentage or "X of Y hours").
- **Each chapter row must announce, at minimum: its title, its position/duration, and whether it is
  the currently-active chapter** — mirroring `ListItem`'s existing `selected` → `aria-current`
  behaviour that `ChapterList.tsx` already relies on (`ChapterList.tsx:5-6`). On Android, the
  active-chapter state must be exposed as a semantic property (e.g. `Role.RadioButton`'s selected
  state or an explicit "current chapter" phrase in the content description), not conveyed by colour
  alone.
- **The play error message must be announced when it appears**, not just visually shown — web
  already does this (`role="alert"`, `ItemPage.tsx:92`); Android's equivalent needs a live-region or
  snackbar-with-accessibility-announcement, matching the pattern `HomeScreen`'s existing
  `PlayerUiState.Error` → snackbar already uses.
- **Do not merge the whole header into one opaque semantic node.** Title, author (if clickable),
  narrator/duration meta, and the two buttons are five separately-meaningful, separately-actionable
  pieces — collapsing them into one announcement (the trap `13d`'s carousel-reason gap already
  documents on Android) would make the author link unreachable by a screen-reader user stepping
  through elements one at a time.

---

## 7. Explicitly out of scope

Stated so the `-W` and `-A` waves don't drift by each guessing differently:

- **No Android Author or Series screen.** The author name is plain text on Android for this wave
  (§4, §5). Do not build the navigation target as a "while I'm here" addition.
- **No web offline-download feature.** The secondary button doesn't exist on web for this wave (§5).
  Do not build a PWA offline-caching mechanism to fill it in.
- **No series/genre/published-year/ISBN display**, on either platform — the design doesn't show
  them and neither does today's app (§3).
- **No changes to the Books *library* screen** (`BooksPage.tsx` on web, `BooksScreen.kt` on
  Android) — that is a separate screen in `ROADMAP.md` §16's list ("For You/browse"), not this one.
  Note in passing, since it's directly relevant to how a user reaches this screen on Android:
  Android's `BooksScreen` today is not actually a browsable library grid at all — its own doc
  comment says it renders "the exact same `HomeShelvesContent` body" as Home, because "there is no
  book-specific data source or ViewModel yet." Fixing that is that other screen's problem.
- **No chapter enqueue actions ("Play next"/"Play last") on the detail screen's chapter list.**
  `ChapterList.tsx` (Now Playing) has these; this document does not require them here. If either
  wave wants to add them for consistency, that is a reasonable judgement call, not a requirement —
  don't block the wave on it, and don't let its absence here be read as a defect.
- **No visual-regression / screenshot testing** — `ROADMAP.md` §16 already names this gap
  project-wide; this screen doesn't need to be the one that closes it.
- **No change to `GET /items/:id`'s response shape.** Everything this screen needs is already
  served (§4). If a wave finds itself wanting a new BFF field, that's a sign the spec missed
  something and should come back to this document, not a signal to just add one.

---

## 8. Two constraints both implementing waves inherit

- **Only one `-W` wave can run Playwright at a time on this machine.** Both `webServer` entries in
  `playwright.config.ts` boot regardless of which `--project` is requested, and the app server is
  `reuseExistingServer: false` on a fixed port — two agents running Playwright concurrently contend
  for it, worst case silently sharing one stateful single-tenant BFF. `-A` halves parallelise
  freely; spec authoring for other screens parallelises freely.
- **Nothing on this machine compiles Kotlin.** The `-A` wave's first real signal is Android CI.
  Budget the usual two-to-three red rounds. Two compiler-free pre-checks measurably reduce them and
  cost nothing to run before pushing: balanced `/*`/`*/` counts per changed `.kt` file (Kotlin
  nests block comments; an unbalanced count means one swallowed the rest of the file), and no `.`
  inside a backtick test name (Kotlin permits it as a quoted identifier, the JVM does not as a
  method name).
