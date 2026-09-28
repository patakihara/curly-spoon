# Sonora Design System

A synthesized design system for **self-hosted / offline music player** interfaces, built by reading three real, unrelated open-source music apps rather than a single company's brand:

- **[Feishin](https://github.com/jeffvli/feishin)** (`jeffvli/feishin`, `development` branch) — a desktop/web player (Electron + React + Mantine) for Navidrome/Jellyfin/Subsonic servers. Flat, near-black chrome; a fully user-customizable accent color and 30 built-in themes.
- **[Booming Music](https://github.com/mardous/BoomingMusic)** (`mardous/BoomingMusic`, `master` branch) — an Android local-library player (Kotlin, Jetpack Compose + legacy Views, Material 3 / Material You).
- **[Symphony](https://github.com/zyrouge/symphony)** (`zyrouge/symphony`, `main` branch) — a lightweight offline Android player (Kotlin, Jetpack Compose, Material 3) with a 17-hue accent picker and filename-based sorting as its reason for existing.

There is no single company or brand here — three independent open-source projects, each with its own name, logo and maintainers. **Sonora is not their name**; it's this system's own name for the synthesized design language extracted from what they have in common: a dark-first (or tonal-light) surface, one big customizable accent color, square cover art, and transport controls built around play/shuffle/repeat/queue. Explore the source repos directly for anything this system simplifies away — they're linked above, and again per-component below.

No unified logo exists (and none was invented) — see **Brand marks** below.

## Index

- `ui_kits/desktop/` — desktop player click-through (Feishin-derived)
- `ui_kits/mobile/` — mobile player click-through, light and dark
- `styles.css` — root stylesheet, imports everything in `tokens/`
- `tokens/` — colors, typography, spacing, radius, shadows, motion, fonts (CSS custom properties)
- `guidelines/` — foundation specimen cards (colors, type, spacing, radius, shadows, brand marks)
- `assets/logos/` — the three real product icons/wordmarks (Feishin, Booming Music, Symphony)
- `assets/reference/` — real screenshots used as ground truth while building the UI kits
- `components/core/` — Button, ButtonGroup, IconButton, Chip, Badge, ProgressRing, QuickPick, SectionHeader, ValueRow, ViewToggle, BrowseCard, ExpandableText, ExpanderRow, FollowButton, PreviewButton, Rating, SortFilterBar, StatusBanner, EmptyState, OverflowMenu
- `components/forms/` — Input, SearchBar, SearchField, Switch, Slider, FieldRow, SettingRow
- `components/navigation/` — NavRail, RailItem, RailFooter (desktop rail), TopAppBar, TabBar, BottomAppBar, SearchButton, BackLink, BottomNav, AccountButton (mobile)
- `components/layout/` — AppShell, ContentPane, SideSheet, PlayerSheet, PlayerSubPage, PlayerPanel, EditableList, ScrollArea, LayoutGrid, PageBody, Shelf, BackLayer, BackToTop, BackdropShell, FrontLayer, FrontLayerHeader
- `components/media/` — AlbumArt, CoverArt, MediaCard, ArtistCard, MediaHeader, ResultRow, MiniPlayer, PlayActions, TransportBar, SeekBar, QueueRow, Lyrics, LyricsSyncButton, NowPlaying, NowPlayingPage, LyricsPage, QueuePage, AboutCard, DownloadButton, EpisodeRow, FeatureCard, ItemActionBar, OutputDeviceButton, SpeedControl
- `SKILL.md` — Claude Code / Agent Skills manifest

## Components

Badge, Button, ButtonGroup, Chip, IconButton, ProgressRing, QuickPick, SearchButton, SectionHeader, TabBar, ValueRow, ViewToggle, FieldRow, Input, SearchBar, SearchField, SettingRow, Slider, Switch, AlbumArt, ArtistCard, Lyrics, LyricsSyncButton, LyricsPage, MediaCard, MediaHeader, MiniPlayer, NowPlaying, NowPlayingPage, QueuePage, QueueRow, ResultRow, PlayActions, SeekBar, TransportBar, AccountButton, BackLink, BottomAppBar, BottomNav, NavRail, RailItem, TopAppBar, AppShell, ContentPane, EditableList, PlayerPanel, PlayerSheet, PlayerSubPage, ScrollArea, SideSheet, LayoutGrid, PageBody, Shelf, AboutCard, BackLayer, BackToTop, BackdropShell, BrowseCard, DownloadButton, EpisodeRow, ExpandableText, ExpanderRow, FeatureCard, FollowButton, FrontLayer, FrontLayerHeader, ItemActionBar, OutputDeviceButton, PreviewButton, Rating, SortFilterBar, SpeedControl, StatusBanner, EmptyState, OverflowMenu.

None of the three source apps ships a shared, importable web component library (two are native Android/Compose, one is an Electron/React app with no exported design-system package), so this set is a standard practical inventory sized to what a music-player UI actually needs — every value inside each component (radii, colors, spacing, the slider's two very different treatments) is copied from the real source code and screenshots, not invented. See **Intentional additions** below.

### Intentional additions
- **QuickPick** — the continue-listening tile at the top of the home screen (art plus title and a "time left" meta line); extracted so every jump-back-in row is identical.
- **SectionHeader** — the heading row above every carousel/grid, extracted so mobile and desktop headings stay in step.
- **ResultRow / MiniPlayer / MediaHeader** — the list row (track, search result or request, with its status pill and progress ring), the docked now-playing surface (one component; mobile pill and desktop transport bar are `platform` variants of each other), and the detail-page header. All three are real, recurring screen elements in the sources rather than named components; extracting them is what makes detail pages composable.
- **MediaCard / ArtistCard** — one shelf card for any library item (album, book, podcast, episode) with resume progress, a not-in-library pill anchored to the bottom of the art, and an optional corner menu (`onMore`, hover/focus-revealed on desktop, always visible on mobile) — plus its circular people variant. The sources draw these ad hoc per screen.
- **FieldRow / SettingRow / BackLink** — the labelled field, the settings list row, and the back affordance that names where it returns to; extracted so settings and detail screens compose without one-off markup.
- **ButtonGroup** — the Material 3 *connected button group* used as the library filter row on Browse (All / Music / Books / Podcasts / Requests): segments sit 2px apart with 8px inner corners and fully rounded outer ends, and the selected segment morphs to fully rounded. Ported from the Auralis reskin, where it replaced a loose chip row.
- **NowPlaying (+ NowPlayingPage, LyricsPage, QueuePage, PlayerSheet, PlayerPanel, BottomAppBar, LyricsSyncButton)** — the Currently Playing surface as one canonical shape with two platform forms, taken from the Auralis reskin's player and componentized. `NowPlaying` takes one set of props (`track`, `player`, `lyrics`, `queue`) and renders either form: on mobile a `PlayerSheet` covering the app, expanding out of the now-playing bar's own rectangle, where lyrics and queue are *previews* that open full pages — reachable without scrolling from a `BottomAppBar`; on desktop a `PlayerPanel` (SideSheet) where lyrics and queue are sibling *tabs* rather than page sections. `LyricsPage` carries the tri-state `LyricsSyncButton` (synced → current line marked by an accent dot only → no sync, no indication — the last two ungrey every line), `QueuePage` carries the edit-mode toggle that turns on selection, drag handles and the remove bar.
- **TransportBar / SeekBar / QueueRow / Lyrics / ValueRow** — the Now Playing surface, broken up: the five-control transport cluster, the seek slider with its elapsed/remaining readouts, a draggable queue row, the synced lyric list, and the label+value card (Speed, Sleep timer). All five were loose markup in the source screens; naming them is what stops each new player surface reinventing them.
- **TopAppBar / SearchField / SearchBar** — the bg-alt strip above page content (filter chips, or a centred search), the filled outline-free field it holds (SearchField, soft rectangular corners), and the pill variant for inline search (SearchBar). Neither source app names these; extracting them is what lets every page drop its title and share one control shelf.
- **IconButton** — none of the three apps names this as a discrete primitive, but all three use a circular icon-only control constantly (transport, toolbars); wrapping it made every UI kit's code consistent.
- **Badge** — a small generic count pill; genuinely present (queue positions, "new" markers) but not a named component in any source.

## Motion

One curve, five named durations, in `tokens/motion.css` — components name the role of a change, never a number:

- `--ease-standard` `cubic-bezier(.4,0,.2,1)` — every transition in the system uses it.
- `--duration-instant` 70ms — scroll-linked (ContentPane corners and hairline).
- `--duration-fast` 150ms — hover/press feedback, image fade-in.
- `--duration-quick` 200ms — small state swaps (ButtonGroup radius/colour, TabBar indicator).
- `--duration-medium` 280ms — app-bar rows, SideSheet, search morph.
- `--duration-slow` 420ms — NavRail expand/collapse and the nav pill.

Scrims over artwork are tokens too, since a photo needs darkening rather than a surface colour: `--scrim-soft` (hover actions), `--scrim` (progress/queued/failed state), `--scrim-strong` (label pills, not-in-library), with `--on-scrim` for ink on any of them. `--surface-hover` is the wash under transparent controls and inverts with the theme.

## Content fundamentals

- **Voice is instructional and matter-of-fact**, written by developers for users who self-host their own media. Booming Music's tagline, "Modern design. Pure sound. Fully yours.", is short and declarative — no hype adjectives beyond that.
- **Second person, minimal address**: UI copy is almost all nouns and short verb phrases — "Top Tracks", "Last added", "Shuffle", "Play all", "Not Recently Played" — not full sentences. Buttons name the action, not "Click here to...".
- **Feature descriptions favor plain technical nouns** over marketing language: Symphony's README explains its own reason for existing plainly — the maintainer needed filename/path-based sorting and "felt like trying out Kotlin and Compose, so I ended up making my own" rather than forking an existing player.
- **READMEs use emoji as section markers** (🎵, ✨, 📸, 🔗) in GitHub docs (Booming Music, Symphony), but **in-app UI copy uses no emoji at all** — screenshots show plain text labels only. Treat emoji as a documentation-only convention, never an in-product one.
- **Casing**: Title Case for section headers and screen titles ("Not Recently Played", "Suggested Artists"); sentence case for body copy and settings descriptions.
- **No filler or reassurance copy** — empty states and settings screens state facts ("0 folders, 551 files") rather than friendly filler sentences.

## Visual foundations

**One surface system, one accent, two themes.** Sonora has one accent, violet, which no user picks, plus a second named colour, the play rose. This system standardizes on Feishin's flat neutral chrome for *every* surface — desktop and mobile share the exact same `--surface-*` tokens, no separate mobile color system.

- **Color**: One surface system, one token set, both platforms. `--surface-bg` / `--surface-bg-alt` / `--surface-card` / `--surface-fg` / `--surface-fg-muted` / `--surface-border` are dark by default (Feishin) — `#141414` bg / `#080808` bg-alt / `#1C1B1D` card with `rgb(225,225,225)` text — and flip to light (`#F9F6F6` bg / `#FFFFFF` bg-alt / `#E8E1E1` card with `rgb(25,25,25)` text) inside a `[data-theme="light"]` scope. No component branches its colors by platform anymore. The only tokens kept from the Android sources' Material palette are the two-stop `--art-gradient-start`/`--art-gradient-end` duotone used for album-art placeholders (`#4D5C92`→`#75546F` light, `#B6C4FF`→`#FFB7DB` dark) — the Material tonal-surface and chroma-role systems are gone. `--accent` (violet `#8B5CF6`, `--accent-ink` for text) is the one app accent. `--play` (rose `#F44862`, `--play-contrast` black ink for a label on it, `--play-icon` white for the glyph of a play or pause button, `--play-ink` for text) marks only what is about playback: Now Playing, the mini player, the transport, seek and listening-progress fills, the in-library tone, and the Browse media filter. Nothing is green: `--state-success` is for genuine success states only.
- **Theming is explicit, never inferred**: dark is the default (no attribute needed) and light lives in a `[data-theme="light"]` scope, so any container can be themed by setting `data-theme="light"` on it (two themes can sit side by side on one page, as the mobile kit does). There is deliberately **no** `prefers-color-scheme` rule and no `theme` prop on components — components only read `--surface-*` and inherit whichever scope they render inside.
- **Type**: Feishin's Mantine scale, copied exactly — body text sits at 14–16px, headings are unusually heavy (font-weight 900 at every heading size, 36px down to 20px). No italics anywhere in any of the three apps.
- **Backgrounds**: no photography, no hand-drawn illustration, no repeating texture/pattern, no gradients in chrome. The only "image" surface is user album art — every hero/featured element is built by tinting a flat card with the accent color, never a background photo.
- **Animation**: minimal. Feishin uses a plain 0.2s ease-in-out fade for sidebar art and a 0.2s color transition on nav-item hover — no bounce, no spring, no parallax anywhere in the source code read.
- **Hover states** (desktop, Feishin): subtle — nav links shift from foreground-gray to the accent color; buttons rely on Mantine's built-in ~10% opacity/lightness shift. **Press/active states** (mobile): a pill-shaped fill behind the selected control — the bottom-nav active icon sits on an accent-tinted pill mixed from the current background.
- **Borders**: nearly invisible — Feishin's only visible border is `1px solid` at ~50% alpha over the border token, used once (the player bar's top edge). Mobile surfaces separate by flat neutral steps (`--surface-card`, `--surface-bg-alt`) instead of borders.
- **Shadows**: desktop uses Mantine's soft, low-opacity 6-step shadow scale (copied verbatim into `tokens/shadows.css`); mobile uses no drop shadows at all — depth comes from the flat neutral surface-container steps.
- **Corner radii**: one merged scale for both platforms (`--radius-xs` … `--radius-2xl` plus `--radius-pill`) — there is no separate mobile radius set. Desktop chrome uses the small end (3–5px on controls and cards); mobile uses the large end (16–28px on cards and sheets) and `--radius-pill` for buttons, chips and the bottom-nav selection indicator. Same tokens, different ends of the ramp.
- **Imagery color vibe**: warm-toned, high-contrast lifestyle/abstract photography for album art placeholders (seen in Booming Music's screenshots — sparks, silhouettes, florals) — not cool/blue, not black-and-white, not heavily grained.
- **Transparency/blur**: used sparingly and only for scrims — e.g. Feishin's header overlay is a black-to-transparent linear-gradient over art, never a blurred glass panel.
- **Cards**: no visible border in either system; desktop cards are a flat surface-color square with a title/subtitle beneath; mobile cards are the same shape at a much larger radius, sometimes with a numeric badge overlay (queue/track count).
- **Layout**: desktop is a fixed three-region app shell — collapsible sidebar, scrollable content, a persistent three-column player bar pinned to the bottom. Mobile is a single scrollable column with a persistent mini-player pinned directly above a 4–5 item bottom tab bar; tapping the mini-player expands to a full-screen Now Playing sheet.

## Iconography

- **Booming Music & Symphony** (Android/Compose) use **Material Symbols** (Google's outlined icon set) throughout — this is Android platform convention, not a substitution. Link the CDN font/SVG set (`fonts.google.com/icons`, Outlined style, default 24px/400 weight) when building mobile screens.
- **Feishin** (React) imports icons piecemeal from the `react-icons` package — at least the Remix Icon (`ri`) and css.gg (`ci`) subsets (e.g. `RiPlayFill`, `RiPauseFill`, `CiImageOn`). **This system deliberately does not carry that fork forward**: desktop screens here use the same Material Symbols Rounded set as mobile, so one icon vocabulary covers every surface. If you are patching Feishin itself, match its Remix Icon imports instead.
- No custom icon font, icon sprite sheet, or SVG icon library ships in any of the three repos — all are consuming pre-existing open icon sets, not drawing their own. The mobile UI kit and component cards render **real Material Symbols Rounded** glyphs by name (`play_arrow`, `pause`, `skip_next`, `home`, `album`, `search`, `stat_minus_1`, …) via the Google Fonts icon stylesheet loaded in `tokens/fonts.css` — set `font-family: 'Material Symbols Rounded'` and use the glyph name as the element's text. Never hand-draw an SVG substitute.
- No emoji in-product (see Content fundamentals). Emoji appear only in GitHub documentation.

## Brand marks

Three real, separate products, three real logos — copied into `assets/logos/` and shown on the **Brand** guideline card. This system does **not** have (or invent) a single unifying logo or brand mark; where a screen needs "the brand," it renders the plain product name in the display font instead. Do not create a new composite logo for "Sonora" — that name exists only to label this synthesized design language, not a real product.

## Font substitution — please read

- **Body/UI font**: **Inter** — this is Symphony's actual default font choice (`SymphonyBuiltinFonts.Inter`) and a close match to Feishin's system-sans-serif fallback. No substitution needed; it's a real Google Font.
- **Body weight**: body and UI copy default to **500** (`--weight-body`); 400 read too light against the flat dark chrome. Weights are tokens, never numbers at the call site: `--weight-regular` 400, `--weight-body` 500, `--weight-medium` 600 (dense list and card titles), `--weight-strong` 700 (emphasis, labels, controls), `--weight-super-strong` 900 (headings).
- **Two display roles**: page titles use `--font-display` at the h2/h3 sizes, set on Archivo's *width* axis (`--display-stretch` 112%, `--display-weight` 700) so the title reads wide and squat without a transform on the type; section and panel headings use `--font-heading` (the same family at default width) so they read as a level down rather than competing.
- **Display/heading font**: Booming Music's real font is **Google Sans Flex** (`GoogleSansFlex`, bundled as local `.ttf` resources in `app/src/main/res/font/`) — an internal Google typeface not published on Google Fonts. This system substitutes **Archivo Black** — the heaviest cut of the Archivo grotesque; the variable family tops out at 900 but still reads light at display sizes, so headings use the Black cut (Roboto Flex, tried first, read narrow rather than heavy). **If you can export the real Google Sans Flex `.ttf` files from the Booming Music APK/repo, swap them into `tokens/fonts.css` as `@font-face` rules** — the substitution is functional but not pixel-identical.

## Sources referenced

Explore these directly for anything this summary simplifies — they're the ground truth:
- https://github.com/jeffvli/feishin (development branch)
- https://github.com/mardous/BoomingMusic (master branch)
- https://github.com/zyrouge/symphony (main branch)

## Component index

Current — use these:

- **Core**: Badge, Button, ButtonGroup, BrowseCard, Chip, EmptyState, ExpandableText, ExpanderRow, FollowButton, IconButton, OverflowMenu, PreviewButton, ProgressRing, QuickPick, Rating, SectionHeader, SortFilterBar, StatusBanner, TonalIconButton, ValueRow, ViewToggle
- **Media**: AboutCard, AlbumArt, ArtistCard, CoverArt, DetailPage, DownloadButton, EpisodeRow, FeatureCard, ItemActionBar, Lyrics, LyricsPage, LyricsSyncButton, MediaCard, MediaHeader, MiniPlayer, NowPlaying, NowPlayingPage, OutputDeviceButton, PlayActions, QueuePage, QueueRow, ResultRow, SeekBar, SpeedControl, TransportBar
- **Layout**: AppShell, BackLayer, BackToTop, BackdropShell, CircleReveal, CollectionPage, ContentPane, EditableList, FrontLayer, FrontLayerHeader, LibraryShell, PlayerPanel, PlayerSheet, PlayerSubPage, ScrollArea, Section, SideSheet, LayoutGrid, PageBody, Shelf

### Layout & the grid system

The layout family exists because the app frame has relationships that are easy to get wrong by hand, and were in fact wrong in both kits before it existed:

- **AppShell** — the component that ties the frame together. The app bar spans the content *and* the side sheet but not the rail; the sheet sits *under* the bar rather than beside it full-height; the player spans everything; and the content pane squares its abutting corner whenever the sheet is open. A screen supplies only its own content.
- **TopAppBar's two parts** — the bar proper is one fixed-height `--surface-bg-alt` strip (`--appbar-height` 96 / `--appbar-height-mobile` 60) holding the menu, title and search. Anything below it — filter chips, a tab row, the centred search field — sits on the *page* surface (`--surface-bg`) in a fixed `--appbar-controls-height` band with its controls centred (so swapping chips for a search field never changes the height), carrying the rounded top corners (left only when a side sheet squares the right edge) and keeping them at every scroll position. The content pane below is always square in this model (`square`), marking the boundary with its scroll-linked hairline alone, so the rounding lives in exactly one place: the controls row, when a view has one.
- **ContentPane** — the `--surface-bg` page surface on the bar's `--surface-bg-alt`. Top corners rounded at rest; past 24px of scroll they flatten and a hairline fades in along the top edge, marking that the content now runs under the bar. `square` keeps the hairline but drops the rounding, for when the app bar's controls row owns the corners. Give it a `scrollKey` (AppShell forwards one) and each view keeps its own scroll position across navigation, with the corner state recomputed on arrival.
- **SideSheet** — the full-height panel beside the content column, its title row matched to the `--appbar-height` bar strip, animating from zero width with its inner content held at full width so nothing reflows mid-transition.
- **NavRail** — the rail itself: a bg-alt column whose head holds the bar strip's height and the hamburger that collapses the labelled rail to the icon rail and back (`toggle`, or `onToggleExpanded` to hold the state outside) and whose footer stays pinned, with the item list taking any overflow (it scrolls rather than squashing rows); RailItems animate between `--rail-width-collapsed` (108px) and `--rail-width-expanded` (268px) on the same curve the RailItem pill uses.
- **ScrollArea** — every scrolling surface in the system. Native scrollbars are suppressed in favour of an Android-style overlay thumb: it appears as you scroll and fades out ~900ms after you stop, on desktop as well as mobile. Because the thumb is an overlay, content never reflows when it appears. ContentPane and SideSheet use it internally.
- **TabBar / SearchButton** — the two app-bar pieces a library page needs: icon+label tabs for its sub-sections (Artists / Albums / Songs, Authors / Books / Series / Narrators) with an accent underline, and the search icon that opens the field. The field carries its own close cross while it is out, so the bar's other actions stay in place rather than being swapped away — TopAppBar renders SearchButton itself when given `onSearchToggle`, collapsing it as the field takes its slot.
- **ViewToggle / TonalIconButton** — the list ⇄ grid switch at the top-right of a collection, showing the view it switches to, built on TonalIconButton: an icon button on a card fill, a 40×32 pill rather than a circle, whose glyph turns over when it changes instead of cutting.
- **LibraryShell** — the behaviour between the views and the chrome: each view remembers its own detail page (leave and come back and it is still open), its sub-tabs and list/grid mode, its scroll position, and how the app bar's search behaves (out on scroll without focus, focused on tap, put away when a detail opens or closes). Views are declared as data; the current state arrives in `children` as a function.
- **CollectionPage** — the page behind a Section's action arrow: everything that shelf was showing a slice of, with the same reveal and surface rules as DetailPage plus the list/grid switch. LibraryShell's `openCollection` names it in the app bar and gives it the back arrow; unlike a detail page it has no search of its own.
- **DetailPage** — one library item: MediaHeader over its list, revealed as a circle from the point that opened it. `overlay` floats it above the view beneath (mobile); otherwise it is page content (desktop).
- **EditableList** — a list with an edit mode: ordinary tappable rows out of it, selection plus drag reorder and a bottom-sticky action bar in it. Selection and drag state live in the component; the caller owns only the `editing` flag and renders each row. QueuePage is its first consumer.
- **PlayerSubPage** — the shell every page the player opens shares (lyrics, queue): an app bar carrying the page name alone, then a body whose first row pairs what the page is about with its own controls (the sync group, the edit toggle). No back affordance — the surface that expanded the page collapses it again.
- **PlayerSheet / PlayerPanel** — the two containers the player lives in. PlayerSheet is the mobile one: it covers the whole app frame and opens by expanding the now-playing bar's rectangle (give it the bar's `getBoundingClientRect()`), animating a `clip-path` inset rather than a scale so nothing inside is ever stretched; without a rect it slides up from the bottom edge, and under prefers-reduced-motion it appears instantly. PlayerPanel is the desktop one: a SideSheet beside the content column carrying Now playing / Queue / Lyrics as tabs. Both are driven by `NowPlaying`, which decides which shape a platform gets.
- **CircleReveal** — opens a full-surface page as a circle growing from the point that was tapped (detail pages out of their card). Takes the pointer coordinates; falls back to the centre, and appears instantly under prefers-reduced-motion.
- **Section** — one block of a feed: a SectionHeader plus its content, carrying the standard gap to the next block, so every home/browse row keeps the same rhythm.
- **ProgressRing** — the circular indicator over cover art and anywhere else work is in flight: determinate when given a 0–1 value, an animated rotating arc when not.
- **LayoutGrid / Shelf** — the two halves of the grid system. LayoutGrid auto-fills columns no narrower than the item minimum for its shape — `--grid-item-min` for square media cards, `--grid-item-min-wide` for horizontal tiles like QuickPick (`item="wide"`). A standard grid fills its row: its columns share what the minimum leaves, so a wider pane adds a column rather than leaving the row's end empty, and a narrow pane shrinks its cards to a third of the row rather than dropping below three across. The standard mobile minimum is tuned so a phone viewport minus its page margins auto-fills to exactly three columns, so mobile uses the same auto-fill system as desktop rather than a hard column count; wide tiles are capped at `--grid-item-max-wide` instead of filling. Shelf is the horizontal carousel: negative side margins pull it to the page edge while matching padding keeps the first card on the gutter, so cards scroll off-screen instead of clipping at the padding. Its affordances follow the input — desktop shows arrows that fade in on hover or focus and page by two whole items, mobile shows a fading thumb, since touch has no hover state to reveal arrows.

Grid tokens live in `tokens/layout.css`: 12 columns desktop / 3 mobile, `--grid-gutter` 20px (8 mobile), `--grid-margin` 28px (16 mobile), `--grid-item-min` 160px (100 mobile — three cards across a phone), the standard grid filling its row from there, `--grid-item-min-wide` 240px capped at `--grid-item-max-wide` 300px, and measure caps `--grid-max-width` 1100 / `-list` 860 / `-form` 640. Frame dimensions are tokens too — rail widths, `--side-sheet-width`, `--appbar-height`, `--content-min-width`.
- **Forms**: FieldRow, Input, SearchBar, SearchField, SettingRow, Slider, Switch
- **Navigation**: AccountButton, BackLink, BottomAppBar, BottomNav, RailFooter, RailItem, TopAppBar

Retired (removed August 2026 — both UI kits migrated):

- **Card** → MediaCard
- **QuickTile** → QuickPick
- **TrackRow** → ResultRow
- **AlbumHeader** → MediaHeader
- **SidebarItem** → RailItem
