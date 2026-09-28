import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import { framePage } from './shell.js';
import { bindings, elements, readPage as read, type Element } from './test-pages.js';

/**
 * Each library home, the person its second sort names, what its local search names, and the
 * placeholder data it may bind: its own controls (tabs, filters, spy sections, sort) and its own
 * library, nothing else.
 */
const HOMES = [
  {
    id: 'music',
    person: 'Artist',
    searches: 'Search your music and requests',
    binds: ['library', 'sort', 'tabs'],
  },
  {
    id: 'books',
    person: 'Author',
    searches: 'Search your books and requests',
    binds: ['library', 'sort', 'tabs'],
  },
  {
    id: 'podcasts',
    person: 'Host',
    searches: 'Search your shows and their episodes',
    binds: ['library', 'lists', 'sections', 'sort'],
  },
] as const;

const browse = read('browse').data;

describe('the library homes', () => {
  for (const home of HOMES) {
    const { tree, data } = read(home.id);
    const all = elements(tree);

    it(`[M0.canvas] ${home.id} sorts by exactly Title, ${home.person} and Random, beside the grid or list toggle`, () => {
      const sort = all.find((e) => e.component === 'SortFilterBar');
      expect(sort?.props.label).toEqual({ kind: 'binding', path: ['data', 'sort', 'value'] });
      const trailing = sort?.props.trailing;
      expect(trailing?.kind === 'slot' && trailing.tree.kind === 'element').toBe(true);
      expect((trailing as { tree: Element }).tree.component).toBe('ViewToggle');
      const { value, options } = data.sort as { value: string; options: string[] };
      expect(options).toEqual(['Title', home.person, 'Random']);
      expect(options).toContain(value);
    });

    it(`[M0.canvas] ${home.id} binds only its own library (${home.binds.join(', ')}), never Browse's feed, Browse's filter or search results`, () => {
      const paths = bindings(tree);
      const roots = new Set(paths.filter((p) => p.startsWith('data.')).map((p) => p.split('.')[1]));
      expect([...roots].sort()).toEqual([...home.binds]);
      // `sections` is any spied page's own section titles, not Browse's content.
      const feed = Object.keys(browse).filter((key) => key !== 'sections');
      for (const key of feed) expect(home.binds).not.toContain(key);
      expect(paths.filter((p) => p.startsWith('shell.'))).toEqual([]);
      expect(paths.some((p) => /search|results|feed/i.test(p))).toBe(false);
    });

    it(`[M0.canvas] ${home.id} has a local search in its back layer, scoped to it: "${home.searches}"`, () => {
      expect(framePage(tree).search).toBe(home.searches);
    });

    it(`[M0.canvas] ${home.id} draws no in-library marker: where it goes is still open in the plan`, () => {
      for (const card of all.filter((e) => e.component === 'MediaCard')) {
        expect(Object.keys(card.props)).not.toContain('absent');
        expect(Object.keys(card.props)).not.toContain('markers');
      }
    });
  }

  it('[M0.canvas] shows its requests with a status in their tone, and everything else untoned', () => {
    const TONES: Record<string, RegExp> = {
      progress: /^Downloading · \d+%$/,
      request: /^Needs choice$/,
      error: /^Failed$/,
    };
    const seen = new Set<string>();
    for (const id of ['music', 'books']) {
      const items = read(id).data.library as { status: string | null; tone: string | null }[];
      for (const { status, tone } of items) {
        if (status === null) {
          expect(tone).toBeNull();
          continue;
        }
        expect(Object.keys(TONES)).toContain(tone);
        expect(status).toMatch(TONES[tone!]!);
        seen.add(tone!);
      }
    }
    expect([...seen].sort()).toEqual(['error', 'progress', 'request']);
  });

  it('[M0.canvas] gives no library home a filter row: its requests sit among its items, greyed with their status', () => {
    for (const home of HOMES) {
      const { tree, data } = read(home.id);
      expect(framePage(tree).controls, home.id).toBeUndefined();
      expect(data, home.id).not.toHaveProperty('filters');
    }
  });

  it('[M0.canvas] opens Music on Albums, its first tab, then Artists and Songs', () => {
    const tabs = read('music').data.tabs as { key: string }[];
    expect(tabs.map((t) => t.key)).toEqual(['albums', 'artists', 'songs']);
  });

  it('[M0.canvas] opens Books on Books, its first tab, then Authors, Series and Narrators', () => {
    const tabs = read('books').data.tabs as { key: string }[];
    expect(tabs.map((t) => t.key)).toEqual(['books', 'authors', 'series', 'narrators']);
  });
});

describe('a tab row', () => {
  const drawn = readdirSync(join(REPO_ROOT, APP_DIR, 'pages')).map((f) =>
    f.replace('.page.jsx', ''),
  );

  it('[M0.canvas] always opens on its first tab, on every page', () => {
    let rows = 0;
    for (const id of drawn) {
      const { tree, data } = read(id);
      for (const bar of elements(tree).filter((e) => e.component === 'TabBar')) {
        rows++;
        const items = bar.props.items;
        expect(items?.kind, id).toBe('binding');
        const path = (items as { path: string[] }).path;
        expect(path[0], id).toBe('data');
        const tabs = path
          .slice(1)
          .reduce<unknown>((at, k) => (at as Record<string, unknown>)[k], data);
        expect(bar.props.value, id).toEqual({
          kind: 'literal',
          value: (tabs as { key: string }[])[0]!.key,
        });
      }
    }
    expect(rows).toBeGreaterThan(0);
  });
});
