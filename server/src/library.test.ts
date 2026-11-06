/**
 * The library lists, the item pages and the art through the real routes, on an index the index
 * job fills from the recordings:
 * page four of each library (two books, two shows, two albums of the Music library) and the books
 * page holding the four-file book. Each person's own Audiobookshelf `GET /api/me` says which
 * libraries they may open, what they have begun and how far through each book they are; their
 * Jellyfin says which music libraries they see and what they have played. A book's page reads its length and chapters from its
 * expanded answer (`multi-detail`), and art passes the recorded covers and primary images on,
 * their bodies synthesized. Replay matches a call by method, path and query, so each person's
 * answers are told apart by the token their call carries.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ItemDetail, LibraryList, type MediaRef, type RequestRef } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbsClient } from './adapters/audiobookshelf/client.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch, standInsBeside } from './adapters/http/replay.js';
import { standInSteps } from './adapters/http/standIn.js';
import { JellyfinClient } from './adapters/jellyfin/client.js';
import { buildApp } from './app.js';
import { runIndex } from './libraryIndex/job.js';
import { albumTracks, episodesInOrder } from './libraryIndex/store.js';
import { advanceRequests } from './requests/job.js';
import { stepsRegistry } from './requests/steps.js';
import { ART_WIDTH } from './routes/items.js';
import { addClaim } from './store/claims.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createRequest, saveRequest } from './store/requests.js';
import { createSession } from './store/sessions.js';
import { writeSettings } from './store/settings.js';
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

/** otto's played tracks: the recorded answer, with none. The only change. */
const ottoPlayed = structuredClone(jf('jf-played-tracks'));
json<{ Items: unknown[]; TotalRecordCount: number }>(ottoPlayed).Items = [];
json<{ Items: unknown[]; TotalRecordCount: number }>(ottoPlayed).TotalRecordCount = 0;

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
 * kara, granted every library and seeing Music, who has begun one book and played one album; otto,
 * granted only Podcasts and seeing no music library, who has begun and played nothing; nora, linked
 * to neither upstream. Auralis's own accounts act past their reach, unless left out. Set `down` and
 * every upstream call fails.
 */
async function server(
  karaMe = me,
  karaPlayed = [jf('jf-played-tracks')],
  { household = true }: { household?: boolean } = {},
) {
  const asked: string[] = [];
  const upstream = { down: false };
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
  const plays = [
    jf('jf-track'),
    jf('jf-album-tracks'),
    jf('jf-playing'),
    jf('jf-progress'),
    jf('jf-stopped'),
    abs('episode-play'),
    abs('episode-close'),
  ];
  const kara = replayFetch([karaMe, jf('jf-user-views'), ...karaPlayed, ...reads], { readBytes });
  const otto = replayFetch([ottoMe, ottoViews, ottoPlayed, ...reads, ...plays], { readBytes });
  const fetch: FetchLike = async (url, init) => {
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    const { pathname, search } = new URL(url);
    asked.push(`${pathname}${search}`);
    if (upstream.down) throw new Error('the upstream is down');
    return (authorization.includes('kara') ? kara : otto)(url, init);
  };
  const bearer: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  for (const name of ['kara', 'otto', 'nora']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    userIds[name] = user.id;
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
    upstreams: {
      key: KEY,
      config: { absUrl: UPSTREAM, jellyfinUrl: UPSTREAM },
      fetch,
      ...(household
        ? {
            household: {
              abs: new AbsClient({ baseUrl: UPSTREAM, token: 'household', fetch }),
              jellyfin: new JellyfinClient({ baseUrl: UPSTREAM, token: 'household', fetch }),
            },
          }
        : {}),
    },
    playedPageSize: Number(jf('jf-played-tracks').request.query.Limit),
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
  const person = (name: string) => userIds[name] ?? '';
  const seesEveryones = (name = 'kara') =>
    writeSettings(db, person(name), { showEveryonesLibrary: true }, 0);
  const claim = (refs: MediaRef[], name = 'kara') => {
    for (const ref of refs) addClaim(db, person(name), ref, 'requested', 0);
  };
  const requested = async (medium: string, name = 'kara') => {
    const { status, body } = await list(medium, name);
    expect(status).toBe(200);
    return LibraryList.parse(body).requested;
  };
  const play = (ref: MediaRef, name: string) =>
    app.inject({
      method: 'POST',
      url: '/api/play',
      headers: { authorization: `Bearer ${bearer[name] ?? ''}` },
      payload: { ref },
    });
  return {
    app,
    asked,
    upstream,
    list,
    items,
    requested,
    get,
    item,
    page,
    person,
    seesEveryones,
    claim,
    play,
  };
}

/** The server, with kara's library set to show everything indexed. */
async function seeingEveryones() {
  const s = await server();
  s.seesEveryones();
  return s;
}

const absRef = (id: string): MediaRef => ({ source: 'abs', id });
const jfRef = (id: string): MediaRef => ({ source: 'jellyfin', id });
const everyBook = books.map((b) => absRef(b.id));
const everyShow = shows.map((show) => absRef(show.id));
const everyAlbum = albums.map((a) => jfRef(a.Id));

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

const POWERS = 'Powers [Sandvold]';
const STORM = 'The Storm Before the Storm - The Beginning of the End of the Roman Republic';
const POEMS = 'Three Poems from “Wild Angels”';
const WEIGHT = 'You Just Need to Lose Weight';
const MARSHALL = 'Marshall Islands: After the Bomb Dropped';
const MEGACORP = 'Megacorp';
const RUMOURS = 'Rumours';
const PRINCESS = 'The Rise and Fall of a Midwest Princess';

describe('[M2.sorting/a] sorting the library: by title, by author, host or artist, or Random by a seed', () => {
  const titles = (items: { title: string }[]) => items.map((e) => e.title);
  const sorted = async (s: Awaited<ReturnType<typeof server>>, url: string) => {
    const { status, body } = await s.list(url);
    expect(status).toBe(200);
    return LibraryList.parse(body);
  };

  it('[M2.sorting/a] sorts by title when no sort is asked for, and answers that with no seed', async () => {
    await index(db);
    const s = await seeingEveryones();

    const list = await sorted(s, 'books');

    expect(titles(list.items)).toEqual([POWERS, STORM, POEMS, WEIGHT]);
    expect(list).toMatchObject({ sort: 'title', seed: null });
    expect(titles((await sorted(s, 'books?sort=title')).items)).toEqual(titles(list.items));
  });

  it('[M2.sorting/a] sorts books by author, by the name as shown, Le Guin’s two broken by title', async () => {
    await index(db);
    const s = await seeingEveryones();

    const list = await sorted(s, 'books?sort=artist');

    expect(list.items.map((e) => [e.sub, e.title])).toEqual([
      ['Aubrey Gordon', WEIGHT],
      ['Mike Duncan', STORM],
      ['Ursula K. Le Guin', POWERS],
      ['Ursula K. Le Guin', POEMS],
    ]);
    expect(list).toMatchObject({ sort: 'artist', seed: null });
  });

  it('[M2.sorting/a] sorts podcasts by host, both shows’ one host broken by title', async () => {
    await index(db);
    const s = await seeingEveryones();

    const list = await sorted(s, 'podcasts?sort=artist');

    expect(list.items.map((e) => [e.sub, e.title])).toEqual([
      ['Cool Zone Media and iHeartPodcasts', MARSHALL],
      ['Cool Zone Media and iHeartPodcasts', MEGACORP],
    ]);
  });

  it('[M2.sorting/a] sorts music by title, with no article dropped, and by album artist', async () => {
    await index(db);
    const s = await seeingEveryones();

    expect(titles((await sorted(s, 'music?sort=title')).items)).toEqual([RUMOURS, PRINCESS]);
    expect((await sorted(s, 'music?sort=artist')).items.map((e) => [e.sub, e.title])).toEqual([
      ['Chappell Roan', PRINCESS],
      ['Fleetwood Mac', RUMOURS],
    ]);
  });

  it('[M2.sorting/a] shuffles by the seed it is given: seed 42 gives its own order, every time', async () => {
    await index(db);
    const s = await seeingEveryones();

    const once = await sorted(s, 'books?sort=random&seed=42');
    const again = await sorted(s, 'books?sort=random&seed=42');

    expect(titles(once.items)).toEqual([POWERS, STORM, WEIGHT, POEMS]);
    expect(titles(again.items)).toEqual(titles(once.items));
    expect(once).toMatchObject({ sort: 'random', seed: 42 });
  });

  it('[M2.sorting/a] gives another seed its own order', async () => {
    await index(db);
    const s = await seeingEveryones();

    const list = await sorted(s, 'books?sort=random&seed=7');

    expect(titles(list.items)).toEqual([POEMS, WEIGHT, STORM, POWERS]);
    expect(list.seed).toBe(7);
  });

  it('[M2.sorting/a] draws a seed for Random asked without one, and answers it, so asking with it gives the same order', async () => {
    await index(db);
    const s = await seeingEveryones();

    const drawn = await sorted(s, 'books?sort=random');

    expect(drawn.sort).toBe('random');
    expect(Number.isInteger(drawn.seed)).toBe(true);
    expect(drawn.seed).toBeGreaterThanOrEqual(0);
    expect(drawn.seed).toBeLessThanOrEqual(2 ** 32 - 1);
    const replayed = await sorted(s, `books?sort=random&seed=${String(drawn.seed)}`);
    expect(titles(replayed.items)).toEqual(titles(drawn.items));
  });

  it('[M2.sorting/a] draws a fresh seed each time Random is asked without one', async () => {
    await index(db);
    const s = await seeingEveryones();

    const seeds = new Set<number | null>();
    for (let i = 0; i < 5; i++) seeds.add((await sorted(s, 'books?sort=random')).seed);

    expect(seeds.size).toBeGreaterThan(1);
  });

  it('[M2.sorting/a] ignores a seed with any sort but Random, so an address may keep it', async () => {
    await index(db);
    const s = await seeingEveryones();

    const list = await sorted(s, 'books?sort=artist&seed=42');

    expect(list).toMatchObject({ sort: 'artist', seed: null });
    expect(titles(list.items)).toEqual([WEIGHT, STORM, POWERS, POEMS]);
  });

  it('[M2.sorting/a] refuses a sort it does not know, and a seed that is not a whole number from 0 to 2^32-1, with 400, asking no upstream', async () => {
    await index(db);
    const s = await seeingEveryones();

    for (const query of ['sort=size', 'sort=random&seed=-1', 'sort=random&seed=4294967296']) {
      expect(await s.list(`books?${query}`)).toEqual({
        status: 400,
        body: { error: 'bad_request' },
      });
    }
    expect(s.asked).toEqual([]);
  });
});

describe('[M1.shell/a] the signed-in person’s library, from the index on the recordings', () => {
  it('[M1.shell/a] lists the person’s books with their authors, art and progress from their own Audiobookshelf, each owned', async () => {
    await index(db);
    const s = await server();
    s.claim(everyBook);

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

  it('[M1.shell/a] lists the person’s podcast shows with their host and art, owned, with no progress of their own', async () => {
    await index(db);
    const s = await server();
    s.claim(everyShow);

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

  it('[M1.shell/a] lists the person’s albums with their album artists and art, owned', async () => {
    await index(db);
    const s = await server();
    s.claim(everyAlbum);

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
  });
});

describe('[M1.shell] art links', () => {
  it('[M1.shell] links art only for an item its upstream has art for: a cover, or a primary image', async () => {
    await index(db, true);
    const s = await seeingEveryones();
    const bare = [books[0]!.id, albums[0]!.Id];

    const listed = [...(await s.items('books')), ...(await s.items('music'))];

    expect(listed.filter((e) => e.art === null).map((e) => e.ref.id)).toEqual(bare);
    expect(listed.filter((e) => !bare.includes(e.ref.id)).every((e) => e.art !== null)).toBe(true);
    expect((await s.page(`jellyfin:${albums[0]!.Id}`)).art).toBeNull();
  });
});

describe('[M3.requests/c] a person’s own library', () => {
  const MEDIA = ['books', 'podcasts', 'music'] as const;
  const ids = (entries: { ref: MediaRef }[]) => entries.map((e) => e.ref.id).sort();
  const askFor = (id: string): RequestRef => ({
    medium: 'book',
    target: { title: `Asked for ${id}`, creator: 'An Author', ids: { asin: `B00000000${id}` } },
  });
  const jobFor = (...steps: Parameters<typeof stepsRegistry>[0]) => ({
    db,
    steps: stepsRegistry(steps),
    log: { error: () => undefined },
    now: () => 1,
    notIndexedAfterMs: 1_000,
    stepTimeoutMs: 1_000,
    stallAfterMs: 1_000,
    holdAfterMs: 1_000,
  });

  it('[M3.requests/c] shows empty lists to a person with no claims and no progress, linked or not', async () => {
    await index(db);
    const s = await server();
    for (const medium of MEDIA) {
      for (const name of ['otto', 'nora']) {
        expect(await s.items(medium, name)).toEqual([]);
        expect(await s.requested(medium, name)).toEqual([]);
      }
    }
  });

  it('[M3.requests/c] asks no upstream for a person linked to neither', async () => {
    await index(db);
    const s = await server();
    for (const medium of MEDIA) await s.items(medium, 'nora');
    expect(s.asked).toEqual([]);
  });

  it('[M3.requests/c] lists a book once a request for it reaches the library, whoever’s account reaches it', async () => {
    await index(db);
    const s = await server();
    const steps = standInSteps('book', { imports: everyBook[0]! });
    createRequest(db, s.person('nora'), askFor('1'), 0);
    for (let turn = 0; turn < 8; turn += 1) await advanceRequests(jobFor(steps));

    expect(ids(await s.items('books', 'nora'))).toEqual([everyBook[0]!.id]);
    expect(await s.requested('books', 'nora')).toEqual([]);
  });

  it('[M3.requests/c] lists an album once a track of it has played, and a show once an episode has', async () => {
    await index(db);
    const s = await server();
    expect(await s.items('music', 'otto')).toEqual([]);
    const track = json<{ Id: string }>(jf('jf-track')).Id;
    const episode = json<{ episodeId: string }>(abs('episode-play')).episodeId;

    const played = await s.play(jfRef(track), 'otto');
    expect(played.statusCode, played.body).toBe(200);
    const heard = await s.play(absRef(episode), 'otto');
    expect(heard.statusCode, heard.body).toBe(200);

    expect(ids(await s.items('music', 'otto'))).toEqual([everyAlbum[0]!.id]);
    expect(ids(await s.items('podcasts', 'otto'))).toEqual([everyShow[0]!.id]);
  });

  it('[M3.requests/c] claims nothing for a play that is refused', async () => {
    await index(db);
    const s = await server(me, undefined, { household: false });
    const track = json<{ Id: string }>(jf('jf-track')).Id;
    expect((await s.play(jfRef(track), 'nora')).statusCode).not.toBe(200);
    expect(await s.items('music', 'nora')).toEqual([]);
  });

  it('[M3.requests/c] counts the books a person began on Audiobookshelf and the albums they played on Jellyfin, from the recordings', async () => {
    await index(db);
    const s = await server();
    expect(ids(await s.items('books'))).toEqual([started.libraryItemId]);
    expect(ids(await s.items('music'))).toEqual([
      json<{ Items: { AlbumId: string }[] }>(jf('jf-played-tracks')).Items[0]!.AlbumId,
    ]);
    expect(await s.items('podcasts')).toEqual([]);
  });

  it('[M3.requests/c] counts a show once an episode of it is begun, under the show', async () => {
    await index(db);
    const begun = structuredClone(me);
    json<AbsMe>(begun).mediaProgress.push({
      ...json<AbsMe>(me).mediaProgress[0]!,
      libraryItemId: shows[0]!.id,
      episodeId: 'an-episode',
    });
    const s = await server(begun);
    expect(ids(await s.items('podcasts'))).toEqual([shows[0]!.id]);
  });

  it('[M3.requests/c] keeps a book in the library after it is removed from Continue Listening', async () => {
    await index(db);
    const hidden = structuredClone(me);
    Object.assign(json<AbsMe>(hidden).mediaProgress[0]!, { hideFromContinueListening: true });
    const s = await server(hidden);
    expect(ids(await s.items('books'))).toEqual([started.libraryItemId]);
  });

  it('[M3.requests/c] reads every page of what a person played', async () => {
    await index(db);
    const limit = Number(jf('jf-played-tracks').request.query.Limit);
    const first = structuredClone(jf('jf-played-tracks'));
    const page = json<{ Items: { AlbumId: string }[]; TotalRecordCount: number }>(first);
    page.TotalRecordCount = limit + 1;
    page.Items = Array.from({ length: limit }, () => page.Items[0]!);
    const second = structuredClone(jf('jf-played-tracks'));
    second.request.query.StartIndex = String(limit);
    const last = json<{ Items: { AlbumId: string }[]; TotalRecordCount: number }>(second);
    last.TotalRecordCount = limit + 1;
    last.Items[0]!.AlbumId = albums[1]!.Id;

    const s = await server(me, [first, second]);
    expect(ids(await s.items('music'))).toEqual(everyAlbum.map((a) => a.id).sort());
  });

  it('[M3.requests/c] never shows another person’s claims or requests', async () => {
    await index(db);
    const s = await server();
    s.claim(everyBook, 'kara');
    createRequest(db, s.person('kara'), askFor('2'), 0);
    expect(await s.items('books', 'otto')).toEqual([]);
    expect(await s.items('books', 'nora')).toEqual([]);
    expect(await s.requested('books', 'nora')).toEqual([]);
  });

  it('[M3.requests/c] shows requests on their way as `requested` with their status, each under its own list', async () => {
    await index(db);
    const s = await server();
    const nora = s.person('nora');
    const { request } = createRequest(db, nora, askFor('3'), 0);
    createRequest(
      db,
      nora,
      {
        medium: 'song',
        target: { title: 'A Song', creator: null, ids: { youtubeMusicId: 'dQw4w9WgXcQ' } },
      },
      0,
    );
    createRequest(
      db,
      nora,
      {
        medium: 'podcast',
        target: { title: 'A Show', creator: null, ids: { feedUrl: 'https://feeds.example.com/s' } },
      },
      0,
    );
    expect(await s.requested('books', 'nora')).toEqual([
      {
        id: request.id,
        kind: 'book',
        title: 'Asked for 3',
        sub: 'An Author',
        art: null,
        availability: { kind: 'requested', status: 'requested' },
      },
    ]);
    expect((await s.requested('music', 'nora')).map((e) => [e.title, e.kind])).toEqual([
      ['A Song', 'album'],
    ]);
    expect((await s.requested('podcasts', 'nora')).map((e) => [e.title, e.kind])).toEqual([
      ['A Show', 'show'],
    ]);

    const state = { status: 'downloading', progress: 0.25 } as const;
    saveRequest(db, request.id, { state }, 1, request.version);
    expect((await s.requested('books', 'nora'))[0]?.availability).toEqual({
      kind: 'requested',
      status: 'downloading',
      progress: 0.25,
    });
  });

  it('[M3.requests/c] lists every indexed item with `showEveryonesLibrary` on, whatever the person’s accounts reach, and their requests beside', async () => {
    await index(db);
    const s = await server();
    s.seesEveryones('nora');
    s.seesEveryones('otto');
    createRequest(db, s.person('nora'), askFor('4'), 0);
    for (const name of ['nora', 'otto']) {
      expect(ids(await s.items('books', name))).toEqual(everyBook.map((b) => b.id).sort());
      expect(ids(await s.items('podcasts', name))).toEqual(everyShow.map((b) => b.id).sort());
      expect(ids(await s.items('music', name))).toEqual(everyAlbum.map((b) => b.id).sort());
    }
    expect((await s.requested('books', 'nora')).map((e) => e.title)).toEqual(['Asked for 4']);
  });

  it('[M3.requests/c] opens the page and art of whatever a person’s list shows, whatever their own accounts reach', async () => {
    await index(db);
    const s = await server();
    s.seesEveryones('otto');
    const listed = ids(await s.items('books', 'otto'));
    expect(listed).toContain(fourFiles.id);

    expect((await s.item(`abs:${fourFiles.id}`, 'otto')).status).toBe(200);
    expect((await s.get(`/api/media/abs:${fourFiles.id}/art`, 'otto')).statusCode).toBe(200);
  });

  it('[M3.requests/c] lists a request once only when its item is already listed', async () => {
    await index(db);
    const s = await server();
    s.seesEveryones('nora');
    const { request } = createRequest(db, s.person('nora'), askFor('5'), 0);
    saveRequest(
      db,
      request.id,
      { state: { status: 'importing' }, result: everyBook[0]! },
      1,
      request.version,
    );
    expect(await s.requested('books', 'nora')).toEqual([]);
  });

  describe('when a read of what a person heard or played fails', () => {
    it('[M3.requests/c] still lists all that earlier reads found, and its claims, leaving progress out', async () => {
      await index(db);
      const s = await server();
      s.claim([everyBook[1]!]);
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        expect(ids(await s.items('books'))).toContain(started.libraryItemId);
        expect(ids(await s.items('music'))).toHaveLength(1);

        s.upstream.down = true;
        vi.advanceTimersByTime(61_000);
        const books = await s.items('books');
        expect(ids(books)).toEqual([everyBook[1]!.id, started.libraryItemId].sort());
        expect(books.every((e) => e.progress === null)).toBe(true);
        expect(ids(await s.items('music'))).toHaveLength(1);

        s.upstream.down = false;
        const back = await s.items('books');
        expect(back.find((e) => e.ref.id === started.libraryItemId)?.progress).toBe(
          started.progress,
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('[M3.requests/c] answers from the claims alone when no read has ever worked', async () => {
      await index(db);
      const s = await server();
      s.claim([everyBook[0]!, everyAlbum[1]!]);
      s.upstream.down = true;
      expect(ids(await s.items('books'))).toEqual([everyBook[0]!.id]);
      expect(ids(await s.items('music'))).toEqual([everyAlbum[1]!.id]);
      expect(await s.items('podcasts')).toEqual([]);
    });
  });

  it('[M3.requests/c] reads what a person heard or played once a minute at most', async () => {
    await index(db);
    const s = await server();
    const reads = () => s.asked.filter((a) => a === '/api/me' || a.startsWith('/Items?'));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let n = 0; n < 3; n += 1) {
        await s.items('books');
        await s.items('podcasts');
        await s.items('music');
      }
      expect(reads()).toHaveLength(2);
      vi.advanceTimersByTime(61_000);
      await s.items('books');
      expect(reads()).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the library route', () => {
  it('answers an empty list for a library with nothing indexed', async () => {
    const s = await server();

    for (const medium of ['books', 'podcasts', 'music']) {
      expect(await s.list(medium)).toEqual({
        status: 200,
        body: { items: [], requested: [], sort: 'title', seed: null },
      });
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
      sort: 'newest',
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

  it("[M2.sorting] names a show's own order, newest first unless serial, and lists it reversed when asked the other", async () => {
    await index(db);
    const s = await server();
    const show = shows.find((sh) => sh.id === finished.libraryItemId)!;
    const refs = (page: ItemDetail) => page.episodes.map((e) => e.ref.id);

    const own = await s.page(`abs:${show.id}`);
    expect(own.sort, 'a show whose feed was never read').toBe('newest');
    expect(refs(own)).toEqual(episodesInOrder(db, show.id).map((e) => e.id));
    expect(refs(own).length).toBeGreaterThan(1);
    expect(await s.page(`abs:${show.id}?sort=newest`)).toEqual(own);
    const flipped = await s.page(`abs:${show.id}?sort=oldest`);
    expect(flipped.sort).toBe('oldest');
    expect(refs(flipped)).toEqual(refs(own).reverse());

    db.prepare(`UPDATE index_items SET episode_order = 'serial' WHERE upstream_id = ?`).run(
      show.id,
    );
    const serial = await s.page(`abs:${show.id}`);
    expect(serial.sort).toBe('oldest');
    expect(refs(serial)).toEqual(episodesInOrder(db, show.id).map((e) => e.id));
    expect(refs(await s.page(`abs:${show.id}?sort=newest`))).toEqual(refs(serial).reverse());
  });

  it('[M2.sorting] keeps an undated episode last in either order', async () => {
    await index(db);
    const s = await server();
    const show = shows.find((sh) => sh.id === finished.libraryItemId)!;
    const refs = (page: ItemDetail) => page.episodes.map((e) => e.ref.id);
    const [undated, ...dated] = episodesInOrder(db, show.id).map((e) => e.id);
    expect(dated.length).toBeGreaterThan(1);
    db.prepare(
      `UPDATE index_items SET published_at = NULL, disc = NULL, position = NULL WHERE upstream_id = ?`,
    ).run(undated);

    expect(refs(await s.page(`abs:${show.id}`))).toEqual([...dated, undated]);
    expect(refs(await s.page(`abs:${show.id}?sort=oldest`))).toEqual([...dated.reverse(), undated]);
  });

  it('[M2.sorting] refuses a show page asked any order but oldest or newest first', async () => {
    await index(db);
    const s = await server();
    const show = shows.find((sh) => sh.id === finished.libraryItemId)!;
    expect((await s.item(`abs:${show.id}?sort=title`)).status).toBe(400);
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
    const s = await server(booksOnly, undefined, { household: false });
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
    const s = await server(me, undefined, { household: false });

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
    const s = await server(me, undefined, { household: false });

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
    const s = await seeingEveryones();
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
    const s = await server(me, undefined, { household: false });
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
    const s = await server(me, undefined, { household: false });
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
