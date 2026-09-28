import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNav, readNav, type Nav } from './nav.js';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import {
  backModel,
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

  it('says in the header where each kind of navigation puts Search', () => {
    expect(html).toContain('On the phone’s bottom bar: Browse, Music, Books, Podcasts, Search.');
    expect(html).toContain('On the rail: Search, Browse, Music, Books, Podcasts.');
  });

  it('says what back does once, in the header, not per page', () => {
    for (const line of backModel(nav)) expect(html.split(line).length - 1, line).toBe(1);
    expect(html).not.toContain('>Back: </strong><span');
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
  const { boxes, groups, lines, columns, width, height } = layoutFlows(nav);
  const box = (id: string) => boxes.get(id)!;

  it('[M0.canvas/f] draws every page as a node and every link, as a tree line or on the node', () => {
    for (const page of nav.pages) expect(html).toContain(`>${page.title}</text>`);
    for (const page of nav.pages) {
      const shown = new Set([
        ...lines.filter((l) => l.from.page.id === page.id).map((l) => l.to.page.id),
        ...box(page.id).links,
      ]);
      expect([...shown].sort(), page.id).toEqual([...new Set(page.structure.links)].sort());
    }
    for (const { from, to } of lines)
      expect(html).toContain(`<title>${from.page.title} to ${to.page.title}</title>`);
    for (const b of boxes.values())
      for (const text of b.linkLines) expect(html).toContain(`>${text}</text>`);
    expect(box('album').linkLines.join(' ')).toContain('Artist');
  });

  it('[M0.canvas/f] changes when a page’s links change', () => {
    const edited = changed('album', (s) => {
      s.links.push('book');
    });
    const after = generateFlows(edited, drawn, head).html;
    expect(after).toContain('→ Artist · Book');
    expect(html).not.toContain('→ Artist · Book');
  });

  it('draws a line to a page only from the first page of its column that links to it', () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const { from, to } of lines) {
      const column = groups[to.column]!.pages;
      const first = column.find((p) => p.structure.links.includes(to.page.id));
      expect(first?.id, `${from.page.id} to ${to.page.id}`).toBe(from.page.id);
      expect(to.column).toBe(from.column);
      expect(from.y).toBeLessThan(to.y);
    }
    const tree = lines.map((l) => `${l.from.page.id}>${l.to.page.id}`);
    expect(tree).toContain('music>album');
    expect(tree).toContain('podcasts>show');
    expect(tree).toContain('show>episode');
    expect(tree).toContain('nowPlaying>queue');
    expect(tree).toContain('settings>shelfReview');
    expect(tree).not.toContain('browse>notFound');
  });

  it('keeps every line inside its column', () => {
    for (const { from, to, points } of lines) {
      const col = columns[from.column]!;
      for (const [x] of points)
        expect(x >= col.x && x <= col.x + col.w, `${from.page.id} to ${to.page.id}`).toBe(true);
    }
  });

  it('says what back does once, in the legend, and nothing about it on the nodes', () => {
    for (const line of backModel(nav)) expect(html.split(line).length - 1, line).toBe(1);
    expect(html).not.toContain('back through history');
    expect(html).not.toContain('up to');
  });

  it('puts each page’s route on its node, and whether it is a sheet or Android only', () => {
    expect(box('album').detail).toBe('/music/albums/:ref');
    expect(box('nowPlaying').detail).toBe('/playing · sheet');
    expect(box('downloads').detail).toBe('/downloads · Android only');
  });

  it('keeps the note that every screen reaches the destinations through the mini-player', () => {
    expect(html).toContain('every screen also reaches the destinations, Settings, and Now Playing');
  });

  it('lays nodes out with no two overlapping, each inside its column and the artboard', () => {
    const all = [...boxes.values()];
    for (const a of all) {
      const col = columns[a.column]!;
      expect(a.x >= col.x && a.x + a.w <= col.x + col.w, a.page.id).toBe(true);
      expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= width && a.y + a.h <= height, a.page.id).toBe(
        true,
      );
      for (const b of all) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.page.id} and ${b.page.id}`).toBe(true);
      }
    }
    for (let i = 1; i < columns.length; i++)
      expect(columns[i]!.x).toBeGreaterThanOrEqual(columns[i - 1]!.x + columns[i - 1]!.w);
  });

  it('keeps every node’s text inside its box', () => {
    // A 16 px bold character is under 10 px wide, a 12 px one under 7; 14 px padding each side.
    for (const b of boxes.values()) {
      const texts: [string, number][] = [
        [b.page.title, 10],
        [b.detail, 7],
        ...b.linkLines.map((t) => [t, 7] as [string, number]),
      ];
      for (const [text, px] of texts) expect(text.length * px + 28, text).toBeLessThanOrEqual(b.w);
      expect(b.h).toBeGreaterThanOrEqual(56 + b.linkLines.length * 16);
    }
    expect(box('search').linkLines.length).toBeGreaterThan(1);
  });

  it('sizes the artboard to its content', () => {
    const right = Math.max(...columns.map((c) => c.x + c.w));
    const bottom = Math.max(...[...boxes.values()].map((b) => b.y + b.h));
    expect(width - right).toBeLessThanOrEqual(FLOWS_BOARD.pad);
    expect(height - bottom).toBeLessThanOrEqual(FLOWS_BOARD.pad + 120);
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
