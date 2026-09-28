import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateRoutes, parseNav, readNav, splitRoute, type Nav } from './nav.js';
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
  ...over,
});

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
