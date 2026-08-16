# Sonora — implementation reference

This file replaces the design MCP (`DesignSync`) for every wave after 16a. `DesignSync` is
available to the orchestrating session only, not to subagents (established 2026-08-16,
`docs/HANDOVER.md`). Wave 16a-1 vendored the design project's files verbatim into
`docs/design/sonora/`; this file (16a-2) is the orchestrator's read of those files, organized
for implementation. **Read this file, not the vendored files**, unless you need a value this
file doesn't have — in which case read the specific vendored file named, not the whole tree.

Two design-project ids, for a session that does have `DesignSync`:

- **Auralis redesign kickoff** — `cdb06ed1-f8ac-45bb-bf88-1a8a43567b15` (the screens;
  `Auralis-Redesign.dc.html` is the deliverable, `github.md` has the screen map)
- **Sonora Design System** — `6c14357e-f54e-4ad9-99e0-d7fd5ab02144` (also vendored inside the
  kickoff project under `_ds/sonora-design-system-6c14357e-.../`)

`docs/ROADMAP.md` §16 has the narrative summary (why flat surfaces, weight-900 headings, no
italics, Material Symbols Rounded, minimal animation, docked chrome) — **this file does not
repeat that.** This file has the numbers: exact token values, exact component prop APIs and
computed styles, the exact screen inventory, the collision verdicts, and what a rebuilder must
supply that Sonora does not ship.

Every value below is either **copied verbatim** from a vendored file (marked with its source)
or **read directly from `ThemeProvider.tsx` / `breakpoint.ts` / `index.ts`** in this repo. Where
a value is inferred rather than read, it says so.

---

## 1. Token tables

### 1.1 Neutral scale (`tokens/colors.css`)

| Token           | Value                |
| --------------- | -------------------- |
| `--neutral-950` | `rgb(8, 8, 8)`       |
| `--neutral-900` | `rgb(12, 12, 12)`    |
| `--neutral-850` | `rgb(20, 20, 20)`    |
| `--neutral-700` | `rgb(45, 45, 45)`    |
| `--neutral-500` | `rgb(90, 90, 90)`    |
| `--neutral-300` | `rgb(150, 150, 150)` |
| `--neutral-100` | `rgb(215, 215, 215)` |
| `--neutral-50`  | `rgb(225, 225, 225)` |
| `--neutral-0`   | `rgb(255, 255, 255)` |

### 1.2 Flat surface system — dark (default) and light

| Token                      | Dark (default)                                           | Light (`-light` suffix)                    |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `--surface-bg`             | `var(--neutral-900)` = `rgb(12,12,12)`                   | `--surface-bg-light: rgb(235,235,235)`     |
| `--surface-bg-alt`         | `var(--neutral-950)` = `rgb(8,8,8)`                      | `--surface-bg-alt-light: rgb(240,240,240)` |
| `--surface-card`           | `var(--neutral-850)` = `rgb(20,20,20)`                   | `--surface-card-light: rgb(225,225,225)`   |
| `--surface-fg`             | `var(--neutral-50)` = `rgb(225,225,225)`                 | `--surface-fg-light: rgb(25,25,25)`        |
| `--surface-fg-muted`       | `var(--neutral-300)` = `rgb(150,150,150)`                | `--surface-fg-muted-light: rgb(80,80,80)`  |
| `--surface-border`         | `rgb(255 255 255 / 8%)`                                  | `--surface-border-light: rgb(0 0 0 / 8%)`  |
| `--surface-overlay-header` | `linear-gradient(transparent 0%, rgb(0 0 0 / 85%) 100%)` | (no light variant defined)                 |

**These are two distinct token namespaces, not a single set that flips.** The `-light` names
are separate custom properties, always defined, on both themes — nothing switches their value
by `[data-theme]`. What switches by theme is which namespace the **`--m3-*` surface aliases**
point at (§1.4) — the raw `--surface-*`/`--surface-*-light` tokens themselves are static.

### 1.3 Accent (`tokens/colors.css`)

| Token               | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| `--accent`          | `#8b5cf6` (violet — one pick from the preset family below) |
| `--accent-contrast` | `#fff`                                                     |

Preset palette — Symphony's 17-hue picker, offered as swatches, not fixed brand colors:

| Token              | Value     | Token              | Value     |
| ------------------ | --------- | ------------------ | --------- |
| `--accent-red`     | `#ef4444` | `--accent-sky`     | `#0ea5e9` |
| `--accent-orange`  | `#f97316` | `--accent-blue`    | `#3b82f6` |
| `--accent-amber`   | `#f59e0b` | `--accent-indigo`  | `#6366f1` |
| `--accent-yellow`  | `#eab308` | `--accent-violet`  | `#8b5cf6` |
| `--accent-lime`    | `#84cc16` | `--accent-purple`  | `#a855f7` |
| `--accent-green`   | `#22c55e` | `--accent-fuchsia` | `#d946ef` |
| `--accent-emerald` | `#10b981` | `--accent-pink`    | `#ec4899` |
| `--accent-teal`    | `#14b8a6` | `--accent-rose`    | `#f43f5e` |
| `--accent-cyan`    | `#06b6d4` |                    |           |

### 1.4 Semantic state colors (`tokens/colors.css`)

| Token             | Value           |
| ----------------- | --------------- |
| `--state-error`   | `#e12f43`       |
| `--state-success` | `#42e477`       |
| `--state-warning` | `#ffcc8b`       |
| `--state-info`    | `var(--accent)` |

### 1.5 `--m3-*` chroma roles — light (`:root`) and dark (`[data-theme='dark']`)

| Token                         | Light                  | Dark      |
| ----------------------------- | ---------------------- | --------- |
| `--m3-primary`                | `#4d5c92`              | `#b6c4ff` |
| `--m3-on-primary`             | `#ffffff`              | `#1d2d61` |
| `--m3-primary-container`      | `#dce1ff`              | `#354479` |
| `--m3-on-primary-container`   | `#354479`              | `#dce1ff` |
| `--m3-secondary`              | `#595d72`              | `#c2c5dd` |
| `--m3-on-secondary`           | _(not declared light)_ | `#3f434e` |
| `--m3-secondary-container`    | `#dee1f9`              | `#565a70` |
| `--m3-on-secondary-container` | _(not declared light)_ | `#dee1f9` |
| `--m3-tertiary`               | `#75546f`              | `#ffb7db` |
| `--m3-on-tertiary`            | _(not declared light)_ | `#472b50` |
| `--m3-tertiary-container`     | `#ffd7f5`              | `#603e67` |
| `--m3-on-tertiary-container`  | _(not declared light)_ | `#ffd7f5` |
| `--m3-error`                  | `#ba1a1a`              | `#ffb4ab` |
| `--m3-on-error`               | _(not declared light)_ | `#690005` |
| `--m3-error-container`        | `#ffdad6`              | `#93000a` |
| `--m3-on-error-container`     | _(not declared light)_ | `#ffdad6` |

**Three light-side roles genuinely have no `--m3-on-secondary`/`-on-tertiary`/`-on-error`
declaration on `:root`** — read directly from `tokens/colors.css`; not an omission in this
table. Whether that's a real gap in the vendored source or intentional (the app never needs
on-secondary/on-tertiary/on-error text on a light background) is unconfirmed — flag it to
whichever wave first needs one of those three on light.

### 1.6 `--m3-*` surface aliases — these are where light/dark actually differs mechanically

| Token                            | Light (`:root`)                                                               | Dark (`[data-theme='dark']`)                                       |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `--m3-background`                | `var(--surface-bg-light)`                                                     | `var(--surface-bg)`                                                |
| `--m3-on-background`             | `var(--surface-fg-light)`                                                     | `var(--surface-fg)`                                                |
| `--m3-surface`                   | `var(--surface-bg-light)`                                                     | `var(--surface-bg)`                                                |
| `--m3-on-surface`                | `var(--surface-fg-light)`                                                     | `var(--surface-fg)`                                                |
| `--m3-surface-variant`           | `var(--surface-card-light)`                                                   | `var(--surface-card)`                                              |
| `--m3-on-surface-variant`        | `var(--surface-fg-muted-light)`                                               | `var(--surface-fg-muted)`                                          |
| `--m3-outline`                   | `var(--surface-fg-muted-light)`                                               | `var(--neutral-500)`                                               |
| `--m3-outline-variant`           | `var(--surface-card-light)`                                                   | `var(--neutral-700)`                                               |
| `--m3-surface-container-lowest`  | `var(--surface-bg-alt-light)`                                                 | `var(--surface-bg-alt)`                                            |
| `--m3-surface-container-low`     | `var(--surface-bg-light)`                                                     | `var(--surface-bg)`                                                |
| `--m3-surface-container`         | `var(--surface-card-light)`                                                   | `var(--surface-card)`                                              |
| `--m3-surface-container-high`    | `color-mix(in oklch, var(--surface-card-light) 94%, var(--surface-fg-light))` | `color-mix(in oklch, var(--surface-card) 80%, var(--neutral-700))` |
| `--m3-surface-container-highest` | `color-mix(in oklch, var(--surface-card-light) 88%, var(--surface-fg-light))` | `var(--neutral-700)`                                               |

Note `--m3-outline`/`--m3-outline-variant` and both `-high`/`-highest` steps use **different
mix formulas** light vs. dark (not just a namespace swap) — copy these exactly, don't infer a
pattern.

The source comment in `tokens/colors.css` is explicit: **"there is no `--m3-dark-*` name
set"** — dark values live entirely under the `[data-theme='dark']` selector, never under a
`--m3-dark-primary`-style separate name. A grep for `--m3-dark-` on the vendored files matches
only this prose sentence inside a comment, not a real token — don't hunt for it.

### 1.7 Fonts (`tokens/fonts.css`, 8 lines total)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Roboto+Flex:opsz,wght@8..144,400..900&display=swap');
:root {
  --font-body: 'Inter', -apple-system, 'Segoe UI', sans-serif;
  --font-display: 'Roboto Flex', 'Inter', sans-serif;
}
```

**`tokens/fonts.css` does NOT import Material Symbols.** That import lives in `styles.css`
line 1 (see §5). Both `readme.md`'s Iconography section ("via the Google Fonts icon
stylesheet loaded in `tokens/fonts.css`") and `docs/ROADMAP.md` §16 asserted this incorrectly
— confirmed by reading the actual file. Two separate `@import url(fonts.googleapis.com/...)`
statements exist across the two files; both need self-hosting (§5).

**Roboto Flex is a substitute, not the real font**, per `tokens/fonts.css`'s own comment and
`readme.md`'s "Font substitution" section: Booming Music's actual display font is **Google
Sans Flex**, an internal Google typeface bundled as local `.ttf` files in the source app, not
published on Google Fonts. Roboto Flex is "the closest public variable-font relative — same
'flex' variable-axis concept, same type family lineage," explicitly not pixel-identical.
`readme.md` invites swapping in real Google Sans Flex `.ttf` files if ever obtained; none are
vendored here.

Inter needs no substitution — it's Symphony's actual built-in font choice
(`SymphonyBuiltinFonts.Inter`) and a real Google Font.

### 1.8 Typography (`tokens/typography.css`)

| Token        | Value              |     | Token          | Value             |
| ------------ | ------------------ | --- | -------------- | ----------------- |
| `--text-xs`  | `0.6875rem` (11px) |     | `--leading-xs` | `0.875rem` (14px) |
| `--text-sm`  | `0.8125rem` (13px) |     | `--leading-sm` | `1rem` (16px)     |
| `--text-md`  | `0.875rem` (14px)  |     | `--leading-md` | `1.125rem` (18px) |
| `--text-lg`  | `1rem` (16px)      |     | `--leading-lg` | `1.25rem` (20px)  |
| `--text-xl`  | `1.125rem` (18px)  |     | `--leading-xl` | `1.5rem` (24px)   |
| `--text-2xl` | `1.25rem` (20px)   |     |                |                   |
| `--text-3xl` | `1.5rem` (24px)    |     |                |                   |
| `--text-4xl` | `1.75rem` (28px)   |     |                |                   |
| `--text-5xl` | `2rem` (32px)      |     |                |                   |

Headings (weight 900 throughout, no separate light/dark values):

| Token                        | Value                           |
| ---------------------------- | ------------------------------- |
| `--h1-size` / `--h1-leading` | `2.25rem` / `2.75rem` (36/44)   |
| `--h2-size` / `--h2-leading` | `1.875rem` / `2.375rem` (30/38) |
| `--h3-size` / `--h3-leading` | `1.5rem` / `2rem` (24/32)       |
| `--h4-size` / `--h4-leading` | `1.25rem` / `1.875rem` (20/30)  |
| `--heading-weight`           | `900`                           |

No italics anywhere in the source apps (per `readme.md`).

### 1.9 Spacing (`tokens/spacing.css`)

Two parallel scales exist — **not aliases of each other**, both real, sourced separately:

| "Feishin" scale | Value            |     | "Layout" scale  | Value  |
| --------------- | ---------------- | --- | --------------- | ------ |
| `--space-0`     | `0px`            |     | `--spacing-xs`  | `4px`  |
| `--space-xs`    | `0.25rem` (4px)  |     | `--spacing-sm`  | `8px`  |
| `--space-sm`    | `0.5rem` (8px)   |     | `--spacing-md`  | `12px` |
| `--space-md`    | `0.75rem` (12px) |     | `--spacing-lg`  | `16px` |
| `--space-lg`    | `1rem` (16px)    |     | `--spacing-xl`  | `20px` |
| `--space-xl`    | `1.5rem` (24px)  |     | `--spacing-2xl` | `24px` |
| `--space-2xl`   | `2rem` (32px)    |     | `--grid-gap`    | `12px` |
| `--space-3xl`   | `2.25rem` (36px) |     |                 |        |
| `--space-4xl`   | `2.5rem` (40px)  |     |                 |        |

Other:

| Token                     | Value                                     |
| ------------------------- | ----------------------------------------- |
| `--icon-sm`               | `24px` (Material Symbols glyph font-size) |
| `--icon-md`               | `28px`                                    |
| `--miniplayer-album-size` | `44px`                                    |

### 1.10 Radius (`tokens/radius.css`) — one scale, both platforms

| Token           | Value   |
| --------------- | ------- |
| `--radius-xs`   | `8px`   |
| `--radius-sm`   | `16px`  |
| `--radius-md`   | `24px`  |
| `--radius-lg`   | `32px`  |
| `--radius-pill` | `999px` |

Desktop chrome uses the small end; mobile uses the large end + `--radius-pill`, per `readme.md`
— but note the component cards (§3) don't cleanly follow "desktop small / mobile large": e.g.
`MediaCard`'s art radius is `--radius-sm` (16px) on **mobile** and `--radius-md` (24px) on
**desktop** — the opposite direction. Read each component's actual value; don't assume the
readme's generalization holds everywhere.

### 1.11 Shadows (`tokens/shadows.css`) — desktop only; mobile uses none

| Token          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| `--shadow-xs`  | `0 1px 2px rgba(0,0,0,0.05)`                                |
| `--shadow-sm`  | `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`     |
| `--shadow-md`  | `0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)`     |
| `--shadow-lg`  | `0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)`   |
| `--shadow-xl`  | `0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)` |
| `--shadow-xxl` | `0 25px 50px rgba(0,0,0,0.25)`                              |

Mobile depth comes from `--m3-surface-container*` steps, never a shadow (`readme.md`).

---

## 2. The five app-level tokens Sonora does not ship

Sonora's `tokens/colors.css` defines none of these. They exist only inside
`Auralis-Redesign.dc.html`, set as inline custom properties on the app frame's root style
string (`frameStyle`/`mobileFrameStyle`, around line 1715–1717). Read directly from that file:

**Dark (base values, no theme override applied):**

| Token             | Value                  |
| ----------------- | ---------------------- |
| `--accent-ink`    | `var(--accent)`        |
| `--tone-library`  | `var(--accent)`        |
| `--tone-progress` | `var(--state-warning)` |
| `--tone-request`  | `var(--m3-tertiary)`   |
| `--tone-error`    | `var(--state-error)`   |

**Light (dark values above, then these overrides applied when `theme === 'light'`):**

| Token             | Value                                           |
| ----------------- | ----------------------------------------------- |
| `--tone-library`  | `#6B4300`                                       |
| `--tone-progress` | `#7A4A00`                                       |
| `--tone-request`  | `#5B3B57`                                       |
| `--tone-error`    | `var(--state-error)` (unchanged)                |
| `--accent-ink`    | `color-mix(in oklch, var(--accent) 58%, black)` |

The light branch _also_ overrides `--m3-tertiary: var(--m3-tertiary-container)` and re-points
all **six** `--surface-*` tokens — `--surface-bg`, `--surface-bg-alt`, `--surface-card`,
`--surface-fg`, `--surface-fg-muted`, `--surface-border` — at their `-light` counterparts on this
same frame element — i.e.
the redesign's root frame does its own light/dark switching by inline custom property, layered
independently of Sonora's own `[data-theme='dark']` `:root` rule. A rebuilder choosing where to
set these six tokens should follow this pattern (component-scoped custom properties on a theme
root), not invent a different mechanism.

**What breaks without these:** `RailItem` (§3.6) sets `color: var(--accent-ink)` for the active
nav destination — undefined without it, so the active rail item renders with an invalid
`var()` (browsers fall back to `unset`, i.e. inherited color, silently losing the accent
highlight). `ResultRow` (§3.7) sets both text `color` and background `color-mix()` from
`var(--tone-{tone})` for every status pill — all four `tone` values resolve to nothing without
these five tokens defined, so every status pill in search/library/requests loses its color
coding entirely, silently (no error, just wrong/missing color).

---

## 3. Component reference — the nine Auralis-specific cards

Source: `docs/design/sonora/components/*.dc.html`. Each file's `renderVals()` body is
untouched from the original design project; only wrapper boilerplate was reformatted during
vendoring (see §9). Prop lists below are the `// props:` comment from each file, cross-checked
against the actual `renderVals()` code — **where the comment and the code disagree, both are
shown, and the code wins** (it's what the component actually does).

### 3.1 `ArtistCard`

| Prop       | Type                  | Default                                          |
| ---------- | --------------------- | ------------------------------------------------ |
| `title`    | `string`              | —                                                |
| `sub`      | `string`              | `'2 albums'`                                     |
| `platform` | `'desktop'\|'mobile'` | `'desktop'`                                      |
| `width`    | `string`              | `'160px'` (desktop), `'132px'` (mobile) if unset |
| `onClick`  | `() => void`          | —                                                |

Computed styles: root is `flex column, center, cursor: pointer`, width per above. Art is a
**circle** (`border-radius: 50%`) at `width: 100%; aspect-ratio: 1`, filled with
`linear-gradient(135deg, var(--accent), var(--accent-violet))` (all art in every card below
uses this same two-stop accent gradient as a placeholder — there is no real artwork rendering
in any vendored component). Title: `var(--text-md)`, weight 700, single-line ellipsis, color
`var(--surface-fg)` desktop / `var(--m3-on-background)` mobile. Sub: `var(--text-sm)`, color
`var(--surface-fg-muted)` desktop / `var(--m3-on-surface-variant)` mobile.

### 3.2 `BackLink`

| Prop       | Type                  | Default     |
| ---------- | --------------------- | ----------- |
| `label`    | `string`              | `'Browse'`  |
| `platform` | `'desktop'\|'mobile'` | `'desktop'` |
| `onClick`  | `() => void`          | —           |

Renders `arrow_back` (Material Symbols Rounded, 20px, `line-height:1`) + label, inline-flex,
`gap:8px`, `font-size: var(--text-sm)`, weight 700, color `var(--surface-fg-muted)` desktop /
`var(--m3-on-surface-variant)` mobile.

### 3.3 `FieldRow`

| Prop          | Type                  | Default                  |
| ------------- | --------------------- | ------------------------ |
| `label`       | `string`              | `'Server URL'`           |
| `placeholder` | `string`              | `'https://abs.home.lan'` |
| `value`       | `string`              | `''`                     |
| `platform`    | `'desktop'\|'mobile'` | `'desktop'`              |

Wraps the Sonora primitive `<Input>` (§4). Label: `var(--text-sm)`, weight 700, muted color.
**Mobile-only wrinkle, noted in the file's own comment:** "The design system's mobile `Input`
is chromeless by design — it expects to sit on a filled container, which this row supplies" —
mobile wraps the `Input` in `background: var(--m3-surface-container); border-radius:
var(--radius-pill); padding: 4px 6px`. Desktop applies no such wrapper.

### 3.4 `MediaCard`

| Prop       | Type                    | Default                                 | Notes                                                                                                       |
| ---------- | ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `title`    | `string`                | —                                       |                                                                                                             |
| `sub`      | `string`                | —                                       | In a mixed shelf, caller prefixes kind: `"Book · 6 h 12 m left"`; single-type shelves pass just the artist. |
| `platform` | `'desktop'\|'mobile'`   | `'desktop'`                             |                                                                                                             |
| `progress` | `number \| null` (0..1) | —                                       | Renders a bottom progress bar only if `typeof progress === 'number'`                                        |
| `absent`   | `boolean`               | `false`                                 | Renders a **"Not in library"** pill, top-left, and switches art/title to muted/dashed treatment             |
| `width`    | `string`                | `'176px'` (desktop), `'152px'` (mobile) |                                                                                                             |
| `onClick`  | `() => void`            | —                                       |                                                                                                             |

This is the card that renders **phase 15 discovery results and 12c-2's owned/not-owned
distinction.** `absent: true` is what marks a discovered-but-unowned title — not requestable,
per `docs/USER_DECISIONS.md`. `progress` is the owned-item listening/reading position.

Computed styles: art `aspect-ratio: 1`, `border-radius: var(--radius-sm)` (16px) on **mobile**,
`var(--radius-md)` (24px) on **desktop** — note this is the reverse of "desktop small / mobile
large" the readme states generally (§1.10). When `absent`, art background is
`var(--surface-card)` with `border: 1px dashed <muted>` instead of the accent gradient; title
color drops to muted. The absent pill: `position: absolute; left:8px; top:8px`, pill radius,
`var(--text-xs)` weight 700, `background: var(--surface-bg)`, muted text. Progress bar track:
`height: 5px`, `background: rgb(0 0 0 / 45%)`, fill `background: var(--accent)`, width
`Math.round(progress * 100) + '%'`.

### 3.5 `MediaHeader`

| Prop                               | Type                  | Default                                                                                                      |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `kindLabel`                        | `string`              | `'Album'`                                                                                                    |
| `title`                            | `string`              | —                                                                                                            |
| `subtitle`                         | `string`              | —                                                                                                            |
| `meta`                             | `string`              | — (design's own example: `"2021 · Synthwave · 2 tracks · 6 min"`)                                            |
| `playLabel`                        | `string`              | `'Play'`                                                                                                     |
| `secondLabel`                      | `string`              | `'Shuffle'`                                                                                                  |
| `round`                            | `boolean`             | `false` — art is circular (artist/author headers) vs. `var(--radius-lg)` square (album/book/podcast headers) |
| `platform`                         | `'desktop'\|'mobile'` | `'desktop'`                                                                                                  |
| `onPlay`, `onSecond`, `onSubtitle` | `() => void`          | `onSecond` falls back to `onPlay` if unset                                                                   |

Art size: `232px` desktop, `208px` mobile. Layout: desktop is a horizontal flex
(`gap: 28px; align-items: flex-end`); mobile is a centered column. Title uses
`var(--font-display)` (Roboto Flex), weight 900, size `var(--h2-size)` desktop /
`var(--h4-size)` mobile. **Subtitle color is conditional on whether `onSubtitle` is
passed**: `var(--accent-ink)` + `cursor: pointer` when clickable (e.g. an album header's
artist name linking to the artist page), plain `fg` color otherwise — this is the general
pattern for "this label is a link to another entity" throughout the redesign (also used in
`Auralis-Redesign.dc.html`'s own artist-name rendering, line ~1757).

### 3.6 `QuickPick`

| Prop       | Type                  | Default                        |
| ---------- | --------------------- | ------------------------------ |
| `title`    | `string`              | `'The Fellowship of the Ring'` |
| `sub`      | `string`              | `'Book · 6 h 12 m left'`       |
| `platform` | `'desktop'\|'mobile'` | `'desktop'`                    |
| `onClick`  | `() => void`          | —                              |

Small horizontal row: art `52px` (desktop) / `48px` (mobile) square, `border-radius: 8px`
(literal px, not a token — the only hardcoded radius among the nine cards). Root padding
`8px`, radius `var(--radius-xs)` desktop / `var(--radius-sm)` mobile, background
`var(--surface-card)` desktop / `var(--m3-surface-container)` mobile.

### 3.7 `RailItem`

| Prop      | Type         | Default                                     |
| --------- | ------------ | ------------------------------------------- |
| `icon`    | `string`     | `'explore'` (a Material Symbols glyph name) |
| `label`   | `string`     | `'Browse'`                                  |
| `active`  | `boolean`    | `true`                                      |
| `onClick` | `() => void` | —                                           |

This is the desktop rail's nav destination. Icon uses the **FILL axis**:
`font-variation-settings: 'FILL' 1, 'wght' 500` when active, `'FILL' 0, 'wght' 400` when
inactive — confirmed matching the FILL-axis mechanism named in `github.md` ("Selected nav
destinations use the Material Symbols FILL axis") and in `Auralis-Redesign.dc.html`'s own CSS
comment ("Material Symbols FILL axis: a selected destination reads as a filled glyph"). Icon
size fixed `24px`. Root: `width: 60px`, `flex column, center`, `gap:4px`, `padding:10px 0`,
`border-radius: var(--radius-xs)`. **Active color is `var(--accent-ink)`** (§2) on
`background: var(--surface-card)`; inactive is `var(--surface-fg-muted)` on transparent.
Label: `10px` (hardcoded, not a token), weight 700.

### 3.8 `ResultRow`

| Prop          | Type                                        | Default                                                                                                                                                                                   |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | `string`                                    | — (design's example: `'Dune Messiah'`)                                                                                                                                                    |
| `meta`        | `string`                                    | — (example: `'Audiobook · Frank Herbert · Simon Vance · 14 h 02 m'`)                                                                                                                      |
| `status`      | `string`                                    | — (example: `'Requested · 87%'`)                                                                                                                                                          |
| `tone`        | `'library'\|'request'\|'progress'\|'error'` | **Contradiction: the `// props:` comment declares the default as `'progress'`, but the actual `renderVals()` code is `p.tone \|\| 'library'` — the real runtime default is `'library'`.** |
| `actionGlyph` | `string`                                    | **Contradiction, same shape as `tone`: the `// props:` comment declares `'downloading'`, the code is `p.actionGlyph \|\| 'play_arrow'` — the real runtime default is `'play_arrow'`.**    |
| `platform`    | `'desktop'\|'mobile'`                       | `'desktop'`                                                                                                                                                                               |
| `onClick`     | `() => void`                                | —                                                                                                                                                                                         |

This is what renders **12c-2's owned/discoverable/requestable status labels** wherever search
or library results are shown as rows rather than cards. The four `tone` values map straight to
the five §2 tokens (`error` uses `--tone-error`; `library`/`progress`/`request` map to their
same-named tokens): `color: var(--tone-{tone})` on the pill text, `background: color-mix(in
oklch, transparent 78%, var(--tone-{tone}))` for the pill fill — a translucent tint of the same
hue, not a separate background token.

**Desktop vs. mobile layout differs structurally, not just cosmetically**: on mobile the status
pill stacks below the title/meta column (`stacked: true`); on desktop it sits inline to the
right of title/meta, before the trailing action glyph (`inline: true`). Art: `52px` square,
radius `8px` mobile / `6px` desktop (both hardcoded literals, not tokens). Trailing glyph uses
`font-variation-settings: 'FILL' 0, 'wght' 300`, size `24px` mobile / `22px` desktop, muted
color — this is the row's "resolve/play" action affordance.

### 3.9 `SettingRow`

| Prop       | Type                      | Default                          |
| ---------- | ------------------------- | -------------------------------- |
| `title`    | `string`                  | `'Offline mode'`                 |
| `sub`      | `string`                  | `'Only play what is downloaded'` |
| `checked`  | `boolean`                 | `true`                           |
| `platform` | `'desktop'\|'mobile'`     | `'desktop'`                      |
| `onChange` | `(next: boolean) => void` | —                                |

Wraps the Sonora `<Switch>` primitive. Row: `flex, space-between`, `gap:16px` mobile /
`24px` desktop, `padding: 14px 16px`, radius `var(--radius-sm)` mobile / `var(--radius-xs)`
desktop, background `var(--m3-surface-container)` mobile / `var(--surface-card)` desktop.

---

## 4. The 16 Sonora primitives — prop APIs

**Not vendored as component source** — the Sonora project's 16 generic primitives
(`components/core|forms|media|navigation/*.jsx` + `.d.ts` + `.prompt.md`) live in the _other_
design project and were not pulled into this repo (§9). What follows is mined entirely from
`_adherence.oxlintrc.json`'s lint selectors, which enumerate each component's allowed prop
names and, for enum props, allowed values. **This is a lint rule, not a type definition** — it
tells you what's _rejected_, from which the allowed set is inferred. Every component also
implicitly allows `key`, `ref`, `className`, `style`, `children` (excluded below as noise).

One naming mismatch worth flagging: `readme.md`'s component index names the 16th primitive
**`BottomNav`**; the lint file's selector names it **`BottomNavItem`**. Only a prop list for
`BottomNavItem` exists in the adherence file; treat `BottomNav` as the readme's shorthand for
"the thing built from `BottomNavItem`s," not a second, separate primitive.

| Component       | Props                                                                                                                                 | Enum constraints                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AlbumArt`      | `src, size, platform`                                                                                                                 | `platform`: `desktop \| mobile`                                                                                                                                                                   |
| `AlbumHeader`   | `title, artist, meta, image, platform, onPlay, onShuffle`                                                                             | `platform`: `desktop \| mobile`                                                                                                                                                                   |
| `Badge`         | `children, tone`                                                                                                                      | `tone`: `accent \| success \| error \| neutral`                                                                                                                                                   |
| `BottomNavItem` | `key, label, icon`                                                                                                                    | —                                                                                                                                                                                                 |
| `Button`        | `children, variant, size, platform, icon, disabled, onClick`                                                                          | `variant`: `primary \| secondary \| ghost \| danger`; `size`: `sm \| md \| lg`; `platform`: `desktop \| mobile`                                                                                   |
| `Card`          | `image, title, subtitle, badge, platform, width, onClick`                                                                             | `platform`: `desktop \| mobile`                                                                                                                                                                   |
| `Chip`          | `children, color, count, selected, platform, onClick`                                                                                 | `color`: one of the 17 accent hue names (`red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose`); `platform`: `desktop \| mobile` |
| `IconButton`    | `children, size, active, muted, label, onClick`                                                                                       | —                                                                                                                                                                                                 |
| `Input`         | `placeholder, icon, platform, value, onChange`                                                                                        | `platform`: `desktop \| mobile`                                                                                                                                                                   |
| `MiniPlayer`    | `title, artist, image, playing, onTogglePlay, onOpen, platform, progress, onSeek, duration, onPrev, onNext, queueOpen, onToggleQueue` | `platform`: `mobile \| desktop`                                                                                                                                                                   |
| `QuickTile`     | `icon, label, count, onClick, platform`                                                                                               | `platform`: `mobile \| desktop`                                                                                                                                                                   |
| `SectionHeader` | `title, action, actionLabel, onAction, platform`                                                                                      | `platform`: `mobile \| desktop`                                                                                                                                                                   |
| `SidebarItem`   | `icon, label, active, onClick`                                                                                                        | —                                                                                                                                                                                                 |
| `Slider`        | `value, onChange, platform`                                                                                                           | `platform`: `desktop \| mobile`                                                                                                                                                                   |
| `Switch`        | `checked, onChange, label`                                                                                                            | —                                                                                                                                                                                                 |
| `TrackRow`      | `index, title, artist, album, time, active, platform, onClick`                                                                        | `platform`: `desktop \| mobile`                                                                                                                                                                   |

The file also forbids raw hex colors, raw px literals, and any `font-family` other than
`Inter`/`Roboto Flex`/`Material Symbols Rounded` anywhere lint runs — i.e. the adherence
config's intent is "always go through a token," even though several of the vendored component
cards themselves violate that (hardcoded `8px`, `6px`, `10px` radii/font-sizes — see §3).

---

## 5. `packages/ui` export inventory vs. Sonora's 16 primitives

`packages/ui/src/components/index.ts` exports **19 components** (plus one hook, `useSnackbar`,
not counted as a component) — read directly, 2026-08-16. This is a precise count from the file,
not an estimate; if this spec elsewhere says a different number, this table is the one to trust.

| `packages/ui` export | Sonora equivalent?                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`             | Has equivalent — Sonora `Button`                                                                                                                                                                                                        |
| `IconButton`         | Has equivalent — Sonora `IconButton`                                                                                                                                                                                                    |
| `Card`               | Has equivalent — Sonora `Card`                                                                                                                                                                                                          |
| `Chip`               | Has equivalent — Sonora `Chip`                                                                                                                                                                                                          |
| `Slider`             | Has equivalent — Sonora `Slider`                                                                                                                                                                                                        |
| `NavigationBar`      | Approximate equivalent — Sonora `BottomNavItem`/`BottomNav`, but prop shapes are unverified against each other (Sonora's is `key, label, icon` only; `NavigationBar`'s current API is not read here — check before assuming a 1:1 swap) |
| `ListItem`           | No named Sonora equivalent — closest in spirit is `TrackRow` or the Auralis-specific `ResultRow` (§3.8), neither is a drop-in                                                                                                           |
| `SearchField`        | No named Sonora equivalent — closest primitive is `Input`, which has no search-specific affordances (no suggestions prop)                                                                                                               |
| `Fab`                | No Sonora equivalent — no floating-action-button concept in any of the three source apps                                                                                                                                                |
| `TopAppBar`          | No Sonora equivalent — Sonora's chrome is docked rail + `SectionHeader`, not a top app bar                                                                                                                                              |
| `Sheet`              | No Sonora equivalent named — Now Playing expansion exists in the redesign screens but as bespoke screen markup, not a reusable `Sheet` primitive                                                                                        |
| `Dialog`             | No Sonora equivalent                                                                                                                                                                                                                    |
| `Snackbar`           | No Sonora equivalent                                                                                                                                                                                                                    |
| `LinearProgress`     | No Sonora equivalent — progress is drawn inline per-component (`MediaCard`'s bar, `MiniPlayer`'s `progress` prop) rather than a shared bar primitive                                                                                    |
| `CircularProgress`   | No Sonora equivalent                                                                                                                                                                                                                    |
| `Skeleton`           | No Sonora equivalent — nothing in the vendored files addresses loading states                                                                                                                                                           |
| `Icon`               | No Sonora equivalent as a wrapped component — Sonora renders icons as literal Material Symbols glyph-name text nodes, not a component (§6)                                                                                              |
| `Marquee`            | No Sonora equivalent                                                                                                                                                                                                                    |
| `Menu`               | No Sonora equivalent                                                                                                                                                                                                                    |

Sonora-only, not covered by any current `packages/ui` export — **must be built from scratch**:

| Sonora primitive | Notes                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Badge`          | Small count/status pill — `tone` enum only, no `children` type constraint beyond generic                                                                                                                                                        |
| `QuickTile`      | Library shortcut tile (see `QuickPick.dc.html`, §3.6, for the closest Auralis-specific analog, though `QuickPick` and `QuickTile` are not confirmed to be the same component under two names)                                                   |
| `SectionHeader`  | Heading row above every carousel/grid                                                                                                                                                                                                           |
| `Input`          | Text field — `packages/ui` has no bare text-input primitive today (only `SearchField`, which is a distinct, more specialized component)                                                                                                         |
| `Switch`         | Toggle — no existing equivalent                                                                                                                                                                                                                 |
| `SidebarItem`    | Distinct from `RailItem` (§3.7, an Auralis-specific card) — unclear if these name the same thing or two different desktop-nav treatments; check against screenshots (§9) before assuming either supersedes the other                            |
| `AlbumArt`       | Bare artwork-with-size-variant primitive — `packages/ui` has `CoverImage` in `apps/web/src/components/`, not in `packages/ui`, so it's app-level today, not design-system-level                                                                 |
| `TrackRow`       | Track list row                                                                                                                                                                                                                                  |
| `MiniPlayer`     | Docked now-playing surface, `platform` variant covers both the mobile pill and desktop transport bar as one component per `readme.md`                                                                                                           |
| `AlbumHeader`    | Distinct from the Auralis-specific `MediaHeader` (§3.5) — likely `MediaHeader` is Auralis's app-level wrapper around the generic `AlbumHeader` primitive, but this is inferred, not confirmed, since `AlbumHeader`'s own source wasn't vendored |

---

## 6. Layout rig

**Two genuinely new thresholds are claimed by different sources; only one is real.**
`github.md` advertises "Adaptive shell rig at 1440 / 1280 / 1024 / 768 px." Reading
`Auralis-Redesign.dc.html` directly (~line 1707-1720): the only two boundaries actually
implemented in `renderVals()` are

```js
const railWide = w >= 1024;
const showPanel = w >= 1240;
```

`1440`, `1280`, `1024`, `768` are **`widthTabs`** — preset buttons in the design tool's own
frame-width picker UI (`[1440,1280,1024,768].map(n => ({ label: n+'px', onClick: () =>
this.setState({ frameWidth: n }) }))`), not implemented layout breakpoints. `github.md` restates
these four numbers as if they were the rig; they are not. Treat `github.md`'s claim as wrong.

The app's existing breakpoint rig, read from `apps/web/src/hooks/breakpoint.ts` (**not**
`packages/ui/src/hooks/breakpoint.ts` — that path doesn't exist; the hook lives in
`apps/web`):

```
compact: < 600px       → bottom bar
medium: 600–1239.98px  → rail
expanded: >= 1240px    → expanded rail
```

**`1240` already exists today** (`expanded` boundary). **`1024` (`railWide`) is the one
genuinely new boundary Sonora introduces** — the app currently has no distinction inside its
`medium` (600–1240) band; Sonora's `railWide` would split that band into "narrow rail" and
"wide rail" sub-states. `768` and `1440`/`1280` are not implemented anywhere and should not be
treated as targets.

---

## 7. Screen inventory

**Nav destinations** (desktop rail `nav` array, `Auralis-Redesign.dc.html` ~line 1450) — four
items, always present:

| key        | label    | icon       |
| ---------- | -------- | ---------- |
| `forYou`   | Browse   | `explore`  |
| `music`    | Music    | `album`    |
| `books`    | Books    | `book_2`   |
| `podcasts` | Podcasts | `podcasts` |

**`search` is appended as a fifth item on BOTH the desktop rail and the mobile bottom nav** —
`railKeys = [...nav, { key: 'search', label: 'Search', icon: 'search' }]` (line ~1709) and
`bottomItems: [...nav.map(...), { key: 'search', ... }]` (line ~1750). Note this corrects an
earlier assumption in this wave's own spec that search was rail-only; it is not — both surfaces
get it.

**Browse filter chips**: `All, Books, Podcasts, Music, Requests`, with:

```js
const filterKinds = {
  Books: ['Book'],
  Podcasts: ['Podcast', 'Episode'],
  Music: ['Album', 'Artist'],
};
```

`All` and `Requests` have no `filterKinds` entry and fall through the `keep()` filter unchanged
(read `keep = (list) => (s.filter === 'All' || !filterKinds[s.filter]) ? list : list.filter(...)`
— `Requests` is handled as a separate branch elsewhere in `renderVals()`, not by `filterKinds`).

**Full screen set**, from the `activeKey` lookup that maps every screen to its rail highlight
(line ~1457):

```
forYou, music, album, book, books, podcasts, episode, search, settings, onboarding, shelf, artist, author, show
```

`activeKey` also shows which screens share a rail highlight: `album`/`artist` → `music`;
`book`/`author` → `books`; `episode`/`show` → `podcasts`; `shelf` → `forYou`;
`settings`/`onboarding` → no highlight (`''`).

**Screen map** (`github.md`), i.e. which current app file each redesigned screen was built
from:

| Screen                            | Built from                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Shell (rail, panel, player bar)   | `apps/web/src/components/Shell.tsx`, `components/destinations.ts`                |
| For you                           | `apps/web/src/features/home/HomePage.tsx`                                        |
| Music / Album                     | `apps/web/src/features/music/MusicHomePage.tsx`, `MusicAlbumPage.tsx`            |
| Book detail                       | `apps/web/src/features/item/ItemPage.tsx`                                        |
| Podcasts                          | `apps/web/src/features/podcasts/PodcastDetailPage.tsx`                           |
| Search                            | `apps/web/src/features/search/SearchPage.tsx`                                    |
| Now Playing / Queue / Mini player | `apps/web/src/features/player/NowPlaying.tsx`, `MiniPlayer.tsx`, `QueueView.tsx` |
| Settings / Onboarding             | `apps/web/src/features/settings/SettingsPage.tsx`, `features/onboarding/*`       |
| Content fixtures                  | `apps/server/src/testSupport/fakes/fakeJellyfin.ts`                              |

`github.md`'s "Updated in this project" notes (dated 2026-08-16T11:22:00Z), for context on
what changed relative to the pre-Sonora audit: chrome (rail, mini player, bottom nav) is now
docked so only content scrolls; search became one relevance-ordered mixed list with per-item
status labels instead of per-type groups; Books got a real library screen (previously the nav
pointed straight at a detail page); Podcasts was rebuilt to match Music's structure.

---

## 8. Collision verdicts

### Collision 1 — `--m3-*` name overlap: REAL, quantified, and silent

Sonora defines **29** `--m3-*` names; this app's existing token layer uses **184**. **22 names
overlap exactly**:

```
--m3-error, --m3-error-container, --m3-on-error-container, --m3-on-primary,
--m3-on-primary-container, --m3-on-secondary, --m3-on-secondary-container, --m3-on-surface,
--m3-on-surface-variant, --m3-outline, --m3-outline-variant, --m3-primary,
--m3-primary-container, --m3-secondary, --m3-secondary-container, --m3-surface,
--m3-surface-container, --m3-surface-container-high, --m3-surface-container-highest,
--m3-surface-container-low, --m3-surface-container-lowest, --m3-surface-variant
```

Sonora-only (**7** more names, not in today's app — 22 shared + 7 = the 29 total): `--m3-background`, `--m3-on-background`,
`--m3-on-error`, `--m3-on-tertiary`, `--m3-on-tertiary-container`, `--m3-tertiary`,
`--m3-tertiary-container`. (A "`--m3-dark-`" hit some greps turn up is a false positive — it's
inside a prose comment in `tokens/colors.css`, not a real token; see §1.6.)

**Confirmed by reading `ThemeProvider.tsx` directly**: the app's `--m3-*` values are set as
**inline style** (`el.style.setProperty(name, value)`, inside a `useEffect`) on a
`.auralis-theme-root` `<div>` — see lines ~149-169. Inline style has the highest specificity
short of `!important`, beating any `:root` rule or `[data-theme]`-scoped rule a dropped-in
Sonora stylesheet could define. **Consequence: simply adding Sonora's `styles.css` alongside
the app's existing stylesheet does nothing at all** — every overlapping `--m3-*` name keeps
resolving to `ThemeProvider`'s inline value, silently. `packages/ui`'s test suite has no way to
see this (it renders, and produces the pre-Sonora color, which passes every existing
assertion). **16b must replace `ThemeProvider`'s own token-emission logic** to move Sonora's
values in, not add a parallel stylesheet.

**`--m3-*` is defined in two places, not one.** Besides `ThemeProvider.tsx`'s inline JS,
`packages/ui/src/styles/index.css:55-76` carries a static `:root` fallback block of the same
colour names. Its own comment says `ThemeProvider` overwrites every one of them on its wrapper
element, so it does not change the conclusion above — but a 16b implementer grepping for "where
is `--m3-*` defined" will find both, and needs to change both.

### Collision 2 — artwork-derived color: not a blocker, but still genuinely unasked

§16 of `ROADMAP.md` already retracted this. `packages/ui/src/tokens/artwork.ts` exports one
function, `sourceColorFromImageData`. Grepped for callers 2026-08-16: **zero**, outside its own
`artwork.test.ts`. Whatever color pipeline ships today is already a user-picked accent (fed
into `ThemeProvider`'s `sourceColor` prop from elsewhere), which is Sonora's own model
(`--accent`, Symphony's 17-hue picker). There is no live artwork-derived-color code to reconcile
against.

**So it does not block anything**: 16b can adopt Sonora's accent model without removing a
feature, because the feature is not wired. Build on that and do not wait for an answer.

**But do not record it as answered, because it is not.** An earlier draft of this section said
it "was already asked and answered"; that is wrong and was corrected on review. Grepping
`docs/USER_DECISIONS.md` finds nothing on it, `ROADMAP.md` §16 says the question "can be asked
later, cheaply" — future tense — and `HANDOVER.md` still lists it as a live one-sentence ask.
What §16 retracted was the _premise_ (that a beloved feature would be deleted), not the
question.

The question that remains, and it is one sentence: **should album-art-derived colour ever be
wired up as the accent's source, or is a picker the final answer?** She named artwork-derived
colour as something she loved about Symfonium, and Sonora's model is a user-picked hue, so by
her own test — _would she have an opinion, and does the answer change what she gets?_ — this
is worth asking. Ask it the next time there is a channel to her; do not block on it.

### Collision 3 — external font loading: REAL, two requests, self-hosting required

**Two separate Google Fonts `@import url(...)` statements**, confirmed by reading both files
directly:

1. `styles.css` line 1 — `Material Symbols Rounded`, variable axes `opsz,wght,FILL@20..48,
100..700,0..1`. **The `FILL` axis must survive any self-hosted subset** — it's what makes a
   selected nav destination read as a filled glyph (`RailItem`, §3.7; confirmed live in
   `Auralis-Redesign.dc.html`'s CSS: `'FILL' 1, 'wght' 500` active vs. `'FILL' 0, 'wght' 400`
   inactive).
2. `tokens/fonts.css` line 1 — `Inter` (weights 400/500/600/700/900) + `Roboto Flex`
   (`opsz,wght@8..144,400..900`).

This product is self-hosted, one container, one port, and designed to run offline/LAN-only
(`docs/HANDOVER.md`). Both requests must be self-hosted rather than left pointing at Google's
CDN. **The specific degradation if left unfixed**: Sonora's components render icons as
glyph-name-as-element-text (`font-family: 'Material Symbols Rounded'` + literal text content
`play_arrow`, `skip_next`, `arrow_back`, etc. — confirmed in every component card and in
`Auralis-Redesign.dc.html`'s own transport controls). Offline, the icon font fails to load and
those literal words render as plain text on every button — not a missing-icon glyph, the actual
English word.

---

## 9. What is NOT vendored — read this before assuming full coverage

- **Screenshots (10 files) were not vendored.** The MCP returns file content into the
  orchestrator's context, where a PNG is useless there; they were viewed, not saved. Named,
  with what each is normative for: `nav-fill.png` (the FILL axis on selected nav items),
  `glyphs.png` (the icon set), `bottomnav.png` (mobile bottom nav), `rail-icons.png` /
  `rail-icons2.png` (desktop rail), `episode.png` (podcast episode screen),
  `01/02-podcast-tiles.png`, `01/02-search-lyrics.png`. Any wave that needs to confirm a visual
  detail these normally would show needs a `DesignSync`-capable session (the orchestrator) to
  look again — they are not recoverable from this file.
- **`_ds_bundle.js`** (compiled component implementations) and **`support.js`** (a generic
  renderer runtime the `.dc.html` files depend on to execute, not design content) were not
  vendored — neither carries information a rebuilder needs; they're tooling.
- **The nine `components/*.dc.html` files are reformatted, not byte-identical to the design
  project's originals**: wrapper boilerplate was dropped, `x-import
component-from-global-scope="SonoraDesignSystem_6c1435.X"` was rewritten as `<Sonora.X>`, and
  escaped `data-props` JSON was restated as a `// props:` comment. **The `renderVals()` function
  bodies themselves are untouched** — every style string and default value quoted in §3 above is
  exactly what the design project emits.
- **`Canvas.dc.html` is empty upstream** and was not vendored — nothing was lost by omitting it.
- **The 16 Sonora primitives' own component source (`.jsx`/`.d.ts`/`.prompt.md`) live in the
  _other_ design project** (the Sonora Design System project, not the Auralis kickoff project)
  **and were not vendored.** Everything in §4 is reconstructed from lint-rule side effects
  (`_adherence.oxlintrc.json`), not read from the components themselves. Treat §4 as a lower
  bound on each component's real prop surface — a lint rule only lists props it _rejects_
  everything else on, which is a reasonable proxy for "the allowed set" but isn't the same
  guarantee a `.d.ts` file would give.
- **`_adherence.oxlintrc.json` itself is vendored minus its `x-omelette` block** — a flat list of
  122 token names and 16 component names in the original, reconstructable from the CSS files
  (§1) and the surviving lint selectors (§4), so nothing is actually lost, just redundant with
  data already in this file.

---

## 10. Contradictions found while writing this file (summary)

Collected here so a future wave doesn't have to re-derive them by re-reading the sources:

1. `readme.md` and `docs/ROADMAP.md` §16 both say the Material Symbols icon font is imported
   from `tokens/fonts.css`. It is not — it's imported from `styles.css` line 1; `fonts.css`
   only carries Inter + Roboto Flex. (§1.7)
2. `github.md` states the layout rig has four breakpoints, "1440 / 1280 / 1024 / 768." Only
   `1024` and `1240` are implemented as real conditionals in `Auralis-Redesign.dc.html`; the
   other numbers are UI preset-width tab labels in the design tool itself, not breakpoints.
   (§6)
3. This wave's own spec assumed `search` is appended to the **rail only**. Reading the source
   directly shows it's appended to both the desktop rail (`railKeys`) and the mobile bottom nav
   (`bottomItems`). (§7)
4. `ResultRow.dc.html`'s own `// props:` comment declares `tone`'s default as `'progress'`; the
   component's actual `renderVals()` code defaults it to `'library'` (`p.tone || 'library'`).
   The comment and the code disagree with each other, inside the same vendored file. (§3.8)
5. `readme.md`'s component index calls the 16th primitive `BottomNav`; the only prop-API
   evidence available (`_adherence.oxlintrc.json`) names it `BottomNavItem`. Not necessarily a
   real contradiction — `BottomNav` may just be the collective name for a list of
   `BottomNavItem`s — but the two names don't appear together anywhere vendored. (§4)
6. This wave's spec named `packages/ui/src/hooks/breakpoint.ts` as the file to read for the
   app's current breakpoint rig. That path doesn't exist; the real file is
   `apps/web/src/hooks/breakpoint.ts`. (§6)
7. `readme.md`'s "Corner radii" section states desktop uses the small end of the radius scale
   and mobile the large end, as a general rule. `MediaCard.dc.html` does the opposite for its
   art radius (`--radius-sm` on mobile, `--radius-md` on desktop) — read the actual component,
   don't assume the readme's generalization. (§1.10, §3.4)
