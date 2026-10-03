import { describe, expect, it } from 'vitest';
import { parseNav, type Nav } from './nav.js';
import type { PageTree } from './page.js';
import { chrome, playerTab, playerTree, type ShellFile } from './shell.js';
import { closeAction, shellHandlers, type ShellAction } from './shell-handlers.js';

const structure = (links: string[] = []) => ({
  purpose: 'P.',
  sections: [{ name: 'S', holds: 'H.' }],
  empty: 'E.',
  links,
});
const entry = (id: string, route: string, over: Record<string, unknown> = {}) => ({
  id,
  route,
  lights: 'music',
  close: 'opener',
  presentation: 'screen',
  title: id,
  sources: { sonora: ['none'], spotify: [] },
  structure: structure(),
  ...over,
});
const nav: Nav = parseNav({
  destinations: [
    { id: 'browse', label: 'Browse', icon: 'explore' },
    { id: 'music', label: 'Music', icon: 'album' },
  ],
  layouts: [
    { minWidth: 0, nav: 'bottomBar', order: ['browse', 'music'] },
    {
      minWidth: 1240,
      nav: 'labelledRail',
      order: ['browse', 'music'],
      sidePanel: 'nowPlaying',
      sidePanelOpens: 'always',
      sidePanelSits: 'beside',
    },
  ],
  back: { close: 'opener', stacks: 'perDestination', android: 'close', web: 'previousView' },
  pages: [
    entry('browse', '/', { lights: 'browse', close: 'none' }),
    entry('music', '/music', { close: 'none' }),
    entry('album', '/music/albums/:ref', { params: { ref: 'ItemRef' } }),
    entry('settings', '/settings', { lights: null }),
    entry('signIn', '/sign-in', { lights: null, close: 'none', presentation: 'bare' }),
    entry('nowPlaying', '/playing', { lights: null, close: 'sheet', presentation: 'sheet' }),
    entry('queue', '/playing/queue', { lights: null, close: 'sheet', presentation: 'sheet' }),
    entry('lyrics', '/playing/lyrics', { lights: null, close: 'sheet', presentation: 'sheet' }),
  ],
});
const shell: ShellFile = {
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
  sheetOver: 'browse',
};
const page = (id: string) => nav.pages.find((p) => p.id === id)!;

/** Each wired element, as its component and prop, to what the handler does. */
function wiring(handlers: Map<PageTree, Record<string, ShellAction>>) {
  const out: Record<string, ShellAction> = {};
  for (const [tree, props] of handlers) {
    const name = tree.kind === 'element' ? tree.component : tree.kind;
    for (const [prop, action] of Object.entries(props)) out[`${name}.${prop}`] = action;
  }
  return out;
}
const at = (id: string, layout: number) =>
  wiring(
    shellHandlers(nav, page(id), {
      chrome: chrome(nav, shell, page(id), nav.layouts[layout]!, new Set()),
    }),
  );

describe("the shell's controls, wired alike on both apps", () => {
  it('[M0.canvas] closes a page to its opener, or else to the home of the destination it lights', () => {
    expect(at('album', 0)['IconButton.onClick']).toEqual({ kind: 'close', home: 'music' });
    expect(at('settings', 0)['IconButton.onClick']).toEqual({ kind: 'close', home: 'browse' });
  });

  it("[M0.canvas] gives a destination's home no close control to wire", () => {
    expect(at('music', 0)['IconButton.onClick']).toBeUndefined();
  });

  it("opens Settings from the avatar leading the phone's top bar, on web and Android", () => {
    expect(at('music', 0)['AccountButton.onClick']).toEqual({ kind: 'open', page: 'settings' });
    const android = shellHandlers(
      nav,
      page('music'),
      { chrome: chrome(nav, shell, page('music'), nav.layouts[0]!, new Set()) },
      'android',
    );
    expect(wiring(android)['AccountButton.onClick']).toEqual({ kind: 'open', page: 'settings' });
  });

  it("shows the player panel at the mini-player's Queue or Lyrics on desktop, and the phone's mini-player has neither", () => {
    expect(at('album', 1)['MiniPlayer.onToggleQueue']).toEqual({ kind: 'panel', tab: 'queue' });
    expect(at('album', 1)['MiniPlayer.onToggleLyrics']).toEqual({ kind: 'panel', tab: 'lyrics' });
    expect(at('album', 0)['MiniPlayer.onToggleQueue']).toBeUndefined();
    expect(at('album', 0)['MiniPlayer.onToggleLyrics']).toBeUndefined();
  });

  it("[M0.canvas] switches destinations from the bottom bar and the rail, each to that destination's stack", () => {
    expect(at('album', 0)['BottomNav.onChange']).toEqual({ kind: 'destination' });
    expect(at('album', 1)['NavRail.onChange']).toEqual({ kind: 'destination' });
  });

  it('[M0.canvas] lights on the web the destination whose stack holds the page, the one it lights only as the fallback', () => {
    expect(at('album', 0)['BottomNav.active']).toEqual({ kind: 'lit', fallback: 'music' });
    expect(at('album', 1)['NavRail.active']).toEqual({ kind: 'lit', fallback: 'music' });
    expect(at('browse', 1)['NavRail.active']).toEqual({ kind: 'lit', fallback: 'browse' });
  });

  it("[M0.canvas] keeps a page at the rail's foot lit as itself, and a page lighting nothing unlit on the bottom bar", () => {
    expect(at('settings', 1)['NavRail.active']).toBeUndefined();
    expect(at('settings', 0)['BottomNav.active']).toBeUndefined();
  });

  it("[M0.canvas] leaves Android's lit item as nav.json says until its own generator follows the back stack", () => {
    const android = shellHandlers(
      nav,
      page('album'),
      { chrome: chrome(nav, shell, page('album'), nav.layouts[0]!, new Set()) },
      'android',
    );
    expect(wiring(android)['BottomNav.active']).toBeUndefined();
  });

  it('[M0.canvas] opens Now Playing from the mini-player, on the phone and on desktop', () => {
    expect(at('album', 0)['MiniPlayer.onOpen']).toEqual({ kind: 'open', page: 'nowPlaying' });
    expect(at('album', 1)['MiniPlayer.onOpen']).toEqual({ kind: 'open', page: 'nowPlaying' });
  });

  it("[M0.canvas] lets the rail's hamburger collapse and expand it, from the width's own default", () => {
    expect(at('album', 1)['NavRail.onToggleExpanded']).toEqual({ kind: 'rail', expanded: true });
    expect(at('album', 0)['NavRail.onToggleExpanded']).toBeUndefined();
  });

  it("[M0.canvas] gives Android's back what the close control does, and nothing on a page that does not close", () => {
    expect(closeAction(nav, page('album'))).toEqual({ kind: 'close', home: 'music' });
    expect(closeAction(nav, page('queue'))).toEqual({ kind: 'close', home: 'browse' });
    expect(closeAction(nav, page('music'))).toBeUndefined();
  });

  it("[M0.canvas] switches the side panel's tabs to that sheet", () => {
    expect(at('album', 1)['NowPlaying.onTabChange']).toEqual({ kind: 'tab' });
  });

  it('[M0.canvas] closes a player sheet to the page under it, and switches its tabs between sheets', () => {
    const root = playerTree(playerTab(page('queue')), []);
    expect(wiring(shellHandlers(nav, page('queue'), { player: root }))).toEqual({
      'NowPlaying.onClose': { kind: 'close', home: 'browse' },
      'NowPlaying.onTabChange': { kind: 'tab' },
    });
  });

  it('[M0.canvas] wires nothing on a bare page, which has no shell', () => {
    expect(at('signIn', 0)).toEqual({});
  });

  it('[M0.canvas] opens Now Playing only on a platform that has the page', () => {
    const without = parseNav({
      ...nav,
      pages: nav.pages.map((p) => (p.id === 'nowPlaying' ? { ...p, platforms: ['android'] } : p)),
    });
    const handlers = shellHandlers(
      without,
      page('album'),
      { chrome: chrome(without, shell, page('album'), without.layouts[0]!, new Set()) },
      'web',
    );
    expect(wiring(handlers)['MiniPlayer.onOpen']).toBeUndefined();
  });
});
