import { matchPath } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Panel, Rail, Stacks, type NavMap, type Store } from './shell-nav';

const map: NavMap = {
  homes: { browse: '/', music: '/music', books: '/books' },
  foot: { settings: '/settings' },
  tabs: { now: '/playing', queue: '/playing/queue', lyrics: '/playing/lyrics' },
  pages: [
    { path: '/', lights: 'browse', sheet: false, kept: true },
    { path: '/music', lights: 'music', sheet: false, kept: true },
    { path: '/music/albums/:ref', lights: 'music', sheet: false, kept: true },
    { path: '/music/artists/:ref', lights: 'music', sheet: false, kept: true },
    { path: '/books', lights: 'books', sheet: false, kept: true },
    { path: '/settings', lights: null, sheet: false, kept: true },
    { path: '/setup', lights: null, sheet: false, kept: false },
    { path: '/sign-in', lights: null, sheet: false, kept: false },
    { path: '/playing', lights: null, sheet: true, kept: true },
    { path: '/playing/queue', lights: null, sheet: true, kept: true },
    { path: '/playing/lyrics', lights: null, sheet: true, kept: true },
    { path: '*', lights: null, sheet: false, kept: false },
  ],
};

/** A tab's session storage, which survives a reload. */
function session(): Store {
  let held: string | null = null;
  return { read: () => held, write: (value) => void (held = value) };
}

/**
 * The app's history as the router moves through it, each step recorded as a page records it. A
 * reload starts the stacks again from the tab's session storage, on the entry it was showing.
 */
function app(first: string) {
  const store = session();
  let stacks = new Stacks(map, store);
  let n = 0;
  const entries = [first];
  const keys: string[] = [];
  let at = 0;
  /**
   * What the rail lit as the page rendered, before the location was recorded, and as it rendered
   * again after. A page asks only where its rail follows the stacks, as the generated pages do:
   * not at the rail's foot nor on a player sheet; a page nothing opens lights Browse.
   */
  let lit: string | undefined;
  let litAfter: string | undefined;
  const seen = (kind: 'PUSH' | 'POP' | 'REPLACE') => {
    if (kind !== 'POP' || keys[at] === undefined) keys[at] = `k${n++}`;
    const where = entries[at]!;
    const key = keys[at]!;
    const page = map.pages.find((p) => matchPath(p.path, where.split('?')[0]!) !== null)!;
    const asks = page.lights !== null || page.path === '*';
    const fallback = page.lights ?? 'browse';
    lit = asks ? stacks.lit(where, kind, key, fallback) : undefined;
    stacks.seen(where, kind, key);
    litAfter = asks ? stacks.lit(where, kind, key, fallback) : undefined;
  };
  seen('POP');
  const push = (path: string) => {
    entries.splice(at + 1, Infinity, path);
    keys.splice(at + 1, Infinity);
    at++;
    seen('PUSH');
  };
  return {
    get stacks() {
      return stacks;
    },
    get showing() {
      return entries[at];
    },
    get length() {
      return entries.length;
    },
    get lit() {
      return lit;
    },
    /** What the rail lights when the page renders again on the same location, as on a hamburger tap. */
    get litAfter() {
      return litAfter;
    },
    open: push,
    close: (home: string) => push(stacks.close(home)),
    destination: (key: string) => {
      const to = stacks.destination(key);
      if (to !== undefined) push(to);
    },
    tab: (tab: string) => {
      entries[at] = stacks.tab(tab);
      seen('REPLACE');
    },
    /** A player sheet's route, where the layout holds the panel: replaced by the page under it. */
    underSheet: () => {
      entries[at] = stacks.underSheet();
      seen('REPLACE');
    },
    back: () => {
      at--;
      seen('POP');
    },
    forward: () => {
      at++;
      seen('POP');
    },
    reload: () => {
      stacks = new Stacks(map, store);
      seen('POP');
    },
    /** `path` typed into the address bar: a new history entry on a fresh load, the session kept. */
    load: (path: string) => {
      entries.splice(at + 1, Infinity, path);
      keys.splice(at + 1, Infinity);
      at++;
      stacks = new Stacks(map, store);
      seen('POP');
    },
  };
}

/** Music, an album from its home, its artist, then one of the artist's albums. */
function leaveMusicOnAnAlbum() {
  const a = app('/');
  a.destination('music');
  a.open('/music/albums/tears-of-ice');
  a.open('/music/artists/deep-inertia');
  a.open('/music/albums/shadows-and-sighs');
  return a;
}

describe("the web's navigation stacks", () => {
  it('[M0.canvas] closes a page to whatever opened it', () => {
    const a = leaveMusicOnAnAlbum();
    a.close('music');
    expect(a.showing).toBe('/music/artists/deep-inertia');
  });

  it('[M0.canvas] keeps each destination its own stack: leave Music on an album, come back, and close goes to the artist', () => {
    const a = leaveMusicOnAnAlbum();
    a.destination('books');
    expect(a.showing).toBe('/books');
    a.destination('music');
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
    a.close('music');
    expect(a.showing).toBe('/music/artists/deep-inertia');
  });

  it('[M0.canvas] closes a page with nothing under it to the home of the destination it lights', () => {
    const a = app('/music/albums/tears-of-ice');
    a.close('music');
    expect(a.showing).toBe('/music');
  });

  it('[M0.canvas] closes a page that lights no destination to the home it is given, with nothing under it', () => {
    const a = app('/settings');
    a.close('browse');
    expect(a.showing).toBe('/');
  });

  it('[M0.canvas] closes a sheet to the page under it, after switching tabs in place', () => {
    const a = leaveMusicOnAnAlbum();
    a.open('/playing');
    a.tab('queue');
    a.tab('lyrics');
    expect(a.showing).toBe('/playing/lyrics');
    a.close('browse');
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
  });

  it("[M0.canvas] gives way to the page under a player sheet's route where the panel holds the player, and close still goes to its opener", () => {
    const a = leaveMusicOnAnAlbum();
    a.open('/playing/queue');
    a.underSheet();
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
    a.close('music');
    expect(a.showing).toBe('/music/artists/deep-inertia');
  });

  it("[M0.canvas] gives way to the destination's page under a player sheet's route reached from outside the app", () => {
    const a = app('/playing/lyrics');
    a.underSheet();
    expect(a.showing).toBe('/');
  });

  it("[M0.canvas] opens a page at the rail's foot over the page showing, closing back to it", () => {
    const a = leaveMusicOnAnAlbum();
    a.destination('settings');
    expect(a.showing).toBe('/settings');
    a.close('browse');
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
  });

  it("[M0.canvas] follows the browser's back to the previous view, and keeps the stacks true to it", () => {
    const a = leaveMusicOnAnAlbum();
    a.destination('books');
    a.back();
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
    a.back();
    a.close('music');
    expect(a.showing).toBe('/music/albums/tears-of-ice');
  });

  it('[M0.canvas] records a location once, however many pages on it report it', () => {
    const stacks = new Stacks(map);
    stacks.seen('/music', 'POP', 'a');
    stacks.seen('/music/albums/x', 'PUSH', 'b');
    stacks.seen('/music/albums/x', 'PUSH', 'b');
    expect(stacks.close('music')).toBe('/music');
  });

  it('[M0.canvas] closes a page opened by a link from outside the app to the home of the destination it lights', () => {
    const a = app('/music/albums/tears-of-ice');
    a.close('music');
    expect(a.showing).toBe('/music');
    a.back();
    expect(a.showing).toBe('/music/albums/tears-of-ice');
    a.close('music');
    expect(a.showing).toBe('/music');
  });

  it('[M0.canvas] keeps the stacks across a reload, so close still goes to the opener', () => {
    const a = leaveMusicOnAnAlbum();
    a.destination('books');
    a.destination('music');
    a.reload();
    a.close('music');
    expect(a.showing).toBe('/music/artists/deep-inertia');
    a.destination('books');
    a.reload();
    a.destination('music');
    expect(a.showing).toBe('/music/artists/deep-inertia');
  });

  it('[M0.canvas] starts afresh on a reload when the session holds nothing it can read', () => {
    const store: Store = { read: () => '{"current":7}', write: () => undefined };
    const stacks = new Stacks(map, store);
    stacks.seen('/music/albums/x', 'POP', 'a');
    expect(stacks.close('music')).toBe('/music');
  });

  it("[M0.canvas] follows the browser's forward as it follows its back", () => {
    const a = leaveMusicOnAnAlbum();
    a.destination('books');
    a.back();
    a.back();
    a.forward();
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
    a.forward();
    expect(a.showing).toBe('/books');
    a.destination('music');
    a.close('music');
    expect(a.showing).toBe('/music/artists/deep-inertia');
  });

  it('[M0.states/d] leaves a page that lights another destination, or none, for the destination tapped', () => {
    const avatar = app('/');
    avatar.open('/settings');
    avatar.destination('browse');
    expect(avatar.showing).toBe('/');

    const unknown = app('/no-such-page');
    unknown.destination('browse');
    expect(unknown.showing).toBe('/');

    const card = app('/');
    card.open('/music/albums/tears-of-ice');
    card.destination('browse');
    expect(card.showing).toBe('/');
  });

  it('[M0.canvas] adds no history for the destination already showing, so back leaves it', () => {
    const a = app('/');
    a.destination('music');
    a.destination('music');
    a.destination('music');
    expect(a.length).toBe(2);
    a.back();
    expect(a.showing).toBe('/');
  });

  it('[M0.canvas] walks back through two destinations taken in turn one view at a time, never round in a loop', () => {
    const a = leaveMusicOnAnAlbum();
    a.destination('books');
    a.destination('music');
    a.destination('books');
    a.destination('music');
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      a.back();
      seen.push(a.showing!);
    }
    expect(seen).toEqual([
      '/books',
      '/music/albums/shadows-and-sighs',
      '/books',
      '/music/albums/shadows-and-sighs',
      '/music/artists/deep-inertia',
      '/music/albums/tears-of-ice',
    ]);
    a.close('music');
    expect(a.showing).toBe('/music');
  });
});

describe('the destination the rail and the bottom bar light', () => {
  it('[M0.canvas] is the one a page was opened from: an album from a Browse card lights Browse', () => {
    const a = app('/');
    expect(a.lit).toBe('browse');
    a.open('/music/albums/tears-of-ice');
    expect(a.lit).toBe('browse');
  });

  it("[M0.canvas] is Music for an album opened from Music's list", () => {
    const a = app('/');
    a.destination('music');
    expect(a.lit).toBe('music');
    a.open('/music/albums/tears-of-ice');
    expect(a.lit).toBe('music');
  });

  it("[M0.canvas] follows the browser's back into whichever stack holds the page", () => {
    const a = app('/');
    a.open('/music/albums/tears-of-ice');
    a.destination('music');
    a.open('/music/albums/shadows-and-sighs');
    a.destination('browse');
    expect(a.showing).toBe('/music/albums/tears-of-ice');
    expect(a.lit).toBe('browse');
    a.back();
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
    expect(a.lit).toBe('music');
    a.back();
    a.back();
    expect(a.showing).toBe('/music/albums/tears-of-ice');
    expect(a.lit).toBe('browse');
  });

  it('[M0.canvas] is the destination the page lights when nothing is under it, as from a link from outside the app', () => {
    expect(app('/music/albums/tears-of-ice').lit).toBe('music');
    expect(app('/books').lit).toBe('books');
  });

  it('[M0.canvas] stays the opener across a reload, as the stacks kept in the session say', () => {
    const a = app('/');
    a.open('/music/albums/tears-of-ice');
    a.reload();
    expect(a.lit).toBe('browse');
  });

  it('[M0.canvas] is worked out without changing the stacks, so close still goes to the opener', () => {
    const a = app('/');
    a.open('/music/albums/tears-of-ice');
    for (const arrival of ['PUSH', 'POP', 'REPLACE'] as const)
      a.stacks.lit('/music/artists/deep-inertia', arrival, `elsewhere-${arrival}`, 'music');
    a.close('music');
    expect(a.showing).toBe('/');
  });

  it('[M0.canvas] is the destination whose home a link goes to, from wherever it is followed, so tapping it adds nothing and the others act as ever', () => {
    const a = app('/');
    a.destination('music');
    a.open('/no-such-page');
    expect(a.lit).toBe('music');
    a.open('/');
    expect(a.lit).toBe('browse');
    a.destination('browse');
    expect(a.showing).toBe('/');
    a.destination('music');
    expect(a.showing).toBe('/music');
    expect(a.lit).toBe('music');
    a.destination('browse');
    expect(a.showing).toBe('/');
    expect(a.lit).toBe('browse');
  });

  it('[M0.canvas] is Browse once setup is finished, whichever destination was in use before it', () => {
    const a = app('/');
    a.destination('music');
    a.open('/setup');
    a.open('/');
    expect(a.lit).toBe('browse');
    a.destination('music');
    expect(a.showing).toBe('/music');
  });

  it('[M0.canvas] is decided once as a page arrives, the same however often the page renders again', () => {
    const typed = app('/');
    typed.destination('music');
    typed.load('/no-such-page');
    expect(typed.litAfter).toBe(typed.lit);

    const pushed = app('/');
    pushed.destination('music');
    pushed.open('/no-such-page');
    expect(pushed.litAfter).toBe(pushed.lit);

    const steps = leaveMusicOnAnAlbum();
    for (const step of [
      () => steps.destination('books'),
      () => steps.back(),
      () => steps.forward(),
      () => steps.reload(),
      () => steps.open('/'),
      () => steps.back(),
    ]) {
      step();
      expect(steps.litAfter).toBe(steps.lit);
    }
  });

  it('[M0.canvas] goes to its home when tapped from any page of its own that is not its home, Music as Browse', () => {
    const music = app('/');
    music.destination('music');
    music.open('/music/albums/tears-of-ice');
    expect(music.lit).toBe('music');
    music.destination('music');
    expect(music.showing).toBe('/music');

    const deep = leaveMusicOnAnAlbum();
    deep.destination('music');
    expect(deep.showing).toBe('/music');
    deep.close('music');
    expect(deep.showing).toBe('/music');

    const browse = app('/');
    browse.open('/music/albums/tears-of-ice');
    browse.open('/music/artists/deep-inertia');
    expect(browse.lit).toBe('browse');
    browse.destination('browse');
    expect(browse.showing).toBe('/');
  });
});

describe("a player sheet's route reached from outside the app", () => {
  it('[M0.canvas] gives way to the home in use, whatever the page drawn under it lights', () => {
    const stacks = new Stacks(map);
    expect(stacks.lit('/playing', 'POP', 'k0', 'music')).toBe('browse');
    stacks.seen('/playing', 'POP', 'k0');
    expect(stacks.underSheet()).toBe('/');
  });
});

describe('a page never meant to be returned to', () => {
  it('[M0.canvas] is kept in no stack: a destination tapped later never reopens a page that does not exist', () => {
    const a = app('/');
    a.destination('music');
    a.open('/no-such-page');
    a.destination('browse');
    a.destination('music');
    expect(a.showing).toBe('/music');
  });

  it('[M0.canvas] still closes to the page that opened it', () => {
    const a = app('/');
    a.destination('music');
    a.open('/music/albums/tears-of-ice');
    a.open('/no-such-page');
    a.close('browse');
    expect(a.showing).toBe('/music/albums/tears-of-ice');
    a.close('music');
    expect(a.showing).toBe('/music');
  });

  it('[M0.canvas] is kept in no stack when signing in, so a destination tapped after goes to its own page', () => {
    const a = app('/');
    a.destination('books');
    a.open('/sign-in');
    a.destination('books');
    expect(a.showing).toBe('/books');
  });
});

describe("the rail's hamburger", () => {
  it("[M0.canvas] follows the width's own default until it is tapped", () => {
    const rail = new Rail(session());
    expect(rail.expanded(true)).toBe(true);
    expect(rail.expanded(false)).toBe(false);
  });

  it('[M0.canvas] collapses the labelled rail to the icon rail and back, and keeps it so across pages and a reload', () => {
    const store = session();
    const rail = new Rail(store);
    const heard: boolean[] = [];
    rail.subscribe(() => heard.push(rail.expanded(true)));
    rail.toggle(true);
    expect(rail.expanded(true)).toBe(false);
    expect(new Rail(store).expanded(true)).toBe(false);
    rail.toggle(false);
    expect(rail.expanded(true)).toBe(true);
    expect(heard).toEqual([false, true]);
  });
});

describe("the desktop mini-player's Queue and Lyrics", () => {
  it('hold no tab of the player panel until one is tapped, so each width shows its own', () => {
    expect(new Panel(map.tabs, session()).tab()).toBeUndefined();
  });

  it('show the panel at the tab tapped, and back at Now Playing when it already shows it', () => {
    const panel = new Panel(map.tabs, session());
    const heard: (string | undefined)[] = [];
    panel.subscribe(() => heard.push(panel.tab()));
    panel.toggle('queue');
    expect(panel.tab()).toBe('queue');
    panel.toggle('lyrics');
    expect(panel.tab()).toBe('lyrics');
    panel.toggle('lyrics');
    expect(panel.tab()).toBe('now');
    expect(heard).toEqual(['queue', 'lyrics', 'now']);
  });

  it("switch the panel's own tabs within it and close it, and keep it so across pages and a reload", () => {
    const store = session();
    const panel = new Panel(map.tabs, store);
    panel.show('queue');
    expect(new Panel(map.tabs, store).tab()).toBe('queue');
    panel.close();
    expect(panel.tab()).toBeUndefined();
    expect(new Panel(map.tabs, store).tab()).toBeUndefined();
  });

  it('start afresh on a reload when the session holds no tab of the player', () => {
    const store = session();
    store.write('"settings"');
    expect(new Panel(map.tabs, store).tab()).toBeUndefined();
  });
});
