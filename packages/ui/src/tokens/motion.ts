/**
 * Spring physics, compiled to CSS.
 *
 * This is deliberately *not* an animation library: there is no runtime ticking a
 * spring on every frame. Instead we solve the damped harmonic oscillator's closed-form
 * step response, sample it once, and hand the browser a CSS `linear()` easing function
 * plus a duration. The browser's compositor then drives the animation with zero
 * per-frame JS — springy motion at native scroll/transition cost.
 *
 * All functions here are total: fed a negative or non-finite time they settle on the
 * rest position rather than producing `NaN`, matching the house style in
 * `packages/core/src/time.ts`.
 */

/** A physical spring: how stiff it is, and how quickly it bleeds energy. */
export interface Spring {
  /** Restoring force per unit displacement. Higher = snappier. */
  stiffness: number;
  /** ζ. <1 underdamped (overshoots), =1 critically damped, >1 overdamped. */
  dampingRatio: number;
  /** Defaults to 1 — only the stiffness/damping *ratio* to mass matters for shape. */
  mass?: number;
}

/** Coerce a requested time into the domain where the spring has actually started moving. */
function safeSeconds(tSeconds: number): number {
  return Number.isFinite(tSeconds) && tSeconds > 0 ? tSeconds : 0;
}

/** ω₀, the spring's undamped natural angular frequency. */
function naturalFrequency(spring: Spring): number {
  const mass = spring.mass ?? 1;
  return Math.sqrt(spring.stiffness / mass);
}

/**
 * Position of a spring released at displacement 0 and driven toward rest value 1,
 * normalised so 0 = start, 1 = settled. This is the classic step response of a
 * second-order damped system; which closed form applies depends on ζ:
 *
 * - ζ < 1 (underdamped): decaying sinusoid — the only case that overshoots past 1.
 * - ζ = 1 (critically damped): fastest approach with no oscillation.
 * - ζ > 1 (overdamped): slower, monotonic approach (hyperbolic instead of circular terms).
 */
export function springPosition(spring: Spring, tSeconds: number): number {
  const t = safeSeconds(tSeconds);
  if (t === 0) return 0;

  const zeta = spring.dampingRatio;
  const omega0 = naturalFrequency(spring);
  const decay = Math.exp(-zeta * omega0 * t);

  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const b = zeta / Math.sqrt(1 - zeta * zeta);
    return 1 - decay * (Math.cos(omegaD * t) + b * Math.sin(omegaD * t));
  }

  if (zeta === 1) {
    return 1 - decay * (1 + omega0 * t);
  }

  const omegaH = omega0 * Math.sqrt(zeta * zeta - 1);
  const b = zeta / Math.sqrt(zeta * zeta - 1);
  return 1 - decay * (Math.cosh(omegaH * t) + b * Math.sinh(omegaH * t));
}

/**
 * Milliseconds until the spring is within `epsilon` (default 0.1%) of rest *and stays
 * there* — i.e. every later sample is also within tolerance, not just the first crossing.
 *
 * Underdamped springs oscillate around 1, so we bound them by their decay envelope
 * (the peak amplitude the sinusoid could reach at time t) rather than the instantaneous
 * value, which would falsely "settle" every time the curve crosses 1. Critically- and
 * over-damped springs approach monotonically, so a direct search is safe there.
 */
export function springSettleDuration(spring: Spring, epsilon = 0.001): number {
  const zeta = spring.dampingRatio;
  const omega0 = naturalFrequency(spring);

  if (zeta < 1) {
    const b = zeta / Math.sqrt(1 - zeta * zeta);
    const envelopeScale = Math.sqrt(1 + b * b);
    const tSeconds = Math.log(envelopeScale / epsilon) / (zeta * omega0);
    return Math.max(tSeconds, 0) * 1000;
  }

  // ζ >= 1: |position - 1| decreases monotonically from 1 to 0, so bisection is valid.
  let lo = 0;
  let hi = 1;
  while (Math.abs(springPosition(spring, hi) - 1) > epsilon && hi < 1e6) {
    hi *= 2;
  }
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(springPosition(spring, mid) - 1) > epsilon) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi * 1000;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Renders the spring's settle curve as a CSS `linear()` easing function — the
 * mechanism that lets a plain CSS transition/animation reproduce spring motion with
 * no JS driving it frame-by-frame. `samples` trades fidelity for CSS size; more
 * samples resolve bouncy overshoot more precisely.
 */
export function springToLinearEasing(spring: Spring, samples = 24): string {
  const settleSeconds = springSettleDuration(spring) / 1000;
  const count = Math.max(2, Math.floor(samples));

  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = (settleSeconds * i) / (count - 1);
    points.push(springPosition(spring, t));
  }
  // Force an exact terminus so the transition always lands precisely on its end value.
  points[points.length - 1] = 1;

  const body = points.map((value) => round(value, 4)).join(', ');
  return `linear(${body})`;
}

/** The one spring table Auralis uses — see docs/DESIGN.md § Motion. */
export const SPRINGS: Record<'fast' | 'default' | 'slow' | 'bouncy', Spring> = {
  fast: { stiffness: 1400, dampingRatio: 0.9 },
  default: { stiffness: 700, dampingRatio: 0.9 },
  slow: { stiffness: 300, dampingRatio: 0.9 },
  bouncy: { stiffness: 500, dampingRatio: 0.6 },
};

/**
 * Precomputed `--m3-spring-<name>-duration` / `-easing` CSS custom properties for
 * every named spring, ready to spread onto a wrapper element's inline style or a
 * stylesheet. Computed once at module load since springs never change shape at runtime.
 */
export function motionCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, spring] of Object.entries(SPRINGS)) {
    vars[`--m3-spring-${name}-duration`] = `${Math.round(springSettleDuration(spring))}ms`;
    vars[`--m3-spring-${name}-easing`] = springToLinearEasing(spring);
  }
  return vars;
}

/**
 * `prefers-reduced-motion` collapses every spring to a near-instant, single-frame
 * settle rather than removing motion feedback outright (per docs/DESIGN.md § A11y).
 */
export const REDUCED_MOTION_DURATION_MS = 16;
