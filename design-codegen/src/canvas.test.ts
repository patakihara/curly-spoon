import { describe, expect, it } from 'vitest';
import type { App } from './app.js';
import {
  CANVAS_BOARDS,
  CANVAS_CREATED_AT,
  DS_FOLDER,
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
    playing: { title: 'Tidal Lines', artist: 'Halcyon Bloom', progress: 0.5, duration: 214 },
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
      `<x-import component-from-global-scope="SonoraDesignSystem_6c1435.BackdropShell" back="{{slots.s0}}" player="{{slots.s1}}" sheet-open="{{ false }}" platform="mobile">`,
    );
    expect(phone).not.toContain('rail=');
    const desktop = board('book.desktop.dc.html');
    expect(desktop).toContain('rail="{{slots.s0}}"');
    expect(desktop).toContain('sheet-open="{{ true }}" platform="desktop">');
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
