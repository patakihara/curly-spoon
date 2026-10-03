import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { App } from './app.js';
import {
  ART_DIR,
  CANVAS_BOARDS,
  CANVAS_CREATED_AT,
  DS_FOLDER,
  canvasArt,
  generateCanvas,
  type SonoraInstall,
} from './canvas.js';
import { parseNav } from './nav.js';
import { parsePage } from './page.js';

const page = (id: string, route: string, title: string, links: string[] = []) => ({
  id,
  route,
  lights: null,
  close: 'opener',
  presentation: 'screen',
  title,
  sources: { sonora: ['none'], spotify: [] },
  structure: {
    purpose: `What ${title} is for.`,
    sections: [{ name: 'Body', holds: `${title}'s content.` }],
    empty: 'Says so.',
    links,
  },
});

const nav = parseNav({
  destinations: [{ id: 'books', label: 'Books', icon: 'book_2' }],
  layouts: [
    { minWidth: 0, nav: 'bottomBar', order: ['books'] },
    {
      minWidth: 1240,
      nav: 'labelledRail',
      order: ['books'],
      sidePanel: 'nowPlaying',
      sidePanelOpens: 'always',
      sidePanelSits: 'beside',
    },
  ],
  back: { close: 'opener', stacks: 'perDestination', android: 'close', web: 'previousView' },
  pages: [
    page('book', '/book', 'Book', ['settings']),
    page('settings', '/settings', 'Settings', ['search']),
    page('search', '/search', 'Search'),
  ],
});

const book = `export default function Book({ data }) {
  return (
    <BackdropShell back={<BackLayer controls={<ButtonGroup items={data.filters} />} />}>
    <DetailPage kindLabel="Book & more" overlay count={2}>
      <MediaHeader title={data.title} />
      <Each of={data.chapters} as="chapter">
        <EpisodeRow title={chapter.title}>{chapter.title}</EpisodeRow>
      </Each>
      <When state="full"><Button>Play "it" & go</Button></When>
    </DetailPage>
    </BackdropShell>
  );
}
`;
const settings = `export default function Settings({ data }) {
  return <PageBody><Switch checked /></PageBody>;
}
`;

const app: App = {
  nav,
  shell: {
    account: { label: 'Account' },
    playing: {
      title: 'Tidal Lines',
      artist: 'Halcyon Bloom',
      variant: 'music',
      favourite: false,
      progress: 0.5,
      duration: 214,
      sleep: 'Off',
    },
    railFoot: [{ page: 'settings', icon: 'settings' }],
  },
  pages: [
    {
      id: 'book',
      tree: parsePage(book, 'book'),
      placeholder: {
        title: 'Wind </script> Truth',
        chapters: [{ title: 'Prologue' }],
        filters: ['All', 'Books'],
      },
    },
    { id: 'settings', tree: parsePage(settings, 'settings'), placeholder: {} },
  ],
  components: {
    platformed: new Set(['MediaHeader', 'BackLayer', 'BackdropShell', 'MiniPlayer']),
  },
  menus: new Set(['OverflowMenu']),
  now: [],
};

const install: SonoraInstall = {
  title: 'Sonora',
  artifact: 'https://claude.ai/artifact/sonora-id',
  version: '1790600000-abcd',
};
const now = new Date('2026-09-28T12:00:00.000Z');
const files = generateCanvas(app, install, now);
const index = JSON.parse(files.get('canvas.json') ?? '{}');
const board = (name: string) => files.get(name) ?? '';

describe('the canvas generated from design/app', () => {
  it('[M0.canvas/f] puts the flowchart and the screen list alone on the start page', () => {
    expect(index.pages[0]).toEqual({ id: 'start', name: 'Screen map' });
    expect(index.launch).toEqual({ view: 'canvas', page: 'start' });
    const onStart = Object.keys(index.boards).filter((n) => index.boards[n].page === 'start');
    expect(onStart).toEqual(['flows.dc.html', 'screens.dc.html']);
    expect(index.order.slice(0, 2)).toEqual(['flows.dc.html', 'screens.dc.html']);
    const flows = index.boards['flows.dc.html'];
    expect(flows).toMatchObject({ x: 0, y: 0, title: 'Flows' });
    expect(index.boards['screens.dc.html']).toMatchObject({
      x: flows.w + 80,
      y: 0,
      title: 'Screens',
    });
    for (const p of nav.pages)
      expect(board('screens.dc.html')).toContain(`href="${p.id}.structure.dc.html"`);
    expect(files.has('structure.dc.html')).toBe(false);
  });

  it('[M0.canvas/f] gives every page of nav.json a canvas page of its own, holding its structure and artboards', () => {
    expect(index.pages.map((p: { id: string }) => p.id)).toEqual([
      'start',
      ...nav.pages.map((p) => p.id),
    ]);
    expect(index.pages.map((p: { name: string }) => p.name)).toEqual([
      'Screen map',
      'Book',
      'Settings',
      'Search',
    ]);
    for (const [name, b] of Object.entries(index.boards) as [string, { page?: string }][]) {
      expect(b.page, name).toBeDefined();
      const id = name.split('.')[0]!;
      if (nav.pages.some((p) => p.id === id)) expect(b.page, name).toBe(id);
    }
    const on = (id: string) => Object.keys(index.boards).filter((n) => index.boards[n].page === id);
    expect(on('book')).toEqual([
      'book.structure.dc.html',
      'book.phone.dc.html',
      'book.desktop.dc.html',
    ]);
    expect(on('settings')).toEqual([
      'settings.structure.dc.html',
      'settings.phone.dc.html',
      'settings.desktop.dc.html',
    ]);
    expect(on('search')).toEqual(['search.structure.dc.html']);
    expect(index.order).toEqual([
      'flows.dc.html',
      'screens.dc.html',
      ...on('book'),
      ...on('settings'),
      ...on('search'),
    ]);
    expect(index.notes).toEqual({
      'start-title': expect.objectContaining({ page: 'start', text: 'Screen map', kind: 'title1' }),
      'book-title': expect.objectContaining({ page: 'book', text: 'Book', kind: 'title1' }),
      'settings-title': expect.objectContaining({ page: 'settings', text: 'Settings' }),
      'search-title': expect.objectContaining({ page: 'search', text: 'Search' }),
    });
  });

  it('[M0.canvas/f] links each page’s structure to the start page and to the pages it leads to', () => {
    const structure = board('book.structure.dc.html');
    expect(structure).toContain('href="screens.dc.html"');
    expect(structure).toContain('href="settings.structure.dc.html"');
    expect(board('settings.structure.dc.html')).toContain('href="search.structure.dc.html"');
    for (const [name, html] of files) {
      for (const [, target] of html.matchAll(/href="([^"]+\.dc\.html)"/g))
        expect(Object.keys(index.boards), `${name} links to ${target}`).toContain(target);
    }
  });

  it('[M0.canvas/f] gives the boards whose links work a Play button: the flowchart, the screen list and every structure board', () => {
    const playable = Object.keys(index.boards).filter((n) => index.boards[n].is_interactive);
    expect(playable).toEqual([
      'flows.dc.html',
      'screens.dc.html',
      'book.structure.dc.html',
      'settings.structure.dc.html',
      'search.structure.dc.html',
    ]);
    for (const name of playable) expect(index.boards[name].is_interactive, name).toBe(true);
    for (const name of ['book.phone.dc.html', 'book.desktop.dc.html', 'settings.phone.dc.html'])
      expect(index.boards[name], name).not.toHaveProperty('is_interactive');
  });

  it('lays each canvas page out in a row from 0,0, its structure first, under its title note', () => {
    const { phone, desktop } = CANVAS_BOARDS;
    const structure = index.boards['book.structure.dc.html'];
    expect(structure).toMatchObject({ x: 0, y: 0, title: 'Book · structure' });
    expect(index.boards['book.phone.dc.html']).toEqual({
      x: structure.w + 80,
      y: 0,
      w: phone.width,
      h: phone.height,
      title: 'Book · phone',
      page: 'book',
    });
    expect(index.boards['book.desktop.dc.html']).toMatchObject({
      x: structure.w + 80 + phone.width + 80,
      y: 0,
      w: desktop.width,
      h: desktop.height,
    });
    expect(index.boards['settings.phone.dc.html']).toMatchObject({
      x: index.boards['settings.structure.dc.html'].w + 80,
      y: 0,
    });
    expect(index.notes['book-title']).toEqual({
      x: 0,
      y: -300,
      text: 'Book',
      kind: 'title1',
      maxW: structure.w + 80 + phone.width + 80 + desktop.width,
      page: 'book',
    });
    for (const name of ['flows.dc.html', 'screens.dc.html', 'book.structure.dc.html']) {
      const { w, h } = index.boards[name];
      expect(board(name)).toContain(`<div data-theme="dark" style="width: ${w}px; height: ${h}px;`);
      expect(board(name)).toContain(`{"$preview":{"width":${w},"height":${h}}}`);
      expect(board(name)).toContain(`<link rel="stylesheet" href="ds/${DS_FOLDER}/tokens.css">`);
      expect(board(name)).not.toContain('x-import');
    }
  });

  it('refuses more canvas pages than the Design type holds', () => {
    const many = parseNav({
      ...nav,
      pages: Array.from({ length: 40 }, (_, i) => page(`p${i}`, `/p${i}`, `P${i}`)),
    });
    expect(() => generateCanvas({ ...app, nav: many, pages: [] }, install, now)).toThrow(/40/);
  });

  it("keeps the artifact's creation date and records the Sonora publish it installs", () => {
    expect(index).toMatchObject({
      v: 3,
      title: 'Auralis',
      createdOnFiles: { v: 1, at: CANVAS_CREATED_AT },
      launch: { view: 'canvas', page: 'start' },
      designSystems: [
        {
          title: 'Sonora',
          namespace: DS_FOLDER,
          artifact: install.artifact,
          version: install.version,
          copiedAt: now.toISOString(),
        },
      ],
    });
  });

  it('points every artboard at the art it ships beside itself, by relative path', () => {
    const [first, ...rest] = app.pages;
    const withArt: App = {
      ...app,
      shell: { ...app.shell, playing: { ...app.shell.playing!, image: '/art/tidal-lines.jpg' } },
      pages: [
        { ...first!, placeholder: { ...first!.placeholder, cover: '/art/wind-and-truth.jpg' } },
        ...rest,
      ],
    };
    const html = generateCanvas(withArt, install, now).get('book.phone.dc.html') ?? '';
    expect(html).toContain('"cover":"art/wind-and-truth.jpg"');
    expect(html).toContain('"image":"art/tidal-lines.jpg"');
    expect(html).not.toContain('"/art/');
    expect(canvasArt(withArt)).toEqual(['tidal-lines.jpg', 'wind-and-truth.jpg']);
    expect(canvasArt(app)).toEqual([]);
  });

  it('loads the installed Sonora copy right after the support line', () => {
    const head = board('book.phone.dc.html').split('</head>')[0] ?? '';
    expect(head).toContain(
      [
        '<script src="./support.js"></script>',
        `<link rel="stylesheet" href="ds/${DS_FOLDER}/tokens.css">`,
        `<link rel="stylesheet" href="ds/${DS_FOLDER}/components/bundle.css">`,
        `<script src="ds/${DS_FOLDER}/components/bundle.js"></script>`,
      ].join('\n'),
    );
  });

  it('mounts real Sonora components, never markup of its own, with kebab-case props', () => {
    const html = board('book.phone.dc.html');
    expect(html).toContain(
      '<x-import component-from-global-scope="SonoraDesignSystem_6c1435.DetailPage" kind-label="Book &amp; more" overlay="{{ true }}" count="{{ 2 }}">',
    );
    expect(html).toContain(
      '<x-import component-from-global-scope="SonoraDesignSystem_6c1435.MediaHeader" title="{{data.title}}" platform="mobile"></x-import>',
    );
    expect(board('book.desktop.dc.html')).toContain('platform="desktop"');
  });

  it('repeats Each with sc-for, draws When for the full state, and escapes text', () => {
    const html = board('book.phone.dc.html');
    expect(html).toContain(
      '<sc-for list="{{data.chapters}}" as="chapter" hint-placeholder-count="1">',
    );
    expect(html).toContain('title="{{chapter.title}}">{{chapter.title}}</x-import>');
    expect(html).toContain('<sc-if value="{{when.full}}" hint-placeholder-val="{{ true }}">');
    expect(html).toContain('>Play "it" &amp; go</x-import>');
  });

  it('holds the placeholder as the data, safe inside its script', () => {
    const html = board('book.phone.dc.html');
    expect(html).toContain('data-props=\'{"$preview":{"width":390,"height":844}}\'');
    expect(html).toContain('"title":"Wind <\\/script> Truth"');
    expect(html).toContain('when: {"full":true}');
    expect(html).toContain('class Component extends DCLogic');
  });

  it('gives each artboard a fixed-size root equal to its frame', () => {
    expect(board('settings.desktop.dc.html')).toContain(
      '<div data-theme="dark" style="width: 1440px; height: 900px;',
    );
    expect(board('settings.desktop.dc.html')).toContain('<title>Settings · desktop</title>');
  });
  it('draws each page inside the app shell at the layout its width gets', () => {
    const phone = board('book.phone.dc.html');
    expect(phone).toContain(
      `<x-import component-from-global-scope="SonoraDesignSystem_6c1435.BackdropShell" back="{{slots.s0}}" player="{{slots.s1}}" sheet-open="{{ false }}" app-bar="{{ true }}" platform="mobile">`,
    );
    expect(phone).not.toContain('rail=');
    const desktop = board('book.desktop.dc.html');
    expect(desktop).toContain('rail="{{slots.s0}}"');
    expect(desktop).toContain('sheet-open="{{ true }}" app-bar="{{ false }}" platform="desktop">');
    expect(phone).toContain('overflow: hidden');
  });

  it('builds the elements given to props in renderVals, from the same Sonora components', () => {
    const script = board('book.phone.dc.html').split('data-dc-script')[1]!;
    const body = script.slice(
      script.indexOf('renderVals() {') + 'renderVals() {'.length,
      script.lastIndexOf('}\n}'),
    );
    type Node = { c: unknown; p: Record<string, unknown>; k: unknown[] };
    const window = {
      React: {
        Fragment: 'Fragment',
        createElement: (c: unknown, p: Record<string, unknown>, ...k: unknown[]): Node => ({
          c,
          p,
          k,
        }),
      },
      SonoraDesignSystem_6c1435: Object.fromEntries(
        ['BackLayer', 'ButtonGroup', 'BottomNav', 'MiniPlayer', 'AccountButton', 'IconButton'].map(
          (n) => [n, n],
        ),
      ),
    };
    const vals = new Function('window', body)(window) as { slots: Record<string, Node> };
    const back = vals.slots.s0!;
    expect(back.c).toBe('BackLayer');
    expect(back.p).toMatchObject({ title: 'Book', platform: 'mobile' });
    expect((back.p.leading as Node).c).toBe('IconButton');
    expect((back.p.controls as Node).p.items).toEqual(['All', 'Books']);
    const player = vals.slots.s1!;
    expect(player.c).toBe('Fragment');
    expect((player.k as Node[]).map((n) => n.c)).toEqual(['MiniPlayer', 'BottomNav']);
    expect((player.k[0] as Node).p).toMatchObject({ title: 'Tidal Lines', platform: 'mobile' });
    expect((player.k[1] as Node).p.items).toEqual([
      { key: 'books', label: 'Books', icon: 'book_2' },
    ]);
  });
});

describe('an element given to a prop inside Each', () => {
  const search = `export default function Search({ data }) {
  return (
    <PageBody>
      <Each of={data.requests} as="request">
        <ResultRow title={request.title} trailing={<Button>{request.action}</Button>} />
        <Each of={request.candidates} as="candidate">
          <ResultRow title={candidate.title} trailing={<Button size="sm">Choose</Button>} />
        </Each>
      </Each>
      <Each of={data.plain} as="row">
        <ResultRow title={row.title} />
      </Each>
    </PageBody>
  );
}
`;
  const listed: App = {
    ...app,
    pages: [
      {
        id: 'search',
        tree: parsePage(search, 'search'),
        placeholder: {
          requests: [
            {
              title: 'Paper Lanterns',
              action: 'Cancel',
              candidates: [{ title: 'FLAC' }, { title: 'MP3' }],
            },
            { title: 'Ink Heart', action: 'Retry', candidates: [] },
          ],
          plain: [{ title: 'Salt' }],
        },
      },
    ],
  };
  const html = generateCanvas(listed, install, now).get('search.phone.dc.html') ?? '';

  it("[M0.canvas] reads each item's own copy of the element, from lists renderVals builds", () => {
    expect(html).toContain('<sc-for list="{{lists.l0}}" as="request" hint-placeholder-count="2">');
    expect(html).toMatch(/title="\{\{request\.title\}\}" trailing="\{\{request\.\$s\d+\}\}"/);
    expect(html).toContain(
      '<sc-for list="{{request.$l1}}" as="candidate" hint-placeholder-count="1">',
    );
    expect(html).toMatch(/title="\{\{candidate\.title\}\}" trailing="\{\{candidate\.\$s\d+\}\}"/);
    // A list holding no element given to a prop is walked as it is.
    expect(html).toContain('<sc-for list="{{data.plain}}" as="row" hint-placeholder-count="1">');
  });

  it('[M0.canvas] builds the element for each item, from that item', () => {
    const script = html.split('data-dc-script')[1]!;
    const body = script.slice(
      script.indexOf('renderVals() {') + 'renderVals() {'.length,
      script.lastIndexOf('}\n}'),
    );
    type Node = { c: unknown; p: Record<string, unknown>; k: unknown[] };
    const window = {
      React: {
        Fragment: 'Fragment',
        createElement: (c: unknown, p: Record<string, unknown>, ...k: unknown[]): Node => ({
          c,
          p,
          k,
        }),
      },
      SonoraDesignSystem_6c1435: Object.fromEntries(
        ['BackLayer', 'BottomNav', 'MiniPlayer', 'AccountButton', 'IconButton', 'Button'].map(
          (n) => [n, n],
        ),
      ),
    };
    type Item = Record<string, unknown> & { title: string };
    const vals = new Function('window', body)(window) as { lists: Record<string, Item[]> };
    const slot = (item: Item) =>
      Object.entries(item).find(([k]) => /^\$s\d+$/.test(k))?.[1] as Node;
    const requests = vals.lists.l0!;
    expect(requests.map((r) => r.title)).toEqual(['Paper Lanterns', 'Ink Heart']);
    expect(requests.map((r) => slot(r).k)).toEqual([['Cancel'], ['Retry']]);
    const candidates = requests.map((r) => (r.$l1 as Item[]).map((c) => c.title));
    expect(candidates).toEqual([['FLAC', 'MP3'], []]);
    const choose = slot((requests[0]!.$l1 as Item[])[0]!);
    expect([choose.c, choose.p.size, choose.k]).toEqual(['Button', 'sm', ['Choose']]);
  });
});

describe('a player sheet at a width whose panel opens from the mini-player', () => {
  const panelled: App = {
    ...app,
    nav: parseNav({
      ...nav,
      layouts: [
        { minWidth: 0, nav: 'bottomBar', order: ['books'] },
        {
          minWidth: 1024,
          nav: 'labelledRail',
          order: ['books'],
          sidePanel: 'nowPlaying',
          sidePanelOpens: 'fromMiniPlayer',
          sidePanelSits: 'beside',
        },
      ],
      pages: [
        ...nav.pages,
        {
          ...page('nowPlaying', '/playing', 'Now Playing'),
          close: 'sheet',
          presentation: 'sheet',
        },
      ],
    }),
    shell: { ...app.shell, sheetOver: 'book' },
    pages: [
      ...app.pages,
      {
        id: 'nowPlaying',
        tree: parsePage(
          'export default function NowPlaying() {\n  return <NowPlayingPage title={shell.playing.title} />;\n}\n',
          'nowPlaying',
        ),
        placeholder: {},
      },
    ],
  };
  const drawn = generateCanvas(panelled, install, now);
  const at = (name: string) => drawn.get(name) ?? '';

  it('[M0.canvas/c] draws it as the side panel, open on its tab, over the page it is drawn over', () => {
    const desktop = at('nowPlaying.desktop.dc.html');
    expect(desktop).toContain('SonoraDesignSystem_6c1435.BackdropShell');
    expect(desktop).toContain('sheet-open="{{ true }}" app-bar="{{ false }}" platform="desktop">');
    expect(desktop).toMatch(
      /"component":"NowPlaying"[^\]]*"tab":\{"kind":"literal","value":"now"\}/,
    );
    expect(desktop).toContain('const scope = { data, shell, sheet };');
  });

  it('[M0.canvas/c] leaves the panel closed on every other page there, the mini-player opening it', () => {
    const desktop = at('book.desktop.dc.html');
    expect(desktop).toContain('sheet-open="{{ false }}" app-bar="{{ false }}" platform="desktop">');
    expect(desktop).not.toContain('"component":"NowPlaying"');
  });
});

describe('a player sheet, on the canvas, where the mini-player opens its panel below 1240 px', () => {
  const layouts = [
    { minWidth: 0, nav: 'bottomBar', order: ['books'] },
    {
      minWidth: 1024,
      nav: 'iconRail',
      order: ['books'],
      sidePanel: 'nowPlaying',
      sidePanelOpens: 'fromMiniPlayer',
      sidePanelSits: 'beside',
    },
    {
      minWidth: 1240,
      nav: 'labelledRail',
      order: ['books'],
      sidePanel: 'nowPlaying',
      sidePanelOpens: 'always',
      sidePanelSits: 'beside',
    },
  ];
  const drawn: App = {
    ...app,
    nav: parseNav({
      ...nav,
      layouts,
      pages: [
        ...nav.pages,
        {
          ...page('nowPlaying', '/playing', 'Now Playing'),
          close: 'sheet',
          presentation: 'sheet',
        },
      ],
    }),
    shell: { ...app.shell, sheetOver: 'book' },
    pages: [
      ...app.pages,
      {
        id: 'nowPlaying',
        tree: parsePage(
          'export default function NowPlaying() {\n  return <NowPlayingPage title={shell.playing.title} />;\n}\n',
          'nowPlaying',
        ),
        placeholder: {},
      },
    ],
  };
  const out = generateCanvas(drawn, install, now);
  const index = JSON.parse(out.get('canvas.json') ?? '{}');
  const on = (id: string) => index.order.filter((n: string) => index.boards[n].page === id);

  it('[M0.canvas/c] adds a 1024 px artboard after its desktop one, the panel open on its tab beside the page under it', () => {
    const { phone, desktop, tablet } = CANVAS_BOARDS;
    expect(tablet.width).toBe(1024);
    expect(on('nowPlaying')).toEqual([
      'nowPlaying.structure.dc.html',
      'nowPlaying.phone.dc.html',
      'nowPlaying.desktop.dc.html',
      'nowPlaying.tablet.dc.html',
    ]);
    expect(index.boards['nowPlaying.tablet.dc.html']).toMatchObject({
      x:
        index.boards['nowPlaying.structure.dc.html'].w + 80 + phone.width + 80 + desktop.width + 80,
      y: 0,
      w: tablet.width,
      h: tablet.height,
      title: 'Now Playing · 1024 px, panel open',
      page: 'nowPlaying',
    });
    const html = out.get('nowPlaying.tablet.dc.html') ?? '';
    expect(html).toContain('<title>Now Playing · 1024 px</title>');
    expect(html).toContain(
      `<div data-theme="dark" style="width: 1024px; height: ${tablet.height}px;`,
    );
    expect(html).toContain('SonoraDesignSystem_6c1435.BackdropShell');
    expect(html).toContain('sheet-open="{{ true }}" app-bar="{{ false }}" platform="desktop">');
    expect(html).toMatch(/"component":"NowPlaying"[^\]]*"tab":\{"kind":"literal","value":"now"\}/);
    expect(html).toContain('const scope = { data, shell, sheet };');
  });

  it('[M0.canvas/c] draws no 1024 px artboard for a page that is not a player sheet', () => {
    expect(on('book')).toEqual([
      'book.structure.dc.html',
      'book.phone.dc.html',
      'book.desktop.dc.html',
    ]);
  });
});

describe('a page opening another, on the canvas', () => {
  const opening = `export default function Search({ data }) {
  return (
    <PageBody>
      <Each of={data.rows} as="row">
        <ResultRow title={row.title} onClick={<Open page="book" ref={row.ref} />} trailing={<Button>Go</Button>} />
        <MediaCard title={row.title} onRequest={<Request ref={row.ref} />} />
      </Each>
    </PageBody>
  );
}
`;
  const linked: App = {
    ...app,
    pages: [
      {
        id: 'search',
        tree: parsePage(opening, 'search'),
        placeholder: { rows: [{ title: 'Ink Heart', ref: 'ink-heart' }] },
      },
    ],
  };
  const html = generateCanvas(linked, install, now).get('search.phone.dc.html') ?? '';

  it('[M0.canvas] gives an Open or a Request a handler that goes nowhere, since an artboard is a still', () => {
    expect(html).toMatch(/title="\{\{row\.title\}\}" on-click="\{\{navigate\}\}"/);
    expect(html).toContain('const navigate = () => {};');
    expect(html).toMatch(/title="\{\{row\.title\}\}" on-request="\{\{navigate\}\}"/);
    expect(html).toMatch(
      /return \{ data, shell, slots, lists, when: \{"full":true\}, navigate \};/,
    );
  });
});

describe('a page starting sign-in, on the canvas', () => {
  const html =
    generateCanvas(
      {
        ...app,
        pages: [
          {
            id: 'search',
            tree: parsePage(
              `export default function Search() {
  return <PageBody><Button onClick={<SignIn />}>Sign in</Button></PageBody>;
}
`,
              'search',
            ),
            placeholder: {},
          },
        ],
      },
      install,
      now,
    ).get('search.phone.dc.html') ?? '';

  it('draws a plain button that goes nowhere, since an artboard is a still', () => {
    expect(html).toMatch(/on-click="\{\{navigate\}\}"/);
    expect(html).toContain('const navigate = () => {};');
    expect(html).not.toContain('auth/login');
  });
});

describe('a page with a local search, on the canvas', () => {
  const searchable = `export default function Book({ data }) {
  return (
    <BackdropShell back={<BackLayer search="Search this book's chapters" />}>
      <PageBody>
        <MediaHeader title={data.title} />
      </PageBody>
    </BackdropShell>
  );
}
`;
  const drawn: App = {
    ...app,
    pages: [
      { id: 'book', tree: parsePage(searchable, 'book'), placeholder: { title: 'Wind and Truth' } },
      app.pages[1]!,
    ],
  };
  const out = generateCanvas(drawn, install, now);
  const order = JSON.parse(out.get('canvas.json') ?? '{}');
  const searchOut = '"searchOpen":{"kind":"literal","value":true}';

  it('[M0.canvas] shows it out on a third artboard, a phone, after the page’s desktop one', () => {
    const { phone, desktop } = CANVAS_BOARDS;
    expect(order.order.filter((n: string) => order.boards[n].page === 'book')).toEqual([
      'book.structure.dc.html',
      'book.phone.dc.html',
      'book.desktop.dc.html',
      'book.phone-search.dc.html',
    ]);
    expect(order.boards['book.phone-search.dc.html']).toMatchObject({
      x: order.boards['book.structure.dc.html'].w + 80 + phone.width + 80 + desktop.width + 80,
      y: 0,
      page: 'book',
      w: phone.width,
      h: phone.height,
      title: 'Book · phone, searching',
    });
  });

  it('[M0.canvas] fixes the search out on that artboard alone, leaving the page as the apps draw it', () => {
    expect(out.get('book.phone-search.dc.html')).toContain(searchOut);
    expect(out.get('book.phone.dc.html')).not.toContain('searchOpen');
    expect(out.get('book.desktop.dc.html')).not.toContain('searchOpen');
  });
});

describe('a page with a menu, on the canvas', () => {
  const withMenu = `export default function Book({ data }) {
  return (
    <BackdropShell>
      <PageBody>
        <MediaHeader title={data.title} menu={<OverflowMenu items={data.menu} />} />
        <Each of={data.chapters} as="chapter">
          <ResultRow title={chapter.title} trailing={<OverflowMenu items={chapter.menu} />} />
        </Each>
      </PageBody>
    </BackdropShell>
  );
}
`;
  const drawn: App = {
    ...app,
    pages: [
      {
        id: 'book',
        tree: parsePage(withMenu, 'book'),
        placeholder: {
          title: 'Wind and Truth',
          menu: [{ key: 'a', label: 'Add to library' }],
          chapters: [{ title: 'Prologue', menu: [{ key: 'b', label: 'Add to playlist' }] }],
        },
      },
      app.pages[1]!,
    ],
  };
  const out = generateCanvas(drawn, install, now);
  const order = JSON.parse(out.get('canvas.json') ?? '{}');

  it('[M0.canvas] shows its first menu open on a third artboard, a phone, after the page’s desktop one', () => {
    const { phone, desktop } = CANVAS_BOARDS;
    expect(order.order.filter((n: string) => order.boards[n].page === 'book')).toEqual([
      'book.structure.dc.html',
      'book.phone.dc.html',
      'book.desktop.dc.html',
      'book.phone-menu.dc.html',
    ]);
    expect(order.boards['book.phone-menu.dc.html']).toMatchObject({
      x: order.boards['book.structure.dc.html'].w + 80 + phone.width + 80 + desktop.width + 80,
      y: 0,
      page: 'book',
      w: phone.width,
      h: phone.height,
      title: 'Book · phone, menu open',
    });
  });

  it('[M0.canvas] opens that one menu on that artboard alone, leaving the page as the apps draw it, every menu closed', () => {
    /** Each OverflowMenu the artboard draws, by what its items bind, and whether it is open. */
    const menus = (html: string) =>
      [
        ...html.matchAll(
          /"component":"OverflowMenu","props":(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/g,
        ),
      ]
        .map((m) => JSON.parse(m[1]!) as Record<string, { path?: string[] }>)
        .map((props) => `${props['items']!.path!.join('.')}${props['open'] ? ' open' : ''}`);
    expect(menus(out.get('book.phone-menu.dc.html')!)).toEqual(['data.menu open', 'chapter.menu']);
    expect(menus(out.get('book.phone.dc.html')!)).toEqual(['data.menu', 'chapter.menu']);
    expect(menus(out.get('book.desktop.dc.html')!)).toEqual(['data.menu', 'chapter.menu']);
  });
});

describe('the placeholder art', () => {
  const dir = fileURLToPath(new URL(`../../${ART_DIR}/`, import.meta.url));

  it('[M0.canvas] holds a different image in every file', () => {
    const byImage = new Map<string, string[]>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.jpg'))) {
      const hash = createHash('sha256')
        .update(readFileSync(dir + file))
        .digest('hex');
      byImage.set(hash, [...(byImage.get(hash) ?? []), file]);
    }
    expect([...byImage.values()].filter((files) => files.length > 1)).toEqual([]);
  });
});
