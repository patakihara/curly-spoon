import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import { readFeed } from '../adapters/feed/client.js';
import { type FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { openDatabase, type Db } from '../store/connection.js';
import { runIndex } from './job.js';
import { booksInSeries, episodesInOrder, listIndexed, type StoredRow } from './store.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));
const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 29, 12);

function recording(upstream: string, call: string): Recording {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

const ABS_CALLS = [
  'library-list',
  'index-books-page',
  'index-book-1',
  'index-book-2',
  'index-shows-page',
  'index-show-1',
  'index-show-2',
  'index-item-gone',
] as const;
const JELLYFIN_CALLS = [
  'index-album-lookup',
  'index-album-gone',
  'index-albums-page',
  'index-album-tracks-1',
  'index-album-tracks-2',
] as const;
const FEED_CALLS = ['show-1-feed', 'show-2-feed'] as const;
type AbsCall = (typeof ABS_CALLS)[number];
type FeedCall = (typeof FEED_CALLS)[number];
type JellyfinCall = (typeof JELLYFIN_CALLS)[number];

/** The committed recordings, as parsed JSON bodies a test may copy and change. */
function recorded() {
  return {
    abs: Object.fromEntries(ABS_CALLS.map((c) => [c, recording('audiobookshelf', c)])) as Record<
      AbsCall,
      Recording
    >,
    jellyfin: Object.fromEntries(
      JELLYFIN_CALLS.map((c) => [c, recording('jellyfin', c)]),
    ) as Record<JellyfinCall, Recording>,
    feed: Object.fromEntries(FEED_CALLS.map((c) => [c, recording('feed', c)])) as Record<
      FeedCall,
      Recording
    >,
  };
}

// The recorded bodies' shapes, as far as these tests read them.
interface Listing {
  total: number;
  results: { id: string; updatedAt: number }[];
}
interface AbsBook {
  id: string;
  updatedAt: number;
  media: { metadata: { title: string; authors: { id: string; name: string }[] } };
}
interface AbsShow {
  id: string;
  updatedAt: number;
  media: {
    metadata: { title: string; feedUrl: string; itunesId: string };
    episodes: { id: string; title: string; updatedAt: number; enclosure: { url: string } }[];
  };
}
interface JfItem {
  Id: string;
  Name: string;
  Etag: string;
  ProviderIds: Record<string, string>;
}
interface JfPage {
  Items: JfItem[];
  TotalRecordCount: number;
}

function body<T>(r: Recording): T {
  if (r.response.body === null || !('json' in r.response.body)) throw new Error(r.call);
  return r.response.body.json as T;
}

/** A copy of `r` whose answer is `edit` applied to a copy of the recorded body. */
function changed<T>(r: Recording, edit: (json: T) => void): Recording {
  const json = structuredClone(body<T>(r));
  edit(json);
  return { ...r, response: { ...r.response, body: { json } } };
}

/** Clients on replayed recordings, and every path they asked for. */
function clients(abs: Recording[], jellyfin: Recording[], feeds: Recording[] = []) {
  const asked: string[] = [];
  const counting =
    (fetch: FetchLike): FetchLike =>
    (url, init) => {
      const { pathname, searchParams } = new URL(url);
      asked.push(
        searchParams.has('ParentId')
          ? `tracks ${searchParams.get('ParentId')}`
          : searchParams.has('Ids')
            ? `lookup ${searchParams.get('Ids')}`
            : pathname,
      );
      return fetch(url, init);
    };
  const common = { baseUrl: 'http://upstream.invalid', token: '<token>' };
  return {
    asked,
    abs: new AbsClient({ ...common, fetch: counting(replayFetch(abs)) }),
    jellyfin: new JellyfinClient({ ...common, fetch: counting(replayFetch(jellyfin)) }),
    feeds: (url: string) => readFeed(counting(replayFetch(feeds)), url),
  };
}

/** Runs the index on the recorded page (the fifth, of two items per library). */
async function run(db: Db, at: number, r = recorded(), random = () => 0) {
  const c = clients(Object.values(r.abs), Object.values(r.jellyfin), Object.values(r.feed));
  const result = await runIndex({
    db,
    abs: c.abs,
    jellyfin: c.jellyfin,
    feeds: c.feeds,
    now: () => at,
    random,
    pageSize: 2,
    pages: { first: 4, count: 1 },
  });
  return { result, asked: c.asked };
}

const byKey = (rows: StoredRow[]) => new Map(rows.map((row) => [`${row.source}:${row.id}`, row]));

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

describe('[M1.index/a] the index job on the Audiobookshelf and Jellyfin recordings', () => {
  it('[M1.index/a] indexes every recorded book, show, episode, album and track with its upstream id, and nothing else', async () => {
    const r = recorded();
    const { result } = await run(db, T0, r);
    expect(result.abs?.error).toBeNull();
    expect(result.jellyfin?.error).toBeNull();

    const expected = [
      ...body<Listing>(r.abs['index-books-page']).results.map((b) => `abs:book:${b.id}`),
      ...(['index-show-1', 'index-show-2'] as const).flatMap((call) => {
        const show = body<AbsShow>(r.abs[call]);
        return [`abs:show:${show.id}`, ...show.media.episodes.map((e) => `abs:episode:${e.id}`)];
      }),
      ...body<JfPage>(r.jellyfin['index-albums-page']).Items.map((a) => `jellyfin:album:${a.Id}`),
      ...(['index-album-tracks-1', 'index-album-tracks-2'] as const).flatMap((call) =>
        body<JfPage>(r.jellyfin[call]).Items.map((t) => `jellyfin:track:${t.Id}`),
      ),
    ];
    const indexed = listIndexed(db).map((row) => `${row.source}:${row.kind}:${row.id}`);
    expect(indexed.sort()).toEqual(expected.sort());
    // Two books, two shows, their 4 and 15 episodes, two albums and their tracks.
    expect(expected.filter((k) => k.startsWith('abs:episode:'))).toHaveLength(19);
  });

  it('[M1.index/a] keeps each book with its authors by upstream id, and each show and episode with its feed and enclosure', async () => {
    const r = recorded();
    await run(db, T0, r);
    const rows = byKey(listIndexed(db));

    for (const call of ['index-book-1', 'index-book-2'] as const) {
      const book = body<AbsBook>(r.abs[call]);
      const row = rows.get(`abs:${book.id}`);
      expect(row?.title).toBe(book.media.metadata.title);
      expect(row?.creators.filter((c) => c.role === 'author')).toEqual(
        book.media.metadata.authors.map((a) => ({ id: a.id, name: a.name, role: 'author' })),
      );
      expect(row?.duration).toBeGreaterThan(0);
      expect(row?.upstreamVersion).toBe(String(book.updatedAt));
    }

    for (const call of ['index-show-1', 'index-show-2'] as const) {
      const show = body<AbsShow>(r.abs[call]);
      expect(rows.get(`abs:${show.id}`)?.ids).toEqual({
        feed_url: show.media.metadata.feedUrl,
        itunes_id: show.media.metadata.itunesId,
      });
      for (const episode of show.media.episodes) {
        const row = rows.get(`abs:${episode.id}`);
        expect(row?.parentId).toBe(show.id);
        expect(row?.title).toBe(episode.title);
        expect(row?.ids.enclosure_url).toBe(episode.enclosure.url);
        expect(row?.publishedAt).toEqual(expect.any(Number));
      }
    }
  });

  it('[M1.index/a] keeps each album with its MusicBrainz ids, and each track under its album in disc and track order', async () => {
    const r = recorded();
    await run(db, T0, r);
    const rows = byKey(listIndexed(db));

    const albums = body<JfPage>(r.jellyfin['index-albums-page']).Items;
    for (const [n, album] of albums.entries()) {
      const row = rows.get(`jellyfin:${album.Id}`);
      expect(row?.title).toBe(album.Name);
      expect(row?.ids.musicbrainz_album).toBe(album.ProviderIds.MusicBrainzAlbum);
      expect(row?.ids.musicbrainz_release_group).toBe(album.ProviderIds.MusicBrainzReleaseGroup);
      expect(row?.upstreamVersion).toBe(album.Etag);

      const call = `index-album-tracks-${n + 1}` as JellyfinCall;
      const tracks = body<JfPage>(r.jellyfin[call]).Items;
      const indexed = [...rows.values()].filter((t) => t.parentId === album.Id);
      expect(indexed.map((t) => t.id).sort()).toEqual(tracks.map((t) => t.Id).sort());
      for (const t of indexed) {
        expect(t.kind).toBe('track');
        expect(t.position).toEqual(expect.any(Number));
        expect(t.duration).toBeGreaterThan(0);
      }
    }
  });

  it('[M1.index/a] every row starts at version 1, and the run is recorded with its counts', async () => {
    await run(db, T0);
    const rows = listIndexed(db);
    expect(rows.every((row) => row.version === 1 && row.updatedAt === T0)).toBe(true);
    const runs = db
      .prepare('SELECT source, complete, error, fetched, inserted FROM index_runs')
      .all();
    expect(runs).toEqual([
      { source: 'abs', complete: 0, error: null, fetched: 4, inserted: 23 },
      { source: 'jellyfin', complete: 0, error: null, fetched: 2, inserted: rows.length - 23 },
    ]);
  });
});

describe('[M1.index/b] a second run after a recorded change', () => {
  /**
   * No upstream change can be made from here (the recordings are read-only calls), so the change
   * is applied to copies of the real recordings: one show's `updatedAt` moves on and one of its
   * episodes is renamed, and one album's `Etag` moves on and one of its tracks is renamed.
   */
  function withOneChange() {
    const r = recorded();
    const show = body<AbsShow>(r.abs['index-show-2']);
    const album = body<JfPage>(r.jellyfin['index-albums-page']).Items[1]!;
    const later = show.updatedAt + 60_000;
    r.abs['index-shows-page'] = changed<Listing>(r.abs['index-shows-page'], (page) => {
      page.results.find((i) => i.id === show.id)!.updatedAt = later;
    });
    r.abs['index-show-2'] = changed<AbsShow>(r.abs['index-show-2'], (s) => {
      s.updatedAt = later;
      s.media.episodes[0]!.title = 'Renamed upstream';
      s.media.episodes[0]!.updatedAt = later;
    });
    r.jellyfin['index-albums-page'] = changed<JfPage>(r.jellyfin['index-albums-page'], (p) => {
      p.Items[1]!.Etag = 'moved-on';
    });
    r.jellyfin['index-album-tracks-2'] = changed<JfPage>(
      r.jellyfin['index-album-tracks-2'],
      (p) => {
        p.Items[0]!.Name = 'Renamed upstream';
      },
    );
    return {
      r,
      changedKeys: [
        `abs:${show.id}`,
        `abs:${show.media.episodes[0]!.id}`,
        `jellyfin:${album.Id}`,
        `jellyfin:${body<JfPage>(r.jellyfin['index-album-tracks-2']).Items[0]!.Id}`,
      ],
      showId: show.id,
      albumId: album.Id,
    };
  }

  it('[M1.index/b] updates only the changed items, reading only the changed show and album again', async () => {
    await run(db, T0);
    const before = byKey(listIndexed(db));
    const { r, changedKeys, showId, albumId } = withOneChange();

    const { asked } = await run(db, T0 + HOUR, r);

    expect(asked.filter((a) => a.startsWith('/api/items/'))).toEqual([`/api/items/${showId}`]);
    expect(asked.filter((a) => a.startsWith('tracks '))).toEqual([`tracks ${albumId}`]);
    const after = byKey(listIndexed(db));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, row] of after) {
      if (changedKeys.includes(key)) {
        expect(row.version, key).toBe(2);
        expect(row.updatedAt, key).toBe(T0 + HOUR);
      } else {
        expect(row, key).toEqual(before.get(key));
      }
    }
    expect(after.get(changedKeys[1]!)?.title).toBe('Renamed upstream');
    expect(after.get(changedKeys[3]!)?.title).toBe('Renamed upstream');
  });

  it('[M1.index/b] a run with nothing changed reads no item again and writes no row', async () => {
    await run(db, T0);
    const before = listIndexed(db);
    const { asked, result } = await run(db, T0 + HOUR);
    expect(asked.filter((a) => a.startsWith('/api/items/') || a.startsWith('tracks '))).toEqual([]);
    expect(listIndexed(db)).toEqual(before);
    expect(result.abs?.counts).toMatchObject({ fetched: 0, inserted: 0, updated: 0, removed: 0 });
    expect(result.jellyfin?.counts).toMatchObject({ fetched: 0, inserted: 0, updated: 0 });
  });

  it('[M1.index/b] a day on, every item is read again, since ABS edits episodes without moving their show, and unchanged rows stay untouched', async () => {
    await run(db, T0);
    const before = listIndexed(db);
    const { asked } = await run(db, T0 + 25 * HOUR);
    expect(asked.filter((a) => a.startsWith('/api/items/'))).toHaveLength(4);
    expect(asked.filter((a) => a.startsWith('tracks '))).toHaveLength(2);
    expect(listIndexed(db)).toEqual(before);
  });

  it("[M1.index/b] an episode gone from its show's answer is removed, and nothing else", async () => {
    await run(db, T0);
    const r = recorded();
    const show = body<AbsShow>(r.abs['index-show-1']);
    const gone = show.media.episodes[0]!.id;
    const later = show.updatedAt + 60_000;
    r.abs['index-shows-page'] = changed<Listing>(r.abs['index-shows-page'], (page) => {
      page.results.find((i) => i.id === show.id)!.updatedAt = later;
    });
    r.abs['index-show-1'] = changed<AbsShow>(r.abs['index-show-1'], (s) => {
      s.updatedAt = later;
      s.media.episodes.shift();
    });
    const before = byKey(listIndexed(db));

    await run(db, T0 + HOUR, r);

    const after = byKey(listIndexed(db));
    expect(after.has(`abs:${gone}`)).toBe(false);
    expect(after.size).toBe(before.size - 1);
    expect(after.get(`abs:${show.id}`)?.version).toBe(2);
  });
});

describe('the daily re-read', () => {
  it('is spread: an item read now is due again between 18 and 24 hours on, by its jitter', async () => {
    const r = recorded();
    let n = 0;
    // Every other item read gets the most jitter, the rest none.
    await run(db, T0, r, () => (n++ % 2 === 0 ? 0.99 : 0));

    const { asked } = await run(db, T0 + 20 * HOUR, r);

    const books = body<Listing>(r.abs['index-books-page']).results;
    const shows = body<Listing>(r.abs['index-shows-page']).results;
    const albums = body<JfPage>(r.jellyfin['index-albums-page']).Items;
    expect(asked.filter((a) => a.startsWith('/api/items/'))).toEqual([
      `/api/items/${books[0]!.id}`,
      `/api/items/${shows[0]!.id}`,
    ]);
    expect(asked.filter((a) => a.startsWith('tracks '))).toEqual([`tracks ${albums[0]!.Id}`]);
  });
});

/**
 * Complete passes need a first page, and the recordings hold the fifth. These tests page one
 * item at a time over copies of the recorded listings, re-pointed at pages 0 and 1: the books
 * library holds the two recorded books, and Jellyfin the two recorded albums.
 */
describe('removing what a complete pass did not see', () => {
  const r = recorded();
  const books = body<Listing>(r.abs['index-books-page']).results;
  const albums = body<JfPage>(r.jellyfin['index-albums-page']).Items;

  function absPage(page: number, results: Listing['results'], total: number): Recording {
    const listing = r.abs['index-books-page'];
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
  const noShows = changed<Listing>(r.abs['index-shows-page'], (p) => {
    p.results = [];
    p.total = 0;
  });
  noShows.request = {
    ...noShows.request,
    query: { ...noShows.request.query, limit: '1', page: '0' },
  };

  function jfPage(page: number, items: JfItem[], total: number): Recording {
    const listing = r.jellyfin['index-albums-page'];
    return {
      ...listing,
      request: {
        ...listing.request,
        query: { ...listing.request.query, Limit: '1', StartIndex: `${page}` },
      },
      response: { ...listing.response, body: { json: { Items: items, TotalRecordCount: total } } },
    };
  }
  /** A recorded lookup, re-pointed at `id`: the ABS 404, or Jellyfin's answer for an album. */
  function absGone(id: string): Recording {
    const gone = r.abs['index-item-gone'];
    return { ...gone, request: { ...gone.request, path: `/api/items/${id}` } };
  }
  function jfLookup(call: 'index-album-lookup' | 'index-album-gone', album: JfItem): Recording {
    const lookup = r.jellyfin[call];
    const answer = call === 'index-album-lookup' ? [album] : [];
    return {
      ...lookup,
      request: { ...lookup.request, query: { ...lookup.request.query, Ids: album.Id } },
      response: {
        ...lookup.response,
        body: { json: { ...body<object>(lookup), Items: answer, TotalRecordCount: answer.length } },
      },
    };
  }
  const details = [r.abs['library-list'], r.abs['index-book-1'], r.abs['index-book-2']];
  const tracks = [r.jellyfin['index-album-tracks-1'], r.jellyfin['index-album-tracks-2']];

  async function pass(
    at: number,
    abs: Recording[],
    jellyfin: Recording[],
    pages?: { first: number; count: number },
  ) {
    const c = clients(abs, jellyfin);
    const result = await runIndex({
      db,
      abs: c.abs,
      jellyfin: c.jellyfin,
      now: () => at,
      random: () => 0,
      pageSize: 1,
      ...(pages ? { pages } : {}),
    });
    return { result, asked: c.asked };
  }
  const indexedIds = () => new Set(listIndexed(db).map((row) => row.id));

  /** A first complete pass over both books and both albums. */
  async function indexBoth() {
    const { result } = await pass(
      T0,
      [...details, noShows, absPage(0, [books[0]!], 2), absPage(1, [books[1]!], 2)],
      [...tracks, jfPage(0, [albums[0]!], 2), jfPage(1, [albums[1]!], 2)],
    );
    expect(result.abs).toMatchObject({ complete: true, error: null });
    expect(result.jellyfin).toMatchObject({ complete: true, error: null });
  }

  it('keeps an item a deletion mid-pass shifted past the pages, since its upstream still answers for it', async () => {
    await indexBoth();
    const before = listIndexed(db);

    // The first book and album are read on page 0, then deleted: the second of each moves up to
    // offset 0, so page 1 comes back empty and the pass never sees it.
    const { result, asked } = await pass(
      T0 + HOUR,
      [...details, noShows, absPage(0, [books[0]!], 2), absPage(1, [], 1)],
      [
        ...tracks,
        jfPage(0, [albums[0]!], 2),
        jfPage(1, [], 1),
        jfLookup('index-album-lookup', albums[1]!),
      ],
    );

    expect(result.abs).toMatchObject({ complete: true, error: null });
    expect(result.jellyfin).toMatchObject({ complete: true, error: null });
    expect(asked).toContain(`/api/items/${books[1]!.id}`);
    expect(asked).toContain(`lookup ${albums[1]!.Id}`);
    expect(listIndexed(db)).toEqual(before);
  });

  it('removes an item once a complete pass from page 0 misses it and its upstream says it is gone', async () => {
    await indexBoth();
    const album = byKey(listIndexed(db));
    const firstAlbumTracks = [...album.values()].filter((row) => row.parentId === albums[0]!.Id);
    expect(firstAlbumTracks.length).toBeGreaterThan(0);

    const { result } = await pass(
      T0 + HOUR,
      [
        r.abs['library-list'],
        r.abs['index-book-2'],
        noShows,
        absPage(0, [books[1]!], 1),
        absGone(books[0]!.id),
      ],
      [...tracks, jfPage(0, [albums[1]!], 1), jfLookup('index-album-gone', albums[0]!)],
    );

    const left = indexedIds();
    expect(left.has(books[0]!.id)).toBe(false);
    expect(left.has(books[1]!.id)).toBe(true);
    expect(left.has(albums[0]!.Id)).toBe(false);
    for (const track of firstAlbumTracks) expect(left.has(track.id)).toBe(false);
    expect(result.abs?.counts.removed).toBe(1);
    expect(result.jellyfin?.counts.removed).toBe(1 + firstAlbumTracks.length);
  });

  it('never removes anything on a partial window of pages, nor asks whether an item is gone', async () => {
    await indexBoth();
    const before = listIndexed(db);
    const noShowsOnPage1 = {
      ...noShows,
      request: { ...noShows.request, query: { ...noShows.request.query, page: '1' } },
    };
    const abs = [
      ...details,
      noShows,
      noShowsOnPage1,
      absPage(0, [books[1]!], 2),
      absPage(1, [books[1]!], 2),
      absGone(books[0]!.id),
    ];
    const jellyfin = [
      ...tracks,
      jfPage(0, [albums[1]!], 2),
      jfPage(1, [albums[1]!], 2),
      jfLookup('index-album-gone', albums[0]!),
    ];

    // Stopping before the last page, and starting after the first: neither is a complete pass.
    for (const pages of [
      { first: 0, count: 1 },
      { first: 1, count: 1 },
    ]) {
      const { result, asked } = await pass(T0 + HOUR, abs, jellyfin, pages);
      expect(result.abs).toMatchObject({ complete: false, error: null });
      expect(result.jellyfin).toMatchObject({ complete: false, error: null });
      expect(
        asked.filter((a) => a === `/api/items/${books[0]!.id}` || a.startsWith('lookup')),
      ).toEqual([]);
    }
    expect(listIndexed(db)).toEqual(before);
  });
});

/** A copy of a recorded feed whose text is `edit` applied to the recorded text. */
function feedWith(r: Recording, edit: (xml: string) => string): Recording {
  const b = r.response.body;
  if (b === null || !('text' in b)) throw new Error(r.call);
  return { ...r, response: { ...r.response, body: { text: edit(b.text) } } };
}

function feedText(r: Recording): string {
  const b = r.response.body;
  if (b === null || !('text' in b)) throw new Error(r.call);
  return b.text;
}

/** The recorded show's episodes, newest first by the dates its recorded feed gives them. */
function newestFirstByFeed(show: AbsShow, feed: Recording): string[] {
  const dated = [...feedText(feed).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
    at: Date.parse(/<pubDate>([^<]*)</.exec(m[1] ?? '')?.[1] ?? ''),
    url: /<enclosure\b[^>]*\burl="([^"]*)"/.exec(m[1] ?? '')?.[1]?.replace(/&amp;/g, '&'),
  }));
  dated.sort((a, b) => b.at - a.at);
  return dated.map((d) => show.media.episodes.find((e) => e.enclosure.url === d.url)!.id);
}

const shortTitle = (row: StoredRow) => row.title.split(':')[0];

describe("episode order from each show's feed", () => {
  it("plays a serial show oldest first and an episodic one newest first, by the feed's dates", async () => {
    const r = recorded();
    await run(db, T0, r);
    const [serial, episodic] = (['index-show-1', 'index-show-2'] as const).map((c) =>
      body<AbsShow>(r.abs[c]),
    );
    const rows = byKey(listIndexed(db));

    expect(rows.get(`abs:${serial!.id}`)?.episodeOrder).toBe('serial');
    expect(rows.get(`abs:${episodic!.id}`)?.episodeOrder).toBe('episodic');
    expect(episodesInOrder(db, serial!.id).map(shortTitle)).toEqual([
      'The Marshall Islands, Part One',
      'The Marshall Islands, Part Two',
      'The Marshall Islands, Part Three',
      'The Marshall Islands, Part Four',
    ]);
    expect(episodesInOrder(db, episodic!.id).map((e) => e.id)).toEqual(
      newestFirstByFeed(episodic!, r.feed['show-2-feed']),
    );
  });

  it("dates each episode by its feed item, not Audiobookshelf's own date", async () => {
    const r = recorded();
    await run(db, T0, r);
    const serial = body<AbsShow>(r.abs['index-show-1']);
    const partOne = episodesInOrder(db, serial.id)[0];
    // Audiobookshelf dates part one 1 January 2023; its feed item says 5 September.
    expect(partOne?.publishedAt).toBe(Date.parse('Tue, 05 Sep 2023 04:00:00 +0000'));
  });

  it("leaves a show whose feed names no order episodic, Apple's default, newest first", async () => {
    const r = recorded();
    r.feed['show-1-feed'] = feedWith(r.feed['show-1-feed'], (xml) =>
      xml.replace(/\s*<itunes:type>serial<\/itunes:type>/, ''),
    );
    await run(db, T0, r);
    const serial = body<AbsShow>(r.abs['index-show-1']);
    expect(byKey(listIndexed(db)).get(`abs:${serial.id}`)?.episodeOrder).toBe('episodic');
    expect(episodesInOrder(db, serial.id).map(shortTitle)[0]).toBe(
      'The Marshall Islands, Part Four',
    );
  });

  it("stores a show whose feed has never been read as unknown, newest first by Audiobookshelf's dates, and counts the failure", async () => {
    const r = recorded();
    const { result } = await run(db, T0, { ...r, feed: {} as typeof r.feed });
    const serial = body<AbsShow>(r.abs['index-show-1']);
    expect(byKey(listIndexed(db)).get(`abs:${serial.id}`)?.episodeOrder).toBe('unknown');
    const order = episodesInOrder(db, serial.id);
    expect(order.map(shortTitle)[0]).toBe('The Marshall Islands, Part Four');
    expect(order[3]?.publishedAt).toBe(Date.UTC(2023, 0, 1));
    expect(result.abs?.error).toBeNull();
    expect(result.abs?.counts.feedsFailed).toBe(2);
  });

  it('reads a show of unknown order again on the next run, until its feed answers', async () => {
    const r = recorded();
    await run(db, T0, { ...r, feed: {} as typeof r.feed });
    const again = await run(db, T0 + HOUR, { ...r, feed: {} as typeof r.feed });
    expect(again.result.abs?.counts.feedsFailed).toBe(2);

    const answered = await run(db, T0 + 2 * HOUR);
    expect(answered.result.abs?.counts.feedsFailed).toBe(0);
    const serial = body<AbsShow>(r.abs['index-show-1']);
    expect(byKey(listIndexed(db)).get(`abs:${serial.id}`)?.episodeOrder).toBe('serial');

    const settled = await run(db, T0 + 3 * HOUR);
    expect(settled.asked).not.toContain(`/api/items/${serial.id}`);
  });

  it('keeps the order and dates the index holds when a re-read finds the feed unreadable', async () => {
    await run(db, T0);
    const before = listIndexed(db);
    const r = recorded();
    const { 'show-1-feed': _gone, ...rest } = r.feed;
    const { result } = await run(db, T0 + 25 * HOUR, { ...r, feed: rest as typeof r.feed });
    expect(listIndexed(db)).toEqual(before);
    expect(result.abs?.counts.feedsFailed).toBe(1);
  });
});

describe("keeping each show's order up to date, as the index's second-run rule says", () => {
  const feedsAsked = (asked: string[]) => {
    const r = recorded();
    const paths = FEED_CALLS.map((c) => r.feed[c].request.path);
    return asked.filter((a) => paths.includes(a)).map((a) => FEED_CALLS[paths.indexOf(a)]);
  };

  it('reads no feed again on a run where no show is read again', async () => {
    const first = await run(db, T0);
    expect(feedsAsked(first.asked)).toEqual(['show-1-feed', 'show-2-feed']);
    expect(feedsAsked((await run(db, T0 + HOUR)).asked)).toEqual([]);
  });

  it('reads a changed show’s feed again with it, and only that one', async () => {
    await run(db, T0);
    const r = recorded();
    const show = body<AbsShow>(r.abs['index-show-2']);
    r.abs['index-shows-page'] = changed<Listing>(r.abs['index-shows-page'], (page) => {
      page.results.find((i) => i.id === show.id)!.updatedAt = show.updatedAt + 60_000;
    });
    r.abs['index-show-2'] = changed<AbsShow>(r.abs['index-show-2'], (s) => {
      s.updatedAt += 60_000;
    });
    expect(feedsAsked((await run(db, T0 + HOUR, r)).asked)).toEqual(['show-2-feed']);
  });

  it("a day on, reads every show's feed again, and a changed order updates only the show", async () => {
    await run(db, T0);
    const before = byKey(listIndexed(db));
    const r = recorded();
    r.feed['show-1-feed'] = feedWith(r.feed['show-1-feed'], (xml) =>
      xml.replace('<itunes:type>serial</itunes:type>', '<itunes:type>episodic</itunes:type>'),
    );
    const { asked } = await run(db, T0 + 25 * HOUR, r);

    expect(feedsAsked(asked)).toEqual(['show-1-feed', 'show-2-feed']);
    const serial = body<AbsShow>(r.abs['index-show-1']);
    for (const [key, row] of byKey(listIndexed(db))) {
      if (key === `abs:${serial.id}`) {
        expect(row.episodeOrder).toBe('episodic');
        expect(row.version).toBe(2);
      } else {
        expect(row, key).toEqual(before.get(key));
      }
    }
  });
});

describe('series order for books', () => {
  /** The recorded books page, listing the two recorded books of one series instead. */
  function seriesRun(at: number, edit: (book: AbsBook & SeriesBook) => void = () => undefined) {
    const r = recorded();
    const series = (['series-book-1', 'series-book-2'] as const).map((c) =>
      recording('audiobookshelf', c),
    );
    const books = series.map((s) => body<AbsBook & SeriesBook>(s));
    const edited = series.map((s, n) => (n === 0 ? changed<AbsBook & SeriesBook>(s, edit) : s));
    r.abs['index-books-page'] = changed<Listing>(r.abs['index-books-page'], (page) => {
      page.results = books.map((b) => ({ ...page.results[0]!, id: b.id, updatedAt: b.updatedAt }));
    });
    return { books, done: runWith(at, [...Object.values(r.abs), ...edited], r) };
  }
  interface SeriesBook {
    media: { metadata: { series: { id: string; sequence: string }[] } };
  }
  async function runWith(at: number, abs: Recording[], r: ReturnType<typeof recorded>) {
    const c = clients(abs, Object.values(r.jellyfin), Object.values(r.feed));
    return runIndex({
      db,
      abs: c.abs,
      jellyfin: c.jellyfin,
      feeds: c.feeds,
      now: () => at,
      random: () => 0,
      pageSize: 2,
      pages: { first: 4, count: 1 },
    });
  }

  it('lists the two recorded books of one series in their series order', async () => {
    const { books, done } = seriesRun(T0);
    expect((await done).abs?.error).toBeNull();
    const seriesId = books[0]!.media.metadata.series[0]!.id;
    expect(booksInSeries(db, seriesId).map((b) => b.id)).toEqual(books.map((b) => b.id));
  });

  it('orders sequences as numbers, so book 10 comes after book 2', async () => {
    const { books, done } = seriesRun(T0, (b) => {
      b.media.metadata.series[0]!.sequence = '10';
    });
    await done;
    const seriesId = books[0]!.media.metadata.series[0]!.id;
    expect(booksInSeries(db, seriesId).map((b) => b.id)).toEqual([books[1]!.id, books[0]!.id]);
  });
});
