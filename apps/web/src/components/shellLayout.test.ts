import { describe, expect, it } from 'vitest';
import { contentMaxWidth, railWidth } from './shellLayout.js';

describe('railWidth', () => {
  // Wave 16d-W-2: `railWidth` now takes the `railWide` boolean
  // (`hooks/breakpoint.ts`'s `isRailWide`, `>= 1024px`) rather than the
  // three-way `Breakpoint`, since the rail's own width threshold cuts inside
  // the `medium` (600–1240) range and could never have been expressed by it.
  it('matches the collapsed icon-only rail width when the rail is not wide', () => {
    expect(railWidth(false)).toBe(80);
  });

  it('matches the expanded icon+label rail width once the rail is wide (>= 1024px)', () => {
    expect(railWidth(true)).toBe(220);
  });
});

describe('contentMaxWidth', () => {
  it('caps the content column wider than the old 1200px so it fills more of a very wide viewport', () => {
    expect(contentMaxWidth()).toBe(1320);
  });
});
