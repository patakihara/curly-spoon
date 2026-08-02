# Auralis — Design language

## The reference set, and what we take from each

| Reference         | What we take                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **YouTube Music** | Split-view Now Playing; thick progress bar that thickens further on touch, no playhead dot; icon-only toggles instead of text tabs; queue as an upward swipe; bottom-sheet-first secondary UI. |
| **Symfonium**     | Theme colour derived from the current artwork, applied to the whole shell, not just the player.                                                                                                |
| **Spotify**       | Search that goes deep — one field, typed results, and **lyrics search** as a first-class mode.                                                                                                 |
| **Claude**        | Warm neutral surfaces, generous line-height, restrained accent use, quiet chrome.                                                                                                              |
| **M3 Expressive** | Spring motion, shape morphing, larger type at the top of the hierarchy, high-emphasis containers.                                                                                              |

## Colour

Auralis derives its entire palette at runtime with
[`@material/material-color-utilities`](https://github.com/material-foundation/material-color-utilities):

1. Quantize the current artwork → dominant HCT source colour.
2. Build a **dynamic scheme** (`SchemeExpressive` / `SchemeTonalSpot`) for light and dark.
3. Emit ~50 M3 role tokens as CSS custom properties on `:root`.
4. Cross-fade between palettes on track change — colour is animated, not swapped.

Fallback source colour (no artwork, onboarding, error states) is a warm amber that reads as
"lamp-lit reading", not "corporate blue": `#B8683C`.

Every generated pair is checked for contrast; the token generator has tests asserting
that `on-*` roles clear WCAG AA against their container.

## Type

A single variable font family for the shell (`Inter Variable`, fallback system stack) and
the M3 type scale extended with Expressive's larger display sizes:

| Role            | Size / line-height | Weight | Tracking |
| --------------- | ------------------ | ------ | -------- |
| display-large   | 57 / 64            | 400    | -0.25    |
| headline-medium | 28 / 36            | 400    | 0        |
| title-large     | 22 / 28            | 500    | 0        |
| body-large      | 16 / 24            | 400    | 0.15     |
| label-large     | 14 / 20            | 500    | 0.1      |

Emphasised variants (Expressive) bump weight to 600–700 for the same size, used on the
Now Playing screen and section headers.

## Shape

M3 shape scale, plus Expressive's **shape morphing**: pressed states morph a container
between two corner families (e.g. `full` → `large`) along the spring, rather than scaling.

```
none 0 · xs 4 · sm 8 · md 12 · lg 16 · xl 28 · full 9999
```

Artwork uses `lg`; the Now Playing artwork uses `xl` and morphs to a squircle while
playing — the same "breathing" cue Symfonium uses to indicate playback state.

## Motion

Expressive replaces duration+easing with **physics**. Auralis ships one spring table and
uses nothing else:

| Token            | Stiffness | Damping | Used for                          |
| ---------------- | --------- | ------- | --------------------------------- |
| `spring.fast`    | 1400      | 0.9     | Icon toggles, ripples, checkboxes |
| `spring.default` | 700       | 0.9     | Cards, list items, FAB            |
| `spring.slow`    | 300       | 0.9     | Sheets, Now Playing expansion     |
| `spring.bouncy`  | 500       | 0.6     | Play/pause, like, add-to-queue    |

`prefers-reduced-motion` collapses every spring to a 1-frame settle.

## Layout

Adaptive by width, following M3's canonical breakpoints:

| Width      | Navigation      | Now Playing           |
| ---------- | --------------- | --------------------- |
| < 600px    | Bottom bar      | Full-screen sheet     |
| 600–1240px | Navigation rail | Split view, 2 columns |
| > 1240px   | Expanded rail   | Persistent side panel |

The mini player is always present when something is loaded, docked above the bottom bar or
at the foot of the rail.

## Accessibility

- Every interactive target ≥ 48×48 CSS px.
- Focus rings are M3 `secondary` at 3px offset, never removed.
- Colour is never the only signal — playing state also carries an animated equaliser glyph.
- All player controls are reachable by keyboard with documented shortcuts
  (<kbd>Space</kbd>, <kbd>←</kbd>/<kbd>→</kbd> seek, <kbd>J</kbd>/<kbd>L</kbd> ±30s,
  <kbd>[</kbd>/<kbd>]</kbd> speed).
