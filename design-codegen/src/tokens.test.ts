import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { OUTPUTS, REPO_ROOT, SONORA_DIR } from './outputs.js';
import { exportDrift, generateTokens } from './tokens.js';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const sonoraDir = join(REPO_ROOT, SONORA_DIR);
const committed = (rel: string, file: string) => readFileSync(join(REPO_ROOT, rel, file), 'utf8');
const webCss = () =>
  ['sonora-tokens.css', 'sonora-theme.css'].map((f) => committed(OUTPUTS.webTokens, f)).join('\n');
const kotlin = () => committed(OUTPUTS.kotlinTheme, 'SonoraTokens.kt');

/* ---- CSS: rule blocks, and the custom properties an element sees through the cascade ---- */

interface Rule {
  selectors: string[];
  decls: Map<string, string>;
}

function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = new Map<string, string>();
    for (const line of m[2]!.split(';')) {
      const i = line.indexOf(':');
      const name = line.slice(0, i).trim();
      if (name.startsWith('--')) decls.set(name, line.slice(i + 1).trim());
    }
    out.push({ selectors: m[1]!.split(',').map((s) => s.trim()), decls });
  }
  return out;
}

/** What the root element sees, with `data-theme` unset or set to `theme`. */
function cascade(css: string, theme?: 'dark' | 'light'): Map<string, string> {
  const seen = new Map<string, string>();
  const matches = (s: string) => s === ':root' || s === `[data-theme="${theme}"]`;
  for (const rule of rules(css)) {
    if (!rule.selectors.some(matches)) continue;
    for (const [k, v] of rule.decls) seen.set(k, v);
  }
  return seen;
}

/** The `color-scheme` the root element gets, with `data-theme` unset or set to `theme`. */
function colorScheme(css: string, theme?: 'dark' | 'light'): string | undefined {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const matches = (s: string) => s === ':root' || s === `[data-theme="${theme}"]`;
  let scheme: string | undefined;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1]!.split(',').some((s) => matches(s.trim()))) continue;
    const decl = /(?:^|;)\s*color-scheme\s*:\s*([^;]+)/.exec(m[2]!);
    if (decl !== null) scheme = decl[1]!.trim();
  }
  return scheme;
}

function resolved(scope: Map<string, string>, value: string): string {
  let v = value;
  for (let depth = 0; depth < 10; depth++) {
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
    if (m === null) return v;
    const next = scope.get(m[1]!);
    if (next === undefined) throw new Error(`${v} is undefined`);
    v = next;
  }
  throw new Error(`${value} does not resolve`);
}

/** A CSS colour as a 32-bit ARGB number, or undefined when the value is not a colour. */
function argb(value: string): number | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const six = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    return (0xff000000 + parseInt(six, 16)) >>> 0;
  }
  const rgb = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:\/\s*([\d.]+)%)?\s*\)$/.exec(value);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 255 : Math.round((Number(rgb[4]) / 100) * 255);
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) as [number, number, number];
    return ((alpha << 24) | (r << 16) | (g << 8) | b) >>> 0;
  }
  return undefined;
}

/* ---- Kotlin: SonoraTokens.kt read back into one record per object ---- */

interface KotlinTokens {
  palette: Map<string, number>;
  dark: Map<string, number>;
  light: Map<string, number>;
  dimens: Map<string, number>;
  type: Map<string, number>;
  motion: Map<string, number>;
  state: Map<string, number>;
  layer: Map<string, number>;
  leading: Map<string, number>;
  tracking: Map<string, number>;
  opacity: Map<string, number>;
  ease: number[];
  easeLinear: boolean;
  notExported: Map<string, string>;
}

function block(kt: string, head: RegExp): string {
  const m = head.exec(kt);
  if (m === null) throw new Error(`${head} not found in SonoraTokens.kt`);
  const rest = kt.slice(m.index + m[0].length);
  const end = rest.search(/^[})]/m);
  return end < 0 ? rest : rest.slice(0, end);
}

function entries(body: string, re: RegExp, parse: (s: string) => number): Map<string, number> {
  return new Map([...body.matchAll(re)].map((m) => [m[1]!, parse(m[2]!)]));
}

/** A Kotlin number as written: `1.15`, `(-0.02)`. */
const kotlinNumber = (s: string) => Number(s.replace(/[()]/g, ''));

function readKotlin(kt: string): KotlinTokens {
  const color = /(\w+) = Color\((0x[0-9A-F]{8})\)/g;
  const float = /val (\w+) = (-?[\d.]+)f$/gm;
  const em = /val (\w+) = (\(?-?[\d.]+\)?)\.em$/gm;
  const ease = /EaseStandard = CubicBezierEasing\(([^)]*)\)/.exec(kt);
  return {
    palette: entries(block(kt, /object SonoraPalette \{\n/), color, Number),
    dark: entries(block(kt, /val SonoraDarkColors = SonoraColors\(\n/), color, Number),
    light: entries(block(kt, /val SonoraLightColors = SonoraColors\(\n/), color, Number),
    dimens: entries(block(kt, /object SonoraDimens \{\n/), /val (\w+) = ([\d.]+)\.dp/g, Number),
    type: entries(block(kt, /object SonoraType \{\n/), /val (\w+) = ([\d.]+)\.sp/g, Number),
    motion: entries(block(kt, /object SonoraMotion \{\n/), /const val (\w+) = (\d+)$/gm, Number),
    state: entries(
      block(kt, /object SonoraState \{\n/),
      /val (\w+) = ([\d.]+)(?:\.dp|f)$/gm,
      Number,
    ),
    layer: entries(block(kt, /object SonoraLayer \{\n/), float, Number),
    leading: entries(block(kt, /object SonoraLeading \{\n/), em, kotlinNumber),
    tracking: entries(block(kt, /object SonoraTracking \{\n/), em, kotlinNumber),
    opacity: entries(block(kt, /object SonoraOpacity \{\n/), float, Number),
    ease: ease === null ? [] : ease[1]!.split(',').map((n) => parseFloat(n)),
    easeLinear: /val EaseLinear = LinearEasing$/m.test(block(kt, /object SonoraMotion \{\n/)),
    notExported: new Map(
      [...block(kt, /Not exported[^\n]*\n/).matchAll(/^ \* {3}(--[a-z0-9-]+): (.*)$/gm)].map(
        (m) => [m[1]!, m[2]!],
      ),
    ),
  };
}

const camel = (name: string) =>
  name.slice(2).replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const pascal = (name: string) => camel(name).charAt(0).toUpperCase() + camel(name).slice(1);
/**
 * An interaction-state token: the state layer's opacities and the focus ring's measures, the
 * tokens/states.css names outside the opacity family.
 */
const STATE = new Set(
  rules(readFileSync(join(sonoraDir, 'tokens', 'states.css'), 'utf8'))
    .flatMap((r) => [...r.decls.keys()])
    .filter((name) => !name.startsWith('--opacity-')),
);
/** The Kotlin name of a token in a family that drops its prefix: `--z-modal` is `SonoraLayer.modal`. */
const unprefixed = (name: string, prefix: string) => camel(name.replace(prefix, '--'));
const stateName = (name: string) => camel(name.replace(/^--state-layer-/, '--'));
const cssNumber = (value: string, unit: string) => {
  const m = new RegExp(`^(-?[\\d.]+)${unit}$`).exec(value);
  return m === null ? undefined : Number(m[1]);
};

describe('Sonora tokens, generated for web and Android', () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('[M0.tokens/a] regenerating from Sonora gives exactly the committed web CSS and SonoraTokens.kt', async () => {
    const out = await generateTokens(sonoraDir);
    const listed = (rel: string) => readdirSync(join(REPO_ROOT, rel)).sort();
    expect([...out.web.keys()].sort()).toEqual(listed(OUTPUTS.webTokens));
    expect([...out.kotlin.keys()].sort()).toEqual(listed(OUTPUTS.kotlinTheme));
    for (const [file, text] of out.web) expect(text, file).toBe(committed(OUTPUTS.webTokens, file));
    for (const [file, text] of out.kotlin) {
      expect(text, file).toBe(committed(OUTPUTS.kotlinTheme, file));
    }
    expect(exportDrift(sonoraDir, out.exported)).toEqual([]);
  });

  it('[M0.tokens/a] a token changed in Sonora without re-exporting changes the output and fails pnpm gen', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'auralis-tokens-'));
    const sonora = join(tmp, 'sonora');
    for (const dir of ['tokens', 'export', 'components']) {
      cpSync(join(sonoraDir, dir), join(sonora, dir), { recursive: true });
    }
    const colors = join(sonora, 'tokens', 'colors.css');
    const before = readFileSync(colors, 'utf8');
    expect(before).toContain('--play:#F44862;');
    writeFileSync(colors, before.replace('--play:#F44862;', '--play:#F44863;'));

    const out = await generateTokens(sonora);
    expect(out.web.get('sonora-tokens.css')).toContain('--play: #F44863;');
    expect(out.kotlin.get('SonoraTokens.kt')).toContain('val Play = Color(0xFFF44863)');
    expect(exportDrift(sonora, out.exported)).toEqual([
      'export/android/SonoraTokens.kt',
      'export/web/sonora-tokens.css',
    ]);

    let failure = '';
    try {
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'src/gen.ts', '--sonora', sonora, '--out', join(tmp, 'out')],
        { cwd: packageDir, stdio: 'pipe' },
      );
    } catch (error) {
      failure = String((error as { stderr: Buffer }).stderr);
    }
    expect(failure).toContain('export/web/sonora-tokens.css');
    expect(failure).toContain('export/generate.js');
  }, 120_000);

  it('[M0.tokens/a] the web CSS and SonoraTokens.kt carry the same names and values', () => {
    const css = webCss();
    const kt = readKotlin(kotlin());
    const dark = cascade(css, 'dark');
    const light = cascade(css, 'light');
    const themed = new Set(
      rules(css)
        .filter((r) => r.selectors.includes('[data-theme="light"]'))
        .flatMap((r) => [...r.decls.keys()]),
    );
    const matched = new Set<string>();

    for (const [name, raw] of dark) {
      const value = resolved(dark, raw);
      const colour = argb(value);
      const listed = kt.notExported.get(name);
      if (themed.has(name) && colour === undefined) {
        expect(listed, `${name} is a themed non-colour, listed as not exported`).toBe(raw);
      } else if (themed.has(name)) {
        expect(kt.dark.get(camel(name)), `${name} dark`).toBe(colour);
        expect(kt.light.get(camel(name)), `${name} light`).toBe(
          argb(resolved(light, light.get(name)!)),
        );
        matched.add(`dark.${camel(name)}`).add(`light.${camel(name)}`);
      } else if (name.startsWith('--z-')) {
        expect(kt.layer.get(unprefixed(name, '--z-')), name).toBe(Number(value));
        matched.add(`layer.${unprefixed(name, '--z-')}`);
      } else if (name.startsWith('--line-height-')) {
        expect(kt.leading.get(unprefixed(name, '--line-height-')), name).toBe(Number(value));
        matched.add(`leading.${unprefixed(name, '--line-height-')}`);
      } else if (name.startsWith('--tracking-')) {
        expect(kt.tracking.get(unprefixed(name, '--tracking-')), name).toBe(cssNumber(value, 'em'));
        matched.add(`tracking.${unprefixed(name, '--tracking-')}`);
      } else if (name.startsWith('--opacity-')) {
        expect(kt.opacity.get(unprefixed(name, '--opacity-')), name).toBe(Number(value));
        matched.add(`opacity.${unprefixed(name, '--opacity-')}`);
      } else if (name === '--ease-standard') {
        const curve = /^cubic-bezier\(([^)]*)\)$/.exec(value)![1]!.split(',').map(Number);
        expect(kt.ease, name).toEqual(curve);
      } else if (name === '--ease-linear') {
        expect(value, name).toBe('linear');
        expect(kt.easeLinear, name).toBe(true);
      } else if (STATE.has(name)) {
        const n = cssNumber(value, 'px') ?? Number(value);
        expect(kt.state.get(stateName(name)), name).toBe(n);
        matched.add(`state.${stateName(name)}`);
      } else if (colour !== undefined) {
        expect(kt.palette.get(pascal(name)), name).toBe(colour);
        matched.add(`palette.${pascal(name)}`);
      } else if (cssNumber(value, 'px') !== undefined) {
        expect(kt.dimens.get(camel(name)), name).toBe(cssNumber(value, 'px'));
        matched.add(`dimens.${camel(name)}`);
      } else if (cssNumber(value, 'rem') !== undefined) {
        expect(kt.type.get(camel(name)), name).toBe(cssNumber(value, 'rem')! * 16);
        matched.add(`type.${camel(name)}`);
      } else if (cssNumber(value, 'ms') !== undefined) {
        expect(kt.motion.get(camel(name)), name).toBe(cssNumber(value, 'ms'));
        matched.add(`motion.${camel(name)}`);
      } else {
        expect(listed, `${name} is neither exported nor listed as not exported`).toBe(raw);
      }
    }

    // Nothing on the Kotlin side only.
    const kotlinNames = [
      ...[...kt.palette.keys()].map((k) => `palette.${k}`),
      ...[...kt.dark.keys()].map((k) => `dark.${k}`),
      ...[...kt.light.keys()].map((k) => `light.${k}`),
      ...[...kt.dimens.keys()].map((k) => `dimens.${k}`),
      ...[...kt.type.keys()].map((k) => `type.${k}`),
      ...[...kt.motion.keys()].map((k) => `motion.${k}`),
      ...[...kt.state.keys()].map((k) => `state.${k}`),
      ...[...kt.layer.keys()].map((k) => `layer.${k}`),
      ...[...kt.leading.keys()].map((k) => `leading.${k}`),
      ...[...kt.tracking.keys()].map((k) => `tracking.${k}`),
      ...[...kt.opacity.keys()].map((k) => `opacity.${k}`),
    ];
    expect(kotlinNames.filter((k) => !matched.has(k))).toEqual([]);
    expect([...kt.notExported.keys()].filter((k) => !dark.has(k))).toEqual([]);
    expect(kotlinNames.length).toBeGreaterThan(100);
  });

  it('[M0.tokens/a] both platforms carry one accent and the play rose, with no accent presets', () => {
    const css = webCss();
    const kt = readKotlin(kotlin());
    const names = new Set(rules(css).flatMap((r) => [...r.decls.keys()]));
    for (const name of ['--accent', '--accent-contrast', '--play', '--play-contrast']) {
      expect(names.has(name), name).toBe(true);
      expect(kt.palette.has(pascal(name)), name).toBe(true);
    }
    for (const theme of ['dark', 'light'] as const) {
      const block = rules(css).find((r) => r.selectors.includes(`[data-theme="${theme}"]`));
      expect(block?.decls.has('--play-ink'), `--play-ink in ${theme}`).toBe(true);
      expect(block?.decls.has('--accent-ink'), `--accent-ink in ${theme}`).toBe(true);
      expect(kt[theme].has('playInk'), `playInk in ${theme}`).toBe(true);
    }
    const accents = [...names].filter((n) => n.startsWith('--accent'));
    expect(accents.sort()).toEqual(['--accent', '--accent-contrast', '--accent-ink']);
    expect(kotlin()).not.toMatch(/\bAccent(?!Contrast\b|Ink\b)[A-Z]\w*|\baccent(?!Ink\b)[A-Z]\w*/);
  });

  it('everything on the play rose is white, label and glyph alike, in both themes and on both platforms', () => {
    const css = webCss();
    const kt = readKotlin(kotlin());
    for (const theme of ['dark', 'light'] as const) {
      const scope = cascade(css, theme);
      expect(resolved(scope, scope.get('--play-contrast')!), theme).toBe('#fff');
      expect(resolved(scope, scope.get('--tone-library-ink')!), theme).toBe('#fff');
      expect(kt[theme].get('toneLibraryInk'), theme).toBe(0xffffffff);
    }
    expect(kt.palette.get('PlayContrast')).toBe(0xffffffff);
    const names = new Set(rules(css).flatMap((r) => [...r.decls.keys()]));
    expect(names.has('--play-icon'), 'one ink for the rose, no separate glyph token').toBe(false);
    expect(kt.palette.has('PlayIcon')).toBe(false);
  });

  it('the error red is Sonora #FB270D, and the error tone follows it', () => {
    const css = webCss();
    const kt = readKotlin(kotlin());
    for (const theme of ['dark', 'light'] as const) {
      const scope = cascade(css, theme);
      expect(resolved(scope, scope.get('--state-error')!), theme).toBe('#FB270D');
      expect(resolved(scope, scope.get('--tone-error')!), theme).toBe('#FB270D');
      expect(kt[theme].get('toneError'), theme).toBe(0xfffb270d);
    }
    expect(kt.palette.get('StateError')).toBe(0xfffb270d);
  });

  it('[M0.tokens/a] with no data-theme the web CSS gives the dark surfaces, and data-theme="light" the light ones', () => {
    const css = webCss();
    const source = readFileSync(join(sonoraDir, 'tokens', 'colors.css'), 'utf8');
    const sourceRoot = rules(source).find((r) => r.selectors.includes(':root'))!.decls;
    const sourceLight = rules(source).find((r) =>
      r.selectors.includes('[data-theme="light"]'),
    )!.decls;

    const unthemed = cascade(css);
    const light = cascade(css, 'light');
    expect(unthemed.get('--surface-bg')).toBe('#141414');
    expect(light.get('--surface-bg')).toBe('#F9F6F6');
    for (const name of sourceLight.keys()) {
      expect(unthemed.get(name), `${name} unthemed`).toBe(sourceRoot.get(name));
      expect(light.get(name), `${name} light`).toBe(sourceLight.get(name));
    }
  });

  it('[M0.tokens/a] the web CSS sets the browser colour scheme Sonora gives each theme, dark when unthemed', () => {
    const css = webCss();
    const source = readFileSync(join(sonoraDir, 'tokens', 'colors.css'), 'utf8');
    for (const theme of [undefined, 'dark', 'light'] as const) {
      expect(colorScheme(css, theme), `data-theme=${theme}`).toBe(colorScheme(source, theme));
    }
    expect(colorScheme(css)).toBe('dark');
    expect(colorScheme(css, 'light')).toBe('light');
  });
});

describe('Sonora without hard-coding: the token families its components need', () => {
  const SIZE_RAMP = [
    '--spacing-2xs',
    '--control-xs',
    '--control-sm',
    '--control-md',
    '--control-lg',
    '--control-xl',
    '--art-2xs',
    '--art-xs',
    '--art-sm',
    '--art-md',
    '--art-lg',
    '--art-xl',
    '--art-2xl',
    '--art-hero-compact',
    '--art-hero',
    '--icon-lg',
    '--icon-xl',
    '--hairline',
    '--progress-sm',
    '--progress-md',
  ];
  const Z = [
    '--z-raised',
    '--z-overlay',
    '--z-edge',
    '--z-menu',
    '--z-sheet',
    '--z-modal-scrim',
    '--z-modal',
  ];
  const LINE_HEIGHT = [
    '--line-height-none',
    '--line-height-tight',
    '--line-height-snug',
    '--line-height-body',
    '--line-height-relaxed',
  ];
  const TRACKING = ['--tracking-label', '--tracking-caps', '--tracking-display'];
  const OPACITY = ['--opacity-dim', '--opacity-scrollbar', '--opacity-rest'];
  const DURATION = [
    '--duration-settle',
    '--duration-linger',
    '--duration-sweep',
    '--duration-spin',
    '--duration-eq-a',
    '--duration-eq-b',
    '--duration-eq-c',
  ];
  const strip = (prefix: string) => (name: string) => camel(name.replace(prefix, '--'));

  it('[M0.sonoraclean/b] the web export defines the scrim-track, size-ramp, z-index, line-height, letter-spacing, opacity, duration and easing tokens', () => {
    const names = cascade(webCss(), 'dark');
    for (const name of [
      '--on-scrim-track',
      ...SIZE_RAMP,
      ...Z,
      ...LINE_HEIGHT,
      ...TRACKING,
      ...OPACITY,
      ...DURATION,
      '--ease-standard',
      '--ease-linear',
    ]) {
      expect(names.has(name), name).toBe(true);
    }
    expect(names.has('--miniplayer-album-size'), 'replaced by --art-xs').toBe(false);
  });

  it('[M0.sonoraclean/b] SonoraTokens.kt carries each of those tokens, in its own family', () => {
    const kt = readKotlin(kotlin());
    expect(kt.palette.has('OnScrimTrack'), 'OnScrimTrack').toBe(true);
    for (const name of SIZE_RAMP) expect(kt.dimens.has(camel(name)), name).toBe(true);
    expect(Z.map(strip('--z-')).filter((n) => !kt.layer.has(n))).toEqual([]);
    expect(LINE_HEIGHT.map(strip('--line-height-')).filter((n) => !kt.leading.has(n))).toEqual([]);
    expect(TRACKING.map(strip('--tracking-')).filter((n) => !kt.tracking.has(n))).toEqual([]);
    expect(OPACITY.map(strip('--opacity-')).filter((n) => !kt.opacity.has(n))).toEqual([]);
    for (const name of DURATION) expect(kt.motion.has(camel(name)), name).toBe(true);
    expect(kt.ease).toEqual([0.4, 0, 0.2, 1]);
    expect(kt.easeLinear, 'EaseLinear = LinearEasing').toBe(true);
    expect(kotlin()).not.toMatch(/miniplayerAlbumSize/);
  });
});
