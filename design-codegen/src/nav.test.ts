import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  generatePlatform,
  generateRoutes,
  parseNav,
  readNav,
  splitRoute,
  type Nav,
} from './nav.js';
import { APP_DIR, OUTPUTS, REPO_ROOT } from './outputs.js';

const nav = readNav(join(REPO_ROOT, APP_DIR));

const back = { close: 'opener', stacks: 'perDestination', android: 'close', web: 'previousView' };
const small = (pages: unknown[], over: Record<string, unknown> = {}): unknown => ({
  destinations: [{ id: 'music', label: 'Music', icon: 'album' }],
  layouts: [{ minWidth: 0, nav: 'bottomBar', order: ['music'] }],
  back,
  pages,
  ...over,
});
const page = (over: Record<string, unknown> = {}) => ({
  id: 'album',
  route: '/music/albums/:ref',
  params: { ref: 'ItemRef' },
  lights: 'music',
  close: 'opener',
  presentation: 'screen',
  title: 'Album',
  sources: { sonora: ['kit:mobile/album'], spotify: [] },
  structure: {
    purpose: 'One album.',
    sections: [{ name: 'Tracks', holds: 'Its tracks.' }],
    empty: 'Says so.',
    links: [],
  },
  ...over,
});
const structured = (structure: Record<string, unknown>) =>
  page({ structure: { ...page().structure, ...structure } });

describe('nav.json', () => {
  // Importing the table imports every generated page, which takes seconds under a full run.
  it('[M0.canvas/a] the generated web route table lists exactly the web pages of nav.json, with their paths', async () => {
    const routes = join(REPO_ROOT, OUTPUTS.webNav, 'routes.tsx');
    const mod = (await import(pathToFileURL(routes).href)) as {
      pages: { id: string; path: string }[];
    };
    const expected = nav.pages
      .filter((p) => p.platforms.includes('web'))
      .map((p) => ({ id: p.id, path: splitRoute(p.route).path }));
    expect(mod.pages.map((p) => ({ id: p.id, path: p.path }))).toEqual(expected);
  }, 30_000);

  it('holds the whole screen map: 26 pages, five destinations', () => {
    expect(nav.pages).toHaveLength(26);
    expect(nav.destinations.map((d) => d.id)).toEqual([
      'browse',
      'music',
      'books',
      'podcasts',
      'search',
    ]);
  });

  it('makes only Downloads Android-only; every other page is on both platforms', () => {
    const partial = nav.pages.filter((p) => p.platforms.length !== 2).map((p) => p.id);
    expect(partial).toEqual(['downloads']);
    expect(nav.pages.find((p) => p.id === 'downloads')?.platforms).toEqual(['android']);
  });

  it('refuses a page lighting a destination that does not exist', () => {
    expect(() => parseNav(small([page({ lights: 'books' })]))).toThrow(/album.*books/);
  });

  it('refuses a filter that narrows to something not a destination, or to one twice', () => {
    const filtered = (narrows: string[]) => page({ filter: { all: 'All', narrows } });
    expect(() => parseNav(small([filtered(['books'])]))).toThrow(/album.*filter.*books/);
    expect(() => parseNav(small([filtered(['music', 'music'])]))).toThrow(/album.*filter.*twice/);
    expect(parseNav(small([filtered(['music'])])).pages[0]!.filter?.narrows).toEqual(['music']);
  });

  it('refuses two pages with one id', () => {
    expect(() => parseNav(small([page(), page()]))).toThrow(/album.*twice/);
  });

  it("refuses a route whose parameters differ from the page's params", () => {
    expect(() => parseNav(small([page({ params: {} })]))).toThrow(/album.*ref/);
  });

  it('gives back one model for the whole app: ✕ to the opener, a stack per destination', () => {
    expect(nav.back).toEqual(back);
    expect(() => parseNav(small([page()], { back: { ...back, web: 'close' } }))).toThrow(/web/);
    expect(() => parseNav(small([page()], { back: undefined }))).toThrow(/back/);
  });

  it('makes each destination’s home the bottom of its stack, with nothing to close', () => {
    const homes = nav.pages.filter((p) => nav.destinations.some((d) => d.id === p.id));
    expect(homes.map((p) => p.id)).toEqual(['browse', 'music', 'books', 'podcasts', 'search']);
    for (const p of homes) expect(p.close, p.id).toBe('none');
    expect(() =>
      parseNav(small([page({ id: 'music', route: '/music', params: {}, close: 'opener' })])),
    ).toThrow(/music: a destination's home/);
  });

  it('closes the player’s sheets to the page under them, and every other page to its opener', () => {
    for (const p of nav.pages.filter((p) => p.presentation === 'sheet'))
      expect(p.close, p.id).toBe('sheet');
    expect(nav.pages.filter((p) => p.presentation === 'sheet').map((p) => p.id)).toEqual([
      'nowPlaying',
      'queue',
      'lyrics',
    ]);
    expect(nav.pages.find((p) => p.id === 'album')?.close).toBe('opener');
    expect(() => parseNav(small([page({ close: 'sheet' })]))).toThrow(/album: a sheet/);
    expect(() => parseNav(small([page({ presentation: 'sheet' })]))).toThrow(/album: a sheet/);
  });

  it('[M0.canvas] shows Sign in and Setup bare, before the app is yours: closing to nothing and lighting no destination', () => {
    expect(nav.pages.filter((p) => p.presentation === 'bare').map((p) => p.id)).toEqual([
      'setup',
      'signIn',
    ]);
    const bare = (over: Record<string, unknown>) =>
      page({ presentation: 'bare', lights: null, close: 'none', ...over });
    expect(() => parseNav(small([bare({})]))).not.toThrow();
    expect(() => parseNav(small([bare({ close: 'opener' })]))).toThrow(
      /album: a bare page is the bottom of its stack/,
    );
    expect(() => parseNav(small([bare({ lights: 'music' })]))).toThrow(
      /album: a bare page lights no destination/,
    );
  });

  it('puts Search last on the phone’s bottom bar and first on the desktop rails', () => {
    for (const layout of nav.layouts) {
      if (layout.nav === 'bottomBar')
        expect(layout.order).toEqual(['browse', 'music', 'books', 'podcasts', 'search']);
      else expect(layout.order).toEqual(['search', 'browse', 'music', 'books', 'podcasts']);
    }
    expect(nav.layouts.some((l) => l.nav !== 'bottomBar')).toBe(true);
  });

  it('refuses a layout that leaves out a destination or shows one twice', () => {
    const layouts = (order: string[]) => [{ minWidth: 0, nav: 'bottomBar', order }];
    expect(() => parseNav(small([page()], { layouts: layouts([]) }))).toThrow(/bottomBar from 0/);
    expect(() => parseNav(small([page()], { layouts: layouts(['music', 'music']) }))).toThrow(
      /bottomBar from 0/,
    );
  });

  it('gives each library home and each collection page a local search, and Search the global one', () => {
    const sections = (id: string) =>
      nav.pages.find((p) => p.id === id)!.structure.sections.map((s) => s.name);
    const local = ['music', 'books', 'podcasts', 'shelf', 'album', 'playlist', 'show', 'book'];
    for (const p of nav.pages)
      expect(sections(p.id).includes('Local search'), p.id).toBe(local.includes(p.id));
    expect(sections('search')[0]).toBe('Filters, in the back layer');
  });

  it('lists a book’s other narrations next to its related books', () => {
    const names = nav.pages.find((p) => p.id === 'book')!.structure.sections.map((s) => s.name);
    expect(names.indexOf('Related')).toBe(names.indexOf('Other narrations') + 1);
  });

  it('keeps podcasts out of Requests, since subscribing is instant', () => {
    expect(nav.pages.find((p) => p.id === 'requests')!.structure.links).not.toContain('show');
  });

  it('reaches Downloads from each library home and from Settings', () => {
    const linkers = nav.pages.filter((p) => p.structure.links.includes('downloads'));
    expect(linkers.map((p) => p.id).sort()).toEqual(['books', 'music', 'podcasts', 'settings']);
  });

  it('refuses a Sonora source that is neither a kit screen, a card nor none', () => {
    expect(() => parseNav(small([page({ sources: { sonora: ['album'], spotify: [] } })]))).toThrow(
      /sonora/,
    );
  });

  it('[M0.canvas/f] gives every page a complete structure block whose links name existing pages', () => {
    const ids = new Set(nav.pages.map((p) => p.id));
    for (const { id, structure } of nav.pages) {
      expect(structure.purpose.length, id).toBeGreaterThan(20);
      expect(structure.empty.length, id).toBeGreaterThan(10);
      expect(structure.sections.length, id).toBeGreaterThan(0);
      for (const link of structure.links) expect(ids.has(link), `${id} -> ${link}`).toBe(true);
    }
  });

  it('[M0.canvas/f] refuses a page without a structure block, so no page is drawn without one', () => {
    const { structure: _, ...bare } = page();
    expect(() => parseNav(small([bare]))).toThrow(/structure/);
  });

  it('[M0.canvas/f] refuses a structure block missing its purpose, sections or empty state', () => {
    expect(() => parseNav(small([structured({ purpose: '' })]))).toThrow(/purpose/);
    expect(() => parseNav(small([structured({ sections: [] })]))).toThrow(/sections/);
    expect(() => parseNav(small([structured({ empty: undefined })]))).toThrow(/empty/);
  });

  it('[M0.canvas/f] refuses a link to a page that does not exist, or to the page itself', () => {
    expect(() => parseNav(small([structured({ links: ['artist'] })]))).toThrow(
      /album: links to artist/,
    );
    expect(() => parseNav(small([structured({ links: ['album'] })]))).toThrow(/itself/);
  });

  it('splits a route into its path and its query names', () => {
    expect(splitRoute('/search?q')).toEqual({ path: '/search', query: ['q'] });
    expect(splitRoute('/books/:ref')).toEqual({ path: '/books/:ref', query: [] });
  });
});

describe('the web route table', () => {
  const tiny: Nav = parseNav(
    small([
      page(),
      page({ id: 'search', route: '/search?q', params: {}, title: 'Search' }),
      page({ id: 'downloads', route: '/downloads', params: {}, platforms: ['android'] }),
    ]),
  );
  const out = generateRoutes(tiny, new Set(['album']));

  it('routes each drawn web page to its generated page, and leaves an undrawn one without', () => {
    expect(out).toContain("import Album from '../pages/Album';");
    expect(out).toContain("{ id: 'album', path: '/music/albums/:ref', element: <Album /> }");
    expect(out).toContain("{ id: 'search', path: '/search' }");
  });

  it('leaves out Android-only pages', () => {
    expect(out).not.toContain('downloads');
  });
});

describe('the web layout hook', () => {
  const tiny = parseNav({
    destinations: [],
    layouts: [
      { minWidth: 0, nav: 'bottomBar', order: [] },
      { minWidth: 600, nav: 'iconRail', order: [] },
      { minWidth: 1240, nav: 'labelledRail', order: [], sidePanel: 'nowPlaying' },
    ],
    back,
    pages: [],
  });
  const out = generatePlatform(tiny);

  it('names each layout by its minimum width', () => {
    expect(out).toContain("export type LayoutId = 'w0' | 'w600' | 'w1240';");
  });

  it('reaches each wider layout by its minimum width, starting from the first', () => {
    expect(out).toContain("  ['w600', '(min-width: 600px)'],\n  ['w1240', '(min-width: 1240px)'],");
    expect(out).toContain("  let layout: LayoutId = 'w0';");
  });

  it('draws the widest layout when there is no window', () => {
    expect(out).toContain("return useSyncExternalStore(subscribe, current, () => 'w1240');");
  });
});
