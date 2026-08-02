import { describe, expect, it } from 'vitest';
import { breakpointForWidth } from './breakpoint.js';

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
