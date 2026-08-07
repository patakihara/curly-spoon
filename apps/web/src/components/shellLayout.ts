/**
 * Nav-rail width per breakpoint (docs/DESIGN.md § Layout): a collapsed
 * icon-only rail at medium widths, an expanded icon+label rail beyond
 * 1240px. `Shell.tsx`'s Mantine `AppShell` navbar and the mini player's
 * dock width (`app.css`'s `--auralis-rail-width` custom property) both read
 * this single function so the two can never drift apart — the mini player
 * used to hardcode its own 360px width and silently overlap ~140px into the
 * content column past the rail's real edge (web design audit, 2026-08-06).
 */
import type { Breakpoint } from '../hooks/breakpoint.js';

export function railWidth(breakpoint: Breakpoint): number {
  return breakpoint === 'expanded' ? 220 : 80;
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
