import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNav, readNav, type Nav } from './nav.js';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import {
  FLOWS_BOARD,
  generateFlows,
  generateStructure,
  groupPages,
  layoutFlows,
} from './structure.js';

const appDir = join(REPO_ROOT, APP_DIR);
const nav = readNav(appDir);
const drawn = new Set(
  nav.pages.map((p) => p.id).filter((id) => existsSync(join(appDir, 'pages', `${id}.page.jsx`))),
);
const head = ['<link rel="stylesheet" href="ds/sonora/tokens.css">'];

/** nav.json with one page's structure changed. */
function changed(id: string, change: (s: Nav['pages'][number]['structure']) => void): Nav {
  const copy = structuredClone(nav);
  change(copy.pages.find((p) => p.id === id)!.structure);
  return parseNav(copy);
}

describe('the structure artboard', () => {
  const { html } = generateStructure(nav, drawn, head);

  it('[M0.canvas/f] holds every page of nav.json: its purpose, sections, empty state and links', () => {
    for (const page of nav.pages) {
      expect(html).toContain(`>${page.title}</h3>`);
      expect(html).toContain(page.structure.purpose.replaceAll('&', '&amp;'));
      for (const s of page.structure.sections)
        expect(html).toContain(`>${s.name.replaceAll('&', '&amp;')}</strong>`);
    }
    expect(html).toContain('PROVISIONAL');
    expect(html).toContain('>Links to: </strong>');
    expect(html).toContain('>Empty: </strong>');
  });

  it('[M0.canvas/f] groups pages by destination, the player and the rest, each home first', () => {
    const groups = groupPages(nav);
    expect(groups.map((g) => g.label)).toEqual([
      'Browse',
      'Music',
      'Books',
      'Podcasts',
      'Search',
      'Player',
      'Around the app',
    ]);
    for (const g of groups.slice(0, 5)) expect(g.pages[0]!.id).toBe(g.id);
    expect(groups.flatMap((g) => g.pages).length).toBe(nav.pages.length);
    for (const label of groups.map((g) => g.label)) expect(html).toContain(`>${label}</h2>`);
  });

  it('[M0.canvas/f] changes when a page’s structure changes', () => {
    const edited = changed('album', (s) => {
      s.sections.push({ name: 'Credits', holds: 'Who played on it.', provisional: true });
    });
    const after = generateStructure(edited, drawn, head).html;
    expect(after).not.toEqual(html);
    expect(after).toContain('>Credits</strong>');
  });

  it('says which pages are drawn and which are structure only', () => {
    expect(html).toContain(drawn.size > 0 ? 'drawn' : 'structure only');
    expect(html).toContain('structure only');
  });

  it('keeps text braces from reading as bindings', () => {
    const edited = changed('album', (s) => {
      s.purpose = 'One album {{not.a.binding}}';
    });
    expect(generateStructure(edited, drawn, head).html).not.toContain('{{not');
  });
});

describe('the flowchart artboard', () => {
  const { html } = generateFlows(nav, drawn, head);
  const { boxes, width, height } = layoutFlows(nav);
  const edges = nav.pages.flatMap((p) => p.structure.links.map((l) => [p, l] as const));

  it('[M0.canvas/f] draws every page as a node and every link as an arrow', () => {
    for (const page of nav.pages) expect(html).toContain(`>${page.title}</text>`);
    expect(html.match(/marker-end="url\(#arrow\)"/g)?.length).toBe(edges.length);
    for (const [from, to] of edges) {
      const title = nav.pages.find((p) => p.id === to)!.title;
      expect(html).toContain(`<title>${from.title} to ${title}</title>`);
    }
  });

  it('[M0.canvas/f] changes when a page’s links change', () => {
    const edited = changed('album', (s) => {
      s.links.push('book');
    });
    const after = generateFlows(edited, drawn, head).html;
    expect(after).toContain('<title>Album to Book</title>');
    expect(html).not.toContain('<title>Album to Book</title>');
  });

  it('shows each page’s back behaviour on its node', () => {
    expect(html).toContain('↑ up to Music');
    expect(html).toContain('← back through history');
  });

  it('lays nodes out with no two overlapping and every one inside the artboard', () => {
    const { w, h } = FLOWS_BOARD.node;
    const all = [...boxes.values()];
    for (const a of all) {
      expect(a.x >= 0 && a.y >= 0 && a.x + w <= width && a.y + h <= height, a.page.id).toBe(true);
      for (const b of all) {
        if (a === b) continue;
        const apart = a.x + w <= b.x || b.x + w <= a.x || a.y + h <= b.y || b.y + h <= a.y;
        expect(apart, `${a.page.id} and ${b.page.id}`).toBe(true);
      }
    }
  });

  it('keeps every node label inside its box', () => {
    // A 16 px bold character is under 10 px wide, a 12 px one under 7; 14 px padding each side.
    const lines = [...html.matchAll(/font-size: (16|12)px[^>]*>([^<]*)<\/text>/g)];
    expect(lines.length).toBe(nav.pages.length * 2);
    for (const [, size, text] of lines) {
      const chars = text!.replaceAll('&amp;', '&').length;
      expect(chars * (size === '16' ? 10 : 7) + 28, text).toBeLessThanOrEqual(FLOWS_BOARD.node.w);
    }
  });

  it('is the same drawing every time', () => {
    expect(generateFlows(nav, drawn, head).html).toEqual(html);
  });
});

describe('the canvas draws every page', () => {
  // A todo while pages are undrawn keeps (f) open without failing the build; progress counts a
  // skipped tagged test as a check not yet made. With none left it is the real assertion.
  const undrawn = nav.pages.map((p) => p.id).filter((id) => !drawn.has(id));
  const name = '[M0.canvas/f] gives every page of nav.json a page file before M0.canvas is done';
  if (undrawn.length > 0) it.todo(`${name} (undrawn: ${undrawn.join(', ')})`);
  else
    it(name, () => {
      expect(nav.pages.every((p) => drawn.has(p.id))).toBe(true);
    });
});
