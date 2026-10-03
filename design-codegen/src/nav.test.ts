import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  generateNavMap,
  generatePlatform,
  generateRoutes,
  generateWebShell,
  parseNav,
  readNav,
  splitRoute,
  type Nav,
} from './nav.js';
import { readFileSync } from 'node:fs';
import { graphDestinations } from './nav-kotlin.js';
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

  it("[M0.canvas/a] the Android nav graph's destinations equal nav.json's Android pages", () => {
    const graph = readFileSync(join(REPO_ROOT, OUTPUTS.kotlinNav, 'AuralisNavGraph.kt'), 'utf8');
    const expected = nav.pages.filter((p) => p.platforms.includes('android')).map((p) => p.id);
    expect(expected).toContain('downloads');
    expect(graphDestinations(graph)).toEqual(expected);
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
    expect(() => parseNav(small([bare({ id: 'music', route: '/music', params: {} })]))).toThrow(
      /music: a bare page is no destination/,
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

  it('[M0.canvas/c] holds the player in the side panel from 600 px, drawn open by default from 1240 and from the mini-player below it, over the page below 1024 and beside it from there', () => {
    expect(
      nav.layouts.map((l) => [l.minWidth, l.sidePanel, l.sidePanelOpens, l.sidePanelSits]),
    ).toEqual([
      [0, undefined, undefined, undefined],
      [600, 'nowPlaying', 'fromMiniPlayer', 'over'],
      [1024, 'nowPlaying', 'fromMiniPlayer', 'beside'],
      [1240, 'nowPlaying', 'always', 'beside'],
    ]);
  });

  it('refuses a side panel that does not say when it opens, or saying when with no side panel', () => {
    const band = (over: Record<string, unknown>) => ({
      layouts: [{ minWidth: 0, nav: 'bottomBar', order: ['music'], ...over }],
    });
    const panel = { sidePanel: 'nowPlaying', sidePanelOpens: 'always', sidePanelSits: 'beside' };
    expect(() => parseNav(small([page()], band(panel)))).not.toThrow();
    expect(() =>
      parseNav(small([page()], band({ sidePanel: 'nowPlaying', sidePanelSits: 'beside' }))),
    ).toThrow(/sidePanelOpens/);
    expect(() => parseNav(small([page()], band({ sidePanelOpens: 'always' })))).toThrow(
      /sidePanelOpens/,
    );
    expect(() =>
      parseNav(small([page()], band({ ...panel, sidePanelOpens: 'sometimes' }))),
    ).toThrow();
  });

  it('refuses a side panel that does not say whether it sits over the page or beside it, or saying so with no side panel', () => {
    const band = (over: Record<string, unknown>) => ({
      layouts: [{ minWidth: 0, nav: 'bottomBar', order: ['music'], ...over }],
    });
    expect(() =>
      parseNav(small([page()], band({ sidePanel: 'nowPlaying', sidePanelOpens: 'always' }))),
    ).toThrow(/sidePanelSits/);
    expect(() => parseNav(small([page()], band({ sidePanelSits: 'over' })))).toThrow(
      /sidePanelSits/,
    );
    expect(() =>
      parseNav(
        small(
          [page()],
          band({
            sidePanel: 'nowPlaying',
            sidePanelOpens: 'fromMiniPlayer',
            sidePanelSits: 'under',
          }),
        ),
      ),
    ).toThrow();
  });

  it('refuses a side panel open by default over the page, which would hide every page under its scrim', () => {
    const band = { minWidth: 0, nav: 'bottomBar', order: ['music'] };
    const layouts = [
      { ...band, sidePanel: 'nowPlaying', sidePanelOpens: 'always', sidePanelSits: 'over' },
    ];
    expect(() => parseNav(small([page()], { layouts }))).toThrow(/sidePanelSits/);
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
      page({ id: 'music', route: '/music', params: {}, close: 'none', title: 'Music' }),
      page(),
      page({ id: 'search', route: '/search?q', params: {}, title: 'Search' }),
      page({
        id: 'queue',
        route: '/playing/queue',
        params: {},
        lights: null,
        close: 'sheet',
        presentation: 'sheet',
        title: 'Queue',
      }),
      page({ id: 'downloads', route: '/downloads', params: {}, platforms: ['android'] }),
    ]),
  );
  const out = generateRoutes(tiny, new Set(['music', 'album', 'queue']), 'music');

  it('[M0.canvas/c] holds every page route as a child of the one shell, so the shell stays mounted between pages', () => {
    expect(out).toContain("import { Shell } from './Shell';");
    expect(out).toContain("  {\n    id: 'shell',\n    element: <Shell />,\n    children: [\n");
    const children = out.slice(out.indexOf('children: ['));
    for (const id of ['music', 'album', 'search', 'queue']) {
      expect(children).toContain(`{ id: '${id}', path: `);
    }
    expect(out.match(/element: <Shell \/>/g)).toHaveLength(1);
  });

  it("[M0.canvas/c] routes each drawn web page to its content, handing the shell the page's frame", () => {
    expect(out).toContain("import Album, { frame as AlbumFrame } from '../pages/Album';");
    expect(out).toContain(
      "      { id: 'album', path: '/music/albums/:ref', element: <Album />, handle: { frame: AlbumFrame } },",
    );
    expect(out).toContain("      { id: 'search', path: '/search' },");
  });

  it('[M0.canvas/c] hands the shell a player sheet with the page it is drawn over, where the side panel holds it', () => {
    expect(out).toContain("import Queue from '../pages/Queue';");
    expect(out).toContain(
      "      { id: 'queue', path: '/playing/queue', element: <Queue />, handle: { over: { frame: MusicFrame, Page: Music } } },",
    );
  });

  it('leaves out Android-only pages', () => {
    expect(out).not.toContain('downloads');
  });
});

describe('the one web shell', () => {
  const out = generateWebShell({ now: 'NowPlaying', queue: 'Queue' });

  it('[M0.canvas/c] draws one BackdropShell from the frame the page showing hands it, its content in the front layer', () => {
    expect(out.match(/<BackdropShell\b/g)).toHaveLength(1);
    expect(out).toContain('  const chrome = frame.chrome[layout](go);');
    expect(out).toContain('      rail={chrome.rail}');
    expect(out).toContain('      {Over === undefined ? outlet : <Over />}');
  });

  it('[M0.canvas/c] keeps each location its own scroll, and starts its back layer afresh', () => {
    expect(out).toContain('      scrollKey={where}');
    expect(out).toContain('cloneElement(back, { key: where })');
  });

  it('[M0.canvas/c] draws the back layer and subheader with the density and what leads the heading', () => {
    expect(out).toContain('  const context = { platform, leading: chrome.leading };');
    expect(out).not.toContain('useNavigate');
  });

  it('[M0.canvas/c] draws a player sheet beside the page under it where the panel holds it, and alone elsewhere', () => {
    expect(out).toContain(
      '  const frame = over === undefined ? handle?.frame : PANEL[layout] ? over.frame : undefined;',
    );
    expect(out).toContain('  if (frame === undefined) return outlet;');
    expect(out).toContain(
      '      sheet={held !== undefined ? held : over === undefined ? chrome.sheet : outlet}',
    );
  });

  it('draws the player panel at the tab the desktop mini-player holds, beside the page, which stays', () => {
    expect(out).toContain("import NowPlaying from '../pages/NowPlaying';");
    expect(out).toContain("import Queue from '../pages/Queue';");
    expect(out).toContain(
      'const PANEL_TABS: Record<string, ComponentType> = { now: NowPlaying, queue: Queue };',
    );
    expect(out).toContain(
      "  const Held = over === undefined && platform === 'desktop' ? panelTab(go.panel(), chrome.sheet) : undefined;",
    );
    expect(out).toContain('<InPanel.Provider value={true}>');
    expect(out).toContain(
      '      sheetOpen={held !== undefined || (over === undefined ? chrome.sheetOpen : true)}',
    );
  });

  it('[M0.canvas/c] opens the panel over the page, as a modal side sheet whose scrim closes it, where the layout says it sits over the page', () => {
    expect(out).toContain(
      "import { PANEL, PANEL_OVER, PLATFORM, useLayout, type PageFrame } from './platform';",
    );
    expect(out).toContain("      sheetLayer={PANEL_OVER[layout] ? 'over' : 'front'}");
    expect(out).toContain('      onSheetDismiss={go.closePanel}');
  });
});

describe("the web's navigation map, for its stacks", () => {
  const tiny: Nav = parseNav(
    small([
      page({ id: 'music', route: '/music', params: {}, close: 'none', title: 'Music' }),
      page(),
      page({ id: 'settings', route: '/settings', params: {}, lights: null, title: 'Settings' }),
      page({
        id: 'queue',
        route: '/playing/queue',
        params: {},
        lights: null,
        close: 'sheet',
        presentation: 'sheet',
        title: 'Queue',
      }),
      page({ id: 'downloads', route: '/downloads', params: {}, platforms: ['android'] }),
    ]),
  );
  const out = generateNavMap(tiny, ['settings']);

  it("[M0.canvas] gives each destination's home, the rail's foot and each player tab's sheet", () => {
    expect(out).toContain('  homes: {\n    "music": "/music"\n  },');
    expect(out).toContain('  foot: {\n    "settings": "/settings"\n  },');
    expect(out).toContain('  tabs: {\n    "queue": "/playing/queue"\n  },');
  });

  it('[M0.canvas] gives each web page its path, what it lights and whether it is a sheet', () => {
    expect(out).toContain("    { path: '/music/albums/:ref', lights: 'music', sheet: false },");
    expect(out).toContain("    { path: '/playing/queue', lights: null, sheet: true },");
    expect(out).not.toContain('downloads');
  });
});

describe('the web layout hook', () => {
  const tiny = parseNav({
    destinations: [],
    layouts: [
      { minWidth: 0, nav: 'bottomBar', order: [] },
      { minWidth: 600, nav: 'iconRail', order: [] },
      {
        minWidth: 1024,
        nav: 'labelledRail',
        order: [],
        sidePanel: 'nowPlaying',
        sidePanelOpens: 'fromMiniPlayer',
        sidePanelSits: 'over',
      },
      {
        minWidth: 1240,
        nav: 'labelledRail',
        order: [],
        sidePanel: 'nowPlaying',
        sidePanelOpens: 'always',
        sidePanelSits: 'beside',
      },
    ],
    back,
    pages: [],
  });
  const out = generatePlatform(tiny);

  it('names each layout by its minimum width', () => {
    expect(out).toContain("export type LayoutId = 'w0' | 'w600' | 'w1024' | 'w1240';");
  });

  it('reaches each wider layout by its minimum width, starting from the first', () => {
    expect(out).toContain(
      "  ['w600', '(min-width: 600px)'],\n  ['w1024', '(min-width: 1024px)'],\n  ['w1240', '(min-width: 1240px)'],",
    );
    expect(out).toContain("  let layout: LayoutId = 'w0';");
  });

  it("[M0.canvas/c] gives each layout's platform, whether its side panel holds the player, and whether that panel sits over the page", () => {
    expect(out).toContain(
      "export const PLATFORM: Record<LayoutId, Platform> = {\n  w0: 'mobile',\n  w600: 'desktop',\n  w1024: 'desktop',\n  w1240: 'desktop',\n};",
    );
    expect(out).toContain(
      'export const PANEL: Record<LayoutId, boolean> = {\n  w0: false,\n  w600: false,\n  w1024: true,\n  w1240: true,\n};',
    );
    expect(out).toContain(
      'export const PANEL_OVER: Record<LayoutId, boolean> = {\n  w0: false,\n  w600: false,\n  w1024: true,\n  w1240: false,\n};',
    );
    expect(out).not.toContain('PANEL_OPEN');
  });

  it('[M0.canvas/c] describes what a page hands the shell: its parts at each layout, its back layer and subheader', () => {
    expect(out).toContain('export interface PageFrame<Data> {');
    expect(out).toContain('  chrome: Record<LayoutId, (go: ShellNav) => Chrome>;');
    expect(out).toContain('  back(data: Data, context: FrameContext): ReactNode;');
    expect(out).toContain('  subheader?(data: Data, context: FrameContext): ReactNode;');
  });

  it('[M0.canvas/c] gives a back layer and subheader only what they draw with: the density and what leads the heading', () => {
    expect(out).toContain(
      'export interface FrameContext {\n  platform: Platform;\n  leading?: ReactNode;\n}',
    );
    expect(out).not.toContain('NavigateFunction');
  });

  it("[M0.canvas/c] leaves a layout's density to PLATFORM, not to each page's parts", () => {
    const chrome = out.slice(out.indexOf('export interface Chrome {'));
    expect(chrome.slice(0, chrome.indexOf('}'))).not.toContain('platform');
  });

  it('draws the layout given, or else the widest when there is no window', () => {
    expect(out).toContain(
      "const detected = useSyncExternalStore<LayoutId>(subscribe, current, () => 'w1240');",
    );
    expect(out).toContain('  return given ?? detected;');
  });
});
