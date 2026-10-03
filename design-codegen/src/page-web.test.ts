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
  { platformed: new Set(['MediaHeader', 'Button', 'BackLayer', 'MiniPlayer']) },
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
  { platformed: new Set() },
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
    choices: new Map([
      [
        'MediaCard',
        new Map([
          ['tone', { words: ['progress', 'request', 'error'], nullable: true }],
          ['size', { words: ['md', 'sm'], nullable: false }],
        ]),
      ],
    ]),
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
      "import { BackLayer, BottomNav, Button, DetailPage, EpisodeRow, IconButton, MediaHeader, MiniPlayer, NavRail } from '../ui/index.js';",
    );
  });

  it('takes its data and state, with the placeholder and full as defaults, at the layout the width calls for', () => {
    expect(out).toContain('const placeholder = {\n  "title": "Wind and Truth",');
    expect(out).toContain(
      "export default function Book({ data = placeholder, state = 'full' }: BookProps) {",
    );
    expect(out).toContain('  const platform = PLATFORM[useLayout()];');
  });

  it('[M0.canvas/c] draws only its front layer’s content, the one shell around every page drawing the rest', () => {
    for (const page of [out, homeOut, formOut, gridOut]) {
      expect(page).not.toContain('BackdropShell');
      const body = page.slice(page.indexOf('export default function'));
      expect(body).not.toMatch(/<(NavRail|BottomNav|MiniPlayer|BackLayer)\b/);
    }
    expect(homeOut).toContain('    <PageBody platform={platform} />');
  });

  it('[M0.canvas/c] hands the shell its frame: its parts by layout, its back-layer controls and its subheader', () => {
    expect(homeOut).toContain(
      "import { PLATFORM, useLayout, type Chrome, type LayoutId, type PageFrame } from '../nav/platform';",
    );
    expect(homeOut).toContain(
      'export const frame: PageFrame<BooksData> = {\n  placeholder,\n  chrome: CHROME,\n',
    );
    expect(homeOut).toContain(
      [
        '  back: (data, { platform, leading }) => (',
        '    <BackLayer',
        '      title="Books"',
        '      leading={leading}',
        '      controls={<ButtonGroup items={data.filters} value="All" />}',
        '      platform={platform}',
        '    />',
        '  ),',
      ].join('\n'),
    );
    expect(homeOut).toContain('  subheader: () => <FrontLayerHeader spy={true} />,');
    expect(out).not.toContain('subheader:');
  });

  it('holds the shell’s parts for every layout: the avatar and bottom bar on the phone, the rail wider', () => {
    expect(homeOut).toContain(
      "  w0: (go) => ({\n    appBar: false,\n    leading: (\n      <AccountButton label={shell.account.label} onClick={() => go.open('/settings')} />",
    );
    expect(homeOut).toContain(
      '<BottomNav items={shell.nav.w0} active="books" onChange={(key) => go.destination(key)} />',
    );
    expect(homeOut).toContain(
      '<NavRail items={shell.nav.w600} footerItems={shell.footer} active="books" expanded={go.rail(false)} toggle={true} onChange={(key) => go.destination(key)} onToggleExpanded={() => go.toggleRail(false)} />',
    );
    expect(homeOut).toContain(
      '<MiniPlayer title={shell.playing.title} artist={shell.playing.artist} playing={true} progress={shell.playing.progress} duration={shell.playing.duration} variant={shell.playing.variant} sleep={shell.playing.sleep} platform="desktop" />',
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

  it('[M0.states/c] leaves a field that shows a value unbound, so it draws disabled rather than seeming to work', () => {
    expect(formOut).toContain('<FieldRow label="Server" value={data.server} />');
    expect(formOut).not.toContain('ignore');
  });

  it('leaves a handler the page gives, and components showing no value, alone', () => {
    expect(formOut).toContain('<Switch checked={true} onChange="kept" />');
    expect(formOut).toContain('<Chip label="All" />');
    expect(out).not.toContain('ignore');
  });
});

describe("the shell's controls on a web page", () => {
  it('[M0.canvas] wires them to the shell’s navigation, which the shell hands its parts', () => {
    expect(out).toContain("import type { ShellNav } from '../../shell-nav';");
    expect(out).toContain('const CHROME: Record<LayoutId, (go: ShellNav) => Chrome> = {');
    expect(out).toContain('  chrome: CHROME,');
  });

  it('[M0.canvas] closes a page to its opener, or else to the home of the destination it lights', () => {
    expect(out).toContain(
      '<IconButton icon="close" label="Close" onClick={() => go.close(\'books\')} />',
    );
  });

  it("[M0.canvas] gives a destination's home no close control, the account avatar leading it", () => {
    expect(homeOut).not.toContain('go.close');
  });

  it('opens Settings from the account avatar on the phone', () => {
    expect(homeOut).toMatch(/<AccountButton [^>]*onClick=\{\(\) => go.open\('\/settings'\)\} \/>/);
  });

  const withPlayer = parseNav({
    ...nav,
    pages: [
      ...nav.pages,
      ...[
        ['nowPlaying', '/playing'],
        ['queue', '/playing/queue'],
        ['lyrics', '/playing/lyrics'],
      ].map(([id, route]) => ({
        ...nav.pages[1]!,
        id,
        route,
        params: {},
        lights: null,
        close: 'sheet',
        presentation: 'sheet',
      })),
    ],
  });
  const inPlayer = (id: string): WebShell => ({
    ...shellOf('book'),
    nav: withPlayer,
    shell: { ...shellOf('book').shell, sheetOver: 'books' },
    page: withPlayer.pages.find((p) => p.id === id)!,
  });
  const components = { platformed: new Set<string>() };

  it('[M0.canvas] opens Now Playing from the mini-player', () => {
    const book = generateWebPage(
      parsePage(source, 'book'),
      'book',
      {},
      components,
      inPlayer('book'),
    );
    expect(book).toMatch(/<MiniPlayer [^>]*onOpen=\{\(\) => go.open\('\/playing'\)\} \/>/);
  });

  it("shows the player panel at the desktop mini-player's Queue or Lyrics, tinting the one it shows", () => {
    const book = generateWebPage(
      parsePage(source, 'book'),
      'book',
      {},
      components,
      inPlayer('book'),
    );
    const [phone, desktop] = book.split('\n').filter((line) => line.includes('<MiniPlayer '));
    expect(desktop).toContain(
      "queueOpen={go.panel() === 'queue'} onToggleQueue={() => go.togglePanel('queue')}",
    );
    expect(desktop).toContain(
      "lyricsOpen={go.panel() === 'lyrics'} onToggleLyrics={() => go.togglePanel('lyrics')}",
    );
    expect(phone).not.toContain('Toggle');
  });

  const queuePage = () =>
    generateWebPage(
      parsePage(
        'export default function Queue() {\n  return <QueuePage heading={null} />;\n}\n',
        'queue',
      ),
      'queue',
      {},
      components,
      inPlayer('queue'),
    );

  it('draws a player sheet at desktop density where it is the panel the mini-player showed', () => {
    const queue = queuePage();
    expect(queue).toContain("import { InPanel } from '../../shell-nav';");
    expect(queue).toContain('  const inPanel = useContext(InPanel);');
    expect(queue).toContain(
      "  const platform: Platform = inPanel || PANEL[useLayout()] ? 'desktop' : 'mobile';",
    );
  });

  it("[M0.canvas/c] draws a player sheet as its tab's content alone, inside the shell's one player, so a tab switch keeps the sheet", () => {
    const queue = queuePage();
    expect(queue).toContain("import { PANEL, useLayout, type Platform } from '../nav/platform';");
    expect(queue).not.toContain("from './Books'");
    expect(queue).toContain('\n  return (\n    <QueuePage ');
    expect(queue).not.toContain('<NowPlaying');
    expect(queue).not.toContain('useShellNav');
    expect(queue).not.toContain('onClose');
  });

  it("[M0.canvas/c] leaves the side panel to the shell's one player: a page's parts only say whether its layout opens it", () => {
    const wide = parseNav({
      ...withPlayer,
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
    });
    const book = generateWebPage(parsePage(source, 'book'), 'book', {}, components, {
      ...inPlayer('book'),
      nav: wide,
      page: wide.pages.find((p) => p.id === 'book')!,
    });
    const w1240 = book.slice(book.indexOf('  w1240: '));
    expect(w1240).toContain('    sheetOpen: true,');
    expect(book).not.toContain('    sheet: (');
    expect(book).not.toContain('<NowPlaying');
  });

  it('[M0.canvas] opens each destination as it was left from the bottom bar and the rail', () => {
    expect(out).toContain(
      '<BottomNav items={shell.nav.w0} active="books" onChange={(key) => go.destination(key)} />',
    );
    expect(out).toMatch(/<NavRail [^>]*onChange=\{\(key\) => go.destination\(key\)\}/);
  });

  it("[M0.canvas] has the shell hold the rail's collapse, so it stays so from page to page", () => {
    const rails = [...out.matchAll(/<NavRail [^\n]*\/>/g)].map((m) => m[0]);
    expect(rails.length).toBeGreaterThan(0);
    for (const rail of rails) {
      const given = /expanded=\{go\.rail\((true|false)\)\}/.exec(rail)?.[1];
      expect(given, rail).toBeDefined();
      expect(rail).toContain(`onToggleExpanded={() => go.toggleRail(${given})}`);
      expect(rail).not.toMatch(/expanded=\{(true|false)\}/);
    }
  });
});

describe('a page requesting an item, on the web', () => {
  const requesting = generateWebPage(
    parsePage(
      `export default function Book({ data }) {
  return <Each of={data.books} as="b"><MediaCard title={b.title} onRequest={<Request ref={b.ref} />} /></Each>;
}
`,
      'book',
    ),
    'book',
    { books: [{ title: 'Wind and Truth', ref: 'wind-and-truth' }] },
    { platformed: new Set() },
    shellOf('book'),
  );

  it('[M0.states/c] binds no request, since no request endpoint exists: the card draws its Request disabled', () => {
    expect(requesting).toContain('<MediaCard title={b.title} />');
    expect(requesting).not.toMatch(/<MediaCard[^>]*onRequest/);
    expect(requesting).not.toContain('ignore');
    expect(requesting).not.toContain('useNavigate');
  });
});

describe('a page playing an item, on the web', () => {
  const playing = generateWebPage(
    parsePage(
      `export default function Book({ data }) {
  return <Each of={data.books} as="b"><MediaCard title={b.title} onClick={<Play ref={b.ref} queue="spoken" />} /></Each>;
}
`,
      'book',
    ),
    'book',
    { books: [{ title: 'Wind and Truth', ref: 'wind-and-truth' }] },
    { platformed: new Set() },
    shellOf('book'),
  );

  it('[M0.states/c] binds no play, since no page player exists yet: the control draws disabled', () => {
    expect(playing).toContain('<MediaCard title={b.title} />');
    expect(playing).not.toMatch(/<MediaCard[^>]*onClick/);
    expect(playing).not.toContain('ignore');
  });
});

describe('a page starting sign-in, on the web', () => {
  const signingIn = generateWebPage(
    parsePage(
      `export default function Book({ data }) {
  return <Button variant="primary" onClick={<SignIn />}>Sign in</Button>;
}
`,
      'book',
    ),
    'book',
    {},
    { platformed: new Set() },
    shellOf('book'),
  );

  it("[M0.sso/d] sends the browser to the server's web sign-in, coming back where the visitor was going", () => {
    const handler = /onClick=\{(\(\) => window\.location\.assign\(.*\))\}/.exec(signingIn)?.[1];
    expect(handler).toBeDefined();
    const visit = (search: string) => {
      let went = '';
      const window = { location: { search, assign: (to: string) => (went = to) } };
      (new Function('window', `(${handler!})()`) as (w: typeof window) => void)(window);
      return went;
    };
    expect(visit('?return_to=%2Fbooks%3Fsort%3Dnew')).toBe(
      '/api/auth/login?client=web&return_to=%2Fbooks%3Fsort%3Dnew',
    );
    expect(visit('?error=not_household&return_to=%2Fmusic')).toBe(
      '/api/auth/login?client=web&return_to=%2Fmusic',
    );
    expect(visit('')).toBe('/api/auth/login?client=web&return_to=%2F');
    expect(signingIn).not.toContain('useNavigate');
    expect(signingIn).not.toContain('ignore');
  });
});

describe('a page opening another, on the web', () => {
  const linking = generateWebPage(
    parsePage(
      `export default function Book({ data }) {
  return <Each of={data.books} as="b"><MediaCard title={b.title} onClick={<Open page="settings" />} /></Each>;
}
`,
      'book',
    ),
    'book',
    { books: [{ title: 'Wind and Truth' }] },
    { platformed: new Set() },
    shellOf('book'),
  );

  it("[M0.canvas] navigates to the page's route through the router, its parameters from the data", () => {
    expect(linking).toContain("import { useNavigate } from 'react-router';");
    expect(linking).toContain('  const navigate = useNavigate();');
    expect(linking).toContain("onClick={() => navigate('/settings')}");
    expect(out).not.toContain('useNavigate');
  });
});

describe('a page whose items name the page they open, on the web', () => {
  const linked = (id: string, links: string[]): WebShell => {
    const shell = shellOf(id);
    return { ...shell, page: { ...shell.page, structure: { ...shell.page.structure!, links } } };
  };
  const mixed = generateWebPage(
    parsePage(
      `export default function Book({ data }) {
  return <Each of={data.more} as="m"><MediaCard title={m.title} onClick={<Open page={m.page} ref={m.ref} />} /></Each>;
}
`,
      'book',
    ),
    'book',
    {
      more: [
        { title: 'Your books', page: 'books', ref: 'all' },
        { title: 'Another book', page: 'book', ref: 'another' },
      ],
    },
    { platformed: new Set() },
    linked('book', ['books']),
  );

  it("[M0.canvas] navigates each item to its own page's route, looked up among the pages it may open", () => {
    expect(mixed).toContain(
      'onClick={() => navigate(generatePath(routes[m.page]!, { ref: m.ref }))}',
    );
    expect(mixed).toMatch(
      /const routes: Record<string, string> = \{\s+"books": "\/books",\s+"book": "\/book"\s+\};/,
    );
    expect(mixed).not.toContain('"settings": "/settings"');
  });
});
