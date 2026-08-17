/**
 * `--m3-*` colour: wave 16c-2-W-1 (`docs/ROADMAP.md` §16) replaced the artwork/HCT-derived
 * dynamic scheme this module used to compute with Sonora's **fixed** chroma roles — see
 * `docs/design/SONORA.md` §1.5/§1.6. Every `M3Scheme` role below is now a literal value
 * pinned per light/dark, not generated from a source colour.
 *
 * Why: Android is fully re-themed to Sonora; web's `--m3-*` values were still the old
 * pre-Sonora palette, so the two clients did not look like the same product. This closes
 * that gap for the four `--m3-*` families (colour, radius, motion, elevation) — typography
 * and spacing are a later wave.
 *
 * The `createScheme`/`schemeToCssVars` API shape is kept unchanged on purpose so
 * `ThemeProvider.tsx` — and its `sourceColor`/`contrastLevel`/`variant` options — needed no
 * changes at all; those three options are now accepted and ignored, and only `dark` selects
 * anything. **`--accent` (the user-picked colour, `packages/ui/src/styles/sonora-tokens.css`)
 * is the one customisable colour going forward.** Settings' colour-swatch picker, which used
 * to feed `sourceColor` into the now-removed HCT generator, no longer visibly changes any
 * `--m3-*`-driven surface — wiring that picker onto `--accent` instead is a later wave's job,
 * not this one's.
 *
 * `@material/material-color-utilities` is no longer imported here — nothing in this module
 * derives a scheme from a source colour any more.
 */

export type SchemeVariant = 'expressive' | 'tonalSpot';

export interface CreateSchemeOptions {
  /**
   * Accepted for API compatibility with the old HCT-derived generator this module used to
   * wrap — no longer read. `--m3-*` chroma roles are Sonora's fixed values now; `--accent`
   * (not this module) is the one colour a source hex can still influence.
   */
  sourceColor?: string;
  /** Light or dark tonal mapping — the only option this module still reads. */
  dark: boolean;
  /** Accepted for API compatibility; no longer read (see module doc comment). */
  contrastLevel?: number;
  /** Accepted for API compatibility; no longer read (see module doc comment). */
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

/** Warm amber fallback — "lamp-lit reading", not corporate blue. Retained for API
 * compatibility with `ThemeProvider`'s default `sourceColor` prop; no longer feeds a
 * generator (see module doc comment). */
export const AURALIS_SOURCE_COLOR = '#B8683C';

/**
 * Sonora's `--accent` default (SONORA.md §1.3) — "violet, one pick from the preset family
 * below". Matches `packages/ui/src/styles/sonora-tokens.css`'s `:root { --accent: ... }`
 * literal; kept in sync by hand since the CSS is the value CSS consumers actually see and
 * this constant exists only so `ThemeProvider`'s `accent` prop has the same default without
 * a JS→CSS lookup at render time.
 */
export const DEFAULT_ACCENT = '#8b5cf6';

/**
 * Symphony's 17-hue preset picker (SONORA.md §1.3) — the swatches Settings' accent picker
 * offers, not fixed brand colours. `name` matches the `--accent-<name>` custom property in
 * `sonora-tokens.css` 1:1 (also `Chip`'s `color` prop vocabulary, SONORA.md's component
 * table) — keep both lists in sync if either changes.
 */
export interface AccentPreset {
  name: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'lime', hex: '#84cc16' },
  { name: 'green', hex: '#22c55e' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'teal', hex: '#14b8a6' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'sky', hex: '#0ea5e9' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'indigo', hex: '#6366f1' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'purple', hex: '#a855f7' },
  { name: 'fuchsia', hex: '#d946ef' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'rose', hex: '#f43f5e' },
];

/**
 * Sonora's `--m3-*` chroma roles, light (`docs/design/SONORA.md` §1.5) and surface
 * aliases (§1.6), resolved to literal hex — `--surface-*`/`--surface-*-light` and
 * `--neutral-*` references inlined, per this wave's constraint that a static-context
 * value must never be a `var()` (portalled components — `Dialog`/`Sheet`/`Menu` — cannot
 * see theme-scoped tokens; see `styles/index.css`).
 *
 * Three light-side "on" roles have no declaration in Sonora's own source
 * (`--m3-on-secondary`/`-on-tertiary`/`-on-error`, §1.5's note). Filled in here following
 * the pattern the *declared* roles already establish: M3's light-mode on-color for a
 * tone-40 base (primary/secondary/tertiary/error) is white, and its light-mode
 * on-container equals the same hue's *dark*-mode container (verified against the
 * primary/secondary pairs that Sonora does declare both halves of:
 * `onPrimaryContainer(light) === primaryContainer(dark)` and the same holds for
 * secondary). All three fills clear WCAG AA by a wide margin — see `color.test.ts`.
 *
 * `surfaceDim`/`surfaceBright`/`inverseSurface`/`inverseOnSurface`/`shadow` have no
 * Sonora equivalent at all (Sonora's chroma table has no such roles) and, checked by grep,
 * zero consumers in this codebase today except `inversePrimary` (one: `Snackbar.css`'s
 * action-button colour). Rather than leave them holding the old HCT-generated values,
 * they get structurally-consistent picks: `shadow` is M3's near-universal pure black,
 * the inverse pair swaps this table's own light/dark surface and primary values, and
 * `surfaceDim`/`surfaceBright` fall back to the darkest/brightest tokens already in this
 * table. None of this is exercised by a real screen; a future consumer inherits a real
 * Sonora-family value instead of a stale artwork-derived one.
 */
const LIGHT: M3Scheme = {
  primary: '#4d5c92',
  onPrimary: '#ffffff',
  primaryContainer: '#dce1ff',
  onPrimaryContainer: '#354479',
  secondary: '#595d72',
  onSecondary: '#ffffff',
  secondaryContainer: '#dee1f9',
  onSecondaryContainer: '#565a70',
  tertiary: '#75546f',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ffd7f5',
  onTertiaryContainer: '#603e67',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  surface: '#ebebeb',
  onSurface: '#191919',
  surfaceVariant: '#e1e1e1',
  onSurfaceVariant: '#505050',
  surfaceContainerLowest: '#f0f0f0',
  surfaceContainerLow: '#ebebeb',
  surfaceContainer: '#e1e1e1',
  surfaceContainerHigh: '#d3d3d3',
  surfaceContainerHighest: '#c6c6c6',
  surfaceDim: '#e1e1e1',
  surfaceBright: '#ffffff',
  inverseSurface: '#0c0c0c',
  inverseOnSurface: '#e1e1e1',
  inversePrimary: '#b6c4ff',
  outline: '#505050',
  outlineVariant: '#e1e1e1',
  scrim: '#000000',
  shadow: '#000000',
};

/** Dark counterpart of {@link LIGHT} — same source, `[data-theme='dark']` half. */
const DARK: M3Scheme = {
  primary: '#b6c4ff',
  onPrimary: '#1d2d61',
  primaryContainer: '#354479',
  onPrimaryContainer: '#dce1ff',
  secondary: '#c2c5dd',
  onSecondary: '#3f434e',
  secondaryContainer: '#565a70',
  onSecondaryContainer: '#dee1f9',
  tertiary: '#ffb7db',
  onTertiary: '#472b50',
  tertiaryContainer: '#603e67',
  onTertiaryContainer: '#ffd7f5',
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  surface: '#0c0c0c',
  onSurface: '#e1e1e1',
  surfaceVariant: '#141414',
  onSurfaceVariant: '#969696',
  surfaceContainerLowest: '#080808',
  surfaceContainerLow: '#0c0c0c',
  surfaceContainer: '#141414',
  surfaceContainerHigh: '#191919',
  surfaceContainerHighest: '#2d2d2d',
  surfaceDim: '#080808',
  surfaceBright: '#2d2d2d',
  inverseSurface: '#ebebeb',
  inverseOnSurface: '#191919',
  inversePrimary: '#4d5c92',
  outline: '#5a5a5a',
  outlineVariant: '#2d2d2d',
  scrim: '#000000',
  shadow: '#000000',
};

/**
 * Returns Sonora's fixed `M3Scheme` for `dark`. `sourceColor`/`contrastLevel`/`variant`
 * are accepted (see `CreateSchemeOptions`) and ignored — see the module doc comment for
 * why. The M3 role set itself is a literal, hand-authored copy so nothing here allocates
 * or computes; callers get a fresh object per call regardless.
 */
export function createScheme(options: CreateSchemeOptions): M3Scheme {
  return { ...(options.dark ? DARK : LIGHT) };
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
