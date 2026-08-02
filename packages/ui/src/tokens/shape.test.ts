import { describe, expect, it } from 'vitest';
import { SHAPE_SCALE, shapeCssVars } from './shape.js';

describe('SHAPE_SCALE', () => {
  it('matches the corner-radius scale in docs/DESIGN.md', () => {
    expect(SHAPE_SCALE.none).toBe(0);
    expect(SHAPE_SCALE.xs).toBe(4);
    expect(SHAPE_SCALE.sm).toBe(8);
    expect(SHAPE_SCALE.md).toBe(12);
    expect(SHAPE_SCALE.lg).toBe(16);
    expect(SHAPE_SCALE.xl).toBe(28);
    expect(SHAPE_SCALE.full).toBe(9999);
  });

  it('is monotonically increasing from none to full', () => {
    const order: Array<keyof typeof SHAPE_SCALE> = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'];
    for (let i = 1; i < order.length; i++) {
      const previous = order[i - 1];
      const current = order[i];
      if (previous === undefined || current === undefined) continue;
      expect(SHAPE_SCALE[current]).toBeGreaterThan(SHAPE_SCALE[previous]);
    }
  });
});

describe('shapeCssVars', () => {
  it('emits pixel custom properties for every step', () => {
    const vars = shapeCssVars();
    expect(vars['--m3-shape-none']).toBe('0px');
    expect(vars['--m3-shape-lg']).toBe('16px');
    expect(vars['--m3-shape-full']).toBe('9999px');
  });
});
