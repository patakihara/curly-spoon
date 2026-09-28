<!-- GENERATED from components/**/*.d.ts by export/generate.js. Do not hand-edit. -->

# Sonora component API

Every prop each component accepts, with its type and the note from its declaration.

## core

### Badge

Small pill for counts, queue positions and status. Colors come from the status tone tokens; ink is always plain black or white.

| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `tone` | `'accent' \| 'success' \| 'warning' \| 'error' \| 'neutral'` |  |
| `size` | `'sm' \| 'md'` | md is the status-pill size used in list rows; sm is the count pill. |
| `icon` | `string` | Leading Material Symbols Rounded glyph name — the verified check, the finished tick. |
| `square` | `boolean` | Square with --radius-xs instead of a pill: the explicit-content "E" marker. |
| `plain` | `boolean` | No fill; glyph and label take the tone colour as ink instead of the tone's contrast ink. |

### BrowseCard

Navigates into a category whose content you can't name yet — distinct from Chip, which filters an existing result set. Filled with a shade of the accent, with its artwork tilted out of the bottom-right corner so the card reads as a stack of content rather than a label.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `image` | `string` | Tilted thumbnail anchored to the bottom-right corner. |
| `onClick` | `() => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |

### Button



| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `variant` | `'primary' \| 'play' \| 'secondary' \| 'ghost' \| 'danger'` | Visual style. Primary = filled accent; play = filled play rose, for a Play action; secondary = outlined surface; ghost = text-only; danger = destructive red. |
| `size` | `'sm' \| 'md' \| 'lg'` |  |
| `platform` | `'desktop' \| 'mobile'` | Desktop = sharp Feishin-style radius; mobile = fully-rounded Material pill (Booming/Symphony). |
| `icon` | `ReactNode` |  |
| `disabled` | `boolean` |  |
| `onClick` | `() => void` |  |
| `pressed` | `boolean` |  Marks the button as a toggle and sets `aria-pressed`. For a control whose label states the current state rather than the action it performs — FollowButton's "Following". Leave it undefined for an ordinary button and no attribute is emitted.  |

### ButtonGroup

M3 connected button group — a row of segments that read as one control: outer ends fully rounded, 8px inner corners, and the selected segment morphs to fully rounded on both sides. Use for library filters and mode switches, not for navigation. Never shows a native scrollbar. When the row overflows, a soft edge fade (a shadow in light theme, a glow in dark) appears only on the side(s) where content is actually clipped right now — gone the instant scrolling reaches that end, absent entirely when nothing overflows.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `(string \| { key: string; label?: string; icon?: string })[]` |  Labels, or `{ key, label?, icon? }` — `icon` is a Material Symbols Rounded glyph name. An item with an icon and no label renders as a square icon-only segment (the label is still used for its accessible name).  |
| `value` | `string` | Key of the selected segment. |
| `onChange` | `(next: string) => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `scroll` | `boolean` | @deprecated No longer needed — the edge-fade affordance is now automatic whenever the row overflows. Kept as a no-op for existing callers. |
| `tone` | `'accent' \| 'play'` | The selected segment's fill: `accent` (default), or `play` for the Browse media filter (All, Music, Podcasts, Books). |

### Chip

A tag/genre pill for filter tags: outlined at rest, filled with the accent when selected, with an optional song count.

| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `count` | `number` |  |
| `selected` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |

### EmptyState

What a page shows when it has nothing to show: a link that leads nowhere, a library with no books yet, a search that matched nothing. A glyph, the fact as a heading and one plain line, then the one way on, centred in the content column at the form width. States facts, never reassurance.

| prop | type | notes |
| --- | --- | --- |
| `icon` | `string` | Material Symbols Rounded glyph naming what is missing, drawn muted in a card-tone circle. |
| `title` *(required)* | `string` | The fact, e.g. "This page doesn't exist". |
| `body` | `string` | One line more, e.g. where the thing is found instead. |
| `action` | `ReactNode` | The one way on: a `Button`, secondary unless it plays. |
| `platform` | `'desktop' \| 'mobile'` |  |

### ExpandableText

Long prose that neither dominates nor hides — a paragraph clamped with -webkit-line-clamp, with a real, keyboard-reachable toggle. Distinct from ExpanderRow, which folds a homogeneous list group rather than a paragraph.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` | The prose. `text` is the alternative when JSX children aren't convenient. |
| `text` | `string` |  |
| `lines` | `number` | Lines shown before clamping. |
| `moreLabel` | `string` |  |
| `lessLabel` | `string` |  |
| `expanded` | `boolean` | Controlled expanded state. Omit to let the component keep its own. |
| `onToggle` | `(next: boolean) => void` |  |

### ExpanderRow

Collapses a homogeneous group inside an otherwise heterogeneous list — seven versions of one song folded behind "More releases · Show all" so the other result types stay reachable.

| prop | type | notes |
| --- | --- | --- |
| `label` *(required)* | `string` | What is being folded, e.g. "More releases". |
| `actionLabel` | `string` | The disclosure verb. |
| `expanded` | `boolean` |  |
| `onToggle` | `(next: boolean) => void` | Called with the next expanded state on click. |
| `image` | `string` | Optional stacked-art hint, leading the row. |

### FollowButton

Subscription toggle whose label states the current state, not the action to take — "Following" means you are, and pressing it stops. Inverts a normal button, so it always carries `aria-pressed`. Wraps the existing Button rather than reimplementing it.

| prop | type | notes |
| --- | --- | --- |
| `following` | `boolean` |  |
| `onChange` | `(next: boolean) => void` | Called with the next following state on click. |
| `labels` | `{ off?: string; on?: string }` | Overrides either label; the unset half falls back to "Follow" / "Following". |
| `platform` | `'desktop' \| 'mobile'` |  |
| `size` | `'sm' \| 'md' \| 'lg'` |  |

### IconButton

A round, transparent glyph button: surface ink, muted ink, or the active colour.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` | A glyph span, or any content. Ignored when `icon` is given. |
| `icon` | `string` | A Material Symbols Rounded glyph name, drawn at `--icon-sm` in place of `children`. |
| `size` | `number` |  |
| `active` | `boolean` |  |
| `tone` | `'accent' \| 'play'` | The colour `active` takes: `accent` (default), or `play` for the transport's play/pause. |
| `muted` | `boolean` |  |
| `label` *(required)* | `string` |  |
| `onClick` | `() => void` |  |

### OverflowMenu

One verb in an OverflowMenu.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `OverflowMenuItem[]` |  |
| `label` | `string` | The button's accessible name and the menu's. Default "More options". |
| `open` | `boolean` | Shows the menu open (true) or shut (false), for a still. Omit to let the button decide. |
| `onOpenChange` | `(next: boolean) => void` | Called with the next open state when the button is pressed or a verb is chosen. |
| `onSelect` | `(key: string) => void` | Called with the chosen item's key. |
| `align` | `'start' \| 'end'` | Which edge of the button the menu lines up with. Default 'end'. |
| `platform` | `'desktop' \| 'mobile'` |  |

### PreviewButton

Auditions a sample without committing it — plays without adding the item to the library or displacing whatever is currently playing. The disabled state covers a sample that hasn't loaded yet, a real fourth state alongside idle/sounding/muted.

| prop | type | notes |
| --- | --- | --- |
| `kind` | `'episode' \| 'playlist' \| 'audiobook' \| 'track'` | Selects the generated label ("Preview episode") when `label` is not supplied. |
| `label` | `string` | Overrides the generated label entirely. |
| `playing` | `boolean` | Sample is playing; the glyph flips to the sounding speaker. |
| `muted` | `boolean` | Playing with sound off — the resting state a preview starts in. |
| `disabled` | `boolean` | No sample available: dims the control, not-allowed cursor, aria-disabled. |
| `onClick` | `() => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |

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
| `progress` | `number \| null` | 0–1 resume position; draws a thin rule across the base of the artwork square. Ignored on the `icon` variant. |
| `unplayed` | `boolean` | Marks unlistened/new content with a small accent dot on the artwork's top-right. Ignored on the `icon` variant. |

### Rating

Aggregate community judgement at a glance — a single star and the value, not five stars; the number carries the information and five glyphs would only decorate it.

| prop | type | notes |
| --- | --- | --- |
| `value` *(required)* | `number` | 0–max. |
| `count` | `number` | Population; formatted compactly next to the value (17700 -> "17.7K"). |
| `max` | `number` | Scale the value is out of. |
| `platform` | `'desktop' \| 'mobile'` |  |

### SectionHeader

Heading row above a carousel, grid or list, with an optional trailing icon action.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `action` | `string` | Material Symbols Rounded glyph name for the trailing action, e.g. "arrow_forward". Omit for no action. |
| `actionLabel` | `string` |  |
| `onAction` | `() => void` |  |
| `platform` | `'mobile' \| 'desktop'` | mobile = body font at text-xl; desktop = display font at h3, 900 weight. |
| `eyebrow` | `string` | Relationship line above the title — "More like", "Popular with listeners of" — that explains why this shelf exists. |
| `image` | `string` | Subject artwork, leading the header. Falls back to the sibling CoverArt's own placeholder. |
| `round` | `boolean` | Circular thumbnail for an artist or a person; square (the default) for a show or a genre. |
| `onSubject` | `() => void` | Makes the eyebrow+title block a link to the subject the shelf is about. |
| `actionText` | `string` | A text action ("Show all") in place of the glyph `action`. Mutually exclusive with `action` — wins if both are set. |
| `trailing` | `ReactNode` |  A control of the section's own at the trailing edge, such as the `ViewToggle` over the collection the section holds. Wins over `actionText` and `action` if more than one is set.  |

### SortFilterBar

Reports the active sort/filter state and opens its picker in one control — the label is data ("All episodes • Newest"), not a fixed name, so a plain button can't stand in for it.

| prop | type | notes |
| --- | --- | --- |
| `icon` | `string` | Leading glyph. |
| `label` *(required)* | `string` | The current state, rendered as the control's own label — e.g. "All episodes • Newest". |
| `onClick` | `() => void` | Opens the sort/filter picker. |
| `trailing` | `ReactNode` | Right-aligned slot, hard right against the bar's full width — the library puts a ViewToggle here. |
| `platform` | `'desktop' \| 'mobile'` |  |

### StatusBanner

Persistent, non-blocking statement of system state — Spotify's "You're offline" bar. Unlike a toast it never times out; the message stands until the condition it describes changes.

| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` | The message. |
| `tone` | `'info' \| 'warning' \| 'error' \| 'success'` | Selects the background/ink pair from the state tokens. |
| `icon` | `string` | Leading glyph. |
| `actionLabel` | `string` | Label for the inline text action, e.g. "Retry". |
| `onAction` | `() => void` |  |
| `onDismiss` | `() => void` | Renders a close control when set; the banner has no other way to dismiss. |

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
| `tone` | `'accent' \| 'play'` | The fill: `accent` (default), or `play` for playback position (SeekBar passes it). |

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

### BackdropShell

The app frame as a real Material backdrop. Two surfaces, and only two. The **back layer** is `--surface-bg-alt` at 0dp and fills the entire background: the `rail` is a region of it, not a column beside it, and `back` (a `BackLayer`) is its heading and contextual controls. The **front layer** is `--surface-bg` at 1dp, full width, with permanently rounded top corners and a 1px light edge along the top marking the step; `subheader` is fixed to it and `children` scroll underneath. Prop names mirror `AppShell`'s wherever the meaning is the same, so a screen ports by swapping the component and moving its secondary header out of the bar into `subheader`. Unlike `AppShell` there is no `flat`/`square`: the front layer's shape is not scroll-linked and does not flatten for a sub-page. On mobile pass no `rail`, set `platform="mobile"`, and put the bottom nav in `player`.

| prop | type | notes |
| --- | --- | --- |
| `back` | `ReactNode` | Back-layer content — a `BackLayer` with the heading row and any contextual controls. It receives the front layer's scroll `progress`, which brings out its local search. |
| `rail` | `ReactNode` | A `NavRail`. Sits at back-layer level, continuous with it. Omit on mobile. |
| `children` | `ReactNode` | The screen itself — scrolls inside the front layer. |
| `subheader` | `ReactNode` | A `FrontLayerHeader`. Fixed to the front layer; receives `progress` and `platform` from it. |
| `sheet` | `ReactNode` |  The desktop side panel. With `sheetLayer="front"` pass a `SideSheet` — it draws its own dividers and animates its own width. With `sheetLayer="behind"` pass plain panel content (a title row of `--appbar-height`, then the list): the shell supplies the surface, the open/close width transition and both dividers, because a panel at the lower elevation must not be outlined.  |
| `sheetOpen` | `boolean` | Whether that panel is open. Squares the front layer's abutting corner in `front` mode only. |
| `sheetLayer` | `'front' \| 'behind'` |  Which layer the side panel belongs to. `'front'` (default) puts it above the front layer, full height, with a divider down its whole edge and the front layer squared where they meet. `'behind'` puts it below: both front-layer corners stay rounded, the front layer's shadow falls onto the panel, and the panel's rules shrink to a short one in the heading band and an inset one under it.  |
| `player` | `ReactNode` | MiniPlayer, BottomNav, or a fragment of both. Docked across the full width beneath everything. |
| `contentMinWidth` | `string` | Floor for the front-layer column, e.g. `var(--content-min-width)`. |
| `scroll` | `boolean` | false when the screen owns its own scrolling (mobile) — the front layer still tracks it. |
| `scrollKey` | `string \| number` | Identifier of the current view — gives each one its own remembered scroll position. |
| `onProgress` | `(progress: number) => void` | 0–1 scroll progress from the front layer. |
| `theme` | `string` | Sets `data-theme` on the frame. |
| `platform` | `'desktop' \| 'mobile'` |  |

### BackLayer

The backdrop's back layer: `--surface-bg-alt` at 0dp, no rounding and no elevation, carrying the page heading and the controls that inform the front layer. `BackdropShell` places it above the front layer and lets the rail run continuous with it. **Which controls belong here.** M2 puts "navigation, steppers, text fields, selection controls" on the back layer, and a filter group arguably qualifies — but a screen's secondary header belongs to the front layer. The line Sonora draws: *anything that scrolls away with the content or names a section of it goes in the front layer's `FrontLayerHeader`; anything that reconfigures what the front layer is showing may sit here in `controls`.* Sub-tabs and "Artists / Albums / Songs" are subheader; a library-scope switch or a sort mode is `controls`.

| prop | type | notes |
| --- | --- | --- |
| `title` | `string` | The page heading, in the display face at `--h2-size` (`--h3-size` on mobile). |
| `leading` | `ReactNode` | Before the title — a back link, or on mobile the account avatar (never in a filter row). |
| `trailing` | `ReactNode` | After the title — a search button, an overflow menu. |
| `controls` | `ReactNode` | Contextual controls that reconfigure the front layer, on a band below the heading. |
| `search` | `string` |  A local search, scoped to this page: its placeholder ("Search your books and requests"). The heading ends in a search button; the field comes out of it over the heading, without focus once the front layer has scrolled, with focus when the button is tapped, and goes back at the top unless it was tapped out. Not the global Search destination.  |
| `searchOpen` | `boolean` | Fixes the local search out (true) or away (false), for a still. Otherwise scroll and the button decide. |
| `progress` | `number` | 0–1 scroll progress of the front layer; `BackdropShell` supplies it. At 1 the local search comes out. |
| `platform` | `'desktop' \| 'mobile'` |  |

### BackToTop

Escape from depth. A feed that pages in more content has no bottom, so scroll position becomes a trap; this floats a way back that only the caller's own scroll-position logic reveals.

| prop | type | notes |
| --- | --- | --- |
| `visible` | `boolean` | Caller-driven; the control stays mounted and fades/rises rather than mounting on demand. |
| `label` | `string` |  |
| `onClick` | `() => void` |  |
| `offset` | `number` | Distance from the bottom edge, in px, to clear a docked player. |
| `platform` | `'desktop' \| 'mobile'` |  |

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

### FrontLayer

The backdrop's front layer: `--surface-bg` at 1dp, holding the primary content and its fixed subheader. `BackdropShell` builds one for you; use it directly only when composing a frame by hand. Its top corners are `--radius-lg` at **every** scroll position. This is the behavioural difference from `ContentPane`, which flattens its corners as you scroll: a backdrop's front layer is a persistent surface, not a sheet that docks. The 1dp step is expressed by a 1px light edge along the layer's own top, over a `--shadow-sm` lift onto whatever is behind it, and the scroll-linked hairline moves to the subheader, where it is inset to the content measure. That edge is not configurable and it is themed, because `--shadow-sm` is `0 1px 3px` cast *downward*, away from the top edge — the only place this layer meets the back layer. Measured off a render, the darkening it puts on the back layer above that boundary is **one value out of 255** in dark and at most three in light: what separates the two surfaces is the tonal step, `#080808` → `#141414` or `#FFFFFF` → `#F9F6F6`, and near black a display's black floor flattens that pair. Dark therefore draws an inner highlight (`color-mix` of `--surface-fg` at 16%, the only mark that survives on near-black); light draws a hairline in `--surface-border`, because mixing `--surface-fg` there inverts into an inner *shadow*. Light is the base rule and dark the `[data-theme="dark"]` override, so an unthemed context gets the treatment that cannot invert. The layer owns the scrolling and remembers a scroll offset per `scrollKey`, so switching views and coming back lands where you left. With `scroll={false}` a descendant owns the scroller and the layer tracks it by capture instead.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `subheader` | `ReactNode` | A `FrontLayerHeader`, fixed above the scrolling content. Cloned with `progress`/`platform`. |
| `scroll` | `boolean` | false when a descendant owns the scrolling (mobile screens) — the layer still tracks it. |
| `scrollKey` | `string \| number` |  Identifier for the view currently rendered inside. Changing it saves the outgoing view's scroll offset, restores the incoming one's (0 for a view not seen yet), and recomputes the subheader's divider state to match — without it, a fresh view inherits the previous scroll position and stays visually "scrolled".  |
| `onProgress` | `(progress: number) => void` | Fires with 0–1 scroll progress. |
| `threshold` | `number` | Scroll distance in px over which the subheader's divider fades in. Default 24. |
| `squareLeft` | `boolean` | Square the abutting corner where a `sheetLayer="front"` panel meets the layer. |
| `squareRight` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |

### FrontLayerHeader

The front layer's subheader — a fixed area on the front layer, at the same 1dp as the content scrolling below it. This is where a screen's secondary header lives in a backdrop: tabs, a connected `ButtonGroup`, a scoped `SearchField`. It is *not* part of the app bar, and it does not carry the layer's rounding; the front layer does. Its horizontal padding is `--grid-margin`, the page measure, so tabs line up with the section headings beneath them. The divider rule: - `tabs={false}` — a hairline fades in along the bottom edge with scroll progress. - `tabs={true}` — a hairline is always shown, static rather than scroll-linked, and the tabs are pinned flush to the band's bottom edge (instead of centered) so the tab bar's own underline indicator sits right on it, reading as one line instead of two. - Either way the hairline is **inset** by the page margin rather than spanning the gutters, so it reads as the top of the content column instead of cutting the surface in half. ### The scroll-spy subheader (`spy`) The band is what the content scrolls under. When the screen has no control to put in it, the band is not therefore an empty strip: with `spy` it shows the title of the section that has most recently scrolled up past it, and it shows **only once a title has scrolled under it**. At the top, before any section has passed, there is no band at all. A spy band with nothing else in it lies over the top of the content rather than in flow, so it fades in and out without moving the content. With `children` beside it, the band is always there, in flow, and the title leads it once one has passed. A screen with no section titles to spy has no subheader. Two ways to say what the titles are, neither of which requires rewriting page content: - **The caller supplies them** — `sections={['Jump back in', 'Recently added', …]}`, the same strings already passed to the `Section`s in the feed, in document order. They are matched positionally against the elements found by `spySelector`, whose default already matches the `<section>` that `Section` renders. Used only when the count matches exactly: a mismatch would label each section with its neighbour's name, so it falls back to no title instead. - **The content carries them** — any element in the scroll container with a `data-spy-title` attribute. Per-element, so it always wins over the positional list, and it is the way in when the feed is not built from `Section`. The band finds the scroller itself, by looking inside the front layer for the vertical scroller that contains sections, and watches it with a capture listener. It never writes `scrollTop`, so `FrontLayer`'s per-view scroll memory is untouched. Horizontal shelves are ignored. A title change cross-fades over `--duration-fast` on `--ease-standard`, and is instant under `prefers-reduced-motion`.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` | A `TabBar`, a `ButtonGroup`, a `SearchField` — whatever the screen's secondary header is. |
| `tabs` | `boolean` | The content is a tab bar: shows a static (non-scroll-linked) hairline and pins children to the band's bottom edge, so the tab bar's own indicator sits on that hairline. |
| `progress` | `number` | 0–1 scroll progress; `FrontLayer` supplies it. Pass it explicitly to show a scrolled state statically. |
| `spy` | `boolean` |  Turn the band into a scroll spy: it reports the section title that last passed under it. Alone, the band is hidden until one does. Leading in the band, so `children` may still sit beside it — but the case this exists for is the subheader that has no control of its own and would otherwise be an empty strip.  |
| `sections` | `Array<string \| { title?: string }>` |  The section titles, in document order — plain strings, or objects with a `title`. Matched positionally against the elements `spySelector` finds, and only when the counts agree. Ignored entirely without `spy`.  |
| `spySelector` | `string` |  Which elements count as sections. Default `'[data-spy-title],section'` — the `<section>` that `Section` already renders, plus anything explicitly tagged. Narrow it when a feed nests sections it does not want spied.  |
| `spyTitle` | `string` |  Controlled form: the title to show, `''` for none, which hides a band with nothing else in it. Supplying it switches the DOM watching off entirely, which is how a card shows a given state without being scrolled. Requires `spy` — the row is not rendered at all without it, so `spyTitle` alone does nothing.  |
| `onSpyChange` | `(title: string) => void` | Fires with the new title each time it changes, `''` when no title has passed any more. |
| `platform` | `'desktop' \| 'mobile'` |  |

### LayoutGrid

Responsive card grid — the vertical half of the grid system (Shelf is the horizontal half). By default it auto-fills columns no narrower than `--grid-item-min`, so a shelf of media cards reflows without breakpoints. A standard grid fills its row: the columns share what the minimum leaves, so a wider pane adds a column instead of an empty end, and a narrow pane shrinks its cards to a third of the row rather than dropping below three across. Pass `columns` when the count is part of the design (mobile "Jump back in" is always 2-up).

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `columns` | `number` |  Fixed column count. Rarely needed — prefer letting the item minimums decide, so the same grid reflows in a narrow pane as well as it does on a phone.  |
| `item` | `'standard' \| 'wide'` |  Item shape, which selects the minimum-width token: 'standard' for square media cards (`--grid-item-min`), 'wide' for horizontal tiles like QuickPick (`--grid-item-min-wide`). The standard mobile token is tuned to auto-fill to three columns on a phone; wide tiles are capped at `--grid-item-max-wide` instead of filling the row.  |
| `min` | `string` | Explicit minimum width, overriding the `item` token. |
| `gap` | `string` |  Gap override. Defaults to `--grid-gutter` (`--grid-gutter-mobile` on mobile), and to half of `--grid-gutter` for wide items on desktop.  |
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

### PageBody

The body of a page inside the shell: the page margin on both sides (`--grid-margin`, or `--grid-margin-mobile`), the feed's top gap and an optional reading width. Wrap every page's content in it rather than padding a page by hand; Shelf bleeds back out through this margin.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `width` | `'full' \| 'tiles' \| 'list' \| 'form'` |  The widest the content runs, not counting the margin: a tile grid, a list, a form (640 px), or the whole pane (default).  |

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
| `eyebrow` | `string` | Forwarded to SectionHeader — relationship line above the title, e.g. "More like". |
| `image` | `string` | Forwarded to SectionHeader — subject artwork, leading the header. |
| `round` | `boolean` | Forwarded to SectionHeader — circular thumbnail for an artist or a person; square for a show or a genre. |
| `onSubject` | `() => void` | Forwarded to SectionHeader — makes the eyebrow+title block a link to the subject. |
| `actionText` | `string` | Forwarded to SectionHeader — a text action ("Show all") in place of the glyph `action`. |
| `trailing` | `React.ReactNode` | Forwarded to SectionHeader — a control of the section's own at the header's trailing edge, such as a `ViewToggle`. |

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

### AboutCard

Learn about what you're listening to without leaving the player — about the episode, the show, the person, stacked beneath the transport as a filled card. Composes ExpandableText for `body` and CoverArt for `image`.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` | The card's own heading — "About the episode". |
| `heading` | `string` | The subject's name inside the card. |
| `meta` | `string` | "8 Aug 2024". |
| `image` | `string` |  |
| `round` | `boolean` | Circular art, for a person. |
| `body` | `string` | Prose, rendered through ExpandableText. |
| `lines` | `number` | Lines shown before "see more". Default 3. |
| `action` | `ReactNode` | A FollowButton, typically. |
| `badge` | `ReactNode` | A Badge — the played check. |
| `platform` | `'desktop' \| 'mobile'` |  |

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
| `fallback` | `string` | CSS background for the placeholder. Defaults to a flat `--accent`. |
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

### DownloadButton

Offline availability as a three-state control: idle -> downloading (determinate or indeterminate, cancellable mid-flight) -> done, and pressing a done button removes the download. Composes ProgressRing for the downloading state rather than drawing a second ring.

| prop | type | notes |
| --- | --- | --- |
| `state` | `'idle' \| 'downloading' \| 'done'` |  |
| `progress` | `number \| null` | 0–1. Indeterminate ring when null and `state` is 'downloading'. |
| `onClick` | `() => void` | Fires on press in every state: starts, cancels, or removes, depending on `state`. |
| `size` | `number` | Control diameter in px. |

### EpisodeRow

List row for serial spoken-word content — an episode, not a track. Carries a synopsis, a publication line, a listened/finished state and its own action bar, none of which ResultRow has room for without bending it out of shape for the lists that already use it.

| prop | type | notes |
| --- | --- | --- |
| `image` | `string` | Cover art URL. Falls back to whatever CoverArt renders in its absence. |
| `title` *(required)* | `string` |  |
| `description` | `string` | Synopsis, clamped to 2 lines. |
| `meta` | `string[]` | Parts joined with " • ", e.g. ["200K+ plays", "29 Dec 2025", "50min"]. |
| `finished` | `boolean` | Appends a "Finished" marker with a filled check in --tone-library. |
| `progress` | `number \| null` | 0–1 part-listened position; draws a thin rule under the meta line. |
| `explicit` | `boolean` | Renders the "E" marker before the title. |
| `actions` | `ReactNode` | An ItemActionBar, rendered below the synopsis. |
| `onPlay` | `() => void` | Given, reveals a play control over the artwork (hover on desktop, always on mobile). |
| `onClick` | `() => void` |  |
| `divider` | `boolean` | Hairline separator along the bottom, inset to the text column. |
| `platform` | `'desktop' \| 'mobile'` |  |

### FeatureCard

Argues for one item, at length, inside a feed — the description is the point, so this exists for recommendations that need to persuade rather than just be scanned. Tinted from its own artwork so a column of these reads as distinct recommendations, not a list.

| prop | type | notes |
| --- | --- | --- |
| `image` | `string` |  |
| `kind` | `string` | Eyebrow above the title — "Episode", "Playlist", "Audiobook". |
| `title` *(required)* | `string` |  |
| `meta` | `string` | e.g. "The LRB Podcast • 1 day ago • 56min". |
| `description` | `string` | Clamped to 2 lines. |
| `tint` | `string` | Card surface colour. Defaults to --surface-card. |
| `explicit` | `boolean` | Renders the "E" marker before the title. |
| `saved` | `boolean` | The save control shows this state. |
| `onSave` | `() => void` |  |
| `onPlay` | `() => void` |  Omit for an audiobook: a sample is the only playback a preview offers there, so when this is absent no play control is rendered at all.  |
| `onMore` | `() => void` |  |
| `preview` | `ReactNode` | A PreviewButton, rendered at the start of the bottom actions row. |
| `platform` | `'desktop' \| 'mobile'` |  |

### ItemActionBar

The per-item verb set — save, download, share, more, play — with each verb's state legible without opening a menu. Only a control whose handler is supplied is rendered. Composes DownloadButton for the download toggle rather than reimplementing its ring.

| prop | type | notes |
| --- | --- | --- |
| `saved` | `boolean` |  |
| `onSave` | `() => void` | Toggles the saved state. Given, renders the save control. |
| `download` | `'idle' \| 'downloading' \| 'done'` |  |
| `downloadProgress` | `number \| null` | 0–1; indeterminate when null and `download` is 'downloading'. |
| `onDownload` | `() => void` | Given, renders the download control (a composed DownloadButton). |
| `onShare` | `() => void` | Given, renders the share control. |
| `onMore` | `() => void` | Given, renders the overflow-menu control. |
| `onPlay` | `() => void` | Given, renders a trailing filled play circle pushed to the far edge of the bar. |
| `playing` | `boolean` |  |
| `size` | `number` | Diameter, in px, of every control in the bar. |
| `platform` | `'desktop' \| 'mobile'` |  |

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
| `eyebrow` | `string` | Muted line ABOVE the title at text-xs — the type or genre ("Playlist", "Album", "Society & Culture"). Leaves `sub` untouched. |
| `unplayed` | `boolean` | Marks unlistened/new content with a small accent dot on the artwork's top-right. |
| `savedBadge` | `boolean` | Bookmark tab on the artwork's bottom-left, for an item the user has explicitly saved. |
| `markers` | `string[]` | Small glyphs rendered before `sub` — 'push_pin' pinned, 'download_done' offline — so the caption carries state without a second row. |
| `status` | `string \| null` |  A requested item's status, e.g. "Downloading · 42%", "Needs choice", "Failed"; null for an item that is no request. The art is greyed, since the item cannot play yet, and the status sits on it as a pill in `tone`. On a card narrower than about 132px the pill keeps only the percentage (with its glyph) or the word.  |
| `tone` | `'progress' \| 'request' \| 'error' \| null` | The request's tone for `status`: `progress` (downloading, the accent), `request` (needs your choice), `error` (failed). |

### MediaHeader

Detail-page header for an album, book, podcast or artist: large art, kind label, title, a subtitle that can link onward (artist/author), meta line and two actions.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  Layout override. Omit it and the header measures itself, going compact (art on top, centred, smaller type) below `compactAt` — a real breakpoint on its own width, so the same header adapts inside a phone frame or a narrow desktop pane without being told.  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `compactAt` | `number` | Width in px below which the compact layout takes over. Default 600. |
| `kindLabel` | `string` | Uppercase kind line above the title, e.g. "Album", "Audiobook". |
| `title` | `string` | The item's name. Omit it when the page's own heading already names the item. |
| `subtitle` | `string` |  |
| `meta` | `string` |  |
| `playLabel` | `string \| null` | Label on the play button. Default "Play"; null leaves the button out. |
| `nextLabel` | `string \| null` |  Label on the play-next button. Default "Next"; null leaves the button out, for an item whose one queue button goes to the end of the queue and plays next on a long press.  |
| `lastLabel` | `string \| null` | Label on the play-last button. Default "Last"; null leaves the button out. |
| `round` | `boolean` | Circular art, for artist/author pages. |
| `onPlay` | `() => void` |  |
| `onPlayNext` | `() => void` |  |
| `onPlayLast` | `() => void` |  |
| `onSubtitle` | `() => void` | Makes the subtitle an accent-ink link. |
| `actions` | `ReactNode` |  Replaces the default Play / Next / Last cluster entirely — a page whose verbs aren't a queue (a show's Follow/notify/settings/overflow, an episode's saved/downloaded/share/ overflow). The default cluster renders exactly as it does today when this is absent.  |
| `menu` | `ReactNode` | After the actions: an `OverflowMenu` with the verbs that get no button, such as Add to library. |
| `progress` | `number \| null` | 0–1 resume position; draws a thin rule under the meta line. Omit or pass null for none. |

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

### OutputDeviceButton

Where the audio is going, and at what quality — a listener needs both without leaving the player. Also the natural home for Auralis's direct-play-vs-transcode distinction.

| prop | type | notes |
| --- | --- | --- |
| `device` | `string` | "Living room", "RENAULT" … omit when playing locally. |
| `quality` | `string` | "Lossless", "Transcoded" — a short badge beside the glyph. |
| `connected` | `boolean` | Accent ink and a filled glyph while routed to something remote. |
| `glyph` | `string` | Material Symbols Rounded glyph name. Default 'speaker'; 'cast'/'bluetooth' when the route says so. |
| `onClick` | `() => void` |  |

### PlayActions

The three queue actions a music item offers: **play next** (arrow_top_right), **play** (play_arrow / pause, emphasised in --play) and **play last** (last_page). Deliberately a *disconnected* group — three separate circles with a gap — to distinguish these one-shot actions from ButtonGroup's connected segments, which express a persistent selection. Hidden until the user hovers or keyboard-focuses an ancestor carrying the sn-acts-host class (MediaCard's artwork does this for you), because a desktop pointer can reveal them on demand while a permanently visible set would compete with the cover art. Touch surfaces should pass `always` or use a long-press menu instead — there is no hover to reveal them.

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
| `status` | `string \| null` |  e.g. "In library", "Requested · 87%", "Queued", "Searching…", "Failed"; null for a row with no status. "Playing" renders animated equalizer bars instead of a pill. On mobile a status with a percentage shows only the percentage ("42%"), beside the ring over the art.  |
| `progress` | `number \| null` |  |
| `tone` | `'library' \| 'request' \| 'progress' \| 'error' \| null` | Colour family for the pill and ring; null for a row with no status. |
| `actionGlyph` | `string` | Glyph for the art overlay action; "downloading" renders a pause control. |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` |  |
| `onAction` | `() => void` |  |
| `divider` | `boolean` | Hairline separator along the bottom, inset to the text column. Set on all but the last row of a list. |
| `number` | `number \| null` | A track number, leading the row in place of the art: an album's tracks, which share one cover. Null or omitted for art. |
| `trailing` | `ReactNode` | Rendered after the status pill, at the row's trailing edge — an overflow menu or an add control. |

### SeekBar

Seek slider plus the elapsed / remaining readouts. Pass duration in seconds; value is 0–1.

| prop | type | notes |
| --- | --- | --- |
| `value` | `number` |  |
| `duration` | `number` | Track length in seconds. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onChange` | `(next: number) => void` |  |
| `remainingAsCountdown` | `boolean` | false shows total length on the right instead of a countdown. |

### SpeedControl

Playback rate as a first-class transport control: the current multiplier plus a small "x", living inline in a transport row rather than on a settings page. Colour states default vs non-default rate — the point is that forgetting a rate change stays visible.

| prop | type | notes |
| --- | --- | --- |
| `value` | `number` | 1, 1.25, 1.5 … |
| `onClick` | `() => void` | Opens the rate picker. |
| `label` | `string` | Accessible name. Defaults to "Playback speed, <value> times". |
| `size` | `number` | Control diameter in px. |

### TransportBar

Now Playing control cluster: shuffle, previous, play/pause (the large accent control), next, repeat. `variant="spoken"` swaps previous/next for skip-back/skip-forward-by-interval and replaces the shuffle/repeat ends with `leading`/`trailing` — different verbs for spoken-word content, where "previous track" across a two-hour episode is close to useless.

| prop | type | notes |
| --- | --- | --- |
| `playing` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onTogglePlay` | `() => void` |  |
| `onPrev` | `() => void` | Ignored in `spoken`. |
| `onNext` | `() => void` | Ignored in `spoken`. |
| `onShuffle` | `() => void` | Ignored in `spoken`. |
| `onRepeat` | `() => void` | Ignored in `spoken`. |
| `variant` | `'music' \| 'spoken'` | 'music' (default) is today's shuffle/prev/play/next/repeat row, unchanged. |
| `onSkipBack` | `() => void` | `spoken` only: replaces "Previous". |
| `onSkipForward` | `() => void` | `spoken` only: replaces "Next". |
| `skipSeconds` | `number` | Interval skipped, drawn into the skip glyph's overlaid number and its label. Default 15. |
| `leading` | `ReactNode` | `spoken` only: replaces the shuffle end — a SpeedControl, typically. Nothing when omitted. |
| `trailing` | `ReactNode` | `spoken` only: replaces the repeat end — a sleep-timer control. Nothing when omitted. |

## navigation

### AccountButton

The account avatar that leads the phone's top bar: a `BackLayer`'s `leading` on a destination's home, opening Settings. A round button holding the account's picture through `CoverArt`, or, with no picture, a filled person glyph on `--surface-card`. It belongs to the heading row only, never to a filter row: a filter reconfigures the content, and the account is not a filter. On desktop, Settings sits at the foot of the rail instead.

| prop | type | notes |
| --- | --- | --- |
| `image` | `string` | The account's picture. Without it, a person glyph. |
| `label` | `string` | Accessible name and tooltip. Default "Account". |
| `size` | `number` | Diameter in px. Default 32, the mobile app bar's avatar. |
| `onClick` | `() => void` |  |

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
| `footerItems` | `NavRailItem[]` |  Destinations pinned to the rail's foot, below the items and above `footer` — Settings. Drawn as the same rows, so they light, collapse and click exactly as `items` do.  |
| `active` | `string` | Key of the active item, in `items` or `footerItems`. |
| `onChange` | `(key: string) => void` |  |
| `expanded` | `boolean` |  |
| `onToggleExpanded` | `() => void` | Shows the menu toggle above the items when provided. |
| `footer` | `ReactNode` | Pinned to the bottom — an account row, theme switch, storage meter. |
| `header` | `ReactNode` | Sits between the toggle and the items — a logo or brand mark. |

### RailFooter

The pinned bottom of a `NavRail` — the theme switch and the identity of the library you are looking at. Goes in the rail's `footer` slot, which is the one part of the rail that never scrolls, so this is where a persistent, whole-app control belongs rather than in `items`. It takes the rail's own `expanded` and mirrors it: expanded, the theme buttons sit side by side with their labels and the identity row shows its two lines; collapsed, the buttons stack and every label goes, so the footer narrows with the rail instead of clipping. Pass the same value you pass the rail — nothing is read from the DOM. Sections appear only when their handler or content does, the same rule `ItemActionBar` follows: no `onThemeChange` and there is no switch, no `title`/`image` and there is no identity row. A footer given neither renders only `children`. The theme switch sets the value; it does not apply it. Sonora's theming is `data-theme` on an ancestor, so the owning screen holds the state and puts it on the frame (`BackdropShell`'s or `AppShell`'s `theme`) — this is the control, not the mechanism.

| prop | type | notes |
| --- | --- | --- |
| `expanded` | `boolean` | The rail's expanded state. Pass the rail's own value so the two narrow together. |
| `theme` | `string` | The theme currently applied, matched against `themes` to mark the pressed button. |
| `themes` | `string[]` | Selectable theme names, in order. Default `['light', 'dark']`. |
| `themeIcons` | `Record<string, string>` | Glyph per theme name, merged over the built-in `light`/`dark`/`system` table. |
| `onThemeChange` | `(theme: string) => void` | Sets the theme. Omit it and no switch is rendered at all. |
| `title` | `string` | The library's name — "Local Library". First line of the identity row. |
| `sub` | `string` | What is in it — "Music · Books · Podcasts". Second line; hidden while collapsed. |
| `image` | `string` | Artwork for the identity avatar, through `CoverArt`. Without it the avatar is a flat `--accent` disc. |
| `avatarSize` | `number` | Avatar diameter in px. Default 28 — sized to the collapsed rail, not to a page. |
| `onIdentityClick` | `() => void` | Makes the identity row a real button — opening an account menu or a server picker. |
| `children` | `ReactNode` | Extra footer content, above the switch — a storage meter, an offline `StatusBanner`. |

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
| `leading` | `ReactNode` | Before the title. On mobile, the account avatar lives here, never in the filter row below. |
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
