/**
 * Search on libraries built by hand, written through the index's own write path (`applyTree`)
 * from the index's own row type: a large one, where ranking and the kinds filter cover every match
 * before anything is cut; the edge of the hundredth result; names beside titles. How fast it
 * answers on 25 000 rows is `largeLibrary.timing.test.ts`.
 */
import { SearchResults, type SearchKind } from '@auralis/schema';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Creator, IndexKind, IndexRow, SeriesEntry } from '../libraryIndex/rows.js';
import { buildApp } from '../app.js';
import { applyTree, emptyCounts } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { createDevice } from '../store/devices.js';
import { createSession } from '../store/sessions.js';
import { upsertUser } from '../store/users.js';
import { librarySource, suggestFromIndex } from './library.js';

const T0 = Date.UTC(2026, 9, 13, 8);
const SOURCE: Record<IndexKind, IndexRow['source']> = {
  book: 'abs',
  show: 'abs',
  episode: 'abs',
  album: 'jellyfin',
  track: 'jellyfin',
};

function item(
  kind: IndexKind,
  id: string,
  title: string,
  more: { parentId?: string; creators?: Creator[]; series?: SeriesEntry[] } = {},
): IndexRow {
  return {
    source: SOURCE[kind],
    id,
    kind,
    parentId: more.parentId ?? null,
    libraryId: null,
    title,
    creators: more.creators ?? [],
    series: more.series ?? [],
    genres: [],
    position: null,
    disc: null,
    duration: 60,
    year: null,
    publishedAt: null,
    upstreamVersion: null,
    ids: {},
    episodeOrder: kind === 'show' ? 'unknown' : null,
    hasArt: false,
    hasLyrics: false,
  };
}

function write(db: Db, top: IndexRow, children: IndexRow[] = []) {
  applyTree(db, { top, children }, T0, emptyCounts());
}

/** An album of `count` tracks, each title from `track`, all by one artist. */
function album(
  db: Db,
  id: string,
  title: string,
  artist: { id: string; name: string },
  count: number,
  track: (n: number) => string,
) {
  const top = item('album', id, title, { creators: [{ ...artist, role: 'album-artist' }] });
  write(
    db,
    top,
    Array.from({ length: count }, (_, n) =>
      item('track', `${id}-${n}`, track(n), {
        parentId: id,
        creators: [{ ...artist, role: 'artist' }],
      }),
    ),
  );
}

const search = async (db: Db, q: string, kinds?: SearchKind[]) =>
  (await librarySource(db).search(kinds ? { q, kinds } : { q }, new AbortController().signal)).map(
    (r) => [r.tier, r.result.kind, r.result.title],
  );

describe('search on a large library, where many short titles match better than the ones asked for', () => {
  let db: Db;
  beforeAll(() => {
    db = openDatabase(':memory:');
    db.transaction(() => {
      const lovers = { id: 'artist-lovers', name: 'The Lovers' };
      album(db, 'love-songs', 'Love Songs', lovers, 600, (n) => `Love ${n}`);
      for (let n = 0; n < 40; n += 1) {
        write(
          db,
          item(
            'book',
            `book-${n}`,
            `A Long and Winding Story of Love and Other Things, Part ${n}`,
            {
              creators: [{ id: 'author-1', name: 'Mary Writer', role: 'author' }],
            },
          ),
        );
      }
      const kalimba = { id: 'artist-kalimba', name: 'Kalimba Player' };
      album(db, 'ka-tracks', 'Short Ones', kalimba, 600, (n) => `Ka ${n}`);
      for (let n = 0; n < 10; n += 1) {
        album(
          db,
          `kalimba-${n}`,
          `Kalimba Sessions Volume ${n} Recorded Live in a Very Long Hall`,
          kalimba,
          0,
          String,
        );
      }
      write(
        db,
        item('album', 'purple-rain', 'Purple Rain', {
          creators: [
            { id: 'artist-prince', name: 'Prince', role: 'album-artist' },
            { id: 'artist-revolution', name: 'The Revolution', role: 'album-artist' },
            { name: 'Wendy Melvoin and Lisa Coleman of the Revolution', role: 'artist' },
          ],
        }),
      );
      album(
        db,
        'princes',
        'Princes and Princesses',
        { id: 'artist-various', name: 'Various' },
        600,
        (n) => `Prince ${n}`,
      );
      album(
        db,
        'interludes',
        'Interludes and Codas',
        { id: 'artist-many', name: 'Many' },
        600,
        () => 'Interlude',
      );
      write(db, item('book', 'interlude-stories', 'Interlude Stories'));
    })();
  });
  afterAll(() => db.close());

  it('finds every book a kinds filter asks for', async () => {
    const books = await search(db, 'love', ['book']);

    expect(books).toHaveLength(40);
    expect(books.every(([tier, kind]) => tier === 2 && kind === 'book')).toBe(true);
  });

  it('ranks every album whose title starts with the query, filtered or not', async () => {
    const albums = await search(db, 'ka', ['album']);
    const all = await search(db, 'ka');

    const startingWithIt = albums.slice(0, 10);
    expect(startingWithIt.map(([tier, , title]) => [tier, title])).toEqual(
      Array.from({ length: 10 }, (_, n) => [
        1,
        `Kalimba Sessions Volume ${n} Recorded Live in a Very Long Hall`,
      ]),
    );
    expect(albums.slice(10)).toEqual([[3, 'album', 'Short Ones']]);
    expect(all.slice(0, 11)).toContainEqual([1, 'artist', 'Kalimba Player']);
    expect(all.slice(0, 11).filter(([, kind]) => kind !== 'artist')).toEqual(startingWithIt);
  });

  it('names an artist by their whole name, and finds their album, however many tracks start with that name', async () => {
    expect((await search(db, 'prince'))[0]).toEqual([0, 'artist', 'Prince']);
    expect(await search(db, 'prince', ['album'])).toEqual([
      [1, 'album', 'Princes and Princesses'],
      [3, 'album', 'Purple Rain'],
    ]);
  });

  it('suggests each text once, however many rows share the best one', () => {
    const suggested = suggestFromIndex(db, 'interlude', 8).map((s) => [s.kind, s.text]);

    expect(suggested).toHaveLength(3);
    expect(suggested[0]).toEqual(['track', 'Interlude']);
    expect(suggested).toContainEqual(['album', 'Interludes and Codas']);
    expect(suggested).toContainEqual(['book', 'Interlude Stories']);
  });
});

describe('a kinds filter through the route, on more matches than one answer holds', () => {
  it('answers that kind’s own first hundred, though other kinds fill the hundred unfiltered', async () => {
    const db = openDatabase(':memory:');
    db.transaction(() => {
      album(
        db,
        'love-songs',
        'Love Songs',
        { id: 'artist-lovers', name: 'The Lovers' },
        600,
        (n) => `Love ${n}`,
      );
      for (let n = 0; n < 150; n += 1) {
        write(db, item('book', `book-${String(n).padStart(3, '0')}`, `A Story of Love, Part ${n}`));
      }
    })();
    const kara = upsertUser(db, { username: 'kara', role: 'member' }).id;
    const device = createDevice(db, { userId: kara, kind: 'web' });
    const { token } = createSession(db, { userId: kara, deviceId: device.id, kind: 'bearer' });
    const app = await buildApp({ webDistDir: null, db });
    const searched = async (query: string) => {
      const res = await app.inject({
        url: `/api/search?${query}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      return SearchResults.parse(res.json()).results.map((r) => [r.kind, r.ref.id]);
    };
    const firstBooks = (
      await librarySource(db).search({ q: 'love', kinds: ['book'] }, new AbortController().signal)
    )
      .slice(0, 100)
      .map((r) => ['book', r.result.ref.id]);

    const all = await searched('q=love');
    const onlyBooks = await searched('q=love&kinds=book');

    expect(all).toHaveLength(100);
    expect(all.filter(([kind]) => kind === 'book')).toEqual([]);
    expect(firstBooks).toHaveLength(100);
    expect(onlyBooks).toEqual(firstBooks);
    await app.close();
    db.close();
  });
});

describe('the hundredth result, and the eighth suggestion, at the edge of the title tiers', () => {
  /**
   * `count` albums by Band Zo whose titles start with "Zo" (one is "Zo" itself), and a book,
   * "Unrelated Story", in the series "Zo Saga Collection". For "zo" the albums fill tiers 0 and 1
   * with two words at most; then come the series (tier 1, three words), the artist Band Zo (tier 2)
   * and the book through its series (tier 3).
   */
  function library(count: number) {
    const db = openDatabase(':memory:');
    const band: Creator = { id: 'artist-band-zo', name: 'Band Zo', role: 'album-artist' };
    db.transaction(() => {
      for (let n = 0; n < count; n += 1) {
        write(db, item('album', `album-${n}`, n === 0 ? 'Zo' : `Zo ${n}`, { creators: [band] }));
      }
      write(
        db,
        item('book', 'book-unrelated', 'Unrelated Story', {
          creators: [{ id: 'author-ann', name: 'Ann Writer', role: 'author' }],
          series: [{ id: 'series-zo', name: 'Zo Saga Collection', sequence: '1' }],
        }),
      );
    })();
    return db;
  }
  /** The albums' titles in rank order: "Zo", then the others byte for byte. */
  const albums = (count: number) => [
    [0, 'album', 'Zo'],
    ...Array.from({ length: count - 1 }, (_, n) => `Zo ${n + 1}`)
      .sort()
      .map((title) => [1, 'album', title]),
  ];
  const after = [
    [1, 'series', 'Zo Saga Collection'],
    [2, 'artist', 'Band Zo'],
    [3, 'book', 'Unrelated Story'],
  ];

  it('keeps exactly the hundred albums when they fill tiers 0 and 1, and what follows as room allows', async () => {
    for (const count of [100, 99, 98, 97]) {
      const db = library(count);

      expect(await search(db, 'zo'), `${count}`).toEqual([
        ...albums(count),
        ...after.slice(0, 100 - count),
      ]);
      db.close();
    }
  });

  it('finds what follows the hundred albums when a kinds filter leaves them out', async () => {
    const db = library(100);

    expect(await search(db, 'zo', ['series', 'artist', 'book'])).toEqual(after);
    expect(await search(db, 'zo', ['album', 'book'])).toEqual(albums(100));
    expect(await search(db, 'zo', ['book'])).toEqual([after[2]]);
    db.close();
  });

  it('keeps a name that ranks after every item when fewer than a hundred match', async () => {
    const db = library(97);

    expect(await search(db, 'zo', ['album', 'artist'])).toEqual([...albums(97), after[1]]);
    db.close();
  });

  it('suggests the series right after the albums only when fewer than eight start with the query', () => {
    const texts = (db: Db) => suggestFromIndex(db, 'zo', 8).map((s) => [s.kind, s.text]);
    const eight = library(8);
    const seven = library(7);

    expect(texts(eight)).toEqual(albums(8).map(([, kind, title]) => [kind, title]));
    expect(texts(seven)).toEqual([
      ...albums(7).map(([, kind, title]) => [kind, title]),
      ['series', 'Zo Saga Collection'],
    ]);
    eight.close();
    seven.close();
  });
});

describe('names beside titles', () => {
  let db: Db;
  beforeEach(() => {
    db = openDatabase(':memory:');
  });
  afterEach(() => db.close());
  const artist = (id: string, name: string): Creator => ({ id, name, role: 'album-artist' });

  it('ranks a name among titles of its tier by its words, as many words each, then by kind', async () => {
    write(db, item('album', 'b-album', 'Zo Band'));
    write(
      db,
      item('album', 'c-album', 'Zo Cat Dog', {
        creators: [artist('c-artist', 'Zo Abc'), artist('a-artist', 'Zo Band')],
      }),
    );

    expect(await search(db, 'zo')).toEqual([
      [1, 'artist', 'Zo Abc'],
      [1, 'album', 'Zo Band'],
      [1, 'artist', 'Zo Band'],
      [1, 'album', 'Zo Cat Dog'],
    ]);
  });

  it('lists two people of one name by their refs, whatever order the items naming them have', async () => {
    write(db, item('album', 'alpha', 'Alpha', { creators: [artist('b-2', 'Kim Sun')] }));
    write(
      db,
      item('album', 'beta', 'Beta', {
        creators: [artist('c-0', 'Other One'), artist('a-1', 'Kim Sun')],
      }),
    );

    const people = await librarySource(db).search(
      { q: 'kim', kinds: ['artist'] },
      new AbortController().signal,
    );
    expect(people.map((r) => r.result.ref.id)).toEqual(['a-1', 'b-2']);
  });

  it('suggests a name two people share once, and shows an item’s person once however often listed', async () => {
    write(
      db,
      item('album', 'alpha', 'Alpha', {
        creators: [artist('b-2', 'Kim Sun'), artist('a-1', 'Kim Sun')],
      }),
    );

    expect(suggestFromIndex(db, 'kim', 8).map((s) => [s.kind, s.text, s.ref?.id])).toEqual([
      ['artist', 'Kim Sun', 'a-1'],
      ['album', 'Alpha', 'alpha'],
    ]);
    const [alpha] = await librarySource(db).search({ q: 'alpha' }, new AbortController().signal);
    expect(alpha!.result.creators).toEqual(['Kim Sun']);
  });

  it('keeps the hundred first by ref when more share one title, at its start or inside it', async () => {
    // Written in an order unlike their refs', so an order falling back to writes keeps others.
    const ids = Array.from(
      { length: 150 },
      (_, n) => `track-${String((n * 37) % 150).padStart(3, '0')}`,
    );
    db.transaction(() => {
      for (const id of ids) write(db, item('track', id, 'Tie Song'));
    })();

    for (const q of ['tie', 'song']) {
      const tied = await librarySource(db).search({ q }, new AbortController().signal);
      expect(
        tied.map((r) => r.result.ref.id),
        q,
      ).toEqual([...ids].sort().slice(0, 100));
    }
  });

  it('names a person when each word starts a word of their name, and not when one is missing', async () => {
    write(
      db,
      item('album', 'record', 'Record', {
        creators: [artist('zola', 'Band Zola'), artist('xy', 'Xy Quartet')],
      }),
    );

    expect(await search(db, 'zo', ['artist'])).toEqual([[2, 'artist', 'Band Zola']]);
    expect(await search(db, 'zo xy', ['artist'])).toEqual([]);
    expect(await search(db, 'zo xy')).toEqual([[3, 'album', 'Record']]);
  });

  it('counts an author who also narrates once, so the book ranks as one naming them alone', async () => {
    const quill = { id: 'quill', name: 'Quill Varga' };
    write(
      db,
      item('book', 'zebra', 'Zebra', {
        creators: [
          { ...quill, role: 'author' },
          { name: quill.name, role: 'narrator' },
        ],
      }),
    );
    write(db, item('book', 'apple', 'Apple', { creators: [{ ...quill, role: 'author' }] }));

    expect(await search(db, 'varga', ['book'])).toEqual([
      [3, 'book', 'Apple'],
      [3, 'book', 'Zebra'],
    ]);
  });

  it('suggests a title found through people once, at its closest match, by that item', () => {
    const by = (...names: string[]): Creator[] => names.map((name) => ({ name, role: 'artist' }));
    write(
      db,
      item('track', 'track-a', 'Intro', { creators: by('Quill Varga', 'Ann Bee Cid Dee') }),
    );
    write(db, item('track', 'track-b', 'Intro', { creators: by('Quill Varga') }));
    write(db, item('track', 'track-c', 'Outro', { creators: by('Quill Varga', 'Ann Bee') }));
    write(db, item('album', 'album-intro', 'Intro', { creators: by('Quill Varga', 'Ann Bee') }));

    expect(suggestFromIndex(db, 'varga', 8).map((s) => [s.kind, s.text, s.ref?.id])).toEqual([
      ['album', 'Intro', 'album-intro'],
      ['track', 'Intro', 'track-b'],
      ['track', 'Outro', 'track-c'],
    ]);
  });

  it('suggests a title many items share by the first of them by ref', () => {
    for (const id of ['album-c', 'album-a', 'album-b']) write(db, item('album', id, 'Zed'));

    expect(suggestFromIndex(db, 'zed', 8).map((s) => [s.text, s.ref?.id])).toEqual([
      ['Zed', 'album-a'],
    ]);
  });
});
