import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNav } from './nav.js';
import { SONORA_DIR, REPO_ROOT } from './outputs.js';
import { parsePage } from './page.js';
import { generateKotlinPage, type KotlinShell } from './page-kotlin.js';
import { readProps } from './props.js';
import { discoverComponents } from './sonora.js';

const model = readProps(discoverComponents(join(REPO_ROOT, SONORA_DIR)));

const structure = (links: string[] = []) => ({
  purpose: 'P.',
  sections: [{ name: 'S', holds: 'H.' }],
  empty: 'E.',
  links,
});
const entry = (id: string, route: string, over: Record<string, unknown> = {}) => ({
  id,
  route,
  lights: 'books',
  close: 'opener',
  presentation: 'screen',
  title: id[0]!.toUpperCase() + id.slice(1),
  sources: { sonora: ['none'], spotify: [] },
  structure: structure(),
  ...over,
});
const nav = parseNav({
  destinations: [{ id: 'books', label: 'Books', icon: 'book_2' }],
  layouts: [
    { minWidth: 0, nav: 'bottomBar', order: ['books'] },
    { minWidth: 600, nav: 'iconRail', order: ['books'] },
  ],
  back: { close: 'opener', stacks: 'perDestination', android: 'close', web: 'previousView' },
  pages: [
    entry('books', '/books', { close: 'none', structure: structure(['book', 'show']) }),
    entry('book', '/books/:ref', { params: { ref: 'ItemRef' } }),
    entry('show', '/podcasts/:ref', { params: { ref: 'ItemRef' } }),
    entry('signIn', '/sign-in', { lights: null, close: 'none', presentation: 'bare' }),
    entry('nowPlaying', '/playing', { lights: null, close: 'sheet', presentation: 'sheet' }),
    entry('queue', '/playing/queue', { lights: null, close: 'sheet', presentation: 'sheet' }),
    entry('settings', '/settings', { lights: null }),
  ],
});
const shellOf = (id: string, playing = true): KotlinShell => ({
  nav,
  shell: {
    account: { label: 'Account' },
    playing: playing
      ? {
          title: 'Tidal Lines',
          artist: 'Halcyon Bloom',
          variant: 'music',
          favourite: false,
          progress: 0.5,
          duration: 214,
          sleep: 'Off',
        }
      : null,
    railFoot: [],
  },
  page: nav.pages.find((p) => p.id === id)!,
});

const gen = (source: string, id: string, data: Record<string, unknown>, playing = true) =>
  generateKotlinPage(parsePage(source, id), id, data, model, shellOf(id, playing));

const home = gen(
  `export default function Books({ data }) {
  return (
    <BackdropShell back={<BackLayer search="Search books" />}>
      <PageBody width="tiles">
        <Each of={data.library} as="item">
          <MediaCard title={item.title} progress={item.progress} tone={item.tone} onClick={<Open page={item.page} ref={item.ref} />} />
        </Each>
        <When state="empty"><MediaCard title="Never drawn" /></When>
      </PageBody>
    </BackdropShell>
  );
}
`,
  'books',
  {
    library: [
      { title: 'Wind and $Truth', progress: 0.25, tone: 'progress', page: 'book', ref: 'wind' },
      { title: 'Say "Hi"', progress: 1, tone: null, page: 'show', ref: 'hi' },
    ],
  },
);

describe('an Android page, from a canvas page', () => {
  it('calls each Sonora composable by name with its generated props class', () => {
    expect(home).toContain('fun BooksPage(navController: NavController, actions: PageActions) {');
    expect(home).toMatch(/MediaCard\(\s*MediaCardProps\(/);
    expect(home).toContain('import net.develivarr.auralis.ui.sonora.MediaCard\n');
    expect(home).toContain('import net.develivarr.auralis.generated.ui.MediaCardProps\n');
  });

  it("inlines the placeholder as literals, one call per item of an Each, Kotlin's string escapes kept", () => {
    expect(home).toContain('title = "Wind and \\$Truth"');
    expect(home).toContain('title = "Say \\"Hi\\""');
    expect(home).toContain('progress = 0.25f');
    expect(home).toContain('progress = 1f');
    expect(home.match(/MediaCardProps\(/g)).toHaveLength(2);
  });

  it('draws only the full state', () => {
    expect(home).not.toContain('Never drawn');
  });

  it("gives a prop that takes one of a set of words its enum's constant, and null as null", () => {
    expect(home).toContain('tone = MediaCardTone.PROGRESS');
    expect(home).toContain('tone = null');
    expect(home).toContain('width = PageBodyWidth.TILES');
  });

  it('opens the typed destination each item names, with its arguments', () => {
    expect(home).toContain('onClick = { navController.navigate(Route.Book(ref = "wind")) }');
    expect(home).toContain('onClick = { navController.navigate(Route.Show(ref = "hi")) }');
  });

  it("gives every component that takes a platform the phone's", () => {
    expect(home).toMatch(/PageBodyProps\([\s\S]*platform = Platform.MOBILE/);
  });

  it("frames the page in the phone's shell: the heading, the account avatar, the mini-player and the bottom bar", () => {
    expect(home).toContain('title = "Books"');
    expect(home).toMatch(/AccountButton\(\s*AccountButtonProps\(\s*label = "Account"/);
    expect(home).toMatch(/MiniPlayer\(\s*MiniPlayerProps\([\s\S]*title = "Tidal Lines"/);
    expect(home).toContain('BottomNavItem(key = "books", label = "Books", icon = "book_2")');
    expect(home).toContain('onOpen = { navController.navigate(Route.NowPlaying) }');
    expect(home).toContain('onChange = { key -> openDestination(navController, key) }');
  });

  it('opens Settings from the account avatar', () => {
    expect(home).toMatch(
      /AccountButton\(\s*AccountButtonProps\([^)]*onClick = \{ navController\.navigate\(Route\.Settings\) \}/,
    );
  });

  it("leaves a destination's home to Android's own back, with no close control", () => {
    expect(home).not.toContain('BackHandler');
    expect(home).not.toContain('closePage');
  });

  const book = gen(
    `export default function Book({ data }) {
  return (
    <PageBody>
      <MediaHeader title={data.title} onPlay={<Play ref={data.ref} queue="spoken" />} onPlayNext={<Play ref={data.ref} queue="spoken" next />} />
      <MediaCard title="Other" onRequest={<Request ref={data.other} />} />
      <OverflowMenu items={data.menu} />
      <Button variant="primary">Play {data.title}</Button>
    </PageBody>
  );
}
`,
    'book',
    {
      title: 'Wind and Truth',
      ref: 'wt',
      other: 'rhythm',
      menu: [{ key: 'share', label: 'Share' }],
    },
  );

  it('closes to its opener, from its close control and from Android back, or else to the home it lights', () => {
    expect(book).toContain('BackHandler { closePage(navController, Route.Books) }');
    expect(book).toMatch(
      /IconButtonProps\(\s*icon = "close",\s*label = "Close",\s*onClick = \{ closePage\(navController, Route.Books\) \}/,
    );
  });

  it('plays through the actions the app injects', () => {
    expect(book).toMatch(
      /onPlay = \{\s*actions.onPlay\("wt", PlayQueue.SPOKEN, PlayMode.NOW\)\s*\}/,
    );
    expect(book).toMatch(
      /onPlayNext = \{\s*actions.onPlay\("wt", PlayQueue.SPOKEN, PlayMode.NEXT\)\s*\}/,
    );
  });

  it('[M0.states/c] binds no request, which the app has no way to make yet, so the card draws it disabled', () => {
    expect(book).not.toContain('onRequest');
  });

  it('builds a list of data classes from the placeholder', () => {
    expect(book).toContain('items = listOf(OverflowMenuItem(key = "share", label = "Share"))');
  });

  it("reads Sonora's string shorthand for an item as its key and label, or its title", () => {
    const out = gen(
      `export default function Books({ data }) {
  return (
    <BackdropShell back={<BackLayer controls={<ButtonGroup items={data.kinds} value="All" />} />} subheader={<FrontLayerHeader spy sections={data.kinds} />}>
      <PageBody />
    </BackdropShell>
  );
}
`,
      'books',
      { kinds: ['All', 'Books'] },
    );
    expect(out).toContain('ButtonGroupItem(key = "Books", label = "Books")');
    expect(out).toContain('FrontLayerHeaderSection(title = "Books")');
  });

  it('shows text children as plain text', () => {
    expect(book).toMatch(
      /children = \{\s*BasicText\("Play"\)\s*BasicText\("Wind and Truth"\)\s*\}/,
    );
  });

  it('[M0.canvas] lights on the bottom bar the destination the page arrived on, the one it lights only with nothing under it', () => {
    expect(home).toContain('active = litDestination(navController, "books")');
    expect(home).toContain('import net.develivarr.auralis.generated.nav.litDestination\n');
  });

  it('[M0.canvas] keeps a page lighting none unlit on the bottom bar', () => {
    const settings = gen(
      `export default function Settings() {
  return (
    <BackdropShell>
      <PageBody />
    </BackdropShell>
  );
}
`,
      'settings',
      {},
    );
    expect(settings).toContain('active = ""');
    expect(settings).not.toContain('litDestination');
  });

  it('starts sign-in through the injected onSignIn, and draws a bare page with no navigation', () => {
    const signIn = gen(
      `export default function SignIn({ data }) {
  return (
    <BackdropShell>
      <PageBody width="form">
        <Button variant="primary" onClick={<SignIn />}>Sign in</Button>
      </PageBody>
    </BackdropShell>
  );
}
`,
      'signIn',
      {},
    );
    expect(signIn).toContain('onClick = { actions.onSignIn() }');
    expect(signIn).toContain('column = BackdropShellColumn.FORM');
    expect(signIn).not.toContain('BottomNav');
    expect(signIn).not.toContain('MiniPlayer');
  });

  it('puts a player sheet in the player, open on its tab, closing to the page under it and switching tabs between sheets', () => {
    const queue = gen(
      `export default function Queue({ data }) {
  return <QueuePage heading={null} items={data.items} />;
}
`,
      'queue',
      { items: [] },
    );
    expect(queue).toMatch(/NowPlaying\(\s*NowPlayingProps\(/);
    expect(queue).toContain('tab = "queue"');
    expect(queue).toContain('onClose = { closePage(navController, Route.Books) }');
    expect(queue).toContain('onTabChange = { tab -> openTab(navController, tab) }');
    expect(queue).toContain('BackHandler { closePage(navController, Route.Books) }');
  });

  it('calls a Sonora composable named as the page by an alias', () => {
    const now = gen(
      `export default function NowPlaying() {
  return <NowPlayingPage />;
}
`,
      'nowPlaying',
      {},
    );
    expect(now).toContain(
      'import net.develivarr.auralis.ui.sonora.NowPlayingPage as SonoraNowPlayingPage\n',
    );
    expect(now).toContain('fun NowPlayingPage(navController');
    expect(now).toMatch(/SonoraNowPlayingPage\(\s*NowPlayingPageProps\(/);
  });

  it('refuses a placeholder value the prop cannot take, naming where', () => {
    expect(() =>
      gen(
        `export default function Book({ data }) {
  return <MediaCard title={data.title} />;
}
`,
        'book',
        { title: 12 },
      ),
    ).toThrow(/book: MediaCard.title.*String.*12/);
  });

  it('refuses leaving out a prop the component requires', () => {
    expect(() =>
      gen(
        `export default function Book() {
  return <MediaCard sub="No title" />;
}
`,
        'book',
        {},
      ),
    ).toThrow(/book: MediaCard needs title/);
  });

  it('passes null for a required prop that takes null and is not given', () => {
    const out = gen(
      `export default function Book() {
  return <Button variant="ghost" />;
}
`,
      'book',
      {},
    );
    expect(out).toMatch(/ButtonProps\([^)]*children = null/);
  });
});
