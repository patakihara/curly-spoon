/**
 * The `--m3-shape-*` corner-radius scale. Wave 16c-2-W-1 (`docs/ROADMAP.md` §16)
 * redefined this onto Sonora's radius scale (`docs/design/SONORA.md` §1.10:
 * xs=8, sm=16, md=24, lg=32, pill=999), desktop-first per the wave spec — Sonora
 * merges a desktop and a mobile scale into one and says desktop uses the small end.
 *
 * Sonora has five steps; this scale has seven (`none` plus six M3 steps), so two
 * collapses were necessary rather than invented: `xl` maps onto the same value as
 * `lg` (Sonora has nothing between its `lg` and its `pill`), and `none` stays a
 * literal `0` — Sonora has no "no radius" token, since "no radius" isn't a design
 * choice a token library needs to make. `full` takes Sonora's exact `radius-pill`
 * value (999px), not the old scale's arbitrary 9999px.
 *
 * `Card`, `Slider` and `Button` were migrated straight onto `--radius-*` in wave
 * 16c-1-W and no longer read this scale at all — this only still matters for
 * `Dialog`/`Sheet`/`Menu`/`NavigationBar`/`ListItem`/`SearchField` and a handful of
 * `apps/web` call sites that have not migrated yet.
 */

export const SHAPE_SCALE = {
  none: 0,
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 32,
  full: 999,
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
