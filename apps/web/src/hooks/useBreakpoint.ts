/**
 * The single source of truth for adaptive layout (docs/DESIGN.md § Layout). Every
 * component that changes shape across widths — navigation, grids, the Now Playing
 * panel — reads this hook rather than rolling its own media query, so the three
 * ranges can never drift out of sync with each other.
 *
 * Backed by `matchMedia` (not a resize listener): the browser only notifies us when
 * the *breakpoint* changes, not on every pixel of a drag-resize.
 */
import { useEffect, useState } from 'react';
import {
  type Breakpoint,
  BREAKPOINT_QUERIES,
  RAIL_WIDE_QUERY,
  breakpointForWidth,
  isRailWide,
} from './breakpoint.js';

function currentBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'expanded';
  return breakpointForWidth(window.innerWidth);
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(currentBreakpoint);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const lists = (Object.entries(BREAKPOINT_QUERIES) as [Breakpoint, string][]).map(
      ([name, query]) => ({ name, mql: window.matchMedia(query) }),
    );

    const handler = () => {
      const active = lists.find(({ mql }) => mql.matches);
      if (active) setBreakpoint(active.name);
    };

    handler(); // in case the breakpoint changed between the initial render and this effect
    for (const { mql } of lists) mql.addEventListener('change', handler);
    return () => {
      for (const { mql } of lists) mql.removeEventListener('change', handler);
    };
  }, []);

  return breakpoint;
}

/**
 * Wave 16d-W-2: whether the nav rail is wide enough to carry icon + label
 * (`>= 1024px`, `breakpoint.ts`'s `isRailWide`) — a second, narrower
 * `matchMedia` subscription than `useBreakpoint`'s three-way split, kept
 * separate rather than folded into it so callers that only care about
 * compact/medium/expanded (`NowPlaying.tsx`) never have to think about a
 * threshold that doesn't change what they render. `true` with no `window`
 * matches `useBreakpoint`'s own SSR default of the widest bucket.
 */
export function useRailWide(): boolean {
  const [railWide, setRailWide] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : isRailWide(window.innerWidth),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia(RAIL_WIDE_QUERY);
    const handler = () => setRailWide(mql.matches);

    handler(); // in case the state changed between the initial render and this effect
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return railWide;
}
