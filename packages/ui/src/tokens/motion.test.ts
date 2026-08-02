import { describe, expect, it } from 'vitest';
import {
  springPosition,
  springSettleDuration,
  springToLinearEasing,
  SPRINGS,
  type Spring,
} from './motion.js';

describe('springPosition', () => {
  it('starts at rest (0) and ends at rest (1) for every named spring', () => {
    for (const spring of Object.values(SPRINGS)) {
      expect(springPosition(spring, 0)).toBeCloseTo(0, 5);
      const settleSeconds = springSettleDuration(spring) / 1000;
      expect(springPosition(spring, settleSeconds)).toBeCloseTo(1, 2);
    }
  });

  it('is a total function: negative time clamps to the rest position', () => {
    const spring: Spring = { stiffness: 700, dampingRatio: 0.9 };
    expect(springPosition(spring, -1)).toBe(0);
  });

  it('the bouncy spring (ζ=0.6) actually overshoots past 1', () => {
    const bouncy = SPRINGS.bouncy;
    const samples = 400;
    const settleSeconds = springSettleDuration(bouncy) / 1000;
    let maxValue = 0;
    for (let i = 0; i <= samples; i++) {
      const t = (settleSeconds * i) / samples;
      maxValue = Math.max(maxValue, springPosition(bouncy, t));
    }
    expect(maxValue).toBeGreaterThan(1);
  });

  it('critically- and over-damped springs (ζ>=1) never overshoot and are monotonic', () => {
    const critical: Spring = { stiffness: 700, dampingRatio: 1 };
    const overdamped: Spring = { stiffness: 700, dampingRatio: 1.6 };

    for (const spring of [critical, overdamped]) {
      const settleSeconds = springSettleDuration(spring) / 1000;
      let previous = -Infinity;
      const samples = 200;
      for (let i = 0; i <= samples; i++) {
        const t = (settleSeconds * i) / samples;
        const value = springPosition(spring, t);
        expect(value).toBeLessThanOrEqual(1 + 1e-9);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });

  it('the underdamped default spring (ζ=0.9) does not overshoot noticeably', () => {
    // 0.9 is close to critical damping; overshoot should be negligible (M3 "gentle" feel).
    const spring = SPRINGS.default;
    const settleSeconds = springSettleDuration(spring) / 1000;
    let maxValue = 0;
    for (let i = 0; i <= 400; i++) {
      const t = (settleSeconds * i) / 400;
      maxValue = Math.max(maxValue, springPosition(spring, t));
    }
    expect(maxValue).toBeLessThan(1.05);
  });
});

describe('springSettleDuration', () => {
  it('is finite and positive for every named spring', () => {
    for (const spring of Object.values(SPRINGS)) {
      const duration = springSettleDuration(spring);
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBeGreaterThan(0);
    }
  });

  it('orders fast < default < slow, matching stiffness/damping intent', () => {
    expect(springSettleDuration(SPRINGS.fast)).toBeLessThan(springSettleDuration(SPRINGS.default));
    expect(springSettleDuration(SPRINGS.default)).toBeLessThan(springSettleDuration(SPRINGS.slow));
  });

  it('settles within 0.1% of rest by the reported duration and stays there', () => {
    for (const spring of Object.values(SPRINGS)) {
      const settleSeconds = springSettleDuration(spring) / 1000;
      const value = springPosition(spring, settleSeconds);
      expect(Math.abs(value - 1)).toBeLessThanOrEqual(0.001 + 1e-6);

      // and it stays settled afterward (no late re-oscillation past our window)
      const later = springPosition(spring, settleSeconds * 1.5);
      expect(Math.abs(later - 1)).toBeLessThanOrEqual(0.001 + 1e-6);
    }
  });
});

describe('springToLinearEasing', () => {
  it('emits a well-formed CSS linear() function starting at 0 and ending at 1', () => {
    const css = springToLinearEasing(SPRINGS.default);
    expect(css.startsWith('linear(')).toBe(true);
    expect(css.endsWith(')')).toBe(true);

    const body = css.slice('linear('.length, -1);
    const values = body.split(',').map((entry) => Number.parseFloat(entry.trim()));
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values.every((value) => Number.isFinite(value))).toBe(true);
    expect(values[0]).toBeCloseTo(0, 5);
    expect(values.at(-1)).toBeCloseTo(1, 2);
  });

  it('samples more points for a longer, bouncier curve when asked', () => {
    const coarse = springToLinearEasing(SPRINGS.fast, 10);
    const fine = springToLinearEasing(SPRINGS.fast, 50);
    const countOf = (css: string) => css.slice('linear('.length, -1).split(',').length;
    expect(countOf(fine)).toBeGreaterThan(countOf(coarse));
  });

  it('captures the overshoot of the bouncy spring in its sampled values', () => {
    const css = springToLinearEasing(SPRINGS.bouncy, 60);
    const values = css
      .slice('linear('.length, -1)
      .split(',')
      .map((entry) => Number.parseFloat(entry.trim()));
    expect(Math.max(...values)).toBeGreaterThan(1);
  });
});

describe('SPRINGS', () => {
  it('matches the four named springs from docs/DESIGN.md', () => {
    expect(SPRINGS.fast).toEqual({ stiffness: 1400, dampingRatio: 0.9 });
    expect(SPRINGS.default).toEqual({ stiffness: 700, dampingRatio: 0.9 });
    expect(SPRINGS.slow).toEqual({ stiffness: 300, dampingRatio: 0.9 });
    expect(SPRINGS.bouncy).toEqual({ stiffness: 500, dampingRatio: 0.6 });
  });
});
