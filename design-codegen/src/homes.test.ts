import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import { readNav } from './nav.js';
import { framePage } from './shell.js';
import type { PageTree } from './page.js';
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
const nav = readNav(join(REPO_ROOT, APP_DIR));

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
      const { value, options } = data.sort as { value: string; options: { label: string }[] };
      expect(options.map((o) => o.label)).toEqual(['Title', home.person, 'Random']);
      expect(options.map((o) => o.label)).toContain(value);
    });

    it(`[M2.sorting] ${home.id} opens its sorts as a menu from the bar, keyed title, artist and random, handing the choice to the library`, () => {
      const sort = all.find((e) => e.component === 'SortFilterBar');
      expect(sort?.props.items).toEqual({ kind: 'binding', path: ['data', 'sort', 'options'] });
      expect(sort?.props.onSelect).toEqual({
        kind: 'choose',
        params: { ref: ['data', 'sort', 'ref'] },
      });
      const { ref, options } = data.sort as { ref: string; options: { key: string }[] };
      expect(ref).toBe(home.id);
      expect(options.map((o) => o.key)).toEqual(['title', 'artist', 'random']);
    });

    it(`[M2.sorting] ${home.id}'s route keeps its sort and Random's seed in the address`, () => {
      expect(nav.pages.find((p) => p.id === home.id)?.route).toBe(`/${home.id}?sort&seed`);
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

/** Every card a page draws, with the data path of the Each list it is drawn for. */
function cards(tree: PageTree, of: string[] = [], into: { card: Element; of: string[] }[] = []) {
  if (
    tree.kind === 'element' &&
    ['MediaCard', 'ArtistCard', 'QuickPick'].includes(tree.component)
  ) {
    into.push({ card: tree, of });
  }
  if ('children' in tree) {
    for (const c of tree.children) cards(c, c.kind === 'each' ? c.of : of, into);
  }
  return into;
}

describe('a card on a library home', () => {
  /** The page each home's cards open, read off the kind its item says it is. */
  const KIND: Record<string, string> = {
    Album: 'album',
    Book: 'book',
    Podcast: 'show',
    Episode: 'episode',
    Artist: 'artist',
    Author: 'author',
  };
  const OPENS: Record<string, (item: { sub: string }, of: string[]) => string> = {
    music: () => 'album',
    books: () => 'book',
    podcasts: (_, of) => (of.at(-1) === 'lists' ? 'list' : 'show'),
    browse: (item) => KIND[item.sub.split(' · ')[0]!]!,
    shelf: (item) => KIND[item.sub.split(' · ')[0]!]!,
  };

  for (const [id, opens] of Object.entries(OPENS)) {
    it(`[M0.canvas] on ${id}, opens its own item's page, every one`, () => {
      const { tree, data } = read(id);
      const found = cards(tree);
      expect(found.length).toBeGreaterThan(0);
      for (const { card, of } of found) {
        const title = card.props.title;
        const item = title?.kind === 'binding' ? title.path[0]! : '';
        const list = of
          .slice(1)
          .reduce<unknown>((at, k) => (at as Record<string, unknown>)[k], data) as {
          sub: string;
          ref: string;
          page?: string;
        }[];
        expect(list.length, of.join('.')).toBeGreaterThan(0);
        const onClick = card.props.onClick;
        expect(onClick?.kind, `${card.component} over ${of.join('.')}`).toBe('open');
        if (onClick?.kind !== 'open') continue;
        expect(onClick.params).toEqual({ ref: [item, 'ref'] });
        if (typeof onClick.page === 'string') {
          for (const entry of list) expect(onClick.page, entry.sub).toBe(opens(entry, of));
        } else {
          // A mixed list: each item names the page of its own kind.
          expect(onClick.page).toEqual({ path: [item, 'page'] });
          for (const entry of list) expect(entry.page, entry.sub).toBe(opens(entry, of));
        }
      }
    });
  }

  it('on browse, opens each shelf in full from its "See all", each its own shelf', () => {
    const { tree, data } = read('browse');
    const seeAll = elements(tree).filter(
      (e) => e.component === 'Section' && e.props.actionLabel?.kind === 'literal',
    );
    expect(seeAll).toHaveLength(3);
    const ids = seeAll.map((section) => {
      const action = section.props.onAction;
      expect(action?.kind === 'open' && action.page).toBe('shelf');
      const path = action?.kind === 'open' ? action.params.id! : [];
      expect(path[0]).toBe('data');
      return path.slice(1).reduce<unknown>((at, k) => (at as Record<string, unknown>)[k], data);
    });
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('[M0.canvas] on browse, keeps its shelves mixed, the kinds interleaved', () => {
    const { data } = read('browse');
    const kinds = (data.recentlyAdded as { page: string }[]).map((e) => e.page);
    expect(new Set(kinds).size).toBeGreaterThan(1);
    const runs = kinds.filter((k, i) => i === 0 || k !== kinds[i - 1]).length;
    expect(runs).toBeGreaterThan(new Set(kinds).size);
  });

  it('[M0.canvas] on browse, argues for one episode at length, with a blurb and a Preview, and plays it on the spoken queue', () => {
    const { tree, data } = read('browse');
    const [card, ...more] = elements(tree).filter((e) => e.component === 'FeatureCard');
    expect(more).toEqual([]);
    const feature = data.feature as Record<string, string>;
    expect(feature.description!.length).toBeGreaterThan(80);
    expect(card!.props.description).toEqual({
      kind: 'binding',
      path: ['data', 'feature', 'description'],
    });
    const preview = card!.props.preview;
    expect(
      preview?.kind === 'slot' && preview.tree.kind === 'element' && preview.tree.component,
    ).toBe('PreviewButton');
    expect(card!.props.onPlay).toMatchObject({ kind: 'play', queue: 'spoken' });
  });

  it('[M0.canvas] on books, requests a greyed book with a tap, as a series does', () => {
    const { tree } = read('books');
    for (const { card } of cards(tree)) {
      expect(card.props.onRequest).toEqual({ kind: 'request', params: { ref: ['book', 'ref'] } });
    }
  });
});

describe("[M2.sorting] Browse's Up next and second-most-recent shelves", () => {
  const { tree, data } = read('browse');
  const SHELVES = [
    { title: 'Up next', of: 'upNext' },
    { title: 'Still listening', of: 'stillListening' },
  ] as const;
  const titled = elements(tree)
    .filter((e) => e.component === 'Section' && e.props.title?.kind === 'literal')
    .map((e) => ({ section: e, title: (e.props.title as { value: string }).value }));

  it('names both in its structure, Up next and then the second-most-recent one', () => {
    const names = nav.pages.find((p) => p.id === 'browse')!.structure.sections.map((s) => s.name);
    const at = names.indexOf('Up next');
    expect(at).toBeGreaterThan(-1);
    expect(names[at + 1]).toBe('Still listening');
  });

  it('draws them right after Jump back in, and its section bar names them there', () => {
    const titles = titled.map((t) => t.title);
    expect(titles.slice(0, 3)).toEqual(['Jump back in', 'Up next', 'Still listening']);
    expect((data.sections as string[]).slice(0, 3)).toEqual(titles.slice(0, 3));
  });

  for (const { title, of } of SHELVES) {
    it(`draws ${title} as a shelf of cards over data.${of}, each with its progress, opening its own book or episode`, () => {
      const { section } = titled.find((t) => t.title === title)!;
      const [shelf] = section.children;
      expect(shelf?.kind === 'element' && shelf.component).toBe('Shelf');
      const [each] = (shelf as Element).children;
      expect(each?.kind === 'each' && each.of).toEqual(['data', of]);
      const card = (each as { children: PageTree[] }).children[0] as Element;
      expect(card.component).toBe('MediaCard');
      for (const prop of ['title', 'sub', 'image', 'progress'])
        expect(card.props[prop], prop).toEqual({ kind: 'binding', path: ['item', prop] });
      expect(card.props.onClick).toEqual({
        kind: 'open',
        page: { path: ['item', 'page'] },
        params: { ref: ['item', 'ref'] },
      });
      const items = data[of] as { page: string }[];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(['book', 'episode']).toContain(item.page);
    });
  }

  it('holds at most one book and one show in the second-most-recent shelf', () => {
    const pages = (data.stillListening as { page: string }[]).map((i) => i.page).sort();
    expect(pages).toEqual(['book', 'episode']);
  });
});
