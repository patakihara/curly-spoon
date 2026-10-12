/**
 * The library lists through the real route, on an index the index job fills from the recordings:
 * page four of each library (two books, two shows, two albums of the Music library) and the books
 * page holding the four-file book. Each person's own Audiobookshelf `GET /api/me` says which
 * libraries they may open and how far through each book they are; their Jellyfin `GET /UserViews`
 * says which music libraries they see. Replay matches a call by method, path and query, so each
 * person's answers are told apart by the token their call carries.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibraryList } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from './adapters/audiobookshelf/client.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { JellyfinClient } from './adapters/jellyfin/client.js';
import { buildApp } from './app.js';
import { runIndex } from './libraryIndex/job.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const recording = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const abs = (call: string) => recording('audiobookshelf', call);
const jf = (call: string) => recording('jellyfin', call);
const json = <T>(r: Recording) => (r.response.body as { json: T }).json;

interface Libraries {
  libraries: { id: string; mediaType: string }[];
}
interface AbsItem {
  id: string;
  media: { metadata: { title: string; authors?: { name: string }[]; author?: string } };
}
interface AbsMe {
  permissions: { accessAllLibraries: boolean };
  librariesAccessible: string[];
  mediaProgress: { libraryItemId: string; episodeId?: string | null; progress: number }[];
}
interface JfAlbums {
  Items: { Id: string; Name: string; AlbumArtists: { Name: string }[] }[];
}

const libraries = json<Libraries>(abs('library-list')).libraries;
const podcastsLibrary = libraries.find((l) => l.mediaType === 'podcast')!.id;
const books = ['index-book-1', 'index-book-2', 'shell-book-1', 'shell-book-2'].map((c) =>
  json<AbsItem>(abs(c)),
);
const shows = ['index-show-1', 'index-show-2'].map((c) => json<AbsItem>(abs(c)));
const albums = json<JfAlbums>(jf('jf-library-albums-1')).Items;
const me = abs('me');
const started = json<AbsMe>(me).mediaProgress.find((p) => !p.episodeId)!;

/** otto's `GET /api/me`: the recorded one, granted only the Podcasts library. The only change. */
const ottoMe = structuredClone(me);
Object.assign(json<AbsMe>(ottoMe), {
  permissions: { ...json<AbsMe>(me).permissions, accessAllLibraries: false },
  librariesAccessible: [podcastsLibrary],
  mediaProgress: [],
});
/** otto's `GET /UserViews`: the recorded one, without the Music library. The only change. */
const ottoViews = structuredClone(jf('jf-user-views'));
json<{ Items: unknown[]; TotalRecordCount: number }>(ottoViews).Items = [];
json<{ Items: unknown[]; TotalRecordCount: number }>(ottoViews).TotalRecordCount = 0;

const KEY = Buffer.alloc(32, 7);
const UPSTREAM = 'http://upstream.invalid';

/** Fills the index from the recordings, as the index job does. */
async function index(db: Db) {
  const common = { baseUrl: UPSTREAM, token: '<token>' };
  const page4 = new AbsClient({
    ...common,
    fetch: replayFetch(
      ['library-list', 'index-books-page', 'index-book-1', 'index-book-2']
        .concat(['index-shows-page', 'index-show-1', 'index-show-2'])
        .map(abs),
    ),
  });
  const music = new JellyfinClient({
    ...common,
    fetch: replayFetch(
      ['library-list', 'jf-library-albums-1', 'index-album-tracks-1', 'index-album-tracks-2'].map(
        jf,
      ),
    ),
  });
  const pageOfFour = { db, pageSize: 2, pages: { first: 4, count: 1 } };
  const first = await runIndex({ ...pageOfFour, abs: page4, jellyfin: music });
  expect(first.abs?.error).toBeNull();
  expect(first.jellyfin?.error).toBeNull();
  // The four-file book is on the books library's page 15; only that library is read there.
  const page15 = new AbsClient({
    ...common,
    fetch: replayFetch(
      ['library-list', 'shell-books-page', 'shell-book-1', 'shell-book-2'].map(abs),
    ),
  });
  const booksOnly = {
    getLibraries: async () => (await page15.getLibraries()).filter((l) => l.mediaType === 'book'),
    getLibraryItems: page15.getLibraryItems.bind(page15),
    getItemSummary: page15.getItemSummary.bind(page15),
    findItemSummary: page15.findItemSummary.bind(page15),
  };
  const second = await runIndex({
    db,
    pageSize: 2,
    pages: { first: 15, count: 1 },
    abs: booksOnly,
  });
  expect(second.abs?.error).toBeNull();
}

let apps: FastifyInstance[] = [];
let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  db.close();
});

/**
 * kara, granted every library and seeing Music; otto, granted only Podcasts and seeing no music
 * library; nora, linked to neither upstream.
 */
async function server() {
  const asked: string[] = [];
  const kara = replayFetch([me, jf('jf-user-views')]);
  const otto = replayFetch([ottoMe, ottoViews]);
  const fetch: FetchLike = async (url, init) => {
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    asked.push(new URL(url).pathname);
    return (authorization.includes('otto') ? otto : kara)(url, init);
  };
  const bearer: Record<string, string> = {};
  for (const name of ['kara', 'otto', 'nora']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    if (name !== 'nora') {
      for (const service of ['abs', 'jellyfin'] as const) {
        saveLink(db, KEY, {
          userId: user.id,
          service,
          upstreamUserId: `${service}-${name}`,
          token: `${service}-token-${name}`,
          state: 'linked',
        });
      }
    }
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    bearer[name] = createSession(db, {
      userId: user.id,
      deviceId: device.id,
      kind: 'bearer',
    }).token;
  }
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: { key: KEY, config: { absUrl: UPSTREAM, jellyfinUrl: UPSTREAM }, fetch },
  });
  apps.push(app);
  const list = async (medium: string, name = 'kara') => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/library/${medium}`,
      headers: { authorization: `Bearer ${bearer[name] ?? ''}` },
    });
    return { status: res.statusCode, body: res.json<unknown>() };
  };
  const items = async (medium: string, name = 'kara') => {
    const { status, body } = await list(medium, name);
    expect(status).toBe(200);
    return LibraryList.parse(body).items;
  };
  return { app, asked, list, items };
}

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

describe('[M1.shell/a] the signed-in person’s library, from the index on the recordings', () => {
  it('[M1.shell/a] lists every indexed book with its authors, art and progress from the person’s own Audiobookshelf, each owned', async () => {
    await index(db);
    const s = await server();

    const listed = await s.items('books');

    const expected = books
      .map((b) => ({
        ref: { source: 'abs', id: b.id },
        kind: 'book',
        title: b.media.metadata.title,
        sub: b.media.metadata.authors!.map((a) => a.name).join(', '),
        art: `/api/media/abs:${b.id}/art`,
        progress: b.id === started.libraryItemId ? started.progress : null,
        availability: { kind: 'owned' },
      }))
      .sort(byTitle);
    expect(listed).toEqual(expected);
    expect(listed.filter((e) => e.progress !== null)).toHaveLength(1);
  });

  it('[M1.shell/a] lists every indexed podcast show with its host and art, owned, with no progress of its own', async () => {
    await index(db);
    const s = await server();

    const listed = await s.items('podcasts');

    expect(listed).toEqual(
      shows
        .map((show) => ({
          ref: { source: 'abs', id: show.id },
          kind: 'show',
          title: show.media.metadata.title,
          sub: show.media.metadata.author,
          art: `/api/media/abs:${show.id}/art`,
          progress: null,
          availability: { kind: 'owned' },
        }))
        .sort(byTitle),
    );
  });

  it('[M1.shell/a] lists every indexed album of a music library the person sees, with its album artists and art, owned', async () => {
    await index(db);
    const s = await server();

    const listed = await s.items('music');

    expect(listed).toEqual(
      albums
        .map((album) => ({
          ref: { source: 'jellyfin', id: album.Id },
          kind: 'album',
          title: album.Name,
          sub: album.AlbumArtists.map((a) => a.Name).join(', '),
          art: `/api/media/jellyfin:${album.Id}/art`,
          progress: null,
          availability: { kind: 'owned' },
        }))
        .sort(byTitle),
    );
    expect(s.asked).toEqual(['/UserViews']);
  });
});

describe('who sees what', () => {
  it("leaks no library another person can't open: otto, granted only Podcasts and seeing no music library, gets no books and no albums", async () => {
    await index(db);
    const s = await server();

    expect(await s.items('books', 'otto')).toEqual([]);
    expect(await s.items('music', 'otto')).toEqual([]);
    expect((await s.items('podcasts', 'otto')).map((e) => e.ref.id).sort()).toEqual(
      shows.map((show) => show.id).sort(),
    );
    expect((await s.items('books', 'kara')).length).toBe(books.length);
  });

  it('gives a person linked to neither upstream empty lists, asking neither', async () => {
    await index(db);
    const s = await server();

    for (const medium of ['books', 'podcasts', 'music']) {
      expect(await s.items(medium, 'nora')).toEqual([]);
    }
    expect(s.asked).toEqual([]);
  });
});

describe('the library route', () => {
  it('answers an empty list for a library with nothing indexed', async () => {
    const s = await server();

    for (const medium of ['books', 'podcasts', 'music']) {
      expect(await s.list(medium)).toEqual({ status: 200, body: { items: [] } });
    }
  });

  it('refuses a medium it does not list with 400, asking no upstream', async () => {
    await index(db);
    const s = await server();

    expect(await s.list('films')).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(s.asked).toEqual([]);
  });

  it('answers 401 to a caller who is not signed in', async () => {
    const s = await server();

    const res = await s.app.inject({ method: 'GET', url: '/api/library/books' });

    expect(res.statusCode).toBe(401);
  });
});
