import { describe, expect, it } from 'vitest';
import { ELEVATION_SCALE, elevationCssVars } from './elevation.js';

describe('ELEVATION_SCALE', () => {
  it('has six levels (0-5) with non-decreasing dp and a box-shadow string', () => {
    const levels = [0, 1, 2, 3, 4, 5] as const;
    expect(Object.keys(ELEVATION_SCALE)).toHaveLength(6);
    let previousDp = -1;
    for (const level of levels) {
      const entry = ELEVATION_SCALE[level];
      expect(entry.dp).toBeGreaterThanOrEqual(previousDp);
      previousDp = entry.dp;
      if (level > 0) expect(entry.shadow).toContain('px');
    }
  });

  it('level 0 has no shadow', () => {
    expect(ELEVATION_SCALE[0].shadow).toBe('none');
  });
});

describe('elevationCssVars', () => {
  it('emits a --m3-elevation-<n> shadow custom property per level', () => {
    const vars = elevationCssVars();
    expect(vars['--m3-elevation-0']).toBe('none');
    expect(vars['--m3-elevation-3']).toBe(ELEVATION_SCALE[3].shadow);
  });
});
