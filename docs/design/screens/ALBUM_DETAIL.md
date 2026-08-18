# Album detail — shared behaviour spec (wave 16e-album)

Status: **spec only, nothing implemented against it yet.** This is the shared spec both
`16e-album-W` (web) and `16e-album-A` (Android) build from, independently, followed by a
`16e-album-P` parity review by an agent that wrote neither half. Per `ROADMAP.md` §16, this is
the third screen triple — Music is the user's stated priority 3, and `AlbumDetailScreen` is the
last of the three detail screens with **no Robolectric coverage at all**
(`docs/HANDOVER.md`'s 2026-08-19 hand-off names it as the natural next pick for exactly that
reason).

This document describes **behaviour and structure**, not a React tree or a Compose tree. Where
the design (`docs/design/SONORA.md`, `docs/design/sonora/`) doesn't cover something, that is
stated explicitly rather than invented — every geometry/type value is in an explicit
per-platform table (§3), not buried in prose, per the correction `16e-book-P` recorded and
`16e-podcast` confirmed works: on that triple, two agents that never saw each other's work
produced meta lines matching **byte for byte**, separator glyph included, wherever the spec
gave a literal example string. This document uses literal example strings throughout for
exactly that reason.

**This triple is asymmetric in BOTH directions, and both waves must read this before doing
anything else — it is not the usual "Android's header is already done" shape.**

- **Android's header is already adopted, further than on the other two screens.**
  `16e-book-A-2` (commit `6b6a173`) built `ui/components/MediaHeader.kt` and **`AlbumDetailScreen.kt`
  already calls it** (`AlbumDetailScreen.kt:218-232`) — confirmed by reading the file. Unlike the
  book/podcast screens at the start of their own triples, Android here needs no header-adoption
  step at all. But `meta` and the header's `actions` slot are both still unwired (`meta` isn't
  passed at the call site; `actions` isn't either) — the same "adopted but not filled in" gap
  `16e-podcast-A` closed on `PodcastDetailScreen`. **New here**: this screen's subtitle (the
  artist name) needs to become a *tappable link* to the artist page, and `MediaHeader.kt` has
  **no mechanism for that at all today** — no `onSubtitleClick` parameter, nothing. §3 and §10
  spell out exactly what to add and why it's safe to add.
- **Web has never used `MediaHeader.tsx` on this screen and needs a straightforward adoption.**
  `apps/web/src/components/MediaHeader.tsx` exists (`16e-podcast-W`) and already serves
  `ItemPage.tsx` and `PodcastDetailPage.tsx`. `MusicAlbumPage.tsx` still renders its own
  pre-Sonora `<div style={{display:'flex', ...}}>` block (`MusicAlbumPage.tsx:143-165`) and does
  not import `MediaHeader` at all. Unlike Android, web's component **already** supports a
  clickable subtitle (`subtitle?: ReactNode`, caller builds the link) — no new capability
  needed on web's side.

---

## 1. What the screen is for

Music is the user's stated priority 3. This is the screen reached after tapping an album
anywhere in the app — an artist's album list, a shelf card, search, a recommended-albums shelf.
Its job is:

1. **Show enough about the album to decide whether to listen** — who made it, when, what genre,
   how many tracks, how long.
2. **Play the whole album in one tap**, in track order, or **shuffled** in one tap.
3. **Play any individual track directly**, and see which one is playing right now.
4. **Get to the artist's own page** from here, the same way a book's author link already works.

It is a detail page for one album's track list, not an artist's own detail page (`artist`,
Sonora's separate screen, already exists on both platforms as `MusicArtistPage.tsx` /
`ArtistDetailScreen.kt` and is untouched by this wave) and not a queue/now-playing surface
(`QueueView.tsx` / `QueueScreen.kt`, also untouched).

---

## 2. Content inventory — what each platform shows today

**Evidence.** Web: `apps/web/src/features/music/MusicAlbumPage.tsx` (259 lines, read in full).
Android: `apps/android/app/src/main/java/net/develivarr/auralis/features/music/AlbumDetailScreen.kt`
(327 lines, read in full) and `AlbumDetailViewModel.kt` (438 lines, read in relevant part) plus
`ui/components/MediaHeader.kt` (183 lines, read in full).

| Content / control                | Web today                                                                                                     | Android today                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Route                             | `/music/album/$albumId` (own component)                                                                       | `music/album/{albumId}`, reached from `MusicLibraryScreen`'s albums list or `ArtistDetailScreen`'s album list                    |
| Cover art                         | `CoverImage`, 96px, `music_note` fallback icon, plain flex row (`:144`) — **pre-Sonora**                      | `MediaHeader` — **already Sonora-styled** (232dp/208dp, `shapes.large`, fallback icon underlay) via `AlbumDetailScreen.kt:218`   |
| Title                             | `<h1 data-testid="music-album-name">` (`:146`), plain, no Sonora type scale                                   | `MediaHeader`'s `title` slot — **already Sonora type scale** (weight 900, `--h2`/`--h4`)                                         |
| Artist / subtitle                 | `<p>{artistNames}</p>` if present (`:147`), plain text, **not a link**                                        | `MediaHeader`'s `subtitle` slot, muted — **already styled, not a link** (`MediaHeader.kt` has no click mechanism at all)          |
| Kind label                        | **not shown**                                                                                                   | `MediaHeader`'s `kindLabel = "Album"` (`:222`) — **already shown, uppercase, muted**                                             |
| Meta line (year/genre/tracks/dur) | **not shown**                                                                                                   | **not shown** — `MediaHeader(meta = …)` param exists but the call site passes nothing (`:218-232`)                               |
| Play / Shuffle                    | **not present anywhere on this page**                                                                          | **not present** — `MediaHeader`'s `actions` slot exists but is passed nothing (`:218-232`)                                       |
| Album favourite                   | `FavoriteToggle` beside the cover (`:149-156`)                                                                 | `FavoriteToggleButton` in `MediaHeader`'s `trailingContent` slot (`:225-231`)                                                     |
| Add album to playlist             | `AddToPlaylistButton` beside the cover (`:157-164`)                                                            | `TextButton("Add album to playlist")` below the header, disabled when empty (`:234-236`)                                        |
| Track row: position               | `trackPosition(discNumber, trackNumber)` — "D.N" multi-disc / "N" single-disc / blank (`:53-58`, `:196`)      | `MusicTrackUi.position`, identical rule, computed in the ViewModel (`AlbumDetailViewModel.kt`'s own doc comment cites the web fn) |
| Track row: title                  | `ListItem` `headline` (`:197`)                                                                                 | Plain `Text`, `titleSmall` (`:315`)                                                                                               |
| Track row: duration               | `ListItem` `supportingText`, `formatDuration` clock format e.g. `"3:34"` (`:198-202`)                          | Same clock format via shared `formatDuration` util (`:317`)                                                                       |
| Track row: currently-playing      | **not shown at all** — no highlighting, no `aria-current`                                                     | **not shown at all** — no highlighting, no "Now playing" label (contrast with `QueueScreen.kt`, which has one — see §6)          |
| Track row: a11y                   | Explicit `aria-label={`Play ${track.name}`}` (`:194`) — **drops duration entirely from the announced name**   | **No merged semantics** — three bare `Text`/button composables inside a `Row` (`:294-326`), no `semantics(mergeDescendants=true)` |
| Track row: actions                | Add-to-playlist, favourite, context-menu "more" button, all trailing (`:203-221`)                              | Add-to-playlist `TextButton`, favourite, `TrackContextMenu` wrapping the clickable area (`:298-325`)                              |
| Empty album                       | `<p>No tracks found for this album.</p>` (`:176`)                                                              | `Text("No tracks found for this album.")` (`:238`) — same copy                                                                    |
| Loading state                     | Three `Skeleton` rectangles (`:167-172`)                                                                       | `CircularProgressIndicator` (`:104-107`)                                                                                          |
| Fetch error state                 | Inline `role="alert"` message (`:173-174`)                                                                     | Inline error `Text` + Retry `Button` (`:114-122`)                                                                                 |
| Unconfigured (no Jellyfin) state  | Not this screen's concern — gated upstream by navigation (music nav item hidden)                              | `AlbumDetailUiState.Unconfigured` — calm "No Jellyfin server connected yet.", no retry (`:110-113`)                               |
| Pagination                        | Previous/Next buttons, `page.rangeLabel` (`:228-253`), **replaces** the visible page (40/page)                 | "Load more" button, **accumulates** onto the existing list (`:256-266`), same 40/page (`MUSIC_PAGE_SIZE`)                        |

**One asymmetry already present and out of scope here:** web's pagination *replaces* the
visible track list per page; Android's *accumulates* via "Load more". Pre-existing, not
introduced by either header work or this spec, and not something this triple should unify —
§7 names it explicitly so nobody "fixes" it as a side effect of the header work.

---

## 3. The Sonora treatment

**Authority: `docs/design/sonora/Auralis-Redesign.dc.html`**, read directly. The `album` screen
definition (`:643-647`):

```js
album: [
  { isHeader: true, kindLabel: 'Album', playLabel: 'Play', secondLabel: 'Shuffle',
    headTitle: 'Driftwave', headArtist: 'The Nebula Collective', onArtist: () => this.go('artist'),
    meta: '2021 · Synthwave · 2 tracks · 6 min' },
  { hasHeading: true, title: 'Tracks', isTracks: true, items: trackItems(TRACKS.slice(0, 2), { activeIndex: s.trackIndex }) },
  { hasHeading: true, title: 'More from The Nebula Collective', action: 'arrow_forward',
    actionLabel: 'Go to artist', onAction: () => this.go('artist'), isRow: true,
    items: cards(ALBUMS.slice(1, 4).map((a) => ({ title: a.title, sub: String(a.year), kind: 'Album' }))) },
],
```

`SONORA.md` §3.5's `MediaHeader` prop table (`:379-398`) confirms the same shape generically:
`playLabel` defaults `'Play'`, `secondLabel` defaults `'Shuffle'`, and **the subtitle's colour is
conditional on whether `onSubtitle`/`onArtist` is passed** — `var(--accent-ink)` + pointer when
clickable, plain muted otherwise, "the general pattern for 'this label is a link to another
entity' throughout the redesign." §4's primitives table (`:490-507`) adds `AlbumHeader`
(`title, artist, meta, image, platform, onPlay, onShuffle`) and `TrackRow`
(`index, title, artist, album, time, active, platform, onClick`) — `TrackRow`'s `active` prop is
the currently-playing indicator (§6).

**This screen's design mock's own fixture data matches this app's real e2e fixture almost
exactly** — `apps/server/src/testSupport/fakes/fakeJellyfin.ts:117-123`: album `Driftwave`,
artist `The Nebula Collective`, year `2021`, genre `['Synthwave']`, tracks "Tidal Lines" (3:34)
and "Static Coast" (3:18) (confirmed against `e2e/app/music.spec.ts:122-139`, which already
asserts these exact names and durations). This is not a coincidence worth re-deriving — it means
this spec's literal examples below are checkable against the real fixture, not invented.

### "More from {artist}" is out of scope

`album`'s third block — a row of the artist's other albums, linking to the artist page — is new
surface area with no equivalent on either platform's `AlbumDetailScreen` today (the artist's
*own* page already has an "Albums" grid; this would be a second, redundant way to reach the same
content from one level down). §7 names it explicitly.

### Geometry / type table — MediaHeader values, both platforms

Identical component, identical values to `BOOK_DETAIL.md` §3 / `PODCAST_DETAIL.md` §3 (same
design source). Restated here as the contract line each implementation must satisfy:

| Token                        | Value                                                                              | Web (`-W`)                                                                                                     | Android (`-A`)                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Art tile size                 | 232px desktop / 208px compact, square                                              | **Missing entirely** — `MusicAlbumPage.tsx:144` uses a hardcoded `size={96}` `CoverImage`                        | **Already satisfied** — `MediaHeader.kt:97` (`232.dp`/`208.dp`), do not rebuild                                                       |
| Corner radius                 | `var(--radius-lg)` (`MaterialTheme.shapes.large` on Android)                       | **Missing entirely** — current `CoverImage` call passes no `style`, so it falls to `CoverImage`'s own default    | **Already satisfied** — `MediaHeader.kt:108`, do not rebuild                                                                          |
| Kind label                    | Small caps, muted, `"Album"`                                                       | **Missing entirely** — must add                                                                                   | **Already satisfied** — `kindLabel = "Album"` at call site (`:222`), do not rebuild                                                  |
| Title face/weight/size        | `var(--font-display)`, weight 900, `--h2-size` desktop / `--h4-size` compact       | **Missing entirely** — currently a bare `<h1>` (`:146`)                                                          | **Already satisfied** — `titleLarge`/`headlineMedium`, weight 900 per `SonoraTypography`, do not rebuild                             |
| Subtitle (artist)             | `var(--accent-ink)` **when linkable** (`albumArtistId` present), else plain muted  | **Missing entirely** — bare `<p>` (`:147`), never a link today                                                    | **Missing** — `MediaHeader.kt`'s `subtitle` is *always* plain, non-clickable text (`:155-163`); needs a new capability, see below     |
| Meta line                     | One muted line, composed (§5 defines the fields — **new on both platforms**)      | **Missing entirely** — must add                                                                                   | **Missing** — `MediaHeader.kt:91`'s `meta` param exists, call site passes nothing (`:218-232`); must wire                             |
| Muted colour role             | `--surface-fg-muted` (web) / `onSurfaceVariant` (Android)                          | Not yet applied (new)                                                                                              | **Already satisfied** — `MediaHeader.kt:100` uses `colorScheme.onSurfaceVariant`, do not rebuild                                      |
| Play / Shuffle actions        | Sonora's `MediaHeader` `actions` slot: filled "Play" + outlined "Shuffle"          | **Missing entirely** — must add (§6, new behaviour)                                                               | **Missing** — `MediaHeader.kt:93`'s `actions` slot exists, call site passes `null`; must wire                                        |

**Compose has no CSS-cascade fallback — name the placeholder and error painter for every image,
not just the happy path.** Already satisfied here and requiring no new work: `MediaHeader.kt`'s
own doc comment (`:65-70`) states Coil paints nothing while loading/on failure/when the model is
null, and the fallback icon renders underneath the `AsyncImage` so it always shows through. **The
`-A` wave does not need to redo this.** Web's equivalent risk — `CoverImage`'s fallback ignoring
a caller's `style` — was already fixed by `16e-podcast-W` (`CoverImage.tsx:56-77`, `style` is now
threaded through both the happy path and `CoverImageFallback`); **this triple inherits that fix
for free and must not treat it as still open.**

### The new capability `MediaHeader.kt` needs: a clickable subtitle

**Neither `BookDetailScreen` nor `PodcastDetailScreen` ever needed this** — `BOOK_DETAIL.md` §8
made the author link web-only on purpose (building an Android author screen was out of that
triple's scope), and `PODCAST_DETAIL.md` §8 found there is no publisher page on either platform
at all. Album is the **first** screen where both platforms already have a linkable target for
the subtitle (`MusicArtistPage.tsx` / `ArtistDetailScreen.kt` both already exist and are already
reachable from elsewhere — `TrackContextMenu`'s existing "Go to artist" action proves the route
works), so this is the first screen where Android's subtitle genuinely needs to become tappable.

**Add one new optional parameter to `MediaHeader.kt`**: `onSubtitleClick: (() -> Unit)? = null`.
When non-null, render `subtitle` in `AuralisAppTokens.current.accentInk` (`Color.kt:220`,
`LocalSonoraAppTokens` at `Color.kt:227` — already a `@Composable` static getter, readable from
anywhere under `AuralisTheme` with no new plumbing) with a `Modifier.clickable` calling it;
otherwise keep today's plain muted `Text`. This exactly mirrors Sonora's own stated rule
("`--accent-ink` + `cursor: pointer` when clickable... plain otherwise") and gives
`AuralisAppTokens.current.accentInk` its fifth production reader — `HANDOVER.md`'s 2026-08-18
entry already lists four (`SettingsScreen.kt`'s swatch ring/mode chip, both nav indicators); this
project's most-repeated failure is a writer with no reader, so name this explicitly as closing
one, not opening one.

**Web needs no equivalent change.** `MediaHeader.tsx`'s `subtitle` prop is already `ReactNode`
(`:71`), and `ItemPage.tsx:135-142` already shows the exact pattern to copy: a router `<Link>`
carrying both `MEDIA_HEADER_SUBTITLE_CLASS` and `MEDIA_HEADER_SUBTITLE_LINK_CLASS`
(`MediaHeader.tsx:56-57`), whose CSS (`app.css:370-390`) already styles the accent-ink/hover/focus
states. Nothing to add; only a call site to write.

---

## 4. What the BFF serves vs. what each client uses

**No single-item `GET /jellyfin/albums/:id` route exists** — confirmed by grep of
`apps/server/src/routes/jellyfin.ts:382-393`; `GET /jellyfin/albums` takes an `ids` filter and
both clients already call it with a one-element list (`useJellyfinAlbumQuery` on web,
`MusicRepository.albums(id=albumId, limit=1)` on Android) purely to get `favorite`/`artistId` —
exactly the same "no single-item route" situation `MusicAlbumPage.tsx`'s own doc comment
(`:1-7`) already states for `MusicArtistPage`. **No BFF change is needed for anything in this
spec** — the `Album` shape both clients already fetch (and already type) carries everything the
meta line and the artist link need:

- `packages/jellyfin-client/src/domain.ts:39-65`'s `Album` interface: `productionYear: number |
  null`, `genres: string[]`, `trackCount: number | null`, `artistId: string | null`, alongside
  the `favorite`/`artistId` fields both clients already read.
- `apps/web/src/api/types.ts:636-647`'s hand-mirrored `JellyfinAlbum` carries the identical
  fields.
- `apps/android/.../data/model/ApiModels.kt:785-797`'s `JellyfinAlbum` carries the identical
  fields.

**All three of `productionYear`/`genres`/`trackCount` are fetched today and silently discarded**
— both clients' single-album lookup (Android's `fetchAlbum()`, `AlbumDetailViewModel.kt:178-182`;
web's `albumQuery`) already receives the full `Album`/`JellyfinAlbum` object and only reads
`.favorite`/`.artistId` off it. This is not a new fetch, only new field reads off a response
already in hand.

**Track count for the meta line uses the pagination `total`, not `Album.trackCount`.** Both are
available; `Album.trackCount` is documented "best-effort" (`domain.ts:53`'s own comment — may be
null or wrong), while `total` (`tracksQuery.data.total` on web, `AlbumDetailUiState.Loaded.total`
on Android) is the authoritative count the pagination controls already trust. Using `total` also
means the meta line's track count agrees by construction with whatever "Load more"/Next
eventually shows — no risk of two different numbers on the same screen.

---

## 5. Fallback contract — what to omit when a field is absent

| Field                        | Rule                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover                         | tonal placeholder — already correct on Android (`MediaHeader`'s fallback icon); web gets it for free from `CoverImage`'s already-fixed fallback (§3)                                                                                                     |
| Artist / subtitle             | omit the subtitle line entirely if `artistName` is null (matches today on both platforms already)                                                                                                                                                          |
| Artist link                   | render as a plain, non-clickable subtitle when `artistId`/`albumArtistId` is null even though `artistName` is present — matches `BOOK_DETAIL.md`'s identical author-link fallback                                                                        |
| Year in meta                  | omit its segment if `productionYear` is null                                                                                                                                                                                                               |
| Genre in meta                 | use **only the first** `genres[0]`; omit the segment entirely if `genres` is empty. (Sonora's own example uses one genre; joining an unbounded list would make the meta line grow without limit for a heavily-tagged album — a deliberate simplification, not an oversight) |
| Track count in meta           | **always shown once the first page has loaded** — never omitted, including `"0 tracks"` for a genuinely empty album (same reasoning `PODCAST_DETAIL.md` §5 gives for its own always-shown unplayed count)                                                |
| Duration in meta              | **shown only when the whole album is a single page** — `total <= 40` (the shared page size, `MUSIC_PAGE_SIZE` on Android / `limit: 40` on web) **and** that one page is fully loaded. Otherwise omit the segment. Computing a total duration would otherwise mean fetching every page of a multi-page album purely to build one header string — a real, deliberate limitation, not silently glossed over. The overwhelming majority of real albums fit in one page, so this covers the common case. |
| Meta line, whole               | omit entirely if the album has zero tracks and no year/genre (nothing to show)                                                                                                                                                                             |
| Play / Shuffle                | **omit both entirely** when `tracks.length === 0` — nothing to play                                                                                                                                                                                        |
| Track list, empty              | `"No tracks found for this album."` — matches today's copy exactly on both platforms, keep it                                                                                                                                                              |

**Meta-line composition, stated once so both platforms build it the same way:**
`"{year} · {genre} · {n} {track|tracks} · {duration}"`, each segment present only per the table
above, joined with `·`, no separator artifacts if a segment is missing (same joining rule
`BOOK_DETAIL.md` §5 and `PODCAST_DETAIL.md` §5 both already specify). Duration reuses the app's
own existing "long" duration convention — `"{h} h {mm} m"` / `"{m} m"` sub-hour — **not**
Sonora's literal `"6 min"` unit spelling, matching `BookDetailViewModel.kt`'s own
`formatBookDurationLabel` (private, screen-scoped, `"19 h 07 m"`) and web's `itemMeta.ts`'s
`formatDurationLong` (`:20-26`). **Literal example, checkable against the real fixture**
(`fakeJellyfin.ts:117-123`, `music.spec.ts:122-139`): Driftwave, 2021, Synthwave, 2 tracks,
3:34 + 3:18 = 412s → `round(412/60) = 7` minutes →

```
"2021 · Synthwave · 2 tracks · 7 m"
```

A small pure function on each platform, screen-scoped (not shared globally — same "write it once,
test it directly, keep it screen-scoped" pattern both prior triples used): web adds a new file
under `features/music/` (e.g. `albumMeta.ts`), importing `formatDurationLong` from
`features/item/itemMeta.ts` rather than duplicating it; Android adds a private function inside
`AlbumDetailViewModel.kt` alongside its existing pure helpers, matching
`formatBookDurationLabel`'s own shape (`BookDetailViewModel.kt:233-238`) rather than trying to
reuse that one directly (it's `private` to a different file).

---

## 6. Behaviour contract — both platforms must satisfy this

**Precondition:** unchanged from today — this screen renders for one album's tracks regardless
of medium gating upstream (Music nav itself is hidden when Jellyfin isn't configured; see §2's
`Unconfigured` row for Android's own belt-and-braces state).

**Loading / empty / fetch-error states.** Keep exactly as today (§2's inventory) — none of these
need to change; this wave is additive plus the header restyle, not a rewrite of control flow
already working correctly.

**"Play" (new, both platforms).** A primary/filled button in the header, visible whenever
`tracks.length > 0` (§5). Tapping it starts the album's queue from the first loaded track,
through the **exact same** mechanism the first track row's own click already uses — web:
`playTrack(tracks[0])` (`MusicAlbumPage.tsx:87-139`); Android:
`playerViewModel.playQueue(buildQueue = { viewModel.buildQueueFrom(tracks.first()) }, fetchRemaining
= …)` (`AlbumDetailScreen.kt:130-135`). **Do not build a second playback path** — this is sugar
over the existing per-track action, nothing more. There is no "resume" concept for music tracks
in this app (no persisted per-track progress, unlike a book) — the button always reads "Play",
never "Resume", matching Sonora's own literal label.

**"Shuffle" (new, both platforms).** An outlined/secondary button beside Play, same visibility
rule. Tapping it does the **same** queue-start as Play, then immediately enables shuffle on the
freshly-started queue — web: `useMusicQueueStore.getState().toggleShuffle()`
(`musicQueueStore.ts:64-68`) called once right after `playTrack`; Android:
`playerViewModel.toggleShuffle()` (`PlayerViewModel.kt:1071-1077`) called once right after
`playQueue`. Both are safe to call unconditionally immediately after starting a **fresh** queue —
a newly-started queue always begins unshuffled (`musicQueue.ts:113`; Media3's own default), so
one `toggleShuffle()` call reliably turns shuffle *on*, never back off. **Do not build a separate
shuffled-queue-construction path** — reuse the app's one existing shuffle mechanism, the same one
`NowPlaying.tsx`'s/the Android now-playing surface's own shuffle control already drives.

**Track tap.** Unchanged: starts the queue from that track (§2's existing `playTrack`/
`onTrackClick` mechanism).

**Track position display — an existing, deliberate divergence from Sonora's mock, kept.**
Sonora's `trackItems` helper (`Auralis-Redesign.dc.html:546-550`) numbers rows `i + 1`,
sequentially, with no multi-disc concept — its fixture data has none. Both platforms' existing
`trackPosition`/`MusicTrackUi.position` logic ("D.N" once a second disc is present, "N"
single-disc, blank if Jellyfin never populated a track number) is real, tested behaviour for
real multi-disc albums that Sonora's mock simply doesn't need to represent. **Keep the existing
per-platform position logic unchanged** — do not switch to Sonora's naive sequential index. This
is the same class of call `BOOK_DETAIL.md` made keeping series/genres out of scope: the design's
silence on a case doesn't mean the case should regress.

**Currently-playing track — new, both platforms, and the mechanism already exists on each.**
Sonora's `TrackRow` has an `active` prop (`SONORA.md:507`); neither platform marks anything
today (§2). Both platforms already carry the data needed to compute it, through different
existing mechanisms — **name them, don't invent a new one**:

- **Android**: `PlayerUiState.Playing.musicItemId` (`PlayerViewModel.kt:101`) already carries
  "the Jellyfin item id of the currently-playing music track, `null` unless music is loaded" —
  built for the lyrics screen and already documented as exactly this kind of "is this screen's
  own item the one playing" check (`PlayerViewModel.kt:102-108`'s comment on the sibling
  `audiobookItemId` states the pattern explicitly). A track row is active when
  `track.id == playerUiState.musicItemId`.
- **Web**: no equivalent field exists yet, but the data does: `trackAt(tracks, currentTime)`
  (`features/player/playback.ts:30-39`) returns the `AudioTrack` playing at the player's current
  time, and for a Jellyfin music queue `AudioTrack.contentUrl` holds that track's own Jellyfin
  item id directly (`AudioTrack`'s own doc comment, `apps/web/src/api/types.ts:126-138`: "Jellyfin
  has no equivalent path shape, so `jellyfinSource` puts the track's own Jellyfin item id here
  directly"). A track row is active when
  `trackAt(usePlayerStore.getState().tracks, usePlayerStore.getState().currentTime)?.track
  .contentUrl === track.id`.

**Visual + accessible treatment of "active" reuses each platform's existing "current" idiom —
deliberately unequal, and both already meet the underlying requirement:**

- **Web**: `ListItem` already has a `selected` prop (`packages/ui/src/components/ListItem.tsx:26`)
  that applies both a visual treatment and `aria-current="true"` (`:68`, `:79`) — the exact
  mechanism `QueueView.tsx` already uses to mark the queue's current entry
  (`QueueView.tsx:31-35`, `:166`). Pass `selected={isActive}` on the track row's `ListItem`; no
  new styling to build. (`ListItem` itself still reads `--m3-*`, per `HANDOVER.md`'s
  `16c`-remaining-consumers list — that's separate, unclaimed migration work, not this triple's
  job; `selected` inherits whatever `ListItem` resolves to today.)
- **Android**: no `ListItem`-equivalent "selected" primitive exists. Reuse `QueueScreen.kt`'s own
  established convention instead (`QueueScreen.kt:108-117`): a trailing `Text("Now playing",
  style = MaterialTheme.typography.labelMedium)`, shown only when active. Same literal string,
  same style, applied to `TrackRow` (`AlbumDetailScreen.kt:281-327`).

Both are already-shipped, already-reviewed idioms on their own platform for exactly this concept
(marking "the current entry" in a list) — reusing them is preferred over inventing a third,
album-specific treatment. Name this pairing as **deliberately unequal** in the `-P` review (§8),
not as drift.

---

## 7. Explicitly out of scope

- **No "More from {artist}" row.** Sonora's mock includes one (§3); it is new surface area
  duplicating the artist page's own "Albums" grid one level up, and no BFF/client plumbing for
  "this artist's other albums, excluding this one" exists today. Out of scope; the artist link
  (§3, §6) is this triple's answer to "get to the artist," not a second row of album cards.
- **No unification of web's replace-per-page vs. Android's accumulate-via-Load-more pagination
  style** (§2). Pre-existing, not introduced by this wave, not this triple's job to fix.
- **No "resume where I left off" for the album/queue.** Music tracks carry no persisted
  per-track progress in this app (§6) — Play always starts from track 1.
- **No changes to `MusicArtistPage.tsx`/`ArtistDetailScreen.kt`** (the artist page itself),
  `MusicLibraryScreen`/`MusicHomePage.tsx` (the browse surfaces above this one), or
  `QueueView.tsx`/`QueueScreen.kt` (the now-playing queue surface this screen's "active" tracking
  borrows its idiom from, but does not modify).
- **No change to `GET /jellyfin/albums`'s or `GET /jellyfin/tracks`'s response shape.**
  Everything this wave needs is already served (§4). If a wave finds itself wanting a new BFF
  field, that's a sign this document missed something — come back to it rather than adding one
  unilaterally.
- **No visual-regression / screenshot testing** — `ROADMAP.md` §16 already names this gap
  project-wide.
- **No change to how "Add album to playlist" or the album favourite toggle are wired** — both
  keep their existing behaviour; only *where* they render may move (§9, §10) as a consequence of
  adopting `MediaHeader`.

---

## 8. Deliberately unequal

- **The currently-playing indicator's visual/accessible treatment stays platform-specific** (§6)
  — `ListItem`'s `selected`/`aria-current` on web, a literal "Now playing" trailing label on
  Android, each reusing that platform's own pre-existing idiom for "the current entry in a
  list." Both satisfy the same requirement (§11); named here so the `-P` review doesn't read the
  difference as drift.
- **Pagination style stays different** (§2, §7) — replace-per-page on web, accumulate-via-Load-more
  on Android. Pre-existing.
- **The artist link is NOT unequal here, unlike the book screen's author link.** Both platforms
  already have an artist detail screen and an existing route to it (`TrackContextMenu`'s "Go to
  artist" already works on both) — this is the first of the three detail-screen triples where the
  linkable-subtitle pattern is genuinely symmetric. If the `-P` review finds one platform shipped
  it and the other didn't, that is accidental drift, not idiom — flag it as such.

---

## 9. Web: adopting the existing `MediaHeader`, and the row's accessible name

**Adopt `apps/web/src/components/MediaHeader.tsx` on `MusicAlbumPage.tsx` — no extraction
needed**, unlike the two prior triples. The component already exists and already serves two call
sites; this is a third `<MediaHeader ... />` call, not new component work.

**Where favourite/add-to-playlist go is a real layout question `MediaHeader.tsx`'s current API
doesn't answer directly** — its props are `coverSrc, fallbackIcon, kindLabel, title, byline,
subtitle, meta, actions, footer` (`MediaHeader.tsx:59-79`); there is no header-row "trailing"
slot the way Android's `trailingContent` is. Two reasonable options, either is fine — the `-W`
agent's call:

1. Render the favourite toggle and add-to-playlist button inside `actions`, alongside the new
   Play/Shuffle buttons (four controls in one row/wrap group).
2. Add a small `trailingContent`-equivalent prop to `MediaHeader.tsx` mirroring Android's, if the
   four-controls-in-one-row layout reads badly at compact width.

Whichever is chosen, the favourite/add-to-playlist controls' own behaviour is unchanged (§7).

**Fix the track row's accessible name — a real, closable web-side gap, not just an Android one.**
`MusicAlbumPage.tsx:194`'s current `aria-label={`Play ${track.name}`}` **drops duration entirely**
from what a screen reader announces, and is inconsistent with the pattern this app already
shipped on the podcast screen. Replace it with the same shape
`PodcastDetailPage.tsx:222` already uses (`` `${episode.title}, ${formatPublishedAt(...)},
${formatDuration(...)}${stateLabel}` ``, no "Play" verb prefix): `` `${track.name}, ${duration}` ``
plus `, Playing` appended when `selected` is true (§6, §11). Literal example, against the real
fixture: `"Tidal Lines, 3:34"`, and `"Tidal Lines, 3:34, Playing"` when active.

---

## 10. Android: MediaHeader's new capability, wiring the header, and the coverage gap

**`MediaHeader.kt` needs one new capability** (§3): the `onSubtitleClick: (() -> Unit)? = null`
parameter, applying `AuralisAppTokens.current.accentInk` + `Modifier.clickable` when non-null.
This is shared infrastructure — after this wave, `BookDetailScreen`/`PodcastDetailScreen` remain
unaffected (they pass no `onSubtitleClick`, so nothing changes for them) but the capability
exists for any future screen that needs a linkable subtitle.

**Below that, `AlbumDetailScreen.kt`'s actual scope:**

1. **Wire the meta line** (§5) — `MediaHeader.kt:91`'s `meta` param already exists; the call site
   (`:218-232`) must pass the composed string, computed from the `Loaded` state's already-fetched
   `JellyfinAlbum` fields (§4) plus `total`.
2. **Wire the artist subtitle as a link** — pass `onSubtitleClick = { onGoToArtist(albumArtistId)
   }` when `state.albumArtistId` is non-null (§5's fallback: plain text when null). `onGoToArtist`
   already exists as a parameter on `AlbumDetailContent` (`:208`, already wired to
   `Routes.musicArtistDetail(id)` at `:177`) — reuse it, don't add a second navigation path.
3. **Wire Play/Shuffle** (§6) into `MediaHeader.kt:93`'s `actions` slot — a `Button` ("Play") and
   an `OutlinedButton` ("Shuffle"), each calling `playerViewModel.playQueue`/`toggleShuffle` as
   §6 specifies.
4. **Add the "Now playing" indicator** (§6) to `TrackRow` (`:281-327`) — the same literal string
   and style `QueueScreen.kt:108-117` already uses, shown when `track.id ==
   playerUiState.musicItemId`. `AlbumDetailScreen` (the `@Composable fun`, not `AlbumDetailContent`)
   already collects `playerUiState` (`:77`); thread the current music item id down to
   `AlbumDetailContent`/`TrackRow` the same way `onTrackClick` etc. already flow down.
5. **Merge each track row's semantics into one node** — `TrackRow`'s inner `Row` (`:308-318`,
   position + title + duration) currently has no `semantics(mergeDescendants = true)` at all
   (§2), mirroring the gap `16e-podcast-A` already closed on `EpisodeRow` and
   `BookDetailScreen.kt:298`'s `BookChapterRow` pattern before that. §11 states the exact
   contract; wrap that inner `Row`, not the whole `TrackRow` (the trailing "Add"/favourite
   buttons stay separate interactive elements, per `TrackRow`'s own existing doc comment
   `:270-280` on why they're siblings, not nested).

**New Robolectric coverage is a required deliverable, not optional — this is the whole reason
this screen was picked next.** Confirmed by directory listing:
`apps/android/app/src/testDebug/` has `BookDetailContentTest.kt`, `PodcastDetailContentTest.kt`,
`ForYouCarouselAccessibilityTest.kt`, `SettingsContentTest.kt`, `ComposeHarnessTest.kt`,
`ShellNavigationItemsTest.kt`, `MediaHeaderTest.kt`, `SonoraThemeTest.kt` — **no
`AlbumDetailContentTest.kt` exists.** This wave must add it, testing the stateless
`AlbumDetailContent` composable directly (already `private` — `:194`; change to `internal`, the
same step `16e-podcast-A` took for `PodcastDetailContent`). At minimum: the header renders with
the composed meta line and a clickable artist subtitle when `albumArtistId` is present; Play and
Shuffle are present/absent per §5's empty-album rule and each triggers the right call; the "Now
playing" label appears on exactly the row matching `musicItemId` and nowhere else; and each
track row's merged content description reflects title/duration/active state (mirroring
`MediaHeaderTest.kt` and `PodcastDetailContentTest.kt`'s own assertion shapes).

**The `LazyColumn` viewport trap, already paid for twice — write the tests scrolling from the
start.** `AlbumDetailContent` is already a `LazyColumn` (`:210`). `16e-book-A-2` broke three
`BookDetailContentTest` cases because a taller header pushed rows out of the composed viewport in
tests that didn't scroll first; `16e-podcast-A` avoided the same trap by scrolling to each target
from the outset, having been told to in advance. Do the same here — don't rediscover it a third
time.

**One fixture-uniqueness trap from the previous triple, worth restating:** give every fixture
field a distinct literal value. `16e-podcast-A`'s reviewer caught a case where two different
fixture fields shared the same string, making `onNodeWithText` ambiguous and failing with a bare
`AssertionError` rather than a useful message — cost a red CI round. Two Driftwave-style tracks
with different titles and durations (as the real fixture already has) sidesteps this by
construction; don't collapse them to make a test terser.

---

## 11. Accessibility requirements

- **The cover image is decorative** — matches `MediaHeader.kt`'s existing `contentDescription =
  null` on both the fallback icon and the `AsyncImage` (already correct on Android); web's
  `MediaHeader.tsx` already passes `alt=""` to `CoverImage` (`:102`) — no change needed there.
- **Play and Shuffle must announce what they do**, via their own text labels — no separate
  `contentDescription`/`aria-label` needed, matching every other text-labelled button in this app.
- **The artist link, when present, must announce as a link/button to the artist** — its own
  visible text ("The Nebula Collective") already serves as its accessible name on both platforms;
  no separate label needed, same convention `ItemPage.tsx`'s author link already uses.
- **Each track row must announce, at minimum: its title, its duration, and whether it's the one
  currently playing** — a new requirement, since today's rows don't even announce duration (§9).
  Literal examples: `"Tidal Lines, 3:34"`, and `"Tidal Lines, 3:34, Playing"` when active. Web
  gets this via the `aria-label` fix in §9; Android gets it via the merged
  `semantics(mergeDescendants = true)` in §10, item 5.
- **The currently-playing indicator must not be visual-only** — folded into the row's own
  accessible name (above) on both platforms, not left to `aria-current`/a lone trailing label
  that a screen reader might not surface as part of the row.
- **Track position (the "N"/"D.N" number, §6) is not required in the announced name** — it's
  already implicit in list order, matching how neither the book screen's chapter index nor the
  podcast's episode order is separately announced.

---

## 12. Two constraints both implementing waves inherit

- **Only one `-W` wave can run Playwright at a time on this machine** — `playwright.config.ts`'s
  hardcoded port 4310, `HANDOVER.md`'s "Two agents cannot both run Playwright here." Check before
  dispatching `16e-album-W` alongside anything else that needs a browser.
- **Nothing on this machine compiles Kotlin.** Budget two-to-three red Android CI rounds. Two
  compiler-free pre-checks cost nothing and measurably reduce them: balanced `/*`/`*/` counts per
  changed `.kt` file, and no `.` inside a backtick test name.
