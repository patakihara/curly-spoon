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

const small = (pages: unknown[]): unknown => ({
  destinations: [{ id: 'music', label: 'Music', icon: 'album' }],
  layouts: [{ minWidth: 0, nav: 'bottomBar' }],
  pages,
});
const page = (over: Record<string, unknown> = {}) => ({
  id: 'album',
  route: '/music/albums/:ref',
  params: { ref: 'ItemRef' },
  lights: 'music',
  back: 'history',
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
  it('[M0.canvas/a] the generated web route table lists exactly the web pages of nav.json, with their paths', async () => {
    const routes = join(REPO_ROOT, OUTPUTS.webNav, 'routes.tsx');
    const mod = (await import(pathToFileURL(routes).href)) as {
      pages: { id: string; path: string }[];
    };
    const expected = nav.pages
      .filter((p) => p.platforms.includes('web'))
      .map((p) => ({ id: p.id, path: splitRoute(p.route).path }));
    expect(mod.pages.map((p) => ({ id: p.id, path: p.path }))).toEqual(expected);
  });

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

  it('refuses two pages with one id', () => {
    expect(() => parseNav(small([page(), page()]))).toThrow(/album.*twice/);
  });

  it("refuses a route whose parameters differ from the page's params", () => {
    expect(() => parseNav(small([page({ params: {} })]))).toThrow(/album.*ref/);
  });

  it('refuses going up to a page that does not exist', () => {
    expect(() => parseNav(small([page({ back: 'up:music' })]))).toThrow(/album.*music/);
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

describe('the web platform hook', () => {
  it('draws at phone density while the layout is the bottom bar, below the first rail width', () => {
    const tiny = parseNav({
      destinations: [],
      layouts: [
        { minWidth: 0, nav: 'bottomBar' },
        { minWidth: 600, nav: 'iconRail' },
      ],
      pages: [],
    });
    expect(generatePlatform(tiny)).toContain("const PHONE = '(max-width: 599px)';");
  });
});
