/**
 * M3 elevation: six levels (0-5), each a `dp` reference value and a composited
 * box-shadow. Surfaces additionally tint with the primary colour as elevation rises
 * (handled by components applying `--m3-surface-container-*`, not here) — this module
 * only owns the shadow geometry.
 */

export interface ElevationLevel {
  /** Reference elevation in dp, matching the M3 spec tables. */
  dp: number;
  /** Composited two-layer box-shadow (M3 uses an umbra + a penumbra layer). */
  shadow: string;
}

export const ELEVATION_SCALE: Record<0 | 1 | 2 | 3 | 4 | 5, ElevationLevel> = {
  0: { dp: 0, shadow: 'none' },
  1: {
    dp: 1,
    shadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.30), 0px 1px 3px 1px rgba(0, 0, 0, 0.15)',
  },
  2: {
    dp: 3,
    shadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.30), 0px 2px 6px 2px rgba(0, 0, 0, 0.15)',
  },
  3: {
    dp: 6,
    shadow: '0px 1px 3px 0px rgba(0, 0, 0, 0.30), 0px 4px 8px 3px rgba(0, 0, 0, 0.15)',
  },
  4: {
    dp: 8,
    shadow: '0px 2px 3px 0px rgba(0, 0, 0, 0.30), 0px 6px 10px 4px rgba(0, 0, 0, 0.15)',
  },
  5: {
    dp: 12,
    shadow: '0px 4px 4px 0px rgba(0, 0, 0, 0.30), 0px 8px 12px 6px rgba(0, 0, 0, 0.15)',
  },
};

/** Emits `--m3-elevation-<level>` custom properties holding a ready-to-use box-shadow. */
export function elevationCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [level, entry] of Object.entries(ELEVATION_SCALE)) {
    vars[`--m3-elevation-${level}`] = entry.shadow;
  }
  return vars;
}
