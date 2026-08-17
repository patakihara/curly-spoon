/**
 * Pure width→breakpoint mapping, per docs/DESIGN.md § Layout. Kept separate from
 * `useBreakpoint` (which wires this to `matchMedia`) so the boundary behaviour is
 * unit-testable without a DOM — the repo has no jsdom/happy-dom installed, and
 * adding one is out of scope for this phase (see the Phase 4 report), so
 * DOM-dependent rendering is covered by `e2e/app/navigation.spec.ts` instead.
 */

export type Breakpoint = 'compact' | 'medium' | 'expanded';

/** The three canonical M3 ranges: < 600, 600–1240, > 1240 (upper bound exclusive). */
export const BREAKPOINT_QUERIES: Record<Breakpoint, string> = {
  compact: '(max-width: 599.98px)',
  medium: '(min-width: 600px) and (max-width: 1239.98px)',
  expanded: '(min-width: 1240px)',
};

/** `< 600px` → bottom bar; `600–1240px` → rail; `> 1240px` → expanded rail. Boundaries are inclusive-low. */
export function breakpointForWidth(width: number): Breakpoint {
  if (width < 600) return 'compact';
  if (width < 1240) return 'medium';
  return 'expanded';
}

/**
 * Wave 16d-W-2: the redesign's rail-width threshold, `railWide = w >= 1024`
 * (docs/ROADMAP.md §16, `docs/design/SONORA.md` §3.7's `github.md` audit). It
 * is deliberately **not** a fourth member of `Breakpoint` — 1024 falls inside
 * the existing `medium` (600–1240) range, so this is a second, narrower
 * threshold layered on top of the three-way compact/medium/expanded rig, not
 * a widened union. `Breakpoint` has consumers (`NowPlaying.tsx`, the compact
 * vs rail-vs-bottom-bar branch in `Shell.tsx`) that only care about the
 * three-way split and would gain a bucket that changes nothing they render;
 * a plain boolean, threaded only where the rail's own width actually depends
 * on it (`shellLayout.ts`'s `railWidth()`, `Shell.tsx`'s rail testid), keeps
 * those consumers untouched. `showPanel = w >= 1240` needs no equivalent
 * export — it already equals `breakpoint === 'expanded'`.
 */
export const RAIL_WIDE_QUERY = '(min-width: 1024px)';

/** `>= 1024px` → the rail carries icon + label; below it, icon-only. */
export function isRailWide(width: number): boolean {
  return width >= 1024;
}
