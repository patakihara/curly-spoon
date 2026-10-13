/**
 * Search on a large library, written through the index's own write path (`applyTree`) from the
 * index's own row type: ranking and the kinds filter cover every match before anything is cut.
 * How fast it answers on 25 000 rows is `largeLibrary.timing.test.ts`.
 */
import type { SearchKind } from '@auralis/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Creator, IndexKind, IndexRow, SeriesEntry } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
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
