/**
 * The library lists, the item pages and the art through the real routes, on an index the index
 * job fills from the recordings:
 * page four of each library (two books, two shows, two albums of the Music library) and the books
 * page holding the four-file book. Each person's own Audiobookshelf `GET /api/me` says which
 * libraries they may open and how far through each book they are; their Jellyfin `GET /UserViews`
 * says which music libraries they see. A book's page reads its length and chapters from its
 * expanded answer (`multi-detail`), and art passes the recorded covers and primary images on,
 * their bodies synthesized. Replay matches a call by method, path and query, so each person's
 * answers are told apart by the token their call carries.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ItemDetail, LibraryList } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbsClient } from './adapters/audiobookshelf/client.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch, standInsBeside } from './adapters/http/replay.js';
import { JellyfinClient } from './adapters/jellyfin/client.js';
import { buildApp } from './app.js';
import { runIndex } from './libraryIndex/job.js';
import { albumTracks, episodesInOrder } from './libraryIndex/store.js';
import { ART_WIDTH } from './routes/items.js';
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
  mediaProgress: {
    libraryItemId: string;
    episodeId?: string | null;
    progress: number;
    isFinished: boolean;
  }[];
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

/** `index-book-1` with no cover, as Audiobookshelf answers for a book it has none for. */
function noCover(r: Recording): Recording {
  const copy = structuredClone(r);
  json<{ media: { coverPath: string | null } }>(copy).media.coverPath = null;
  return copy;
}
/** `jf-library-albums-1` with its first album's primary image gone from its image tags. */
function noPrimary(r: Recording): Recording {
  const copy = structuredClone(r);
  delete json<{ Items: { ImageTags: Record<string, string> }[] }>(copy).Items[0]!.ImageTags.Primary;
  return copy;
}

/**
 * Fills the index from the recordings, as the index job does; `withoutArt` takes the cover off
 * `index-book-1` and the primary image off the first album.
 */
async function index(db: Db, withoutArt = false) {
  const common = { baseUrl: UPSTREAM, token: '<token>' };
  const strip = (edit: (r: Recording) => Recording) => (r: Recording) => (withoutArt ? edit(r) : r);
  const page4 = new AbsClient({
    ...common,
    fetch: replayFetch(
      ['library-list', 'index-books-page', 'index-book-2']
        .concat(['index-shows-page', 'index-show-1', 'index-show-2'])
        .map(abs)
        .concat(strip(noCover)(abs('index-book-1'))),
    ),
  });
  const music = new JellyfinClient({
    ...common,
    fetch: replayFetch(
      ['library-list', 'index-album-tracks-1', 'index-album-tracks-2']
        .map(jf)
        .concat(strip(noPrimary)(jf('jf-library-albums-1'))),
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
async function server(karaMe = me) {
  const asked: string[] = [];
  const reads = [
    abs('multi-detail'),
    abs('index-show-1'),
    abs('index-show-2'),
    abs('shell-cover'),
    abs('shell-cover-medium'),
    jf('jf-primary-image'),
    jf('jf-primary-image-medium'),
  ];
  const readBytes = standInsBeside(adapters);
  const kara = replayFetch([karaMe, jf('jf-user-views'), ...reads], { readBytes });
  const otto = replayFetch([ottoMe, ottoViews, ...reads], { readBytes });
  const fetch: FetchLike = async (url, init) => {
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    const { pathname, search } = new URL(url);
    asked.push(`${pathname}${search}`);
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
  const get = async (url: string, name = 'kara') =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${bearer[name] ?? ''}` } });
  const item = async (key: string, name = 'kara') => {
    const res = await get(`/api/items/${key}`, name);
    return { status: res.statusCode, body: res.json<unknown>() };
  };
  const page = async (key: string, name = 'kara') => {
    const { status, body } = await item(key, name);
    expect(status).toBe(200);
    return ItemDetail.parse(body);
  };
  return { app, asked, list, items, get, item, page };
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

  it('[M1.shell/a] gives a book begun but at 0, unfinished, no progress, as one not started', async () => {
    await index(db);
    const atZero = structuredClone(me);
    const progress = json<AbsMe>(atZero).mediaProgress.find((p) => !p.episodeId)!;
    Object.assign(progress, { progress: 0, isFinished: false });
    const s = await server(atZero);

    const listed = await s.items('books');

    expect(listed.find((e) => e.ref.id === started.libraryItemId)?.progress).toBeNull();
    expect(listed.every((e) => e.progress === null)).toBe(true);
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

  it('[M1.shell/a] lists every indexed album of a music library the person sees, hidden from their home or not, with its album artists and art, owned', async () => {
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
    expect(s.asked).toEqual(['/UserViews?includeHidden=true']);
  });
});

describe('[M1.shell] art links', () => {
  it('[M1.shell] links art only for an item its upstream has art for: a cover, or a primary image', async () => {
    await index(db, true);
    const s = await server();
    const bare = [books[0]!.id, albums[0]!.Id];

    const listed = [...(await s.items('books')), ...(await s.items('music'))];

    expect(listed.filter((e) => e.art === null).map((e) => e.ref.id)).toEqual(bare);
    expect(listed.filter((e) => !bare.includes(e.ref.id)).every((e) => e.art !== null)).toBe(true);
    expect((await s.page(`jellyfin:${albums[0]!.Id}`)).art).toBeNull();
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

const fourFiles = json<{
  id: string;
  media: { duration: number; chapters: { title: string; start: number; end: number }[] };
}>(abs('multi-detail'));
const fourFilesBook = books.find((b) => b.id === fourFiles.id)!;
const finished = json<AbsMe>(abs('me-finished')).mediaProgress.find((p) => p.episodeId)!;
/** kara's `GET /api/me` with the episode `me-finished` recorded as finished. The only change. */
const karaFinished = structuredClone(me);
json<AbsMe>(karaFinished).mediaProgress.push(finished);
const album = albums[0]!;

describe('[M1.shell] a book, show or album page, from the index and the person’s own upstream', () => {
  it('[M1.shell] opens a book with its authors, art, progress, its length from its files and its chapters in order', async () => {
    await index(db);
    const s = await server();

    const book = await s.page(`abs:${fourFiles.id}`);

    expect(book).toEqual({
      ref: { source: 'abs', id: fourFiles.id },
      kind: 'book',
      title: fourFilesBook.media.metadata.title,
      sub: fourFilesBook.media.metadata.authors!.map((a) => a.name).join(', '),
      art: `/api/media/abs:${fourFiles.id}/art`,
      progress: started.progress,
      duration: fourFiles.media.duration,
      availability: { kind: 'owned' },
      chapters: fourFiles.media.chapters.map(({ title, start, end }) => ({ title, start, end })),
      episodes: [],
      tracks: [],
    });
    expect(book.chapters).toHaveLength(4);
  });

  it("[M1.shell] opens a show with its host and art, and its episodes in the show's order, each with whether it was played and how far", async () => {
    await index(db);
    const s = await server(karaFinished);
    const show = shows.find((sh) => sh.id === finished.libraryItemId)!;

    const page = await s.page(`abs:${show.id}`);

    const order = episodesInOrder(db, show.id);
    expect(page).toMatchObject({
      ref: { source: 'abs', id: show.id },
      kind: 'show',
      title: show.media.metadata.title,
      sub: show.media.metadata.author,
      art: `/api/media/abs:${show.id}/art`,
      progress: null,
      chapters: [],
      tracks: [],
    });
    expect(page.episodes).toEqual(
      order.map((e) => ({
        ref: { source: 'abs', id: e.id },
        title: e.title,
        description: null,
        publishedAt: e.publishedAt,
        duration: e.duration,
        progress: e.id === finished.episodeId ? 1 : null,
        finished: e.id === finished.episodeId,
      })),
    );
    expect(page.episodes.filter((e) => e.finished)).toHaveLength(1);
  });

  it('[M1.shell] opens an album with its album artists and art, and its tracks in disc and track order', async () => {
    await index(db);
    const s = await server();

    const page = await s.page(`jellyfin:${album.Id}`);

    expect(page).toMatchObject({
      ref: { source: 'jellyfin', id: album.Id },
      kind: 'album',
      title: album.Name,
      sub: album.AlbumArtists.map((a) => a.Name).join(', '),
      art: `/api/media/jellyfin:${album.Id}/art`,
      progress: null,
      chapters: [],
      episodes: [],
    });
    const tracks = albumTracks(db, album.Id);
    expect(tracks.length).toBeGreaterThan(1);
    expect(page.tracks).toEqual(
      tracks.map((t) => ({
        ref: { source: 'jellyfin', id: t.id },
        number: t.position,
        title: t.title,
        sub: t.creators
          .filter((c) => c.role === 'artist')
          .map((c) => c.name)
          .join(', '),
        duration: t.duration,
      })),
    );
    expect(page.tracks.map((t) => t.number)).toEqual(
      [...page.tracks.map((t) => t.number)].sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
  });
});

/** A show's episodes as its recorded `GET /api/items/{id}` lists them, notes included. */
const recordedEpisodes = (showId: string) =>
  json<{ id: string; media: { episodes: { id: string; description: string | null }[] } }>(
    abs(['index-show-1', 'index-show-2'].find((c) => json<AbsItem>(abs(c)).id === showId)!),
  ).media.episodes;

describe("[M1.shell] an episode's page, from the index, its show and the person's own standing", () => {
  it("[M1.shell] opens an episode with its show's title and art, its notes, length and published date, and that it was played", async () => {
    await index(db);
    const s = await server(karaFinished);
    const show = shows.find((sh) => sh.id === finished.libraryItemId)!;
    const row = episodesInOrder(db, show.id).find((e) => e.id === finished.episodeId)!;
    const notes = recordedEpisodes(show.id).find((e) => e.id === row.id)!.description;

    const page = await s.page(`abs:${row.id}`);

    expect(notes).toEqual(expect.any(String));
    expect(page).toEqual({
      ref: { source: 'abs', id: row.id },
      kind: 'episode',
      title: row.title,
      sub: show.media.metadata.title,
      art: `/api/media/abs:${show.id}/art`,
      progress: 1,
      duration: row.duration,
      availability: { kind: 'owned' },
      chapters: [],
      episodes: [],
      tracks: [],
      episode: {
        show: { source: 'abs', id: show.id },
        description: notes,
        publishedAt: row.publishedAt,
        finished: true,
      },
    });
    expect(s.asked).toEqual(['/api/me', `/api/items/${show.id}`]);
  });

  it('[M1.shell] opens an episode not yet played as not started and not finished', async () => {
    await index(db);
    const s = await server(karaFinished);
    const show = shows.find((sh) => sh.id === finished.libraryItemId)!;
    const row = episodesInOrder(db, show.id).find((e) => e.id !== finished.episodeId)!;

    const page = await s.page(`abs:${row.id}`);

    expect(page).toMatchObject({ kind: 'episode', progress: null });
    expect(page.episode).toMatchObject({ finished: false });
  });

  it("answers 404 for an episode of a show in a library the person can't open, asking only who they are", async () => {
    await index(db);
    const booksOnly = structuredClone(me);
    Object.assign(json<AbsMe>(booksOnly), {
      permissions: { ...json<AbsMe>(me).permissions, accessAllLibraries: false },
      librariesAccessible: libraries.filter((l) => l.mediaType === 'book').map((l) => l.id),
    });
    const s = await server(booksOnly);
    const episode = episodesInOrder(db, shows[0]!.id)[0]!;

    expect(await s.item(`abs:${episode.id}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await s.item(`abs:${episode.id}`, 'nora')).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(s.asked).toEqual(['/api/me']);
  });
});

describe('an item page no one may open', () => {
  it("answers 404 for a book or album in a library the person can't open, asking only who they are", async () => {
    await index(db);
    const s = await server();

    expect(await s.item(`abs:${fourFiles.id}`, 'otto')).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(await s.item(`jellyfin:${album.Id}`, 'otto')).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(s.asked).toEqual(['/api/me', '/UserViews?includeHidden=true']);
  });

  it('answers 404 to a person linked to neither upstream, asking neither', async () => {
    await index(db);
    const s = await server();

    for (const key of [`abs:${fourFiles.id}`, `abs:${shows[0]!.id}`, `jellyfin:${album.Id}`]) {
      expect((await s.item(key, 'nora')).status).toBe(404);
    }
    expect(s.asked).toEqual([]);
  });

  it('answers 404 for a ref the index does not hold, or for a track, which has no page', async () => {
    await index(db);
    const s = await server();
    const track = albumTracks(db, album.Id)[0]!;

    for (const key of [
      'abs:00000000-0000-4000-8000-000000000000',
      'jellyfin:00000000000000000000000000000000',
      `jellyfin:${track.id}`,
    ]) {
      expect((await s.item(key)).status, key).toBe(404);
    }
    expect(s.asked).toEqual([]);
  });

  it('answers 400 to a ref that is not one, and 401 to a caller who is not signed in', async () => {
    const s = await server();

    expect(await s.item('abs:..%2Fetc')).toEqual({ status: 400, body: { error: 'bad_request' } });
    const res = await s.app.inject({ method: 'GET', url: `/api/items/abs:${fourFiles.id}` });
    expect(res.statusCode).toBe(401);
  });
});

const standIn = (upstream: string, name: string) =>
  readFileSync(join(adapters, upstream, 'recordings', name));

describe('[M1.shell] art, passed on from the upstream with the person’s own access', () => {
  it("passes a book's Audiobookshelf cover on as stored, private to the person and kept a day", async () => {
    await index(db);
    const s = await server();

    const res = await s.get(`/api/media/abs:${fourFiles.id}/art`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
    expect(res.rawPayload).toEqual(standIn('audiobookshelf', 'cover.webp'));
    expect(s.asked).toEqual(['/api/me', `/api/items/${fourFiles.id}/cover`]);
  });

  it("passes an album's Jellyfin primary image on, and asks each upstream for the size asked", async () => {
    await index(db);
    const s = await server();

    const image = await s.get(`/api/media/jellyfin:${album.Id}/art`);
    const medium = await s.get(`/api/media/jellyfin:${album.Id}/art?size=medium`);
    const cover = await s.get(`/api/media/abs:${fourFiles.id}/art?size=medium`);

    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.rawPayload).toEqual(standIn('jellyfin', 'primary.jpg'));
    expect([medium.statusCode, cover.statusCode]).toEqual([200, 200]);
    expect(s.asked).toContain(`/Items/${album.Id}/Images/Primary?maxWidth=${ART_WIDTH.medium}`);
    expect(s.asked).toContain(`/api/items/${fourFiles.id}/cover?width=${ART_WIDTH.medium}`);
  });

  it('keeps every upstream secret out of what the client sees: the URL is this server’s, and no header names the upstream or a token', async () => {
    await index(db);
    const s = await server();
    const listed = [...(await s.items('books')), ...(await s.items('music'))];

    for (const entry of listed) expect(entry.art).toMatch(/^\/api\/media\/[\w:-]+\/art$/);
    for (const url of [
      `/api/media/abs:${fourFiles.id}/art`,
      `/api/media/jellyfin:${album.Id}/art`,
    ]) {
      const res = await s.get(url);
      expect(res.statusCode).toBe(200);
      expect(res.headers.location).toBeUndefined();
      const headers = JSON.stringify(res.headers);
      expect(headers).not.toMatch(/upstream\.invalid|token|Token/);
    }
  });

  it("answers 404 for art in a library the person can't open, unknown art, or a track's, asking no image of either upstream", async () => {
    await index(db);
    const s = await server();
    const track = albumTracks(db, album.Id)[0]!;

    for (const [key, name] of [
      [`abs:${fourFiles.id}`, 'otto'],
      [`jellyfin:${album.Id}`, 'otto'],
      [`abs:${fourFiles.id}`, 'nora'],
      ['abs:00000000-0000-4000-8000-000000000000', 'kara'],
      [`jellyfin:${track.id}`, 'kara'],
    ] as const) {
      const res = await s.get(`/api/media/${key}/art`, name);
      expect([res.statusCode, res.json()], `${key} ${name}`).toEqual([404, { error: 'not_found' }]);
    }
    expect(s.asked.filter((a) => /cover|Images/.test(a))).toEqual([]);
  });

  it('checks who may see art once a minute per person, so a grid of covers costs one lookup; a page still asks afresh', async () => {
    await index(db);
    const s = await server();
    const urls = [`/api/media/abs:${fourFiles.id}/art`, `/api/media/jellyfin:${album.Id}/art`];
    const lookups = () => s.asked.filter((a) => a === '/api/me' || a.startsWith('/UserViews'));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let n = 0; n < 3; n += 1) {
        for (const url of urls) {
          expect((await s.get(url)).statusCode).toBe(200);
          expect((await s.get(`${url}?size=medium`)).statusCode).toBe(200);
        }
      }
      expect(lookups()).toEqual(['/api/me', '/UserViews?includeHidden=true']);

      expect((await s.get(urls[1]!, 'otto')).statusCode).toBe(404);
      expect(lookups()).toHaveLength(3);

      await s.page(`abs:${fourFiles.id}`);
      expect(lookups()).toHaveLength(4);

      vi.advanceTimersByTime(61_000);
      for (const url of urls) expect((await s.get(url)).statusCode).toBe(200);
      expect(lookups()).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers 400 to a size it does not draw', async () => {
    await index(db);
    const s = await server();

    const res = await s.get(`/api/media/abs:${fourFiles.id}/art?size=4000`);

    expect(res.statusCode).toBe(400);
    expect(s.asked).toEqual([]);
  });
});
