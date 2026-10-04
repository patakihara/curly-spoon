import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { discoverComponents } from './sonora.js';

/**
 * Sonora's shared helpers live in one module, `components/shared.js`. Every component imports what
 * it needs from there and keeps no copy of its own. Read from the sources.
 */
const sonora = join(REPO_ROOT, SONORA_DIR);
const SHARED = join(sonora, 'components', 'shared.js');
const SHARED_IMPORT = '../shared.js';

/** Every helper Sonora shares, by the name the module exports it under. */
const HELPERS = [
  'NS',
  'REVEAL',
  'activate',
  'badgeTone',
  'clamp01',
  'findPageScroller',
  'formatTime',
  'injectCss',
  'isActivationKey',
  'isScrollerX',
  'isScrollerY',
  'nearestScroller',
  'percentOf',
  'prefersReducedMotion',
  'scrollEdges',
  'scrollMax',
  'skipGlyph',
  'sx',
  'tokenMs',
  'tokenPx',
  'useMeasure',
];

/** Names the copies went by before the fold. */
const FORMER_NAMES = ['keys', 'mmss', 'ms', 'scrollerOf', 'pageScroller', 'clamp'];

/**
 * What each helper's body looks like, so a copy under another name is still caught. Each pattern
 * reads the source after `normalise`, so a copy is caught whatever quotes or spacing it uses.
 */
const BODIES: [string, RegExp][] = [
  ['sx', /Object\.fromEntries\(String\(/],
  ['NS', /SonoraDesignSystem_/],
  [
    'isActivationKey',
    /key ?[!=]==? ?' '|' ' ?[!=]==? ?\w+\.key|\[ ?'Enter' ?, ?' ' ?\]|\[ ?' ' ?, ?'Enter' ?\]|code ?[!=]==? ?'Space(bar)?'|'Space(bar)?' ?[!=]==? ?\w+\.code|case '(Enter| )' ?:/,
  ],
  ['formatTime', /padStart\( ?2|[/%] ?60\b/],
  [
    'clamp01',
    /Math\.(max|min)\( ?[01] ?, ?Math\.(min|max)\( ?[01] ?,|Math\.(min|max)\( ?Math\.(max|min)\([^()]*, ?[01] ?\) ?, ?[01] ?\)|< ?0 ?\? ?0 ?:|> ?1 ?\? ?1 ?:/,
  ],
  ['percentOf', /\* ?100 ?\+ ?'%'|\* ?100 ?\}%/],
  ['tokenMs', /getPropertyValue\(/],
  ['injectCss', /createElement\( ?'style' ?\)/],
  ['useMeasure', /\bResizeObserver\b|\bonresize\b|addEventListener\( ?'resize'/],
  ['isScrollerY', /\.overflow[XY]?\b(?![-\w])/],
  ['prefersReducedMotion', /matchMedia\(/],
  ['skipGlyph', /name ?[=:] ?\{? ?'replay'/],
  [
    'scrollMax',
    /scroll(Width|Height) ?(-|[<>]=?|[!=]==?) ?[\w.]*(client|offset)(Width|Height)|(client|offset)(Width|Height)( ?[-+] ?[\w.]+)? ?(-|[<>]=?|[!=]==?) ?[\w.]*scroll(Width|Height)/,
  ],
  ['REVEAL', /:hover \.[\w-]/],
  ['badgeTone', /\b(progress|request|library) ?: ?'(accent|warning|success)'/],
  ['StateLayer.ms', /\.ms ?[(=]/],
];

/**
 * What a copy looks like on one source line, read before whitespace is joined across lines: a style
 * element made or appended, whatever the variable holding it is called.
 */
const LINE_BODIES: [string, RegExp][] = [
  [
    'injectCss',
    /createElement\(.*'style'|'style'.*createElement\(|createElement\( ?(style|tag)\w* ?\)|appendChild\(.*style/i,
  ],
];

/** The source with every quote made single and every run of whitespace one space. */
const normalise = (src: string) => src.replace(/["`]/g, "'").replace(/\s+/g, ' ');

/** The helpers whose body the source carries a copy of. */
const bodiesIn = (src: string) => {
  const lines = src.replace(/["`]/g, "'").split('\n');
  return [
    ...BODIES.filter(([, re]) => re.test(normalise(src))),
    ...LINE_BODIES.filter(([, re]) => lines.some((l) => re.test(l))),
  ].map(([h]) => h);
};

const parse = (file: string, src: string) =>
  ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);

/** The top-level names a module exports, once per declaration. */
function exportedNames(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const s of sf.statements) {
    const exported = ts
      .getModifiers(s as ts.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(s) && s.name) names.push(s.name.text);
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(d.name.text);
      }
    }
  }
  return names;
}

/** Every name the source declares, at any depth: variables, functions and parameters. */
function declaredNames(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node)) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name)
    ) {
      names.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** What the source imports from the shared module. */
function sharedImports(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    if (s.moduleSpecifier.text !== SHARED_IMPORT) continue;
    const b = s.importClause?.namedBindings;
    if (b !== undefined && ts.isNamedImports(b)) {
      for (const e of b.elements) names.push(e.name.text);
    }
  }
  return names;
}

/** The helper names the source refers to outside its import lines. */
function usedHelpers(sf: ts.SourceFile): string[] {
  const used = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) return;
    if (
      ts.isIdentifier(node) &&
      HELPERS.includes(node.text) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    ) {
      used.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...used].sort();
}

const components = discoverComponents(sonora).map((c) => ({
  name: c.name,
  sf: parse(c.jsx, readFileSync(c.jsx, 'utf8')),
  src: readFileSync(c.jsx, 'utf8'),
}));

describe("Sonora's shared helpers", () => {
  it('[M0.sonoraclean/e] each shared helper is defined once, in components/shared.js', () => {
    const exported = exportedNames(parse(SHARED, readFileSync(SHARED, 'utf8')));
    expect([...exported].sort()).toEqual(HELPERS);
  });

  it('[M0.sonoraclean/e] no component defines its own copy of a shared helper, under any name', () => {
    const copies = components.flatMap(({ name, sf, src }) => [
      ...declaredNames(sf)
        .filter((n) => HELPERS.includes(n) || FORMER_NAMES.includes(n))
        .map((n) => `${name} declares ${n}`),
      ...bodiesIn(src).map((h) => `${name} carries ${h}'s body`),
    ]);
    expect(copies).toEqual([]);
  });

  it('[M0.sonoraclean/e] every component takes each helper it uses from the shared module', () => {
    const wrong = components.flatMap(({ name, sf }) => {
      const imported = sharedImports(sf).sort();
      const used = usedHelpers(sf);
      return JSON.stringify(imported) === JSON.stringify(used)
        ? []
        : [`${name} imports [${imported}] but uses [${used}]`];
    });
    expect(wrong).toEqual([]);
  });

  /** A copy of a component with `snippet` planted after its imports, as a file on disk. */
  const planted = (snippet: string) => {
    const host = components.find((c) => c.name === 'Badge');
    if (host === undefined) throw new Error('no Badge to plant into');
    const file = join(mkdtempSync(join(tmpdir(), 'sonora-shared-')), 'Badge.jsx');
    writeFileSync(
      file,
      host.src.replace(/^(import [^\n]*\n)+/m, (m) => `${m}${snippet}\n`),
    );
    return readFileSync(file, 'utf8');
  };

  it.each([
    ['an m:ss formatter without padStart', "const t = (s) => Math.floor(s / 60) + ':' + (s % 60);"],
    ['Enter or Space in double quotes', 'const k = (e) => e.key === "Enter" || e.key === " ";'],
    ['Enter and Space as a list', "const k = (e) => ['Enter', ' '].includes(e.key);"],
    ['a ternary clamp', 'const c = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);'],
    ['a nested Math clamp', 'const c = (v) => Math.min(Math.max(v, 0), 1);'],
    ['a style element made in double quotes', 'const s = document.createElement("style");'],
    [
      'a scroller found by the overflow shorthand',
      "const o = (el) => getComputedStyle(el).overflow === 'auto';",
    ],
    ['a reduced-motion query', "const r = matchMedia('(prefers-reduced-motion: reduce)').matches;"],
    ['a scroll-edge sum', 'const max = (el) => el.scrollWidth - el.clientWidth;'],
    [
      'a scroll-max comparison with a pixel of slack',
      'const scrolls = (el) => el.scrollHeight > el.clientHeight + 1;',
    ],
    [
      'a scroll-max comparison against offsetHeight',
      'const fits = (el) => el.offsetHeight >= el.scrollHeight;',
    ],
    ['Space read by its code', "const k = (e) => e.code === 'Space';"],
    ['Space read by its old code', "const k = (e) => e.code === 'Spacebar';"],
    ['Enter as a switch case', "const k = (e) => { switch (e.key) { case 'Enter': return 1; } };"],
    ['Space as a switch case', "const k = (e) => { switch (e.key) { case ' ': return 1; } };"],
    ['a ResizeObserver from window', 'const ro = new window.ResizeObserver(() => {});'],
    [
      'a ResizeObserver held in a variable',
      'const RO = ResizeObserver; const ro = new RO(() => {});',
    ],
    ['a window onresize handler', 'window.onresize = () => {};'],
    ['a resize listener', "window.addEventListener('resize', () => {});"],
    ['any media query', "const wide = matchMedia('(min-width: 600px)').matches;"],
    ['a style element appended', 'document.head.appendChild(styleEl);'],
    ['a style element made through a variable', 'const s = document.createElement(tag);'],
    [
      "a style element made with 'style' later on the line",
      "const s = document.createElement(kind || 'style');",
    ],
    ['a second hover-reveal rule', "const css = '.x-host:hover .x-act{opacity:1}';"],
    ['a second badge-tone map', "const t = { progress: 'accent', request: 'warning' };"],
  ])('[M0.sonoraclean/e] a component carrying %s fails the check', (_, snippet) => {
    expect(bodiesIn(planted(snippet))).not.toEqual([]);
  });

  it('[M0.sonoraclean/e] the badge tone each component draws comes from one map', () => {
    const shared = normalise(readFileSync(SHARED, 'utf8'));
    expect(shared.match(/progress ?: ?'(accent|warning)'/g)).toHaveLength(1);
  });
});
