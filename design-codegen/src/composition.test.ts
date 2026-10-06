import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { discoverComponents } from './sonora.js';
import { elements, readPage } from './test-pages.js';

/**
 * Sonora reuses by composition: a component that needs another's behaviour renders it rather than
 * drawing its own copy. Read from the sources, as the states test reads them.
 */
const components = new Map(
  discoverComponents(`${REPO_ROOT}/${SONORA_DIR}`).map((c) => [c.name, c]),
);

const source = (name: string): string => {
  const c = components.get(name);
  if (c === undefined) throw new Error(`no Sonora component ${name}`);
  return readFileSync(c.jsx, 'utf8');
};

/** Every JSX element the source renders, with its literal string attributes. */
function rendered(src: string): { tag: string; attrs: Record<string, string | true> }[] {
  const file = ts.createSourceFile('c.jsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const out: { tag: string; attrs: Record<string, string | true> }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attrs: Record<string, string | true> = {};
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        const v = a.initializer;
        attrs[a.name.getText(file)] = v !== undefined && ts.isStringLiteral(v) ? v.text : true;
      }
      out.push({ tag: node.tagName.getText(file), attrs });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** A scroller of its own: an `overflow` that scrolls, written as CSS text or a style key. */
const OWN_SCROLLER = /overflow(-[xy])?\s*:\s*(auto|scroll)|overflow[XY]?\s*:\s*['"](auto|scroll)/;

describe("Sonora's scrolling, read from its sources", () => {
  it('[M0.sonoraclean/d] Shelf scrolls in a ScrollArea on the x axis and draws no scroller or thumb of its own', () => {
    const shelf = source('Shelf');
    expect(rendered(shelf)).toContainEqual(
      expect.objectContaining({ tag: 'ScrollArea', attrs: expect.objectContaining({ axis: 'x' }) }),
    );
    expect(shelf).not.toMatch(OWN_SCROLLER);
    expect(shelf).not.toMatch(/translateX/);
  });

  it('[M0.sonoraclean/d] the front layer and the player pages scroll in ScrollArea, with no fallback scroller', () => {
    for (const name of ['FrontLayer', 'NowPlayingPage', 'PlayerSubPage']) {
      const src = source(name);
      expect(src, name).toMatch(/\bScrollArea\b/);
      expect(src, name).not.toMatch(OWN_SCROLLER);
    }
  });

  it('[M0.sonoraclean/d] ScrollArea scrolls one axis and hides the other, its thumb inside its clipped frame', () => {
    const area = source('ScrollArea');
    expect(area).toMatch(/overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain/);
    expect(area).toMatch(/overflow-y:auto;overflow-x:hidden/);
    expect(area).toMatch(/translateX\(/);
    expect(area).toMatch(/translateY\(/);
  });
});

/** Every Sonora source under components/: each component's `.jsx` and the shared helpers. */
const sonoraSources = (): [string, string][] => [
  ...[...components.values()].map((c): [string, string] => [c.name, readFileSync(c.jsx, 'utf8')]),
  ['shared.js', readFileSync(`${REPO_ROOT}/${SONORA_DIR}/components/shared.js`, 'utf8')],
];

/** Naming the icon font, or setting its fill or weight axis, in CSS text or a style key. */
const ICON_FONT = [
  /Material Symbols/,
  /--font-icon/,
  /font-variation-settings\s*:/,
  /fontVariationSettings\s*:/,
  /['"]FILL['"]/,
  /['"]wght['"]/,
];

/** The components that draw a Material Symbols glyph. */
const GLYPH_COMPONENTS = [
  'AccountButton',
  'Badge',
  'ButtonGroup',
  'DownloadButton',
  'EmptyState',
  'EpisodeRow',
  'ExpanderRow',
  'FeatureCard',
  'IconButton',
  'MediaCard',
  'MediaHeader',
  'NowPlaying',
  'OverflowMenu',
  'PlayActions',
  'PreviewButton',
  'QueuePage',
  'QueueRow',
  'QuickPick',
  'RailItem',
  'Rating',
  'ResultRow',
  'SearchField',
  'SortFilterBar',
  'StatusBanner',
  'TabBar',
  'TransportBar',
];

/** The components whose only glyphs are IconButton's, named through its `icon`. */
const ICON_BUTTON_GLYPHS = [
  'LyricsSyncButton',
  'NavRail',
  'NowPlayingPage',
  'PlayerSubPage',
  'SearchButton',
  'SectionHeader',
  'Shelf',
  'SideSheet',
  'ViewToggle',
];

const SHOWCASE_ROOT = `${REPO_ROOT}/${SONORA_DIR}`;

/** Sonora's component cards, generated reference cards and example snippets, relative to it. */
const showcaseFiles = (): string[] => [
  ...readdirSync(`${SHOWCASE_ROOT}/components`, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.card.html'))
    .map((f) => `components/${f}`),
  ...readdirSync(`${SHOWCASE_ROOT}/reference`)
    .filter((f) => f.endsWith('.card.html'))
    .map((f) => `reference/${f}`),
  ...readdirSync(`${SHOWCASE_ROOT}/docs/examples`)
    .filter((f) => f.endsWith('.snippet.jsx'))
    .map((f) => `docs/examples/${f}`),
];

describe("Sonora's glyphs, read from its sources", () => {
  it('[M0.sonoraclean/d] only Icon names the icon font or sets its fill or weight', () => {
    const offenders = sonoraSources()
      .filter(([name]) => name !== 'Icon')
      .flatMap(([name, src]) =>
        ICON_FONT.filter((re) => re.test(src)).map((re) => `${name}: ${re.source}`),
      );
    expect(offenders).toEqual([]);
    expect(ICON_FONT.some((re) => re.test(source('Icon')))).toBe(true);
  });

  it.each(GLYPH_COMPONENTS)('[M0.sonoraclean/d] %s draws its glyphs through Icon', (name) => {
    const src = source(name);
    expect(rendered(src).map((e) => e.tag)).toContain('Icon');
    expect(src).toMatch(/\bIcon\b[^;]*=\s*NS\(\)|\{[^}]*\bIcon\b[^}]*\}\s*=\s*NS\(\)/);
  });

  it.each(ICON_BUTTON_GLYPHS)(
    '[M0.sonoraclean/d] %s names its glyphs through IconButton, which draws them through Icon',
    (name) => {
      const buttons = rendered(source(name)).filter((e) => e.tag === 'IconButton');
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b.attrs, name).toHaveProperty('icon');
      expect(rendered(source('IconButton')).map((e) => e.tag)).toContain('Icon');
    },
  );

  it('[M0.sonoraclean/d] no showcase card, reference card or snippet hand-draws a glyph in the icon font', () => {
    const offenders = showcaseFiles().filter((f) =>
      ICON_FONT.some((re) => re.test(readFileSync(`${SHOWCASE_ROOT}/${f}`, 'utf8'))),
    );
    expect(offenders).toEqual([]);
    expect(showcaseFiles().filter((f) => f.startsWith('reference/')).length).toBeGreaterThan(0);
  });

  it("[M0.sonoraclean/d] a card, reference card or snippet glyph beside a Button's or Input's text follows the text's weight", () => {
    const iconProp =
      /<(Button|Input)\b(?:(?!<\/?(?:Button|Input)\b)[\s\S])*?icon=\{<Icon\b([^>]*)\/>/g;
    const offenders = showcaseFiles().flatMap((f) =>
      [...readFileSync(`${SHOWCASE_ROOT}/${f}`, 'utf8').matchAll(iconProp)]
        .filter((m) => !/weight="text"/.test(m[2]!))
        .map((m) => `${f}: ${m[1]} ${m[2]!.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * Every file in the repo, tracked or new, that names a folded component in its path or its text,
 * outside the plan, which records the fold, and this test. `spellings` are its other names: a
 * card's file name, an injected style's id.
 */
function namesOf(name: string, spellings: RegExp[]): string[] {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => f !== '' && !f.startsWith('docs/plan/') && !f.endsWith('composition.test.ts'))
    .filter((f) => existsSync(`${REPO_ROOT}/${f}`));
  const patterns = [new RegExp(name), ...spellings];
  return files.filter(
    (f) =>
      patterns.some((re) => re.test(f)) ||
      patterns.some((re) => re.test(readFileSync(`${REPO_ROOT}/${f}`, 'utf8'))),
  );
}

/** A `<button>` whose own style rounds it into a circle. */
const ROUND = /50%|--radius-round/;

/**
 * Each component's `<button>` elements that round themselves, by the text of their style and of
 * any style helper or constant of the file that the style names.
 */
function roundButtons(src: string): string[] {
  const file = ts.createSourceFile('c.jsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const helpers = new Map<string, string>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
      helpers.set(node.name.text, node.getText(file));
    if (ts.isFunctionDeclaration(node) && node.name !== undefined)
      helpers.set(node.name.text, node.getText(file));
    ts.forEachChild(node, collect);
  };
  collect(file);
  const styleText = (attr: ts.Node): string => {
    const names: string[] = [];
    const find = (n: ts.Node) => {
      if (ts.isIdentifier(n)) names.push(n.text);
      ts.forEachChild(n, find);
    };
    find(attr);
    return [attr.getText(file), ...names.map((n) => helpers.get(n) ?? '')].join('\n');
  };
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === 'button'
    ) {
      const style = node.attributes.properties.find(
        (a) => ts.isJsxAttribute(a) && a.name.getText(file) === 'style',
      );
      if (style !== undefined && ROUND.test(styleText(style)))
        out.push(`line ${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

/** The round buttons that stay hand-built, each with why. */
const OWN_ROUND_BUTTONS: Record<string, string> = {
  AccountButton: 'an avatar: the round button is the picture, not a glyph',
  IconButton: 'the one round glyph button',
  PlayActions: 'the play cluster over artwork, on the play fill and the accent scrim',
};

/** The hand-built round buttons folded into IconButton, and the variant each now takes. */
const FORMER_ROUND_BUTTONS: [string, string][] = [
  ['DownloadButton', 'outline'],
  ['FeatureCard', 'plain'],
  ['FeatureCard', 'play'],
  ['MediaCard', 'scrim'],
  ['MediaHeader', 'outline'],
  ['OverflowMenu', 'scrim'],
  ['SearchField', 'plain'],
  ['SectionHeader', 'plain'],
  ['Shelf', 'raised'],
  ['SideSheet', 'plain'],
  ['StatusBanner', 'plain'],
];

describe("Sonora's icon buttons, read from its sources", () => {
  it('[M0.sonoraclean/c] TonalIconButton is gone: no file, export, card, doc or source names it', () => {
    expect(components.has('TonalIconButton')).toBe(false);
    expect(namesOf('TonalIconButton', [/tonal-icon-button/i, /tonalicon/i])).toEqual([]);
  });

  it.each(['LyricsSyncButton', 'ViewToggle', 'QueuePage'])(
    '[M0.sonoraclean/c] %s renders a tonal IconButton in its place',
    (name) => {
      expect(rendered(source(name))).toContainEqual({
        tag: 'IconButton',
        attrs: expect.objectContaining({ variant: 'tonal' }),
      });
    },
  );

  it.each(FORMER_ROUND_BUTTONS)(
    '[M0.sonoraclean/d] %s renders IconButton for its round button, as %s',
    (name, variant) => {
      const buttons = rendered(source(name)).filter((e) => e.tag === 'IconButton');
      expect(buttons.length).toBeGreaterThan(0);
      if (variant === 'plain') {
        expect(buttons.some((b) => b.attrs.variant === undefined)).toBe(true);
      } else {
        const named = buttons.some((b) => b.attrs.variant === variant);
        const chosen = buttons.some((b) => b.attrs.variant === true);
        expect(named || (chosen && source(name).includes(`'${variant}'`))).toBe(true);
      }
    },
  );

  it('[M0.sonoraclean/d] no Sonora source but IconButton hand-builds a round button, past the listed few', () => {
    const own = sonoraSources()
      .filter(([name]) => !(name in OWN_ROUND_BUTTONS))
      .flatMap(([name, src]) => roundButtons(src).map((where) => `${name}: ${where}`));
    expect(own).toEqual([]);
    for (const name of Object.keys(OWN_ROUND_BUTTONS))
      expect(components.has(name), name).toBe(true);
  });

  it('[M0.sonoraclean/d] names a round button drawn by hand, and passes one drawn by IconButton', () => {
    expect(
      roundButtons(`export const A = () => <button style={sx('border-radius:50%')}>a</button>;`),
    ).toEqual(['line 1']);
    expect(
      roundButtons(
        `export const B = () => <button style={{ borderRadius: 'var(--radius-round)' }} />;`,
      ),
    ).toEqual(['line 1']);
    expect(
      roundButtons(
        `const arrow = () => sx('border-radius:var(--radius-round)');\nexport const C = () => <button style={arrow()} />;`,
      ),
    ).toEqual(['line 2']);
    expect(
      roundButtons(`export const D = () => <IconButton variant="scrim" label="More" />;`),
    ).toEqual([]);
  });

  it("[M0.sonoraclean/d] NavRail's collapse toggle is a wide, muted IconButton naming its glyph, and NavRail draws no button of its own", () => {
    const src = source('NavRail');
    const buttons = rendered(src).filter((e) => e.tag === 'IconButton');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.attrs).toMatchObject({ wide: true, muted: true, size: 'md' });
    expect(buttons[0]!.attrs).toHaveProperty('icon');
    expect(rendered(src).map((e) => e.tag)).not.toContain('button');
  });

  it('[M0.sonoraclean/d] SearchButton names its glyph through IconButton', () => {
    const buttons = rendered(source('SearchButton')).filter((e) => e.tag === 'IconButton');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.attrs).toHaveProperty('icon');
  });
});

/** A call of the shared spoken-skip glyph helper. */
describe("Sonora's cards, read from its sources and the canvas pages", () => {
  it('[M0.sonoraclean/c] ArtistCard is gone: no file, export, card, doc, Android stub or source names it', () => {
    expect(components.has('ArtistCard')).toBe(false);
    expect(namesOf('ArtistCard', [/Artist\s+Cards?\b/, /artist[-_]?cards?/i])).toEqual([]);
  });

  it('[M0.sonoraclean/c] MediaCard takes a round shape for people', () => {
    expect(source('MediaCard')).toMatch(/shape\s*=\s*'square'/);
    expect(readFileSync(components.get('MediaCard')!.dts, 'utf8')).toMatch(
      /shape\?:\s*'square'\s*\|\s*'round'/,
    );
  });

  it.each([
    ['artist', 'similar'],
    ['browse', 'people'],
  ])('[M0.sonoraclean/c] the %s page draws its people shelf as round MediaCards', (page, list) => {
    const people = elements(readPage(page).tree).filter(
      (e) =>
        e.component === 'MediaCard' &&
        JSON.stringify(e.props.shape) === JSON.stringify({ kind: 'literal', value: 'round' }),
    );
    expect(people).toHaveLength(1);
    expect(JSON.stringify(people[0]!.props.title)).toContain(
      page === 'artist' ? '"artist"' : '"person"',
    );
    expect(readPage(page).data[list]).toBeDefined();
  });
});

const SKIP_GLYPH = /\bskipGlyph\(/;

describe("Sonora's mini player, read from its sources", () => {
  it('[M0.sonoraclean/d] MiniPlayer renders IconButton and SeekBar and draws no button, slider or readout of its own', () => {
    const src = source('MiniPlayer');
    const tags = rendered(src).map((e) => e.tag);
    expect(tags).toContain('IconButton');
    expect(tags).toContain('SeekBar');
    expect(tags).not.toContain('button');
    expect(tags).not.toContain('Slider');
    expect(src).not.toMatch(/\biconBtn\b|\bplayBtn\b|formatTime/);
  });

  it("[M0.sonoraclean/d] MiniPlayer's play is IconButton's play variant, on both platforms", () => {
    const plays = rendered(source('MiniPlayer')).filter(
      (e) => e.tag === 'IconButton' && e.attrs.variant === 'play',
    );
    expect(plays.length).toBeGreaterThan(0);
    for (const b of plays) expect(b.attrs).toHaveProperty('icon');
  });

  it("[M0.sonoraclean/d] MiniPlayer names its glyphs through IconButton's icon, past the spoken skip and the speed readout", () => {
    const src = source('MiniPlayer');
    const own = rendered(src).filter((e) => e.tag === 'IconButton' && !('icon' in e.attrs));
    // The two skips draw the shared skip glyph; the speed button shows its rate as text.
    expect(own).toHaveLength(3);
    expect(src.match(new RegExp(SKIP_GLYPH, 'g'))).toHaveLength(2);
    expect(rendered(src).map((e) => e.tag)).not.toContain('Icon');
  });

  it('[M0.sonoraclean/d] MiniPlayer and TransportBar draw the spoken skip through the one shared helper, which draws through Icon', () => {
    for (const name of ['MiniPlayer', 'TransportBar']) {
      const src = source(name);
      expect(src, name).toMatch(SKIP_GLYPH);
      expect(src, name).not.toMatch(/['"]replay['"]/);
    }
    const shared = readFileSync(`${REPO_ROOT}/${SONORA_DIR}/components/shared.js`, 'utf8');
    expect(shared).toMatch(/export const skipGlyph\b/);
    expect(shared).toMatch(/createElement\(Icon\b/);
  });
});

/**
 * A bar's fill drawn by hand: a width set from a fraction through `percentOf`, a width worked out
 * as a percentage (`v * 100`, a template ending in `%`, a string joined to `'%'`), or the
 * progressbar role.
 */
const PROGRESS = [
  /\bwidth\b['"]?\s*[:+]\s*['"]?\s*\+?\s*percentOf\(/,
  /\bwidth\b['"]?\s*[:+][^;,}\n]*?(\*\s*100\b|\$\{[^}]*\}\s*%|\+\s*['"]%)/,
  /progressbar/,
];

/** One style: an object literal with no object inside it, or the CSS text handed to `sx`. */
const STYLES = /\{[^{}]*\}|\bsx\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g;
/** A fill colour: the play or accent colour as a background. */
const FILL_COLOUR = /background['"]?\s*:\s*['"]?\s*var\(--(play|accent)\)/;
/** A width from a value worked out at run time: a style key given a name, or CSS text joined to one. */
const DYNAMIC_WIDTH =
  /\bwidth\b\s*:\s*(?![-'"`\d]|var\b|undefined\b|null\b)[A-Za-z_$(]|\bwidth:\s*['"`]\s*\+\s*(?!['"`])/;
/** Art, which keeps its shape as it scales: an aspect ratio, or a height worked out as its width is. */
const ART =
  /aspect-ratio|aspectRatio|\bheight\b\s*:\s*(?![-'"`\d]|var\b)[A-Za-z_$(]|\bheight:\s*['"`]\s*\+\s*(?!['"`])/;

/** Whether a source draws a progress fill of its own. */
const drawsFill = (src: string): boolean =>
  PROGRESS.some((re) => re.test(src)) ||
  (src.match(STYLES) ?? []).some(
    (style) => FILL_COLOUR.test(style) && DYNAMIC_WIDTH.test(style) && !ART.test(style),
  );

/** The components that draw a progress fill of their own: the one bar, the ring and the slider. */
const OWN_PROGRESS = ['ProgressBar', 'ProgressRing', 'Slider'];

describe("Sonora's progress bar, read from its sources", () => {
  it('[M0.sonoraclean/d] outside ProgressBar, ProgressRing and Slider, no source draws a progress fill or a progressbar', () => {
    const offenders = sonoraSources()
      .filter(([name]) => !OWN_PROGRESS.includes(name))
      .filter(([, src]) => drawsFill(src))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
    expect(source('ProgressBar')).toMatch(/role="progressbar"/);
    expect(drawsFill(source('ProgressBar'))).toBe(true);
  });

  it.each([
    ['CSS text through percentOf', `sx('height:100%;width:' + percentOf(p))`],
    ['a style key through percentOf', `{ height: '100%', width: percentOf(value) }`],
    ['the progressbar role', `<div role="progressbar" />`],
    ['a template percentage', 'const fill = { height: 2, width: `${v * 100}%` };'],
    [
      'a template percentage of a rounded share',
      '<div style={{ width: `${Math.round(v * 100)}%` }} />',
    ],
    ['a product joined to a percent sign', `sx('height:100%;width:' + v * 100 + '%')`],
    ['a share joined to a percent sign', `sx('width:' + pct + '%;background:var(--play)')`],
    [
      'a fill-coloured div sized by a name, inside a track',
      `<div style={{ background: 'var(--surface-border)', height: 3 }}>
        <div style={{ position: 'absolute', height: '100%', background: 'var(--play)', width: share }} />
      </div>`,
    ],
    [
      'fill-coloured CSS text sized by a joined name',
      `<div style={sx('height:var(--progress-sm);background:var(--accent);width:' + share)} />`,
    ],
  ])('[M0.sonoraclean/d] names a hand-drawn fill: %s', (_, src) => {
    expect(drawsFill(src)).toBe(true);
  });

  it.each([
    ['a left offset through percentOf', `sx('left:' + percentOf(p))`],
    [
      'a play-coloured button of a token width',
      `{ width: 'var(--control-lg)', background: 'var(--play)' }`,
    ],
    ['a full-width fill colour', `sx('width:100%;background:var(--accent)')`],
    ['a sized box with no fill colour', `{ width: size, background: 'var(--surface-card)' }`],
    [
      'square art on the accent',
      `sx('width:' + art + 'px;height:' + art + 'px;background:var(--accent)')`,
    ],
    [
      'art of a set ratio on the accent',
      `sx('aspect-ratio:1;width:' + w + ';background:var(--accent)')`,
    ],
  ])('[M0.sonoraclean/d] leaves alone what is no fill: %s', (_, src) => {
    expect(drawsFill(src)).toBe(false);
  });

  it.each(['QuickPick', 'MediaCard', 'EpisodeRow', 'MediaHeader'])(
    '[M0.sonoraclean/d] %s renders ProgressBar for its progress',
    (name) => {
      expect(rendered(source(name)).map((e) => e.tag)).toContain('ProgressBar');
    },
  );
});

/** The rows that draw the one row shell: every `*Row` but FieldRow, a label over an Input. */
const ROWS = ['EpisodeRow', 'ExpanderRow', 'QueueRow', 'ResultRow', 'SettingRow', 'ValueRow'];

/**
 * What only the row shell draws, each with the pattern that finds a copy of it: the press (a
 * button role, the keyboard activation, the focus order, the disabled flag, the state layer), the
 * divider (an absolutely placed hairline along the bottom) and the art with its overlay (the hover
 * reveal, the cover, a scrim over it, the grey of an absent item).
 */
const SHELL: Record<string, RegExp[]> = {
  press: [
    /role=["']button["']/,
    /\bactivate\(/,
    /\bonKeyDown\b/,
    /\btabIndex\b/,
    /aria-disabled/,
    /\bStateLayer\b/,
  ],
  divider: [/bottom:\s*0/, /height:\s*(1px|var\(--hairline\))/, /--surface-border/],
  'art overlay': [/\bREVEAL\b/, /\bCoverArt\b/, /var\(--scrim(-strong|-soft)?\)/, /grayscale\(/],
};

/** Which parts of the row shell a source draws for itself. */
const ownShell = (src: string): string[] =>
  Object.entries(SHELL).flatMap(([part, patterns]) =>
    patterns.filter((re) => re.test(src)).map((re) => `${part}: ${re.source}`),
  );

describe("Sonora's rows, read from their sources", () => {
  it('[M0.sonoraclean/d] the row family is every *Row but FieldRow, and the shell is ListRow', () => {
    const rows = [...components.keys()]
      .filter((name) => /Row$/.test(name) && name !== 'FieldRow' && name !== 'ListRow')
      .sort();
    expect(rows).toEqual(ROWS);
    expect(components.get('ListRow')?.folder).toBe('basic');
  });

  it.each(ROWS)('[M0.sonoraclean/d] %s renders ListRow', (name) => {
    expect(rendered(source(name)).map((e) => e.tag)).toContain('ListRow');
  });

  it.each(ROWS)(
    '[M0.sonoraclean/d] %s draws no press, divider or art overlay of its own',
    (name) => {
      expect(ownShell(source(name))).toEqual([]);
    },
  );

  it('[M0.sonoraclean/d] ListRow draws the press, the divider and the art overlay', () => {
    const own = ownShell(source('ListRow')).map((f) => f.split(':')[0]);
    expect(new Set(own)).toEqual(new Set(Object.keys(SHELL)));
  });

  it.each([
    ['a button role', `<div role="button" onClick={onClick} />`],
    ['keyboard activation', `<div onKeyDown={activate(onClick)} />`],
    ['a focus order', `<div tabIndex={0} />`],
    ['a disabled flag', `<div aria-disabled={off} />`],
    ['a state layer', `{StateLayer && <StateLayer disabled={off} />}`],
    [
      'a divider',
      `<div style={sx('position:absolute;bottom:0;left:72px;height:1px;background:var(--surface-border)')} />`,
    ],
    [
      'a hairline divider',
      `<div style={{ position: 'absolute', bottom: 0, height: 'var(--hairline)' }} />`,
    ],
    ['the hover reveal', `<div className={REVEAL.host} />`],
    ['a cover', `{CoverArt && <CoverArt src={image} />}`],
    ['a scrim over the art', `sx('position:absolute;inset:0;background:var(--scrim-strong)')`],
    ['a greyed cover', `sx('filter:grayscale(1)')`],
  ])('[M0.sonoraclean/d] names a row drawing its own shell: %s', (_, src) => {
    expect(ownShell(src)).not.toEqual([]);
  });

  it.each([
    [
      'a row handing its press to ListRow',
      `<ListRow onClick={onClick} disabled={!onClick} divider={divider} />`,
    ],
    ['a control inside a row', `<IconButton label="Remove" onClick={stop(onRemove)} />`],
    [
      'art handed to ListRow',
      `<ListRow image={image} artSize="md" onArt={onPlay} artLabel="Play" />`,
    ],
  ])('[M0.sonoraclean/d] leaves alone a row that hands its shell on: %s', (_, src) => {
    expect(ownShell(src)).toEqual([]);
  });
});
