/**
 * The 4px baseline spacing grid, plus the 48px minimum touch target every interactive
 * component must meet (docs/DESIGN.md § Accessibility).
 */

export const SPACING_SCALE = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type SpacingStep = keyof typeof SPACING_SCALE;

/** Every interactive target must be at least this large in both dimensions, CSS px. */
export const TOUCH_TARGET_MIN = 48;

/** Emits `--m3-space-<step>` custom properties, plus `--m3-touch-target-min`. */
export function spacingCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [step, value] of Object.entries(SPACING_SCALE)) {
    vars[`--m3-space-${step}`] = `${value}px`;
  }
  vars['--m3-touch-target-min'] = `${TOUCH_TARGET_MIN}px`;
  return vars;
}
