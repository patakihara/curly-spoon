import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import type { PageTree } from './page.js';
import { framePage } from './shell.js';
import { bindings, dataRoots, elements, readPage, shown, type Element } from './test-pages.js';

type Row = Record<string, unknown>;
type Verb = { key: string; label: string; sub?: string };

const one = (tree: PageTree, component: string): Element => {
  const found = elements(tree).filter((e) => e.component === component);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const slotted = (e: Element, prop: string): Element | undefined => {
  const v = e.props[prop];
  return v?.kind === 'slot' && v.tree.kind === 'element' ? v.tree : undefined;
};
const lit = (value: string | number | boolean | null) => ({ kind: 'literal', value });
const bound = (...path: string[]) => ({ kind: 'binding', path });
const sectionTitles = (tree: PageTree) =>
  elements(tree)
    .filter((e) => e.component === 'Section' && e.props.title !== undefined)
    .map((e) => e.props.title);

/** A song you own is never offered Add to library; one you don't may be. */
const offersAdd = (menu: Verb[]) => menu.some((v) => v.key === 'addToLibrary');

describe('Album', () => {
  const { tree, data } = readPage('album');
  const header = one(tree, 'MediaHeader');
  const tracks = data.tracks as (Row & { menu: Verb[] })[];

  it("[M0.canvas] opens the artist's page from its artist line, on the web through the router", () => {
    expect(header.props.onSubtitle).toEqual({
      kind: 'open',
      page: 'artist',
      params: { ref: ['data', 'artistRef'] },
    });
    const web = readFileSync(join(REPO_ROOT, 'web/src/generated/pages/Album.tsx'), 'utf8');
    expect(web).toContain(
      "onSubtitle={() => navigate(generatePath('/music/artists/:ref', { ref: data.artistRef }))}",
    );
  });

  it('[M0.canvas] binds only the album: its name, kind, artist, meta, art, menu, tracks, editions and more by the artist', () => {
    expect(dataRoots(tree)).toEqual([
      'artist',
      'artistRef',
      'editions',
      'image',
      'kind',
      'menu',
      'meta',
      'more',
      'title',
      'tracks',
    ]);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it("[M0.canvas] names the album once, in the page's heading, and not again in its header", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(Object.keys(header.props)).not.toContain('title');
  });

  it('[M0.canvas] has a local search in its back layer, scoped to the album', () => {
    expect(framePage(tree).search).toBe('Search this album');
  });

  it("[M0.canvas] plays the album or adds it to the end of the queue, an album's default, and keeps play next for a long press", () => {
    expect(header.props.nextLabel).toEqual(lit(null));
    expect(header.props.lastLabel).toEqual(lit('Add to queue'));
    expect(Object.keys(header.props)).not.toContain('playLabel');
  });

  it('[M0.canvas] puts Add to library in the menu after the buttons, as a lossless torrent request', () => {
    const menu = slotted(header, 'menu');
    expect(menu?.component).toBe('OverflowMenu');
    expect(menu?.props.items).toEqual(bound('data', 'menu'));
    const add = (data.menu as Verb[]).find((v) => v.key === 'addToLibrary');
    expect(add?.label).toBe('Add to library');
    expect(add?.sub).toMatch(/lossless/);
    expect(add?.sub).toMatch(/torrent/);
  });

  it("[M0.canvas] streams an album you don't own from YouTube Music until it arrives", () => {
    expect(offersAdd(data.menu as Verb[])).toBe(true);
    expect(data.meta).toMatch(/Plays from YouTube Music$/);
  });

  it('[M0.canvas] lists its tracks numbered in order, each with its own menu, and at most one playing', () => {
    const row = one(tree, 'ResultRow');
    expect(row.props.number).toEqual(bound('track', 'number'));
    expect(slotted(row, 'trailing')?.component).toBe('OverflowMenu');
    expect(tracks.map((t) => t.number)).toEqual(tracks.map((_, i) => i + 1));
    expect(tracks.filter((t) => t.status === 'Playing').length).toBeLessThanOrEqual(1);
    for (const t of tracks) expect([null, 'Playing']).toContain(t.status);
  });

  it('[M0.canvas] folds its editions under the one album', () => {
    expect(one(tree, 'ExpanderRow').props.label).toEqual(bound('data', 'editions', 'label'));
    expect((data.editions as Row).label).toMatch(/^\d+ editions · /);
  });
});

describe('Artist', () => {
  const { tree, data } = readPage('artist');
  const header = one(tree, 'MediaHeader');
  const groups = data.discography as { name: string; size: string; items: Row[] }[];
  const releases = groups.flatMap((g) => g.items);
  const owned = new Set((data.library as Row[]).map((r) => r.title));

  it('[M0.canvas] binds only the artist: name, kind, meta, image, library, discography, popular songs and similar artists', () => {
    expect(dataRoots(tree)).toEqual([
      'discography',
      'image',
      'kind',
      'library',
      'meta',
      'popular',
      'similar',
      'title',
    ]);
    expect(bindings(tree).filter((p) => p.startsWith('shell.'))).toEqual([]);
  });

  it("[M0.canvas] is headed by the artist's name, with a round image and no queue buttons", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(header.props.round).toEqual(lit(true));
    expect(Object.keys(header.props)).not.toContain('title');
    for (const label of ['playLabel', 'nextLabel', 'lastLabel'])
      expect(header.props[label]).toEqual(lit(null));
  });

  it('[M0.canvas] shows what you own by them first, then the discography by group, then popular and similar', () => {
    expect(sectionTitles(tree)).toEqual([
      lit('In your library'),
      bound('group', 'name'),
      lit('Popular'),
      lit('Similar artists'),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Albums', 'EPs', 'Singles', 'Compilations', 'Live']);
  });

  it('[M0.canvas] opens the album from every card of its library carousel and its discography', () => {
    const cards = elements(tree).filter((e) => e.component === 'MediaCard');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const item = card.props.title?.kind === 'binding' ? card.props.title.path[0]! : '';
      expect(card.props.onClick).toEqual({
        kind: 'open',
        page: 'album',
        params: { ref: [item, 'ref'] },
      });
    }
    for (const r of [...(data.library as Row[]), ...releases])
      expect(r.ref).toMatch(/^[a-z0-9-]+$/);
  });

  it('[M0.canvas] lists each album once in its discography, never an edition beside it', () => {
    const titles = releases.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) expect(title).not.toMatch(/deluxe|remaster|edition/i);
  });

  it('[M0.canvas] greys what you do not own and shows a request in its tone, and never makes an owned title requestable', () => {
    const card = elements(tree).find(
      (e) => e.component === 'MediaCard' && e.props.absent !== undefined,
    );
    expect(card?.props.absent).toEqual(bound('release', 'absent'));
    expect(card?.props.status).toEqual(bound('release', 'status'));
    for (const r of releases) {
      if (owned.has(r.title)) expect([r.absent, r.status, r.tone]).toEqual([false, null, null]);
      else if (r.status === null) expect(r.absent).toBe(true);
      else expect([r.absent, r.status, r.tone]).toEqual([false, r.status, 'progress']);
    }
    expect(releases.some((r) => r.absent)).toBe(true);
    for (const title of owned) expect(releases.map((r) => r.title)).toContain(title);
  });

  it('[M0.canvas] offers Add to library on a popular song only when you do not own it', () => {
    const songs = data.popular as (Row & { menu: Verb[] })[];
    for (const song of songs) {
      const release = String(song.meta).split(' · ')[0];
      const yours = owned.has(song.title) || owned.has(release);
      expect(offersAdd(song.menu)).toBe(!yours);
    }
  });
});

describe('Playlist', () => {
  const { tree, data } = readPage('playlist');

  it('[M0.canvas] binds only the playlist: its name, kind, meta, art and songs', () => {
    expect(dataRoots(tree)).toEqual(['image', 'kind', 'meta', 'songs', 'title']);
  });

  it("[M0.canvas] is headed by the playlist's name, with a local search scoped to it", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(framePage(tree).search).toBe('Search this playlist');
    expect(Object.keys(one(tree, 'MediaHeader').props)).not.toContain('title');
  });

  it('[M0.canvas] lists its songs in your order, each with a handle to drag it', () => {
    const handle = slotted(one(tree, 'ResultRow'), 'trailing');
    expect(handle?.component).toBe('IconButton');
    expect(handle?.props.icon).toEqual(lit('drag_handle'));
    expect((data.songs as Row[]).length).toBeGreaterThan(1);
  });
});

describe('Favourites', () => {
  const { tree, data } = readPage('favourites');

  it('[M0.canvas] binds only its songs, under nav.json\'s "Favourites"', () => {
    expect(dataRoots(tree)).toEqual(['songs']);
    expect(framePage(tree).title).toBeUndefined();
  });

  it('[M0.canvas] gives each song its menu, and at most one playing', () => {
    expect(slotted(one(tree, 'ResultRow'), 'trailing')?.component).toBe('OverflowMenu');
    const songs = data.songs as Row[];
    expect(songs.filter((s) => s.status === 'Playing').length).toBeLessThanOrEqual(1);
  });
});

describe('Add to library', () => {
  const pages = readdirSync(join(REPO_ROOT, APP_DIR, 'pages')).map((f) => ({
    id: f.replace('.page.jsx', ''),
    ...readPage(f.replace('.page.jsx', '')),
  }));

  it('[M0.canvas] is never a button on a card, a row or a header, on any page, given or bound', () => {
    for (const { id, tree, data } of pages) {
      for (const { element, values, text } of shown(tree, data)) {
        if (element.component === 'OverflowMenu') continue;
        const said = [...Object.keys(element.props).flatMap(values), ...text];
        const offered = said.filter((v) => typeof v === 'string' && /add to library/i.test(v));
        expect(offered, `${id}: ${element.component} at line ${element.line}`).toEqual([]);
      }
    }
  });
});

describe('What you own', () => {
  const { tree, data } = readPage('artist');

  it('[M0.canvas] is never requestable: a card of your library carries no request, bound or given', () => {
    const cards = shown(tree, data).filter((s) => s.within.includes('data.library'));
    expect(cards.length).toBeGreaterThan(0);
    for (const { values } of cards) {
      for (const prop of ['status', 'tone', 'absent']) {
        for (const v of values(prop)) expect([null, false, undefined]).toContain(v);
      }
    }
  });
});
