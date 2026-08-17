/**
 * M3 elevation: six levels (0-5), each a `dp` reference value and a composited
 * box-shadow. Surfaces additionally tint with the primary colour as elevation rises
 * (handled by components applying `--m3-surface-container-*`, not here) — this module
 * only owns the shadow geometry.
 *
 * Wave 16c-2-W-1 (`docs/ROADMAP.md` §16) redefined levels **2 and 3 only** — the two
 * this codebase actually reads (`Menu` at 2; `Dialog`/`Sheet`/`Fab` at 3, checked by
 * grep) — onto Sonora's shadow scale (`docs/design/SONORA.md` §1.11): level 2 (a
 * floating menu, moderate prominence) takes `--shadow-md`; level 3 (dialogs, sheets,
 * the FAB — the most prominent floating surfaces) takes `--shadow-lg`. Levels 0, 1, 4
 * and 5 have no consumer in this codebase today and are left as the old M3-spec
 * shadow geometry — redefining unread levels would be guessing at values nothing
 * exercises.
 *
 * Sonora's own note: shadows are desktop-only, and mobile depth comes from
 * `--m3-surface-container-*` steps instead, never a shadow. This module has no
 * `apps/web`-vs-mobile distinction to hang a media query off, so it keeps the desktop
 * values unconditionally rather than inventing a split the rest of the app doesn't
 * have a concept for — stated here rather than worked around.
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
    // Sonora --shadow-md (docs/design/SONORA.md §1.11) — the only consumer is `Menu`.
    shadow: '0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
  },
  3: {
    dp: 6,
    // Sonora --shadow-lg (docs/design/SONORA.md §1.11) — consumers: `Dialog`, `Sheet`, `Fab`.
    shadow: '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
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
