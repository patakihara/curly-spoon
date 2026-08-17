/**
 * Nav-rail width (docs/DESIGN.md § Layout): a collapsed icon-only rail below
 * 1024px, an expanded icon+label rail at 1024px and up. `Shell.tsx`'s
 * Mantine `AppShell` navbar and the mini player's dock width (`app.css`'s
 * `--auralis-rail-width` custom property) both read this single function so
 * the two can never drift apart — the mini player used to hardcode its own
 * 360px width and silently overlap ~140px into the content column past the
 * rail's real edge (web design audit, 2026-08-06).
 *
 * Wave 16d-W-2: takes the `railWide` boolean (`hooks/breakpoint.ts`'s
 * `isRailWide`, `>= 1024px`) rather than the three-way `Breakpoint` this
 * used to switch on. `railWide` cuts inside the `medium` (600–1240) range —
 * the rail goes wide four breakpoints below where `Breakpoint` itself
 * changes — so keying this off `Breakpoint` could never have expressed it;
 * the invariant this comment describes (one function, both readers) is what
 * this signature change preserves, not what it's changing.
 */
export function railWidth(railWide: boolean): number {
  return railWide ? 220 : 80;
}

/**
 * The content column's own bound, independent of the rail/Now Playing panel widths
 * around it (docs/DESIGN.md § Layout: bounded content regions, not edge-to-edge text
 * and grids). Found via a design audit at 1440px: the column itself was already using
 * the space available to it (900 of 1440, after the 220px rail and 320px Now Playing
 * panel), so the visible "sparse" gap traced to a quick-pick tile that didn't stretch
 * to its grid cell (`HomePage.tsx`), not to this cap. 1320 is chosen over the previous
 * bare 1200 so a very wide viewport (1920+, where the cap is what actually binds) fills
 * more of the space left after the rail and panel rather than leaving a widening,
 * asymmetric gutter on one side — paired with `app.css`'s `margin-inline: auto` on
 * `.auralis-page`, which centers whatever gutter remains instead of dumping all of it
 * against the Now Playing panel.
 */
export function contentMaxWidth(): number {
  return 1320;
}
