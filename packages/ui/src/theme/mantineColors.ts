/**
 * Bridges the M3 dynamic colour scheme (`../tokens/color.ts`) into a Mantine colour
 * ramp, so Mantine components (spike: `AppShell`/`NavLink`/`Card` in `apps/web`) pick
 * up the same artwork-derived accent as the rest of the shell, instead of Mantine's
 * static default blue.
 *
 * Mantine wants a 10-shade `MantineColorsTuple` (lightest at index 0, darkest at
 * index 9) for `theme.colors`, not a single hex — that's what drives its own
 * hover/light/filled variants. Rather than inventing a ramp, this resamples the same
 * HCT hue/chroma the current `M3Scheme.primary` was generated from
 * (`@material/material-color-utilities`, already a dependency here) at the tone
 * stops Mantine's own palettes use, so the ramp is derived, not hand-picked — the
 * same rule docs/DESIGN.md applies to every other M3 token.
 */
import { Hct, TonalPalette, argbFromHex, hexFromArgb } from '@material/material-color-utilities';
import type { MantineColorsTuple } from '@mantine/core';

/** Lightest -> darkest, matching Mantine's own shade convention (`colors[0]` lightest). */
const MANTINE_TONE_STOPS = [98, 95, 90, 80, 70, 60, 50, 40, 30, 20] as const;

/**
 * Builds a full Mantine colour ramp from a single `#rrggbb` hex — in practice the
 * current `scheme.primary` — so `theme.colors.auralis` always matches the resolved
 * M3 primary for the active mode and source colour.
 */
export function mantineTupleFromHex(hex: string): MantineColorsTuple {
  const hct = Hct.fromInt(argbFromHex(hex));
  const palette = TonalPalette.fromHueAndChroma(hct.hue, hct.chroma);
  const tones = MANTINE_TONE_STOPS.map((tone) => hexFromArgb(palette.tone(tone)));
  return tones as unknown as MantineColorsTuple;
}
