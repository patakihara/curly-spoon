import { describe, expect, it } from 'vitest';
import { breakpointForWidth, isRailWide } from './breakpoint.js';

describe('breakpointForWidth', () => {
  it('is compact for anything under 600px', () => {
    expect(breakpointForWidth(0)).toBe('compact');
    expect(breakpointForWidth(320)).toBe('compact');
    expect(breakpointForWidth(599)).toBe('compact');
  });

  it('is medium from 600px up to (not including) 1240px', () => {
    expect(breakpointForWidth(600)).toBe('medium');
    expect(breakpointForWidth(900)).toBe('medium');
    expect(breakpointForWidth(1239)).toBe('medium');
  });

  it('is expanded from 1240px up', () => {
    expect(breakpointForWidth(1240)).toBe('expanded');
    expect(breakpointForWidth(1920)).toBe('expanded');
  });

  it('has no gap or overlap at the two boundaries', () => {
    for (const width of [599, 600, 1239, 1240]) {
      const bp = breakpointForWidth(width);
      expect(['compact', 'medium', 'expanded']).toContain(bp);
    }
    expect(breakpointForWidth(599)).not.toBe(breakpointForWidth(600));
    expect(breakpointForWidth(1239)).not.toBe(breakpointForWidth(1240));
  });
});

describe('isRailWide', () => {
  // Wave 16d-W-2: the redesign's second threshold, `railWide = w >= 1024`,
  // sitting inside `breakpointForWidth`'s own `medium` (600–1240) range —
  // one new intermediate state where the rail is wide but the Now Playing
  // panel (`showPanel = w >= 1240`, unchanged, already equals `expanded`)
  // is not.
  it('is false below 1024px, including inside the medium breakpoint range', () => {
    expect(isRailWide(0)).toBe(false);
    expect(isRailWide(600)).toBe(false);
    expect(isRailWide(1023)).toBe(false);
  });

  it('is true from 1024px up, before the rail also gains the Now Playing panel at 1240', () => {
    expect(isRailWide(1024)).toBe(true);
    expect(isRailWide(1100)).toBe(true);
    expect(isRailWide(1239)).toBe(true);
  });

  it('stays true through and beyond the expanded breakpoint', () => {
    expect(isRailWide(1240)).toBe(true);
    expect(isRailWide(1920)).toBe(true);
  });
});
