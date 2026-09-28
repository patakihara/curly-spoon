import { describe, expect, it } from 'vitest';
import { parseNav } from './nav.js';
import { parsePage } from './page.js';
import { generateWebPage, type WebShell } from './page-web.js';

const nav = parseNav({
  destinations: [{ id: 'books', label: 'Books', icon: 'book_2' }],
  layouts: [
    { minWidth: 0, nav: 'bottomBar', order: ['books'] },
    { minWidth: 600, nav: 'iconRail', order: ['books'] },
  ],
  back: { close: 'opener', stacks: 'perDestination', android: 'close', web: 'previousView' },
  pages: ['books', 'book', 'settings'].map((id) => ({
    id,
    route: `/${id}`,
    lights: id === 'settings' ? null : 'books',
    close: id === 'books' ? 'none' : 'opener',
    presentation: 'screen',
    title: id[0]!.toUpperCase() + id.slice(1),
    sources: { sonora: ['none'], spotify: [] },
    structure: { purpose: 'P.', sections: [{ name: 'S', holds: 'H.' }], empty: 'E.', links: [] },
  })),
});
const shellOf = (id: string): WebShell => ({
  nav,
  shell: {
    account: { label: 'Account' },
    playing: { title: 'Tidal Lines', artist: 'Halcyon Bloom', progress: 0.5, duration: 214 },
    railFoot: [{ page: 'settings', icon: 'settings' }],
  },
  page: nav.pages.find((p) => p.id === id)!,
});

const source = `export default function Book({ data }) {
  return (
    <DetailPage kindLabel="Book" overlay count={2}>
      <MediaHeader title={data.title} />
      <Each of={data.chapters} as="chapter">
        <EpisodeRow title={chapter.title}>{chapter.title}</EpisodeRow>
      </Each>
      <When state="full"><Button>Play "it"</Button></When>
    </DetailPage>
  );
}
`;
const out = generateWebPage(
  parsePage(source, 'book'),
  'book',
  { title: 'Wind and Truth', chapters: [{ title: 'Prologue' }] },
  { platformed: new Set(['MediaHeader', 'Button', 'BackLayer', 'MiniPlayer']), handled: new Set() },
  shellOf('book'),
);

const form = `export default function Settings({ data }) {
  return (
    <PageBody>
      <FieldRow label="Server" value={data.server} />
      <Switch checked onChange="kept" />
      <Chip label="All" />
    </PageBody>
  );
}
`;
const formOut = generateWebPage(
  parsePage(form, 'settings'),
  'settings',
  { server: 'https://media.example.org' },
  { platformed: new Set(), handled: new Set(['FieldRow', 'Switch', 'Chip']) },
  shellOf('settings'),
);

const home = `export default function Books({ data }) {
  return (
    <BackdropShell back={<BackLayer controls={<ButtonGroup items={data.filters} value="All" />} />} subheader={<FrontLayerHeader spy />}>
      <PageBody />
    </BackdropShell>
  );
}
`;
const homeOut = generateWebPage(
  parsePage(home, 'books'),
  'books',
  { filters: ['All'] },
  {
    platformed: new Set(['BackLayer', 'PageBody', 'MiniPlayer']),
    handled: new Set(['ButtonGroup']),
  },
  shellOf('books'),
);

const grid = `export default function Books({ data }) {
  return (
    <Each of={data.library} as="item">
      <MediaCard title={item.title} tone={item.tone} size="sm" />
    </Each>
  );
}
`;
const gridOut = generateWebPage(
  parsePage(grid, 'books'),
  'books',
  { library: [{ title: 'Tidal Lines', tone: 'progress' }] },
  {
    platformed: new Set(),
    handled: new Set(),
    choices: new Map([['MediaCard', new Set(['tone', 'size'])]]),
  },
  shellOf('books'),
);

describe('a generated web page', () => {
  it('reads a bound value for a prop that takes one of a set of words as that prop’s type', () => {
    expect(gridOut).toContain("import type { ComponentProps } from 'react';");
    expect(gridOut).toContain(
      '<MediaCard title={item.title} tone={item.tone as Exclude<ComponentProps<typeof MediaCard>[\'tone\'], undefined>} size="sm" />',
    );
    expect(out).not.toContain('ComponentProps');
  });

  it('imports each Sonora component it and its shell use from the web UI package, once', () => {
    expect(out).toContain(
      "import { BackLayer, BackdropShell, BottomNav, Button, DetailPage, EpisodeRow, IconButton, MediaHeader, MiniPlayer, NavRail } from '../ui/index.js';",
    );
  });

  it('takes its data, state and layout, with the placeholder, full and the width as defaults', () => {
    expect(out).toContain('const placeholder = {\n  "title": "Wind and Truth",');
    expect(out).toContain(
      "export default function Book({ data = placeholder, state = 'full', layout: given }: BookProps) {",
    );
    expect(out).toContain('  const chrome = CHROME[given ?? detected];');
    expect(out).toContain('  const platform = chrome.platform;');
  });

  it('sits in the shell: the page’s own back-layer controls and subheader, the shell’s parts by layout', () => {
    expect(homeOut).toContain('    <BackdropShell\n      rail={chrome.rail}\n      back={');
    expect(homeOut).toContain(
      [
        '        <BackLayer',
        '          title="Books"',
        '          leading={chrome.leading}',
        '          controls={<ButtonGroup items={data.filters} value="All" onChange={ignore} />}',
        '          platform={platform}',
        '        />',
      ].join('\n'),
    );
    expect(homeOut).toContain('      subheader={<FrontLayerHeader spy={true} />}');
    expect(homeOut).toContain('      <PageBody platform={platform} />');
  });

  it('holds the shell’s parts for every layout: the avatar and bottom bar on the phone, the rail wider', () => {
    expect(homeOut).toContain(
      "  w0: {\n    platform: 'mobile',\n    leading: (\n      <AccountButton label={shell.account.label} />",
    );
    expect(homeOut).toContain('<BottomNav items={shell.nav.w0} active="books" />');
    expect(homeOut).toContain(
      '<NavRail items={shell.nav.w600} footerItems={shell.footer} active="books" expanded={false} />',
    );
    expect(homeOut).toContain(
      '<MiniPlayer title={shell.playing.title} artist={shell.playing.artist} playing={true} progress={shell.playing.progress} duration={shell.playing.duration} platform="desktop" />',
    );
    expect(homeOut).toContain('const shell = {\n  "account": {');
  });

  it('writes literal props as literals and bindings as data paths', () => {
    expect(out).toContain('<DetailPage kindLabel="Book" overlay={true} count={2}>');
    expect(out).toContain('<MediaHeader title={data.title} platform={platform} />');
  });

  it('passes the platform only to components that take one', () => {
    expect(out).toContain('<EpisodeRow title={chapter.title}>');
  });

  it('turns Each into a keyed map and When into a state check', () => {
    expect(out).toContain('{data.chapters.map((chapter, i) => (');
    expect(out).toContain('<Fragment key={i}>');
    expect(out).toContain("{state === 'full' && (");
  });

  it('escapes text children', () => {
    expect(out).toContain('{"Play \\"it\\""}');
  });

  it('gives a field that shows a value a handler that ignores changes, since a page is a still', () => {
    expect(formOut).toContain('const ignore = () => {};');
    expect(formOut).toContain('<FieldRow label="Server" value={data.server} onChange={ignore} />');
  });

  it('leaves a handler the page gives, and components showing no value, alone', () => {
    expect(formOut).toContain('<Switch checked={true} onChange="kept" />');
    expect(formOut).toContain('<Chip label="All" />');
    expect(out).not.toContain('ignore');
  });
});
