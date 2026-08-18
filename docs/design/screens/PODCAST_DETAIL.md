# Podcast detail — shared behaviour spec (wave 16e-podcast)

Status: **spec only, nothing implemented against it yet.** This is the shared spec both
`16e-podcast-W` (web) and `16e-podcast-A` (Android) build from, independently, followed by a
`16e-podcast-P` parity review by an agent that wrote neither half. Per `ROADMAP.md` §16, this is
the second screen triple, chosen ahead of Music/Album because podcasts are the user's stated
priority 2 (music is 3) and because the `CoverImage` fallback-style defect `16e-book-P` named has
its live instance on this screen (§9).

This document describes **behaviour and structure**, not a React tree or a Compose tree. Where the
design (`docs/design/SONORA.md`, `docs/design/sonora/`) doesn't cover something, that is stated
explicitly rather than invented — per the correction `16e-book-P` recorded, every geometry/type
value is in an explicit per-platform table (§3), not buried in prose.

**This triple is asymmetric, and both waves must read this before doing anything else.** Android's
header half is **already done** — `16e-book-A-2` (commit `6b6a173`) built a shared `MediaHeader`
composable and **already adopted it on `PodcastDetailScreen.kt`** (confirmed by reading the file:
`ui/components/MediaHeader.kt` is imported and called at `PodcastDetailScreen.kt:143`). The `-A`
wave's job is what's _below_ the header, plus the meta line, plus new Robolectric coverage — **not**
rebuilding the header. Web has no shared header yet; `16e-book-W` restyled `ItemPage.tsx` in place,
so `-W`'s job includes **extracting** a shared header component and adopting it here.

---

## 1. What the screen is for

Podcasts are the user's stated priority 2. This is the screen reached after tapping a podcast
(a "show", in podcast-industry terms) anywhere in the app — the podcasts library list, a shelf card,
search. Its job is:

1. **Show enough about the show to decide what to listen to** — who publishes it, how many
   episodes it has, what it's about.
2. **Play any episode in one tap**, and see which ones are already played or in progress.
3. **Start the newest episode in one tap** without hunting for it in the list (new, §6).
4. **Order the episode list** newest-first or oldest-first.

It is a detail page for one show's episode list, not an episode's own detail page. **Sonora's design
draws these as two separate screens** — `show` (this one: header + episode list) and `episode` (a
single episode's own header, notes and chapter list) — see §3's design-source note. **This app has
never had a per-episode page on either platform**: tapping an episode starts playback directly, with
no intermediate screen. That is unchanged by this wave; §7 states it as an explicit scope line so
neither implementing wave invents an episode page.

---

## 2. Content inventory — what each platform shows today

**Evidence.** Web: `apps/web/src/features/podcasts/PodcastDetailPage.tsx` (208 lines, read in
full). Android: `apps/android/app/src/main/java/net/develivarr/auralis/features/podcasts/PodcastDetailScreen.kt`
(219 lines, read in full) plus `ui/components/MediaHeader.kt` (183 lines, read in full).

| Content / control                   | Web today                                                                                                | Android today                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Route                               | `/podcast/$itemId` (own component, not `ItemPage`)                                                       | `PodcastDetailScreen`, reached from `PodcastsScreen`'s "My podcasts" list                                                         |
| Cover art                           | `CoverImage`, 200px, `podcasts` fallback icon, **pre-Sonora inline style** (`:106-119`)                  | `MediaHeader` — **already Sonora-styled** (232dp/208dp, `shapes.large`, fallback icon underlay)                                   |
| Title                               | `<h1>{item.media.title}</h1>` (`:121`), plain, no Sonora type scale applied                              | `MediaHeader`'s `title` slot — **already Sonora type scale** (weight 900, `--h2`/`--h4`)                                          |
| Author / publisher                  | `<p>{item.media.author}</p>` if present (`:122`), plain text, no muted styling                           | `MediaHeader`'s `subtitle` slot, muted — **already styled**                                                                       |
| Kind label                          | **not shown**                                                                                            | `MediaHeader`'s `kindLabel = "Podcast"` — **already shown, uppercase, muted**                                                     |
| Meta line (episode/unplayed counts) | **not shown**                                                                                            | **not shown** — `MediaHeader(meta = …)` param exists but `PodcastDetailScreen` passes nothing                                     |
| Primary action ("Play latest")      | **not present anywhere on this page**                                                                    | **not present** — `MediaHeader`'s `actions` slot exists but is passed `null`                                                      |
| Description                         | `RichDescription`, full text, no clamp (`:126-130`)                                                      | Plain `Text` below the header, `bodyMedium`, no Sonora restyle (`:151-153`)                                                       |
| Episode order toggle                | Two `Chip` (`variant="filter"`), "Newest first"/"Oldest first", both selectable (`:143-153`)             | One `Button` that flips label to name the _destination_ state (`:167-171`) — different control shape                              |
| Episode row: title                  | `ListItem` `headline` (`:173`)                                                                           | Plain `Text`, `titleSmall` (`:196`)                                                                                               |
| Episode row: date                   | `ListItem` `overline`, `formatPublishedAt` (`:174`)                                                      | Joined into one `Text` line with duration/progress (`:197-200`)                                                                   |
| Episode row: duration               | `ListItem` `supportingText`, `formatDuration` — clock format e.g. `"54:00"` (`:175-181`)                 | Same clock format, joined line (`:198`)                                                                                           |
| Episode row: progress               | Appended to `supportingText`: `" · Played"` / `" · In progress"` / nothing (`:176-180`)                  | Same three-state suffix, same wording (`episodeProgressSuffix`, `:214-218`)                                                       |
| Episode row: status icon            | `Icon("check")` if played, `Icon("play")` otherwise, `Skeleton` while pending (`:182-190`)               | **none at all** — no icon, no pending indicator                                                                                   |
| Episode row: a11y                   | `ListItem` merges headline/overline/supportingText into one accessible unit (established pattern)        | **No merged semantics** — two bare `Text` composables inside a `.clickable` (`:189-201`), no `semantics(mergeDescendants = true)` |
| Play error                          | Inline `role="alert"` per-episode, under the failing row (`:195-199`)                                    | None inline — surfaces as a `PlayerUiState.Error` snackbar at screen level (`:81-86`)                                             |
| Empty episode list                  | `<p>This podcast has no episodes yet.</p>` (`:158`)                                                      | `Text("This podcast has no episodes yet.")` (`:174`) — same copy                                                                  |
| Loading state                       | `<p>Loading…</p>` (`:57-61`)                                                                             | `CircularProgressIndicator` (`:93-99`)                                                                                            |
| Not-a-podcast state                 | Inline `role="alert"` message (`:71-77`)                                                                 | Inline error `Text` (`:107-113`)                                                                                                  |
| Fetch error state                   | `itemQuery.isError` throws to `RouteErrorBoundary` (`:64-66`), matching `ItemPage.tsx`'s pattern exactly | Inline error `Text`, `PodcastDetailUiState.Failed` (`:100-106`)                                                                   |

**Correction to an earlier draft of this recon, left visible rather than silently fixed.** This
document first claimed web's fetch-error throw was missing here, unlike `ItemPage`. That was wrong
— re-checked directly against the file: `PodcastDetailPage.tsx:64-66` already has
`if (itemQuery.isError) throw itemQuery.error;`, with a comment stating it matches `ItemPage`'s own
reasoning. **There is no fetch-error defect on this screen — do not "fix" it.** §6 does not carry
this as a line item because there is nothing to change.

---

## 3. The Sonora treatment

**Authority: `docs/design/sonora/Auralis-Redesign.dc.html`**, read directly (not the prose docs
about it). **Important design-source finding, not previously recorded**: Sonora specifies **two**
separate screens here, not one —

```js
show: [
  { isHeader: true, kindLabel: 'Podcast', playLabel: 'Play latest', secondLabel: 'Unsubscribe',
    headTitle: 'Tech Media Collective', headArtist: '128 episodes · weekly',
    meta: 'Auto-download on · 3 unplayed' },
  { hasHeading: true, title: 'Episodes', isTracks: true, items: trackItems(EPISODES, { onSelect: () => this.go('episode') }) },
  { hasHeading: true, title: 'From the Feed', isGrid: true, items: [ /* feed episodes not yet on the server */ ] },
  { isNote: true, note: 'Feed episodes are not on your Audiobookshelf server yet — subscribing pulls them in.' },
],
episode: [
  { isHeader: true, kindLabel: 'Episode', playLabel: 'Resume', secondLabel: 'Download',
    headTitle: 'Self-hosting in 2026', headArtist: 'Tech Media Collective', onArtist: () => this.go('show'),
    meta: 'Published 12 Aug · 54 min · 22 min left' },
  { isNote: true, note: '…' },
  { hasHeading: true, title: 'Chapters', isTracks: true, items: trackItems([...], { activeIndex: 1 }) },
  { hasHeading: true, title: 'More from Tech Media Collective', … },
],
```

**This spec covers only `show`.** `episode` is a separate, single-episode detail screen with its
own chapter list and "more from this show" row — genuinely new surface area with no equivalent on
either platform today, and out of scope here (§7). Sonora's screenshot of it (`episode.png`) was
**never vendored into this repo** — `docs/design/SONORA.md` §9 names it explicitly as viewed by the
orchestrator's design-tool session but not saved, so no session without design-tool access (every
subagent, including both `-W` and `-A`) can see it. That is a second, independent reason `episode`
is out of scope for this wave, not just a scoping call.

### Structure — the `show` screen

Two stacked blocks, top to bottom, inside the docked content scroll area:

1. **`MediaHeader`** (`docs/design/sonora/components/MediaHeader.dc.html`) — same component as the
   book screen, `round: false` (square, not the circular artist/author-avatar variant).
2. **"Episodes"** — a heading followed by a track-row list, `trackItems(EPISODES, { onSelect })`.
   `TrackRow` is one of six Sonora primitives **not yet vendored**
   (`docs/design/sonora/primitives/README.md`'s "six still to vendor" list) — same situation
   `BOOK_DETAIL.md` §3 already documented for chapters. Fall back to each platform's existing
   row shape (web: `ListItem`; Android: a bespoke row composable matching `BookDetailScreen.kt`'s
   private `BookChapterRow` pattern) rather than inventing a new primitive.

**"From the Feed" and its note are explicitly out of scope** (§7) — see below.

### Geometry / type table — MediaHeader values, both platforms

Identical to `BOOK_DETAIL.md` §3's table (same component, same design source). Stated again here
per the correction that a number must be a contract line, not something to re-find in another doc:

| Token                          | Value                                                                              | Web (`-W`)                                                                                                        | Android (`-A`)                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Art tile size                  | 232px desktop / 208px compact, square                                              | Not yet applied — `ItemPage.tsx` has it (`--radius-lg`); this page has hardcoded `size={200}` and `--m3-shape-lg` | **Already satisfied** — `MediaHeader.kt:97` (`232.dp`/`208.dp`), do not rebuild                                  |
| Corner radius                  | `var(--radius-lg)` (`MaterialTheme.shapes.large` on Android)                       | Not yet applied — currently `var(--m3-shape-lg)`                                                                  | **Already satisfied** — `MediaHeader.kt:108`, do not rebuild                                                     |
| Kind label                     | Small caps, muted, `"Podcast"`                                                     | **Missing entirely** — must add                                                                                   | **Already satisfied** — `kindLabel = "Podcast"` at call site, do not rebuild                                     |
| Title face/weight/size         | `var(--font-display)`, weight 900, `--h2-size` desktop / `--h4-size` compact       | Not yet applied — currently a bare `<h1>` with no Sonora classes                                                  | **Already satisfied** — `titleLarge`/`headlineMedium`, already weight 900 per `SonoraTypography`, do not rebuild |
| Subtitle (author/publisher)    | `var(--accent-ink)` if linkable, else plain muted; `--text-lg`/`--text-md`         | Not yet applied — bare `<p>`, no link (podcasts have no author page on either platform, see §4)                   | **Already satisfied** — `subtitle` slot, muted, no link (matches; podcasts never link), do not rebuild           |
| Meta line                      | One muted line, composed (§5 defines the exact fields — **new on both platforms**) | **Missing entirely** — must add                                                                                   | **Missing** — `MediaHeader.kt:91`'s `meta` param exists, call site passes nothing; must wire                     |
| Muted colour role              | `--surface-fg-muted` (web) / `onSurfaceVariant` (Android)                          | Not yet applied                                                                                                   | **Already satisfied** — `MediaHeader.kt:100` uses `colorScheme.onSurfaceVariant`, do not rebuild                 |
| Primary action ("Play latest") | Sonora's `MediaHeader`'s primary button slot                                       | **Missing entirely** — must add (§6, new behaviour)                                                               | **Missing** — `MediaHeader.kt:93`'s `actions` slot exists, call site passes `null`; must wire                    |

**Compose has no CSS-cascade fallback — name the placeholder and error painter for every image, not
just the happy path.** This is already satisfied here: `MediaHeader.kt`'s own doc comment
(`:65-70`) states Coil paints nothing while loading/on failure/when the model is null, and the
fallback icon is rendered _underneath_ the `AsyncImage` so it always shows through. **The `-A` wave
does not need to redo this** — it is inherited by adopting `MediaHeader`, which is already done. The
`-W` wave _does_ need to check the equivalent risk on web — see §9, the `CoverImage` defect.

---

## 4. What the BFF serves vs. what each client uses

**Route:** `GET /items/:id?expanded=true&include=progress` — the **same route** `ItemPage`/`GET
/items/:id` uses (confirmed: `apps/web/src/features/podcasts/PodcastDetailPage.tsx`'s own doc
comment states it reuses `useItemQuery` unchanged; `PodcastDetailViewModel.kt`'s doc comment states
the Android side mirrors this). **No BFF change is needed for anything in §2's inventory or the
meta-line/play-latest additions in §5–6** — episode count and per-episode progress state are already
in the response both platforms already parse.

**What Sonora's mock shows that this app cannot serve, and why it's out of scope (§7):**

- `headArtist: '128 episodes · weekly'` — the **episode count** is derivable client-side
  (`episodes.length`), but the **publish frequency** ("weekly") is not computed anywhere in this
  codebase, on either the BFF or either client. No route returns it.
- `meta: 'Auto-download on · 3 unplayed'` — the **unplayed count** is derivable client-side (count
  episodes whose progress state isn't `played`), but **auto-download's current on/off state** is
  not read anywhere today. `apps/server/src/routes/schemas.ts:217`'s `autoDownloadEpisodes` is a
  **subscribe-time** field (`POST /podcasts`, confirmed by grep of `subscribeMetadata.ts` and
  `SubscribeBody.kt`) with **no route to read or change it after subscribing**.
- `secondLabel: 'Unsubscribe'` — **there is no unsubscribe/remove-podcast route at all.** Confirmed
  by grep: `apps/server/src/routes/podcasts.ts` has no `DELETE` handler. Building one is a real
  feature (confirmation flow, what happens to already-downloaded episodes, navigation after
  deletion) and is out of scope for a screen-restyle wave.
- The `"From the Feed"` block — episodes present in the podcast's RSS feed but not yet imported into
  Audiobookshelf. This app has no feed-polling/preview mechanism reachable from an already-subscribed
  podcast's detail page (`PodcastFeedPreview.tsx` exists but is part of the **subscribe-a-new-podcast**
  flow, not this screen). Out of scope.

**What this wave _can_ build from data already in hand — the meta line and "Play latest":**

- **Episode count** and **unplayed count** are both cheap: `episodes.length` and a count over each
  episode's already-computed `EpisodeProgressState`/`episodeProgressState()`. §6 specifies exactly
  how to compose them into the meta line.
- **"Play latest"** needs no new endpoint: sort episodes newest-first (`sortEpisodes`/
  `EpisodeOrder.NEWEST`, both already exist) and call the **same** per-episode play path
  (`handlePlayEpisode`/`playerViewModel.playEpisode`) every episode row already uses, on that
  episode's id. §6 specifies exactly.

---

## 5. Fallback contract — what to omit when a field is absent

Mirrors `BOOK_DETAIL.md` §5's shape and its meta-line joining rule (whichever fields are present,
joined with `·`, no separator artifacts, in the stated order):

| Field                  | If absent                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover                  | tonal placeholder — already correct on Android (`MediaHeader`'s fallback icon); web must fix `CoverImage`'s fallback style (§9)                                                  |
| Author / publisher     | omit the subtitle line entirely — matches today's behaviour on both platforms already                                                                                            |
| Description            | render nothing — matches `RichDescription`'s existing null-degrade / Android's existing `?.let`                                                                                  |
| Episode count in meta  | omit — episodes.length is always computable once the item has loaded, so this only applies pre-load                                                                              |
| Unplayed count in meta | **always shown once episodes are known**, including `0` (a real "you're caught up" state, not an absent field — same reasoning `BOOK_DETAIL.md` §5 applies to `progressPercent`) |
| Meta line, whole       | omit entirely (no `·` artifacts) if the podcast has zero episodes                                                                                                                |
| Episode list           | `"This podcast has no episodes yet."` — matches today's copy exactly on both platforms, keep it                                                                                  |
| "Play latest" button   | **omit entirely** when `episodes.length === 0` — nothing to play                                                                                                                 |

**Meta-line composition, stated once so both platforms build it the same way:**
`"{n} {episode|episodes} · {u} unplayed"` — e.g. `"128 episodes · 3 unplayed"`, `"1 episode · 0
unplayed"`. A small pure function, tested directly with the empty-episodes case (function returns
`null`/omits the whole line), the singular-count case, and the zero-unplayed case — same "write it
once, test it directly" instruction `BOOK_DETAIL.md` §5 gave for `composeItemMeta`. Web should add
this alongside `itemMeta.ts`'s existing `composeItemMeta`/`formatDurationLong` (a new file in
`features/podcasts/`, not a modification to the book-only `itemMeta.ts`); Android should add it
alongside `PodcastDetailViewModel.kt`'s existing pure helpers (`episodeProgressState`,
`sortEpisodes`-equivalent), not inside `MediaHeader.kt` itself.

---

## 6. Behaviour contract — both platforms must satisfy this

**Precondition:** this screen renders for `item.media.kind === 'podcast'` only — matches both
platforms' existing guard.

**Loading / not-a-podcast / episode-list-empty / fetch-error states.** Keep exactly as today (§2's
inventory) — none of these need to change; this wave is additive plus the header restyle, not a
rewrite of control flow already working correctly. (An earlier draft of this document claimed web's
fetch-error handling needed a fix; it did not — see §2's correction note. Do not add anything here.)

**"Play latest" (new, both platforms).** A primary button in the header, visible whenever
`episodes.length > 0` (§5). Tapping it: sort episodes newest-first, take the first, and call the
**exact same** episode-play path every episode row already calls
(`handlePlayEpisode(episode.id)`/`playerViewModel.playEpisode(itemId, episodeId)`) with that
episode's id. **Do not build a new "play the show" endpoint or player concept** — this is
sugar over an existing per-episode action, nothing more. Loading/error state on this button follows
the same pattern the per-episode play affordance already has on each platform (web: reuse the
existing `pendingEpisodeId`/`playError` state machine by treating "play latest" as playing that
episode's id; Android: reuse `playerViewModel.playEpisode`'s existing snackbar-on-error path).

**Episode order.** Keep both platforms' existing toggle mechanisms (web: two `Chip`s; Android: one
button naming the destination state) — **this is a legitimate, already-reviewed divergence**
(`PodcastDetailScreen.kt:162-166`'s own comment explains the Android choice and why it's not
equivalent-but-different), not something this wave should unify. Name it in the `-P` review as
idiom, not drift.

**Episode tap.** Unchanged: starts playback of that episode directly. No intermediate page (§1, §3).

**Episode row status affordance — a real Android gap to close.** Web already shows a check icon
(played), play icon (unplayed/in-progress), or a loading skeleton (pending) per row (§2). Android
shows none of this today. **Add the Android equivalent**: an `Icon` matching the same three states
(a checkmark for played, a play glyph otherwise) plus a loading indicator while that specific
episode's play request is in flight — mirroring web's `isPending`/`pendingEpisodeId` state shape,
not a new design. This is a content-parity fix, not a visual nicety; do not skip it as "Android
idiom."

---

## 7. Explicitly out of scope

- **No `episode` (single-episode) detail screen**, on either platform. Sonora specifies one (§3)
  but it is genuinely new surface area with no vendored screenshot to build against (§3) and no
  existing precedent on either client. Tapping an episode continues to start playback directly.
- **No "From the Feed" section, no feed-preview-from-an-existing-podcast's-page.** No BFF route
  serves it and building one is a distinct feature (§4).
- **No unsubscribe / remove-podcast action.** No BFF route exists (§4); building one needs its own
  confirmation-flow and data-lifecycle design, not a screen restyle.
- **No auto-download toggle or its on/off display in the meta line.** No route reads or writes it
  today beyond subscribe time (§4). The meta line uses episode/unplayed counts only (§5, §6).
- **No publish-frequency ("weekly") display.** Not computed anywhere in this codebase (§4).
- **No download / offline action for podcasts on either platform.** Confirmed by grep: Android's
  `DownloadRepository` has call sites only in `apps/android/.../features/books/` — podcasts have no
  download wiring at all today, unlike the book screen where it already existed. Building it is out
  of scope here; this is a real, larger gap than the book screen's "Android has it, web doesn't"
  asymmetry, and is not this wave's to close.
- **No changes to the Podcasts _library_ screen** (`PodcastsScreen.kt`/whatever web's equivalent
  browse surface is) or to the podcast-subscribe/discover flow (`PodcastDiscoverPage.tsx`,
  `PodcastFeedPreview.tsx`, `SubscribeBody.kt`) — all separate screens, out of scope.
- **No visual-regression / screenshot testing** — `ROADMAP.md` §16 already names this gap
  project-wide.
- **No change to `GET /items/:id`'s response shape.** Everything this wave needs is already served
  (§4). If a wave finds itself wanting a new BFF field, that's a sign this document missed
  something — come back to it rather than adding one unilaterally.

---

## 8. Deliberately unequal

- **The episode-order control shape stays different** (§6) — two chips on web, one toggle button on
  Android. Pre-existing, already reasoned about in the Android source, not a defect.
- **Nothing else is expected to diverge.** Unlike the book screen (author-link web-only, download
  Android-only), this triple has no BFF-backed asymmetry to encode — download doesn't exist for
  podcasts on either platform (§7), and there is no author/publisher detail page on either platform
  to link to (podcasts have a publisher _name_, not a linkable entity in this app's data model —
  confirmed: `item.media.author` is a flat string on both `MediaSummary`/`PodcastDetailUiData`, not
  a structured, id-bearing reference like a book's `authors[]`). If the `-P` review finds an
  unplanned divergence, that is accidental drift, not idiom, and should be named as such.

---

## 9. Web: header extraction, and the `CoverImage` defect

**Extract a shared header component from `ItemPage.tsx`'s restyled markup** (its
`.auralis-item-header`/`__meta`/`__kind`/`__title`/`__byline`/`__subtitle`/`__subtitle--link`/
`__meta-line`/`__actions` block, `ItemPage.tsx:124-174`, and the matching CSS at
`apps/web/src/styles/app.css:306-411`) and adopt it here, the same relationship
`16e-book-A-2` already established on Android with `MediaHeader.kt`.

**Location: `apps/web/src/components/`, not `packages/ui`.** Checked before ruling: `apps/web/src/components/`
already exists and holds app-specific, non-generic pieces (`CoverImage.tsx`, `RichDescription.tsx`)
— exactly this component's shape, a header that composes this app's own routing (`Link` to
`/author/$authorId`) and this app's own screen-scoped types, not a generic design-system primitive.
Putting it in `packages/ui` instead would pull it into that package's barrel export — this repo's
own `sideEffects`/entry-chunk history (`HANDOVER.md` §14a) shows that barrel membership has real
weight and CSS-delivery-timing consequences, plus it would need a gallery entry and `e2e/ui`
coverage neither the book screen's header nor this one need. **Do not put it in `packages/ui`
without a concrete reason found while doing the extraction** — the default is `apps/web/src/components/`.

The extracted component needs to serve **two shapes**: the book screen passes an author subtitle
that's sometimes a link (real id) and always has actions (Play/Download) plus chapters below; the
podcast screen passes a plain-text subtitle (no publisher page exists, §8) and a "Play latest"
action (§6) plus an episode list below. Model the component's props after what `MediaHeader.kt`'s
Kotlin equivalent already settled (`coverUrl`, `imageLoader`-equivalent n/a on web, `fallbackIcon`,
`kindLabel`, `title`, `subtitle` as either plain text or a link element, `meta`, an `actions` slot) —
it is already proven to serve three call sites on Android; reuse that shape rather than inventing a
new one.

**The `CoverImage` fallback-style defect, confirmed live on this screen.** `16e-book-P` named this;
recon for this wave confirmed it by reading the component directly
(`apps/web/src/components/CoverImage.tsx`). `CoverImage`'s happy-path `<MantineImage>` applies the
caller's `style` prop (`:74`, `style={{ borderRadius: BORDER_RADIUS, objectFit: 'cover', ...style }}`),
but its **fallback** — `CoverImageFallback`, rendered when the image fails to load (`:65`) — calls
`fallbackStyle(size)` (`:39-50`), which hardcodes `borderRadius: BORDER_RADIUS` (`8`, a pre-Sonora
literal, `:37`) and a `--m3-*` background token, and **takes no `style` parameter at all**. So a
caller passing `style={{ borderRadius: 'var(--radius-lg)', background: 'var(--surface-card)' }}` —
exactly what `ItemPage.tsx:134-140` already does, and what this screen's header extraction must also
do — gets the Sonora radius on the happy path and the **old 8px pre-Sonora radius on the fallback
path**. This is invisible in an environment where covers decode successfully, which is exactly why
it survived `16e-book-W` unnoticed.

**Fix it as part of this wave**, since the header extraction is already touching this exact call
site. Either give `CoverImageFallback`/`fallbackStyle` a `style` parameter and thread it through from
`CoverImage`, or have `CoverImage` apply the caller's border-radius/background at the wrapping level
so both paths inherit it — the `-W` agent's call which shape is cleaner, but **the fix must be made**
and **an assertion must cover the fallback path specifically** (force `onError`, or render
`CoverImageFallback` directly with a `style` prop and assert the resolved radius) — a happy-path-only
test passes today and would keep passing with the defect intact.

---

## 10. Android: what's left below the header, and the coverage gap

**Do not rebuild `MediaHeader` or its adoption on this screen — both are done** (§2, §3's table).
The `-A` wave's actual scope:

1. **Wire the meta line** (§5, §6) — `MediaHeader.kt:91`'s `meta` param already exists; the call
   site at `PodcastDetailScreen.kt:143-150` must pass the composed string.
2. **Wire "Play latest"** (§6) into `MediaHeader.kt:93`'s `actions` slot (or a sibling `Row`
   immediately below the `MediaHeader` call, matching how `BookDetailContent`'s Play/Download row
   is placed — either is fine, see that file's own pattern).
3. **Add the episode row status icon/pending-indicator** (§6) — a real content-parity fix, not
   optional polish.
4. **Merge each episode row's semantics into one node**, mirroring `BookDetailScreen.kt`'s private
   `BookChapterRow`'s `semantics(mergeDescendants = true) { contentDescription = … }` pattern
   (`BookDetailScreen.kt:298`) — today's `EpisodeRow` (`PodcastDetailScreen.kt:184-202`) has no
   merged semantics at all, so a screen-reader user steps through title and date/duration/progress
   as separate, disconnected nodes. §11 states the exact contract.

**New Robolectric coverage is a required deliverable, not optional.** Confirmed by directory
listing: `apps/android/app/src/testDebug/` has `BookDetailContentTest.kt`,
`ForYouCarouselAccessibilityTest.kt`, `SettingsContentTest.kt`, `ComposeHarnessTest.kt`,
`ShellNavigationItemsTest.kt`, `MediaHeaderTest.kt`, `SonoraThemeTest.kt` — **no
`PodcastDetailContentTest.kt` and no `AlbumDetailContentTest.kt` exist**. `HANDOVER.md`'s claim that
these two screens "have no Robolectric coverage at all" is confirmed true by directory listing, not
assumed. **This wave must add `PodcastDetailContentTest.kt`**, following `BookDetailContentTest.kt`'s
established pattern (test the stateless `PodcastDetailContent`-equivalent composable directly, not
the ViewModel-backed screen — extract an `internal` content composable the same way
`BookDetailContent` is `internal`, not `private`, if `PodcastDetailContent` isn't already
`internal`; confirmed it currently is `private` at `PodcastDetailScreen.kt:128`, so this needs
changing to `internal` as part of the wave). At minimum: the header renders with the composed meta
line, "Play latest" is present/absent per §5's fallback rule and tapping it plays the newest episode,
and each episode row's merged content description reflects its title/date/duration/progress state
(mirroring `MediaHeaderTest.kt` and `BookDetailContentTest.kt`'s own assertion shapes).

**One trap already paid for on `16e-book-A-2`, worth restating so it isn't rediscovered:** the
header got taller when the earlier wave adopted `MediaHeader`, and `BookDetailContent`'s `LazyColumn`
meant chapter rows fell outside the composed viewport in tests that didn't scroll first — three
`BookDetailContentTest` cases broke and were fixed by scrolling to each target before asserting. If
this screen's own `LazyColumn` has the same shape (it does — `PodcastDetailContent` is already a
`LazyColumn`, `PodcastDetailScreen.kt:136`), **write the new tests scrolling to their targets from
the start** rather than discovering the same failure mode again.

---

## 11. Accessibility requirements

- **The cover image is decorative** — matches `MediaHeader.kt`'s existing `contentDescription =
null` on both the fallback icon and the `AsyncImage` (already correct on Android); web's header
  extraction must carry the equivalent `alt=""` forward from `ItemPage.tsx:131`/`PodcastDetailPage.tsx:108`.
- **"Play latest" must announce what it does**, via its own text label (matches how every other
  text-labelled button in this app already gets its accessible name — no separate
  `contentDescription`/`aria-label` needed).
- **Each episode row must announce, at minimum: its title, its publish date, its duration, and its
  played/in-progress/unplayed state** — mirroring `ChapterList.tsx`/`BookChapterRow`'s existing
  merged-announcement pattern (`BOOK_DETAIL.md` §6, `BookDetailScreen.kt:298`). Web's `ListItem`
  already does this by construction (headline + overline + supportingText compose into one
  accessible unit, an established pattern — no change needed there). **Android must add it** (§10,
  item 4) — this is the concrete accessibility gap this wave closes, not a restated requirement.
- **The status icon (checkmark/play/pending) must not be the only signal of played state** — the
  text-based " · Played"/" · In progress" suffix already carries this on both platforms and must
  stay; the icon is a visual reinforcement, not a replacement.

---

## 12. Two constraints both implementing waves inherit

- **Only one `-W` wave can run Playwright at a time on this machine** — `playwright.config.ts`'s
  hardcoded port 4310, `HANDOVER.md`'s "Two agents cannot both run Playwright here". Check before
  dispatching `16e-podcast-W` alongside anything else that needs a browser.
- **Nothing on this machine compiles Kotlin.** Budget two-to-three red Android CI rounds. Two
  compiler-free pre-checks cost nothing and measurably reduce them: balanced `/*`/`*/` counts per
  changed `.kt` file, and no `.` inside a backtick test name.
