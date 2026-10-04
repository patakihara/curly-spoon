<!-- GENERATED from components/**/*.d.ts by export/generate.js. Do not hand-edit. -->

# Sonora component API

Every prop each component accepts, with its type and the note from its declaration.

## basic

### AccountButton

The account avatar that leads the phone's top bar: a `BackLayer`'s `leading` on a destination's home, opening Settings. A round button holding the account's picture through `CoverArt`, or, with no picture, a filled person glyph on `--surface-card`. It belongs to the heading row only, never to a filter row: a filter reconfigures the content, and the account is not a filter. On desktop, Settings sits at the foot of the rail instead.

| prop | type | notes |
| --- | --- | --- |
| `image` | `string` | The account's picture. Without it, a person glyph. |
| `label` | `string` | Accessible name and tooltip. Default "Account". |
| `size` | `number` | Diameter in px. Default 32, the mobile app bar's avatar. |
| `onClick` | `() => void` | Opens Settings. Without it the button is drawn disabled. |

### Badge

Small pill for counts, queue positions and status. Colors come from the status tone tokens; ink is always plain black or white.

| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `tone` | `'accent' \| 'success' \| 'warning' \| 'error' \| 'neutral'` |  |
| `size` | `'sm' \| 'md'` | md is the status-pill size used in list rows; sm is the count pill. |
| `icon` | `string` | Leading Material Symbols Rounded glyph name — the verified check, the finished tick. Set at `--icon-2xs`, the size of the pill's text, with less padding before it than after the label. |
| `square` | `boolean` | Square with --radius-xs instead of a pill: the explicit-content "E" marker. |
| `plain` | `boolean` | No fill; glyph and label take the tone colour as ink instead of the tone's contrast ink. |

### Button



| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` |  |
| `variant` | `'primary' \| 'play' \| 'secondary' \| 'ghost' \| 'danger'` | Visual style. Primary = filled accent; play = filled play rose, for a Play action; secondary = outlined surface; ghost = text-only; danger = destructive red. |
| `size` | `'sm' \| 'md' \| 'lg'` |  |
| `platform` | `'desktop' \| 'mobile'` | Desktop = sharp Feishin-style radius; mobile = fully-rounded Material pill (Booming/Symphony). |
| `icon` | `ReactNode` |  |
| `disabled` | `boolean` | Drawn disabled: content at 38%, a filled variant's container at 12%, no focus or press. |
| `onClick` | `() => void` | The action. Without it the button is drawn disabled. |
| `pressed` | `boolean` |  Marks the button as a toggle and sets `aria-pressed`. For a control whose label states the current state rather than the action it performs — FollowButton's "Following". Leave it undefined for an ordinary button and no attribute is emitted.  |

### ButtonGroup

M3 connected button group — a row of segments that read as one control: outer ends fully rounded, 8px inner corners, and the selected segment morphs to fully rounded on both sides. Use for library filters and mode switches, not for navigation. Never shows a native scrollbar. When the row overflows, a soft edge fade (a shadow in light theme, a glow in dark) appears only on the side(s) where content is actually clipped right now — gone the instant scrolling reaches that end, absent entirely when nothing overflows.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `(string \| { key: string; label?: string; icon?: string })[]` |  Labels, or `{ key, label?, icon? }` — `icon` is a Material Symbols Rounded glyph name. An item with an icon and no label renders as a square icon-only segment (the label is still used for its accessible name).  |
| `value` | `string` | Key of the selected segment. |
| `onChange` | `(next: string) => void` | Receives the chosen segment's key. Without it every segment is drawn disabled. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `scroll` | `boolean` | @deprecated No longer needed — the edge-fade affordance is now automatic whenever the row overflows. Kept as a no-op for existing callers. |
| `tone` | `'accent' \| 'play'` | The selected segment's fill: `accent` (default), or `play` for the Browse media filter (All, Music, Podcasts, Books). |

### CoverArt

The artwork layer used inside every art container in the system. Absolutely fills its parent (which must be `position: relative` and `overflow: hidden`) and owns one detail that is easy to get wrong: the gradient fallback is *removed* once the image loads, rather than left behind it. A rounded corner is antialiased, so semi-transparent edge pixels blend with whatever is behind the image — a gradient left underneath shows up as a coloured fringe around the art, which no amount of image bleed can hide.

| prop | type | notes |
| --- | --- | --- |
| `src` | `string` | Image URL. Omitted or still loading, the fallback shows instead. |
| `covers` | `string[]` |  A collection's item covers, drawn when it has no `src` of its own: four different ones make a 2×2 mosaic of the first four, one to three the first alone, none the flat placeholder.  |
| `fallback` | `string` | CSS background for the placeholder. Defaults to a flat `--accent`. |
| `alt` | `string` |  |

### DownloadButton

Offline availability as a three-state control: idle -> downloading (determinate or indeterminate, cancellable mid-flight) -> done, and pressing a done button removes the download. An IconButton: outlined at rest and done, plain while its ProgressRing runs, so the ring is not drawn inside a second one.

| prop | type | notes |
| --- | --- | --- |
| `state` | `'idle' \| 'downloading' \| 'done'` |  |
| `progress` | `number \| null` | 0–1. Indeterminate ring when null and `state` is 'downloading'. |
| `onClick` | `() => void` | Fires on press in every state: starts, cancels, or removes, depending on `state`. Without it the button is drawn disabled. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl' \| '3xl'` | A step of IconButton's control ramp. Default 'sm' (36px). |

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
| `onToggle` | `(next: boolean) => void` | Receives the next expanded state. Without it a controlled toggle is drawn disabled. |

### FollowButton

Subscription toggle whose label states the current state, not the action to take — "Following" means you are, and pressing it stops. Inverts a normal button, so it always carries `aria-pressed`. Wraps the existing Button rather than reimplementing it.

| prop | type | notes |
| --- | --- | --- |
| `following` | `boolean` |  |
| `onChange` | `(next: boolean) => void` | Called with the next following state on click. Without it the button is drawn disabled. |
| `labels` | `{ off?: string; on?: string }` | Overrides either label; the unset half falls back to "Follow" / "Following". |
| `platform` | `'desktop' \| 'mobile'` |  |
| `size` | `'sm' \| 'md' \| 'lg'` |  |

### Icon

A Material Symbols Rounded glyph: the only Sonora component that sets the icon font, its size, its fill and its weight. Every glyph in Sonora draws through it, hidden from assistive technology: the control's label or the text beside it names what it does.

| prop | type | notes |
| --- | --- | --- |
| `name` *(required)* | `string` | Material Symbols Rounded glyph name, e.g. "play_arrow". |
| `size` | `'2xs' \| 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | A step of the icon size ramp, `--icon-2xs` (14px) to `--icon-xl` (40px). Default 'sm', 24px. |
| `filled` | `boolean` | The glyph's filled form, as play, active and on-state glyphs take. |
| `weight` | `'body' \| 'strong' \| 'text'` |  'body' is the regular stroke (wght 400); 'strong' the heavier one (wght 500). 'text' sets no weight: the glyph follows the font-weight of the text it sits in, as a glyph beside a button's label or in a bold caption does. Default 'body'.  |
| `style` | `CSSProperties` | Colour, placement or a transform; never the font settings Icon owns. |
| `className` | `string` | A class for an animation hook, such as a glyph that fades in when it changes. |

### IconButton

Sonora's one icon-only button, round on every variant but tonal. `variant` picks its container: `plain` (none: a glyph in surface ink, muted ink or the active colour), `outline` (a hairline ring, for a quiet verb beside a row of buttons), `tonal` (a squat pill on the card fill, for a control sitting on the page, such as the list/grid switch; changing `icon` turns the glyph over rather than cutting to it, instantly under reduced motion), `raised` (the card fill and a shadow, floating over content, as a shelf's arrows do) or `scrim` (the soft scrim in on-scrim ink, over artwork). `label` is always its accessible name.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` | A glyph, an `Icon`, or any content. Ignored when `icon` is given. |
| `icon` | `string` | A Material Symbols Rounded glyph name, drawn through Icon in place of `children`. |
| `iconSize` | `'2xs' \| 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | The `icon` glyph's step of Icon's ramp. Default 'sm' (24px); 'xs' (20px) on tonal. |
| `variant` | `'plain' \| 'outline' \| 'tonal' \| 'raised' \| 'scrim'` | The container. Default 'plain'. |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl' \| '3xl'` |  A step of the control ramp, `--control-xs` (32px) to `--control-3xl` (72px): its height, and its width but on tonal, which is a spacing step wider. Default 'sm' (36px); 'xs' on tonal.  |
| `active` | `boolean` | On: the glyph in the `tone` colour; on tonal, accent ink and the glyph filled. |
| `tone` | `'accent' \| 'play' \| 'library' \| 'inherit'` |  The colour `active` takes: `accent` (default), `play` for the transport's play/pause, or `library` for an item kept in the library. `inherit` takes the ink of what the button sits on, at rest and active, as on a status banner.  |
| `muted` | `boolean` | The muted surface ink at rest. |
| `label` *(required)* | `string` | Its accessible name. |
| `onClick` | `() => void` | The action. Without it the button is drawn disabled. |
| `disabled` | `boolean` | Drawn disabled: the glyph at 38%, a filled container at 12%, no focus or press. |
| `title` | `string` | A tooltip, usually the label. |
| `pressed` | `boolean` | For a toggle: whether it is on, announced as pressed. |
| `expanded` | `boolean` | For a menu or disclosure button: whether what it opens is open. |
| `controls` | `string` | The id of the element it opens, closes or scrolls. |
| `className` | `string` | A class for a reveal or animation hook, such as a corner button shown on hover. |
| `style` | `CSSProperties` | Placement only: position, offsets, margin, opacity. Never its size, fill or ink. |

### Input

The new text, on every keystroke. Without it the field is drawn disabled.

| prop | type | notes |
| --- | --- | --- |
| `placeholder` | `string` |  |
| `icon` | `ReactNode` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `value` | `string` |  |
| `onChange` | `(next: string) => void` | The new text, on every keystroke. Without it the field is drawn disabled. |
| `disabled` | `boolean` | Drawn disabled: text at 38%, the fill at 12% of the surface ink, no focus or typing. |

### LyricsSyncButton

The lyric sheet's sync toggle, a tonal IconButton (the list/grid toggle's pill). Synced (`sync`), the current line leads in accent ink; off, every line is at full strength and a dot marks the current one (`dot`), or nothing does (`off`) when the dot is switched off from the player's menu.

| prop | type | notes |
| --- | --- | --- |
| `mode` | `'sync' \| 'dot' \| 'off'` |  |
| `dot` | `boolean` | Whether sync off marks the current line with a dot. Default true; the player's menu turns it off. |
| `onChange` | `(mode: 'sync' \| 'dot' \| 'off') => void` | Receives the mode the toggle turns to. Without it the toggle is drawn disabled. |

### OverflowMenu

One verb in an OverflowMenu.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `OverflowMenuItem[]` |  |
| `label` | `string` | The button's accessible name and the menu's. Default "More options". |
| `open` | `boolean` | Shows the menu open (true) or shut (false), for a still. Omit to let the button decide. |
| `onOpenChange` | `(next: boolean) => void` | Called with the next open state when the button is pressed or a verb is chosen. |
| `onSelect` | `(key: string) => void` | Called with the chosen item's key: the menu's action. Without it the button is drawn disabled. |
| `align` | `'start' \| 'end'` | Which edge of the button the menu lines up with. Default 'end'. |
| `tone` | `'surface' \| 'scrim'` |  The button's own look: 'surface' (default) is a plain icon button in surface ink; 'scrim' is a small round button on a scrim in on-scrim ink, for a menu that sits over artwork.  |
| `platform` | `'desktop' \| 'mobile'` |  |

### PreviewButton

Auditions a sample without committing it — plays without adding the item to the library or displacing whatever is currently playing. The disabled state covers a sample that hasn't loaded yet, a real fourth state alongside idle/sounding/muted.

| prop | type | notes |
| --- | --- | --- |
| `kind` | `'episode' \| 'playlist' \| 'audiobook' \| 'track'` | Selects the generated label ("Preview episode") when `label` is not supplied. |
| `label` | `string` | Overrides the generated label entirely. |
| `playing` | `boolean` | Sample is playing; the glyph flips to the sounding speaker. |
| `muted` | `boolean` | Playing with sound off — the resting state a preview starts in. |
| `disabled` | `boolean` | No sample available: drawn disabled, the fill at 12% and the label at 38% of the surface ink. |
| `onClick` | `() => void` | Plays the sample. Without it the button is drawn disabled. |
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

### RailItem

Navigation rail row, following the M3 rail spec. One highlight element morphs from a 56×32 icon pill (collapsed) to a pill that hugs the icon and label (expanded), so the selection never jumps; two label copies cross-fade rather than travelling. The highlight is always the width of the item's own content, never of the rail. Rows are 56px tall and stack with no gap in either state. Collapsed: 80px rail, 12px side padding. Expanded: 220–360px rail, 16px side padding. The pill carries the row's state layer: hover, focus and a press ripple show on it, and the row is drawn disabled without `onClick`.

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
| `onClick` | `() => void` | The destination's action. Without it the row is drawn disabled. |

### Rating

Aggregate community judgement at a glance — a single star and the value, not five stars; the number carries the information and five glyphs would only decorate it.

| prop | type | notes |
| --- | --- | --- |
| `value` *(required)* | `number` | 0–max. |
| `count` | `number` | Population; formatted compactly next to the value (17700 -> "17.7K"). |
| `max` | `number` | Scale the value is out of. |
| `platform` | `'desktop' \| 'mobile'` |  |

### SearchButton

The app bar's search control: a search icon button that swaps to a close icon while the search field is open. BackLayer renders one for a page's local search; use it directly only for a bar you are composing by hand.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `onToggle` | `(next: boolean) => void` | Receives the next open state. Without it the button is drawn disabled. |
| `muted` | `boolean` | Muted icon colour (the default in an app bar). |
| `label` | `string` | Overrides the accessible label, which is otherwise "Search" / "Close search". |

### SearchField

Filled search field with no outline and soft rectangular corners (radius-xs) — the library search treatment, distinct from the pill Input.

| prop | type | notes |
| --- | --- | --- |
| `placeholder` | `string` |  |
| `value` | `string` |  |
| `onChange` | `(next: string) => void` | The new text, on every keystroke. Without it the field is drawn disabled. |
| `disabled` | `boolean` | Drawn disabled: text at 38%, the fill at 12% of the surface ink, no focus or typing. |
| `onSubmit` | `(value: string) => void` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `width` | `string` | Defaults to 100% — cap it with the parent when centering in a bar. |
| `height` | `string` | Overrides the default height (40px mobile / 44px desktop) — the app bar fills its row with "100%". |
| `autoFocus` | `boolean` | Focuses the input when it flips to true — for a field revealed by an app-bar search morph. |
| `onClose` | `() => void` | Renders the field's own trailing close control — the app bar's search morph puts its cross here. |
| `closeGlyph` | `string` |  |

### SeekBar

Seek slider plus the elapsed / remaining readouts. Pass duration in seconds; value is 0–1.

| prop | type | notes |
| --- | --- | --- |
| `value` | `number` |  |
| `duration` | `number` | Track length in seconds. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onChange` | `(next: number) => void` | Receives the position sought, 0–1. Without it the slider is drawn disabled. |
| `remainingAsCountdown` | `boolean` | false shows total length on the right instead of a countdown. |

### Slider

0–1

| prop | type | notes |
| --- | --- | --- |
| `value` | `number` | 0–1 |
| `onChange` | `(next: number) => void` | Receives the new value, from a press on the track or the arrow keys. Without it the slider is drawn disabled. |
| `platform` | `'desktop' \| 'mobile'` | Desktop: thin track + round handle (Feishin). Mobile: thick pill split by a divider notch (Booming Music). |
| `tone` | `'accent' \| 'play'` | The fill: `accent` (default), or `play` for playback position (SeekBar passes it). |

### SortFilterBar

Reports the active sort/filter state and opens its picker in one control — the label is data ("All episodes • Newest"), not a fixed name, so a plain button can't stand in for it.

| prop | type | notes |
| --- | --- | --- |
| `icon` | `string` | Leading glyph. |
| `label` *(required)* | `string` | The current state, rendered as the control's own label — e.g. "All episodes • Newest". |
| `onClick` | `() => void` | Opens the sort/filter picker. Without it the control is drawn disabled. |
| `trailing` | `ReactNode` | Right-aligned slot, hard right against the bar's full width — the library puts a ViewToggle here. |
| `platform` | `'desktop' \| 'mobile'` |  |

### SpeedControl

Playback rate as a first-class transport control: the current multiplier plus a small "x", living inline in a transport row rather than on a settings page. Colour states default vs non-default rate — the point is that forgetting a rate change stays visible.

| prop | type | notes |
| --- | --- | --- |
| `value` | `number` | 1, 1.25, 1.5 … |
| `onClick` | `() => void` | Opens the rate picker. Without it the control is drawn disabled. |
| `label` | `string` | Accessible name. Defaults to "Playback speed, <value> times". |
| `size` | `number` | Control diameter in px. |

### StateLayer

Material's state layer, shared by every interactive Sonora component. Placed as the last child of the element that shows the state, usually the control itself (a rail item's indicator pill instead), inside a host carrying the class `sn-int`. It draws a wash of the content colour for hover (8%), keyboard focus (10%) and press (10%), a focus ring 3px wide and 2px outside the shape that follows its corners, and a ripple that grows from the pointer and fades on release. The control's own box, corners and position never change. Text fields and sliders take `ripple={false}`. A control is disabled when `disabled` is set or when its action prop is absent. A disabled control's content is the surface ink at 38%, and a filled one (class `sn-filled`) sits on the surface ink at 12%; it takes no focus, no press and no state. A `button` root uses the native `disabled`; a `div` or `span` root takes a `role`, `tabIndex` of -1 when off, `aria-disabled` and Enter and Space activation; a wrapper around an input sets `data-disabled`. A preview pins a state with `data-sn-force="hovered|focused|pressed|disabled"` on an ancestor.

| prop | type | notes |
| --- | --- | --- |
| `disabled` | `boolean` | The control is disabled: the layer shows no state. |
| `ripple` | `boolean` | Whether a press ripples. Default true; false for text fields and sliders. |

### Switch

Receives the next checked state. Without it the switch is drawn disabled.

| prop | type | notes |
| --- | --- | --- |
| `checked` *(required)* | `boolean` |  |
| `onChange` | `(next: boolean) => void` | Receives the next checked state. Without it the switch is drawn disabled. |
| `label` | `string` |  |

### ViewToggle

The list ⇄ grid switch for a library page — one icon button showing the view it switches to. Sits at the top-right of the collection it controls.

| prop | type | notes |
| --- | --- | --- |
| `value` | `'list' \| 'grid'` |  |
| `onChange` | `(value: 'list' \| 'grid') => void` | Receives the view to switch to. Without it the toggle is drawn disabled. |
| `platform` | `'desktop' \| 'mobile'` |  |

## components

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

### ArtistCard

Circular artist/author/narrator card for a people shelf.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `width` | `string` |  |
| `onClick` | `() => void` | Without it the card is drawn disabled. |

### BottomNav

Mobile bottom tab bar. Each destination is a collapsed RailItem — same pill indicator, same always-visible stacked label, same transition as the desktop rail.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `BottomNavItem[]` |  |
| `active` *(required)* | `string` |  |
| `onChange` | `(key: string) => void` | Without it every destination is drawn disabled. |

### EditableList

Stable key for the row — pass it through as React's `key`.

| prop | type | notes |
| --- | --- | --- |

### EmptyState

What a page shows when it has nothing to show: a link that leads nowhere, a library with no books yet, a search that matched nothing. A glyph, the fact as a heading and one plain line, then the one way on, centred in the content column at the form width. States facts, never reassurance.

| prop | type | notes |
| --- | --- | --- |
| `icon` | `string` | Material Symbols Rounded glyph naming what is missing, drawn muted in a card-tone circle. |
| `title` *(required)* | `string` | The fact, e.g. "This page doesn't exist". |
| `body` | `string` | One line more, e.g. where the thing is found instead. |
| `action` | `ReactNode` | The one way on: a `Button`, secondary unless it plays. |
| `platform` | `'desktop' \| 'mobile'` |  |

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
| `absent` | `boolean` |  An episode of a show you don't follow: the art greyed to no colour and the title in muted ink, as MediaCard greys an item you don't own. It still plays.  |
| `explicit` | `boolean` | Renders the "E" marker before the title. |
| `actions` | `ReactNode` | The episode's own controls, rendered below the synopsis. |
| `onPlay` | `() => void` | Given, reveals a play control over the artwork (hover on desktop, always on mobile). Without it the play overlay is left out. |
| `onClick` | `() => void` | Without it the row is drawn disabled. |
| `divider` | `boolean` | Hairline separator along the bottom, inset to the text column. |
| `platform` | `'desktop' \| 'mobile'` |  |

### ExpanderRow

Collapses a homogeneous group inside an otherwise heterogeneous list — seven versions of one song folded behind "More releases · Show all" so the other result types stay reachable.

| prop | type | notes |
| --- | --- | --- |
| `label` *(required)* | `string` | What is being folded, e.g. "More releases". |
| `actionLabel` | `string` | The disclosure verb. |
| `expanded` | `boolean` |  |
| `onToggle` | `(next: boolean) => void` | Called with the next expanded state on click. Without it the row is drawn disabled. |
| `image` | `string` | Optional stacked-art hint, leading the row. |

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
| `onSave` | `() => void` | Without it its button is left out. |
| `onPlay` | `() => void` |  Omit for an audiobook: a sample is the only playback a preview offers there, so when this is absent no play control is rendered at all. Without it its button is left out.  |
| `onMore` | `() => void` | Without it its button is left out. |
| `preview` | `ReactNode` | A PreviewButton, rendered at the start of the bottom actions row. |
| `platform` | `'desktop' \| 'mobile'` |  |

### FieldRow

Labelled form field wrapping the system Input. On mobile it supplies the filled pill container the chromeless mobile Input expects to sit on.

| prop | type | notes |
| --- | --- | --- |
| `label` *(required)* | `string` |  |
| `placeholder` | `string` |  |
| `value` | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onChange` | `(next: string) => void` | Without it the field is drawn disabled. |

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
| `onLineClick` | `(index: number) => void` | Without it the lines are text, not controls. |

### MediaCard

Shelf/grid card for any library item — album, book, podcast, episode. Cover art is a deterministic tint derived from the title, so a shelf reads as distinct artwork. In a mixed shelf pass the content type as the first part of `sub` ("Book · 6 h 12 m left").

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `progress` | `number \| null` | 0–1 resume position; draws a progress bar across the bottom of the art. |
| `absent` | `boolean` |  Not-in-library state: the art greyed (no colour, darkened), the title in muted ink, and a "Not in library" pill anchored to the bottom of the art.  |
| `width` | `string` | Fixed track width; pass "100%" to fill a grid cell. |
| `size` | `'md' \| 'sm'` | 'sm' is the compact carousel size — narrower track, smaller caption type. |
| `onPlay` | `() => void` |  Queue handlers. Given any of them, a desktop card reveals a PlayActions group over its artwork on hover (play next / play / play last). Mobile cards ignore them — no hover.  |
| `onPlayNext` | `() => void` |  |
| `onPlayLast` | `() => void` |  |
| `playing` | `boolean` |  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `covers` | `string[]` |  A collection with no `image` of its own, a list or a digest: its items' covers, four different ones as a 2×2 mosaic, fewer as the first alone, none as the plain tile (CoverArt's `covers`).  |
| `onClick` | `() => void` | Without it the card is drawn disabled. |
| `onRequest` | `() => void` |  Requests the item. Given with `absent` and no `status`, a tap requests it instead of calling `onClick`, and the card shows "Requested" until `status` carries the request's live status. Opening the item stays a verb, Open, in a corner menu over the art.  |
| `onMore` | `(e?: any) => void` | Renders a corner menu button (top-right) — hover/focus-revealed on desktop, always visible on mobile. Without it the corner menu is left out. |
| `eyebrow` | `string` | Muted line ABOVE the title at text-xs — the type or genre ("Playlist", "Album", "Society & Culture"). Leaves `sub` untouched. |
| `unplayed` | `boolean` | Marks unlistened/new content with a small accent dot on the artwork's top-right. |
| `savedBadge` | `boolean` | Bookmark tab on the artwork's bottom-left, for an item the user has explicitly saved. |
| `markers` | `string[]` | Small glyphs rendered before `sub` — 'push_pin' pinned, 'download_done' offline — so the caption carries state without a second row. |
| `status` | `string \| null` |  A requested item's status, e.g. "Downloading · 42%", "Needs choice", "Failed"; null for an item that is no request. The art is greyed as an absent item's is, since it cannot play yet, and the status sits on it as a pill in `tone`. On a card narrower than about 132px the pill keeps only the percentage (with its glyph) or the word.  |
| `tone` | `'progress' \| 'request' \| 'error' \| null` | The request's tone for `status`: `progress` (downloading, the accent), `request` (needs your choice), `error` (failed). |

### MediaHeader

Detail-page header for an album, book, podcast or artist: large art, kind label, title, a subtitle that can link onward (artist/author), meta line and two actions.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  Layout override. Omit it and the header measures itself, going compact (art on top, centred, smaller type) below `compactAt` — a real breakpoint on its own width, so the same header adapts inside a phone frame or a narrow desktop pane without being told.  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `covers` | `string[]` |  A collection with no `image` of its own, a list or a digest: its items' covers, four different ones as a 2×2 mosaic, fewer as the first alone, none as the plain tile (CoverArt's `covers`).  |
| `compactAt` | `number` | Width in px below which the compact layout takes over. Default 600. |
| `kindLabel` | `string` | Uppercase kind line above the title, e.g. "Album", "Audiobook". |
| `title` | `string` |  The item's name. Omit it when the page's own heading already names the item. With no title and no action row (a person), the kind and meta are a caption: beside the art in a wide pane, centred on it, the meta at the subtitle's size.  |
| `subtitle` | `string` |  |
| `meta` | `string` |  |
| `playLabel` | `string \| null` | Label on the play button. Default "Play"; null leaves the button out. |
| `nextLabel` | `string \| null` |  Label on the play-next button. Default "Next"; null leaves the button out, for an item whose one queue button goes to the end of the queue and plays next on a long press.  |
| `lastLabel` | `string \| null` | Label on the play-last button. Default "Last"; null leaves the button out. |
| `round` | `boolean` | Circular art, for artist/author pages. |
| `onPlay` | `() => void` | Without it its button is drawn disabled. |
| `onPlayNext` | `() => void` | Without it its button is drawn disabled. |
| `onPlayLast` | `() => void` | Without it its button is drawn disabled. |
| `onSubtitle` | `() => void` | Makes the subtitle an accent-ink link. Without it the subtitle is plain text. |
| `partOf` | `string` | What the item is one part of, under the subtitle: a book's series and its number. |
| `onPartOf` | `() => void` | Makes `partOf` an accent-ink link to the whole it names. Without it the series is plain text. |
| `rating` | `ReactNode` | Under the meta line: a `Rating`, the item's community rating, as a book or a show carries one. |
| `actions` | `ReactNode` |  Replaces the default Play / Next / Last cluster entirely — a page whose verbs aren't a queue (a show's Follow/notify/settings/overflow, an episode's saved/downloaded/share/ overflow). The default cluster renders exactly as it does today when this is absent.  |
| `menu` | `ReactNode` | After the actions: an `OverflowMenu` with the verbs that get no button, such as Add to library. |
| `progress` | `number \| null` | 0–1 resume position; draws a thin rule under the meta line. Omit or pass null for none. |
| `download` | `'idle' \| 'downloading' \| 'done' \| null` |  On a phone, a DownloadButton after the buttons in this state, keeping the item offline. A desktop keeps nothing offline and never draws it. Omit or pass null for none.  |
| `onDownload` | `() => void` | Starts, cancels or removes the download, depending on `download`. Without it the download control is drawn disabled. |
| `addLabel` | `string \| null` |  The accessible name of a round add-to-a-list button after the queue buttons, such as "Add to a list". Null (the default) leaves it out.  |
| `onAdd` | `() => void` | Opens the choice of list to add the item to. Without it the add button is drawn disabled. |

### MiniPlayer

The persistent now-playing surface, in both platform variants: the tinted pill docked above the mobile bottom nav, or the desktop three-column transport bar, the one place desktop draws the transport.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `artist` *(required)* | `string` |  |
| `image` | `string` |  |
| `playing` | `boolean` |  |
| `onTogglePlay` | `() => void` | Every control with no handler is drawn disabled, the bar itself with no onOpen. |
| `onOpen` | `() => void` | Tapping the card body (mobile) or the track block (desktop) expands the full player. |
| `platform` | `'mobile' \| 'desktop'` | mobile = docked tinted pill; desktop = full-width transport bar with seek and queue controls. |
| `progress` | `number` | 0–1. Desktop only — drives the seek bar and the mm:ss elapsed readout. |
| `onSeek` | `(value: number) => void` |  |
| `duration` | `number` | Track length in seconds, for the mm:ss readouts. Desktop only. |
| `onPrev` | `() => void` |  |
| `onNext` | `() => void` |  |
| `onShuffle` | `() => void` | Desktop music bar only. |
| `onRepeat` | `() => void` | Desktop music bar only. |
| `onVolume` | `() => void` | Desktop only. |
| `queueOpen` | `boolean` | Desktop only — tints the queue button accent while the queue panel is open. |
| `onToggleQueue` | `() => void` |  |
| `lyricsOpen` | `boolean` | Desktop only — same for the lyrics button, which opens the player panel's Lyrics tab. |
| `onToggleLyrics` | `() => void` |  |
| `variant` | `'music' \| 'spoken'` | Desktop only: `spoken` swaps shuffle, previous, next and repeat for speed, skip back and forward and the sleep timer, and drops the lyrics button. |
| `onSkipBack` | `() => void` | `spoken` only. |
| `onSkipForward` | `() => void` | `spoken` only. |
| `skipSeconds` | `number` | `spoken` only: the interval skipped, in seconds. Default 15. |
| `speed` | `number` | `spoken` only: the playback rate, 1, 1.25, 1.5 … |
| `onSpeed` | `() => void` |  |
| `sleep` | `string` | `spoken` only: the sleep timer's state, "Off", "23 min". |
| `onSleep` | `() => void` |  |

### NavRail

Material Symbols Rounded glyph name.

| prop | type | notes |
| --- | --- | --- |
| `items` | `NavRailItem[]` |  |
| `footerItems` | `NavRailItem[]` |  Destinations pinned to the rail's foot, below the items and above `footer` — Settings. Drawn as the same rows, so they light, collapse and click exactly as `items` do.  |
| `active` | `string` | Key of the active item, in `items` or `footerItems`. |
| `onChange` | `(key: string) => void` | Without it every destination is drawn disabled. |
| `expanded` | `boolean` |  |
| `onToggleExpanded` | `() => void` | Shows the menu toggle above the items when provided, leaving `expanded` to the caller. |
| `toggle` | `boolean` |  Shows the menu toggle with no handler: the rail holds its own expanded state, starting from `expanded` and following it when it changes, and the hamburger (`menu`, or `menu_open` while expanded) collapses the labelled rail to the icon rail and back.  |
| `footer` | `ReactNode` | Pinned to the bottom — an account row, theme switch, storage meter. |
| `header` | `ReactNode` | Sits between the toggle and the items — a logo or brand mark. |

### PlayActions

The three queue actions a music item offers: **play next** (arrow_top_right), **play** (play_arrow / pause, emphasised in --play) and **play last** (last_page). Deliberately a *disconnected* group — three separate circles with a gap — to distinguish these one-shot actions from ButtonGroup's connected segments, which express a persistent selection. Hidden until the user hovers or keyboard-focuses an ancestor carrying Sonora's shared reveal host class, `REVEAL.host` (MediaCard's artwork does this for you), because a desktop pointer can reveal them on demand while a permanently visible set would compete with the cover art. Touch surfaces should pass `always` or use a long-press menu instead — there is no hover to reveal them.

| prop | type | notes |
| --- | --- | --- |
| `onNext` | `() => void` | Insert directly after the current track. Without it its button is drawn disabled. |
| `onPlay` | `() => void` | Without it its button is drawn disabled. |
| `onLast` | `() => void` | Append to the end of the queue. Without it its button is drawn disabled. |
| `playing` | `boolean` | Swaps the centre glyph to pause. |
| `size` | `number` | Diameter of the centre button in px; the outer two are 6px smaller. Default 40. |
| `always` | `boolean` | Skip the hover gate and stay visible — for touch, or a permanently exposed row. |
| `gap` | `string` |  |

### QueueRow

One row of the play queue — drag handle, art, title/sub, duration, remove. The current row sits on a filled card.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `time` | `string` |  |
| `image` | `string` | Cover art; the accent tile without one. |
| `current` | `boolean` | Highlights the row as the one now playing. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` | Without it the row is drawn disabled. |
| `onRemove` | `(e?: any) => void` | Without it the remove button is left out. |
| `handle` | `boolean` | Show the drag handle. Off for a read-only queue that reorders only in edit mode. |
| `editing` | `boolean` | Edit mode: adds the leading select control and drops the duration. |
| `selected` | `boolean` |  |
| `onSelectToggle` | `(e?: any) => void` | Without it the select control is drawn disabled. |
| `draggable` | `boolean` |  |
| `onDragStart` | `(e?: any) => void` |  |
| `onDragOver` | `(e?: any) => void` |  |
| `onDrop` | `(e?: any) => void` |  |
| `onDragEnd` | `(e?: any) => void` |  |

### QuickPick

Continue-listening / jump-back-in tile: small square art plus title and a meta line. Lay several out in a grid at the top of a home screen.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` | e.g. "Book · 6 h 12 m left". |
| `icon` | `string` |  Material Symbols Rounded glyph name. Given one, the tile renders the glyph on a flat accent tint instead of the gradient artwork square — the variant for destinations with no cover art of their own (Shuffle all, Downloads, Liked, a genre).  |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` | Without it the tile is drawn disabled. |
| `progress` | `number \| null` | 0–1 resume position; draws a thin rule across the base of the artwork square. Ignored on the `icon` variant. |
| `unplayed` | `boolean` | Marks unlistened/new content with a small accent dot on the artwork's top-right. Ignored on the `icon` variant. |

### ResultRow

One row of a track, search-result or request list: art with a hover play/cancel action, title + meta, and a status pill. A percentage in `status` (or an explicit `progress`) draws a circular progress ring over the art; "queued", "searching" and "failed" get their own states.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `meta` | `string` |  |
| `detail` | `string` |  A line under the meta that wraps rather than cuts, up to two lines: why the row is there, such as a recommendation's reason. Omit for a row that needs no reason.  |
| `status` | `string \| null` |  e.g. "In library", "Requested · 87%", "Queued", "Searching…", "Failed"; null for a row with no status. "Playing" renders animated equalizer bars instead of a pill. On mobile a status with a percentage shows only the percentage ("42%"), beside the ring over the art.  |
| `progress` | `number \| null` |  |
| `tone` | `'library' \| 'request' \| 'progress' \| 'error' \| null` | Colour family for the pill and ring; null for a row with no status. |
| `actionGlyph` | `string` | Glyph for the art overlay action; "downloading" renders a pause control. |
| `image` | `string` | Cover art URL. Falls back to the generated gradient when omitted. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` | Without it the row is drawn disabled. |
| `onAction` | `() => void` |  |
| `divider` | `boolean` | Hairline separator along the bottom, inset to the text column. Set on all but the last row of a list. |
| `number` | `number \| null` | A track number, leading the row in place of the art: an album's tracks, which share one cover. Null or omitted for art. |
| `trailing` | `ReactNode` | Rendered after the status pill, at the row's trailing edge — an overflow menu or an add control. |

### SectionHeader

Heading row above a carousel, grid or list, with an optional trailing icon action.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `action` | `string` | Material Symbols Rounded glyph name for the trailing action, e.g. "arrow_forward". Omit for no action. |
| `actionLabel` | `string` |  |
| `onAction` | `() => void` | Without it the action is drawn disabled. |
| `platform` | `'mobile' \| 'desktop'` | mobile = body font at text-xl; desktop = display font at h3, 900 weight. |
| `eyebrow` | `string` | Relationship line above the title — "More like", "Popular with listeners of" — that explains why this shelf exists. |
| `image` | `string` | Subject artwork, leading the header. Falls back to the sibling CoverArt's own placeholder. |
| `round` | `boolean` | Circular thumbnail for an artist or a person; square (the default) for a show or a genre. |
| `onSubject` | `() => void` | Makes the eyebrow+title block a link to the subject the shelf is about. Without it the subject is the heading, not a link. |
| `actionText` | `string` | A text action ("Show all") in place of the glyph `action`. Mutually exclusive with `action` — wins if both are set. |
| `trailing` | `ReactNode` |  A control of the section's own at the trailing edge, such as the `ViewToggle` over the collection the section holds. Wins over `actionText` and `action` if more than one is set.  |

### SettingRow

Settings list row: title, explanatory line, and a Switch on a filled card.

| prop | type | notes |
| --- | --- | --- |
| `title` *(required)* | `string` |  |
| `sub` | `string` |  |
| `checked` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onChange` | `(next: boolean) => void` | Without it the switch is drawn disabled. |

### StatusBanner

Persistent, non-blocking statement of system state — Spotify's "You're offline" bar. Unlike a toast it never times out; the message stands until the condition it describes changes.

| prop | type | notes |
| --- | --- | --- |
| `children` *(required)* | `ReactNode` | The message. |
| `tone` | `'info' \| 'warning' \| 'error' \| 'success'` | Selects the background/ink pair from the state tokens. |
| `icon` | `string` | Leading glyph. |
| `actionLabel` | `string` | Label for the inline text action, e.g. "Retry". |
| `onAction` | `() => void` | Without it the action is drawn disabled. |
| `onDismiss` | `() => void` | Renders a close control when set; the banner has no other way to dismiss. Without it the dismiss button is left out. |

### TabBar

Icon + label tabs for a page's subheader — the sub-sections of a library page (Artists / Albums / Songs, Authors / Books / Series / Narrators). Scrolls sideways when the labels outrun the width; the active tab is accent-coloured with an underline indicator. For a filter row of mutually exclusive pills use ButtonGroup instead.

| prop | type | notes |
| --- | --- | --- |
| `items` *(required)* | `(TabBarItem \| string)[]` |  |
| `value` | `string` |  |
| `onChange` | `(key: string) => void` | Without it every tab is drawn disabled. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `fill` | `boolean` | Share the row's width equally among the tabs, never scrolling: for a row of a few, like the player's. |

### TransportBar

Now Playing control cluster: shuffle, previous, play/pause (the large accent control), next, repeat. `variant="spoken"` swaps previous/next for skip-back/skip-forward-by-interval and replaces the shuffle/repeat ends with `leading`/`trailing` — different verbs for spoken-word content, where "previous track" across a two-hour episode is close to useless.

| prop | type | notes |
| --- | --- | --- |
| `playing` | `boolean` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onTogglePlay` | `() => void` | Every control with no handler is drawn disabled. |
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

### ValueRow

Label + value on a filled card (Speed · 1.0x, Sleep timer · Off). Read-only unless you pass onClick.

| prop | type | notes |
| --- | --- | --- |
| `label` *(required)* | `string` |  |
| `value` *(required)* | `string` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `onClick` | `() => void` | Without it the row is drawn disabled. |

## layouts

### BackdropShell

The app frame as a real Material backdrop. Two surfaces, and only two. The **back layer** is `--surface-bg-alt` at 0dp and fills the entire background: the `rail` is a region of it, not a column beside it, and `back` (a `BackLayer`) is its heading and contextual controls. The **front layer** is `--surface-bg` at 1dp, full width, with permanently rounded top corners and a 1px light edge along the top marking the step; `subheader` is fixed to it and `children` scroll underneath. The front layer's shape is not scroll-linked: it flattens only for a page shown with `appBar`. On mobile pass no `rail`, set `platform="mobile"`, and put the bottom nav in `player`.

| prop | type | notes |
| --- | --- | --- |
| `back` | `ReactNode` | Back-layer content — a `BackLayer` with the heading row and any contextual controls. It receives the front layer's scroll `progress`, which brings out its local search. |
| `rail` | `ReactNode` | A `NavRail`. Sits at back-layer level, continuous with it. Omit on mobile. |
| `children` | `ReactNode` | The screen itself — scrolls inside the front layer. |
| `subheader` | `ReactNode` | A `FrontLayerHeader`. Fixed to the front layer; receives `progress` and `platform` from it. |
| `sheet` | `ReactNode` |  The desktop side panel. With `sheetLayer="front"` pass a `SideSheet` — it draws its own dividers and animates its own width. With `sheetLayer="behind"` pass plain panel content (a title row of `--appbar-height`, then the list): the shell supplies the surface, the open/close width transition and both dividers, because a panel at the lower elevation must not be outlined.  |
| `sheetOpen` | `boolean` | Whether that panel is open. Squares the front layer's abutting corner in `front` mode only. |
| `sheetLayer` | `'front' \| 'behind' \| 'over'` |  Which layer the side panel belongs to. `'front'` (default) puts it above the front layer, full height, with a divider down its whole edge and the front layer squared where they meet. `'behind'` puts it below: both front-layer corners stay rounded, the front layer's shadow falls onto the panel, and the panel's rules shrink to a short one in the heading band and an inset one under it. `'over'` is Material's modal side sheet, for a window too narrow to keep the page beside the panel: pass a `SideSheet`, drawn over the whole frame, rail and player included, on a `--scrim`, the page keeping its full width beneath. While it is open everything behind it is inert and focus moves into it; Escape or a tap on the scrim calls `onSheetDismiss`, and focus returns to what held it.  |
| `onSheetDismiss` | `() => void` | `sheetLayer="over"` only: the scrim tapped or Escape pressed, to close the panel. |
| `player` | `ReactNode` | MiniPlayer, BottomNav, or a fragment of both. Docked across the full width beneath everything. |
| `contentMinWidth` | `string` | Floor for the front-layer column, e.g. `var(--content-min-width)`. |
| `scroll` | `boolean` | false when the screen owns its own scrolling (mobile) — the front layer still tracks it. |
| `scrollKey` | `string \| number` | Identifier of the current view — gives each one its own remembered scroll position. |
| `onProgress` | `(progress: number) => void` | 0–1 scroll progress from the front layer. |
| `theme` | `string` | Sets `data-theme` on the frame. |
| `appBar` | `boolean` |  A page that is not a destination, on a phone: no backdrop. The back layer becomes a top app bar on the page surface (`BackLayer`'s `appBar`) and the front layer goes flat under it, so nothing of the layer behind shows. The bottom bar and the mini-player stay in `player`.  |
| `column` | `'tiles' \| 'list' \| 'form'` |  A page with no navigation beside it, such as signing in: its heading and its content in one centred column of this reading width (`PageBody`'s widths), the heading starting at the page margin as the content does. Pass no `rail`, and give the page's `PageBody` the same `width`.  |
| `platform` | `'desktop' \| 'mobile'` |  |

### BackLayer

The backdrop's back layer: `--surface-bg-alt` at 0dp, no rounding and no elevation, carrying the page heading and the controls that inform the front layer. `BackdropShell` places it above the front layer and lets the rail run continuous with it. **Which controls belong here.** M2 puts "navigation, steppers, text fields, selection controls" on the back layer, and a filter group arguably qualifies — but a screen's secondary header belongs to the front layer. The line Sonora draws: *anything that scrolls away with the content or names a section of it goes in the front layer's `FrontLayerHeader`; anything that reconfigures what the front layer is showing may sit here in `controls`.* Sub-tabs and "Artists / Albums / Songs" are subheader; a library-scope switch or a sort mode is `controls`.

| prop | type | notes |
| --- | --- | --- |
| `title` | `string` | The page heading, in the display face at `--h2-size` (`--h3-size` on mobile). |
| `eyebrow` | `string` |  What the page is to its subject, "More like", small and muted over the title: with it the heading is SectionHeader's context form, naming a page by its subject, so the page needs no header of its own saying it again. In the display face on the backdrop, the body face in a phone's app bar.  |
| `image` | `string` | The subject's art beside the title, 40px (48px on desktop), squared unless `round`. |
| `round` | `boolean` | Round art, for a person. |
| `leading` | `ReactNode` | Before the title — a back link, or on mobile the account avatar (never in a filter row). |
| `trailing` | `ReactNode` | After the title — a search button, an overflow menu. |
| `controls` | `ReactNode` | Contextual controls that reconfigure the front layer, on a band below the heading. |
| `search` | `string` |  A local search, scoped to this page: its placeholder ("Search your books and requests"). The heading ends in a search button; the field comes out of it over the heading, without focus once the front layer has scrolled, with focus when the button is tapped, and goes back at the top unless it was tapped out. Not the global Search destination.  |
| `searchOpen` | `boolean` | Fixes the local search out (true) or away (false), for a still. Otherwise scroll and the button decide. |
| `progress` | `number` | 0–1 scroll progress of the front layer; `BackdropShell` supplies it. At 1 the local search comes out. |
| `appBar` | `boolean` |  The heading as a top app bar on the page surface, for a page that is not a destination on a phone: `--surface-bg` instead of the back layer's colour, and the title set as a mobile `SectionHeader`'s, in the body face, rather than as a display heading. `BackdropShell`'s `appBar` passes it down.  |
| `atMargin` | `boolean` |  Starts the heading at the page margin (`--grid-margin`, or `--grid-margin-mobile`), where `PageBody` starts the content under it, rather than at the heading strip's own inset. `BackdropShell`'s `column` passes it down.  |
| `platform` | `'desktop' \| 'mobile'` |  |

### FrontLayer

The backdrop's front layer: `--surface-bg` at 1dp, holding the primary content and its fixed subheader. `BackdropShell` builds one for you; use it directly only when composing a frame by hand. Its top corners are `--radius-lg` at **every** scroll position: a backdrop's front layer is a persistent surface, not a sheet that docks. The 1dp step is expressed by a 1px light edge along the layer's own top, over a `--shadow-sm` lift onto whatever is behind it, and the scroll-linked hairline moves to the subheader, where it is inset to the content measure. That edge is not configurable and it is themed, because `--shadow-sm` is `0 1px 3px` cast *downward*, away from the top edge — the only place this layer meets the back layer. Measured off a render, the darkening it puts on the back layer above that boundary is **one value out of 255** in dark and at most three in light: what separates the two surfaces is the tonal step, `#080808` → `#141414` or `#FFFFFF` → `#F9F6F6`, and near black a display's black floor flattens that pair. Dark therefore draws an inner highlight (`color-mix` of `--surface-fg` at 16%, the only mark that survives on near-black); light draws a hairline in `--surface-border`, because mixing `--surface-fg` there inverts into an inner *shadow*. Light is the base rule and dark the `[data-theme="dark"]` override, so an unthemed context gets the treatment that cannot invert. The layer owns the scrolling and remembers a scroll offset per `scrollKey`, so switching views and coming back lands where you left. With `scroll={false}` a descendant owns the scroller and the layer tracks it by capture instead.

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
| `flat` | `boolean` |  No backdrop: square corners, no lift and no light edge, so the layer and the heading above it read as one surface under a top app bar. A hairline along the top fades in as the content scrolls. `BackdropShell`'s `appBar` sets it.  |
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

### LyricsPage

The player's Lyrics tab: the song and the LyricsSyncButton on one row, the toggle in its top corner, above the lyric sheet. Dismissed by the player that holds it; it carries no back affordance of its own.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `heading` | `string \| null` | Page heading. `null` as a tab of the player, whose tab names it. |
| `title` | `string` | Song the lyrics belong to, shown under the heading. |
| `artist` | `string` |  |
| `lines` | `string[]` |  |
| `activeIndex` | `number` |  |
| `syncMode` | `'sync' \| 'dot' \| 'off'` |  |
| `dot` | `boolean` | Whether sync off marks the current line with a dot. Default true; the player's menu turns it off. |
| `onSyncModeChange` | `(mode: 'sync' \| 'dot' \| 'off') => void` |  |
| `footer` | `ReactNode` | Docked below the sheet. |
| `scroll` | `boolean` | Own the scrolling. Defaults to on for mobile, off for desktop, whose player panel scrolls itself. |
| `onClose` | `() => void` | Renders the app bar's close button, which collapses the page back into what opened it. |

### NowPlaying

The player, whole, with Now playing, Queue and Lyrics as its tabs (spoken content has no Lyrics tab), in the shape each platform wants. Mobile: a full-screen sheet over everything, the bottom bar included, expanding out of the mini-player (`from` = the bar's rect): an app bar with collapse, what it plays from and the menu, the tabs, then the active tab's page. Desktop: the side panel, `PlayerPanel`; the player bar beneath the window carries the transport.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `open` | `boolean` |  |
| `from` | `{ top: number; left: number; width: number; height: number } \| null` | Mobile only: the mini player's viewport rect, so the sheet grows out of it. |
| `onClose` | `() => void` | Collapses the sheet back to the bar, or closes the panel. Without it the mobile collapse button is drawn disabled and the desktop close button is left out. |
| `onMore` | `() => void` | Mobile only: the app bar's menu. |
| `tab` | `'now' \| 'queue' \| 'lyrics' \| string` | The active tab: 'now', 'queue' or 'lyrics'. Omit to let the player own it. |
| `onTabChange` | `(tab: string) => void` | With `tab` set and no handler, the tabs are drawn disabled. |
| `variant` | `'music' \| 'spoken'` | `spoken` drops the Lyrics tab and gives Now playing the spoken transport. |
| `track` | `{ image?: string; title?: string; artist?: string; context?: string }` |  |
| `player` | `Omit<NowPlayingPageProps, 'platform' \| 'variant' \| 'image' \| 'title' \| 'artist' \| 'context' \| 'scroll' \| 'children'>` | Playback state and handlers for the built Now playing tab. |
| `lyrics` | `Pick<LyricsPageProps, 'lines' \| 'activeIndex' \| 'syncMode' \| 'onSyncModeChange' \| 'dot'>` | The built Lyrics tab: lines, the line being sung, and the sync mode. |
| `queue` | `Omit<QueuePageProps, 'platform' \| 'heading' \| 'scroll' \| 'footer' \| 'onClose'>` | The built Queue tab. |
| `zIndex` | `number` |  |
| `children` | `ReactNode` | The active tab's page, in place of the one the player builds. |

### NowPlayingPage

The player's first tab: cover, titles, then the controls matched to what plays. `music` gets shuffle, previous, next and repeat, its speed left to the menu, and a sleep timer row; `spoken` (a podcast, a book, a YouTube episode) gets speed, skip back and forward and the sleep timer, never previous or next. On desktop the player bar carries the seek bar and the transport, so the tab leaves them out. Sits inside `NowPlaying`, which owns the app bar and the tabs.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `variant` | `'music' \| 'spoken'` | Which transport: `music` (the default) or `spoken`. |
| `image` | `string` |  |
| `title` | `string` |  |
| `artist` | `string` |  |
| `context` | `string` | "Playing from Driftwave": shown under the titles on desktop; the mobile app bar carries it. |
| `playing` | `boolean` |  |
| `progress` | `number` | 0–1. |
| `duration` | `number` | Seconds, for the seek readouts. |
| `onTogglePlay` | `() => void` | Every control with no handler is drawn disabled. |
| `onPrev` | `() => void` | `music` only. |
| `onNext` | `() => void` | `music` only. |
| `onShuffle` | `() => void` | `music` only. |
| `onRepeat` | `() => void` | `music` only. |
| `onSeek` | `(value: number) => void` |  |
| `onSkipBack` | `() => void` | `spoken` only. |
| `onSkipForward` | `() => void` | `spoken` only. |
| `skipSeconds` | `number` | `spoken` only: the interval skipped, in seconds. Default 15. |
| `favourite` | `boolean` | Whether it is a favourite; the favourite control shows when this or `onFavourite` is set. |
| `onFavourite` | `() => void` |  |
| `speed` | `number` | `spoken` only: the rate on the transport's SpeedControl, 1, 1.25, 1.5 … Music's is in the menu. |
| `onSpeed` | `() => void` |  |
| `sleep` | `string` | The sleep timer's state, "Off", "23 min", "End of chapter". |
| `onSleep` | `() => void` |  |
| `scroll` | `boolean` | Own the scrolling (mobile default). Off inside the desktop panel, which scrolls itself. |
| `children` | `ReactNode` | Stacked below the controls: the about cards. |

### PageBody

The body of a page inside the shell: the page margin on both sides (`--grid-margin`, or `--grid-margin-mobile`), the feed's top gap and an optional reading width. Wrap every page's content in it rather than padding a page by hand; Shelf bleeds back out through this margin.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `platform` | `'desktop' \| 'mobile'` |  |
| `width` | `'full' \| 'tiles' \| 'list' \| 'form'` |  The widest the content runs, not counting the margin: a tile grid, a list, a form (640 px), or the whole pane (default).  |

### PlayerPanel

The desktop player's frame: a SideSheet beside the content column, its tabs sharing the panel's width so none is cut off, over the active tab's page. `NowPlaying` fills it.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `tab` | `string` | The active tab's key. |
| `onTabChange` | `(tab: string) => void` |  |
| `onClose` | `() => void` |  |
| `tabs` | `Array<{ key: string; label: string }>` | The tabs, label only; one tab draws no row. |
| `title` | `string` | Panel heading above the tabs. Defaults to "Player": the tabs name the view. |
| `width` | `string` | Panel width. Defaults to `--side-sheet-width`. |
| `children` | `ReactNode` | The active tab's page. |

### PlayerSheet

The mobile player surface — covers the whole app frame and opens as an expansion of the now-playing bar. Pass the bar's `getBoundingClientRect()` as `from` and the sheet grows out of that exact rectangle; without one it slides up from the bottom edge. Instant under prefers-reduced-motion.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `from` | `{ top: number; left: number; width: number; height: number } \| null` | The mini player's viewport rect — a DOMRect, or `{ top, left, width, height }`. |
| `zIndex` | `number` | Stacking order over the app frame. |
| `radius` | `string` | Corner radius of the collapsed rectangle, matched to the bar it grows from. |
| `background` | `string` | Sheet surface, so the expansion never flashes a different colour than the page inside it. |
| `children` | `ReactNode` |  |

### PlayerSubPage

The shell the player's Queue and Lyrics tabs share (QueuePage, LyricsPage): a scrolling body whose first row pairs what the page is about with its controls, under an app bar naming the page when it has a heading or a close button.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `heading` | `string \| null` | Page name in the app bar. `null` as a tab of the player, whose tab names it: with no close button either, there is no app bar. |
| `meta` | `string` | What the page is about — "Playing from Driftwave", "Song · Artist". |
| `controls` | `ReactNode` | The page's own controls, on the meta row: the sync group, the edit toggle. |
| `footer` | `ReactNode` | Docked below the body — such as an edit action bar. |
| `scroll` | `boolean` | Own the scrolling. Defaults to on for mobile, off for desktop, whose player panel scrolls itself. |
| `onClose` | `() => void` | Renders the app bar's close button when set. |
| `closeGlyph` | `string` |  |
| `children` | `ReactNode` |  |

### QueuePage

Stable key. Falls back to `title`.

| prop | type | notes |
| --- | --- | --- |
| `platform` | `'desktop' \| 'mobile'` |  |
| `heading` | `string \| null` | Page heading. `null` as a tab of the player, whose tab names it. |
| `context` | `string` | What the queue is, on the meta row: "Music queue · 3 songs". |
| `items` | `QueueItem[]` | Now playing and up next. |
| `queues` | `Array<{ key: string; label: string }>` | The queues to switch between, `{ key, label }`: the music queue and the spoken queue. One draws no switch. |
| `queue` | `string` | The queue shown. |
| `onQueueChange` | `(key: string) => void` |  |
| `played` | `QueueItem[]` | What already played, oldest first: Back walks it. |
| `autoplay` | `{ title?: string; items: QueueItem[] }` | What autoplay plays once the queue runs out, and what it continues from. |
| `onClear` | `() => void` | Up next's Clear action, which empties it; an undo brings it back. Without it Clear is drawn disabled. |
| `editing` | `boolean` | Controlled edit mode. Omit to let the page keep its own. |
| `onEditingChange` | `(editing: boolean) => void` |  |
| `onPlay` | `(item: QueueItem, index: number) => void` | Without it every row outside edit mode is drawn disabled. |
| `onRemove` | `(item: QueueItem, index: number) => void` |  |
| `onReorder` | `(from: number, to: number) => void` | Drag reorder, by index into `items`. |
| `onRemoveSelected` | `(keys: Array<string \| number>) => void` | The edit bar's Remove, with the selected rows' keys. |
| `footer` | `ReactNode` | Docked below the list. |
| `scroll` | `boolean` | Own the scrolling. Defaults to on for mobile, off for desktop, whose player panel scrolls itself. |
| `onClose` | `() => void` | Renders the app bar's close button, which collapses the page back into what opened it. |

### ScrollArea

Scroll container with an Android-style overlay scrollbar — the thumb appears while the user scrolls and fades out `--duration-linger` after they stop, on every platform including desktop. Native scrollbars are suppressed, and the thumb is an overlay, so content never reflows when it appears. Its size, inset, minimum length, opacity and timings are tokens (`--scrollbar-*`, `--opacity-scrollbar`, `--duration-*`). It scrolls one axis: the other is hidden, so content can never make it scroll sideways (on `y`) or up and down (on `x`), and the thumb sits inside its clipped frame, so it never widens whatever holds the ScrollArea. On `x`, a swipe past the end stays in the ScrollArea rather than moving the page. SideSheet, FrontLayer and the player's pages scroll in it, and Shelf scrolls in it on `x`; wrap your own scrollers in it when a screen owns its scrolling.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `id` | `string` | The scrolling element's id, for a control that names it (`aria-controls`). |
| `onScroll` | `(event: UIEvent<HTMLDivElement>) => void` |  |
| `style` | `CSSProperties` | Applied to the inner scrolling element — padding, background, a flex row, etc. |
| `scrollRef` | `{ current: HTMLDivElement \| null } \| ((el: HTMLDivElement \| null) => void)` | Ref to the scrolling element itself — for saving and restoring scroll position. |
| `axis` | `'y' \| 'x'` | The axis it scrolls: `y` down the right edge, `x` along the bottom. Default `y`. |
| `thumb` | `boolean` | Draw the overlay thumb. Default true; Shelf turns it off on desktop, where arrows page it. |
| `edgeFade` | `boolean` |  Fade the start and end edges (top and bottom on `y`, left and right on `x`) by `--scroll-edge-fade` to mark content running past them — the start fade only appears once scrolled off the start, the end fade disappears at the end.  |

### Section

One block of a feed — a SectionHeader plus its content — carrying the standard spacing to the next block. Prefer this over placing SectionHeader and a Shelf/LayoutGrid loose in a page.

| prop | type | notes |
| --- | --- | --- |
| `title` | `string` | Heading text. Omit for an untitled block that still takes part in the rhythm. |
| `action` | `string` | Material Symbols glyph for the header's trailing action, e.g. 'arrow_forward'. |
| `actionLabel` | `string` |  |
| `onAction` | `() => void` | Without it the action is drawn disabled. |
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

Horizontal carousel row, scrolling in a ScrollArea on the `x` axis. Negative side margins pull the ScrollArea's clipped frame out to the page edge while matching padding keeps the first item aligned to the gutter — so cards scroll off-screen rather than stopping at the content padding, and nothing runs past the page, at the end of the row or anywhere else. `margin` must match the page's own padding. Affordances differ by platform, matching the input: desktop gets circular arrows that fade in on hover or keyboard focus and page by `step` whole items (measured from the first child, not a guessed pixel amount), disabling themselves at each end. Mobile gets ScrollArea's fading overlay thumb instead, since a touch surface has no hover state to reveal arrows.

| prop | type | notes |
| --- | --- | --- |
| `children` | `ReactNode` |  |
| `gap` | `string` | Gap between items. Defaults to `--grid-gutter`. |
| `margin` | `string` | The page padding to bleed past. Defaults to `--grid-margin`. |
| `platform` | `'desktop' \| 'mobile'` |  |
| `step` | `number` | How many items an arrow press advances. Default 2. |
| `arrows` | `boolean` | Force the paging arrows on or off. Defaults to on for desktop, off for mobile. |
| `scrollbar` | `boolean` | Force ScrollArea's fading overlay thumb on or off. Defaults to on for mobile, off for desktop. |

### SideSheet

Side sheet — a full-height panel beside the bar+content column, so it and its divider run up alongside the app bar and its own title row (`--appbar-height`) lines up with the bar's title. Animates from zero width and holds its inner content at full width so nothing reflows mid-transition.

| prop | type | notes |
| --- | --- | --- |
| `open` | `boolean` |  |
| `title` | `string` | Heading in the sheet's own header row. |
| `onClose` | `() => void` | Shows a close button in the header when provided. Without it the close button is left out. |
| `children` | `ReactNode` |  |
| `width` | `string` | Open width. Defaults to `--side-sheet-width` (320px). |
| `side` | `'left' \| 'right'` |  |
| `closeGlyph` | `string` | Material Symbols glyph for the close button. Default 'close'. |
