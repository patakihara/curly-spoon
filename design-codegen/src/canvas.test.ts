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

const page = (id: string, route: string, title: string) => ({
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
    links: [],
  },
});

const nav = parseNav({
  destinations: [{ id: 'books', label: 'Books', icon: 'book_2' }],
  layouts: [
    { minWidth: 0, nav: 'bottomBar', order: ['books'] },
    { minWidth: 1240, nav: 'labelledRail', order: ['books'], sidePanel: 'nowPlaying' },
  ],
  back: { close: 'opener', stacks: 'perDestination', android: 'close', web: 'previousView' },
  pages: [
    page('book', '/book', 'Book'),
    page('settings', '/settings', 'Settings'),
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
    handled: new Set(['Switch']),
  },
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
  it('draws every drawn page as a phone and a desktop artboard, one row per page below the structure row', () => {
    expect([...files.keys()].sort()).toEqual([
      'book.desktop.dc.html',
      'book.phone.dc.html',
      'canvas.json',
      'flows.dc.html',
      'settings.desktop.dc.html',
      'settings.phone.dc.html',
      'structure.dc.html',
    ]);
    const { phone, desktop } = CANVAS_BOARDS;
    expect(index.order).toEqual([
      'structure.dc.html',
      'flows.dc.html',
      'book.phone.dc.html',
      'book.desktop.dc.html',
      'settings.phone.dc.html',
      'settings.desktop.dc.html',
    ]);
    const structureRow = Math.max(
      index.boards['structure.dc.html'].h,
      index.boards['flows.dc.html'].h,
    );
    expect(index.boards['book.phone.dc.html']).toEqual({
      x: 0,
      y: structureRow + 120,
      w: phone.width,
      h: phone.height,
      title: 'Book · phone',
    });
    expect(index.boards['book.desktop.dc.html']).toMatchObject({
      x: phone.width + 80,
      y: structureRow + 120,
      w: desktop.width,
      h: desktop.height,
    });
    expect(index.boards['settings.phone.dc.html']).toMatchObject({
      x: 0,
      y: structureRow + 120 + Math.max(phone.height, desktop.height) + 120,
    });
  });

  it('[M0.canvas/f] puts the structure and the flowchart first, in one row named by a title note', () => {
    const structure = index.boards['structure.dc.html'];
    const flows = index.boards['flows.dc.html'];
    expect(structure).toMatchObject({ x: 0, y: 0, title: 'Structure' });
    expect(flows).toMatchObject({ x: structure.w + 80, y: 0, title: 'Flows' });
    expect(index.notes).toEqual({
      structure: {
        x: 0,
        y: -300,
        text: 'Structure',
        kind: 'title1',
        maxW: structure.w + 80 + flows.w,
      },
    });
    for (const name of ['structure.dc.html', 'flows.dc.html']) {
      const { w, h } = index.boards[name];
      expect(board(name)).toContain(`<div data-theme="dark" style="width: ${w}px; height: ${h}px;`);
      expect(board(name)).toContain(`{"$preview":{"width":${w},"height":${h}}}`);
      expect(board(name)).toContain(`<link rel="stylesheet" href="ds/${DS_FOLDER}/tokens.css">`);
      expect(board(name)).not.toContain('x-import');
    }
  });

  it("keeps the artifact's creation date and records the Sonora publish it installs", () => {
    expect(index).toMatchObject({
      v: 3,
      title: 'Auralis',
      createdOnFiles: { v: 1, at: CANVAS_CREATED_AT },
      launch: { view: 'canvas' },
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
