/**
 * How fast search answers within the 50 ms budget: suggestions and results through the routes on
 * about 25 000 indexed rows, and suggestions on a library where a few titles repeat thousands of
 * times. This file runs on its own, after every other test (`vitest.timing.config.ts`), so no
 * other test competes for the machine. Each query's time is the median of several runs after a
 * warm-up, and times the query alone: the library is built first. Neither route asks an upstream,
 * so a route's time is the whole of the budget.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { Creator, IndexKind, IndexRow, SeriesEntry } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { createDevice } from '../store/devices.js';
import { recordSearch } from '../store/recentSearches.js';
import { createSession } from '../store/sessions.js';
import { upsertUser } from '../store/users.js';
import { suggestFromIndex } from './library.js';
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
    for (let n = 0; n < 700; n += 1) {
      const [albumId, albumTitle, artist] = [id(), title(4), pick(artists)];
      write(
        db,
        item('album', albumId, albumTitle, { creators: [{ ...artist, role: 'album-artist' }] }),
        Array.from({ length: 12 }, (_, k) =>
          item('track', `${albumId}-${k}`, title(5), {
            parentId: albumId,
            creators: [{ ...artist, role: 'artist' }],
          }),
        ),
      );
    }
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

/** Runs before timing, so the first timed run finds statements prepared and pages cached. */
const WARM_UP = 2;
/** Timed runs per query; their median is its time. */
const RUNS = 7;

/** Each query's time, in milliseconds: the median of its timed runs; and the slowest run of all. */
async function timed(run: (q: string) => unknown, queries: readonly string[]) {
  const times: Record<string, number> = {};
  let slowest = 0;
  for (const q of queries) {
    for (let n = 0; n < WARM_UP; n += 1) await run(q);
    const runs: number[] = [];
    for (let n = 0; n < RUNS; n += 1) {
      const start = performance.now();
      await run(q);
      runs.push(performance.now() - start);
    }
    times[q] = median(runs);
    slowest = Math.max(slowest, ...runs);
  }
  return { times, slowest };
}
/** The queries, with their times, that took `ms` or more. */
const over = (times: Record<string, number>, ms: number) =>
  Object.entries(times).filter(([, time]) => time >= ms);

describe('search on 25 000 indexed rows, through the routes', () => {
  let db: Db;
  let app: FastifyInstance;
  let get: (url: string) => Promise<void>;
  beforeAll(async () => {
    db = openDatabase(':memory:');
    fillLibrary(db);
    const kara = upsertUser(db, { username: 'kara', role: 'member' }).id;
    for (let n = 0; n < 20; n += 1) recordSearch(db, kara, `search ${n}`, T0 + n);
    const device = createDevice(db, { userId: kara, kind: 'web' });
    const { token } = createSession(db, { userId: kara, deviceId: device.id, kind: 'bearer' });
    app = await buildApp({ webDistDir: null, db });
    get = async (url) => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode, url).toBe(200);
    };
  });
  afterAll(async () => {
    await app.close();
    db.close();
  });
  const suggesting = (q: string) => get(`/api/search/suggest?q=${encodeURIComponent(q)}`);
  const searching = (q: string) => get(`/api/search?q=${encodeURIComponent(q)}`);

  it('holds about 25 000 rows', () => {
    expect(db.prepare('SELECT COUNT(*) AS n FROM index_items').get()).toEqual({ n: 25_650 });
  });

  it('[M2.search/a] GET /api/search/suggest answers each two-letter prefix within the 50 ms budget, and never past 150 ms', async () => {
    const prefixes = ['th', 'ka', 'lo', 'ma', 'sa', 'be', 'go', 'ra', 'an', 'el', 'mi', 'to'];

    const { times, slowest } = await timed(suggesting, prefixes);

    expect(over(times, 50)).toEqual([]);
    expect(slowest).toBeLessThan(150);
  });

  it('suggests and searches for the commonest word, and its first two letters, within 50 ms', async () => {
    const queries = ['the', 'th'];

    expect(over((await timed(suggesting, queries)).times, 50)).toEqual([]);
    expect(over((await timed(searching, queries)).times, 50)).toEqual([]);
  });
});

describe('search on 2 000 albums whose 11 tracks share their titles with every other album', () => {
  let db: Db;
  beforeAll(() => {
    db = openDatabase(':memory:');
    db.transaction(() => {
      for (let n = 0; n < 2000; n += 1) {
        const artist = { id: `artist-${n % 500}`, name: `Common Person ${n % 500}` };
        write(
          db,
          item('album', `album-${n}`, `Record ${n} kalo`, {
            creators: [{ ...artist, role: 'album-artist' }],
          }),
          Array.from({ length: 11 }, (_, k) =>
            item('track', `album-${n}-${k}`, `Track ${k} mori`, {
              parentId: `album-${n}`,
              creators: [{ ...artist, role: 'artist' }],
            }),
          ),
        );
      }
    })();
  });
  afterAll(() => db.close());

  it('suggests each repeated title once, the first album’s track for it', () => {
    const suggested = suggestFromIndex(db, 'tr', 8);

    expect(suggested.map((s) => s.text)).toEqual(
      [0, 1, 10, 2, 3, 4, 5, 6].map((k) => `Track ${k} mori`),
    );
    expect(suggested.map((s) => s.ref?.id)).toEqual(
      [0, 1, 10, 2, 3, 4, 5, 6].map((k) => `album-0-${k}`),
    );
  });

  it('suggests for the repeated titles within 50 ms, reading each title once', async () => {
    const { times } = await timed((q) => suggest(db, 'nobody', q), ['tr', 'track']);

    expect(over(times, 50)).toEqual([]);
  });
});
