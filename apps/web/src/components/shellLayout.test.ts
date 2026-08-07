import { describe, expect, it } from 'vitest';
import { contentMaxWidth, railWidth } from './shellLayout.js';

describe('railWidth', () => {
  it('matches the collapsed icon-only rail width at medium widths (docs/DESIGN.md § Layout)', () => {
    expect(railWidth('medium')).toBe(80);
  });

  it('matches the expanded icon+label rail width beyond 1240px', () => {
    expect(railWidth('expanded')).toBe(220);
  });

  it('is unused at compact widths but returns the same value as medium rather than throwing', () => {
    // Compact renders a bottom bar, not a rail, so nothing reads this for
    // 'compact' today — asserted anyway so an accidental fallthrough branch
    // never silently returns something else.
    expect(railWidth('compact')).toBe(80);
  });
});

describe('contentMaxWidth', () => {
  it('caps the content column wider than the old 1200px so it fills more of a very wide viewport', () => {
    expect(contentMaxWidth()).toBe(1320);
  });
});
