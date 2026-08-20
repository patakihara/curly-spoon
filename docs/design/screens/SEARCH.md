# Global search — shared behaviour spec (wave 16e-search)

Status: **spec only, nothing implemented against it yet.** This is the shared spec both
`16e-search-W` (web) and `16e-search-A` (Android) build from, independently, followed by a
`16e-search-P` parity review by an agent that wrote neither half. Per `ROADMAP.md` §16, this is
the fourth 16e screen (after book detail, podcast detail, album detail). Unlike those three this
is not a detail-header screen — it is a filtered, multi-source result list — so §3's geometry
table covers a search field, filter chips, and a result row rather than `MediaHeader`.

This document describes **behaviour and structure**, not a React tree or a Compose tree. Every
geometry/type value is in an explicit per-platform table (§3), not buried in prose, per the
correction `16e-book-P` recorded and every triple since has confirmed: two agents that never see
each other's work converge exactly on a literal example string or a table row, and drift wherever
a value is left to prose. This document uses literal example strings throughout for that reason.

**The headline finding, ahead of everything else: the hard part of "search needs suggestions"
is already built and unused.** `packages/ui/src/components/SearchField.tsx` has a complete,
tested, ARIA-combobox suggestion mechanism — typed `suggestions: SearchSuggestion[]`, keyboard
nav (arrow keys move `aria-activedescendant`, Enter selects), a floating listbox, all covered by
`e2e/ui/search-field.spec.ts`. **Nothing in the app passes it a `suggestions` prop.** Grepped
across `apps/web/src`: zero call sites. That is this project's most-repeated failure shape — a
writer with no reader — except here the writer is a _primitive's own prop_, not a route. `-W`'s
job on this half is almost entirely wiring, not building. Android has no equivalent primitive at
all and must build one from scratch (§10).

---

## 1. What the screen is for

Reached from the shell's "Search" destination on both platforms — the rail's dedicated slot on
web (icon-only below 1024px, `apps/web/src/components/destinations.ts`), a bottom-bar/rail tab on
Android (`ShellDestination`, `Routes.MUSIC_SEARCH`). One field over every connected upstream —
Audiobookshelf's books/series/authors/podcasts, and Jellyfin's artists/albums/tracks once
configured — fanned out from one typed query. Its job, per `docs/DESIGN.md`'s reference-app table
(_"Spotify — search that goes deep, one field, typed results, and lyrics search as a first-class
mode"_) and `docs/USER_DECISIONS.md` §3:

1. **Return results from everything the user has connected**, grouped by kind, with each kind
   only shown if the current filter selection includes it.
2. **Offer typed suggestions as the user types** — the new requirement this wave exists to close.
   Her words: _"global search needs search suggestions."_ (§6.2)
3. **Surface requestable results for what isn't owned** — already shipped (12b-A2/12c-1), unchanged
   by this wave, described in §6.3 for completeness only.
4. **Narrow by content type and, one level deeper, by kind within that type** — already shipped,
   unchanged by this wave (§2).

It is not the browse/library page (`/library/:id`, its own filter+sort surface, already covered
by `e2e/app/browse.spec.ts` and out of scope here) and not either request-search panel
(`AskForBookPanel.tsx`, `MusicRequestSearchPanel.tsx` — separate screens with their own field,
untouched by this wave). **Lyrics search — searching the catalogue by lyric content, not looking
up one already-known track's lyrics — is explicitly out of scope.** §7 says why.

---

## 2. Content inventory — what each platform shows today

**Evidence.** Web: `apps/web/src/features/search/SearchPage.tsx` (425 lines, read in full),
`searchFilters.ts`, `searchStatus.ts`, `searchRequestability.ts` (all read in full),
`packages/ui/src/components/SearchField.tsx` (181 lines, read in full),
`packages/ui/src/components/ListItem.tsx`/`.css` (read in full). Android:
`apps/android/.../features/search/UnifiedSearchScreen.kt` (555 lines) and
`UnifiedSearchViewModel.kt` (680 lines), both read for their relevant sections, plus the shared
`MusicRow` composable in `MusicLibraryScreen.kt:336-374` (read in full).

| Content / control                  | Web today                                                                                                                                     | Android today                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field                              | `SearchField` (Mantine `Combobox` + `TextInput`), radius `xl`, `role="combobox"` — **pre-Sonora `--m3-*` primitive**, no `suggestions` passed | `OutlinedTextField`, Material 3 default styling, no combobox/dropdown at all                                                                              |
| Filter chips (primary)             | `Chip variant="filter"` — **migrated to Sonora tokens** since 16c-1-W                                                                         | `FilterChip` (Material 3 default), no Sonora token wiring                                                                                                 |
| Filter chips (secondary)           | Same `Chip`, second row, conditional on primary selection                                                                                     | Same `FilterChip`, second row, conditional on primary selection                                                                                           |
| Status announcement                | `<p aria-live="polite" data-testid="search-status">`, one of 5 computed strings (`searchStatus.ts`)                                           | **No equivalent anywhere.** Grepped `UnifiedSearchScreen.kt` for `semantics`/`liveRegion`/`contentDescription`: zero hits                                 |
| Result rows: cover art             | **None.** `ListItem` never receives a `leading` prop on this screen — text-only rows                                                          | 56dp square `AsyncImage`, **no fallback painter, no corner radius** (`MusicRow`, `MusicLibraryScreen.kt:361-366`)                                         |
| Result rows: books                 | `ListItem`, clickable → `/item/:id`                                                                                                           | `MusicRow`, **`onClick = null`** — comment says no book-detail route exists; **one exists** (`Routes.bookDetail`, confirmed by grep, added by 16e-book-A) |
| Result rows: series                | `ListItem`, clickable → `/series/:id`                                                                                                         | Plain `Text`, no click at all — **no Android series-detail route exists anywhere in the app** (confirmed absent from `AuralisNavHost.kt`)                 |
| Result rows: authors               | `ListItem`, clickable → `/author/:id`                                                                                                         | Plain `Text`, no click — same reason as series                                                                                                            |
| Result rows: podcasts              | `ListItem`, clickable → `/item/:id`                                                                                                           | `MusicRow`, clickable → `Routes.podcastDetail`                                                                                                            |
| Result rows: artists/albums/tracks | `ListItem`, clickable (track routes to its album; no-`albumId` track renders inert)                                                           | `MusicRow`, clickable (same track/album redirect rule)                                                                                                    |
| Suggestions                        | **Primitive supports it (`SearchField`'s `suggestions`/`onSuggestionSelect`), nothing wires it**                                              | **No mechanism at all** — no dropdown, no typeahead                                                                                                       |
| Requestable books/music sections   | `RequestableBooksSection`/`RequestableMusicSection`, gated on chip visibility + provider availability                                         | `requestableBooksSection`/`requestableMusicSection`, same two-way gate                                                                                    |
| Config-gated states                | `absConfigured`/`jellyfinConfigured` both tracked and drive `searchStatus`'s wording                                                          | `musicUnconfigured` tracked; **no ABS/library-unconfigured equivalent field exists** in `UnifiedSearchResultsUiState`                                     |

---

## 3. The Sonora treatment

**Neither primitive this screen needs has a vendored Sonora source, and `SONORA.md` says so
itself rather than leaving it to be discovered.** §5 of that file: `SearchField` — _"No named
Sonora equivalent — closest primitive is `Input`, which has no search-specific affordances (no
suggestions prop)"_; `ListItem` — _"No named Sonora equivalent — closest in spirit is `TrackRow`
or the Auralis-specific `ResultRow` (§3.8), neither is a drop-in."_ `Input` itself is one of the
six primitives never vendored as source (`docs/design/sonora/primitives/README.md` — vendored:
`Button`, `IconButton`, `Chip`, `Card`, `Slider`; still to vendor: `Input`, `SectionHeader`,
`QuickTile`, `SidebarItem`, `BottomNav`, `TrackRow`, `MiniPlayer`). **So this table draws its
numbers from three places only: `SONORA.md`'s already-published token scales (§1.9/§1.10), its
`ResultRow` component card (§3.8, one of the nine Auralis-specific cards that _is_ fully
described), and this app's own existing values where Sonora is silent — every source is named per
row, and nothing below is invented.**

`ResultRow` (`SONORA.md` §3.8) is the closest match for a search result row and is the reference
for the art tile: _"Art: 52px square, radius 8px mobile / 6px desktop (both hardcoded literals,
not tokens)."_ It also carries a `tone`/`status` pill (`library`/`request`/`progress`/`error`
mapped to the five §2 app-level `--tone-*` tokens) for exactly 12c-2's owned/requestable
labelling — **not required by this wave**, since neither client currently draws a status pill on
a search row and adding one is a separate, larger change to `ResultRow`/`ListItem`'s whole API.
Named as future work in §7, not built here.

### Geometry / type table — search field, filter chips, result row

| Token                             | Web                                                                                                                 | Android                                                                                                                                          | Source                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Field corner radius               | `radius="xl"` (Mantine's own scale — **not** `--radius-*`, unchanged by this wave)                                  | No change specified — Material 3 `OutlinedTextField` default                                                                                     | Existing code (`SearchField.tsx:120`); Sonora's own `Input` gives no radius value               |
| Field leading icon                | `Icon name="search"`, `--icon-sm` (24px)                                                                            | `Icons.Filled.Search` or equivalent, 24dp — read 1:1 against the CSS px value, same convention `16d-P` accepted for the 600dp breakpoint         | `SONORA.md` §1.9 `--icon-sm`                                                                    |
| Filter chip (primary + secondary) | `Chip variant="filter"` — already Sonora-correct, no change                                                         | `FilterChip` — **not yet migrated**; bringing it onto Sonora's `Chip` values is `16c-1-A`'s scope, not this wave's. Leave as Material 3 default. | Out of scope — do not touch Android's `FilterChip` styling in this wave                         |
| Result row art size               | **52px square** (new — currently no art at all)                                                                     | **52dp square** (down from the current 56dp)                                                                                                     | `SONORA.md` §3.8 `ResultRow`                                                                    |
| Result row art radius             | **6px** (desktop is the only web form factor for this purpose — treat web as "desktop" per `ResultRow`'s own split) | **8dp** (Android is always the "mobile" case)                                                                                                    | `SONORA.md` §3.8 `ResultRow` — literal, not a `--radius-*` token                                |
| Result row vertical padding       | Unchanged — `ListItem`'s existing `8px 16px` (`--m3-*`-sourced, this wave does not migrate `ListItem` off `--m3-*`) | Unchanged — `MusicRow`'s existing `8.dp` vertical padding                                                                                        | Existing code; `ListItem` migration is tracked separately (§16c's remaining `--m3-*` consumers) |
| Suggestion dropdown item padding  | Combobox default (Mantine), unchanged                                                                               | `DropdownMenuItem`/`ExposedDropdownMenuBox` default, unchanged                                                                                   | Not specified by Sonora; use the platform default rather than inventing a value                 |
| Suggestion cap                    | **8** total, across all kinds combined                                                                              | **8** total, across all kinds combined                                                                                                           | This spec (§6.2) — no Sonora source, a product decision made once here                          |

**Do not migrate `SearchField`, `ListItem`, `FilterChip`, or Android's search rows fully onto
Sonora's neutral `--surface-*`/`--accent` substrate in this wave.** `ListItem` and `SearchField`
are both still-`--m3-*` primitives (`docs/HANDOVER.md`'s 16c-5-W section names both as remaining
consumers), and re-tokenizing them is a `packages/ui`-wide change that touches every other screen
using `ListItem`/`SearchField` — out of this triple's scope by the same reasoning `16c-2-W-3`
used for `Card`. **The only visual changes this wave makes are: adding cover art to web's search
rows, resizing/rounding/adding-a-fallback-painter to Android's, and building the suggestion
dropdown on both.** Everything else about these rows' current colour/type styling is untouched.

**Compose has no CSS-cascade fallback — name the placeholder/error painter for every image, not
just the happy path.** `16e-book-A-2`'s finding, restated because Android's search rows are the
next place it applies: `AsyncImage` in `MusicRow` (`MusicLibraryScreen.kt:361-366`) has **no
`placeholder`/`error` parameter at all** today. Coil paints nothing on a null/loading/failed
model, so every row with no cover currently renders a blank 56dp square. Fixing the size/radius
without adding a fallback painter (reuse the same convention `ItemPage`/`PodcastDetailPage`
already establish — a muted icon tile, per kind) leaves the same class of defect, just smaller.

---

## 4. What the BFF serves vs. what each client uses

**No BFF change is needed for anything in this wave, suggestions included.** Both existing
routes already return everything both the results list and the suggestion dropdown need:

- **`GET /libraries/:id/search?q=…&limit=…`** (`apps/server/src/routes/libraries.ts:380`) —
  Audiobookshelf's `books`/`podcasts`/`series`/`authors`, via `AbsClient.searchLibrary`
  (`packages/abs-client/src/client.ts:341`). Web calls this through
  `useLibrarySearchQuery`; Android through `fetchLibraryResults`
  (`UnifiedSearchViewModel.kt:588`).
- **`GET /jellyfin/search?term=…&limit=…`** (`apps/server/src/routes/jellyfin.ts:502`) —
  `artists`/`albums`/`tracks`, gated on Jellyfin being configured on both clients already. Web:
  `useJellyfinSearchQuery`. Android: `fetchMusicResults` (`UnifiedSearchViewModel.kt:642`).

**Suggestions are derived client-side from these same two responses, not fetched separately.**
Both are already fired on every query change with no extra debounce (only the _requestable_
sections are separately debounced, §6.3) — reusing them means the suggestion list updates on
exactly the cadence the results list already does, with zero new network traffic and zero new
route. §6.2 has the derivation rule.

---

## 5. Fallback contract — what to omit or paint when a field is absent

- **No cover art anywhere (web today; both platforms after this wave when a cover fails/is
  absent):** a muted icon tile per kind, reusing the fallback-icon convention already
  established by `CoverImage`/`MediaHeader` — `menu_book` for books, `podcasts` for podcast
  shows, `music_note` for artists/albums/tracks. Series and author rows carry no art on either
  platform today and this wave does not add any — they are text-only rows, unchanged.
- **A track result with no `albumId`** renders inert on both platforms already (no navigation
  target) — unchanged, and excluded from suggestions for the same reason (§6.2).
- **Jellyfin unconfigured:** web already hides the Music section outright and zeroes its counts
  before they reach `searchStatus`; Android already has `musicUnconfigured` for the equivalent.
  Unchanged.
- **Audiobookshelf unconfigured:** web has `absConfigured` and a dedicated status string (§6.4).
  Android has no equivalent field today — §10 specifies adding one, following the exact shape
  `musicUnconfigured` already establishes, not inventing a new pattern.
- **A suggestion whose target kind has no detail route on the platform showing it** (series/
  authors on Android) is never offered as a suggestion at all, on that platform, rather than
  rendered as a non-interactive suggestion entry — a suggestion exists to be selected; an inert
  suggestion is a worse version of the inert-row problem this table already documents for the
  full list.

---

## 6. Behaviour contract — both platforms must satisfy this

### 6.1 Filters — unchanged, restated for completeness only

Already shipped identically on both platforms (`searchFilters.ts` / `SearchFilters.kt`, confirmed
present and read on both sides). Two chip rows: primary (All/Music/Books/Podcasts, single-select,
re-tapping the active chip clears to "all"), secondary (depends on primary: Music →
Songs/Albums/Artists, Books → Books/Series/Authors, Podcasts → none). Selecting a new primary
resets the secondary. **This wave makes no change here.** Any drift found between the two
`searchFilters`/`SearchFilters` implementations during recon is a pre-existing-parity question,
not this wave's to fix — flag it to `-P` rather than silently reconciling it.

### 6.2 Suggestions — the new requirement, specified in full

**Source.** Suggestions are built from the same `books`/`series`/`authors`/`podcasts` (from
`GET /libraries/:id/search`) and `artists`/`albums`/`tracks` (from `GET /jellyfin/search`)
results already being fetched for the results list — no new query, no new endpoint, no separate
debounce. They update on exactly the same cadence the results list already does.

**Ordering and cap.** Concatenate in the same fixed kind order the results list itself already
renders in — Books, Series, Authors, Podcasts, Artists, Albums, Tracks (Android's own doc comment
already states this order; web's JSX renders sections in the same order) — taking items in the
order each source returns them, until **8 total** are collected across all kinds combined, then
stop. Kinds with a detail route on the current platform contribute; kinds without one on that
platform are skipped entirely when building the list (not skipped-but-counted) — so a platform
missing a kind's route still gets up to 8 suggestions from the kinds it does have, not fewer than
8 because slots were reserved for an excluded kind.

**Excluded from consideration entirely, on both platforms:**

- A track result with no `albumId` — same "nowhere to go" rule as the full list (§5).
- Anything sourced from the requestable-books/requestable-music sections (§6.3) — those settle
  on their own, slower, debounced cadence; mixing them in would make the suggestion list reorder
  or grow _after_ the user has already stopped looking at it.

**Excluded on Android only, until an Android series/author detail page exists (out of scope for
this wave, §7):** series and authors. This is the one **deliberately unequal** point in this
section — web's suggestion list can include all seven kinds; Android's can include five (no
series, no authors). Label this drift-vs-idiom split explicitly for `-P`: it is **idiom**, forced
by a route that genuinely does not exist yet on Android, not an oversight in this wave.

**Label.** Each suggestion's visible text is `"{title} · {Kind}"` — the U+00B7 MIDDLE DOT
separator (`·`), matching the joining convention `ALBUM_DETAIL.md` already established for meta
lines (`"2021 · Synthwave · 2 tracks · 7 m"`), not a hyphen or em dash. `{Kind}` is one of:
`Book`, `Series`, `Author`, `Podcast`, `Artist`, `Album`, `Track`. Literal examples, so both
platforms converge on the identical string: `"Dune · Book"`, `"The Daily Tech Brief · Podcast"`,
`"Frank Herbert · Author"`, `"Nebula Prime · Artist"`, `"Static Bloom · Album"`.

**Selection.** Choosing a suggestion (click/tap, or Enter while it is the highlighted option on
web) does two things, both required: (1) sets the search field's text to the suggestion's plain
title (not the decorated `"· Kind"` label), so the field and the still-visible results list below
stay coherent if the user navigates back; (2) navigates immediately to that item's existing
target route — the same route its row in the full results list already uses (`/item/:id` for a
book or podcast, `/series/:id`, `/author/:id`, `/music/artist/:id`, `/music/album/:id`, or a
track's album). No new routes.

**Visibility.** The suggestion list/dropdown shows only while the field has focus, the query is
non-empty, and at least one candidate exists — mirroring `SearchField`'s existing
`hasSuggestions`/`showList` gating exactly (`SearchField.tsx:69-70`). An empty query shows no
suggestions and no dropdown — this wave does **not** build a "recent searches" or "trending"
suggestion mode for the empty-query state; that needs new persistence (`localStorage` on web, a
`KeyValueStore` entry on Android) and is a distinct, larger feature. Named here so it is not
silently dropped — a future wave, not this one.

**The desktop rail's own always-visible `SearchField` instance (`Shell.tsx:314-318`) does not get
suggestions in this wave.** It already navigates to `/search` on the very first keystroke
(`handleRailSearchChange`, `Shell.tsx:220-224`), so a dropdown there would have at most one
render cycle to be useful before the page changes underneath it. Wire suggestions only on
`SearchPage.tsx`'s own field (`data-testid="search-field"`).

### 6.3 Requestable sections — unchanged, restated for completeness only

Already shipped (`RequestableBooksSection`/`RequestableMusicSection`, `requestableBooksSection`/
`requestableMusicSection`). Gated on both the current chip selection and provider availability
(`searchRequestability.ts`/`SearchRequestability.kt`). Debounced separately from the library/
Jellyfin fan-outs (`REQUEST_SEARCH_DEBOUNCE_MS = 400` on web; Android's own
`fetchRequestableBooks`/`fetchRequestableMusic` are launched as siblings, not children, of the
main fan-out — see `UnifiedSearchViewModel.kt`'s own doc comment). **This wave makes no change
here** beyond the exclusion rule in §6.2.

### 6.4 Status announcement — literal strings, shared verbatim across platforms

Web's `searchStatus.ts` computes one of five sentences from `absConfigured`, `jellyfinConfigured`,
the trimmed query, loading flags, and per-kind counts. **These exact English strings are the
contract for both platforms** — not a translation guideline, a literal pin, because this is UI
text a user reads on both clients and divergent wording between them is the kind of thing she
would notice (unlike `shelves.ts`'s recommendation `reason` strings, which both clients
deliberately treat as unpinned prose):

1. Audiobookshelf not connected: `"Connect Audiobookshelf in Settings to search your library."`
2. Query empty (after trim): `"Start typing to search titles, authors and narrators."`
3. Either source still loading: `"Searching…"`
4. Settled, nothing matched: `"No matches for "{query}"."` (raw, untrimmed query, as typed)
5. Settled, something matched: `"{N book(s)}, {N podcast(s)} found for "{query}"."`, with
   `", {N artist(s)}, {N album(s)}, {N track(s)}"` appended **only if** at least one music count
   is non-zero — e.g. `"1 book, 0 podcasts found for "dune"."` when only books matched, or
   `"1 book, 0 podcasts, 2 artists, 0 albums, 1 track found for "static"."` once music joins.
   Singular/plural follows the count (`"1 book"`, `"0 books"`, `"2 books"`).

**Web:** unchanged — already correct, already live-region-announced. **Android must add this in
full** — there is no equivalent computation anywhere in `UnifiedSearchViewModel.kt` today. §10
specifies exactly what to add and where.

---

## 7. Explicitly out of scope

- **Lyrics search** — searching the catalogue by lyric text, Spotify's own "first-class mode"
  per `docs/DESIGN.md`'s reference table. Genuinely different from what exists: the only lyrics
  code in the tree (`GET /jellyfin/tracks/:itemId/lyrics`, `LyricsView.tsx`,
  `packages/jellyfin-client`'s lyrics schemas) looks up one **already-known, already-playing**
  track's lyrics for display — it cannot answer "which tracks contain this phrase." Full-catalogue
  lyric search needs an external provider with a search-by-lyrics API (`docs/HANDOVER.md`
  already names this as approved but unspecced: _"lyrics search — approved, get an external
  provider"_) and, separately, whatever indexing that provider requires. That is provider
  research and a new BFF surface, not a change to this screen. **Named here so it is not
  silently dropped — a distinct future wave, not folded into "suggestions."**
- **Android series/author detail pages.** No route exists (`AuralisNavHost.kt`, confirmed by
  grep); building one is its own screen wave, not a side effect of fixing search. Android's
  series/author rows and suggestions stay non-interactive/excluded until it lands (§6.2, §8).
- **`ResultRow`'s `tone`/status pill** (owned/discoverable/requestable labelling, `SONORA.md`
  §3.8). Neither `ListItem` nor `MusicRow` has a status-pill slot today; adding one is a
  `ListItem`/`MusicRow` API change with call sites well beyond this screen (browse, library,
  home shelves all use `ListItem`). Out of scope; a future `packages/ui`-wide wave, not this one.
- **Migrating `SearchField`, `ListItem`, or Android's `FilterChip`/`OutlinedTextField` fully onto
  Sonora's `--surface-*`/`--accent` substrate.** §3 already states this; repeated here because it
  is the single easiest thing to over-scope into.
- **"Recent searches" / "trending" suggestions for the empty-query state.** §6.2 names this and
  the persistence it would need. Not this wave.
- **Relevance ranking / result ordering changes.** `docs/HANDOVER.md`'s open item 3 under
  `12b` ("sorted by relevance") is blocked on a Jellyfin credential this project does not have.
  Untouched here; suggestions use whatever order the existing search responses already return.

---

## 8. Deliberately unequal

- **Suggestion coverage: web offers seven kinds, Android offers five (§6.2).** Idiom, not drift —
  forced by Android's genuinely missing series/author routes, not by this wave declining to build
  it. `-P` should confirm this is still true at merge time (i.e. that no other wave landed an
  Android series/author route in the interim) rather than re-litigate the decision.
- **The desktop rail's search field gets no suggestions; the dedicated `/search` page's field
  does (§6.2).** Web-only distinction by construction — Android has one search entry point, not
  two, so this asymmetry has no Android side to be unequal _with_.
- **Filter-chip visual styling stays unmigrated on both platforms in this wave** (§3) — this is
  symmetric (neither platform changes), not an inequality, but worth stating so `-P` does not
  read the absence of a chip restyle as a missed requirement on one side only.

---

## 9. Web: what changes

**Files:** `apps/web/src/features/search/SearchPage.tsx` (wire suggestions, add `leading` cover
art to result `ListItem`s), a new small pure module alongside `searchStatus.ts` for the
suggestion-derivation logic (§6.2 — kind-ordering, cap, dedup-none, label formatting), covered by
its own unit test the way `searchStatus.test.ts`/`searchFilters.test.ts` already establish the
pattern for this directory. **Do not touch `packages/ui/src/components/SearchField.tsx`** — its
`suggestions`/`onSuggestionSelect` props and all keyboard/ARIA behaviour already exist and are
already covered by `e2e/ui/search-field.spec.ts`; this wave is a consumer of that primitive, not
a modifier of it.

**Cover art.** Pass a `leading={<CoverImage .../>}` (or equivalent) to each result `ListItem`
that currently renders none — books, podcasts, artists, albums, tracks. Series and authors stay
text-only (§5). 52px, 6px radius, per-kind fallback icon (§5).

**Suggestions wiring.** `SearchPage.tsx` already computes `books`/`podcasts`/`series`/`authors`/
`artists`/`albums`/`tracks` from `searchQuery.data`/`jellyfinSearchQuery.data` — feed those same
arrays into the new suggestion-derivation function, pass its output as `SearchField`'s
`suggestions` prop, and implement `onSuggestionSelect` to call `navigate()` with the target route
already used by that kind's `ListItem` `onClick` a few lines below (§6.2's selection rule) plus
`setQuery(suggestion.title)`.

**New e2e coverage, in `e2e/app/browse.spec.ts` or a new file — the wave decides which reads more
naturally, but do not skip this:** typing opens the suggestion listbox with real content (not the
gallery's fixture data `e2e/ui/search-field.spec.ts` already covers); selecting a suggestion by
click navigates to the right route and updates the field text; selecting by keyboard (ArrowDown,
Enter) does the same; a track with no `albumId` never appears as a suggestion; the suggestion cap
holds at 8 against a query matching more than 8 candidates.

---

## 10. Android: what changes

**Files:** `apps/android/app/src/main/java/net/develivarr/auralis/features/search/
UnifiedSearchScreen.kt`, `UnifiedSearchViewModel.kt`, and the shared `MusicRow` composable in
`MusicLibraryScreen.kt:336-374` (art size/radius/fallback — a component-level fix, so check
whether `MusicRow`'s other two call sites, in `MusicLibraryScreen` itself, are affected by
resizing it; if they are, either give the new size/radius/fallback only to the search call site
via a new optional parameter, or confirm with `-P` that the resize is acceptable everywhere
`MusicRow` appears — do not silently resize every `MusicRow` in the app as a side effect of a
search-screen wave).

**Fix the stale book-tap gap first — it is a one-line change with a route already sitting next to
it.** `UnifiedSearchScreen.kt:203-213`'s book row passes `onClick = null` with a comment saying no
book-detail route exists. `Routes.bookDetail(itemId)` exists (`AuralisNavHost.kt:180`, landed by
`16e-book-A`). Change the book row's `onClick` to navigate there, the same way the podcast row a
few lines below already does. Series and author rows stay `onClick = null` — no route exists for
either (§7).

**Add the missing status computation and its live-region equivalent.** `UnifiedSearchViewModel.kt`
needs (a) an ABS/library-unconfigured signal, following the exact shape `musicUnconfigured`
already establishes (`UnifiedSearchViewModel.kt:159`) rather than inventing a second pattern —
name it `libraryUnconfigured` or similar, plumbed the same way `musicUnconfigured` is; (b) a pure
function computing the same five status strings §6.4 pins, taking the equivalent inputs
(`libraryUnconfigured`, `musicUnconfigured`, trimmed query, loading state, per-kind counts) and
returning the identical English text. Render it as a `Text` composable carrying
`Modifier.semantics { liveRegion = LiveRegionMode.Polite }` — Compose's direct equivalent of
`aria-live="polite"` — positioned the same place web's status line sits, above the results list.

**Build the suggestion mechanism from scratch — nothing in `packages/ui` or Sonora to copy.**
`ExposedDropdownMenuBox`/`DropdownMenu` (Material 3's own combobox-shaped primitive) is the
natural fit and needs no new dependency; the _behaviour_ (§6.2's source, ordering, cap, label,
selection rule, and the series/author exclusion) is the actual contract, not the specific
composable chosen to render it. Selecting a suggestion navigates via the same `Routes.*` calls
`UnifiedSearchScreen.kt`'s result rows already use.

**New Robolectric coverage, in a new `UnifiedSearchScreenTest.kt` (this screen currently has
zero, same gap `16e-podcast-A` closed for `PodcastDetailScreen` and `16e-album-A` closed for
`AlbumDetailScreen`):** the status text carries the correct `liveRegion` semantics and the
correct string for at least the empty-query and no-matches cases; a suggestion selection fires
the expected navigation callback (use `performSemanticsAction(SemanticsActions.OnClick)` per the
`LazyColumn`-viewport trap `16e-album-A` already documents, if the suggestion list is scrollable);
the book row's `onClick` is wired (a regression guard against this exact gap recurring); series/
author rows remain non-interactive.

---

## 11. Accessibility requirements

- **Status announcement.** Web: `aria-live="polite"` on the existing `<p data-testid=
"search-status">`, unchanged. Android: `Modifier.semantics { liveRegion =
LiveRegionMode.Polite }` on the new status `Text` (§10) — the direct Compose equivalent, and the
  first time this screen has any accessibility semantics at all.
- **Suggestion listbox, web.** Already fully specified by `SearchField`'s existing ARIA wiring —
  `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`,
  `aria-activedescendant` tracking the highlighted option, `role="listbox"`/`role="option"` on
  the dropdown. This wave inherits it for free by passing real data; nothing new to build here.
- **Suggestion listbox, Android.** No Compose-native combobox semantics exist to inherit the way
  web's do — whichever composable is chosen (§10) must expose each suggestion as a clickable node
  with a `contentDescription` matching its visible label (`"{title} · {Kind}"`, same string as
  §6.2), so TalkBack announces the same content sighted users see.
- **Result row cover art (web, new).** `alt=""` (decorative) on every `CoverImage`/`leading`
  element — the row's own accessible name already comes from its `headline` text, matching every
  other `ListItem`/`CoverImage` call site in the app that pairs art with a text label.
  `AsyncImage`'s `contentDescription = null` on Android already follows the same rule and needs
  no change.
- **Book row tap fix (Android).** No new accessibility surface — `MusicRow`'s `onClick` already
  makes the row a clickable node when non-null; wiring it for books makes that row discoverable
  by TalkBack's "double-tap to activate" the same way podcast/artist/album rows already are.

---

## 12. Two constraints both implementing waves inherit

- **The Playwright port.** `-W` owns `apps/web` + `e2e/app`/`e2e/ui` and therefore holds the
  fixed `:4310` app-server port (`docs/HANDOVER.md`'s "two agents cannot both run Playwright"
  section) — no second browser-verifying wave may run beside it. `-A` (Kotlin only, no browser)
  parallelizes freely, as every prior 16e triple's `-A`/`-W` split has.
- **No BFF change, so no server-side wave precedes this triple.** §4 confirms both routes already
  serve everything both the results list and the suggestion derivation need. If recon during
  implementation turns up a real gap in either route's response (a field neither client currently
  reads but the suggestion label needs), stop and report rather than quietly adding a field to a
  shared schema without a spec update — the same discipline `docs/HANDOVER.md`'s "a wave that
  changes a shared domain type must typecheck its consumers" section already establishes for any
  cross-package type change.
