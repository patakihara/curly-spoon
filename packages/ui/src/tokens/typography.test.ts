import { describe, expect, it } from 'vitest';
import { TYPE_SCALE, typographyCssVars } from './typography.js';

describe('TYPE_SCALE', () => {
  it('matches the sizes specified in docs/DESIGN.md', () => {
    expect(TYPE_SCALE['display-large']).toMatchObject({
      size: 57,
      lineHeight: 64,
      weight: 400,
      tracking: -0.25,
    });
    expect(TYPE_SCALE['headline-medium']).toMatchObject({ size: 28, lineHeight: 36, weight: 400 });
    expect(TYPE_SCALE['title-large']).toMatchObject({ size: 22, lineHeight: 28, weight: 500 });
    expect(TYPE_SCALE['body-large']).toMatchObject({ size: 16, lineHeight: 24, weight: 400 });
    expect(TYPE_SCALE['label-large']).toMatchObject({ size: 14, lineHeight: 20, weight: 500 });
  });

  it('provides an emphasised variant for every role, bumping weight without changing size', () => {
    for (const [role, spec] of Object.entries(TYPE_SCALE)) {
      if (role.endsWith('-emphasised')) continue;
      const emphasisedRole = `${role}-emphasised` as keyof typeof TYPE_SCALE;
      const emphasised = TYPE_SCALE[emphasisedRole];
      expect(emphasised, `missing emphasised variant for ${role}`).toBeDefined();
      expect(emphasised.size).toBe(spec.size);
      expect(emphasised.lineHeight).toBe(spec.lineHeight);
      expect(emphasised.weight).toBeGreaterThanOrEqual(600);
      expect(emphasised.weight).toBeGreaterThan(spec.weight);
    }
  });

  it('every role has all four required fields, and line-height exceeds size', () => {
    for (const spec of Object.values(TYPE_SCALE)) {
      expect(spec.size).toBeGreaterThan(0);
      expect(spec.lineHeight).toBeGreaterThan(spec.size);
      expect(spec.weight).toBeGreaterThanOrEqual(100);
      expect(spec.weight).toBeLessThanOrEqual(900);
      expect(typeof spec.tracking).toBe('number');
    }
  });
});

describe('typographyCssVars', () => {
  it('emits size/line-height/weight/tracking custom properties per role', () => {
    const vars = typographyCssVars();
    expect(vars['--m3-type-body-large-size']).toBe('16px');
    expect(vars['--m3-type-body-large-line-height']).toBe('24px');
    expect(vars['--m3-type-body-large-weight']).toBe('400');
    expect(vars['--m3-type-body-large-tracking']).toBe('0.15px');
  });
});
