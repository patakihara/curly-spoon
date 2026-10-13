/**
 * Search on a large library, written through the index's own write path (`applyTree`) from the
 * index's own row type: ranking and the kinds filter cover every match before anything is cut,
 * and suggestions and results answer within the 50 ms budget on 25 000 rows.
 */
import type { SearchKind } from '@auralis/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Creator, IndexKind, IndexRow, SeriesEntry } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { recordSearch } from '../store/recentSearches.js';
import { upsertUser } from '../store/users.js';
import { librarySource, suggestFromIndex } from './library.js';
import { suggest } from './suggest.js';

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

/** A seeded generator, so the library is the same on every run. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/**
 * About 25 000 rows: 700 albums of 12 tracks, 50 shows of 300 episodes and 1 500 books, titled
 * from a few thousand made-up words and twenty common ones, so a common word or a two-letter
 * prefix matches thousands of rows.
 */
function fillLibrary(db: Db) {
  const next = random(42);
  const pick = <T>(list: readonly T[], skew = 1) => list[Math.floor(next() ** skew * list.length)]!;
  const syllables =
    'ka lo ma ri the an sun dor el mi ra ten ber vo li na sha tor qui zen be ca fa go ho ju ke mo pe sa ti wu ye'.split(
      ' ',
    );
  const common =
    'the of a and love night song live part episode my in you to life heart world day time home'.split(
      ' ',
    );
  const made = Array.from({ length: 6000 }, () =>
    Array.from({ length: 2 + Math.floor(next() * 2) }, () => pick(syllables)).join(''),
  );
  const word = () => (next() < 0.35 ? pick(common, 2) : pick(made, 1.5));
  const title = (most: number) => {
    const words = Array.from({ length: 1 + Math.floor(next() * most) }, word).join(' ');
    return words[0]!.toUpperCase() + words.slice(1);
  };
  const name = () => `${title(1)} ${title(1)}`;
  let ids = 0;
  const id = () => `synthetic-${(ids += 1)}`;

  db.transaction(() => {
    const artists = Array.from({ length: 300 }, () => ({ id: id(), name: name() }));
    for (let n = 0; n < 700; n += 1) album(db, id(), title(4), pick(artists), 12, () => title(5));
    for (let n = 0; n < 50; n += 1) {
      const host: Creator = { name: name(), role: 'host' };
      const show = item('show', id(), title(3), { creators: [host] });
      write(
        db,
        show,
        Array.from({ length: 300 }, () =>
          item('episode', id(), `${Math.floor(next() * 400)}: ${title(7)}`, {
            parentId: show.id,
            creators: [host],
          }),
        ),
      );
    }
    const authors = Array.from({ length: 600 }, () => ({ id: id(), name: name() }));
    for (let n = 0; n < 1500; n += 1) {
      const series =
        n % 3 === 0
          ? [{ id: `series-${n % 200}`, name: `Saga ${n % 200} ${made[n % 200]}`, sequence: '1' }]
          : [];
      write(
        db,
        item('book', id(), title(5), {
          creators: [
            { ...pick(authors), role: 'author' },
            { name: name(), role: 'narrator' },
          ],
          series,
        }),
      );
    }
  })();
}

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;

describe('search on 25 000 indexed rows', () => {
  let db: Db;
  let kara: string;
  beforeAll(() => {
    db = openDatabase(':memory:');
    fillLibrary(db);
    kara = upsertUser(db, { username: 'kara', role: 'member' }).id;
    for (let n = 0; n < 20; n += 1) recordSearch(db, kara, `search ${n}`, T0 + n);
  });
  afterAll(() => db.close());

  /**
   * Each query's time, the fastest of three runs, so a busy machine measures the search and not
   * the other tests sharing it; then the median and the worst over the queries.
   */
  async function timed(run: (q: string) => unknown, queries: readonly string[]) {
    const times: number[] = [];
    for (const q of queries) {
      let fastest = Number.POSITIVE_INFINITY;
      for (let n = 0; n < 3; n += 1) {
        const start = performance.now();
        await run(q);
        fastest = Math.min(fastest, performance.now() - start);
      }
      times.push(fastest);
    }
    return { median: median(times), worst: Math.max(...times) };
  }

  it('holds about 25 000 rows', () => {
    expect(db.prepare('SELECT COUNT(*) AS n FROM index_items').get()).toEqual({ n: 25_650 });
  });

  it('suggests for two-letter prefixes within 50 ms at the median and 150 ms at worst', async () => {
    const prefixes = [
      'th',
      'ka',
      'lo',
      'ma',
      'sa',
      'be',
      'go',
      'ra',
      'an',
      'el',
      'mi',
      'to',
      'he',
      'da',
      'li',
    ];

    const time = await timed((q) => suggest(db, kara, q), prefixes);

    expect(time.median).toBeLessThan(50);
    expect(time.worst).toBeLessThan(150);
  });

  it('suggests and searches for the commonest words, which many titles equal, each within 50 ms', async () => {
    const words = ['the', 'a'];

    const suggesting = await timed((q) => suggest(db, kara, q), words);
    const searching = await timed(
      (q) => librarySource(db).search({ q }, new AbortController().signal),
      words,
    );

    expect(suggesting.worst).toBeLessThan(50);
    expect(searching.worst).toBeLessThan(50);
  });
});
