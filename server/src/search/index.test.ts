/**
 * The search tables follow the library index: the index job, run on the M1.index recordings,
 * leaves one folded search row per indexed row, and the full-text index holds exactly those rows,
 * through renames and removals.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import { readFeed } from '../adapters/feed/client.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { runIndex } from '../libraryIndex/job.js';
import { listIndexed } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { searchFold, searchTokens } from '../text/fold.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));
const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 29, 12);

function recording(upstream: string, call: string): Recording {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
const abs = (call: string) => recording('audiobookshelf', call);
const jf = (call: string) => recording('jellyfin', call);

function body<T>(r: Recording): T {
  if (r.response.body === null || !('json' in r.response.body)) throw new Error(r.call);
  return r.response.body.json as T;
}
function changed<T>(r: Recording, edit: (json: T) => void): Recording {
  const json = structuredClone(body<T>(r));
  edit(json);
  return { ...r, response: { ...r.response, body: { json } } };
}

interface Listing {
  total: number;
  results: { id: string; updatedAt: number }[];
}
interface AbsShow {
  id: string;
  updatedAt: number;
  media: { episodes: { id: string; title: string; updatedAt: number }[] };
}
interface JfItem {
  Id: string;
  Name: string;
}
interface JfPage {
  Items: JfItem[];
  TotalRecordCount: number;
}

const common = { baseUrl: 'http://upstream.invalid', token: '<token>' };

/** The index job over replayed recordings, paged as `pageSize` items from page `first`. */
async function index(
  db: Db,
  at: number,
  recordings: { abs: Recording[]; jellyfin: Recording[]; feeds?: Recording[] },
  paging: { pageSize: number; pages?: { first: number; count: number } },
) {
  const result = await runIndex({
    db,
    abs: new AbsClient({ ...common, fetch: replayFetch(recordings.abs) }),
    jellyfin: new JellyfinClient({ ...common, fetch: replayFetch(recordings.jellyfin) }),
    feeds: (url: string) => readFeed(replayFetch(recordings.feeds ?? []), url),
    now: () => at,
    random: () => 0,
    ...paging,
  });
  expect(result.abs?.error).toBeNull();
  expect(result.jellyfin?.error).toBeNull();
  return result;
}

/** The recorded page of the index: the fifth, of two items per library. */
function recordedPage() {
  return {
    abs: [
      'library-list',
      'index-books-page',
      'index-book-1',
      'index-book-2',
      'index-shows-page',
      'index-show-1',
      'index-show-2',
    ].map(abs),
    jellyfin: [
      'library-list',
      'jf-library-albums-1',
      'index-album-tracks-1',
      'index-album-tracks-2',
    ].map(jf),
    feeds: ['show-1-feed', 'show-2-feed'].map((c) => recording('feed', c)),
  };
}
const onRecordedPage = { pageSize: 2, pages: { first: 4, count: 1 } };

interface SearchItem {
  id: number;
  source: string;
  upstream_id: string;
  title: string;
  people: string;
  series: string;
}
const searchItems = (db: Db) =>
  db.prepare('SELECT * FROM search_items ORDER BY id').all() as SearchItem[];
const keyOf = (item: { source: string; upstream_id: string }) =>
  `${item.source}:${item.upstream_id}`;

/** The rows the full-text index itself holds, read from its own term index, not its content. */
function ftsDocs(db: Db): number[] {
  db.exec(
    'CREATE VIRTUAL TABLE IF NOT EXISTS temp.search_terms USING fts5vocab(main, search_fts, instance)',
  );
  return (
    db.prepare('SELECT DISTINCT doc FROM temp.search_terms ORDER BY doc').all() as {
      doc: number;
    }[]
  ).map((row) => row.doc);
}

/** Rows a prefix query over every token of `text` finds, by source and upstream id. */
function found(db: Db, text: string): string[] {
  const match = searchTokens(text)
    .map((t) => `"${t}"*`)
    .join(' ');
  return (
    db
      .prepare(
        `SELECT search_items.source, search_items.upstream_id FROM search_fts
         JOIN search_items ON search_items.id = search_fts.rowid
         WHERE search_fts MATCH ?`,
      )
      .all(match) as { source: string; upstream_id: string }[]
  ).map(keyOf);
}

function expectInSync(db: Db) {
  expect(() =>
    db.exec("INSERT INTO search_fts (search_fts) VALUES ('integrity-check')"),
  ).not.toThrow();
  expect(ftsDocs(db)).toEqual(searchItems(db).map((item) => item.id));
}

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

describe('the search tables on the recorded library', () => {
  it('hold one row per indexed book, show, episode, album and track, with its title, people and series folded', async () => {
    await index(db, T0, recordedPage(), onRecordedPage);

    const indexed = listIndexed(db);
    const items = new Map(searchItems(db).map((item) => [keyOf(item), item]));
    expect(indexed.length).toBeGreaterThan(20);
    expect([...items.keys()].sort()).toEqual(
      indexed.map((row) => `${row.source}:${row.id}`).sort(),
    );
    for (const row of indexed) {
      const item = items.get(`${row.source}:${row.id}`)!;
      expect(item.title, row.id).toBe(searchFold(row.title));
      for (const c of row.creators) expect(item.people, row.id).toContain(searchFold(c.name));
      for (const s of row.series) expect(item.series, row.id).toContain(searchFold(s.name));
      if (row.creators.length === 0) expect(item.people).toBe('');
    }
    expect(indexed.some((row) => row.creators.length > 0)).toBe(true);
    expectInSync(db);
  });

  it('find every recorded item by the first two letters of each word of its title', async () => {
    await index(db, T0, recordedPage(), onRecordedPage);

    for (const row of listIndexed(db)) {
      const prefixes = searchTokens(row.title)
        .map((t) => t.slice(0, 2))
        .join(' ');
      expect(found(db, prefixes), row.title).toContain(`${row.source}:${row.id}`);
    }
  });

  it('follow a rename upstream: the new title finds the item and the old one no longer does', async () => {
    await index(db, T0, recordedPage(), onRecordedPage);
    const page = recordedPage();
    const showAt = page.abs.findIndex((r) => r.call === 'index-show-2');
    const show = body<AbsShow>(page.abs[showAt]!);
    const episode = show.media.episodes[0]!;
    const later = show.updatedAt + 60_000;
    const listingAt = page.abs.findIndex((r) => r.call === 'index-shows-page');
    page.abs[listingAt] = changed<Listing>(page.abs[listingAt]!, (listing) => {
      listing.results.find((i) => i.id === show.id)!.updatedAt = later;
    });
    page.abs[showAt] = changed<AbsShow>(page.abs[showAt]!, (s) => {
      s.updatedAt = later;
      s.media.episodes[0]!.title = 'Quixotic Zephyr';
      s.media.episodes[0]!.updatedAt = later;
    });
    expect(found(db, episode.title)).toContain(`abs:${episode.id}`);

    await index(db, T0 + HOUR, page, onRecordedPage);

    expect(found(db, 'quixotic zeph')).toEqual([`abs:${episode.id}`]);
    expect(found(db, episode.title)).not.toContain(`abs:${episode.id}`);
    expectInSync(db);
  });

  it('rewrite no search row for an item that did not change, even when every item is read again', async () => {
    await index(db, T0, recordedPage(), onRecordedPage);
    db.exec(`
      CREATE TEMP TABLE search_writes (id INTEGER);
      CREATE TEMP TRIGGER log_search_insert AFTER INSERT ON search_items
        BEGIN INSERT INTO search_writes VALUES (new.id); END;
      CREATE TEMP TRIGGER log_search_update AFTER UPDATE ON search_items
        BEGIN INSERT INTO search_writes VALUES (new.id); END;`);
    const before = searchItems(db);

    await index(db, T0 + HOUR, recordedPage(), onRecordedPage);
    await index(db, T0 + 25 * HOUR, recordedPage(), onRecordedPage);

    expect(db.prepare('SELECT COUNT(*) AS n FROM search_writes').get()).toEqual({ n: 0 });
    expect(searchItems(db)).toEqual(before);
  });
});

/**
 * A complete pass needs a first page, and the recordings hold the fifth. As the index job's own
 * tests do, these copies of the recorded listings are re-pointed at pages 0 and 1, one item a page:
 * the books library holds the two recorded books, and Jellyfin the two recorded albums. The second
 * pass misses the first of each, and the recorded 404 (`index-item-gone`) and empty lookup
 * (`index-album-gone`) say they are gone.
 */
describe('the search tables when an item is gone upstream', () => {
  const books = body<Listing>(abs('index-books-page')).results;
  const albums = body<JfPage>(jf('jf-library-albums-1')).Items;

  function absPage(page: number, results: Listing['results'], total: number): Recording {
    const listing = abs('index-books-page');
    return {
      ...listing,
      request: {
        ...listing.request,
        query: { ...listing.request.query, limit: '1', page: `${page}` },
      },
      response: {
        ...listing.response,
        body: { json: { ...body<object>(listing), results, total } },
      },
    };
  }
  function noShows(): Recording {
    const empty = changed<Listing>(abs('index-shows-page'), (p) => {
      p.results = [];
      p.total = 0;
    });
    return {
      ...empty,
      request: { ...empty.request, query: { ...empty.request.query, limit: '1', page: '0' } },
    };
  }
  function jfPage(page: number, items: JfItem[], total: number): Recording {
    const listing = jf('jf-library-albums-1');
    return {
      ...listing,
      request: {
        ...listing.request,
        query: { ...listing.request.query, Limit: '1', StartIndex: `${page}` },
      },
      response: { ...listing.response, body: { json: { Items: items, TotalRecordCount: total } } },
    };
  }
  function absGone(id: string): Recording {
    const gone = abs('index-item-gone');
    return { ...gone, request: { ...gone.request, path: `/api/items/${id}` } };
  }
  function jfGone(album: JfItem): Recording {
    const lookup = jf('index-album-gone');
    return {
      ...lookup,
      request: { ...lookup.request, query: { ...lookup.request.query, Ids: album.Id } },
      response: {
        ...lookup.response,
        body: { json: { ...body<object>(lookup), Items: [], TotalRecordCount: 0 } },
      },
    };
  }
  const tracks = () => ['library-list', 'index-album-tracks-1', 'index-album-tracks-2'].map(jf);

  it('leave no search row, and no full-text hit, for a removed book, a removed album or its tracks', async () => {
    await index(
      db,
      T0,
      {
        abs: [
          ...['library-list', 'index-book-1', 'index-book-2'].map(abs),
          noShows(),
          absPage(0, [books[0]!], 2),
          absPage(1, [books[1]!], 2),
        ],
        jellyfin: [...tracks(), jfPage(0, [albums[0]!], 2), jfPage(1, [albums[1]!], 2)],
      },
      { pageSize: 1 },
    );
    const gone = listIndexed(db).filter(
      (row) =>
        row.id === books[0]!.id || row.id === albums[0]!.Id || row.parentId === albums[0]!.Id,
    );
    expect(gone.filter((row) => row.kind === 'track').length).toBeGreaterThan(0);
    const goneKeys = new Set(gone.map((row) => `${row.source}:${row.id}`));
    for (const row of gone) expect(found(db, row.title)).toContain(`${row.source}:${row.id}`);
    const goneIds = searchItems(db)
      .filter((item) => goneKeys.has(keyOf(item)))
      .map((item) => item.id);
    expect(goneIds).toHaveLength(gone.length);

    await index(
      db,
      T0 + HOUR,
      {
        abs: [
          ...['library-list', 'index-book-2'].map(abs),
          noShows(),
          absPage(0, [books[1]!], 1),
          absGone(books[0]!.id),
        ],
        jellyfin: [...tracks(), jfPage(0, [albums[1]!], 1), jfGone(albums[0]!)],
      },
      { pageSize: 1 },
    );

    expect(listIndexed(db).filter((row) => goneKeys.has(`${row.source}:${row.id}`))).toEqual([]);
    expect(searchItems(db).filter((item) => goneKeys.has(keyOf(item)))).toEqual([]);
    for (const row of gone) {
      expect(
        found(db, row.title).filter((key) => goneKeys.has(key)),
        row.title,
      ).toEqual([]);
    }
    expect(ftsDocs(db).filter((doc) => goneIds.includes(doc))).toEqual([]);
    expect(searchItems(db).map(keyOf)).toContain(`abs:${books[1]!.id}`);
    expectInSync(db);
  });
});
