# Sonora's own primitives — the real implementations

These are the components `Auralis-Redesign.dc.html` and the Auralis component cards actually
import at runtime, as `<x-import component-from-global-scope="SonoraDesignSystem_6c1435.Button">`
and so on. They live in the **Sonora Design System** project
(`6c14357e-f54e-4ad9-99e0-d7fd5ab02144`), not the kickoff project, which is why the first pass of
wave 16a missed them: 16a vendored the kickoff project, where these appear only as a compiled
`_ds_bundle.js` and as prop signatures inside `_adherence.oxlintrc.json`.

**Prop signatures are not values.** The adherence config says `<Button>` takes
`variant | size | platform | icon | disabled | onClick`; it does not say a `md` button is 36px tall
with `0 16px` padding and `--radius-pill`. Rebuilding from the signature alone produces something
with the right API and the wrong appearance. These files are the values.

Vendored verbatim.

## Eleven are imported by the redesign; five are here

Here: `Button`, `IconButton`, `Chip`, `Card`, `Slider` — the set wave 16c-1 migrates.
Still to vendor when their wave comes: `Input`, `SectionHeader`, `QuickTile`, `SidebarItem`,
`BottomNav`, `TrackRow`, `MiniPlayer`. (`Badge`, `Switch`, `AlbumArt` and `AlbumHeader` exist in
Sonora but the redesign does not import them.)

## Two things to know before copying values out of these

**1. Sonora's primitives reference `--m3-*`, and in this app those names mean something else.**
`Card.jsx` uses `--m3-on-background` and `--m3-on-surface-variant`; `Slider.jsx` uses
`--m3-surface-variant` and `--m3-background` on mobile. In Sonora's own stylesheet those alias the
flat surface scale. **In this app `--m3-*` is emitted by `ThemeProvider` as inline style, computed
at runtime from the user's accent** — so copying the reference gives a different colour than the
design shows. Substitute the `--surface-*` equivalent that Sonora's own `colors.css` aliases it to:

| Sonora writes | Meaning in Sonora | Use in this app |
| --- | --- | --- |
| `--m3-on-background` | `--surface-fg` | `var(--surface-fg)` |
| `--m3-on-surface-variant` | `--surface-fg-muted` | `var(--surface-fg-muted)` |
| `--m3-surface-variant` | `--surface-card` | `var(--surface-card)` |
| `--m3-background` | `--surface-bg` | `var(--surface-bg)` |

This is the same trap that made `--tone-request` wrong (it dereferenced `--m3-tertiary`); see that
token's comment in `packages/ui/src/styles/sonora-theme.css`.

**2. The readme's radius guidance does not describe these files.** `readme.md` says desktop chrome
uses "the small end (3–5px on controls and cards)". `Button.jsx` uses `--radius-pill` at every size
and `Card.jsx` uses `--radius-md` (24px). **Trust these files over the readme's prose** — the same
rule that already applies to the breakpoints and the icon-font claim.
