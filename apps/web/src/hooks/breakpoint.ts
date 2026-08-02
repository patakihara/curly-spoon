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
