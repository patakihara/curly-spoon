import { ListDetail, type ListItem, type ListSummary, type ListUnmatched } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { frame as list } from '../generated/pages/List';
import { frame as playlist } from '../generated/pages/Playlist';
import { listCards, listData, musicCards, playlistData } from './lists';

const episode = (over: Partial<ListItem> = {}): ListItem => ({
  ref: { source: 'abs', id: 'ep-1' },
  kind: 'episode',
  title: 'Part One',
  sub: 'Megacorp',
  art: '/api/media/abs:s1/art',
  publishedAt: Date.UTC(2026, 7, 12),
  duration: 3120,
  progress: null,
  finished: false,
  ...over,
});

const detail = (over: Partial<ListDetail> = {}): ListDetail =>
  ListDetail.parse({
    id: 'list-1',
    kind: 'playlist',
    name: 'Commute',
    theDigest: false,
    order: null,
    count: 1,
    counts: { book: 0, show: 0, episode: 1 },
    covers: ['/api/media/abs:s1/art'],
    shows: [],
    items: [episode()],
    import: null,
    ...over,
  });

describe('[M2.lists] a list page from GET /api/lists/{id}', () => {
  it('[M2.lists] names a playlist by its kind, and draws each episode with its show, date and length', () => {
    const data = listData(detail(), list.placeholder);
    expect(data).toMatchObject({
      title: 'Commute',
      ref: 'list-1',
      kind: 'Playlist',
      meta: '1 episode',
      covers: ['/api/media/abs:s1/art?size=medium'],
      menu: [
        { key: 'rename', label: 'Rename', icon: 'edit' },
        { key: 'delete', label: 'Delete playlist', icon: 'delete' },
      ],
      shows: [],
      order: '',
    });
    expect(data.items).toEqual([
      {
        title: 'Part One',
        ref: 'abs:ep-1',
        page: 'episode',
        description: '',
        meta: ['Megacorp', '12 Aug 2026', '52 min'],
        image: '/api/media/abs:s1/art?size=small',
        progress: null,
      },
    ]);
  });

  it('[M2.lists] says what is left of an episode begun', () => {
    const [item] = listData(
      detail({ items: [episode({ progress: 0.4 })] }),
      list.placeholder,
    ).items;
    expect(item!.meta).toEqual(['Megacorp', '12 Aug 2026', '52 min', '31 min left']);
    expect(item!.progress).toBe(0.4);
  });

  it("[M2.lists] draws a digest with its shows, its order and its shows' covers", () => {
    const data = listData(
      detail({
        kind: 'digest',
        name: 'The Digest',
        theDigest: true,
        order: 'newest',
        count: 2,
        counts: { book: 0, show: 0, episode: 2 },
        covers: ['/api/media/abs:s1/art'],
        shows: [
          {
            ref: { source: 'abs', id: 's1' },
            kind: 'show',
            title: 'Megacorp',
            sub: 'A Host',
            art: '/api/media/abs:s1/art',
            progress: null,
            availability: { kind: 'owned' },
          },
        ],
        items: [episode(), episode({ ref: { source: 'abs', id: 'ep-2' }, title: 'Part Two' })],
      }),
      list.placeholder,
    );
    expect(data.kind).toBe('Digest');
    expect(data.meta).toBe('1 show · 2 episodes · newest first');
    expect(data.order).toBe('Newest first');
    expect(data.covers).toEqual(['/api/media/abs:s1/art?size=medium']);
    expect(data.shows).toEqual([
      {
        title: 'Megacorp',
        sub: 'A Host',
        image: '/api/media/abs:s1/art?size=small',
        ref: 'abs:s1',
      },
    ]);
  });

  it('[M2.lists] counts a listening list by its books and shows, a book with its author and length', () => {
    const data = listData(
      detail({
        kind: 'listening',
        count: 2,
        counts: { book: 1, show: 1, episode: 0 },
        items: [
          episode({
            ref: { source: 'abs', id: 'b1' },
            kind: 'book',
            title: 'The Salt Road',
            sub: 'Rosa Elin',
            publishedAt: null,
            duration: 36_000,
          }),
          episode({
            ref: { source: 'abs', id: 's1' },
            kind: 'show',
            sub: 'A Host',
            publishedAt: null,
            duration: null,
          }),
        ],
      }),
      list.placeholder,
    );
    expect(data.kind).toBe('List');
    expect(data.meta).toBe('1 book · 1 show');
    expect(data.items.map((i) => i.meta)).toEqual([['Rosa Elin', '10 h 0 m'], ['A Host']]);
  });

  it("[M2.lists] opens each entry's own page: a book's, a show's or an episode's", () => {
    const data = listData(
      detail({
        kind: 'listening',
        count: 3,
        counts: { book: 1, show: 1, episode: 1 },
        items: [
          episode({ ref: { source: 'abs', id: 'b1' }, kind: 'book' }),
          episode({ ref: { source: 'abs', id: 's1' }, kind: 'show' }),
          episode(),
        ],
      }),
      list.placeholder,
    );
    expect(data.items.map((i) => [i.page, i.ref])).toEqual([
      ['book', 'abs:b1'],
      ['show', 'abs:s1'],
      ['episode', 'abs:ep-1'],
    ]);
  });

  it('[M2.lists] covers a list by the covers it is given', () => {
    const data = listData(
      detail({ covers: ['/api/media/abs:s1/art', '/api/media/abs:s2/art'] }),
      list.placeholder,
    );
    expect(data.covers).toEqual([
      '/api/media/abs:s1/art?size=medium',
      '/api/media/abs:s2/art?size=medium',
    ]);
  });

  it('[M2.lists] draws an entry with no art and no show without a broken image or a stray word', () => {
    const [item] = listData(
      detail({ items: [episode({ art: null, sub: null, publishedAt: null, duration: null })] }),
      list.placeholder,
    ).items;
    expect(item!.image).toBe('');
    expect(item!.meta).toEqual([]);
  });
});

describe("[M2.lists] the Podcasts page's lists from GET /api/lists", () => {
  it('[M2.lists] draws each list as a card naming its kind and size, with the covers it is given, opening its page', () => {
    const summary = (over: Partial<ListSummary>): ListSummary => ({
      id: 'list-1',
      kind: 'playlist',
      name: 'Commute',
      theDigest: false,
      order: null,
      count: 1,
      counts: { book: 0, show: 0, episode: 1 },
      covers: ['/api/media/abs:s1/art'],
      ...over,
    });
    const cards = listCards([
      summary({
        id: 'd',
        kind: 'digest',
        name: 'The Digest',
        theDigest: true,
        order: 'oldest',
        count: 0,
        counts: { book: 0, show: 0, episode: 0 },
        covers: [],
      }),
      summary({}),
      summary({
        id: 'l2',
        kind: 'listening',
        name: 'Books',
        count: 3,
        counts: { book: 2, show: 1, episode: 0 },
      }),
    ]);
    expect(cards).toEqual([
      { title: 'The Digest', ref: 'd', sub: 'Digest · 0 episodes', covers: [] },
      {
        title: 'Commute',
        ref: 'list-1',
        sub: 'Playlist · 1 episode',
        covers: ['/api/media/abs:s1/art?size=medium'],
      },
      {
        title: 'Books',
        ref: 'l2',
        sub: 'List · 2 books · 1 show',
        covers: ['/api/media/abs:s1/art?size=medium'],
      },
    ]);
  });
});

describe('[M3.spotify] a music playlist, imported from Spotify, and your playlists on Music', () => {
  const song = (id: string, title: string, over: Partial<ListItem> = {}): ListItem => ({
    ref: { source: 'ytmusic', id },
    kind: 'song',
    title,
    sub: 'a-ha',
    art: `/api/media/ytmusic:${id}/art`,
    publishedAt: null,
    duration: 225,
    progress: null,
    finished: false,
    ...over,
  });
  const imported = (over: Partial<NonNullable<ListDetail['import']>>, items: ListItem[] = []) =>
    detail({
      id: 'm1',
      kind: 'music',
      name: 'All Out 80s',
      count: items.length,
      counts: { book: 0, show: 0, episode: 0 },
      covers: ['/api/media/ytmusic:take-on-me/art'],
      items,
      import: {
        source: 'spotify',
        state: 'done',
        done: 150,
        total: 150,
        unmatched: [],
        duplicates: 0,
        stopped: null,
        importedAt: 0,
        ...over,
      },
    });

  it('[M3.spotify] draws each song in the list’s order with its artists and length, playing it by its ref', () => {
    const data = playlistData(
      imported({}, [
        song('take-on-me', 'Take on Me'),
        song('gloria', 'Gloria', { sub: 'Laura Branigan', duration: 296 }),
      ]),
      playlist.placeholder,
    );
    expect(data).toMatchObject({
      title: 'All Out 80s',
      ref: 'm1',
      kind: 'Playlist',
      image: '/api/media/ytmusic:take-on-me/art?size=large',
    });
    expect(data.songs).toEqual([
      {
        title: 'Take on Me',
        meta: 'a-ha · 3:45',
        image: '/api/media/ytmusic:take-on-me/art?size=small',
        status: null,
        ref: 'ytmusic:take-on-me',
      },
      {
        title: 'Gloria',
        meta: 'Laura Branigan · 4:56',
        image: '/api/media/ytmusic:gloria/art?size=small',
        status: null,
        ref: 'ytmusic:gloria',
      },
    ]);
  });

  it('[M3.spotify] says how far an import has come while it runs, and how many were found once done', () => {
    const meta = (over: Partial<NonNullable<ListDetail['import']>>) =>
      playlistData(imported(over), playlist.placeholder).meta;
    expect(meta({ state: 'reading', done: 0, total: 0 })).toBe('Importing');
    expect(meta({ state: 'matching', done: 40, total: 150 })).toBe('Importing 40 of 150');
    const missing: ListUnmatched = {
      position: 3,
      reason: 'noMatch',
      title: 'x',
      artists: [],
      album: null,
      duration: null,
    };
    expect(meta({ unmatched: [missing, { ...missing, position: 9 }] })).toBe(
      'From Spotify · 148 of 150 found',
    );
    expect(meta({ state: 'stopped', stopped: 'spotify_unavailable', done: 12 })).toBe(
      'Import stopped: Spotify didn’t answer · 12 of 150 read',
    );
  });

  it('[M3.spotify] lists last the songs left off, with their artists, album and length and why', () => {
    const data = playlistData(
      imported({
        unmatched: [
          {
            position: 15,
            reason: 'noMatch',
            title: 'Heaven',
            artists: ['Bryan Adams'],
            album: 'Reckless',
            duration: 243,
          },
          {
            position: 40,
            reason: 'notASong',
            title: null,
            artists: [],
            album: null,
            duration: null,
          },
          {
            position: 1000,
            reason: 'listFull',
            title: 'Last',
            artists: ['A', 'B'],
            album: null,
            duration: 60,
          },
        ],
      }),
      playlist.placeholder,
    );
    expect(data.unmatched).toEqual([
      {
        songs: [
          {
            title: 'Heaven',
            meta: 'Bryan Adams · Reckless · 4:03',
            image: '',
            status: 'Not found',
          },
          { title: 'Unnamed', meta: '', image: '', status: 'Not a song' },
          { title: 'Last', meta: 'A, B · 1:00', image: '', status: 'List full' },
        ],
      },
    ]);
    expect(playlistData(imported({}), playlist.placeholder).unmatched).toEqual([]);
  });

  it('[M3.spotify] draws a music list made by hand by its size, with no import to say', () => {
    const data = playlistData(
      { ...imported({}, [song('a', 'A')]), import: null },
      playlist.placeholder,
    );
    expect(data.meta).toBe('1 song');
    expect(data.menu.map((i) => i.key)).toEqual(['rename', 'delete']);
  });

  it('[M3.spotify] puts music lists on Music and every other list on Podcasts', () => {
    const summary = (id: string, kind: ListSummary['kind'], count = 0): ListSummary => ({
      id,
      kind,
      name: id,
      theDigest: false,
      order: null,
      count,
      counts: { book: 0, show: 0, episode: 0 },
      covers: [],
    });
    const lists = [summary('p', 'playlist'), summary('m', 'music', 142)];
    expect(musicCards(lists)).toEqual([
      { title: 'm', ref: 'm', sub: 'Playlist · 142 songs', covers: [] },
    ]);
    expect(listCards(lists).map((card) => card.ref)).toEqual(['p']);
  });
});
