/**
 * Dynamic colour: the whole Auralis palette is derived at runtime from a single
 * source colour (usually the current cover art — see `artwork.ts`), never hand-picked.
 *
 * See docs/DESIGN.md § Colour.
 */
import {
  Hct,
  MaterialDynamicColors,
  SchemeExpressive,
  SchemeTonalSpot,
  argbFromHex,
  hexFromArgb,
  type DynamicColor,
  type DynamicScheme,
} from '@material/material-color-utilities';

/** Warm amber fallback — "lamp-lit reading", not corporate blue. Used with no artwork. */
export const AURALIS_SOURCE_COLOR = '#B8683C';

export type SchemeVariant = 'expressive' | 'tonalSpot';

export interface CreateSchemeOptions {
  /** Any parseable hex colour, typically the dominant colour of the current artwork. */
  sourceColor: string;
  /** Light or dark tonal mapping. */
  dark: boolean;
  /** -1 (minimum) .. 0 (standard, spec'd) .. 1 (maximum). Defaults to 0. */
  contrastLevel?: number;
  /** `expressive` (default, hue-shifted secondary/tertiary) or `tonalSpot` (Android 12/13 default). */
  variant?: SchemeVariant;
}

/** The full M3 role set, every value a `#rrggbb` hex string. */
export interface M3Scheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  surfaceDim: string;
  surfaceBright: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  outline: string;
  outlineVariant: string;
  scrim: string;
  shadow: string;
}

/** Every role this module emits, paired with the `MaterialDynamicColors` definition that resolves it. */
const ROLE_DEFINITIONS: Record<keyof M3Scheme, DynamicColor> = {
  primary: MaterialDynamicColors.primary,
  onPrimary: MaterialDynamicColors.onPrimary,
  primaryContainer: MaterialDynamicColors.primaryContainer,
  onPrimaryContainer: MaterialDynamicColors.onPrimaryContainer,
  secondary: MaterialDynamicColors.secondary,
  onSecondary: MaterialDynamicColors.onSecondary,
  secondaryContainer: MaterialDynamicColors.secondaryContainer,
  onSecondaryContainer: MaterialDynamicColors.onSecondaryContainer,
  tertiary: MaterialDynamicColors.tertiary,
  onTertiary: MaterialDynamicColors.onTertiary,
  tertiaryContainer: MaterialDynamicColors.tertiaryContainer,
  onTertiaryContainer: MaterialDynamicColors.onTertiaryContainer,
  error: MaterialDynamicColors.error,
  onError: MaterialDynamicColors.onError,
  errorContainer: MaterialDynamicColors.errorContainer,
  onErrorContainer: MaterialDynamicColors.onErrorContainer,
  surface: MaterialDynamicColors.surface,
  onSurface: MaterialDynamicColors.onSurface,
  surfaceVariant: MaterialDynamicColors.surfaceVariant,
  onSurfaceVariant: MaterialDynamicColors.onSurfaceVariant,
  surfaceContainerLowest: MaterialDynamicColors.surfaceContainerLowest,
  surfaceContainerLow: MaterialDynamicColors.surfaceContainerLow,
  surfaceContainer: MaterialDynamicColors.surfaceContainer,
  surfaceContainerHigh: MaterialDynamicColors.surfaceContainerHigh,
  surfaceContainerHighest: MaterialDynamicColors.surfaceContainerHighest,
  surfaceDim: MaterialDynamicColors.surfaceDim,
  surfaceBright: MaterialDynamicColors.surfaceBright,
  inverseSurface: MaterialDynamicColors.inverseSurface,
  inverseOnSurface: MaterialDynamicColors.inverseOnSurface,
  inversePrimary: MaterialDynamicColors.inversePrimary,
  outline: MaterialDynamicColors.outline,
  outlineVariant: MaterialDynamicColors.outlineVariant,
  scrim: MaterialDynamicColors.scrim,
  shadow: MaterialDynamicColors.shadow,
};

function buildDynamicScheme(options: CreateSchemeOptions): DynamicScheme {
  const { sourceColor, dark, contrastLevel = 0, variant = 'expressive' } = options;
  const sourceHct = Hct.fromInt(argbFromHex(sourceColor));
  return variant === 'tonalSpot'
    ? new SchemeTonalSpot(sourceHct, dark, contrastLevel)
    : new SchemeExpressive(sourceHct, dark, contrastLevel);
}

/**
 * Builds the full M3 dynamic colour scheme for a source colour. Every `on*` role is
 * guaranteed by the underlying Material spec to clear WCAG AA against the surface it
 * is designed to sit on — see `color.test.ts` for the contrast assertions that hold
 * this to account for every combination Auralis actually uses.
 */
export function createScheme(options: CreateSchemeOptions): M3Scheme {
  const scheme = buildDynamicScheme(options);
  const result = {} as M3Scheme;
  for (const [role, definition] of Object.entries(ROLE_DEFINITIONS) as Array<
    [keyof M3Scheme, DynamicColor]
  >) {
    result[role] = hexFromArgb(definition.getArgb(scheme));
  }
  return result;
}

/** camelCase -> kebab-case, e.g. `onPrimaryContainer` -> `on-primary-container`. */
function kebabCase(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Emits `--m3-primary`, `--m3-on-primary-container`, etc., ready to apply to an element. */
export function schemeToCssVars(scheme: M3Scheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [role, hex] of Object.entries(scheme)) {
    vars[`--m3-${kebabCase(role)}`] = hex;
  }
  return vars;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalised = hex.replace('#', '');
  const value = Number.parseInt(normalised, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** WCAG relative luminance of a single sRGB channel (0-255). */
function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/**
 * WCAG 2 contrast ratio between two `#rrggbb` colours, from 1 (no contrast) to 21
 * (black on white). Order of arguments does not matter — the ratio is symmetric.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}
