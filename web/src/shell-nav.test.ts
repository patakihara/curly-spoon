import { describe, expect, it } from 'vitest';
import { Rail, Stacks, type NavMap, type Store } from './shell-nav';

const map: NavMap = {
  homes: { browse: '/', music: '/music', books: '/books' },
  foot: { settings: '/settings' },
  tabs: { now: '/playing', queue: '/playing/queue', lyrics: '/playing/lyrics' },
  pages: [
    { path: '/', lights: 'browse', sheet: false },
    { path: '/music', lights: 'music', sheet: false },
    { path: '/music/albums/:ref', lights: 'music', sheet: false },
    { path: '/music/artists/:ref', lights: 'music', sheet: false },
    { path: '/books', lights: 'books', sheet: false },
    { path: '/settings', lights: null, sheet: false },
    { path: '/playing', lights: null, sheet: true },
    { path: '/playing/queue', lights: null, sheet: true },
    { path: '/playing/lyrics', lights: null, sheet: true },
    { path: '*', lights: null, sheet: false },
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
  const seen = (kind: 'PUSH' | 'POP' | 'REPLACE') => {
    if (kind !== 'POP' || keys[at] === undefined) keys[at] = `k${n++}`;
    stacks.seen(entries[at]!, kind, keys[at]!);
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
    open: push,
    close: (home: string) => push(stacks.close(home)),
    destination: (key: string) => {
      const to = stacks.destination(key);
      if (to !== undefined) push(to);
    },
    tab: (tab: string) => {
      const { to, replace } = stacks.tab(tab);
      if (replace) {
        entries[at] = to;
        seen('REPLACE');
      } else push(to);
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

  it("[M0.canvas] opens a tab's sheet over a page from the side panel, closing back to that page", () => {
    const a = leaveMusicOnAnAlbum();
    a.tab('queue');
    expect(a.showing).toBe('/playing/queue');
    a.close('browse');
    expect(a.showing).toBe('/music/albums/shadows-and-sighs');
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
