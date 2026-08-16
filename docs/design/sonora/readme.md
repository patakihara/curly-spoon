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
- `tokens/` — colors, typography, spacing, radius, shadows, fonts (CSS custom properties)
- `guidelines/` — foundation specimen cards (colors, type, spacing, radius, shadows, brand marks)
- `assets/logos/` — the three real product icons/wordmarks (Feishin, Booming Music, Symphony)
- `assets/reference/` — real screenshots used as ground truth while building the UI kits
- `components/core/` — Button, IconButton, Chip, Card, Badge, QuickTile, SectionHeader
- `components/forms/` — Input, Switch, Slider
- `components/navigation/` — SidebarItem (desktop), BottomNav (mobile)
- `components/media/` — AlbumArt, TrackRow, MiniPlayer, AlbumHeader
- `SKILL.md` — Claude Code / Agent Skills manifest

## Components

Button, IconButton, Chip, Card, Badge, QuickTile, SectionHeader, Input, Switch, Slider, SidebarItem, BottomNav, AlbumArt, TrackRow, MiniPlayer, AlbumHeader.

None of the three source apps ships a shared, importable web component library (two are native Android/Compose, one is an Electron/React app with no exported design-system package), so this set is a standard practical inventory sized to what a music-player UI actually needs — every value inside each component (radii, colors, spacing, the slider's two very different treatments) is copied from the real source code and screenshots, not invented. See **Intentional additions** below.

### Intentional additions

- **QuickTile** — the library shortcut tile ("Top Tracks", "Last added", "History", "Shuffle") that opens Booming Music's home screen; extracted so the four tiles stay identical.
- **SectionHeader** — the heading row above every carousel/grid, extracted so mobile and desktop headings stay in step.
- **TrackRow / MiniPlayer / AlbumHeader** — the track-list row, the docked now-playing surface (one component; mobile pill and desktop transport bar are `platform` variants of each other), and the album-page header. All three are real, recurring screen elements in the sources rather than named components; extracting them is what makes album pages composable.
- **IconButton** — none of the three apps names this as a discrete primitive, but all three use a circular icon-only control constantly (transport, toolbars); wrapping it made every UI kit's code consistent.
- **Badge** — a small generic count pill; genuinely present (queue positions, "new" markers) but not a named component in any source.

## Content fundamentals

- **Voice is instructional and matter-of-fact**, written by developers for users who self-host their own media. Booming Music's tagline, "Modern design. Pure sound. Fully yours.", is short and declarative — no hype adjectives beyond that.
- **Second person, minimal address**: UI copy is almost all nouns and short verb phrases — "Top Tracks", "Last added", "Shuffle", "Play all", "Not Recently Played" — not full sentences. Buttons name the action, not "Click here to...".
- **Feature descriptions favor plain technical nouns** over marketing language: Symphony's README explains its own reason for existing plainly — the maintainer needed filename/path-based sorting and "felt like trying out Kotlin and Compose, so I ended up making my own" rather than forking an existing player.
- **READMEs use emoji as section markers** (🎵, ✨, 📸, 🔗) in GitHub docs (Booming Music, Symphony), but **in-app UI copy uses no emoji at all** — screenshots show plain text labels only. Treat emoji as a documentation-only convention, never an in-product one.
- **Casing**: Title Case for section headers and screen titles ("Not Recently Played", "Suggested Artists"); sentence case for body copy and settings descriptions.
- **No filler or reassurance copy** — empty states and settings screens state facts ("0 folders, 551 files") rather than friendly filler sentences.

## Visual foundations

**One surface system, one shared accent, two themes.** All three apps center on a single user-customizable accent color. This system standardizes on Feishin's flat neutral chrome for _every_ surface — desktop and mobile, light and dark — and keeps only the Android sources' chroma roles (primary/tertiary and their containers) from Material. The Material _tonal neutral_ ladder is deliberately not used.

- **Color**: One surface system across both platforms. Surfaces come from Feishin's flat neutral scale — dark: `rgb(12,12,12)` bg / `rgb(8,8,8)` bg-alt / `rgb(20,20,20)` card with `rgb(225,225,225)` text; light: `rgb(235,235,235)` bg / `rgb(225,225,225)` card with `rgb(25,25,25)` text. The mobile `--m3-*` surface/on-surface/surface-container roles alias those desktop tokens, so mobile screens read as the same product as the desktop app; only the _chroma_ roles (`--m3-primary`, `--m3-tertiary`, their containers) keep Booming Music's real Material palette (`#4D5C92` / `#75546F` light, `#B6C4FF` / `#FFB7DB` dark — declared once each, light on `:root` and dark in the `[data-theme="dark"]` scope; there is no `--m3-dark-*` name set). Symphony's 17 preset accent hues ship as `--accent-*` swatches; `--accent` is the one customizable brand color.
- **Theming is explicit, never inferred**: light is the `:root` default and dark lives in a `[data-theme="dark"]` scope, so any container can be themed by setting `data-theme="dark"` on it (two themes can sit side by side on one page, as the mobile kit does). There is deliberately **no** `prefers-color-scheme` rule and no `theme` prop on components — components only read `--m3-*` / `--surface-*` and inherit whichever scope they render inside.
- **Type**: Feishin's Mantine scale, copied exactly — body text sits at 14–16px, headings are unusually heavy (font-weight 900 at every heading size, 36px down to 20px). No italics anywhere in any of the three apps.
- **Backgrounds**: no photography, no hand-drawn illustration, no repeating texture/pattern, no gradients in chrome. The only "image" surface is user album art — every hero/featured element is built by tinting a flat card with the accent color, never a background photo.
- **Animation**: minimal. Feishin uses a plain 0.2s ease-in-out fade for sidebar art and a 0.2s color transition on nav-item hover — no bounce, no spring, no parallax anywhere in the source code read.
- **Hover states** (desktop, Feishin): subtle — nav links shift from foreground-gray to the accent color; buttons rely on Mantine's built-in ~10% opacity/lightness shift. **Press/active states** (mobile): a pill-shaped fill behind the selected control — the bottom-nav active icon sits on an accent-tinted pill mixed from the current background.
- **Borders**: nearly invisible — Feishin's only visible border is `1px solid` at ~50% alpha over the border token, used once (the player bar's top edge). Mobile surfaces separate by flat neutral steps (`--m3-surface-container*`, i.e. the desktop neutrals) instead of borders.
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
- **Display/heading font**: Booming Music's real font is **Google Sans Flex** (`GoogleSansFlex`, bundled as local `.ttf` resources in `app/src/main/res/font/`) — an internal Google typeface not published on Google Fonts. This system substitutes **Roboto Flex**, the closest public variable-font relative (same "flex" variable-axis concept from the same type family lineage). **If you can export the real Google Sans Flex `.ttf` files from the Booming Music APK/repo, swap them into `tokens/fonts.css` as `@font-face` rules** — the substitution is functional but not pixel-identical.

## Sources referenced

Explore these directly for anything this summary simplifies — they're the ground truth:

- https://github.com/jeffvli/feishin (development branch)
- https://github.com/mardous/BoomingMusic (master branch)
- https://github.com/zyrouge/symphony (main branch)
