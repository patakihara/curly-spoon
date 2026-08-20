<!-- GENERATED from components/**/*.d.ts by export/generate.js. Do not hand-edit. -->

# Sonora component API

Every prop each component accepts, with its type and the note from its declaration.

## core

### AccentSwatch

A single accent-colour choice from the accent preset palette; lay several out in a row for the picker.

| prop | type | notes |
| --- | --- | --- |
| `color` *(required)* | `string` | Any CSS colour — pass an --accent-* token value. |
| `name` | `string` | Accessible name / tooltip, e.g. "Lilac". |
| `selected` | `boolean` |  |
| `size` | `'sm' \| 'lg'` | lg is the settings picker, sm the inline row. |
| `onClick` | `() => void` |  |

### Badge

Small pill for counts, queue positions and status. Colors come from the status tone tokens; ink is always plain black or white.

| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `tone` | `'accent' \| 'success' \| 'warning' \| 'error' \| 'neutral'` |  |
| `size` | `'sm' \| 'md'` | md is the status-pill size used in list rows; sm is the count pill. |

### Button



| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | Visual style. Primary = filled accent; secondary = outlined surface; ghost = text-only; danger = destructive red. |
| `size` | `'sm' \| 'md' \| 'lg'` |  |
| `platform` | `'desktop' \| 'mobile'` | Desktop = sharp Feishin-style radius; mobile = fully-rounded Material pill (Booming/Symphony). |
| `icon` | `ReactNode` |  |
| `disabled` | `boolean` |  |
| `onClick` | `() => void` |  |

### ButtonGroup

M3 connected button group — a row of segments that read as one control: outer ends fully rounded, 8px inner corners, and the selected segment morphs to fully rounded on both sides. Use for library filters and mode switches, not for navigation.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `(string \| { key: string; label?: string; icon?: string })[]` |  Labels, or `{ key, label?, icon? }` — `icon` is a Material Symbols Rounded glyph name. An item with an icon and no label renders as a square icon-only segment (the label is still used for its accessible name).  |
| `value` | `string` | Key of the selected segment. |
| `onChange` | `(next: string) => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |

### Chip

One of the 17 accent hues (renders as a big colorful genre card like Symphony's Genres grid). Omit for a plain outlined tag.

| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `color` | `'red'\|'orange'\|'amber'\|'yellow'\|'lime'\|'green'\|'emerald'\|'teal'\|'cyan'\|'sky'\|'blue'\|'indigo'\|'violet'\|'purple'\|'fuchsia'\|'pink'\|'rose'` | One of the 17 accent hues (renders as a big colorful genre card like Symphony's Genres grid). Omit for a plain outlined tag. |
| `count` | `number` |  |
| `selected` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |

### IconButton



| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `size` | `number` |  |
| `active` | `boolean` |  |
| `muted` | `boolean` |  |
| `label` *(required)* | `string` |  |
| `onClick` | `() => void` |  |

### ProgressRing

Circular progress indicator. Pass `value` (0–1) for a determinate ring that animates to its position; omit it for an indeterminate arc that rotates and breathes while work is in flight. Used over cover art in ResultRow, and anywhere a small inline "working" state is needed.

| prop | type | notes |
| --- | --- | --- |
| `size` | `number` | Outer diameter in px. |
| `value` | `number \| null` | 0–1, or null/undefined for indeterminate. |
| `thickness` | `number` | Stroke width in px. |
| `color` | `string` | Arc colour. |
| `track` | `string` | Unfilled track colour. |
| `label` | `string` | Accessible label; defaults to the percentage, or "Loading". |

### QuickPick

Continue-listening / jump-back-in tile: small square art plus title and a meta line. Lay several out in a grid at the top of a home screen.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` | e.g. "Book · 6 h 12 m left". |
| `icon` | `string` |  Material Symbols Rounded glyph name. Given one, the tile renders the glyph on a flat accent tint instead of the gradient artwork square — the variant for destinations with no cover art of their own (Shuffle all, Downloads, Liked, a genre).  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |

### SectionHeader

Heading row above a carousel, grid or list, with an optional trailing icon action.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `action` | `string` | Material Symbols Rounded glyph name for the trailing action, e.g. "arrow_forward". Omit for no action. |
| `actionLabel` | `string` |  |
| `onAction` | `() => void` |  |
| `platform` | `'mobile' \| 'desktop'` | mobile = body font at text-xl; desktop = display font at h3, 900 weight. |

### TonalIconButton

Icon button on a tonal (card) fill — a squat pill rather than a circle, for controls sitting on the page instead of in a bar (the list/grid switch above a collection). Changing `glyph` turns the icon over rather than cutting to it; instant under prefers-reduced-motion.

| prop | type | notes |
| --- | --- | --- |
| `glyph` *(required)* | `string` | Material Symbols glyph name. Change it and the icon animates over. |
| `label` | `string` | Accessible name and tooltip. |
| `onClick` | `() => void` |  |
| `width` | `number` | Default 40×32 with a 16px radius — a pill wider than it is tall. |
| `height` | `number` |  |
| `radius` | `string` |  |
| `iconSize` | `string` | Glyph size. Default `--icon-xs` (20px). |
| `active` | `boolean` | Accent ink and a filled glyph. |
| `background` | `string` |  |

### ValueRow

Label + value on a filled card (Speed · 1.0x, Sleep timer · Off). Read-only unless you pass onClick.

| prop | type | notes |
| --- | --- | --- |
| `label` *(required)* | `string` |  |
| `value` *(required)* | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |

### ViewToggle

The list ⇄ grid switch for a library page — one icon button showing the view it switches to. Sits at the top-right of the collection it controls.

| prop | type | notes |
| --- | --- | --- |
| `value` | `'list' \| 'grid'` |  |
| `onChange` | `(value: 'list' \| 'grid') => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |

## forms

### FieldRow

Labelled form field wrapping the system Input. On mobile it supplies the filled pill container the chromeless mobile Input expects to sit on.

| prop | type | notes |
| --- | --- | --- |
| `label` *(required)* | `string` |  |
| `placeholder` | `string` |  |
| `value` | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onChange` | `(next: string) => void` |  |

### Input



| prop | type | notes |
| --- | --- | --- |
| `placeholder` | `string` |  |
| `icon` | `ReactNode` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `value` | `string` |  |
| `onChange` | `(e: any) => void` |  |

### SearchBar

Pill search bar — fully rounded, bordered on desktop and filled on mobile. Use inline (a filter row, a sheet, a settings page). For the centred library search in the top app bar use SearchField, which is filled with soft rectangular corners instead.

| prop | type | notes |
| --- | --- | --- |
| `placeholder` | `string` |  |
| `value` | `string` |  |
| `onChange` | `(next: string) => void` |  |
| `onSubmit` | `(value: string) => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `width` | `string` |  |

### SearchField

Filled search field with no outline and soft rectangular corners (radius-xs) — the library search treatment, distinct from the pill Input.

| prop | type | notes |
| --- | --- | --- |
| `placeholder` | `string` |  |
| `value` | `string` |  |
| `onChange` | `(next: string) => void` |  |
| `onSubmit` | `(value: string) => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `width` | `string` | Defaults to 100% — cap it with the parent when centering in a bar. |
| `height` | `string` | Overrides the default height (40px mobile / 44px desktop) — the app bar fills its row with "100%". |
| `autoFocus` | `boolean` | Focuses the input when it flips to true — for a field revealed by an app-bar search morph. |
| `onClose` | `() => void` | Renders the field's own trailing close control — the app bar's search morph puts its cross here. |
| `closeGlyph` | `string` |  |

### SettingRow

Settings list row: title, explanatory line, and a Switch on a filled card.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `checked` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onChange` | `(next: boolean) => void` |  |

### Slider

0–1

| prop | type | notes |
| --- | --- | --- |
| `value` | `number` | 0–1 |
| `onChange` | `(next: number) => void` |  |
| `platform` | `'desktop' \| 'mobile'` | Desktop: thin track + round handle (Feishin). Mobile: thick pill split by a divider notch (Booming Music). |

### Switch



| prop | type | notes |
| --- | --- | --- |
| `checked` *(required)* | `boolean` |  |
| `onChange` | `(next: boolean) => void` |  |
| `label` | `string` |  |

## layout

### AppShell

The app frame — the one component that ties the layout parts together, so a screen only has to supply its own content. Composes NavRail (or nothing, on mobile) beside a column of TopAppBar + ContentPane, with an optional SideSheet abutting the content and MiniPlayer docked across the full width beneath everything. The shell owns the relationships that are easy to get wrong: the bar spans only the content column, so the sheet runs full height beside it with its title at the bar's level; the player spans everything; and the content pane squares its top-right corner whenever the sheet is open. On mobile pass no `rail` and put the bottom nav in `player` alongside the mini player.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` | The screen itself — goes inside the ContentPane. |
| `rail` | `ReactNode` | A NavRail. Omit on mobile. |
| `bar` | `ReactNode` | A TopAppBar. |
| `sheet` | `ReactNode` | A SideSheet. |
| `sheetOpen` | `boolean` | Whether that sheet is open — squares the content's abutting corner. |
| `player` | `ReactNode` | MiniPlayer, BottomNav, or a fragment of both. Docked across the bottom. |
| `contentMinWidth` | `string` | Floor for the content column, e.g. `var(--content-min-width)`. |
| `scrollKey` | `string \| number` | Identifier of the current view — gives each one its own remembered scroll position. |
| `scroll` | `boolean` | false when the screen owns its own scrolling (mobile). |
| `onProgress` | `(progress: number) => void` | 0–1 scroll progress from the content pane. |
| `theme` | `string` | Sets `data-theme` on the frame. |
| `flat` | `boolean` | Flattens the content pane — square top corners and a permanent divider — for a sub-page that owns the full surface. |
| `square` | `boolean` | Squares the content pane's top corners while keeping its scroll-linked hairline — used when the app bar's controls row carries the rounding. |

### CircleReveal

Wraps a surface so it grows into view as a circle from the point that opened it — a detail page expanding out of the card you tapped. Pass the pointer's viewport coordinates; with no coordinates it expands from the centre. Honours prefers-reduced-motion by appearing at once.

| prop | type | notes |
| --- | --- | --- |
| `x` | `number` | Pointer clientX that triggered the open. |
| `y` | `number` | Pointer clientY that triggered the open. |
| `style` | `React.CSSProperties` | Styles for the revealed surface itself (position, background, layout). |
| `duration` | `string` | Defaults to `var(--duration-medium)`. |
| `children` | `React.ReactNode` |  |

### CollectionPage

The full contents of a feed section — the page its action arrow opens. Pair it with LibraryShell's `openCollection`, which titles the app bar and gives the page its back arrow.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `origin` | `{ x: number; y: number } \| null` | Pointer coordinates of the click that opened it, for the reveal. |
| `overlay` | `boolean` | Floats the page over the view beneath it instead of sitting in the page flow. |
| `zIndex` | `number` |  |
| `mode` | `'list' \| 'grid'` | Shows the list/grid switch above the content when `onMode` is given. |
| `onMode` | `(mode: 'list' \| 'grid') => void` |  |
| `children` | `ReactNode` |  |

### ContentPane

The scrolling page surface inside AppShell. Sits in `--surface-bg` against the app bar's `--surface-bg-alt`, with its top corners rounded so the bar reads as the layer behind it. Once scrolled past `threshold` the corners flatten and a hairline fades in along the top edge, marking that the content now runs under the bar. Square off whichever side another surface abuts — AppShell squares the right edge for you when a SideSheet is open.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `squareRight` | `boolean` | Keep the top-right corner square (a side sheet is open). |
| `squareLeft` | `boolean` |  |
| `scroll` | `boolean` | false when a descendant owns the scrolling (mobile screens) — the pane still tracks it. |
| `threshold` | `number` | Scroll distance in px over which the corners flatten and the divider fades in. Default 24. |
| `flat` | `boolean` | Square top corners and a permanent top divider, regardless of scroll. |
| `square` | `boolean` |  Square top corners with the scroll-linked hairline kept — for when the app bar's controls row carries the rounding instead. Unlike `flat`, the divider still fades in on scroll.  |
| `scrollKey` | `string \| number` |  |
| `onProgress` | `(progress: number) => void` | Fires with 0–1 scroll progress. |

### EditableList

Stable key for the row — pass it through as React's `key`.

| prop | type | notes |
| --- | --- | --- |

### LayoutGrid

Responsive card grid — the vertical half of the grid system (Shelf is the horizontal half). By default it auto-fills columns no narrower than `--grid-item-min`, so a shelf of media cards reflows without breakpoints. Pass `columns` when the count is part of the design (mobile "Jump back in" is always 2-up).

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `columns` | `number` |  Fixed column count. Rarely needed — prefer letting the item minimums decide, so the same grid reflows in a narrow pane as well as it does on a phone.  |
| `item` | `'standard' \| 'wide'` |  Item shape, which selects the minimum-width token: 'standard' for square media cards (`--grid-item-min`), 'wide' for horizontal tiles like QuickPick (`--grid-item-min-wide`). Mobile variants of both tokens are tuned to auto-fill to two columns on a phone.  |
| `min` | `string` | Explicit minimum width, overriding the `item` token. |
| `gap` | `string` | Gap override. Defaults to `--grid-gutter`. |
| `maxWidth` | `string` | Measure cap, e.g. `var(--grid-max-width)`. |
| `platform` | `'desktop' \| 'mobile'` |  |

### LibraryShell

App bar title for this view.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `views` *(required)* | `LibraryView[]` |  |
| `view` *(required)* | `string` | The showing view's key. The kit owns the nav widget (NavRail or BottomNav) and this state. |
| `rail` | `ReactNode` |  |
| `sheet` | `ReactNode` |  |
| `sheetOpen` | `boolean` |  |
| `player` | `ReactNode` |  |
| `theme` | `string` |  |
| `contentMinWidth` | `string` |  |
| `scroll` | `boolean` |  |
| `flatDetail` | `boolean` | Square corners + permanent divider while a detail page is open. |
| `leading` | `ReactNode` | Bar controls outside a detail page; a detail replaces leading with a back arrow. |
| `trailing` | `ReactNode` |  |
| `detailTrailing` | `ReactNode` |  |
| `backLabel` | `string` |  |
| `searchHeight` | `string` |  |
| `detailSearchPlaceholder` | `string` |  |
| `children` | `((ctx: LibraryShellContext) => ReactNode) \| ReactNode` |  |

### PlayerPanel

The desktop player: the Currently Playing page as a SideSheet beside the content column, with the queue and the lyrics as sibling tabs rather than sections of the page. Leave `tab` unset and the panel keeps its own.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `tab` | `'now' \| 'queue' \| 'lyrics' \| string` |  |
| `onTabChange` | `(tab: string) => void` |  |
| `onClose` | `() => void` |  |
| `tabs` | `Array<{ key: string; label: string; icon?: string }>` | Override the three tabs (key/label/icon), e.g. to drop lyrics for a podcast. |
| `title` | `string` | Panel heading above the tabs. Defaults to "Player" — the tabs name the view. |
| `track` | `{ image?: string; title?: string; artist?: string; context?: string }` | What is playing: cover, title, artist and the "Playing from …" line. |
| `player` | `Omit<NowPlayingPageProps, 'platform' \| 'image' \| 'title' \| 'artist' \| 'context' \| 'scroll' \| 'header'>` | Playback state and handlers, forwarded to NowPlayingPage. |
| `lyrics` | `Omit<LyricsPageProps, 'platform' \| 'scroll' \| 'heading'>` | Forwarded to LyricsPage. |
| `queue` | `Omit<QueuePageProps, 'platform' \| 'scroll' \| 'heading'>` | Forwarded to QueuePage. |
| `width` | `string` | Panel width. Defaults to `--side-sheet-width`. |

### PlayerSheet

The mobile player surface — covers the whole app frame and opens as an expansion of the now-playing bar. Pass the bar's `getBoundingClientRect()` as `from` and the sheet grows out of that exact rectangle; without one it slides up from the bottom edge. Instant under prefers-reduced-motion.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `from` | `{ top: number; left: number; width: number; height: number } \| null` | The mini player's viewport rect — a DOMRect, or `{ top, left, width, height }`. |
| `onClose` | `() => void` |  |
| `zIndex` | `number` | Stacking order over the app frame. |
| `radius` | `string` | Corner radius of the collapsed rectangle, matched to the bar it grows from. |
| `background` | `string` | Sheet surface, so the expansion never flashes a different colour than the page inside it. |
| `children` | `ReactNode` |  |

### PlayerSubPage

The shell shared by every page the player opens (LyricsPage, QueuePage): an app bar naming the page, then a scrolling body whose first row pairs what the page is about with its controls. The bar's close button collapses the page back into whatever expanded it.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `heading` | `string \| null` | Page name in the app bar. `null` inside the desktop player panel, whose tab already names it. |
| `meta` | `string` | What the page is about — "Playing from Driftwave", "Song · Artist". |
| `controls` | `ReactNode` | The page's own controls, on the meta row: the sync group, the edit toggle. |
| `footer` | `ReactNode` | Docked below the body — an edit action bar, a BottomAppBar. |
| `scroll` | `boolean` | Own the scrolling (the default). Off inside the desktop player panel, which scrolls itself. |
| `onClose` | `() => void` | Renders the app bar's close button when set. |
| `closeGlyph` | `string` |  |
| `children` | `ReactNode` |  |

### ScrollArea

Scroll container with an Android-style overlay scrollbar — the thumb appears while the user scrolls and fades out `hideAfter` ms after they stop, on every platform including desktop. Native scrollbars are suppressed, and the thumb is an overlay, so content never reflows when it appears. ContentPane and SideSheet use this internally; wrap your own scrollers in it when a screen owns its scrolling (mobile pages under `AppShell scroll={false}`).

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `onScroll` | `(event: UIEvent<HTMLDivElement>) => void` |  |
| `style` | `CSSProperties` | Applied to the inner scrolling element — padding, background, etc. |
| `scrollRef` | `{ current: HTMLDivElement \| null } \| ((el: HTMLDivElement \| null) => void)` | Ref to the scrolling element itself — for saving and restoring scroll position. |
| `axis` | `'y' \| 'x'` |  |
| `thumbWidth` | `number` | Thumb thickness in px. Default 4. |
| `hideAfter` | `number` | Idle delay before the thumb starts fading, in ms. Default 900. |
| `fade` | `number` | Fade-out duration in ms. Default 500. |
| `minThumb` | `number` | Minimum thumb length in px. Default 32. |
| `edgeFade` | `boolean \| number` |  Fade the top and bottom edges to mark content running past them — the top fade only appears once scrolled off the start, the bottom fade disappears at the end. `true` for the default 28px, or a pixel depth.  |

### Section

One block of a feed — a SectionHeader plus its content — carrying the standard spacing to the next block. Prefer this over placing SectionHeader and a Shelf/LayoutGrid loose in a page.

| prop | type | notes |
| --- | --- | --- |
| `title` | `string` | Heading text. Omit for an untitled block that still takes part in the rhythm. |
| `action` | `string` | Material Symbols glyph for the header's trailing action, e.g. 'arrow_forward'. |
| `actionLabel` | `string` |  |
| `onAction` | `() => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `last` | `boolean` | Drops the trailing margin — set on the final section of a scroll view. |
| `children` | `React.ReactNode` |  |

### Shelf

Horizontal carousel row. Negative side margins pull it out to the page edge while matching padding keeps the first item aligned to the gutter — so cards scroll off-screen rather than stopping at the content padding. `margin` must match the page's own padding. Affordances differ by platform, matching the input: desktop gets circular arrows that fade in on hover or keyboard focus and page by `step` whole items (measured from the first child, not a guessed pixel amount), disabling themselves at each end. Mobile gets a fading overlay thumb instead, since a touch surface has no hover state to reveal arrows.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `gap` | `string` | Gap between items. Defaults to `--grid-gutter`. |
| `margin` | `string` | The page padding to bleed past. Defaults to `--grid-margin`. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `step` | `number` | How many items an arrow press advances. Default 2. |
| `arrows` | `boolean` | Force the paging arrows on or off. Defaults to on for desktop, off for mobile. |
| `scrollbar` | `boolean` | Force the fading overlay thumb on or off. Defaults to on for mobile, off for desktop. |

### SideSheet

Side sheet — a full-height panel beside the bar+content column, so it and its divider run up alongside the app bar and its own title row (`--appbar-height`) lines up with the bar's title. Animates from zero width and holds its inner content at full width so nothing reflows mid-transition. Pair with `AppShell`'s `sheetOpen` so the content pane squares off the abutting corner.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `title` | `string` | Heading in the sheet's own header row. |
| `onClose` | `() => void` | Shows a close button in the header when provided. |
| `children` | `ReactNode` |  |
| `width` | `string` | Open width. Defaults to `--side-sheet-width` (320px). |
| `side` | `'left' \| 'right'` |  |
| `closeGlyph` | `string` | Material Symbols glyph for the close button. Default 'close'. |

## media

### AlbumArt



| prop | type | notes |
| --- | --- | --- |
| `src` | `string` |  |
| `size` | `number` |  |
| `platform` | `'desktop' \| 'mobile'` |  |

### ArtistCard

Circular artist/author/narrator card for a people shelf.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `width` | `string` |  |
| `onClick` | `() => void` |  |

### CoverArt

The artwork layer used inside every art container in the system. Absolutely fills its parent (which must be `position: relative` and `overflow: hidden`) and owns one detail that is easy to get wrong: the gradient fallback is *removed* once the image loads, rather than left behind it. A rounded corner is antialiased, so semi-transparent edge pixels blend with whatever is behind the image — a gradient left underneath shows up as a coloured fringe around the art, which no amount of image bleed can hide.

| prop | type | notes |
| --- | --- | --- |
| `src` | `string` | Image URL. Omitted or still loading, the fallback shows instead. |
| `fallback` | `string` | CSS background for the placeholder. Defaults to the accent→violet gradient. |
| `alt` | `string` |  |

### DetailPage

The page for one library item — MediaHeader plus its list — opening as a CircleReveal from the point that was tapped. Pass the list rows (ResultRows) as children.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `origin` | `{ x: number; y: number } \| null` | Pointer coordinates of the click that opened it, for the reveal. |
| `overlay` | `boolean` | Floats the page over the view beneath it instead of sitting in the page flow. |
| `zIndex` | `number` |  |
| `kindLabel` | `string` | MediaHeader content. |
| `title` | `string` |  |
| `subtitle` | `string` |  |
| `meta` | `string` |  |
| `image` | `string` |  |
| `round` | `boolean` | Circular art, for a person page. |
| `onSubtitle` | `() => void` |  |
| `onPlay` | `() => void` |  |
| `onPlayNext` | `() => void` |  |
| `onPlayLast` | `() => void` |  |
| `playLabel` | `string` |  |
| `nextLabel` | `string` |  |
| `lastLabel` | `string` |  |
| `listMaxWidth` | `string` | Measure cap on the list. Defaults to `--grid-max-width-list` on desktop, full width on mobile. |
| `children` | `ReactNode` |  |

### Lyrics

The lyric list in the three states the sync control cycles through. Only `sync` scrolls to follow the song; `dot` and `off` are static sheets.

| prop | type | notes |
| --- | --- | --- |
| `lines` | `string[]` |  |
| `activeIndex` | `number` | Index of the line being sung. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `syncMode` | `'sync' \| 'dot' \| 'off'` |  `sync` — the line being sung takes accent ink a step larger, sung lines stay full strength and lines still to come are muted (and the list scrolls to follow); `dot` — all lines full strength, the current one marked by an accent dot that slides between lines; its gutter is held in every mode, so switching never moves the text; `off` — no sync and no indication.  |
| `card` | `boolean` | Draw the card surface behind the lines. Off for a full lyrics page, which owns its surface. |
| `textSize` | `string` | Line size — any CSS length or type token. Defaults to `--text-lg`. |
| `autoScroll` | `boolean` | Follow the song by scrolling the nearest scrolling ancestor. Only applies in `sync`. |
| `onLineClick` | `(index: number) => void` |  |

### LyricsPage

Full lyrics page — an app bar naming the page, then the song and the LyricsSyncButton on one row above a scrolling lyric sheet. Reached from the Now Playing lyrics preview or the bottom app bar on mobile; the player panel's Lyrics tab on desktop. Dismissed by the surface that opened it — it carries no back affordance of its own.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `heading` | `string \| null` | Page heading. Pass `null` inside the desktop player panel, whose tab already names it. |
| `title` | `string` | Song the lyrics belong to, shown under the heading. |
| `artist` | `string` |  |
| `lines` | `string[]` |  |
| `activeIndex` | `number` |  |
| `syncMode` | `'sync' \| 'dot' \| 'off'` |  |
| `onSyncModeChange` | `(mode: 'sync' \| 'dot' \| 'off') => void` |  |
| `footer` | `ReactNode` | Docked below the sheet — a BottomAppBar, for instance. |
| `scroll` | `boolean` | Own the scrolling (the default). Off inside the desktop player panel, which scrolls itself. |
| `onClose` | `() => void` | Renders the app bar's close button, which collapses the page back into what opened it. |

### LyricsSyncButton

The lyric sheet's sync control — a TonalIconButton (same shape as the list/grid toggle) cycling `sync` → `dot` → `off`: synced (current line in accent ink), current line marked by an accent dot only, then no sync and no indication. The glyph turns over as the mode changes.

| prop | type | notes |
| --- | --- | --- |
| `mode` | `'sync' \| 'dot' \| 'off'` |  |
| `onChange` | `(mode: 'sync' \| 'dot' \| 'off') => void` | Receives the next mode in the cycle. |

### MediaCard

Shelf/grid card for any library item — album, book, podcast, episode. Cover art is a deterministic tint derived from the title, so a shelf reads as distinct artwork. In a mixed shelf pass the content type as the first part of `sub` ("Book · 6 h 12 m left").

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `progress` | `number \| null` | 0–1 resume position; draws a progress bar across the bottom of the art. |
| `absent` | `boolean` | Not-in-library state: dashed outline plus a "Not in library" pill anchored to the bottom of the art. |
| `width` | `string` | Fixed track width; pass "100%" to fill a grid cell. |
| `size` | `'md' \| 'sm'` | 'sm' is the compact carousel size — narrower track, smaller caption type. |
| `onPlay` | `() => void` |  Queue handlers. Given any of them, a desktop card reveals a PlayActions group over its artwork on hover (play next / play / play last). Mobile cards ignore them — no hover.  |
| `onPlayNext` | `() => void` |  |
| `onPlayLast` | `() => void` |  |
| `playing` | `boolean` |  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `onClick` | `() => void` |  |
| `onMore` | `(e?: any) => void` | Renders a corner menu button (top-right) — hover/focus-revealed on desktop, always visible on mobile. |

### MediaHeader

Detail-page header for an album, book, podcast or artist: large art, kind label, title, a subtitle that can link onward (artist/author), meta line and two actions.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  Layout override. Omit it and the header measures itself, going compact (art on top, centred, smaller type) below `compactAt` — a real breakpoint on its own width, so the same header adapts inside a phone frame or a narrow desktop pane without being told.  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `compactAt` | `number` | Width in px below which the compact layout takes over. Default 600. |
| `kindLabel` | `string` | Uppercase kind line above the title, e.g. "Album", "Audiobook". |
| `title` *(required)* | `string` |  |
| `subtitle` | `string` |  |
| `meta` | `string` |  |
| `playLabel` | `string` |  |
| `nextLabel` | `string` | Label on the play-next button. Default "Next". |
| `lastLabel` | `string` | Label on the play-last button. Default "Last". |
| `round` | `boolean` | Circular art, for artist/author pages. |
| `onPlay` | `() => void` |  |
| `onPlayNext` | `() => void` |  |
| `onPlayLast` | `() => void` |  |
| `onSubtitle` | `() => void` | Makes the subtitle an accent-ink link. |

### MiniPlayer

The persistent now-playing surface, in both platform variants: the tinted pill docked above the mobile bottom nav, or the desktop three-column transport bar.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `artist` *(required)* | `string` |  |
| `image` | `string` |  |
| `playing` | `boolean` |  |
| `onTogglePlay` | `() => void` |  |
| `onOpen` | `() => void` | Tapping the card body (mobile) or the track block (desktop) expands the full player. |
| `platform` | `'mobile' \| 'desktop'` | mobile = docked tinted pill; desktop = full-width transport bar with seek and queue controls. |
| `progress` | `number` | 0–1. Desktop only — drives the seek bar and the mm:ss elapsed readout. |
| `onSeek` | `(value: number) => void` |  |
| `duration` | `number` | Track length in seconds, for the mm:ss readouts. Desktop only. |
| `onPrev` | `() => void` |  |
| `onNext` | `() => void` |  |
| `queueOpen` | `boolean` | Desktop only — tints the queue button accent while the queue panel is open. |
| `onToggleQueue` | `() => void` |  |
| `lyricsOpen` | `boolean` | Desktop only — same for the lyrics button, which opens the player panel's Lyrics tab. |
| `onToggleLyrics` | `() => void` |  |

### NowPlaying

The player, whole — the canonical Currently Playing shape for both platforms from one set of props. Mobile: a sheet that covers the app and expands out of the now-playing bar (`from` = the bar's rect). Lyrics and queue appear as previews on the page and as buttons on the bottom app bar; both open as full pages over it. Desktop: a side panel where lyrics and queue are tabs beside Now playing rather than page sections.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `open` | `boolean` |  |
| `from` | `{ top: number; left: number; width: number; height: number } \| null` | Mobile only: the mini player's viewport rect, so the sheet grows out of it. |
| `onClose` | `() => void` |  |
| `page` | `'now' \| 'lyrics' \| 'queue'` | Mobile sub-page. Omit to let the component own it. |
| `onPageChange` | `(page: 'now' \| 'lyrics' \| 'queue') => void` |  |
| `tab` | `'now' \| 'queue' \| 'lyrics' \| string` | Desktop tab. Omit to let the panel own it. |
| `onTabChange` | `(tab: string) => void` |  |
| `track` | `{ image?: string; title?: string; artist?: string; context?: string }` |  |
| `player` | `Omit<NowPlayingPageProps, 'platform' \| 'image' \| 'title' \| 'artist' \| 'context' \| 'lyrics' \| 'queue' \| 'footer' \| 'header' \| 'scroll'>` | Playback state and handlers (playing, progress, duration, onTogglePlay, onSeek, speed, sleep …). |
| `lyrics` | `Pick<LyricsPageProps, 'lines' \| 'activeIndex' \| 'syncMode' \| 'onSyncModeChange'>` | Lyric sheet: lines, the line being sung, and the sync mode the LyricsSyncButton cycles. |
| `queue` | `Pick<QueuePageProps, 'items' \| 'editing' \| 'onEditingChange' \| 'onPlay' \| 'onRemove' \| 'onReorder' \| 'onRemoveSelected'>` | Queue: items plus the edit-mode handlers. |
| `actions` | `BottomAppBarAction[]` | Replaces the mobile bottom app bar's four default actions. |
| `zIndex` | `number` |  |

### NowPlayingPage

The Currently Playing page: cover, song, seek, transport and the playback readouts — the shape both platforms share. On mobile it also carries previews of the lyrics and the queue, each opening its full page; on desktop those are the player panel's own tabs, so the previews are left out.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `image` | `string` |  |
| `title` | `string` |  |
| `artist` | `string` |  |
| `context` | `string` | "Playing from Driftwave" — the uppercase line in the mobile bar, meta on desktop. |
| `playing` | `boolean` |  |
| `progress` | `number` | 0–1. |
| `duration` | `number` | Seconds, for the seek readouts. |
| `onTogglePlay` | `() => void` |  |
| `onPrev` | `() => void` |  |
| `onNext` | `() => void` |  |
| `onShuffle` | `() => void` |  |
| `onRepeat` | `() => void` |  |
| `onSeek` | `(value: number) => void` |  |
| `onClose` | `() => void` | Collapses the sheet back to the bar (mobile). |
| `closeGlyph` | `string` |  |
| `onMore` | `() => void` |  |
| `favourite` | `boolean` |  |
| `onFavourite` | `() => void` | Renders the favourite control when set. |
| `speed` | `string` |  |
| `sleep` | `string` |  |
| `onSpeed` | `() => void` |  |
| `onSleep` | `() => void` |  |
| `lyrics` | `string[]` | Lyrics preview (mobile only) — the full sheet lives on LyricsPage. |
| `lyricsActiveIndex` | `number` |  |
| `lyricsSyncMode` | `'sync' \| 'dot' \| 'off'` |  |
| `onOpenLyrics` | `(origin: DOMRect \| null) => void` | Receives the preview row's rect, so the full page can expand out of it. |
| `queue` | `QueueItem[]` | Queue preview (mobile only) — the full list lives on QueuePage. |
| `onOpenQueue` | `(origin: DOMRect \| null) => void` | Receives the preview row's rect, so the full page can expand out of it. |
| `onPlayQueueItem` | `(item: QueueItem, index: number) => void` |  |
| `queuePreviewCount` | `number` |  |
| `header` | `ReactNode` | Replaces the top row. `null` removes it — the desktop default, where the panel has its own. |
| `footer` | `ReactNode` | Docked below the page — the BottomAppBar on mobile. |
| `scroll` | `boolean` | Own the scrolling (mobile default). Off inside the desktop panel, which scrolls itself. |
| `background` | `string` | Page surface. Defaults to `--surface-bg-alt`, a step off the library behind it. |
| `divider` | `boolean` | Force the app bar's hairline on — used while a sub-page sits against it. Otherwise scroll-driven. |

### PlayActions

The three queue actions a music item offers: **play next** (arrow_top_right), **play** (play_arrow / pause, emphasised in --accent-rose) and **play last** (last_page). Deliberately a *disconnected* group — three separate circles with a gap — to distinguish these one-shot actions from ButtonGroup's connected segments, which express a persistent selection. Hidden until the user hovers or keyboard-focuses an ancestor carrying the sn-acts-host class (MediaCard's artwork does this for you), because a desktop pointer can reveal them on demand while a permanently visible set would compete with the cover art. Touch surfaces should pass `always` or use a long-press menu instead — there is no hover to reveal them.

| prop | type | notes |
| --- | --- | --- |
| `onNext` | `() => void` | Insert directly after the current track. |
| `onPlay` | `() => void` |  |
| `onLast` | `() => void` | Append to the end of the queue. |
| `playing` | `boolean` | Swaps the centre glyph to pause. |
| `size` | `number` | Diameter of the centre button in px; the outer two are 6px smaller. Default 40. |
| `always` | `boolean` | Skip the hover gate and stay visible — for touch, or a permanently exposed row. |
| `gap` | `string` |  |

### QueuePage

Stable key. Falls back to `title`.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `heading` | `string \| null` | Page heading. Pass `null` inside the desktop player panel, whose tab already names it. |
| `context` | `string` | Line under the heading — "Playing from Driftwave". |
| `items` | `QueueItem[]` |  |
| `editing` | `boolean` | Controlled edit mode. Omit to let the page keep its own. |
| `onEditingChange` | `(editing: boolean) => void` |  |
| `onPlay` | `(item: QueueItem, index: number) => void` |  |
| `onRemove` | `(item: QueueItem, index: number) => void` |  |
| `onReorder` | `(from: number, to: number) => void` | Drag reorder, by index into `items`. |
| `onRemoveSelected` | `(keys: Array<string \| number>) => void` | The edit bar's Remove, with the selected rows' keys. |
| `footer` | `ReactNode` | Docked below the list — a BottomAppBar, for instance. |
| `scroll` | `boolean` | Own the scrolling (the default). Off inside the desktop player panel, which scrolls itself. |
| `onClose` | `() => void` | Renders the app bar's close button, which collapses the page back into what opened it. |

### QueueRow

One row of the play queue — drag handle, art, title/sub, duration, remove. The current row sits on a filled card.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `time` | `string` |  |
| `current` | `boolean` | Highlights the row as the one now playing. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |
| `onRemove` | `(e?: any) => void` |  |
| `handle` | `boolean` | Show the drag handle. Off for a read-only queue that reorders only in edit mode. |
| `editing` | `boolean` | Edit mode: adds the leading select control and drops the duration. |
| `selected` | `boolean` |  |
| `onSelectToggle` | `(e?: any) => void` |  |
| `draggable` | `boolean` |  |
| `onDragStart` | `(e?: any) => void` |  |
| `onDragOver` | `(e?: any) => void` |  |
| `onDrop` | `(e?: any) => void` |  |
| `onDragEnd` | `(e?: any) => void` |  |

### ResultRow

One row of a track, search-result or request list: art with a hover play/cancel action, title + meta, and a status pill. A percentage in `status` (or an explicit `progress`) draws a circular progress ring over the art; "queued", "searching" and "failed" get their own states.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `meta` | `string` |  |
| `status` | `string` | e.g. "In library", "Requested · 87%", "Queued", "Searching…", "Failed". "Playing" renders animated equalizer bars instead of a pill. |
| `progress` | `number \| null` |  |
| `tone` | `'library' \| 'request' \| 'progress' \| 'error'` | Colour family for the pill and ring. |
| `actionGlyph` | `string` | Glyph for the art overlay action; "downloading" renders a pause control. |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |
| `onAction` | `() => void` |  |
| `divider` | `boolean` | Hairline separator along the bottom, inset to the text column. Set on all but the last row of a list. |

### SeekBar

Seek slider plus the elapsed / remaining readouts. Pass duration in seconds; value is 0–1.

| prop | type | notes |
| --- | --- | --- |
| `value` | `number` |  |
| `duration` | `number` | Track length in seconds. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onChange` | `(next: number) => void` |  |
| `remainingAsCountdown` | `boolean` | false shows total length on the right instead of a countdown. |

### TransportBar

Now Playing control cluster: shuffle, previous, play/pause (the large accent control), next, repeat.

| prop | type | notes |
| --- | --- | --- |
| `playing` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onTogglePlay` | `() => void` |  |
| `onPrev` | `() => void` |  |
| `onNext` | `() => void` |  |
| `onShuffle` | `() => void` |  |
| `onRepeat` | `() => void` |  |

## navigation

### BackLink

Back affordance above a detail page, naming the place it returns to.

| prop | type | notes |
| --- | --- | --- |
| `label` *(required)* | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |

### BottomAppBar

Material Symbols glyph name.

| prop | type | notes |
| --- | --- | --- |
| `actions` | `BottomAppBarAction[]` |  |
| `spread` | `boolean` | Spread the actions evenly across the bar (default) instead of packing them to one edge. |
| `align` | `'start' \| 'end'` | Which edge they pack against when `spread` is off. |
| `background` | `string` |  |
| `divider` | `boolean` | Hairline along the top edge. |
| `trailing` | `ReactNode` | Pinned to the trailing edge — a primary action, for instance. |

### BottomNav

Mobile bottom tab bar. Each destination is a collapsed RailItem — same pill indicator, same always-visible stacked label, same transition as the desktop rail.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `BottomNavItem[]` |  |
| `active` *(required)* | `string` |  |
| `onChange` | `(key: string) => void` |  |

### NavRail

Material Symbols Rounded glyph name.

| prop | type | notes |
| --- | --- | --- |
| `items` | `NavRailItem[]` |  |
| `active` | `string` | Key of the active item. |
| `onChange` | `(key: string) => void` |  |
| `expanded` | `boolean` |  |
| `onToggleExpanded` | `() => void` | Shows the menu toggle above the items when provided. |
| `footer` | `ReactNode` | Pinned to the bottom — an account row, theme switch, storage meter. |
| `header` | `ReactNode` | Sits between the toggle and the items — a logo or brand mark. |

### RailItem

Navigation rail row, following the M3 rail spec. One highlight element morphs from a 56×32 icon pill (collapsed) to a pill that hugs the icon and label (expanded), so the selection never jumps; two label copies cross-fade rather than travelling. The highlight is always the width of the item's own content, never of the rail. Rows are 56px tall and stack with no gap in either state. Collapsed: 80px rail, 12px side padding. Expanded: 220–360px rail, 16px side padding. Hovering shows a faint highlight.

| prop | type | notes |
| --- | --- | --- |
| `icon` *(required)* | `string` | Material Symbols Rounded glyph name. |
| `label` *(required)* | `string` |  |
| `active` | `boolean` |  |
| `expanded` | `boolean` | false collapses to the 56×32 icon pill with a 12px stacked label. |
| `rowHeight` | `number` | Row height — 56 in a rail, 48 in the bottom tab bar. |
| `tabs` | `boolean` | Mobile tab-bar behaviour: inactive tabs hide their label and centre the icon; the active tab keeps its label and gets a wider pill. |
| `wideActive` | `boolean` | Whether the active pill widens to 72px. Defaults to `tabs` — set false in a rail. |
| `centerIcon` | `boolean` |  Centre the icon against the row's midpoint. Defaults to `tabs`. Must be false wherever the row's width animates (a rail), or the icon slides out and back during the transition.  |
| `onClick` | `() => void` |  |

### SearchButton

The app bar's search control: a search icon button that swaps to a close icon while the search field is open. TopAppBar renders one automatically when given `onSearchToggle`; use it directly only for a bar you are composing by hand.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `onToggle` | `(next: boolean) => void` |  |
| `muted` | `boolean` | Muted icon colour (the default in an app bar). |
| `label` | `string` | Overrides the accessible label, which is otherwise "Search" / "Close search". |

### TabBar

Icon + label tabs for the second row of a TopAppBar — the sub-sections of a library page (Artists / Albums / Songs, Authors / Books / Series / Narrators). Scrolls sideways when the labels outrun the width; the active tab is accent-coloured with an underline indicator. For a filter row of mutually exclusive pills use ButtonGroup instead.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `(TabBarItem \| string)[]` |  |
| `value` | `string` |  |
| `onChange` | `(key: string) => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |

### TopAppBar

Top app bar — a `--surface-bg-alt` strip above the page content. The first row carries the page title (plus optional leading/trailing controls); the page's controls — a filter ButtonGroup, or a centred SearchField — sit on a second row beneath it. The content below should have rounded top corners so the bar reads as the surface behind it.

| prop | type | notes |
| --- | --- | --- |
| `title` | `string` | Page title, set in the display face at 900. |
| `children` | `ReactNode` | Second-row content: a ButtonGroup, a SearchField, whatever the screen needs. |
| `align` | `'start' \| 'center'` | center caps the second row at 560px and centres it (the library search treatment). |
| `occlude` | `boolean` | Sits the leading/trailing controls on their own bg-alt layer so scrolling second-row content fades under them. |
| `leading` | `ReactNode` |  |
| `trailing` | `ReactNode` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `squareLeft` | `boolean` | Square the top corners of the controls row — right when a side sheet abuts it. |
| `squareRight` | `boolean` |  |
| `progress` | `number` | 0–1 scroll progress, as reported by AppShell's `onProgress`. |
| `searchOpen` | `boolean` |  In-bar search. Passing onSearchToggle adds a search button before `trailing`; when searchOpen the title fades out, a SearchField grows across the title row (autofocused), `trailing` collapses, and the button becomes a close.  |
| `onSearchToggle` | `(next: boolean) => void` |  |
| `searchValue` | `string` |  |
| `onSearchChange` | `(value: string) => void` |  |
| `searchPlaceholder` | `string` |  |
| `searchButton` | `boolean` | false hides the search icon while the field is closed — for a bar where scrolling opens search. The close icon still appears while open. |
| `searchAutoFocus` | `boolean` | false opens the field without focusing it — for search that expands on scroll rather than on a tap. |
| `searchHeight` | `string` | Height of the in-bar search field. Defaults to "100%" (fills the bar row). |
| `background` | `string` | Bar surface. Defaults to `--surface-bg-alt`; a page that owns the surface can pass `--surface-bg`. |
