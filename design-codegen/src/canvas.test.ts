import { describe, expect, it } from 'vitest';
import type { App } from './app.js';
import { CANVAS_BOARDS, DS_FOLDER, generateCanvas, type SonoraInstall } from './canvas.js';
import { parseNav } from './nav.js';
import { parsePage } from './page.js';

const page = (id: string, route: string, title: string) => ({
  id,
  route,
  lights: null,
  back: 'history',
  presentation: 'screen',
  title,
  sources: { sonora: ['none'], spotify: [] },
});

const nav = parseNav({
  destinations: [],
  layouts: [{ minWidth: 0, nav: 'bottomBar' }],
  pages: [
    page('book', '/book', 'Book'),
    page('settings', '/settings', 'Settings'),
    page('search', '/search', 'Search'),
  ],
});

const book = `export default function Book({ data }) {
  return (
    <DetailPage kindLabel="Book & more" overlay count={2}>
      <MediaHeader title={data.title} />
      <Each of={data.chapters} as="chapter">
        <EpisodeRow title={chapter.title}>{chapter.title}</EpisodeRow>
      </Each>
      <When state="full"><Button>Play "it" & go</Button></When>
    </DetailPage>
  );
}
`;
const settings = `export default function Settings({ data }) {
  return <PageBody><Switch checked /></PageBody>;
}
`;

const app: App = {
  nav,
  pages: [
    {
      id: 'book',
      tree: parsePage(book, 'book'),
      placeholder: { title: 'Wind </script> Truth', chapters: [{ title: 'Prologue' }] },
    },
    { id: 'settings', tree: parsePage(settings, 'settings'), placeholder: {} },
  ],
  components: { platformed: new Set(['MediaHeader']), handled: new Set(['Switch']) },
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
  it('draws every drawn page as a phone and a desktop artboard, one row per page', () => {
    expect([...files.keys()].sort()).toEqual([
      'book.desktop.dc.html',
      'book.phone.dc.html',
      'canvas.json',
      'settings.desktop.dc.html',
      'settings.phone.dc.html',
    ]);
    const { phone, desktop } = CANVAS_BOARDS;
    expect(index.order).toEqual([
      'book.phone.dc.html',
      'book.desktop.dc.html',
      'settings.phone.dc.html',
      'settings.desktop.dc.html',
    ]);
    expect(index.boards['book.phone.dc.html']).toEqual({
      x: 0,
      y: 0,
      w: phone.width,
      h: phone.height,
      title: 'Book · phone',
    });
    expect(index.boards['book.desktop.dc.html']).toMatchObject({
      x: phone.width + 80,
      y: 0,
      w: desktop.width,
      h: desktop.height,
    });
    expect(index.boards['settings.phone.dc.html']).toMatchObject({
      x: 0,
      y: Math.max(phone.height, desktop.height) + 120,
    });
  });

  it('records the Sonora publish it installs in the index', () => {
    expect(index).toMatchObject({
      v: 3,
      title: 'Auralis',
      createdOnFiles: { v: 1, at: now.toISOString() },
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
});
