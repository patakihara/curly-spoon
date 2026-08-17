import { describe, expect, it } from 'vitest';
import { SHAPE_SCALE, shapeCssVars } from './shape.js';

describe('SHAPE_SCALE', () => {
  // Wave 16c-2-W-1 (docs/ROADMAP.md §16) redefined this onto Sonora's radius scale
  // (docs/design/SONORA.md §1.10) — see shape.ts's doc comment for the desktop-first
  // reasoning and the xl/lg collapse.
  it('matches Sonora’s radius scale (docs/design/SONORA.md §1.10)', () => {
    expect(SHAPE_SCALE.none).toBe(0);
    expect(SHAPE_SCALE.xs).toBe(8);
    expect(SHAPE_SCALE.sm).toBe(16);
    expect(SHAPE_SCALE.md).toBe(24);
    expect(SHAPE_SCALE.lg).toBe(32);
    expect(SHAPE_SCALE.xl).toBe(32);
    expect(SHAPE_SCALE.full).toBe(999);
  });

  it('is non-decreasing from none to full, with xl and lg deliberately equal', () => {
    // Sonora has five radius steps; this scale has seven. `xl` collapses onto `lg`
    // (Sonora has nothing between its `lg` and its `pill`) — see shape.ts. Every other
    // adjacent pair must still strictly increase.
    const order: Array<keyof typeof SHAPE_SCALE> = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'];
    for (let i = 1; i < order.length; i++) {
      const previous = order[i - 1];
      const current = order[i];
      if (previous === undefined || current === undefined) continue;
      if (previous === 'lg' && current === 'xl') {
        expect(SHAPE_SCALE[current]).toBe(SHAPE_SCALE[previous]);
        continue;
      }
      expect(SHAPE_SCALE[current]).toBeGreaterThan(SHAPE_SCALE[previous]);
    }
  });
});

describe('shapeCssVars', () => {
  it('emits pixel custom properties for every step', () => {
    const vars = shapeCssVars();
    expect(vars['--m3-shape-none']).toBe('0px');
    expect(vars['--m3-shape-lg']).toBe('32px');
    expect(vars['--m3-shape-full']).toBe('999px');
  });
});
