import { describe, expect, it } from 'vitest';
import { Stacks, type NavMap } from './shell-nav';

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

/** The app's history as the router moves through it, each step recorded as a page records it. */
function app(first: string) {
  const stacks = new Stacks(map);
  let n = 0;
  const entries = [first];
  let at = 0;
  const seen = (kind: 'PUSH' | 'POP' | 'REPLACE') => stacks.seen(entries[at]!, kind, `k${n++}`);
  seen('POP');
  const push = (path: string) => {
    entries.splice(at + 1, Infinity, path);
    at++;
    seen('PUSH');
  };
  return {
    stacks,
    get showing() {
      return entries[at];
    },
    open: push,
    close: (home: string) => push(stacks.close(home)),
    destination: (key: string) => push(stacks.destination(key)),
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
});
