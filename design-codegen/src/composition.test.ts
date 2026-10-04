import { readFileSync } from 'node:fs';
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
