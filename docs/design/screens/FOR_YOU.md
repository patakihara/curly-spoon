# For You / browse — shared behaviour spec (wave 16e-foryou)

Status: **spec only, nothing implemented against it yet.** This is the shared spec both
`16e-foryou-W` (web) and `16e-foryou-A` (Android) build from, independently, followed by a
`16e-foryou-P` parity review by an agent that wrote neither half. Per `ROADMAP.md` §16 this is
the sixth and largest `16e` screen (after book detail, podcast detail, album detail, search, now
playing).

**Binding contract vs. recon — read this before anything else.** §5, §6, §7 and §11 are the
**contract**: every sentence in them is something an implementing wave must satisfy or explicitly
decline with a reason. §2, §3.1 and the first half of §4 are **recon** — evidence gathered to
justify the contract, not requirements in their own right. This distinction exists because
`16e-nowplaying-P` ruled, on this same project, that a wave misread a recon citation describing
_where something sits in Sonora's mock_ as a _restriction on where to render it_, when the
behaviour contract carried no such qualifier. Where this document cites a file:line to justify a
decision, that citation is evidence for the sentence stating the decision — never itself the
requirement.

**Naming.** Per `docs/USER_DECISIONS.md`'s "Naming" section, "Home", "For You", "Browse" and
"Discover" are not four screens — they are four names for **one destination**, and Sofia has
picked **"Browse"**, icon **`explore`**, as the current name. This document keeps calling the
underlying code and its files "For You" (`ForYouScreen.kt`, `HomePage.tsx`, `forYouFeed.ts`, the
`16e-foryou` wave name) because renaming those is expensive and she flagged the term itself as
"my preferred term right now" — not something to build into file/route/component names. The
**UI-visible string** is where the rename lands; §6.1 has the exact scope.

---

## 1. What the screen is for

The nav destination every reference (Sofia's own words, `SONORA.md` §7, the existing code) agrees
is the app's first, always-visible destination: a content-type filter row, a mixed quick-picks
grid, and a stack of horizontally-scrolling carousels below it — Audiobookshelf's own home
shelves, Jellyfin's favourite albums, and Auralis's own recommendation shelves, all rendered
through one uniform card. It is the one surface phase 15's external recommendations are mixed
into (`docs/USER_DECISIONS.md` decision 1: "library pages stay as they are... the mixing happens
on For You only").

It is also the surface with the most standing, still-open product debt on the project: `14c`'s
unfixed layout-shift ("Home's layout shift: attributed, deliberately not fixed" —
`docs/HANDOVER.md`), and two of Sofia's three `docs/USER_DECISIONS.md` decision-2 requirements
(podcast dedupe, mixed-content carousels) that have never been built. §3 and §7 draw the line this
document holds: which of that debt this triple pays down, and which it names and hands to a named
follow-on wave.

---

## 2. Content inventory — what each platform shows today

**Recon.** Every claim below was read from the file cited, not inferred.

### 2.1 Web — `apps/web/src/features/home/`

- `HomePage.tsx` is the screen. `<h1>For you</h1>` (`:326`, exact text verified by `sed`). Below
  a `configured`/loading/error gate (`:330-337`) sits the filter row (`Chip variant="filter"`,
  `:344-354`), `QuickPickGrid` (`:357-361`), then a `COLUMN_STYLE` stack of `Carousel`s (`:377-411`).
- **Four independent data sources**, each its own `useQuery`: `bookHomeQuery`, `podcastHomeQuery`
  (`useOptionalLibraryHomeQuery`, `:120-133`), `favoriteAlbumsQuery` (Jellyfin), and
  `recommendedQuery` (`useOptionalLibraryRecommendedQuery`, `:135-146`, book-library-scoped only).
- **The loading state is per-source, not page-level.** `anyLoading` (`:303`) is
  `showBooksLoading || showPodcastsLoading || showMusicLoading` — **`recommendedQuery` is not
  included**, verified by reading `:295-303` directly. Each `show*Loading` flag independently
  gates its own skeleton `Carousel` (`:378-403`), so sources settle and paint one at a time. This
  is `14c`'s documented cause of Home's measured layout shift (0.067 desktop / 0.053 mobile
  against a 0.001/0.008 baseline) — four sources landing after first paint, no reservation.
- `forYouFeed.ts` is the pure aggregation layer: `shelfToCarousel`, `recommendedShelvesToCarousels`,
  `albumsToCarousel`, `buildForYouCarousels`, `filterCarousels`, `buildQuickPicks`. **`FeedCarousel.contentType`
  is a single value** (`'books' | 'podcasts' | 'music'`, `:14-46`) — there is no mixed-shelf
  concept anywhere in this file today, confirmed by reading the whole file (193 lines).
- `Carousel.tsx` renders one card per `FeedItem`: fixed `CARD_WIDTH = COVER_SIZE = 160` (`:31-32`),
  still on `--m3-*` tokens throughout (`--m3-shape-full`, `--m3-surface`, `--m3-on-surface-variant`
  — grepped, twelve `--m3-*` references in the file), **not yet migrated** by any `16c` wave.
  External items get a visible badge reading **`"Not in library"`** (`:270`, `aria-hidden`) and an
  `aria-label` suffix reading **`", not in your library"`** (`cardLabel`, `:186-188`) — two
  different strings for the same fact; see §6.3.
- `forYouFilters.ts`: `FOR_YOU_FILTER_OPTIONS` = `All, Music, Podcasts, Audiobooks`, in that order,
  `value`s `all|music|podcasts|books` — read directly, both files (see §6.4).
- Nav: `apps/web/src/components/destinations.ts:71` — `{ key: 'forYou', label: 'For you', to: '/' }`.
  `Shell.tsx:46` — `forYou: 'home'`, i.e. the **`home` glyph**, not `explore`. `home` is absent
  from `Icon.tsx`'s `FILLABLE_ICON_NAMES` (`:77` — `['explore', 'album', 'book_2', 'podcasts',
'search']`), so this destination never gets the FILL-axis "selected" treatment any other
  destination is capable of.

### 2.2 Android — `apps/android/app/src/main/java/net/develivarr/auralis/features/home/`

- `ForYouScreen.kt` is the screen, mounted at `Routes.HOME`, replacing the pre-12d `HomeScreen`
  (still used only by `BooksScreen` through `HomeShelvesContent`/`HomeViewModel`, untouched by
  this document). `TopAppBar` title **`"For you"`** (`:105`, exact string). Below it: filter chip
  row, `QuickPickGrid`, then `LazyColumn` of `ForYouCarouselRow`s (`:130-192`).
- **`ForYouViewModel.load()` already fetches all three sources as concurrent `async` children and
  awaits every one of them — including the recommended shelves nested inside `fetchAbsCarousel` —
  before setting `_uiState.value = Loaded`** (`:88-107`, `:140-153`). There is no partial-source
  render: `ForYouUiState.Loading` is a single full-screen `CircularProgressIndicator`
  (`ForYouScreen.kt:117-124`), swapped wholesale for `Loaded` once every source has settled. **This
  is already exactly the behaviour `docs/USER_DECISIONS.md` decision 2 asks for** — see §6.2 for
  why this changes what the web wave has to build.
- `FeedCarousel.contentType` is also single-valued (`ForYouFeed.kt:42-52`) — same shape as web, no
  mixed-shelf concept, confirmed by reading the whole file (264 lines).
- `ForYouCarousel.kt`: `CARD_WIDTH = COVER_SIZE = 160.dp`, `QUICK_TILE_COVER_SIZE = 56.dp`
  (`:47-70`) — deliberately mirrors web's pixel values 1:1, per that object's own doc comment.
- **The accessibility gap `docs/HANDOVER.md` describes as open is CLOSED. This is the single
  biggest correction this document makes to a standing project belief.** `HANDOVER.md`'s phase-13
  and phase-14b-2 sections both currently read "Android has no `semantics` call on the For You
  carousels at all" / "14b-2 — not started, deliberately." That is stale. Reading
  `ForYouCarousel.kt:99-176` directly: `ForYouCard` wraps its whole subtree in
  `Modifier.semantics(mergeDescendants = true) { contentDescription = announcement }`, where
  `feedItemAnnouncement()` (`:120-134`) folds title, subtitle, the external-recommendation label,
  and the shelf's `reason` into one string — and the file's own doc comment (`:99-118`) explains,
  correctly, why this differs from web's `aria-describedby` mechanism (Compose's semantics tree
  has no name/description split; re-parenting the reason under every card would announce it once
  per card while scrolling). §6.5 and §8 restate this as an already-correct, already-implemented
  idiom that must be **left alone**, not rebuilt.
- External badge/announcement text: `EXTERNAL_RECOMMENDATION_LABEL = "Not in your library"`
  (`:98`) — **differs from web's visible badge text** (`"Not in library"`, no "your"). See §6.3.
- Nav: `ShellDestinations.kt:19` — `FOR_YOU(Routes.HOME, "For you", Icons.Filled.Home)`. Same
  `home`-not-`explore` drift as web, independently arrived at.

### 2.3 What Spotify's own reference screenshots actually show

`docs/research/spec-addendum/01-for-you.jpg` through `04-for-you.jpg` (viewed directly this
session, per `docs/USER_DECISIONS.md`'s instruction to look rather than guess):

- A horizontally-scrollable filter-chip row under a profile avatar: `All / Music / Podcasts /
Audiobooks` in `01`/`02`, `Music / Following / Podcasts` in `03` (chips reflow/reorder as the
  selection changes — not a fixed five-chip set).
- A **2-column quick-picks grid** at the top, 8 tiles, each a horizontal row (small square art +
  title) — and in the `All` filter (`01`, `03`) this grid **is** genuinely mixed: a Hamilton
  soundtrack, a Tim Ferriss audiobook, and a "Maintenance Phase" podcast episode sit in the same
  grid as music playlists. This matches what `buildQuickPicks`/`buildQuickPickGrid` already do on
  both platforms today (round-robin across carousels, §2.1/§2.2) — **no change needed there.**
- Below the grid: named, headed, horizontally-scrolling carousels — **"Your shows", "Recommended
  Stations", "Recents", "Audiobooks for you", "Your top mixes"**. **Every one of these observed
  shelves is single-medium.** Only the quick-picks grid mixes content types in these four
  screenshots; no shelf titled generically ("For you") contains a book, a podcast and an album
  side by side.
- `04` (Podcasts filter) shows **one card per show, titled "New episode from {show}"** — i.e. the
  UI's _structural_ answer to "don't show two episodes of one podcast" is one section per show,
  each capped at its newest episode. That is a different shape from a single shelf silently
  deduped to one item per parent, but it is evidence for the same underlying rule Sofia stated in
  words, not evidence against it.

**The tension worth naming rather than papering over:** Sofia's literal instruction ("there should
be carousels with mixed content") asks for something these four screenshots do not strongly
demonstrate at the shelf level — most Spotify shelves shown here are homogeneous. Her written
words are the binding requirement regardless of what the four screenshots happen to show; this is
recorded so a later reader does not conclude the screenshots contradict the requirement — they are
simply less demonstrative of it than the quick-picks grid is.

---

## 3. The Sonora treatment

Source for this section: `docs/design/SONORA.md` §3.4 (`MediaCard`) and §3.6 (`QuickPick`), cross-
checked against the actual vendored `renderVals()` bodies in
`docs/design/sonora/components/MediaCard.dc.html` and `QuickPick.dc.html` — quoted directly below
rather than re-derived, since `SONORA.md` itself warns its component-reference table is a summary
and the code wins on any disagreement. Both files were read in full this session.

**Neither `MediaCard` nor `QuickPick` is a `packages/ui` export.** `SONORA.md` §5 confirms:
`packages/ui/src/components/index.ts`'s 19 exports do not include either. They are, and stay,
**app-level, one-off styled markup** — `Carousel.tsx`/`HomePage.tsx` on web, `ForYouCarousel.kt`
on Android — restyled in place. This is not a `packages/ui`-wide primitive-extraction wave; do not
scope it into one.

### 3.1 Geometry / type table — `MediaCard` (the carousel card), both platforms

Column convention, matching every prior `16e` spec: **"desktop"** is what web renders at its
`medium`/`expanded` breakpoints (`>= 600px`, `apps/web/src/hooks/breakpoint.ts`); **"compact"** is
what web renders below that; **Android always uses the "compact"/mobile column** — there is no
Android equivalent of web's wide layout on this screen.

| Token                  | Desktop (web `>= 600px`)                                                                                                            | Compact (web `< 600px`) / Android                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card width             | `176px`                                                                                                                             | `152px`                                                                                                                                          |
| Art aspect ratio       | `1:1` (square)                                                                                                                      | `1:1`                                                                                                                                            |
| Art radius             | `var(--radius-md)` = `24px`                                                                                                         | `var(--radius-sm)` = `16px`                                                                                                                      |
| Art fill (placeholder) | `linear-gradient(135deg, var(--accent), var(--accent-violet))` — **do not implement**; see note below                               | same                                                                                                                                             |
| Title                  | `var(--text-md)` (14px), weight 700, single-line ellipsis, `margin-top: 10px`, color `var(--surface-fg)`                            | same, color `var(--m3-on-background)` on the compact/mobile branch (Sonora's own source keeps this one `--m3-*`, not `--surface-*` — see §9/§10) |
| Subtitle               | `var(--text-sm)` (13px), single-line ellipsis, `margin-top: 2px`, color `var(--surface-fg-muted)`                                   | same, color `var(--m3-on-surface-variant)`                                                                                                       |
| Absent pill (external) | top-left overlay, `var(--radius-pill)`, `var(--text-xs)` weight 700, background `var(--surface-bg)`, text color = muted color above | same                                                                                                                                             |
| Progress bar track     | `height: 5px`, `background: rgb(0 0 0 / 45%)`, bottom overlay on the art                                                            | same                                                                                                                                             |
| Progress bar fill      | `background: var(--accent)`, width = `round(progress*100)%`                                                                         | same                                                                                                                                             |

**Current values to replace, cited exactly**: web's `CARD_WIDTH`/`COVER_SIZE` are both `160`
(`Carousel.tsx:31-32`) where Sonora wants `176`/`152`; Android's are both `160.dp`
(`ForYouCarouselDimens.CARD_WIDTH`/`COVER_SIZE`, `ForYouCarousel.kt:47-48`), same gap. Neither
platform has a desktop/compact split on this screen today — web renders one fixed size at every
width, so building the split is new work, not a value swap.

**The placeholder gradient fill is explicitly NOT to be implemented.** `SONORA.md` §9 and every
prior `16e` spec agree: the vendored components render a gradient in place of real artwork because
there is no real cover-rendering in any `.dc.html` file. Both platforms already have real
`CoverImage`/`AsyncImage` cover art with a working fallback icon (`CoverImage.tsx`,
`ForYouCard`'s `Icon` layered under `AsyncImage`, `ForYouCarousel.kt:187-190`) — that is strictly
better than a static gradient and must not be replaced by one. Apply the fallback painter
requirement below to whatever the platform's existing cover mechanism is.

**Compose has no CSS-cascade fallback — restated because it bears repeating on every Android wave.**
Coil paints nothing while loading, on failure, or when the model is null. Android's `ForYouCard`
already names its own fallback painter (`Icon` layered beneath `AsyncImage`, `ForYouCarousel.kt:185-190`)
— **keep that mechanism**, just resize it to the new `COVER_SIZE`.

**Mixed-shelf subtitle convention — recon only, forward-compatible, out of this triple's build
scope (§7).** `MediaCard.dc.html`'s own comment: "In a mixed shelf the caller passes the content
type as the first part of the subtitle (`'Book · 6 h 12 m left'`); single-type shelves just pass
the artist." Recording this now costs nothing and means a future mixed-shelf wave does not have to
re-derive the subtitle format — but building mixed shelves is explicitly not this triple's job
(§7). **Binding for this triple**: continue passing single-type subtitles exactly as today.

### 3.2 Geometry / type table — `QuickPick` (the quick-picks grid tile), both platforms

Quoted directly from `QuickPick.dc.html`'s `renderVals()`:

| Token          | Desktop                                                                  | Compact / Android                                                                                                        |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Row gap        | `12px`                                                                   | `10px`                                                                                                                   |
| Row padding    | `8px`                                                                    | `8px`                                                                                                                    |
| Row radius     | `var(--radius-xs)` = `8px`                                               | `var(--radius-sm)` = `16px`                                                                                              |
| Row background | `var(--surface-card)`                                                    | `var(--m3-surface-container)` — **deliberately still `--m3-*` in Sonora's own source; do not "fix" to `--surface-card`** |
| Art size       | `52px` square                                                            | `48px` square                                                                                                            |
| Art radius     | `8px` (hardcoded literal, not a token — confirmed in source)             | `8px`                                                                                                                    |
| Title          | `var(--text-md)`, weight 700, line-height 1.3, color `var(--surface-fg)` | `var(--text-sm)`, weight 700, line-height 1.3, color `var(--m3-on-background)`                                           |
| Subtitle       | `var(--text-sm)`, color `var(--surface-fg-muted)`                        | `var(--text-sm)`, color `var(--m3-on-surface-variant)`                                                                   |

**Current values, cited exactly**: web's tile is already a horizontal row (`QUICK_TILE_STYLE`,
`HomePage.tsx:72-91`) — closer to Sonora's shape than the carousel card was — but at `56px` cover
(`QUICK_TILE_COVER_SIZE`, `:108`) against Sonora's `52`(desktop)/`48`(compact), and on
`--m3-shape-sm`/`--m3-surface-container` (`:78-79`) rather than the desktop/compact split above.
Android's `QuickPickTile` (`ForYouCarousel.kt:326-355`) is likewise a single `56.dp` size
(`QUICK_TILE_COVER_SIZE`, `:69`) with no desktop-equivalent concept, which is correct — Android is
always the compact/mobile column — but the number itself (56 vs. the target 48) still needs to
move.

**The 2-column grid layout itself (`display: grid; grid-template-columns: repeat(2, ...)`,
`HomePage.tsx:66-70`) is unchanged** — Sonora's own reference (§2.3 above) shows the same 2-column
shape, and no vendored component specifies grid column count (that is page composition, not a
`QuickPick` prop).

### 3.3 Loading-state geometry — skeleton silhouette, not a spinner

**Binding.** §6.2 states the behavioural requirement (hold until every source settles); this
states its visual shape, which both platforms must converge on, replacing what each does today:

- **Web already has the right shape**, just not gated correctly: `Carousel`'s `loading` prop
  already renders `skeletonCount` (default 4) placeholder cards at the exact card box size
  (`Carousel.tsx:224-238`), and `QuickPickGrid`'s `loading` prop already renders 8 skeleton tiles
  at the real tile size (`HomePage.tsx:166-180`). **Keep both meshanisms**; §6.2 only changes
  _when_ they show and disappear together, not what they look like. Resize both to the new §3.1/§3.2
  values as part of the same change.
- **Android has none of this today** — `ForYouUiState.Loading` is a single centred
  `CircularProgressIndicator` covering the whole screen (`ForYouScreen.kt:117-124`), discarding
  layout shape entirely. This is new work: build skeleton-shaped placeholders for the filter row
  (can render immediately, it needs no data), the quick-picks grid (8 tiles at `QuickPickTile`'s
  box size), and N carousel rows (`ForYouCard`'s box size) — the same shapes `MediaCard`/`QuickPick`
  §3.1/§3.2 already define, just filled with a shimmer/placeholder brush instead of real content.
  Compose has a `Modifier.placeholder`-style pattern or a plain `Box` with a muted background and
  no shimmer; either is acceptable, but the **box dimensions must exactly match the loaded card**,
  matching web's own stated reasoning (`Carousel.tsx`'s `TITLE_STYLE` doc comment: "a real title
  and a skeleton placeholder don't necessarily agree on line height... this row has to be the same
  height either way").

### 3.4 What `SONORA.md` doesn't cover — say so, don't invent

- **`SectionHeader`** (the heading above each carousel/grid) is one of Sonora's 16 primitives and
  is **explicitly unbuilt in `packages/ui`** (`SONORA.md` §5, "must be built from scratch"; its
  own source was never vendored). This triple does **not** build it. Both platforms keep their
  existing plain heading markup (web's bare `<h2>`, `Carousel.tsx:208`; Android's presumed
  equivalent `Text`), restyled with Sonora's typography tokens directly (weight, size, color from
  §1.8) rather than through a new shared component. Building `SectionHeader` is a `packages/ui`-
  wide wave, named in §7, not this one.
- **`QuickTile`** (§5's "Sonora-only, not covered" table) is explicitly flagged there as possibly
  — not confirmedly — the same component as `QuickPick`. This document treats them as the same
  thing (`QuickPick.dc.html` is the only quick-pick-shaped vendored source that exists), consistent
  with every prior spec's practice of using the concretely-vendored file over an unconfirmed name.
- Sonora specifies no literal skeleton/loading treatment for either card (`SONORA.md` §5: "nothing
  in the vendored files addresses loading states" — this is `Skeleton`'s own row in that table).
  §3.3 above is therefore this document's own decision, not a Sonora citation — labelled as such.

---

## 4. What the BFF serves vs. what each client uses

**No BFF change is needed for this triple.** Verified by reading `apps/server/src/routes/libraries.ts`
and `apps/server/src/routes/jellyfin.ts` directly: `GET /libraries`, `GET /libraries/:id/home`,
`GET /libraries/:id/recommended` and `GET /jellyfin/albums` already exist and already carry
everything §3/§6 need. Both clients' existing fetch/aggregation code (§2.1/§2.2) is unchanged in
shape by this triple — only the rendering layer and the loading-state orchestration change.

**Recon for the follow-on wave (§7), not a requirement of this one.** While confirming no BFF
change was needed, this session found that **the mechanism for both of Sofia's still-open decision-2
requirements already exists, server-side, tested, and unconsumed** —
`apps/server/src/features/recommendations/shelves.ts`:

- `dedupeByParent()` (`:53-64`) implements exactly "a carousel should not show more than one
  episode of a given podcast" — its own doc comment (`:22-33`) quotes her words verbatim and
  generalises the rule to any parent/child relationship (an explicit `media.parentId`, falling
  back to a book's first series name, falling back to the item's own id). `buildRecommendationShelves`
  already calls it (`:175-177`) before every shelf is emitted.
  **But `RecommendationCandidate.media.parentId` (`types.ts:70`) is never populated by any
  candidate-mapping code today** — grepped `apps/server/src` for `parentId` outside
  `types.ts`/`shelves.ts`/tests and found nothing. The field's own doc comment
  (`shelves.ts:29-30`) calls it "the field a future episode/track candidate would set" —
  future tense, not yet true. So the dedupe rule is real and tested but currently only ever
  exercises its book-series fallback branch in practice; a podcast-episode candidate mapper
  populating `parentId` is what a follow-on wave still has to build.
- `typeLabelsFor()` (`:69-82`) populates `RecommendationShelf.itemLabels` — a per-item kind label
  ("Audiobook"/"Podcast"/"Album") — **only when a shelf's `itemIds` span more than one
  `media.kind`**, which is exactly the mixed-shelf subtitle-prefix convention §3.1 names. Tested
  directly (`shelves.test.ts:299-328`, asserting the mixed case populates it and the single-kind
  case omits it). **`itemLabels` has zero consumers outside its own type declaration and its own
  test** — grepped the whole repo. It is not read by either client's `RecommendedShelf`/model type,
  and the route layer's own response mapping was not checked for whether it even survives
  serialization onto the wire (a follow-on wave must check this before assuming it does).
- **Neither existing call site (`libraries.ts:317`, book route; `jellyfin.ts:550`, music route)
  ever passes `buildRecommendationShelves` a candidate pool spanning more than one medium.** Each
  route scores and shelves its own medium's candidates only. So even though the shelf-building
  function _could_ emit a genuinely mixed shelf given mixed input, nothing today ever gives it
  mixed input. **The substantial remaining work for true mixed-content carousels is unifying the
  candidate pool across book/podcast/music at the point a shelf is built** — not the dedupe or the
  labelling, both of which already exist.

This is recon for whoever picks up the follow-on wave named in §7 — it is not something
`16e-foryou-W`/`-A` build, and neither wave should touch `shelves.ts`.

---

## 5. Fallback contract — what to omit or paint when a field is absent

- **No cover art** (`coverSrc`/`coverUrl` fails to decode, or the item has none): the existing
  fallback icon painter on each platform (§3.1) — unchanged, already correct, do not rebuild.
- **No subtitle** (`item.subtitle == null`): web already reserves the subtitle's row height with a
  non-breaking space (`Carousel.tsx:283-286`, `item.subtitle ?? ' '`) so cards stay the same
  height regardless — keep this. Android must do the same: reserve the subtitle `Text`'s height
  even when there is nothing to show, so a book with no subtitle is not a shorter card than one
  with an artist name.
- **No `reason`** (an ordinary shelf, not a recommendation): render nothing where the reason line
  would go — both platforms already do this correctly (§2.1/§2.2), unchanged.
- **`progress == null`**: reserve the progress-bar row's height but render no bar inside it — both
  platforms already do this (`PROGRESS_ROW_STYLE`, `ForYouCarouselDimens` equivalent), unchanged.
- **A source fails entirely** (one of the three/four `useQuery`/`async` calls errors): that
  source's carousels are simply absent from the feed — both platforms already implement this
  degrade-not-blank rule (`ForYouViewModel.load()`'s `SourceResult.failed` bookkeeping;
  `HomePage.tsx`'s `isError` checks). §6.2 changes _when_ the page as a whole leaves its loading
  state, not this per-source degrade rule.
- **Every source fails** (`books.failed && podcasts.failed && music.failed` on Android; the web
  equivalent has no single combined check today and must gain one per §6.2): render the existing
  error message, unchanged in wording — Android's `"Couldn't load your library."` — web has none
  today and should adopt the same message for consistency, since no doc pins a different one.
- **No libraries configured at all**: web's existing `!configured` gate
  (`"Connect Audiobookshelf in Settings to see your libraries here."`, `HomePage.tsx:331`) is
  unchanged and sits _before_ the loading-state machinery §6.2 describes, not inside it.

---

## 6. Behaviour contract — both platforms must satisfy this

### 6.1 Nav rename: "For you" → "Browse", icon `home` → `explore`

**Both platforms, small, well-defined — do not touch any other destination's label or icon.**

- Web: `apps/web/src/components/destinations.ts:71` — `label: 'For you'` → `label: 'Browse'`.
  `apps/web/src/components/Shell.tsx:46` — `forYou: 'home'` → `forYou: 'explore'`. `explore` is
  already in `Icon.tsx`'s `FILLABLE_ICON_NAMES` (`:77`) — verified by grep — so this rename also
  restores the FILL-axis "selected" treatment to this destination for free; it was silently absent
  before because `home` was never in that list.
- Android: `ShellDestinations.kt:19` — `FOR_YOU(Routes.HOME, "For you", Icons.Filled.Home)` →
  `FOR_YOU(Routes.HOME, "Browse", Icons.Filled.Explore)`. **Inference, not confirmed**: this
  session did not verify `Icons.Filled.Explore` resolves in this project's icon dependency
  (`material-icons-extended`, per `docs/HANDOVER.md`'s phase-14b section) — the `-A` wave must
  confirm it compiles; if it does not exist under that exact name, use the closest available
  filled "explore" glyph and say so in the report.
- **The on-screen heading matches the nav label, on both platforms.** Web's `<h1>For you</h1>`
  (`HomePage.tsx:326`) → `<h1>Browse</h1>`; Android's `TopAppBar` title `"For you"`
  (`ForYouScreen.kt:105`) → `"Browse"`. This is a pre-ruling, not a discovered requirement: no
  other screen in this app has ever had its on-screen heading disagree with its nav label (Music,
  Books, Podcasts, Search all match), so a mismatch here would itself be a new, unjustified
  asymmetry between this screen and every other one.

### 6.2 Loading state: hold until every source settles

**This is `docs/USER_DECISIONS.md` decision 2's first bullet, closing `14c`.** Her words: "Ofc
Home should be in a loading state before it loads?"

**Android already satisfies this. Do not rebuild it — restyle its loading UI per §3.3 and stop.**
`ForYouViewModel.load()` (§2.2) already awaits all three sources, including nested recommended
carousels, before ever setting `Loaded`. The only change Android needs here is visual (§3.3): swap
the bare `CircularProgressIndicator` for the layout-shaped skeleton silhouette, still shown until
`load()` resolves. **No change to `ForYouViewModel.kt`'s control flow.**

**Web must change**, and this is real, non-trivial work — not a value swap:

- Combine `setupQuery`/`librariesQuery`'s existing gate with a **new** aggregate over all four
  data sources (`bookHomeQuery`, `podcastHomeQuery`, `favoriteAlbumsQuery`, `recommendedQuery`) —
  **`recommendedQuery` must be included this time**; today's `anyLoading` (`HomePage.tsx:295-303`)
  omits it, which is the exact gap this bullet closes.
  It is legitimate to keep computing per-source booleans for internal bookkeeping, but the page
  must render **either** the full skeleton silhouette (§3.3: filter row + 8 skeleton quick-picks +
  N skeleton carousel rows) **or** the full real content — never a mix of settled and unsettled
  sources on screen at once, which is exactly what today's per-source `show*Loading` carousels do.
- The "one bad source degrades, not a blank page" rule (§5) is unchanged in spirit but changes in
  _timing_: today a failed source is simply never counted as loading and its carousel never
  appears; under the new rule, a failed source still needs to be treated as "settled" (so the page
  does not wait forever on a source that will never resolve) while contributing nothing to the
  feed — i.e. `isLoading || isError` per source, not `isLoading` alone, feeds the aggregate.
- **Do not build a client-side artificial delay or a minimum skeleton duration.** The requirement
  is "hold until settled", not "always show a skeleton for N ms" — a source that resolves
  instantly should show real content instantly, exactly as Android's `load()` already does.

**How many skeleton carousel rows to show while waiting, since real shelf count is unknown before
any source resolves**: use a fixed, small placeholder count (Android's Robolectric-testable
default should match whatever web picks) — **this document does not pin an exact number**, since
neither Spotify's screenshots nor `SONORA.md` specify one and it is a cosmetic choice with no
behavioural consequence. Pick something in the 2-4 range and state the choice in the wave's own
commit message so the other platform's wave (or the `-P` review) can check they agree, though an
exact match is not required — unlike the byte-for-byte strings in §6.3, this number is not a
parity requirement.

### 6.3 External-item label text — one canonical string, fixing a real three-way mismatch

**A genuine, previously undocumented drift, found this session by reading all three sources
side by side:**

| Source                                                                                                | Text                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Sonora's own vendored source (`MediaCard.dc.html`)                                                    | `"Not in library"`                                                           |
| Web, visible badge (`Carousel.tsx:270`)                                                               | `"Not in library"` (matches)                                                 |
| Web, `aria-label` suffix (`cardLabel`, `:187`)                                                        | `", not in your library"` (differs — adds "your", different casing/position) |
| Android, visible badge **and** announcement (`EXTERNAL_RECOMMENDATION_LABEL`, `ForYouCarousel.kt:98`) | `"Not in your library"` (differs — adds "your")                              |

**Ruling: `"Not in library"`, Sonora's literal string, is canonical — both platforms converge on
it, in both the visible badge and the accessible name.** Reasoning: it is the only one of the four
with a design-system source; the other three are independent, unreviewed word choices that
happened to disagree with each other. This is a **byte-for-byte target** — see §6.3's own row
below and the general note in this section's header.

- Web: change `cardLabel()`'s suffix (`Carousel.tsx:187`) from `` `${base}, not in your library` ``
  to `` `${base}, not in library` ``. The visible badge text (`:270`) is already correct; leave it.
- Android: change `EXTERNAL_RECOMMENDATION_LABEL` (`ForYouCarousel.kt:98`) from
  `"Not in your library"` to `"Not in library"`. This single constant feeds both the visible badge
  and `feedItemAnnouncement()`'s merged `contentDescription` (§2.2), so one edit fixes both.

**Worked example, literal expected output, both platforms**, for an external item titled
`"Static Coast"` with subtitle `"Nebula Drift"`:

- Web `aria-label`: `"Static Coast, Nebula Drift, not in library"`
- Android merged `contentDescription`, no shelf `reason`: `"Static Coast, Nebula Drift — Not in
library"` (Android's `feedItemAnnouncement` joins parts with `" — "`, per `ForYouCarousel.kt:134`
  — this join punctuation is **not** part of the byte-for-byte target, only the label text itself
  is; the two platforms' overall sentence shapes already differ by design, per the mechanism
  difference §2.2/§6.5 already rule as idiom).

### 6.4 Filter chips — unchanged, restated for completeness only

`FOR_YOU_FILTER_OPTIONS` already matches exactly on both platforms — verified by reading both
files directly (§2.1/§2.2): `All, Music, Podcasts, Audiobooks`, same order, same `value`s. No
change. Restyle the chip visuals to whatever token `packages/ui`'s `Chip`/Android's `FilterChip`
already resolve through their own `16c`/Android-theme migration — this screen does not own chip
styling, it only consumes the shared component.

### 6.5 Accessibility grouping on carousels — Android's mechanism is correct, keep it

**Restated from §2.2 because it directly contradicts a standing belief in `docs/HANDOVER.md`, and
an implementing wave must not "fix" what is not broken.** Android's per-card merged
`contentDescription` (`feedItemAnnouncement`, `ForYouCarousel.kt:120-134`) is a **deliberate,
already-reasoned, already-correct** mechanism for conveying the same information web's
`aria-describedby` split conveys, given Compose's semantics tree has no name/description split
concept. §8 rules this idiom, not drift. **Do not add `aria-describedby`-equivalent machinery to
Android, and do not remove or restructure the merged `contentDescription`.** The only Android
change this document requires here is the text fix in §6.3.

### 6.6 Loading/loaded state must be announced — new requirement, both platforms

Neither platform announces the loading→loaded transition to a screen reader today (grepped both
`HomePage.tsx` and `ForYouScreen.kt`/`ForYouCarousel.kt` for `aria-live`/`role="status"`/
`liveRegion`/`Modifier.semantics { liveRegion` and found nothing). §6.2's page-level hold makes
this more noticeable, not less — a screen-reader user now waits through one longer silence instead
of several shorter ones with no signal either way. Both platforms must announce a `"Loading your
browse feed…"` / `"Browse feed loaded."` pair (or platform-equivalent wording — this is new UI
text with no existing precedent to match, so unlike §6.3 it is **not** a byte-for-byte requirement,
just a requirement that _something_ is announced) via a live region on web (`role="status"`, matching
the pattern `SEARCH.md` §6.4 already established for its own status line) and
`liveRegion = LiveRegionMode.Polite` on Android.

---

## 7. Explicitly out of scope

**The scoping decision this document exists to make, stated plainly.** `docs/USER_DECISIONS.md`
decision 2 has three parts: (1) hold the loading state, (2) no more than one episode of a given
podcast per carousel, (3) carousels with genuinely mixed content. Part 1 is in this triple's
contract (§6.2) because it is purely client-side orchestration with no BFF dependency, and because
any restyle of this screen's loading UI has to define its shape anyway (§3.3) — there is no way to
do the visual work without also deciding when it shows. **Parts 2 and 3 are not in this triple**,
and are named here as a sequenced follow-on instead:

- **`16e-foryou-shelves-S`** (server) — populate `RecommendationCandidate.media.parentId` for
  podcast episode candidates (closing the gap §4 found: `dedupeByParent` is tested and correct but
  currently only exercises its book-series fallback in practice), confirm `itemLabels` actually
  reaches the wire in the route's response mapping, and unify the candidate pool across
  book/podcast/music at whichever call site ends up building a genuinely mixed shelf. **This is
  substantial, cross-cutting work** — it touches candidate adaptation, possibly a new merged
  route or a change to how the existing three routes cooperate, and the ranking/shelf-assignment
  logic that decides which items from which media end up in the same shelf. Bundling it with a
  full visual restyle of the app's largest screen would produce exactly the oversized-wave failure
  `CLAUDE.md`'s delegation section warns against ("split along a file boundary... bigger agent
  tasks are not cheaper").
- **`16e-foryou-shelves-W`/`-A`** (client) — once `-S` lands, wire `itemLabels` into both clients'
  `RecommendedShelf`/`FeedCarousel` types, widen `FeedCarousel.contentType` to allow a `'mixed'`
  value, and use §3.1's already-specified subtitle-kind-prefix convention (`"Book · 6 h 12 m
left"`) to render it — the visual contract for a mixed card's subtitle is **already written**
  in §3.1, so this follow-on wave does not need its own design pass, only its own build.

**Do not silently drop these** — they are Sofia's own stated requirements, not an item this
document is declining. They are sequenced and named so the next session picks them up as one
coherent piece of work rather than rediscovering the `dedupeByParent`/`typeLabelsFor` mechanism
from scratch.

- **`SectionHeader`** (§3.4) — a `packages/ui`-wide primitive, not this screen's to build.
- **Migrating `Chip`/`FilterChip` fully onto Sonora's `--surface-*`/`--accent` substrate.** Out of
  this screen's scope by the same reasoning every prior `16e` spec gives — chip styling is owned
  by whichever wave migrates that shared component, not by a screen that merely consumes it.
- **Spotify's "Following" chip** (`03-for-you.jpg`) — a distinct filter option this app's own
  `FOR_YOU_FILTER_OPTIONS` has never had and no roadmap item requests. Not added.
- **The book/podcast/music recommendation _ranking_ itself** — whether the shelves shown are any
  good is `docs/HANDOVER.md`'s long-standing "quality is unassessable here" caveat, unrelated to
  this screen's visual contract.
- **The Robolectric coverage gap this session did not check.** Whether `ForYouScreen.kt`/
  `ForYouCarousel.kt` already have Compose UI test coverage was not verified — the implementing
  `-A` wave should check `apps/android/app/src/test` for an existing `ForYouCarouselAccessibilityTest`-
  style file (referenced in `ForYouCarousel.kt:150`'s own doc comment) and extend it for the new
  skeleton/loading-state composables rather than assuming none exists.
- **Web bundle/entry-chunk weight** — `14a`'s standing finding ("do not spend another wave
  shrinking the entry chunk") applies here as everywhere; this triple's changes are restyling
  existing markup, not adding a dependency.

---

## 8. Deliberately unequal

- **The accessibility mechanism for a card's reason line** (§2.2/§6.5): web splits name/description
  across two DOM nodes via `aria-describedby`; Android folds everything into one merged
  `contentDescription`. **Idiom, not drift** — Compose's semantics tree has no equivalent of "this
  list is described by that paragraph" (`ForYouCarousel.kt:113-118`'s own reasoning, independently
  confirmed correct this session). Kept exactly as implemented; only the text inside it changes
  (§6.3).
- **The FILL-axis nav-icon toggle.** After §6.1's rename, web's Browse destination gains the
  FILL-axis "selected" treatment (§6.1); Android's nav icons cannot express this at all —
  `docs/HANDOVER.md`'s standing, pre-existing finding: "Android's nav icons never toggle fill on
  selection, and structurally cannot: `ShellDestinations.kt` imports fixed `Icons.Filled.*` vectors
  with no outline sibling in the tree." **Pre-existing, out of this triple's scope, named so a
  reader does not mistake it for something this rename should have also fixed.**
- **Quick-picks tile background token on the compact/mobile column**: `var(--m3-surface-container)`,
  not `var(--surface-fg)`'s sibling `--surface-card` — this is Sonora's _own_ source doing this
  (§3.2), not an unmigrated leftover, on both platforms. Do not "fix" it to match the desktop
  column.

---

## 9. Web: what changes

Files: `apps/web/src/features/home/HomePage.tsx`, `Carousel.tsx`, `forYouFeed.ts` (types only, no
new mixed-shelf logic — see §7), `forYouFilters.ts` (unchanged, §6.4), `apps/web/src/components/
destinations.ts`, `apps/web/src/components/Shell.tsx`.

1. `destinations.ts:71` / `Shell.tsx:46` — nav rename, §6.1.
2. `HomePage.tsx:326` — `<h1>` rename, §6.1.
3. `Carousel.tsx` — `CARD_WIDTH`/`COVER_SIZE` → `176`/`152` with a real desktop/compact split
   (new — today's constants are single fixed numbers, §3.1); art radius → `--radius-md`/
   `--radius-sm`; title/subtitle colors and sizes → §3.1's table, replacing the current
   `--m3-on-surface-variant`/hardcoded-px values; `cardLabel()` suffix text fix, §6.3.
4. `HomePage.tsx`'s `QUICK_TILE_STYLE`/`QUICK_TITLE_STYLE`/`QUICK_TILE_COVER_SIZE` → §3.2's table
   (52/48px cover, background/radius split by breakpoint — new, today's is one fixed style).
5. `HomePage.tsx` — the loading-state aggregation rewrite, §6.2. This is the largest single piece
   of work in this wave: a new combined-loading computation feeding a page-level skeleton/real-
   content switch, replacing the current four independent `show*Loading` branches.
6. New: a live region announcing loading→loaded, §6.6.
7. Both `Carousel.tsx` and `HomePage.tsx`'s skeleton branches resize to the new card/tile
   dimensions from steps 3-4 (§3.3) — do not leave the skeleton at the old 160px/56px size while
   the loaded card moves to 176/152.

**Verify before building, not after**: the `-W` wave must re-run the `grep`s this document cites
(`--m3-*` count in `Carousel.tsx`, `FILLABLE_ICON_NAMES` contents, `anyLoading`'s exact composition)
against its own checkout before starting, per this project's standing "recon is a starting point,
not a census" rule — this document's counts were correct as of this session but code moves.

## 10. Android: what changes

Files: `ForYouScreen.kt`, `ForYouCarousel.kt`, `ForYouViewModel.kt` (loading-state UI only — see
below, its control flow is unchanged), `ShellDestinations.kt`.

1. `ShellDestinations.kt:19` — nav rename, §6.1 (verify `Icons.Filled.Explore` compiles).
2. `ForYouScreen.kt:105` — `TopAppBar` title rename, §6.1.
3. `ForYouCarouselDimens` (`ForYouCarousel.kt:47-70`) — `CARD_WIDTH`/`COVER_SIZE` → `152.dp` (both,
   since Android is always the compact column, §3.1); `QUICK_TILE_COVER_SIZE` → `48.dp` (§3.2).
   Apply the corresponding radius/typography changes from §3.1/§3.2's compact column to `ForYouCard`
   and `QuickPickTile`'s `Modifier`/`Text` styling.
4. `EXTERNAL_RECOMMENDATION_LABEL` (`:98`) — text fix, §6.3.
5. **New**: replace `ForYouUiState.Loading`'s bare `CircularProgressIndicator`
   (`ForYouScreen.kt:117-124`) with skeleton-shaped placeholder composables at the §3.1/§3.2/§3.3
   dimensions — filter chip row (can render immediately, needs no data), a skeleton quick-picks
   grid, and N skeleton carousel rows. **`ForYouViewModel.kt`'s `load()` function itself does not
   change** — it already holds `Loading` until every source settles (§2.2/§6.2); this step is
   Compose UI only.
6. New: `liveRegion = LiveRegionMode.Polite` announcing the loading→loaded transition, §6.5.

**Do not touch `HomeShelvesContent.kt`/`HomeViewModel.kt`** — both are `BooksScreen`'s, unrelated
to this screen, per `ForYouScreen.kt`'s own doc comment (§2.2).

**Budget two-to-three red Android CI rounds** — nothing on this machine compiles Kotlin. Run the
two compiler-free pre-checks (balanced `/*`/`*/` per changed file, no `.` inside a backtick test
name) before dispatch reaches CI.

---

## 11. Accessibility requirements

- **§6.5's merged-node mechanism on Android is correct and must be preserved exactly** — do not
  restructure `ForYouCard`'s `Modifier.semantics(mergeDescendants = true)` block.
- **§6.3's canonical `"Not in library"` string must reach the accessible name on both platforms**,
  not just the visible badge — web via `cardLabel()`'s suffix, Android via
  `EXTERNAL_RECOMMENDATION_LABEL` feeding `feedItemAnnouncement()`. A visible-only fix that leaves
  the old wording in the accessible name is not a complete fix.
- **§6.6's live-region announcement is new and required on both platforms** — a screen-reader user
  must be told when the page is loading and when it has finished, exactly as `SEARCH.md` §6.4
  already established for its own screen's status line.
- **The filter chip row's existing accessible grouping is unchanged** — web's `role="group"
aria-label="Filter by content type"` (`HomePage.tsx:341`) and whatever Android equivalent exists
  today stay as they are; this document does not touch filter-chip accessibility.
- **The quick-picks grid's existing `role="list"`/`aria-label="Quick picks"` (`HomePage.tsx:161-163`)
  is unchanged** on web; verify Android's `QuickPickGrid` has an equivalent grouping semantic (this
  session did not check — the `-A` wave must confirm one exists or add it) before assuming parity.
- **Progress announcements** (`aria-label={"${pct}% complete"}` on web's `LinearProgress`, §5) are
  unchanged by this document; do not regress them while resizing cards.

---

## 12. Two constraints both implementing waves inherit

- **Only one `-W` wave can run Playwright at a time on this machine** —
  `playwright.config.ts`'s hardcoded port 4310, `docs/HANDOVER.md`'s "Two agents cannot both run
  Playwright here." Check before dispatching `16e-foryou-W` alongside anything else that needs a
  browser.
- **Nothing on this machine compiles Kotlin.** Budget two-to-three red Android CI rounds. The two
  compiler-free pre-checks (`/*`/`*/` balance per changed `.kt` file, no `.` in a backtick test
  name) cost nothing and measurably reduce them.
