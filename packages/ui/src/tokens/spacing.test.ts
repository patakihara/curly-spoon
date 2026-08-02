import { describe, expect, it } from 'vitest';
import { SPACING_SCALE, spacingCssVars, TOUCH_TARGET_MIN } from './spacing.js';

describe('SPACING_SCALE', () => {
  it('is a 4px baseline grid, strictly increasing', () => {
    const steps = Object.values(SPACING_SCALE);
    for (const step of steps) {
      expect(step % 4).toBe(0);
    }
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const curr = steps[i];
      if (prev === undefined || curr === undefined) continue;
      expect(curr).toBeGreaterThan(prev);
    }
  });
});

describe('TOUCH_TARGET_MIN', () => {
  it('is 48px, per docs/DESIGN.md accessibility rules', () => {
    expect(TOUCH_TARGET_MIN).toBe(48);
  });
});

describe('spacingCssVars', () => {
  it('emits --m3-space-<step> custom properties', () => {
    const vars = spacingCssVars();
    expect(vars['--m3-space-md']).toBe(`${SPACING_SCALE.md}px`);
    expect(vars['--m3-touch-target-min']).toBe('48px');
  });
});
