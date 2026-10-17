/**
 * Search and suggestions through the real routes, on an index the index job fills from the
 * recordings: page four of each library (two books, two shows with their episodes, two albums
 * with their tracks), then the four recorded Ursula K. Le Guin books, written as the job writes an
 * item. Both routes read the household's whole index and the store, and ask no upstream: the
 * upstream fake answers each person's own recorded `GET /api/me` and `GET /UserViews` (otto's
 * granting only Podcasts and no music library) for the library lists, and records every call.
 */
import { readFileSync } from 'node:fs';
import { type AddressInfo, connect } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibraryList, SearchResults, SuggestionList } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from './adapters/audiobookshelf/client.js';
import { itemSummarySchema } from './adapters/audiobookshelf/schemas.js';
import { readFeed } from './adapters/feed/client.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { againstOpenApi } from './adapters/http/openApi.js';
import { replayFetch } from './adapters/http/replay.js';
import { JellyfinClient } from './adapters/jellyfin/client.js';
import { buildApp } from './app.js';
import { runIndex } from './libraryIndex/job.js';
import { absTree } from './libraryIndex/rows.js';
import { applyTree, emptyCounts, listIndexed } from './libraryIndex/store.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';
import { searchTokens } from './text/fold.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const T0 = Date.UTC(2026, 9, 13, 8);
const KEY = Buffer.alloc(32, 7);
const UPSTREAM = 'http://upstream.invalid';

function recording(upstream: string, call: string): Recording {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
const abs = (call: string) => recording('audiobookshelf', call);
const jf = (call: string) => recording('jellyfin', call);
const json = <T>(r: Recording) => (r.response.body as { json: T }).json;

interface Libraries {
  libraries: { id: string; mediaType: string }[];
}
interface AbsItem {
  id: string;
  media: { metadata: { title: string }; episodes?: { id: string; title: string }[] };
}
interface AbsMe {
  permissions: { accessAllLibraries: boolean };
  librariesAccessible: string[];
  mediaProgress: unknown[];
}
interface JfItems {
  Items: { Id: string; Name: string }[];
  TotalRecordCount: number;
}

const podcastsLibrary = json<Libraries>(abs('library-list')).libraries.find(
  (l) => l.mediaType === 'podcast',
)!.id;
const books = ['index-book-1', 'index-book-2'].map((c) => json<AbsItem>(abs(c)));
const shows = ['index-show-1', 'index-show-2'].map((c) => json<AbsItem>(abs(c)));
const albums = json<JfItems>(jf('jf-library-albums-1')).Items;
const tracks = ['index-album-tracks-1', 'index-album-tracks-2'].flatMap(
  (c) => json<JfItems>(jf(c)).Items,
);

/** otto's `GET /api/me`: the recorded one, granted only the Podcasts library. The only change. */
const ottoMe = structuredClone(abs('me'));
Object.assign(json<AbsMe>(ottoMe), {
  permissions: { ...json<AbsMe>(ottoMe).permissions, accessAllLibraries: false },
  librariesAccessible: [podcastsLibrary],
  mediaProgress: [],
});
/** otto's `GET /UserViews`: the recorded one, without the Music library. The only change. */
const ottoViews = structuredClone(jf('jf-user-views'));
Object.assign(json<JfItems>(ottoViews), { Items: [], TotalRecordCount: 0 });

const common = { baseUrl: UPSTREAM, token: '<token>' };

/** The recorded index: the job's recorded page of each library, then the four Le Guin books. */
async function index(db: Db) {
  const result = await runIndex({
    db,
    abs: new AbsClient({
      ...common,
      fetch: replayFetch(
        [
          'library-list',
          'index-books-page',
          'index-book-1',
          'index-book-2',
          'index-shows-page',
          'index-show-1',
          'index-show-2',
        ].map(abs),
      ),
    }),
    jellyfin: new JellyfinClient({
      ...common,
      fetch: replayFetch(
        ['library-list', 'jf-library-albums-1', 'index-album-tracks-1', 'index-album-tracks-2'].map(
          jf,
        ),
      ),
    }),
    feeds: (url: string) =>
      readFeed(replayFetch(['show-1-feed', 'show-2-feed'].map((c) => recording('feed', c))), url),
    now: () => T0,
    random: () => 0,
    pageSize: 2,
    pages: { first: 4, count: 1 },
  });
  expect(result.abs?.error).toBeNull();
  expect(result.jellyfin?.error).toBeNull();
  for (const call of ['shell-book-1', 'shell-book-2', 'series-book-1', 'series-book-2']) {
    applyTree(db, absTree(itemSummarySchema.parse(json(abs(call)))), T0, emptyCounts());
  }
}

let apps: FastifyInstance[] = [];
let db: Db;
beforeEach(async () => {
  db = openDatabase(':memory:');
  await index(db);
});
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  db.close();
});

/** kara, granted every library and seeing Music; otto, granted only Podcasts, seeing no music. */
async function server() {
  const asked: string[] = [];
  const kara = replayFetch([abs('me'), jf('jf-user-views')]);
  const otto = replayFetch([ottoMe, ottoViews]);
  const fetch: FetchLike = async (url, init) => {
    const { pathname, search } = new URL(url);
    asked.push(`${pathname}${search}`);
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    return (authorization.includes('otto') ? otto : kara)(url, init);
  };
  const bearer: Record<string, string> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    for (const service of ['abs', 'jellyfin'] as const) {
      saveLink(db, KEY, {
        userId: user.id,
        service,
        upstreamUserId: `${service}-${name}`,
        token: `${service}-token-${name}`,
        state: 'linked',
      });
    }
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    bearer[name] = createSession(db, {
      userId: user.id,
      deviceId: device.id,
      kind: 'bearer',
    }).token;
  }
  let clock = T0;
  /** What the server logged at warning level or above. */
  const logs: { level: number; msg: string; err?: { message?: string } }[] = [];
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: { key: KEY, config: { absUrl: UPSTREAM, jellyfinUrl: UPSTREAM }, fetch },
    now: () => (clock += 1000),
    logger: {
      stream: {
        write: (line: string) => {
          const entry = JSON.parse(line) as (typeof logs)[number];
          if (entry.level >= 40) logs.push(entry);
        },
      },
    },
  });
  apps.push(app);
  const get = (url: string, name: string | null = 'kara') =>
    app.inject({
      method: 'GET',
      url,
      headers: name === null ? {} : { authorization: `Bearer ${bearer[name] ?? ''}` },
    });
  const search = async (query: string, name = 'kara') => {
    const res = await get(`/api/search?${query}`, name);
    expect(res.statusCode).toBe(200);
    return SearchResults.parse(res.json()).results;
  };
  const suggest = async (q: string, name = 'kara') => {
    const res = await get(`/api/search/suggest?${new URLSearchParams({ q }).toString()}`, name);
    expect(res.statusCode).toBe(200);
    return SuggestionList.parse(res.json()).suggestions;
  };
  const listed = async (medium: string, name: string) => {
    const res = await get(`/api/library/${medium}`, name);
    expect(res.statusCode).toBe(200);
    return LibraryList.parse(res.json()).items;
  };
  return { app, asked, bearer, logs, get, search, suggest, listed };
}

const q = (text: string) => `q=${encodeURIComponent(text)}`;
const shown = (results: { kind: string; title: string }[]) => results.map((r) => [r.kind, r.title]);

describe('the answers the OpenAPI document describes, for the clients generated from it', () => {
  it('a search, with and without a parent, suggestions from recents and the index, and an empty queue fit it', async () => {
    const s = await server();
    const body = async (url: string) => {
      const res = await s.get(url);
      expect(res.statusCode, url).toBe(200);
      return res.json() as unknown;
    };
    await s.search(q('rumours'));

    const searched = await body(`/api/search?${q('the')}`);
    const suggested = await body(`/api/search/suggest?${q('ru')}`);
    const queue = await body('/api/queues/music');

    const results = SearchResults.parse(searched).results;
    expect(results.some((r) => r.parent === null)).toBe(true);
    expect(results.some((r) => r.parent !== null)).toBe(true);
    const suggestions = SuggestionList.parse(suggested).suggestions;
    expect(suggestions.some((x) => x.ref === null)).toBe(true);
    expect(suggestions.some((x) => x.ref !== null)).toBe(true);
    expect(queue).toMatchObject({ current: null, position: null });
    expect(againstOpenApi('get', '/api/search', searched)).toEqual([]);
    expect(againstOpenApi('get', '/api/search/suggest', suggested)).toEqual([]);
    expect(againstOpenApi('get', '/api/queues/{type}', queue)).toEqual([]);
  });
});

describe('[M2.search/a] suggestions from the index for a two-letter prefix', () => {
  it('[M2.search/a] GET /api/search/suggest for the first two letters of a recorded album title suggests that album, with its kind, from the index', async () => {
    const s = await server();
    const album = albums[0]!;
    const prefix = album.Name.slice(0, 2);

    const suggestions = await s.suggest(prefix);

    expect(suggestions).toContainEqual({
      kind: 'album',
      text: album.Name,
      ref: { source: 'jellyfin', id: album.Id },
    });
    const folded = searchTokens(prefix)[0]!;
    for (const suggestion of suggestions) {
      expect(suggestion.kind).not.toBe('recent');
      expect(searchTokens(suggestion.text).some((w) => w.startsWith(folded))).toBe(true);
      expect(listIndexed(db).some((r) => r.id === suggestion.ref?.id)).toBe(true);
    }
  });
});

describe('[M2.search/b] an exact title ranks above partial matches', () => {
  it('[M2.search/b] a recorded episode’s exact title ranks above a show whose title only starts with it, though shows come before episodes otherwise', async () => {
    const episode = shows
      .flatMap((sh) => sh.media.episodes!)
      .find((e) => e.title === 'The Siberian Heart Attack')!;
    // The recorded show, with another id and a longer title starting with the episode's: the only changes.
    const show = listIndexed(db).find((r) => r.kind === 'show')!;
    applyTree(
      db,
      { top: { ...show, id: 'f'.repeat(36), title: `${episode.title} Revisited` }, children: [] },
      T0,
      emptyCounts(),
    );
    const s = await server();

    const results = await s.search(q(episode.title));

    expect(shown(results).slice(0, 2)).toEqual([
      ['episode', episode.title],
      ['show', `${episode.title} Revisited`],
    ]);
  });

  it('[M2.search/b] a recorded track’s exact title ranks above an album whose title only starts with it', async () => {
    const track = tracks.find((t) => t.Name === 'Dreams')!;
    // The recorded album, with another id and a longer title starting with the track's: the only changes.
    const album = listIndexed(db).find((r) => r.kind === 'album')!;
    applyTree(
      db,
      { top: { ...album, id: 'f'.repeat(32), title: `${track.Name} Deluxe` }, children: [] },
      T0,
      emptyCounts(),
    );
    const s = await server();

    const results = await s.search(q(track.Name));

    expect(shown(results).slice(0, 2)).toEqual([
      ['track', track.Name],
      ['album', `${track.Name} Deluxe`],
    ]);
  });
});

describe('[M2.search/c] search over the household’s library, on the recordings', () => {
  it('[M2.search/c] kind filters hide rows without reordering the rest', async () => {
    const s = await server();
    const all = await s.search(q('the'));
    const kinds = new Set(all.map((r) => r.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);

    for (const kind of kinds) {
      const only = await s.search(`${q('the')}&kinds=${kind}`);
      expect(only, kind).toEqual(all.filter((r) => r.kind === kind));
    }
    const [first, second] = [...kinds];
    const two = await s.search(`${q('the')}&kinds=${first}&kinds=${second}`);
    expect(two).toEqual(all.filter((r) => r.kind === first || r.kind === second));
  });

  it('[M2.search/c] every result is owned, on the household’s own servers', async () => {
    const s = await server();

    for (const text of ['the', 'fleetwood', 'earthsea', 'megacorp']) {
      const results = await s.search(q(text));
      expect(results.length, text).toBeGreaterThan(0);
      expect(results.map((r) => r.availability)).toEqual(results.map(() => ({ kind: 'owned' })));
    }
  });

  it('[M2.search/c] results and suggestions cover the household’s library: otto, granted only Podcasts and seeing no music, still finds its books and albums', async () => {
    const s = await server();
    expect(await s.listed('books', 'otto')).toEqual([]);
    expect(await s.listed('music', 'otto')).toEqual([]);
    s.asked.length = 0;

    for (const book of books) {
      const title = book.media.metadata.title;
      const results = await s.search(q(title), 'otto');
      expect(results[0], title).toMatchObject({
        kind: 'book',
        ref: { source: 'abs', id: book.id },
      });
      expect(await s.suggest(title.slice(0, 2), 'otto')).toContainEqual({
        kind: 'book',
        text: title,
        ref: { source: 'abs', id: book.id },
      });
    }
    for (const album of albums) {
      const results = await s.search(q(album.Name), 'otto');
      expect(results[0], album.Name).toMatchObject({
        kind: 'album',
        ref: { source: 'jellyfin', id: album.Id },
      });
      expect(await s.suggest(album.Name.slice(0, 2), 'otto')).toContainEqual({
        kind: 'album',
        text: album.Name,
        ref: { source: 'jellyfin', id: album.Id },
      });
    }
    expect(s.asked).toEqual([]);
  });

  it('[M2.search/c] a search is kept among that person’s recent searches only: first in their suggestions, never in another’s', async () => {
    const s = await server();
    const album = albums[0]!;

    await s.search(q(`  ${album.Name} `));

    expect(await s.suggest('')).toEqual([{ kind: 'recent', text: album.Name, ref: null }]);
    expect((await s.suggest(album.Name.slice(0, 2)))[0]).toEqual({
      kind: 'recent',
      text: album.Name,
      ref: null,
    });
    expect(await s.suggest('', 'otto')).toEqual([]);
    expect((await s.suggest(album.Name.slice(0, 2), 'otto')).map((x) => x.kind)).not.toContain(
      'recent',
    );
  });

  it('[M2.search/c] suggestions keep nothing: typing is not searching', async () => {
    const s = await server();

    for (const typed of ['', 'r', 'ru', 'rumours']) await s.suggest(typed);

    expect(await s.suggest('')).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM recent_searches').get()).toEqual({ n: 0 });
  });
});

describe('the search routes', () => {
  it('refuse a kind they don’t know, an empty or spaces-only search, and a query over 200 characters', async () => {
    const s = await server();

    for (const url of [
      `/api/search?${q('the')}&kinds=video`,
      `/api/search?${q('the')}&kinds=Album`,
      '/api/search?q=',
      `/api/search?${q('   ')}`,
      '/api/search',
      `/api/search?${q('a'.repeat(201))}`,
      `/api/search/suggest?${q('a'.repeat(201))}`,
      '/api/search/suggest',
    ]) {
      const res = await s.get(url);
      expect([url, res.statusCode, res.json()]).toEqual([url, 400, { error: 'bad_request' }]);
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM recent_searches').get()).toEqual({ n: 0 });
  });

  it('answer 401 to no session', async () => {
    const s = await server();

    for (const url of [`/api/search?${q('the')}`, `/api/search/suggest?${q('th')}`]) {
      expect((await s.get(url, null)).statusCode, url).toBe(401);
    }
  });

  it('ask no upstream', async () => {
    const s = await server();

    await s.suggest('');
    await s.suggest('ru');
    await s.search(q('rumours'));
    await s.search(`${q('the')}&kinds=book&kinds=episode`);

    expect(s.asked).toEqual([]);
  });

  it('answer with the query as it was searched: trimmed', async () => {
    const s = await server();

    const res = await s.get(`/api/search?${q('  rumours ')}`);

    expect(res.statusCode).toBe(200);
    expect(SearchResults.parse(res.json()).query).toBe('rumours');
  });

  it('both trim the query, then take up to 200 characters, an emoji counting as one', async () => {
    const s = await server();
    const status = async (url: string) => (await s.get(url)).statusCode;

    for (const [text, expected] of [
      ['🎵'.repeat(200), 200],
      ['🎵'.repeat(201), 400],
      [` ${'a'.repeat(200)}  `, 200],
      [` ${'a'.repeat(201)}  `, 400],
      [` ${'🎵'.repeat(200)} `, 200],
    ] as const) {
      for (const route of ['/api/search', '/api/search/suggest']) {
        expect([route, text, await status(`${route}?${q(text)}`)]).toEqual([route, text, expected]);
      }
    }
  });

  it('still answer a search whose recent search could not be kept, and log why', async () => {
    const s = await server();
    db.exec(
      "CREATE TRIGGER refuse_recent BEFORE INSERT ON recent_searches BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    const results = await s.search(q('rumours'));

    expect(results.length).toBeGreaterThan(0);
    expect(s.logs.some((e) => e.level === 40 && e.err?.message === 'disk full')).toBe(true);
  });

  it('keep no recent search for a HEAD request', async () => {
    const s = await server();

    const head = await s.app.inject({
      method: 'HEAD',
      url: `/api/search?${q('rumours')}`,
      headers: { authorization: `Bearer ${s.bearer['kara'] ?? ''}` },
    });

    expect(head.statusCode).toBe(200);
    expect(await s.suggest('')).toEqual([]);
  });

  it('keep the search of a client that left right after asking: nothing on the server tells it from one that read its results', async () => {
    const s = await server();
    let closed!: () => void;
    const responseClosed = new Promise<void>((resolve) => (closed = resolve));
    s.app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/search?')) reply.raw.once('close', closed);
    });
    await s.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = s.app.server.address() as AddressInfo;

    const client = connect(port, '127.0.0.1', () => {
      client.write(
        `GET /api/search?${q('rumours')} HTTP/1.1\r\nHost: auralis.invalid\r\n` +
          `Authorization: Bearer ${s.bearer['kara'] ?? ''}\r\n\r\n`,
      );
      client.destroy();
    });
    client.on('error', () => undefined);
    await responseClosed;

    expect(db.prepare('SELECT COUNT(*) AS n FROM recent_searches').get()).toEqual({ n: 1 });
  });
});
