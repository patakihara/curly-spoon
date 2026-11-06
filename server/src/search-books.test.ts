/**
 * Search's book rows through the real routes: Audible answers from its recordings, the requests'
 * steps are stand-ins, and what the household holds is written to the index as the index job does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SearchResults, SuggestionList } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AudibleClient } from './adapters/audible/client.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { standInSteps } from './adapters/http/standIn.js';
import { buildApp } from './app.js';
import { type IndexRow } from './libraryIndex/rows.js';
import { applyRow, emptyCounts } from './libraryIndex/store.js';
import { bookCatalogue, type BookCatalogue } from './requests/books/catalogue.js';
import { stepsRegistry } from './requests/steps.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createRequest, saveRequest } from './store/requests.js';
import { createSession } from './store/sessions.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const recording = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, 'audible', 'recordings', `${call}.json`), 'utf8')),
  );
const JEKYLL = 'B09J9BJ8DF';
const log = { error: () => undefined };
const T0 = Date.UTC(2026, 10, 5, 8);

const audible = (fetch: FetchLike = replayFetch(['search-jekyll'].map(recording))) =>
  new AudibleClient({ baseUrl: 'http://upstream.invalid', fetch });

function indexedBook(
  db: Db,
  id: string,
  title: string,
  authors: string[],
  ids: Record<string, string> = {},
) {
  const row: IndexRow = {
    source: 'abs',
    id,
    kind: 'book',
    parentId: null,
    libraryId: 'books',
    title,
    creators: authors.map((name) => ({ name, role: 'author' as const })),
    series: [],
    genres: [],
    position: null,
    disc: null,
    duration: 60,
    year: null,
    publishedAt: null,
    upstreamVersion: null,
    ids,
    episodeOrder: null,
    hasArt: false,
    hasLyrics: false,
  };
  applyRow(db, row, T0, emptyCounts());
}

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function server(
  options: { catalogue?: BookCatalogue; steps?: boolean; artFetch?: FetchLike } = {},
) {
  const db = openDatabase(':memory:');
  const catalogue =
    options.catalogue ??
    bookCatalogue({
      audible: audible(),
      fetchArt: options.artFetch ?? (async () => new Response(null, { status: 500 })),
      now: () => T0,
      log,
    });
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: {
      key: Buffer.alloc(32, 7),
      config: { absUrl: undefined, jellyfinUrl: undefined },
      fetch: replayFetch([]),
    },
    now: () => T0,
    logger: false,
    bookCatalogue: catalogue,
    ...(options.steps === false
      ? {}
      : {
          requests: {
            steps: stepsRegistry([standInSteps('book')]),
            everyMs: 3_600_000,
            notIndexedAfterMs: 60_000,
            stepTimeoutMs: 0,
            stallAfterMs: 60_000,
            holdAfterMs: 60_000,
          },
        }),
  });
  apps.push(app);
  const person = (name: string) => {
    const user = upsertUser(db, { username: name, role: 'member' });
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    const { token } = createSession(db, { userId: user.id, deviceId: device.id, kind: 'bearer' });
    return { user, headers: { authorization: `Bearer ${token}` } };
  };
  const kara = person('kara');
  const search = async (q = 'jekyll stevenson', kinds = '', who = kara) => {
    const url = `/api/search?q=${encodeURIComponent(q)}${kinds}`;
    const answer = await app.inject({ method: 'GET', url, headers: who.headers });
    expect(answer.statusCode).toBe(200);
    return SearchResults.parse(answer.json());
  };
  return { app, db, kara, person, search };
}

describe('[M3.books] book rows in Search', () => {
  it('[M3.books] lists what Audible finds, each with a ref that POST /requests takes', async () => {
    const { app, kara, search } = await server();
    const { books } = await search();
    expect(books).toHaveLength(10);
    const row = books.find(({ ref }) => ref.target.ids.asin === JEKYLL)!;
    expect(row).toMatchObject({
      title: 'The Strange Case of Dr Jekyll and Mr Hyde',
      author: 'Robert Louis Stevenson',
      narrator: 'Paapa Essiedu',
      status: null,
      progress: null,
      item: null,
    });
    expect(row.art).toBe(`/api/search/books/${JEKYLL}/art`);
    const made = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: kara.headers,
      payload: { ref: row.ref },
    });
    expect(made.statusCode).toBeLessThan(300);
    expect(made.json()).toMatchObject({ medium: 'book', status: 'requested' });
  });

  it('[M3.books] a row the same person taps again joins what they hold, and starts no other', async () => {
    const { app, kara, search } = await server();
    const { books } = await search();
    const payload = { ref: books[0]!.ref };
    const post = () =>
      app.inject({ method: 'POST', url: '/api/requests', headers: kara.headers, payload });
    const first = (await post()).json<{ id: string }>();
    const second = (await post()).json<{ id: string }>();
    expect(second.id).toBe(first.id);
    const listed = await app.inject({
      method: 'GET',
      url: '/api/requests',
      headers: kara.headers,
    });
    expect(listed.json<{ inFlight: unknown[] }>().inFlight).toHaveLength(1);
  });

  it('[M3.books] drops an owned book by its ASIN', async () => {
    const { db, search } = await server();
    indexedBook(db, 'a', 'A Different Title Altogether', ['Someone Else'], { asin: JEKYLL });
    const asins = (await search()).books.map(({ ref }) => ref.target.ids.asin);
    expect(asins).not.toContain(JEKYLL);
  });

  it('[M3.books] drops an owned book by its title and author, however each is written', async () => {
    const { db, search } = await server();
    indexedBook(db, 'a', 'the strange case of dr. jekyll & mr. hyde [Essiedu]', [
      'R. L. Stevenson',
    ]);
    const titles = (await search()).books.map(({ title }) => title);
    expect(titles).not.toContain('The Strange Case of Dr Jekyll and Mr Hyde');
    expect(titles).not.toContain('The Strange Case of Dr. Jekyll and Mr. Hyde');
    expect(titles).toContain('Dr. Jekyll and Mr. Hyde');
  });

  it('[M3.books] treats "not sure" as owned: the title matches, and one side names no author', async () => {
    const { db, search } = await server();
    indexedBook(db, 'a', 'Dr. Jekyll and Mr. Hyde', []);
    const titles = (await search()).books.map(({ title }) => title);
    expect(titles).not.toContain('Dr. Jekyll and Mr. Hyde');
    expect(titles).not.toContain('Dr Jekyll & Mr Hyde');
  });

  it('[M3.books] keeps a book that shares only its title with another author’s', async () => {
    const { db, search } = await server();
    indexedBook(db, 'a', 'Dr. Jekyll and Mr. Hyde', ['Someone Else']);
    const titles = (await search()).books.map(({ title }) => title);
    expect(titles).toContain('Dr. Jekyll and Mr. Hyde');
  });

  it('[M3.books] keeps a sequel that only shares its series name before the colon with a book you own', async () => {
    const product = (asin: string, title: string) => ({
      asin,
      title,
      authors: [{ name: 'Brandon Sanderson', asin: null }],
      narrators: [],
      series: [],
      runtimeMinutes: null,
      year: null,
      language: null,
      description: null,
      imageUrl: null,
    });
    const { db, search } = await server({
      catalogue: {
        search: async () => [product('B000000011', 'Mistborn: The Well of Ascension')],
        art: async () => null,
      },
    });
    indexedBook(db, 'a', 'Mistborn: The Final Empire', ['Brandon Sanderson']);
    const titles = (await search('mistborn')).books.map(({ title }) => title);
    expect(titles).toContain('Mistborn: The Well of Ascension');
  });

  it('[M3.books] takes the words of a whole title in any order as the same book, and a subtitle only one side has as another', async () => {
    const product = (asin: string, title: string) => ({
      asin,
      title,
      authors: [{ name: 'Brandon Sanderson', asin: null }],
      narrators: [],
      series: [],
      runtimeMinutes: null,
      year: null,
      language: null,
      description: null,
      imageUrl: null,
    });
    const { db, search } = await server({
      catalogue: {
        search: async () => [
          product('B000000011', 'The Final Empire: Mistborn'),
          product('B000000012', 'Mistborn'),
          product('B000000013', 'Mistborn: The Well of Ascension'),
        ],
        art: async () => null,
      },
    });
    indexedBook(db, 'a', 'Mistborn: The Final Empire', []);
    const titles = (await search('mistborn')).books.map(({ title }) => title);
    expect(titles).toEqual(['Mistborn', 'Mistborn: The Well of Ascension']);
  });

  it('[M3.books] whoever sees someone else’s request on a row has a way in: a Request to join it, or the request in their own list', async () => {
    const { app, db, kara, person, search } = await server();
    const { books } = await search();
    const ref = books.find((book) => book.ref.target.ids.asin === JEKYLL)!.ref;
    const { request } = createRequest(db, kara.user.id, ref, T0);
    saveRequest(db, request.id, { state: { status: 'downloading', progress: 0.42 } }, T0);
    const otto = person('otto');
    const row = (await search('jekyll stevenson', '', otto)).books.find(
      (book) => book.ref.target.ids.asin === JEKYLL,
    )!;
    const list = await app.inject({ method: 'GET', url: '/api/requests', headers: otto.headers });
    const canAsk = row.status === null;
    const listed = (list.json() as { inFlight: unknown[] }).inFlight.length > 0;
    // The web draws a row with a status with no button, and it opens Requests.
    expect(canAsk || listed).toBe(true);
  });

  it('[M3.books] shows a live request’s status and a download’s progress to those on it, and nothing of it to anyone else until they join', async () => {
    const { app, db, kara, person, search } = await server();
    const { books } = await search();
    const ref = books.find((book) => book.ref.target.ids.asin === JEKYLL)!.ref;
    const { request } = createRequest(db, kara.user.id, ref, T0);
    saveRequest(db, request.id, { state: { status: 'downloading', progress: 0.42 } }, T0);
    const rowFor = async (who: typeof kara) =>
      (await search('jekyll stevenson', '', who)).books.find(
        (book) => book.ref.target.ids.asin === JEKYLL,
      )!;
    expect(await rowFor(kara)).toMatchObject({ status: 'downloading', progress: 0.42 });

    const otto = person('otto');
    expect(await rowFor(otto)).toMatchObject({ status: null, progress: null, item: null });
    const listed = async () =>
      (await app.inject({ method: 'GET', url: '/api/requests', headers: otto.headers })).json<{
        inFlight: { id: string }[];
      }>().inFlight;
    expect(await listed()).toEqual([]);

    const joined = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: otto.headers,
      payload: { ref },
    });
    expect(joined.json()).toMatchObject({ id: request.id, status: 'downloading' });
    expect(await rowFor(otto)).toMatchObject({ status: 'downloading' });
    expect((await listed()).map(({ id }) => id)).toEqual([request.id]);
  });

  it('[M3.books] a book someone else is getting that the library holds stays out, as any owned book does', async () => {
    const { db, kara, person, search } = await server();
    const { books } = await search();
    const ref = books.find((book) => book.ref.target.ids.asin === JEKYLL)!.ref;
    createRequest(db, kara.user.id, ref, T0);
    indexedBook(db, 'a', 'A Different Title Altogether', ['Someone Else'], { asin: JEKYLL });
    const others = await search('jekyll stevenson', '', person('otto'));
    expect(others.books.map((book) => book.ref.target.ids.asin)).not.toContain(JEKYLL);
  });

  it('[M3.books] a failed request shows only to those on it; anyone else may still ask', async () => {
    const { db, kara, person, search } = await server();
    const { books } = await search();
    const ref = books.find((book) => book.ref.target.ids.asin === JEKYLL)!.ref;
    const { request } = createRequest(db, kara.user.id, ref, T0);
    saveRequest(
      db,
      request.id,
      { state: { status: 'failed', failedStep: 'searching', reason: 'noRelease' } },
      T0,
    );
    const statusFor = async (who: typeof kara) =>
      (await search('jekyll stevenson', '', who)).books.find(
        (book) => book.ref.target.ids.asin === JEKYLL,
      )!.status;
    expect(await statusFor(kara)).toBe('failed');
    expect(await statusFor(person('otto'))).toBeNull();
  });

  it('[M3.books] a person’s request row says it is in the library once there; to others it is simply owned', async () => {
    const { db, kara, person, search } = await server();
    const { books } = await search();
    const ref = books.find((book) => book.ref.target.ids.asin === JEKYLL)!.ref;
    const { request } = createRequest(db, kara.user.id, ref, T0);
    indexedBook(db, 'arrived', ref.target.title, ['Robert Louis Stevenson'], { asin: JEKYLL });
    saveRequest(
      db,
      request.id,
      { state: { status: 'inLibrary' }, result: { source: 'abs', id: 'arrived' } },
      T0,
    );
    const mine = (await search()).books.find((book) => book.ref.target.ids.asin === JEKYLL);
    expect(mine).toMatchObject({
      status: 'inLibrary',
      item: { source: 'abs', id: 'arrived' },
    });
    const others = await search('jekyll stevenson', '', person('otto'));
    expect(others.books.map((book) => book.ref.target.ids.asin)).not.toContain(JEKYLL);
  });

  it('[M3.books] a request that arrived and has since left the library is requestable again', async () => {
    const { db, kara, search } = await server();
    const { books } = await search();
    const ref = books.find((book) => book.ref.target.ids.asin === JEKYLL)!.ref;
    const { request } = createRequest(db, kara.user.id, ref, T0);
    saveRequest(
      db,
      request.id,
      { state: { status: 'inLibrary' }, result: { source: 'abs', id: 'gone' } },
      T0,
    );
    const row = (await search()).books.find((book) => book.ref.target.ids.asin === JEKYLL);
    expect(row?.status).toBeNull();
  });

  it('[M3.books] Audible down still answers the library’s results, with no book rows', async () => {
    const { db, search } = await server({
      catalogue: bookCatalogue({
        audible: audible(async () => {
          throw new TypeError('connection refused');
        }),
        fetchArt: async () => new Response(null, { status: 500 }),
        now: () => T0,
        log,
      }),
    });
    indexedBook(db, 'a', 'Jekyll Stevenson Own Copy', ['Someone']);
    const answer = await search();
    expect(answer.books).toEqual([]);
    expect(answer.results.map(({ title }) => title)).toEqual(['Jekyll Stevenson Own Copy']);
  });

  it('[M3.books] Search waits for Audible only up to its limit, and then draws the library', async () => {
    const started = Date.now();
    const { db, search } = await server({
      catalogue: bookCatalogue({
        audible: audible(() => new Promise<Response>(() => undefined)),
        fetchArt: async () => new Response(null, { status: 500 }),
        now: () => T0,
        log,
        limitMs: 50,
      }),
    });
    indexedBook(db, 'a', 'Jekyll Stevenson Own Copy', ['Someone']);
    const answer = await search();
    expect(answer.books).toEqual([]);
    expect(answer.results).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('[M3.books] the suggestions never reach the outside source, however slow it is', async () => {
    let calls = 0;
    const { app, kara } = await server({
      catalogue: {
        search: () => {
          calls += 1;
          return new Promise(() => undefined);
        },
        art: async () => null,
      },
    });
    const answer = await app.inject({
      method: 'GET',
      url: '/api/search/suggest?q=jek',
      headers: kara.headers,
    });
    expect(answer.statusCode).toBe(200);
    SuggestionList.parse(answer.json());
    expect(calls).toBe(0);
  });

  it('[M3.books] no steps registered gives no book rows and no outside call, as nothing could take the tap', async () => {
    let calls = 0;
    const { search } = await server({
      steps: false,
      catalogue: {
        search: async () => {
          calls += 1;
          return [];
        },
        art: async () => null,
      },
    });
    expect((await search()).books).toEqual([]);
    expect(calls).toBe(0);
  });

  it('[M3.books] a search of other kinds alone asks no outside source', async () => {
    let calls = 0;
    const { search } = await server({
      catalogue: {
        search: async () => {
          calls += 1;
          return [];
        },
        art: async () => null,
      },
    });
    expect((await search('jekyll', '&kinds=album')).books).toEqual([]);
    expect(calls).toBe(0);
    await search('jekyll', '&kinds=book');
    expect(calls).toBe(1);
  });

  it('[M3.books] the same search within five minutes asks Audible once; a failure is not kept', async () => {
    let asked = 0;
    let clock = T0;
    let fails = true;
    const replay = replayFetch(['search-jekyll'].map(recording));
    const catalogue = bookCatalogue({
      audible: audible(async (url, init) => {
        asked += 1;
        if (fails) throw new TypeError('connection refused');
        return replay(url, init);
      }),
      fetchArt: async () => new Response(null, { status: 500 }),
      now: () => clock,
      log,
    });
    const gone = new AbortController().signal;
    expect(await catalogue.search('jekyll stevenson', gone)).toEqual([]);
    fails = false;
    await catalogue.search('jekyll stevenson', gone);
    await catalogue.search('  JEKYLL   stevenson ', gone);
    expect(asked).toBe(2);
    clock += 5 * 60_000;
    await catalogue.search('jekyll stevenson', gone);
    expect(asked).toBe(3);
  });

  describe('a row’s art', () => {
    const IMAGE = new Uint8Array([0xff, 0xd8, 0xff]);
    const art = (app: FastifyInstance, headers: object, asin: string) =>
      app.inject({ method: 'GET', url: `/api/search/books/${asin}/art`, headers: { ...headers } });

    it('[M3.books] serves the image at the address the parsed product gave, with no other', async () => {
      const asked: string[] = [];
      const { app, kara, search } = await server({
        artFetch: async (url) => {
          asked.push(url);
          return new Response(IMAGE, { headers: { 'content-type': 'image/jpeg' } });
        },
      });
      await search();
      const answer = await art(app, kara.headers, JEKYLL);
      expect(answer.statusCode).toBe(200);
      expect(answer.headers['content-type']).toBe('image/jpeg');
      expect(answer.rawPayload).toEqual(Buffer.from(IMAGE));
      expect(asked).toEqual(['https://m.media-amazon.com/images/I/51lhbwbqi0L._SL500_.jpg']);
    });

    it('[M3.books] answers 404 for what is not an image, or a source that fails', async () => {
      const { app, kara, search } = await server({
        artFetch: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      });
      await search();
      expect((await art(app, kara.headers, JEKYLL)).statusCode).toBe(404);
    });

    it('[M3.books] answers 404 for an image that can carry script, as it would run on the app’s own address', async () => {
      const { app, kara, search } = await server({
        artFetch: async () =>
          new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>0</script></svg>', {
            headers: { 'content-type': 'image/svg+xml' },
          }),
      });
      await search();
      expect((await art(app, kara.headers, JEKYLL)).statusCode).toBe(404);
    });

    it.each(['image/gif', 'image/avif', 'image/svg+xml;charset=utf-8', 'IMAGE/SVG+XML'])(
      '[M3.books] answers 404 for %s, serving only jpeg, png and webp',
      async (type) => {
        const { app, kara, search } = await server({
          artFetch: async () =>
            new Response(new Uint8Array([1]), { headers: { 'content-type': type } }),
        });
        await search();
        expect((await art(app, kara.headers, JEKYLL)).statusCode).toBe(404);
      },
    );

    it.each([
      ['image/jpeg', 'image/jpeg'],
      ['IMAGE/PNG', 'image/png'],
      ['image/webp; charset=binary', 'image/webp'],
    ])('[M3.books] serves %s as %s', async (given, served) => {
      const { app, kara, search } = await server({
        artFetch: async () =>
          new Response(new Uint8Array([1]), { headers: { 'content-type': given } }),
      });
      await search();
      const answer = await art(app, kara.headers, JEKYLL);
      expect(answer.statusCode).toBe(200);
      expect(answer.headers['content-type']).toBe(served);
    });

    it('[M3.books] refuses what is not an ASIN, and anyone not signed in', async () => {
      const { app, kara } = await server();
      expect((await art(app, kara.headers, '..%2Fetc')).statusCode).toBe(400);
      expect((await art(app, {}, JEKYLL)).statusCode).toBe(401);
    });
  });
});
