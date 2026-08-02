import { describe, expect, it } from 'vitest';
import { AURALIS_SOURCE_COLOR, contrastRatio, createScheme, schemeToCssVars } from './color.js';

const SOURCE_COLORS = [
  AURALIS_SOURCE_COLOR, // Auralis warm amber fallback
  '#1B6EF3', // a cool blue, far from the fallback hue
  '#2E7D32', // a saturated green
  '#B00020', // a red near the error hue, worth stress-testing separately
];

const HEX_RE = /^#[0-9a-f]{6}$/;

const ON_TO_CONTAINER: Array<[string, string]> = [
  ['onPrimary', 'primary'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'],
  ['onSecondaryContainer', 'secondaryContainer'],
  ['onTertiary', 'tertiary'],
  ['onTertiaryContainer', 'tertiaryContainer'],
  ['onError', 'error'],
  ['onErrorContainer', 'errorContainer'],
  ['onSurface', 'surface'],
  ['onSurfaceVariant', 'surfaceVariant'],
];

describe('createScheme', () => {
  it('produces well-formed #rrggbb hex for every role', () => {
    const scheme = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: false });
    for (const [role, value] of Object.entries(scheme)) {
      expect(value, `role ${role}`).toMatch(HEX_RE);
    }
  });

  it('clears WCAG AA (4.5:1) for every on-role against its paired container, light and dark', () => {
    for (const sourceColor of SOURCE_COLORS) {
      for (const dark of [false, true]) {
        const scheme = createScheme({ sourceColor, dark });
        for (const [onRole, containerRole] of ON_TO_CONTAINER) {
          const onHex = scheme[onRole as keyof typeof scheme];
          const containerHex = scheme[containerRole as keyof typeof scheme];
          const ratio = contrastRatio(onHex, containerHex);
          expect(
            ratio,
            `${onRole} vs ${containerRole} for ${sourceColor} (dark=${dark}) was ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('differs between light and dark for the same source colour', () => {
    const light = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: false });
    const dark = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: true });
    expect(light.surface).not.toBe(dark.surface);
    expect(light.primary).not.toBe(dark.primary);
  });

  it('is deterministic for the same input', () => {
    const a = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: true });
    const b = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: true });
    expect(a).toEqual(b);
  });

  it('produces a distinguishable scheme per source colour', () => {
    const a = createScheme({ sourceColor: '#1B6EF3', dark: false });
    const b = createScheme({ sourceColor: '#2E7D32', dark: false });
    expect(a.primary).not.toBe(b.primary);
  });

  it('supports an explicit contrast level and the expressive/tonal-spot variants', () => {
    const standard = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: false });
    const highContrast = createScheme({
      sourceColor: AURALIS_SOURCE_COLOR,
      dark: false,
      contrastLevel: 1,
    });
    expect(contrastRatio(highContrast.onSurface, highContrast.surface)).toBeGreaterThanOrEqual(
      contrastRatio(standard.onSurface, standard.surface) - 0.01,
    );

    const tonalSpot = createScheme({
      sourceColor: AURALIS_SOURCE_COLOR,
      dark: false,
      variant: 'tonalSpot',
    });
    expect(tonalSpot.primary).toMatch(HEX_RE);
  });

  it('includes the full M3 role set required by the design system', () => {
    const scheme = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: false });
    const requiredRoles = [
      'primary',
      'onPrimary',
      'primaryContainer',
      'onPrimaryContainer',
      'secondary',
      'onSecondary',
      'secondaryContainer',
      'onSecondaryContainer',
      'tertiary',
      'onTertiary',
      'tertiaryContainer',
      'onTertiaryContainer',
      'error',
      'onError',
      'errorContainer',
      'onErrorContainer',
      'surface',
      'onSurface',
      'surfaceVariant',
      'onSurfaceVariant',
      'surfaceContainerLowest',
      'surfaceContainerLow',
      'surfaceContainer',
      'surfaceContainerHigh',
      'surfaceContainerHighest',
      'surfaceDim',
      'surfaceBright',
      'inverseSurface',
      'inverseOnSurface',
      'inversePrimary',
      'outline',
      'outlineVariant',
      'scrim',
      'shadow',
    ];
    for (const role of requiredRoles) {
      expect(scheme, `missing role ${role}`).toHaveProperty(role);
    }
  });
});

describe('schemeToCssVars', () => {
  it('emits kebab-case --m3-* custom properties', () => {
    const scheme = createScheme({ sourceColor: AURALIS_SOURCE_COLOR, dark: false });
    const vars = schemeToCssVars(scheme);
    expect(vars['--m3-primary']).toBe(scheme.primary);
    expect(vars['--m3-on-primary-container']).toBe(scheme.onPrimaryContainer);
    expect(vars['--m3-surface-container-highest']).toBe(scheme.surfaceContainerHighest);
    for (const key of Object.keys(vars)) {
      expect(key.startsWith('--m3-')).toBe(true);
      expect(key).not.toMatch(/[A-Z]/);
    }
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('is 1:1 for identical colours', () => {
    expect(contrastRatio('#B8683C', '#B8683C')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    const a = contrastRatio('#123456', '#fedcba');
    const b = contrastRatio('#fedcba', '#123456');
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('AURALIS_SOURCE_COLOR', () => {
  it('is the warm amber fallback specified in docs/DESIGN.md', () => {
    expect(AURALIS_SOURCE_COLOR).toBe('#B8683C');
  });
});
