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
