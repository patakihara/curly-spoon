/**
 * The M3 shape scale — corner radii used for containers, and the two end-points of
 * Expressive's shape morph (e.g. `full` -> `large` on button press). See
 * docs/DESIGN.md § Shape.
 */

export const SHAPE_SCALE = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  full: 9999,
} as const;

export type ShapeStep = keyof typeof SHAPE_SCALE;

/** Emits `--m3-shape-<step>` custom properties in px. */
export function shapeCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [step, radius] of Object.entries(SHAPE_SCALE)) {
    vars[`--m3-shape-${step}`] = `${radius}px`;
  }
  return vars;
}
