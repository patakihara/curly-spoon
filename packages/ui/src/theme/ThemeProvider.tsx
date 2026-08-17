/**
 * The theme runtime: resolves a dynamic M3 scheme from a source colour (usually the
 * current artwork) and applies it as CSS custom properties on a wrapper element.
 *
 * Colour changes cross-fade rather than snap (docs/DESIGN.md § Colour: "colour is
 * animated, not swapped"). We get this from the CSS engine itself, at zero JS-per-frame
 * cost: every `--m3-*` colour property is registered via `CSS.registerProperty` with
 * `syntax: '<color>'`, which makes browsers treat it as animatable, and the wrapper
 * carries a `transition` for exactly those properties using `spring.slow` — the same
 * spring docs/DESIGN.md assigns to "Sheets, Now Playing expansion", i.e. the shell's
 * slowest, calmest motion.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { MantineProvider } from '@mantine/core';
import {
  AURALIS_SOURCE_COLOR,
  DEFAULT_ACCENT,
  createScheme,
  schemeToCssVars,
  type M3Scheme,
} from '../tokens/color.js';
import { mantineTupleFromHex } from './mantineColors.js';
import {
  REDUCED_MOTION_DURATION_MS,
  SPRINGS,
  motionCssVars,
  springSettleDuration,
  springToLinearEasing,
} from '../tokens/motion.js';
import { typographyCssVars } from '../tokens/typography.js';
import { shapeCssVars } from '../tokens/shape.js';
import { elevationCssVars } from '../tokens/elevation.js';
import { spacingCssVars } from '../tokens/spacing.js';
import { prefersReducedMotion, watchReducedMotion } from './reducedMotion.js';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeProviderProps {
  /**
   * Source colour to build the scheme from. Defaults to the Auralis warm-amber fallback.
   * Accepted for API compatibility only since wave 16c-2-W-1 — `--m3-*` chroma roles are
   * Sonora's fixed values now (`../tokens/color.js`'s module doc comment); this no longer
   * drives any visible surface. `accent` below is the one colour a caller can still change.
   */
  sourceColor?: string;
  /** `system` (default) follows `prefers-color-scheme`; `light`/`dark` pin it. */
  mode?: ThemeMode;
  /** -1..1, standard is 0. */
  contrastLevel?: number;
  /**
   * Sonora's one customisable colour (`--accent`, SONORA.md §1.3) — Symphony's 17-hue preset
   * picker, not artwork-derived. Defaults to `DEFAULT_ACCENT` (Sonora's own default, violet).
   * `--accent-ink`/`--tone-library` (`sonora-theme.css`) reference `var(--accent)` already, so
   * they re-derive for free from whatever this resolves to — no separate wiring needed here.
   */
  accent?: string;
  children?: ReactNode;
}

interface ThemeContextValue {
  /** The resolved M3 role set for the current source colour and light/dark mode. */
  scheme: M3Scheme;
  /** What the caller asked for (`light` | `dark` | `system`). */
  mode: ThemeMode;
  /** What `system` resolved to, or the pinned mode — always concrete. */
  resolvedMode: 'light' | 'dark';
  sourceColor: string;
  /** Re-themes the shell from a new source colour (e.g. freshly extracted artwork). */
  setSourceColor: (hex: string) => void;
  setMode: (mode: ThemeMode) => void;
  /** The current `--accent` value (a `#rrggbb` hex, one of `ACCENT_PRESETS` or the default). */
  accent: string;
  /** Re-themes `--accent` (e.g. Settings' colour-swatch picker). */
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function useSystemPrefersDark(): boolean {
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setDark(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return dark;
}

const registeredColorProperties = new Set<string>();

/** Registers a custom property as an animatable `<color>`, once per name, document-wide. */
function registerColorProperty(name: string, initialValue: string): void {
  if (registeredColorProperties.has(name)) return;
  registeredColorProperties.add(name);
  const registrar = (globalThis as { CSS?: { registerProperty?: (options: unknown) => void } }).CSS;
  if (!registrar?.registerProperty) return; // unsupported browser: falls back to an instant swap
  try {
    registrar.registerProperty({ name, syntax: '<color>', inherits: true, initialValue });
  } catch {
    // A previous ThemeProvider instance (or hot-reload) already registered this name.
  }
}

/**
 * Applies every non-colour token scale once — these never cross-fade, they're static
 * design constants (spacing, shape, elevation, type, spring durations/easings).
 */
function useStaticTokenVars(): CSSProperties {
  return useMemo(
    () =>
      ({
        ...motionCssVars(),
        ...typographyCssVars(),
        ...shapeCssVars(),
        ...elevationCssVars(),
        ...spacingCssVars(),
      }) as CSSProperties,
    [],
  );
}

export function ThemeProvider({
  sourceColor = AURALIS_SOURCE_COLOR,
  mode = 'system',
  contrastLevel = 0,
  accent = DEFAULT_ACCENT,
  children,
}: ThemeProviderProps) {
  const systemPrefersDark = useSystemPrefersDark();
  const [ownSourceColor, setOwnSourceColor] = useState(sourceColor);
  const [ownMode, setOwnMode] = useState(mode);
  const [ownAccent, setOwnAccent] = useState(accent);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => watchReducedMotion(setReducedMotion), []);
  // Controlled-prop usage: if the caller passes a new sourceColor/mode/accent, follow it.
  useEffect(() => setOwnSourceColor(sourceColor), [sourceColor]);
  useEffect(() => setOwnMode(mode), [mode]);
  useEffect(() => setOwnAccent(accent), [accent]);

  const resolvedMode: 'light' | 'dark' =
    ownMode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : ownMode;

  const scheme = useMemo(
    () =>
      createScheme({ sourceColor: ownSourceColor, dark: resolvedMode === 'dark', contrastLevel }),
    [ownSourceColor, resolvedMode, contrastLevel],
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const staticVars = useStaticTokenVars();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    // `--accent` rides the same registered-property crossfade as the `--m3-*` scheme (see
    // this module's doc comment) — it is Sonora's one customisable colour
    // (`sonora-tokens.css`'s `:root { --accent: ... }`), and `--accent-ink`/`--tone-library`
    // (`sonora-theme.css`) already reference `var(--accent)`, so overriding it here on
    // `.auralis-theme-root` re-derives both for free with no extra wiring.
    const vars = { ...schemeToCssVars(scheme), '--accent': ownAccent };
    for (const [name, value] of Object.entries(vars)) {
      registerColorProperty(name, value);
    }

    const duration = reducedMotion
      ? REDUCED_MOTION_DURATION_MS
      : springSettleDuration(SPRINGS.slow);
    const easing = reducedMotion ? 'linear' : springToLinearEasing(SPRINGS.slow);
    el.style.transition = Object.keys(vars)
      .map((name) => `${name} ${Math.round(duration)}ms ${easing}`)
      .join(', ');

    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, value);
    }
  }, [scheme, ownAccent, reducedMotion]);

  const setSourceColor = useCallback((hex: string) => setOwnSourceColor(hex), []);
  const setMode = useCallback((next: ThemeMode) => setOwnMode(next), []);
  const setAccent = useCallback((hex: string) => setOwnAccent(hex), []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      mode: ownMode,
      resolvedMode,
      sourceColor: ownSourceColor,
      setSourceColor,
      setMode,
      accent: ownAccent,
      setAccent,
    }),
    [scheme, ownMode, resolvedMode, ownSourceColor, setSourceColor, setMode, ownAccent, setAccent],
  );

  // Mantine spike (docs/HANDOVER.md): `scheme.primary` is already the resolved M3
  // primary for the current source colour *and* mode, as a plain hex string (not
  // just a CSS var) — reusing it here, rather than a fresh source-colour lookup,
  // means Mantine's ramp always matches what the rest of the shell just painted.
  // `theme.colors` values must come from a *string*, not `var(--m3-primary)`:
  // ThemeProvider applies `--m3-*` via inline `style.setProperty` scoped to the
  // `.auralis-theme-root` element below, but Mantine's own CSS variables (and any
  // `theme.colors` consumers) resolve at `:root` — a raw CSS var reference there
  // would resolve to nothing.
  const mantineTheme = useMemo(
    () => ({
      colors: { auralis: mantineTupleFromHex(scheme.primary) },
      primaryColor: 'auralis',
      // `respectReducedMotion` lives on the theme object, not as a direct MantineProvider
      // prop (see @mantine/core's `MantineThemeOverride`/`respectReducedMotion: boolean`).
      // Without it Mantine's own transitions (Modal/Drawer open-close, Collapse, etc.)
      // ignore `prefers-reduced-motion` entirely, unlike the rest of this shell's motion
      // layer (see `reducedMotion.ts` / the `REDUCED_MOTION_DURATION_MS` handling above).
      respectReducedMotion: true,
    }),
    [scheme.primary],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <div
        ref={rootRef}
        className="auralis-theme-root"
        data-theme={resolvedMode}
        // `styles/index.css`'s `:root { color-scheme: light dark }` is only ever a static
        // fallback — it never tracked `resolvedMode` the way `data-theme` above does, so a
        // pinned mode that disagreed with the OS's own `prefers-color-scheme` still got native
        // form-control chrome (placeholder text among it) rendered for the *wrong* scheme:
        // `data-theme` flipped, the actual UA rendering didn't (a11y audit, 2026-08-05, 2.47:1/
        // 2.07:1 against WCAG AA's 4.5:1 floor). `color-scheme` is an inherited CSS property, so
        // setting it here — on the same element `data-theme` already lives on — cascades to
        // every descendant and overrides that `:root` fallback for the whole app, without a
        // second sync mechanism.
        style={{ ...staticVars, colorScheme: resolvedMode }}
      >
        {/* `forceColorScheme` takes `resolvedMode` — already collapsed from `system`
            via `systemPrefersDark` above — so Mantine never disagrees with the rest
            of the shell about light vs. dark, and never needs its own storage. */}
        <MantineProvider theme={mantineTheme} forceColorScheme={resolvedMode}>
          {children}
        </MantineProvider>
      </div>
    </ThemeContext.Provider>
  );
}

/** Reads the resolved scheme and mode, and exposes setters for re-theming at runtime. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be called within a <ThemeProvider>.');
  return ctx;
}
