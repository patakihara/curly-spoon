# Auralis — Design language

## The reference set, and what we take from each

| Reference         | What we take                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **YouTube Music** | Split-view Now Playing; thick progress bar that thickens further on touch, no playhead dot; icon-only toggles instead of text tabs; queue as an upward swipe; bottom-sheet-first secondary UI.                                                                                                                                                                                               |
| **Symfonium**     | Theme colour derived from the current artwork, applied to the whole shell, not just the player.                                                                                                                                                                                                                                                                                              |
| **Spotify**       | Search that goes deep — one field, typed results, and **lyrics search** as a first-class mode.                                                                                                                                                                                                                                                                                               |
| **Claude**        | Warm neutral surfaces, generous line-height, restrained accent use, quiet chrome.                                                                                                                                                                                                                                                                                                            |
| **M3 Expressive** | Spring motion, shape morphing, larger type at the top of the hierarchy, high-emphasis containers.                                                                                                                                                                                                                                                                                            |
| **Feishin**       | Not a design-language reference — YouTube Music stays primary for colour, motion and warmth. For **UI structure** specifically (screen layouts, navigation, information density: how a screen is put together, not how it's styled), this open-source Jellyfin client (`github.com/jeffvli/feishin`) is the gold standard we build against.                                                  |
| **Auxio**         | Not a UI reference at all — it's built on Android Fragments/Views, not Jetpack Compose, so its screens don't translate. For Android's **playback-service architecture** (queue handling, gapless playback, ReplayGain, Android Auto integration), this open-source Kotlin/Media3 music player (`github.com/OxygenCobalt/Auxio`) is worth reading for how a mature app structures that layer. |

**Verify against these references visually, not just from memory of this table** — but only
once a surface has real content to compare, not a placeholder screen. A blank onboarding form
or a single-item stub screen (e.g. Android's current placeholder `HomeScreen`) isn't a
meaningful comparison point; a populated home shelf, a library grid, or the Now Playing surface
is. Concretely: do this for **web** now that phases 4–6 have real shelves/library/player screens
live, and for **Android** once wave B2 (real home/library data) and wave C (player) land — see
`docs/ROADMAP.md` §7. Put the app and the reference (YouTube Music / Symfonium, run on a phone
or their web equivalents) side by side and look for drift from the table above: is the Now
Playing surface actually split-view with a thickening progress bar, does the theme colour
actually derive from current artwork across the whole shell, does search actually go as deep as
Spotify's. Note what's off in `docs/HANDOVER.md` rather than letting it sit unreviewed — this
is exactly the kind of feedback a screenshot surfaces faster than another phase of unreviewed
code (see `docs/HANDOVER.md` §7's "get it in front of the user early").

## Implementation layer

Everything below this point — colour, type, shape, motion, layout, accessibility — is the
**design language**: the target this project is aiming for, unchanged by what follows.

The **component implementation** is migrating from a hand-built React component set
(`packages/ui/src/components/*.tsx` — `Button`, `Card`, `Sheet`, `Icon`, and the rest) to
[Mantine](https://mantine.dev) (`@mantine/core`), confirmed by the user as a full migration
on 2026-08-04 (see `docs/HANDOVER.md`'s "Mantine" section). Mantine components replace the
hand-rolled ones; they do not replace or loosen any token on this page — a migrated `Card`
still has to be the same M3 shape, colour and motion as the one it replaces, just built on
Mantine's primitive instead of a bespoke one.

Theming is what bridges the two systems, and today only **colour** is fully wired:
`packages/ui/src/theme/mantineColors.ts` takes the already-resolved M3 dynamic-scheme
primary (`scheme.primary` — an artwork-derived hex, see "Colour" below) and resamples its
HCT hue/chroma at the ten tone stops Mantine's own palettes expect
(`[98, 95, 90, 80, 70, 60, 50, 40, 30, 20]`, lightest to darkest), producing a derived
`MantineColorsTuple` rather than a hand-picked one — the same "never hand-pick, always
derive" rule this page applies to every other M3 token.
`packages/ui/src/theme/ThemeProvider.tsx` feeds that tuple into `MantineProvider` as `theme.colors.auralis` /
`primaryColor: 'auralis'`, and pins `forceColorScheme` to the same resolved light/dark mode
the rest of the shell uses, so Mantine never disagrees with the M3 CSS custom properties
(`--m3-*`) painted onto `.auralis-theme-root`.

Type, shape, motion and spacing tokens are, as of this writing, still applied only as those
CSS custom properties on the theme root, independent of Mantine's own theme object — as the
component migration proceeds they are expected to feed Mantine's theme (`fontFamily`,
`radius`, `spacing`, etc.) the same way colour already does, not be replaced by Mantine's
own defaults. `packages/ui/src/mantine.ts` re-exports the Mantine primitives already in use
(`AppShell`, `NavLink`, `Card`, `Image`, prefixed `Mantine*`) so that `apps/web` keeps
consuming UI only through `@auralis/ui`, the same way it consumes every hand-built
component, rather than importing `@mantine/core` directly.

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
