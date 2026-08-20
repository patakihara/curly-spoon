# Auralis — Design language

**Sonora is the design authority.** Adopted 2026-08-16 (`docs/HANDOVER.md`, `docs/ROADMAP.md`
§16) — Sofia's own design system, vendored into `docs/design/sonora/` and distilled into
`docs/design/SONORA.md`, which has the exact token values, component prop APIs and screen
inventory. **This page does not restate those values.** Its job is the decisions specific to
this app — what we took from which reference, why the component layer is built the way it is,
and where the two systems disagree with each other or with what actually shipped.

**This page used to describe a Material 3 Expressive system** — colour extracted from album
artwork at runtime, spring physics, shape morphing. Sonora is flat, accent-driven (one
user-picked colour from a 17-hue preset set) and explicitly anti-spring ("no bounce, no
spring, no parallax anywhere" — `docs/design/sonora/readme.md`, quoted in `SONORA.md`). The
two could not both be the spec, and this rewrite (wave `16g-design-reconcile`,
`docs/ROADMAP.md` §16) is what settles which one is. **Every section below was checked against
the code, not rewritten from `SONORA.md` alone** — some Expressive-era decisions turned out to
still be true, in whole or in part, and are kept and marked as such.

## The reference set, and what we take from each

| Reference         | What we take                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sonora**        | The design authority as of 2026-08-16 — see above. Flat neutral surfaces, one user-picked accent, weight-900 headings, Material Symbols Rounded icons, docked (non-scrolling) chrome, near-absent motion. `docs/design/SONORA.md` has the values; `docs/ROADMAP.md` §16 has the narrative.                                                                                                                                                                 |
| **YouTube Music** | Split-view Now Playing; thick progress bar; icon-only toggles instead of text tabs; queue as an upward swipe; bottom-sheet-first secondary UI.                                                                                                                                                                                                                                                                                                             |
| **Symfonium**     | Theme colour derived from the current artwork, applied to the whole shell. **Never shipped** — see "Colour" below — and now an open question with Sofia rather than a live feature.                                                                                                                                                                                                                                                                        |
| **Spotify**       | Search that goes deep — one field, typed results, and **lyrics search** as a first-class mode.                                                                                                                                                                                                                                                                                                                                                             |
| **Claude**        | Warm neutral surfaces, generous line-height, restrained accent use, quiet chrome.                                                                                                                                                                                                                                                                                                                                                                          |
| **Feishin**       | Not a design-language reference — for **UI structure** specifically (screen layouts, navigation, information density), this open-source Jellyfin client (`github.com/jeffvli/feishin`) is the gold standard we build against. Sonora itself is a redesign of Booming Music/Symphony, a Feishin-family player, so several structural choices (docked chrome, one bottom player bar) now arrive by way of Sonora rather than by direct reference to Feishin. |
| **Auxio**         | Not a UI reference at all — it's built on Android Fragments/Views, not Jetpack Compose. For Android's **playback-service architecture** (queue handling, gapless playback, ReplayGain, Android Auto integration), this open-source Kotlin/Media3 music player (`github.com/OxygenCobalt/Auxio`) is worth reading for how a mature app structures that layer.                                                                                               |

**M3 Expressive is retired as a reference row.** It contributed spring motion, shape morphing
and high-emphasis containers to the original plan; Sonora replaced all three (see "Motion" and
"Shape" below), so keeping the row would describe a direction the app no longer takes.

**Verify against these references visually, not just from memory of this table.** Put the app
and the reference side by side and look for drift — this is exactly the kind of feedback a
screenshot surfaces faster than another phase of unreviewed code. Note what's off in
`docs/HANDOVER.md`.

## Implementation layer

The **component implementation** is migrating from a hand-built React component set
(`packages/ui/src/components/*.tsx` — `Button`, `Card`, `Sheet`, `Icon`, and the rest) to
[Mantine](https://mantine.dev) (`@mantine/core`), confirmed by the user as a full migration
on 2026-08-04. Mantine components replace the hand-rolled ones; they do not replace or loosen
any token — a migrated `Card` still has to carry the same colour, shape and motion as the one
it replaces, just built on Mantine's primitive instead of a bespoke one. That standard now
means Sonora's tokens rather than M3's.

Theming bridges the two systems, and colour is the one family fully wired end to end:
`packages/ui/src/theme/mantineColors.ts` resamples the currently-resolved `--m3-primary`
value's HCT hue/chroma (`@material/material-color-utilities`) at the ten tone stops Mantine's
own palettes expect, producing a derived `MantineColorsTuple`
(`theme.colors.auralis` / `primaryColor: 'auralis'`) rather than a hand-picked one. **What that
value now is has changed** — see "Colour" below; the mechanism that derives a Mantine ramp
from it is unchanged.

Type, shape, motion and spacing tokens are still applied only as CSS custom properties on the
theme root (`--m3-*`, plus Sonora's own additive `--h1`…`--h4`/`--text-*`/`--radius-*`/etc.
layer since wave 16b-2), independent of Mantine's own theme object. `packages/ui/src/mantine.ts`
re-exports the Mantine primitives already in use (`AppShell`, `NavLink`, `Card`, `Image`,
prefixed `Mantine*`) so `apps/web` keeps consuming UI only through `@auralis/ui`.

**This migration is not close to finished, on either axis.** As of `16f` (2026-08-21), seven
`packages/ui` primitives still reference `--m3-*` directly (`Fab`, `ListItem`, `Marquee`,
`NavigationBar`, `SearchField`, `Snackbar`, `TopAppBar`), and web's onboarding/settings
page-level CSS is wholly on `--m3-*` still — a class of consumer the tracked migration list
does not even count. Android is further along at the token level (Sonora's colour, typography
_and_ shape scale are wired app-wide since `16f`) but has no display font bundled at all — see
"Type" below.

## Colour

**Colour is not, and has never been, derived from artwork at runtime.**
`packages/ui/src/tokens/artwork.ts` exports `sourceColorFromImageData`, built for exactly that
purpose, and a repo-wide grep finds **zero callers outside its own test.** The Symfonium
behaviour named as a reference above was designed for and never wired up.

**`--m3-*` chroma roles are Sonora's fixed literal values, per light/dark theme — not generated
from any source colour.** Wave `16c-2-W-1` (`packages/ui/src/tokens/color.ts`) replaced the
runtime HCT dynamic-scheme generator (`@material/material-color-utilities`,
`SchemeExpressive`/`SchemeTonalSpot`) with a lookup against `docs/design/SONORA.md` §1.5/§1.6.
`createScheme`'s `sourceColor`/`contrastLevel`/`variant` options are kept on the function
signature for API compatibility and are now accepted and ignored; only `dark` selects
anything. `@material/material-color-utilities` is still a dependency — `mantineColors.ts` uses
its HCT/`TonalPalette` machinery to build the Mantine ramp described above, from whatever hex
`--m3-primary` now resolves to.

**`--accent` is the one customisable colour**, and it is what actually ships: Symphony's
17-hue preset picker (`docs/design/SONORA.md` §1.3), stored per-user, defaulting to violet
(`#8b5cf6`, `DEFAULT_ACCENT` in `color.ts`). `--accent-ink` and the four `--tone-*` app-level
tokens (`SONORA.md` §2) derive from it. Wired into web's Settings; Android's accent picker
landed in `16f-A-2`.

**Colour changes still cross-fade rather than snap**, and the mechanism this page originally
described for artwork colour is what now carries a light/dark mode switch and an accent
change: every `--m3-*` colour property is registered via `CSS.registerProperty` with
`syntax: '<color>'` so browsers treat it as animatable, and the wrapper element carries a
`transition` on those properties using the spring-derived `slow` easing curve (see "Motion").
This is the one place Expressive's spring math still drives something a user sees.

**The fallback source colour** (`AURALIS_SOURCE_COLOR`, `#B8683C`, the "lamp-lit reading" warm
amber) still exists as `ThemeProvider`'s `sourceColor` default, kept for API compatibility —
since chroma roles no longer read it, it is currently inert.

**Every generated pair is checked for contrast**, and one gap is open with Sofia, not yet
fixed: `--accent-ink` on `--surface-card` fails WCAG AA at the default (violet) accent in dark
mode, and `--accent-contrast` (a fixed white) fails 4.5:1 against `--accent` at most of the 17
presets. Neither is being worked around by loosening a threshold — see `docs/HANDOVER.md`'s
queued items `dbfb46e`/`abbaca2`.

**The open question, unresolved — do not treat it as answered.** Should album-art-derived
colour ever be wired up as the accent's source, or is the preset picker the final answer? She
named artwork-derived colour as something she loved about Symfonium, and nothing was deleted
to adopt Sonora's picker model — the artwork pipeline was simply never built. This is filed as
`docs/HANDOVER.md` queue item `dbfb46e` and blocks nothing. An earlier draft of `SONORA.md`
recorded this as already asked and answered; it was not, and that was corrected on review.
**Recording a live question as closed is worse than leaving it open** — do not repeat that
here.

## Type

Sonora's own type system, landed additively (wave `16b-2`) alongside the app's pre-existing M3
scale rather than replacing it in one step:

- **Body/UI**: Inter (real, no substitution) — Symphony's actual built-in font choice.
- **Display/heading**: Roboto Flex, substituting Booming Music's real Google Sans Flex, which
  is not published on Google Fonts. Functionally close (same variable-axis concept, same type
  lineage), not pixel-identical.
- **Headings are weight 900 at every size** (`--heading-weight`, `--h1`…`--h4`,
  `docs/design/SONORA.md` §1.8), with **no italics anywhere**. This replaces the old M3 scale's
  extended-Expressive treatment (emphasised variants bumping weight to 600–700), which is still
  present in `packages/ui/src/tokens/typography.ts` and still generates `--m3-*` type tokens —
  it has not yet been deleted or migrated, matching the "not close to finished" note above.

**Both fonts are self-hosted for web** (`16b-1`, 276 KB, `--font-body`/`--font-display`) rather
than loaded from Google's CDN — this product is self-hosted, one container, designed to run
LAN-only, and Sonora's own stylesheet points at `fonts.googleapis.com` by default.

**Android has no display font bundled at all.** `16b-2-A` gave Android Sonora's colour,
typography _and_ shape scale, but nothing self-hosts Roboto Flex there — headings use the
platform's default face at weight 900 rather than `--font-display`. This is a real, named
asymmetry between the two clients (`docs/HANDOVER.md`, the `16e-nowplaying` triple), not an
oversight to silently fix here.

## Shape

**Shape morphing is gone, deliberately, not merely superseded.** The pre-Sonora M3 Expressive
treatment sprang a pressed container's corner radius from one shape family to another (e.g.
`full` → `md` on `:active`) along the spring curve. Sonora's own guidance describes a _fill_
change on press instead — a pill-shaped accent-tinted fill on mobile, a ~10% shift on desktop —
not a radius change, and `packages/ui/src/components/Button.css` now keeps `--radius-pill`
constant at rest and pressed. The e2e suite (`e2e/ui/button.spec.ts`) was rewritten to assert
the radius stays a pill rather than that it changes.

The corner-radius scale itself is Sonora's (`packages/ui/src/tokens/shape.ts`, since
`16c-2-W-1`): `docs/design/SONORA.md` §1.10's five-step scale, desktop-first, mapped onto the
app's existing seven `--m3-shape-*` names (`xl` collapses onto `lg`, `none` stays a literal
`0`, `full` takes Sonora's exact `999px` rather than the old scale's arbitrary `9999px`).
`Card`, `Slider` and `Button` read `--radius-*` directly now and no longer go through this
scale at all; `Dialog`/`Sheet`/`Menu`/`NavigationBar`/`ListItem`/`SearchField` still do.

## Motion

**Expressive's spring-physics design language is gone from what a user sees. The spring math
that used to generate it is not gone from the codebase — it now generates Sonora's flat value
instead, plus the one exception noted under "Colour."**

`packages/ui/src/tokens/motion.ts`'s damped-harmonic-oscillator solver
(`springPosition`/`springSettleDuration`/`springToLinearEasing`, compiling a spring's closed-form
step response to a CSS `linear()` easing string with zero per-frame JS) is unchanged. What
changed, in wave `16c-2-W-1`, is what `motionCssVars()` emits: every `--m3-spring-<name>-*`
pair — `fast`/`default`/`slow`/`bouncy` — now holds the identical flat value,
**`200ms ease-in-out`**, matching Sonora's own stated rule: _"a plain 0.2s ease-in-out fade for
sidebar art and a 0.2s colour transition on nav-item hover — no bounce, no spring, no parallax
anywhere in the source code read"_ (`docs/design/sonora/readme.md`). All four names are kept
(nothing here deletes a `--m3-*` name a caller might still reach for) but no longer correspond
to physically distinct curves.

**One exception**: `ThemeProvider.tsx` calls `springSettleDuration(SPRINGS.slow)` and
`springToLinearEasing(SPRINGS.slow)` directly, not through `motionCssVars()`, to drive the
`--m3-*` colour cross-fade described under "Colour." That is the one place the original spring
curve — not the flat Sonora value — still reaches the screen, and it is a narrow, deliberate
carve-out rather than an oversight.

`prefers-reduced-motion` still collapses every spring to a near-instant single-frame settle
(`REDUCED_MOTION_DURATION_MS = 16`) rather than removing motion feedback outright.

## Layout

Adaptive by width. The two real boundaries are `apps/web/src/hooks/breakpoint.ts`'s existing
rig, not the four frame-width preset buttons (`1440`/`1280`/`1024`/`768`) that some design
recon docs mistake for implemented breakpoints — see `docs/design/SONORA.md` §6 for that
correction in full:

| Width          | Navigation                 | Now Playing           |
| -------------- | -------------------------- | --------------------- |
| < 600px        | Bottom bar                 | Full-screen sheet     |
| 600–1023.98px  | Navigation rail, icon-only | Full-screen sheet     |
| 1024–1239.98px | Navigation rail, labelled  | Full-screen sheet     |
| ≥ 1240px       | Expanded (labelled) rail   | Persistent side panel |

`1024` (`railWide`) is the one boundary Sonora introduces beyond what the app already had;
`1240` (`showPanel`/`expanded`) already existed pre-Sonora. Sonora's own tabbed desktop Now
Playing panel is deliberately not built (`16e-nowplaying-spec`'s ruling stands) — the
persistent side panel above is the existing split-view surface, not a new tabbed one.

**The chrome is docked, not document-scrolled**, as of `16d` (2026-08-17) — this closed a
user-reported bug where the nav rail and the Now Playing sidebar scrolled away with the main
content. `.auralis-shell__content` is the single scroll container at every breakpoint; the
rail, the Now Playing panel and the mini player are pinned. The mini player is always present
when something is loaded, docked above the bottom bar or at the foot of the rail.

## Accessibility

- Every interactive target ≥ 48×48 CSS px (`--m3-touch-target-min`), still true.
- Focus rings are M3 `secondary` (now a Sonora chroma-role value, not an M3-generated one) at
  3px offset, never removed — `:focus-visible { outline: 3px solid var(--m3-secondary); }`.
- **Colour is never the only signal for playing state — but not via an animated equaliser
  glyph.** That was the original plan; what actually ships is a text label folded into the
  accessible name (e.g. `"Static Coast, 3:18, Playing"`), not a drawn glyph. Corrected here
  because a grep for `equaliser`/`equalizer` across the app finds nothing.
- **The keyboard shortcuts below describe global navigation, not player transport, and the
  transport list this page previously named was never implemented.** `apps/web/src/hooks/
shortcuts.ts` is the real shortcut set: `/` focuses search, `g h` goes home, `g l` goes to the
  library, `?` opens the shortcut sheet. There is no `Space`/arrow-seek/`J`/`L`/`[`/`]` player
  shortcut handler anywhere in `apps/web/src/features/player` — grepped, not assumed. If player
  transport shortcuts are wanted, that is unbuilt work, not a stale doc.
