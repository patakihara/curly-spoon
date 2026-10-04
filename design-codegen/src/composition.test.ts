import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { discoverComponents } from './sonora.js';

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
  'MiniPlayer',
  'NavRail',
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
  'SectionHeader',
  'Shelf',
  'SideSheet',
  'SortFilterBar',
  'StatusBanner',
  'TabBar',
  'TonalIconButton',
  'TransportBar',
];

/** The components whose only glyphs are IconButton's, named through its `icon`. */
const ICON_BUTTON_GLYPHS = ['NowPlayingPage', 'PlayerSubPage', 'SearchButton'];

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

  it('[M0.sonoraclean/d] no showcase card or snippet hand-draws a glyph in the icon font', () => {
    const root = `${REPO_ROOT}/${SONORA_DIR}`;
    const files = [
      ...readdirSync(`${root}/components`, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.card.html'))
        .map((f) => `components/${f}`),
      ...readdirSync(`${root}/docs/examples`)
        .filter((f) => f.endsWith('.snippet.jsx'))
        .map((f) => `docs/examples/${f}`),
    ];
    const offenders = files.filter((f) =>
      ICON_FONT.some((re) => re.test(readFileSync(`${root}/${f}`, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('[M0.sonoraclean/d] no reference card hand-draws a glyph in the icon font', () => {
    const root = `${REPO_ROOT}/${SONORA_DIR}/reference`;
    const offenders = readdirSync(root)
      .filter((f) => f.endsWith('.card.html'))
      .filter((f) => ICON_FONT.some((re) => re.test(readFileSync(`${root}/${f}`, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it("[M0.sonoraclean/d] a card or snippet glyph beside a Button's or Input's text follows the text's weight", () => {
    const root = `${REPO_ROOT}/${SONORA_DIR}`;
    const files = [
      ...readdirSync(`${root}/components`, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.card.html'))
        .map((f) => `components/${f}`),
      ...readdirSync(`${root}/docs/examples`)
        .filter((f) => f.endsWith('.snippet.jsx'))
        .map((f) => `docs/examples/${f}`),
    ];
    const iconProp =
      /<(Button|Input)\b(?:(?!<\/?(?:Button|Input)\b)[\s\S])*?icon=\{<Icon\b([^>]*)\/>/g;
    const offenders = files.flatMap((f) =>
      [...readFileSync(`${root}/${f}`, 'utf8').matchAll(iconProp)]
        .filter((m) => !/weight="text"/.test(m[2]!))
        .map((m) => `${f}: ${m[1]} ${m[2]!.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
