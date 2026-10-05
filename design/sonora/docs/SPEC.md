# Spotify affordance pass — authoring spec

Source of truth for the wave that adds Spotify-observed **affordances** to Sonora.
Read this before writing any component. Every decision below is already made; do not re-litigate.

## What this wave is, and is not

Sofia supplied 32 screenshots of the Spotify Android client. The instruction, verbatim:

> "The idea is not to copy spotify's visual design, but moreso the affordances of the components.
> For instance, new search bar components are not needed."

So: **an affordance is a capability the interface offers the user** — audition before committing,
see why this shelf is here, mark an episode saved, know you are offline. It is not a colour, a
corner radius, or a brand mark. Where Sonora already offers the affordance, we use what exists and
record that. Where the affordance is genuinely absent, we add it — **in Sonora's own visual
language**, reading Sonora's tokens, not Spotify's greens and blacks.

## Hard rules

1. **Never edit an existing card.** Every existing `*.card.html` is off limits. New cards only.
2. **Extensions are strictly additive.** Every new prop is optional and every existing call site
   must render byte-identically when the new prop is absent. No renames, no changed defaults,
   no reordered parameters. This is the single most important constraint in this document — the
   existing mockups consume these components and must not shift.
3. **Nothing hardcodes a value.** No hex colours, no raw px durations, no easing curves, no icon
   sizes. Read the tokens. `_adherence.oxlintrc.json` enforces this.
4. **Motion names a role** — `var(--duration-fast)`, `var(--ease-standard)` — never a number.
5. **Every component gets a sibling `.d.ts`.** It is the source for `export/component-api.md`,
   so props are documented there, not only in the JSX.
6. **Respect `prefers-reduced-motion`** anywhere you animate.

## House idiom — match it exactly

Read `components/components/MediaCard.jsx` and `components/components/ResultRow.jsx` before writing anything.
The conventions, none of which are optional:

```js
import React from 'react';
import { NS, sx } from '../shared.js';
```

- **Shared helpers come from `components/shared.js`, never copied.** `sx`, `NS`, `activate` (Enter
  and Space press an element that is not a button), `formatTime`, `clamp01`, `percentOf`,
  `tokenMs`/`tokenPx`, `injectCss`, `useMeasure` and the scroller finders live there once; import
  only what the component uses. A helper two components need goes there, not into either.

- **Sibling components are reached through `NS()`, never imported.** `const CoverArt = NS().CoverArt;`
  then guard every use: `{CoverArt && <CoverArt src={image} />}`. The bundle wires the namespace.
- **Named export**, function declaration, matching the filename.
- **Props are destructured with defaults in the signature**, `platform = 'desktop'` style.
- **Component-scoped CSS** (only when a pseudo-class or keyframe is genuinely needed) is injected
  once with `injectCss(id, css)` — see the `sonora-mediacard-css` call. Prefix classes `sn-`.
- **Every glyph draws through the `Icon` basic**, `<Icon name="play_arrow" filled weight="strong" />`,
  taken from `NS()`. Icon alone sets the icon font, its size, fill and weight; a component never
  names the font or sets `FILL` or `wght` itself. `weight="text"` lets a glyph follow the weight
  of the label it sits beside.
- Comments explain **why**, not what. Look at how `MediaCard` explains its scrim and its
  ResizeObserver — that register.

## Tokens you will need

Surfaces `--surface-bg` `--surface-bg-alt` `--surface-card` `--surface-fg` `--surface-fg-muted`
`--surface-border`. Scrims over artwork `--scrim-soft` `--scrim` `--scrim-strong`
`--on-scrim`. Accent `--accent` `--accent-contrast` `--accent-ink`: the one app accent, violet.
Play `--play` `--play-contrast` `--play-ink`: rose, with white for every label and glyph on it,
only for Now Playing, the mini player, the
transport, seek and listening-progress fills, the in-library tone and the Browse media filter.
State `--state-error|success|warning|info`, `--state-success-ink`; success is only for real success. Tones `--tone-library|request|progress|error` and their
`-ink` pairs. Radius `--radius-xs|sm|md|lg|pill`. Spacing `--spacing-xs|sm|md|lg|xl|2xl`.
Type `--text-xs|sm|md|lg|xl|2xl|3xl|4xl|5xl`, `--font-body|display|heading`, `--weight-body|strong`.
Icons `--icon-2xs|xs|sm|md`, `2xs` only inside a pill. Motion `--duration-instant|fast|quick|medium|slow`, `--ease-standard`.

Theme is driven by `data-theme="light"` / `"dark"` on an ancestor; never branch on theme in JS.

---

# New components

## `core/PreviewButton.jsx`

**Affordance: audition before committing.** Spotify puts "Preview episode" / "Preview playlist" /
"Preview audiobook" on every recommendation — a short sample that plays *without* adding the item to
your library or displacing what is playing. Sonora had no such control: `Button` commits, `PlayActions`
commits. Observed dimmed on a card whose preview has not loaded, which is a real fourth state.

```ts
kind?: 'episode' | 'playlist' | 'audiobook' | 'track'  // selects the default label, "Preview episode"
label?: string        // overrides the generated label entirely
playing?: boolean     // sample is playing — glyph flips to the sounding speaker
muted?: boolean       // playing with sound off — the default resting state Spotify shows
disabled?: boolean    // no sample available; dim, not-allowed, aria-disabled
onClick?: () => void
platform?: 'desktop' | 'mobile'
```

Pill, `--radius-pill`, on `--scrim-soft` over a tinted card. Leading glyph `volume_off` when muted,
`volume_up` when sounding, `volume_mute` when idle. Cross-fade the glyph on `--duration-fast`.

## `core/SortFilterBar.jsx`

**Affordance: state the current ordering and open the picker in one control.** Seen twice — the
podcast episode list ("All episodes • Newest") and the library ("Alphabetical"). It both *reports*
the active sort and *is* the way to change it, which is why a plain button won't do: the label is
data, not a name. `ValueRow` is the nearest existing thing and is wrong — it is a filled card for a
settings value, not a transparent inline control above a list.

```ts
icon?: string            // leading glyph, default 'tune'
label: string            // the current state, e.g. "All episodes • Newest"
onClick?: () => void
trailing?: ReactNode     // right-aligned slot — the library puts a ViewToggle here
platform?: 'desktop' | 'mobile'
```

Transparent background, `--surface-fg` label at `--text-md`/700, glyph at `--icon-sm` muted.
Full width, so `trailing` sits hard right.

## `core/StatusBanner.jsx`

**Affordance: a persistent, non-blocking statement of system state.** Spotify's "You're offline"
bar. Sonora has no ambient status surface at all — and this matters more for Auralis than it does
for Spotify, because a self-hosted library on a LAN goes unreachable routinely and the user needs to
know that is why the shelves are empty. Not a toast: it does not time out.

```ts
children: ReactNode                 // the message
tone?: 'info' | 'warning' | 'error' | 'success'   // default 'info'
icon?: string
actionLabel?: string
onAction?: () => void
onDismiss?: () => void              // renders a close control when set
```

Full-width strip, tone background from the state tokens, ink black or white per the tone's `-ink`
pair. `role="status"`, `aria-live="polite"`.

## `core/ExpanderRow.jsx`

**Affordance: collapse a homogeneous group inside a heterogeneous list.** Spotify's search results
fold seven versions of one song behind "More releases · Show all ⌄" so the other result types stay
reachable. Sonora's lists are flat; there is no way to express "there are more of these, but not
here".

```ts
label: string                 // "More releases"
actionLabel?: string          // default "Show all"
expanded?: boolean
onToggle?: (next: boolean) => void
image?: string                // optional stacked-art hint
```

Filled `--surface-card` row, `--radius-xs`. Chevron rotates 180° over `--duration-quick`.

## `core/Rating.jsx`

**Affordance: aggregate community judgement at a glance.** A show header carries "4,8 (17,7K)".
Sonora's `MediaHeader` has a single freeform `meta` string, which cannot express the
value/scale/population distinction — and Audiobookshelf and Jellyfin both expose real ratings.

```ts
value: number         // 0–5
count?: number        // population; formatted compactly, 17700 -> "17.7K"
max?: number          // default 5
platform?: 'desktop' | 'mobile'
```

Single star glyph plus the value — not five stars; the number carries the information and five
glyphs is decoration. `aria-label` states it in full: "Rated 4.8 out of 5 by 17,700 listeners".

## `core/FollowButton.jsx`

**Affordance: a subscription toggle whose label states the current state, not the action.**
"Following" means you are, and pressing it stops. That inverts a normal button and needs
`aria-pressed`. Wrap the existing `Button` rather than reimplementing it.

```ts
following?: boolean
onChange?: (next: boolean) => void
labels?: { off?: string; on?: string }   // default { off: 'Follow', on: 'Following' }
platform?: 'desktop' | 'mobile'
size?: 'sm' | 'md' | 'lg'
```

Off = `Button variant="primary"`. On = `variant="secondary"`. Always `aria-pressed={following}`.

## `media/FeatureCard.jsx`

**Affordance: argue for one item, at length, inside a feed.** This is the most-repeated shape in the
screenshots — roughly half of them — and Sonora has no equivalent. `MediaCard` is a square tile with
two lines of caption; `ResultRow` is a compact list row. Neither can carry a description, and the
description is the whole point: this is a recommendation that has to *persuade*, so it shows the
blurb, the age, the duration, and gives you a way to sample it before you commit.

The card is tinted from its own artwork, which is what makes a column of them read as distinct
recommendations rather than a list.

```ts
image?: string
kind?: string           // eyebrow above the title — "Episode", "Playlist", "Audiobook"
title: string
meta?: string           // "The LRB Podcast • 1 day ago • 56min"
description?: string    // clamped to 2 lines
tint?: string           // card surface; defaults to --surface-card
explicit?: boolean      // renders the E marker before the title
saved?: boolean         // add control shows its saved state
onSave?: () => void
onPlay?: () => void     // omit for an audiobook — a sample is the only playback a preview offers
onMore?: () => void
preview?: ReactNode     // a PreviewButton
platform?: 'desktop' | 'mobile'
```

Art top-left ~92px square `--radius-xs`. `onMore` sits top-right. Actions row along the bottom:
`preview` left, then save and play hard right. **When `onPlay` is omitted the play control is not
rendered** — that is the audiobook case, where preview and save are the only actions.

## `media/EpisodeRow.jsx`

**Affordance: a list row for serial spoken-word content.** An episode is not a track: it has a
synopsis you need in order to choose, a publication date, a listened/finished state, and its own
download. `ResultRow` deliberately holds one line of meta and one status pill; widening it to carry
a description and a four-action bar would bend it out of shape for the track and request lists that
already use it. So this is a sibling, not an extension.

```ts
image?: string
title: string
description?: string       // 2-line clamp
meta?: string[]            // parts joined with " • " — ["200K+ plays", "29 Dec 2025", "50min"]
finished?: boolean         // appends a "Finished" marker with a filled check in --tone-library
progress?: number | null   // 0–1, part-listened; draws a thin rule under the meta
explicit?: boolean
actions?: ReactNode        // the episode's own controls
onPlay?: () => void
onClick?: () => void
divider?: boolean
platform?: 'desktop' | 'mobile'
```

## `media/DownloadButton.jsx`

**Affordance: offline availability as a three-state control.** idle → downloading (determinate, and
cancellable mid-flight) → done (and pressing again removes it). Sonora shows download progress
inside `ResultRow`'s artwork, which only works where there is artwork to cover; this is the
standalone control. Directly relevant to Auralis, where offline downloads are a shipped feature.

```ts
state?: 'idle' | 'downloading' | 'done'
progress?: number | null     // 0–1; indeterminate when null and downloading
onClick?: () => void
size?: number                // default 34
```

Compose `NS().ProgressRing` for the downloading state rather than drawing a second ring.
Glyph `download` (outlined) → ring with a stop square → `download_done` filled in `--tone-library`.

# Extensions — additive only

## `core/SectionHeader.jsx` + `.d.ts`

**Affordance: the shelf says why it is here.** This is the single most valuable thing in the
screenshots. Spotify almost never shows a bare title; it shows *"More like · Alkaline Trio"*,
*"Popular with listeners of · Bad Therapist"*, *"Based on your interest in · Sci-Fi & Fantasy"* —
an eyebrow naming the relationship, the subject in bold, and the subject's own artwork as a
thumbnail. It converts an opaque recommendation into an explained one, and gives the user something
to press to see the source.

Auralis already computes a `reason` string per recommendation shelf server-side with no UI that can
carry it. This is that UI.

Add:
```ts
eyebrow?: string        // relationship line above the title — "More like", "Popular with listeners of"
image?: string          // subject artwork, leading the header
round?: boolean         // circular thumbnail — an artist or a person; square for a show or a genre
onSubject?: () => void  // makes the eyebrow+title block a link to the subject
actionText?: string     // a text action ("Show all") instead of the glyph `action`
```

`actionText` and `action` are mutually exclusive; if both arrive, `actionText` wins.
With no `eyebrow` and no `image`, output must be identical to today.

## `core/QuickPick.jsx` + `.d.ts`

Add `progress?: number | null` (0–1, thin rule across the base of the artwork square) and
`unplayed?: boolean` (a small `--accent` dot on the artwork's top-right).
**Affordance: a resumable tile shows how far in you are, and a subscribed one shows there is
something new** — without either, a grid of tiles cannot be triaged at a glance.

## `core/Badge.jsx` + `.d.ts`

Add:
```ts
icon?: string      // leading Material Symbols glyph — the verified check, the finished tick
square?: boolean   // square with --radius-xs rather than a pill: the explicit-content "E" marker
plain?: boolean    // no fill; glyph and label take the tone colour as ink
```
**Affordance: a marker that qualifies content rather than counting it.** "Verified", "E", "Finished"
are attributes of the item, and a filled counting pill reads wrongly for them.

## `core/ButtonGroup.jsx` + `.d.ts`

Add `scroll?: boolean` (already `overflow-x:auto`; this adds the edge fade and momentum so an
overflowing set reads as scrollable rather than clipped) and `leading?: ReactNode` (a pinned,
non-scrolling slot before the first segment — the account avatar sits there in every Spotify
filter row).

**Affordance: a filter set longer than the screen.** Sonora's group assumes every segment fits.
Home, Library and Search all overflow.

## `layout/Section.jsx` + `.d.ts`

Forward `eyebrow`, `image`, `round`, `onSubject` and `actionText` to `SectionHeader`. No other
change. Without this the header extension is unreachable from the component feeds are built from.

## `media/MediaCard.jsx` + `.d.ts`

Add:
```ts
eyebrow?: string        // muted line ABOVE the title — the type or genre: "Playlist", "Album", "Society & Culture"
unplayed?: boolean      // accent dot, artwork top-right
savedBadge?: boolean    // bookmark tab, artwork bottom-left
markers?: string[]      // small glyphs before `sub` — 'push_pin' pinned, 'download_done' offline
```
**Affordance: type-before-name, and status without a second line.** In a mixed shelf the *kind*
of thing is what you scan for first, so it belongs above the title; Sonora's `sub` puts it after.
`markers` lets the caption carry pinned/downloaded state without spending a row.

Keep the existing `sub` untouched. `eyebrow` renders above the title at `--text-xs` muted.

## `core/Button.jsx` + `.d.ts`

Add `pressed?: boolean` — sets `aria-pressed`; undefined emits no attribute at all.

**Affordance: a button that is a toggle rather than a trigger.** Added mid-wave, after
`FollowButton` was found to be passing `aria-pressed` into `Button` and having it silently
discarded: `Button` destructures its seven declared props and renders its own `<button>`, so
anything undeclared is dropped rather than forwarded. Only the real element can carry the
attribute, so the prop has to exist. The alternative — `FollowButton` hand-rolling its own
styled `<button>` — would have duplicated `Button`'s entire variant and size system to gain
one attribute.

## `media/ResultRow.jsx` + `.d.ts`

Add `trailing?: ReactNode` — rendered after the status pill, at the row's trailing edge.
**Affordance: act on a result without leaving the list.** Every Spotify search row carries an
overflow menu and an add control; `ResultRow` today offers exactly one action, on the artwork.
When `trailing` is absent nothing changes.

---

# Cards

One `.card.html` per group. **Never touch an existing card.** Copy the exact shape of
`components/basic/buttons.card.html`: the `@dsCard` marker must be the literal first line, then the
stylesheet link, the three pinned CDN scripts *with their integrity attributes unchanged*,
`_ds_bundle.js`, the `__card-page-css` style block, `<div id="root">`, and a `text/babel` script.

```html
<!-- @dsCard group="…" viewport="WxH" name="…" subtitle="…" -->
```

Pull components off the namespace exactly as the existing cards do:
`const { Button, IconButton } = window.SonoraDesignSystem_6c1435;`

Every card must render its content **twice, side by side, in `data-theme="dark"` and
`data-theme="light"`** — copy the `Themed()` wrapper from `buttons.card.html` verbatim. Show real
states, not lorem: the disabled preview, the downloaded episode, the offline banner, the explicit
marker. Use realistic self-hosted-library content, never Spotify's catalogue.

| File | group | name | Covers |
| --- | --- | --- | --- |
| `components/components/discovery-cards.card.html` | Components | Discovery & Feature Cards | `FeatureCard` in all three kinds, tinted, explicit marker, disabled preview, audiobook (no play) |
| `components/components/episode-rows.card.html` | Components | Episode Rows & Downloads | `EpisodeRow` with finished / part-played / unplayed, `DownloadButton` all three states |
| `components/components/context-headers.card.html` | Components | Contextual Headers & Controls | extended `SectionHeader` (eyebrow/image/round/actionText), `SortFilterBar`, `Rating`, `FollowButton`, `PreviewButton` |
| `components/components/status-and-disclosure.card.html` | Components | Status & Disclosure | `StatusBanner` tones, `ExpanderRow` |
| `components/components/card-states.card.html` | Components | Card & Tile States | extended `MediaCard` (eyebrow/unplayed/savedBadge/markers), extended `QuickPick` (progress/unplayed), extended `Badge` |
| `components/basic/filter-rows.card.html` | Components | Overflowing Filter Rows | extended `ButtonGroup` (scroll + leading avatar) in the home, library and search-results configurations |

---

# Deliberately not built

Record these; do not build them.

- **A new search input.** Sofia ruled it out by name. `SearchField` already covers scoped
  search — "Find in this show" is `SearchField`
  with a scoped placeholder.
- **Camera / scan-to-search.** Spotify scans its own barcodes. Meaningless against a private
  self-hosted library.
- **A station/radio card.** The "RADIO" plate and the Spotify wordmark are brand, not affordance;
  the affordance underneath — *a generated mix, and what seeded it* — is carried by `MediaCard`
  with `eyebrow` plus a seed list in `sub`.
- **Tabs.** `TabBar` already does Episodes / About / More like this, with the underline indicator.
- **Bottom navigation.** `BottomNav` exists and matches, "Create" included.
- **List/grid switch.** `ViewToggle` exists; it goes in `SortFilterBar`'s `trailing` slot.
- **Circular artist cards.** `MediaCard` takes `shape="round"`.
- **Horizontal shelves and responsive grids.** `Shelf` and `LayoutGrid` exist.
