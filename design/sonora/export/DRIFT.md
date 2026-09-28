# Drift: this system vs `patakihara/curly-spoon`

Measured against the vendored copy in that repo at `e79325b0` — `packages/ui/src/styles/sonora-tokens.css`,
`packages/ui/src/styles/sonora-theme.css` and `apps/android/.../ui/theme/Color.kt`. Those three files are
the comparison; other files in that repo may reference tokens not checked here.

## Values that changed

| token | vendored | current |
| --- | --- | --- |
| `--state-info` | `var(--accent)` | `#9B66E9` |
| `--surface-bg` (light) | `rgb(235,235,235)` | `#F9F6F6` |
| `--surface-bg-alt` (light) | `rgb(240,240,240)` | `#FFFFFF` |
| `--surface-card` (light) | `rgb(225,225,225)` | `#E8E1E1` |
| `--surface-bg` (dark) | `var(--neutral-900)` `#0C0C0C` | `#141414` |
| `--surface-card` (dark) | `var(--neutral-850)` `#141414` | `#1C1B1D` |
| `--accent-ink` (dark) | `var(--accent)` | `#A78BFA` |
| `--accent-ink` (light) | `color-mix(in oklch, var(--accent) 58%, black)` | `#6D28D9` |
| `--tone-library` (dark) | `var(--accent)` | `var(--play)` |
| `--tone-progress` (dark) | `var(--state-warning)` | `var(--accent)` |
| `--tone-request` (dark) | `#ffb7db` | `var(--state-warning)` |
| `--grid-columns-mobile` | — | `4` → `3` (mobile grids are three across) |
| `--grid-gutter-mobile` | — | `12px` → `8px` |
| `--grid-item-min-mobile` | — | `150px` → `100px` |

`--surface-bg-alt` (dark) is unchanged at `#080808`, as are the neutral scale, the state colours apart
from info, radius, shadows, and the type scale. The 17 `--accent-*` presets are gone: Sonora has one
accent, not a user-picked one.

## Families the vendored copy does not have

- **Motion** — `--ease-standard` plus `--duration-instant|fast|quick|medium|slow`. Every transition in
  the system now names one; nothing hardcodes a curve or a number.
- **Scrims** — `--scrim-soft`, `--scrim`, `--scrim-strong`, `--on-scrim`: the darkening over artwork
  (hover actions, progress/queued/failed state, "not in library"), black in both themes.
- **`--surface-hover`** — the wash under transparent controls; theme-aware. The old hardcoded
  `rgb(255 255 255 / 10%)` was invisible in light mode.
- **`--icon-xs` (20px)** — the small glyph size used by ButtonGroup, TabBar and SearchField.
- **Play** — `--play` (rose `#F44862`), `--play-contrast`, `--play-icon`, `--play-ink`: the second named colour, for
  what is about playback. `--state-success-ink` is the ink on a genuine success fill.
- **Tone inks** — `--tone-library-ink`, `--tone-request-ink`, `--tone-progress-ink`, `--tone-error-ink`.
- **Frame + grid measurements** — `--rail-width-expanded|collapsed`, `--rail-row-height`,
  `--appbar-height`, `--appbar-height-mobile`, `--side-sheet-width`, `--content-min-width`,
  `--breakpoint-compact`, the `--grid-*` family, `--miniplayer-album-size`.
- **Art placeholders** — `--art-gradient-start|end`, `--surface-now-playing*`.

## Components added since

Behaviour that did not exist when the copy was vendored, and which the token layer alone will not carry:

- **LibraryShell** — per-view detail memory, sub-tabs, list/grid mode, scroll memory, and the app bar's
  search morph (out on scroll without focus, focused on tap, reset when a sub-page opens or closes).
- **DetailPage / CollectionPage / CircleReveal** — an item's page and a section's full contents, both
  revealed as a circle from the point that opened them.
- **Section**, **TabBar**, **ViewToggle**, **SearchButton**, **ProgressRing**.
- New props on existing components: `TopAppBar` (`flush`, `progress`, `background`, `searchHeight`,
  `searchButton`, `searchAutoFocus`), `ContentPane`/`AppShell` (`flat`), `MediaCard` (`size`),
  `ResultRow` (`divider`).

- **NowPlaying + PlayerSheet / PlayerPanel / NowPlayingPage / LyricsPage / QueuePage / BottomAppBar /
  LyricsSyncButton** — the Currently Playing surface, componentized to one canonical shape with two
  platform forms. `NowPlaying` takes one set of props and renders either: on mobile a `PlayerSheet`
  covering the app frame, opening by expanding the now-playing bar's own rectangle (a `clip-path`
  inset animation off the bar's measured rect — nothing the token layer can express), with lyrics and
  queue as previews that open full pages, also reachable from a `BottomAppBar`; on desktop a
  `PlayerPanel` where lyrics and queue are sibling tabs. Behaviour to port, not just values:
  `LyricsSyncButton`'s three states (synced → current line marked by an accent dot only → no sync and
  no indication; the last two ungrey every line) and `QueuePage`'s edit mode (selection, drag reorder,
  remove bar).
- New tokens for it: `--bottom-app-bar-height` (64px).
- New props on existing components: `Lyrics` (`syncMode`, `card`, `textSize`, `autoScroll`,
  `onLineClick`), `QueueRow` (`handle`, `editing`, `selected`, `onSelectToggle`).

See `export/component-api.md` for the full prop tables.
