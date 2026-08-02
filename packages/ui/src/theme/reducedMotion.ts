/**
 * `prefers-reduced-motion` plumbing shared by the theme runtime and any component
 * that needs to skip its spring in favour of an instant settle (docs/DESIGN.md § A11y).
 */

const QUERY = '(prefers-reduced-motion: reduce)';

/** Current reduced-motion preference. `false` outside a browser (e.g. during SSR/tests). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/** Subscribes to reduced-motion preference changes; returns an unsubscribe function. */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(QUERY);
  const handler = () => onChange(mql.matches);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
