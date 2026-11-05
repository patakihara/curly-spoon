/**
 * A book's import through the real job, store, index and clients, on a real temp folder and on
 * recordings from mediaserver. Audiobookshelf's watcher finds the folder: nothing here asks for a
 * scan, and only the search and the download stand in, as those are other parts' steps.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MediaRef, RequestRef } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudibleClient, AUDIBLE_URL } from '../../adapters/audible/client.js';
import { AbsClient } from '../../adapters/audiobookshelf/client.js';
import { AbsProvisioner } from '../../adapters/audiobookshelf/provision.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../../adapters/http/replay.js';
import { indexedRow } from '../../libraryIndex/store.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, getRequest, type StoredRequest } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests, type RequestJobDeps } from '../job.js';
import { type MediumSteps, type Release, StepUnavailable, stepsRegistry } from '../steps.js';
import { bookImport, type BookImportDeps } from './import.js';
import { BookRefused } from './names.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '../../adapters');
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const absCall = (call: string) => recorded('audiobookshelf', call);
const jsonBody = (recording: Recording) =>
  (recording.response.body as { json: Record<string, unknown> }).json;

const ABS = 'http://abs.invalid:13378';
const ASIN = 'B09J9BJ8DF';
const HASH = '7acf8fb590b2060dd9c3146ef770169d593433b0';
const DOWNLOADS = '/data/Downloads';
const FOLDER =
  'Robert Louis Stevenson/2021 - The Strange Case of Dr Jekyll and Mr Hyde (Neufeld) 64k';
const PHOTO =
  'https://images-na.ssl-images-amazon.com/images/S/amzn-author-media-prod/rldi51cf3nr99abtt922mgh6hi.jpg';
const MINUTE = 60_000;

const release: Release = {
  id: 'release-1',
  title: 'The Strange Case of Dr Jekyll and Mr Hyde',
  source: 'an indexer',
  size: null,
  details: { narrators: ['Bob Neufeld'], bitrateKbps: 64 },
};

const row = (more: Record<string, unknown> = {}) => ({
  ...(jsonBody(recorded('qbittorrent', 'info-done')) as unknown as Record<string, unknown>[])[0],
  ...more,
});
const refOf: RequestRef = {
  medium: 'book',
  target: { title: 'client text', creator: 'client text', ids: { asin: ASIN } },
};

let media: string;
let db: Db;
let person: string;
let clock: number;
const errors: Record<string, unknown>[] = [];
const log = {
  error: (details: Record<string, unknown>, message: string) =>
    errors.push({ ...details, message }),
};

beforeEach(() => {
  media = mkdtempSync(join(tmpdir(), 'auralis-import-'));
  mkdirSync(join(media, 'Books'));
  for (const name of ['01.mp3', '02.mp3', 'cover.jpg']) {
    mkdirSync(join(media, 'Downloads', 'Jekyll'), { recursive: true });
    writeFileSync(join(media, 'Downloads', 'Jekyll', name), `bytes of ${name}`);
  }
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 10, 5, 8);
  person = upsertUser(db, { username: 'ana', role: 'member' }).id;
  errors.length = 0;
});
afterEach(() => rmSync(media, { recursive: true, force: true }));

/** Audiobookshelf as recorded, with the placed folder appearing once the watcher has seen it. */
function shelf(
  options: { seen?: () => boolean; library?: (library: Record<string, unknown>) => void } = {},
) {
  const asked: string[] = [];
  const replay = replayFetch(
    ['library-list', 'index-book-new', 'author-new', 'author-image-refused'].map(absCall),
  );
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.endsWith('/items')) {
      const rec = absCall('newest-items');
      const page = jsonBody(rec) as { results: Record<string, unknown>[] };
      const results = (options.seen ?? (() => true))()
        ? page.results.map((one) => ({ ...one, relPath: FOLDER }))
        : [];
      return new Response(JSON.stringify({ ...page, results }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/libraries' && options.library) {
      const answer = jsonBody(absCall('library-list')) as { libraries: Record<string, unknown>[] };
      answer.libraries.forEach(options.library);
      return new Response(JSON.stringify(answer), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return replay(input, init);
  };
  return { fetch, asked };
}

function deps(fetch: FetchLike, more: Partial<BookImportDeps> = {}): BookImportDeps {
  const audibleFetch = replayFetch([recorded('audible', 'product-jekyll')]);
  const photoFetch = replayFetch([recorded('audnexus', 'author-doyle-image')], {
    readBytes: standInsBeside(adapters),
  });
  return {
    audible: new AudibleClient({ baseUrl: AUDIBLE_URL, fetch: audibleFetch }),
    audnexus: {
      author: async (asin) => ({ asin, name: 'an author', imageUrl: PHOTO }),
      authorsNamed: async () => [],
    },
    qbittorrent: {
      withHashes: async () => [row() as never],
      files: async () =>
        ['Jekyll/01.mp3', 'Jekyll/02.mp3', 'Jekyll/cover.jpg'].map((name) => ({ name, size: 1 })),
    },
    abs: new AbsClient({ baseUrl: ABS, token: 'k', fetch }),
    provisioner: new AbsProvisioner({ baseUrl: ABS, provisionKey: 'p', fetch }),
    db,
    mediaDir: media,
    downloadsPath: DOWNLOADS,
    fetch: photoFetch,
    now: () => clock,
    log,
    ...more,
  };
}

const importing = (handle: Record<string, unknown> | null = { hash: HASH, key: 'k', addedAt: 1 }) =>
  ({
    target: refOf.target,
    release,
    handle,
  }) as unknown as StoredRequest;

const refusal = async (attempt: Promise<unknown>) => {
  const error: unknown = await attempt.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(BookRefused);
  return (error as BookRefused).reason;
};

describe('[M3.books/d] Audiobookshelf picks up just the new folder', () => {
  const run = async (fetch: FetchLike, more: Partial<BookImportDeps> = {}) => {
    const steps: MediumSteps = {
      medium: 'book',
      search: async () => ({ kind: 'picked', release, others: [] }),
      download: {
        start: async (_request, _release, key) => ({ hash: HASH, key, addedAt: clock }),
        poll: async () => ({ kind: 'done' }),
        cancel: async () => undefined,
      },
      import: bookImport(deps(fetch, more)),
    };
    const job: RequestJobDeps = {
      db,
      steps: stepsRegistry([steps]),
      log,
      now: () => clock,
      notIndexedAfterMs: 60 * MINUTE,
      stepTimeoutMs: 10_000,
      stallAfterMs: 15 * MINUTE,
      holdAfterMs: 60 * MINUTE,
    };
    const one = createRequest(db, person, refOf, clock).request;
    return { job, one, reread: () => getRequest(db, one.id) as StoredRequest };
  };

  it('[M3.books/d] the job reaches inLibrary from the watcher alone: reads, no scan, and no hourly index', async () => {
    let seen = false;
    const { fetch, asked } = shelf({ seen: () => seen });
    const { job, reread } = await run(fetch);
    const turns = async (count: number) => {
      for (let at = 0; at < count; at += 1) {
        clock += MINUTE;
        await advanceRequests(job);
      }
    };

    await turns(6);
    expect(reread().state.status).toBe('importing');
    expect(reread().result).toBeNull();
    const placed = join(media, 'Books', FOLDER);
    expect(existsSync(join(placed, '01.mp3'))).toBe(true);
    expect(statSync(join(placed, '01.mp3')).ino).toBe(
      statSync(join(media, 'Downloads/Jekyll/01.mp3')).ino,
    );

    seen = true;
    await turns(1);
    const itemId = (jsonBody(absCall('index-book-new')) as { id: string }).id;
    const ref: MediaRef = { source: 'abs', id: itemId };
    expect(reread().result).toEqual(ref);
    expect(indexedRow(db, 'abs', itemId)).toBeDefined();

    await turns(1);
    expect(reread().state.status).toBe('inLibrary');

    expect(asked.filter((call) => /scan/i.test(call))).toEqual([]);
    const bookId = 'e8aa253f-82d0-44ff-b87a-74671278ce9d';
    const authorId = '9156bff8-444c-42ff-bbc8-c57a95f248f2';
    expect([...new Set(asked)].sort()).toEqual(
      [
        'GET /api/libraries',
        `GET /api/libraries/${bookId}/items`,
        `GET /api/items/${itemId}`,
        `GET /api/authors/${authorId}`,
        `POST /api/authors/${authorId}/image`,
      ].sort(),
    );
  });

  it('[M3.books/d] a library with no watcher fails the import before anything is made, and says why', async () => {
    const { fetch, asked } = shelf({
      library: (library) => {
        (library.settings as { disableWatcher: boolean }).disableWatcher = true;
      },
    });
    const { job, reread } = await run(fetch);
    for (let at = 0; at < 8; at += 1) {
      clock += MINUTE;
      await advanceRequests(job);
    }
    expect(reread().state).toMatchObject({ status: 'failed', reason: 'importFailed' });
    expect(readdirSync(join(media, 'Books'))).toEqual([]);
    expect(asked.filter((call) => /scan/i.test(call))).toEqual([]);
    const failure = errors.find(({ message }) => message === 'request step failed');
    expect((failure?.err as Error).message).toContain('watcherOff');
  });

  it('no source of the step names a scan or a copy', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(here).filter(
      (name) => /\.ts$/.test(name) && !name.includes('.test.'),
    );
    for (const name of sources) {
      expect(readFileSync(join(here, name), 'utf8')).not.toMatch(/\/scan\b|'scan'|copyFile|\bcp\(/);
    }
  });
});

describe('the import step', () => {
  it('waits for the watcher, then answers the item', async () => {
    let seen = false;
    const { fetch } = shelf({ seen: () => seen });
    const step = bookImport(deps(fetch));
    expect(await step(importing(), 'k')).toEqual({ kind: 'waiting' });
    seen = true;
    expect(await step(importing(), 'k')).toMatchObject({ kind: 'arrived', ref: { source: 'abs' } });
  });

  it('a repeat of its key answers the same and links nothing twice', async () => {
    const { fetch } = shelf();
    const step = bookImport(deps(fetch));
    const first = await step(importing(), 'k');
    const second = await step(importing(), 'k');
    expect(second).toEqual(first);
    expect(statSync(join(media, 'Downloads/Jekyll/01.mp3')).nlink).toBe(2);
  });

  it('the name on the shelf is Audible’s and never the client’s', async () => {
    const { fetch } = shelf();
    await bookImport(deps(fetch))(importing(), 'k');
    expect(readdirSync(join(media, 'Books'))).toEqual(['Robert Louis Stevenson']);
  });

  it('a book already there answers that item, untouched', async () => {
    mkdirSync(join(media, 'Books', FOLDER), { recursive: true });
    writeFileSync(join(media, 'Books', FOLDER, 'other.mp3'), 'another edition');
    const { fetch } = shelf();
    const answer = await bookImport(deps(fetch))(importing(), 'k');
    expect(answer.kind).toBe('arrived');
    expect(readdirSync(join(media, 'Books', FOLDER))).toEqual(['other.mp3']);
    expect(statSync(join(media, 'Downloads/Jekyll/01.mp3')).nlink).toBe(1);
  });

  describe('the row that names the folder', () => {
    const listing = (rows: { id: string; relPath: string }[]) => {
      const base = shelf();
      const queries: URLSearchParams[] = [];
      const fetch: FetchLike = async (input, init) => {
        const url = new URL(input);
        if (!url.pathname.endsWith('/items')) return base.fetch(input, init);
        queries.push(url.searchParams);
        const limit = Number(url.searchParams.get('limit'));
        const page = Number(url.searchParams.get('page') ?? 0);
        const results = rows
          .slice(page * limit, (page + 1) * limit)
          .map((one, at) => ({ ...one, addedAt: at }));
        return new Response(JSON.stringify({ results, total: rows.length, limit, page }), {
          headers: { 'content-type': 'application/json' },
        });
      };
      return { fetch, queries };
    };

    it('a newest row for another folder is not this book, and it waits', async () => {
      const { fetch, queries } = listing([{ id: 'not-it', relPath: 'Someone/Another Book' }]);
      expect(await bookImport(deps(fetch))(importing(), 'k')).toEqual({ kind: 'waiting' });
      expect(queries[0]?.get('sort')).toBe('addedAt');
      expect(queries[0]?.get('desc')).toBe('1');
    });

    it('the row answered is the one naming the folder, wherever it sits among the newest', async () => {
      const itemId = (jsonBody(absCall('index-book-new')) as { id: string }).id;
      const { fetch } = listing([
        { id: 'not-it', relPath: 'Someone/Another Book' },
        { id: itemId, relPath: FOLDER },
      ]);
      expect(await bookImport(deps(fetch))(importing(), 'k')).toEqual({
        kind: 'arrived',
        ref: { source: 'abs', id: itemId },
      });
    });

    const alreadyThere = (ageMs: number) => {
      const folder = join(media, 'Books', FOLDER);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'other.mp3'), 'another edition');
      const when = new Date(clock - ageMs);
      utimesSync(folder, when, when);
    };

    it('a folder already there that the library has not listed an hour on ends with that reason', async () => {
      alreadyThere(61 * MINUTE);
      const { fetch } = listing([{ id: 'not-it', relPath: 'Someone/Another Book' }]);
      expect(await refusal(bookImport(deps(fetch))(importing(), 'k'))).toBe('notInLibrary');
    });

    it('a folder already there and only just made is given time', async () => {
      alreadyThere(MINUTE);
      const { fetch } = listing([{ id: 'not-it', relPath: 'Someone/Another Book' }]);
      expect(await bookImport(deps(fetch))(importing(), 'k')).toEqual({ kind: 'waiting' });
    });
  });

  describe('an import past its time limit', () => {
    const gate = () => {
      let open: () => void = () => undefined;
      const opened = new Promise<void>((resolve) => {
        open = resolve;
      });
      return { open, opened };
    };
    const held = async () => {
      const { link: realLink } = await import('node:fs/promises');
      const started = gate();
      const mayGoOn = gate();
      const links: string[] = [];
      const link = async (from: string, to: string) => {
        links.push(to);
        started.open();
        await mayGoOn.opened;
        await realLink(from, to);
      };
      return { started, mayGoOn, links, link };
    };

    it('a repeat under the key waits for the running one, and links nothing of its own', async () => {
      const { started, mayGoOn, links, link } = await held();
      const step = bookImport(deps(shelf().fetch, { link }));
      const first = step(importing(), 'k');
      await started.opened;
      const before = links.length;
      const repeat = step(importing(), 'k');
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(links).toHaveLength(before);
      mayGoOn.open();
      expect((await first).kind).toBe('arrived');
      expect((await repeat).kind).toBe('arrived');
      expect(links).toHaveLength(3);
      expect(readdirSync(join(media, 'Books', FOLDER)).sort()).toEqual([
        '01.mp3',
        '02.mp3',
        'cover.jpg',
        'metadata.json',
      ]);
    });

    it('a repeat waiting past its own limit gives up by name, and the running one is not disturbed', async () => {
      const { started, mayGoOn, link } = await held();
      const step = bookImport(deps(shelf().fetch, { link }));
      const first = step(importing(), 'k');
      await started.opened;
      const limit = new AbortController();
      const repeat = step(importing(), 'k', limit.signal);
      limit.abort();
      expect(await refusal(repeat)).toBe('timedOut');
      mayGoOn.open();
      expect((await first).kind).toBe('arrived');
    });

    it('the job aborts it at the limit: the request fails and nothing lands in Books afterwards', async () => {
      const { mayGoOn, link } = await held();
      const steps: MediumSteps = {
        medium: 'book',
        search: async () => ({ kind: 'picked', release, others: [] }),
        download: {
          start: async (_request, _release, key) => ({ hash: HASH, key, addedAt: clock }),
          poll: async () => ({ kind: 'done' }),
          cancel: async () => undefined,
        },
        import: bookImport(deps(shelf().fetch, { link })),
      };
      const job: RequestJobDeps = {
        db,
        steps: stepsRegistry([steps]),
        log,
        now: () => clock,
        notIndexedAfterMs: 60 * MINUTE,
        stepTimeoutMs: 100,
        stallAfterMs: 15 * MINUTE,
        holdAfterMs: 60 * MINUTE,
      };
      const one = createRequest(db, person, refOf, clock).request;
      const reread = () => getRequest(db, one.id) as StoredRequest;
      for (let at = 0; at < 6 && reread().state.status !== 'failed'; at += 1) {
        clock += MINUTE;
        await advanceRequests(job);
      }
      expect(reread().state).toMatchObject({ status: 'failed', reason: 'importFailed' });
      mayGoOn.open();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(readdirSync(join(media, 'Books'))).toEqual([]);
      expect(existsSync(join(media, 'Downloads/.auralis-import'))).toBe(false);
    });
  });

  it('a book placed long ago, past the newest rows, still answers its item rather than waiting until it fails', async () => {
    mkdirSync(join(media, 'Books', FOLDER), { recursive: true });
    writeFileSync(join(media, 'Books', FOLDER, 'other.mp3'), 'another edition');
    const itemId = (jsonBody(absCall('index-book-new')) as { id: string }).id;
    const newestFirst = Array.from({ length: 200 }, (_, at) => ({
      id: at === 199 ? itemId : `newer-${at}`,
      relPath: at === 199 ? FOLDER : `Someone/Book ${at}`,
      addedAt: 1_000 - at,
    }));
    const base = shelf();
    const fetch: FetchLike = async (input, init) => {
      const url = new URL(input);
      if (!url.pathname.endsWith('/items')) return base.fetch(input, init);
      const limit = Number(url.searchParams.get('limit') ?? newestFirst.length);
      const page = Number(url.searchParams.get('page') ?? 0);
      const results = newestFirst.slice(page * limit, (page + 1) * limit);
      return new Response(JSON.stringify({ results, total: newestFirst.length, limit, page }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const answer = await bookImport(deps(fetch))(importing(), 'k');
    expect(answer).toEqual({ kind: 'arrived', ref: { source: 'abs', id: itemId } });
  });

  it('the author photo goes to Audiobookshelf only when it holds none', async () => {
    const posted: string[] = [];
    const base = shelf();
    const fetch =
      (author: Record<string, unknown>): FetchLike =>
      async (input, init) => {
        const { pathname } = new URL(input);
        if (init?.method === 'POST') {
          posted.push(String(init.body));
          return new Response(JSON.stringify({ author: {} }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        if (pathname.startsWith('/api/authors/')) {
          return new Response(JSON.stringify({ ...jsonBody(absCall('author-new')), ...author }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return base.fetch(input, init);
      };
    await bookImport(deps(fetch({ imagePath: '/metadata/authors/a.jpg' })))(importing(), 'k');
    expect(posted).toEqual([]);
    await bookImport(deps(fetch({ imagePath: null })))(importing(), 'k');
    expect(posted.map((body) => JSON.parse(body))).toEqual([{ url: PHOTO }]);
    expect(existsSync(join(media, 'Books/Robert Louis Stevenson/author.jpg'))).toBe(true);
  });

  it('the provisioning key being refused the photo update, as recorded, is logged and no failure', async () => {
    const { fetch } = shelf();
    const answer = await bookImport(deps(fetch))(importing(), 'k');
    expect(answer.kind).toBe('arrived');
    expect(errors.map(({ message }) => message)).toContain(
      'Audiobookshelf was not given the author photo',
    );
    expect(existsSync(join(media, 'Books/Robert Louis Stevenson/author.jpg'))).toBe(true);
  });

  it('a torrent saved outside Downloads, gone or unfinished is refused by name', async () => {
    const { fetch } = shelf();
    const withRow = (rows: unknown[]) =>
      bookImport(
        deps(fetch, {
          qbittorrent: {
            withHashes: async () => rows as never,
            files: async () => [{ name: 'Jekyll/01.mp3', size: 1 }],
          },
        }),
      );
    expect(await refusal(withRow([row({ save_path: '/data/Other' })])(importing(), 'k'))).toBe(
      'outsideDownloads',
    );
    expect(
      await refusal(withRow([row({ save_path: '/data/Downloads/../../etc' })])(importing(), 'k')),
    ).toBe('outsideDownloads');
    expect(await refusal(withRow([])(importing(), 'k'))).toBe('torrentGone');
    expect(await refusal(withRow([row({ progress: 0.9 })])(importing(), 'k'))).toBe('notComplete');
    expect(await refusal(withRow([row()])(importing(null), 'k'))).toBe('torrentGone');
  });

  it('a torrent being rechecked after its book was placed still answers the item', async () => {
    const { fetch } = shelf();
    await bookImport(deps(fetch))(importing(), 'k');
    const later = bookImport(
      deps(fetch, {
        qbittorrent: {
          withHashes: async () => [row({ progress: 0.4 }) as never],
          files: async () => ['Jekyll/01.mp3', 'Jekyll/02.mp3'].map((name) => ({ name, size: 1 })),
        },
      }),
    );
    expect((await later(importing(), 'k')).kind).toBe('arrived');
    expect(statSync(join(media, 'Downloads/Jekyll/01.mp3')).nlink).toBe(2);
  });

  it('a torrent gone after its book was placed still answers the item', async () => {
    const { fetch } = shelf();
    await bookImport(deps(fetch))(importing(), 'k');
    const later = bookImport(
      deps(fetch, {
        qbittorrent: { withHashes: async () => [], files: async () => [] },
      }),
    );
    expect((await later(importing(), 'k')).kind).toBe('arrived');
  });

  it('an Audiobookshelf that cannot be reached holds the request; a refusal does not', async () => {
    const away: FetchLike = async () => {
      throw new TypeError('refused');
    };
    await expect(bookImport(deps(away))(importing(), 'k')).rejects.toBeInstanceOf(StepUnavailable);
    const denied: FetchLike = async () => new Response('no', { status: 401 });
    await expect(bookImport(deps(denied))(importing(), 'k')).rejects.not.toBeInstanceOf(
      StepUnavailable,
    );
  });

  it('an unknown ASIN falls to the request’s own title, made safe', async () => {
    const { fetch } = shelf();
    const audible = { product: async () => null };
    const request = {
      ...importing(),
      target: { title: '../../A Title', creator: 'Ann Author', ids: { asin: ASIN } },
    } as StoredRequest;
    await bookImport(deps(fetch, { audible }))(request, 'k');
    expect(readdirSync(join(media, 'Books', 'Ann Author'))).toEqual(['A Title (Neufeld) 64k']);
  });

  it('a request with no author at all is refused by name', async () => {
    const { fetch } = shelf();
    const audible = { product: async () => null };
    const request = {
      ...importing(),
      target: { title: 'A Title', creator: null, ids: {} },
    } as StoredRequest;
    expect(await refusal(bookImport(deps(fetch, { audible }))(request, 'k'))).toBe('noAuthor');
  });

  it('the narrator and bitrate come from the release, then Audible', async () => {
    const { fetch } = shelf();
    const titled = {
      ...importing(),
      release: { ...release, title: 'Jekyll, read by Ann Other, 128 kbps', details: {} },
    } as StoredRequest;
    await bookImport(deps(fetch))(titled, 'k');
    expect(readdirSync(join(media, 'Books/Robert Louis Stevenson'))).toContain(
      '2021 - The Strange Case of Dr Jekyll and Mr Hyde (Other) 128k',
    );
    rmSync(join(media, 'Books/Robert Louis Stevenson'), { recursive: true });
    const bare = { ...importing(), release: null } as StoredRequest;
    await bookImport(deps(fetch))(bare, 'k');
    expect(readdirSync(join(media, 'Books/Robert Louis Stevenson'))).toContain(
      '2021 - The Strange Case of Dr Jekyll and Mr Hyde (Essiedu)',
    );
  });
});
