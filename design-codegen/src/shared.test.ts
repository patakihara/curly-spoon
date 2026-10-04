import { readFileSync } from 'node:fs';
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
  'activate',
  'clamp01',
  'findPageScroller',
  'formatTime',
  'injectCss',
  'isActivationKey',
  'isScrollerX',
  'isScrollerY',
  'nearestScroller',
  'percentOf',
  'sx',
  'tokenMs',
  'tokenPx',
  'useMeasure',
];

/** Names the copies went by before the fold. */
const FORMER_NAMES = ['keys', 'mmss', 'ms', 'scrollerOf', 'pageScroller', 'clamp'];

/** What each helper's body looks like, so a copy under another name is still caught. */
const BODIES: [string, RegExp][] = [
  ['sx', /Object\.fromEntries\(String\(/],
  ['NS', /SonoraDesignSystem_/],
  ['isActivationKey', /key\s*[!=]==?\s*' '/],
  ['formatTime', /padStart\(2/],
  ['clamp01', /Math\.(max|min)\(\s*[01]\s*,\s*Math\.(min|max)\(\s*[01]\s*,/],
  ['percentOf', /\*\s*100\s*\+\s*'%'|\*\s*100\s*\}%/],
  ['tokenMs', /getPropertyValue\(/],
  ['injectCss', /createElement\(\s*'style'\s*\)/],
  ['useMeasure', /new ResizeObserver/],
  ['isScrollerY', /\.overflow[XY]\b/],
  ['StateLayer.ms', /\.ms\s*[(=]/],
];

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
      ...BODIES.filter(([, re]) => re.test(src)).map(([h]) => `${name} carries ${h}'s body`),
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
});
