/**
 * A book's download through the real job, store and qBittorrent client, on recordings of controlled
 * torrents. Only `search` and `import` stand in, as those are other parts' steps.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestRef } from '@auralis/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { ProwlarrClient } from '../../adapters/prowlarr/client.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, getRequest, type StoredRequest } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests, type RequestJobDeps } from '../job.js';
import { type MediumSteps, type Release, StepUnavailable, stepsRegistry } from '../steps.js';
import { BOOKS_CATEGORY, bookDownload, pollOutcome } from './download.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(join(here, '../../adapters/qbittorrent/recordings', `${call}.json`), 'utf8'),
    ),
  );

const hashOf = (call: string) => recorded(call).request.query.hashes as string;
const DEBIAN = hashOf('info-done');
const MADE_UP = hashOf('info-stalled');
const MINUTE = 60_000;
const STALL = 15 * MINUTE;

const release = (hash: string): Release => ({
  id: 'release-1',
  title: 'A Book',
  source: 'an indexer',
  size: null,
  details: { magnet: `magnet:?xt=urn:btih:${hash}` },
});

/** A recording whose first row carries another category, as a household's own torrent would. */
function underAnotherCategory(call: string): Recording {
  const one = recorded(call);
  const { body } = one.response;
  if (body === null || !('json' in body)) throw new Error('expected rows');
  const rows = body.json as Record<string, unknown>[];
  const json = rows.map((row) => ({ ...row, category: 'a-household-category', tags: '' }));
  return { ...one, response: { ...one.response, body: { json } } };
}

interface Asked {
  method: string;
  path: string;
  query: string;
  body: string;
}

/**
 * Serves the recordings, with each read of a torrent's state taking the next from `looks`, for
 * whatever hash was asked, and staying on the last, and notes every call.
 */
function upstream(fixed: Recording[], looks: Recording[] = []) {
  const asked: Asked[] = [];
  const plain = replayFetch(fixed);
  let look = 0;
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    asked.push({
      method: init?.method ?? 'GET',
      path: url.pathname.replace('/api/v2/', ''),
      query: url.search,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    if (url.pathname.endsWith('torrents/info') && looks.length > 0) {
      const one = looks[Math.min(look, looks.length - 1)] as Recording;
      look += 1;
      const query = Object.fromEntries(url.searchParams);
      return replayFetch([{ ...one, request: { ...one.request, query } }])(input, init);
    }
    return plain(input, init);
  };
  const qbittorrent = new QbittorrentClient({
    baseUrl: 'http://upstream.invalid',
    apiKey: '<token>',
    fetch,
  });
  return { asked, qbittorrent };
}

const noProwlarr: Pick<ProwlarrClient, 'resolve'> = {
  resolve: async (details) => {
    const hash = (details.magnet as string).slice(-40);
    return { kind: 'magnet', magnet: details.magnet as string, hash };
  },
};

const ref: RequestRef = {
  medium: 'book',
  target: { title: 'A Book', creator: 'An Author', ids: { asin: 'B0036S4B76' } },
};

let db: Db;
let clock: number;
let person: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 10, 5, 8);
  person = upsertUser(db, { username: 'ana', role: 'member' }).id;
});

const steps = (client: QbittorrentClient, hash: string): MediumSteps => ({
  medium: 'book',
  search: async () => ({ kind: 'picked', release: release(hash), others: [] }),
  download: bookDownload({ qbittorrent: client, prowlarr: noProwlarr, now: () => clock }),
  import: async () => ({ kind: 'waiting' }),
});

const job = (one: MediumSteps): RequestJobDeps => ({
  db,
  steps: stepsRegistry([one]),
  log: { error: () => undefined },
  now: () => clock,
  notIndexedAfterMs: 24 * 60 * MINUTE,
  stepTimeoutMs: MINUTE,
  stallAfterMs: STALL,
  holdAfterMs: 60 * MINUTE,
});

const turn = async (deps: RequestJobDeps, by = 1_000) => {
  clock += by;
  await advanceRequests(deps);
};
const reread = (one: StoredRequest) => getRequest(db, one.id) as StoredRequest;

const download = (client: QbittorrentClient) =>
  bookDownload({ qbittorrent: client, prowlarr: noProwlarr, now: () => clock });
const request = {} as StoredRequest;

describe('[M3.books/b] a book through the job, on qBittorrent recordings', () => {
  it('[M3.books/b] adds the torrent and follows it through its metadata to the import', async () => {
    const { asked, qbittorrent } = upstream(
      [recorded('create-category'), recorded('add-magnet')],
      [
        recorded('info-absent'),
        recorded('debian-queued'),
        recorded('info-metadata'),
        recorded('info-downloading'),
        recorded('info-done'),
      ],
    );
    const deps = job(steps(qbittorrent, DEBIAN));
    const one = createRequest(db, person, ref, clock).request;

    await turn(deps);
    await turn(deps);
    expect(reread(one).state.status).toBe('queued');

    await turn(deps);
    expect(reread(one).handle).toEqual({ hash: DEBIAN, owned: true, addedAt: clock });
    const adding = asked.find((call) => call.path === 'torrents/add');
    const sent = new URLSearchParams(adding?.body);
    expect(sent.get('urls')).toContain(DEBIAN);
    expect(sent.get('category')).toBe(BOOKS_CATEGORY);
    expect(sent.get('tags')).toMatch(/^auralis-[\w-]+$/);

    await turn(deps);
    expect(reread(one).state.status).toBe('queued');

    await turn(deps);
    expect(reread(one).state).toMatchObject({ status: 'downloading', progress: 0 });

    await turn(deps);
    const { state } = reread(one);
    expect(state.status).toBe('downloading');
    expect(state.status === 'downloading' && state.progress).toBeGreaterThan(0);

    await turn(deps);
    expect(reread(one).state.status).toBe('importing');
  });

  it('[M3.books/b] a torrent no swarm answers for fails with its reason at the stall limit', async () => {
    const { qbittorrent } = upstream(
      [recorded('create-category'), recorded('add-magnet')],
      [recorded('info-absent'), recorded('info-metadata'), recorded('info-stalled')],
    );
    const deps = job(steps(qbittorrent, MADE_UP));
    const one = createRequest(db, person, ref, clock).request;
    for (let at = 0; at < 3; at += 1) await turn(deps);
    await turn(deps);
    expect(reread(one).state).toMatchObject({ status: 'downloading', progress: 0 });

    await turn(deps, STALL - MINUTE);
    expect(reread(one).state.status).toBe('downloading');
    await turn(deps, MINUTE);
    expect(reread(one).state).toMatchObject({ status: 'failed', reason: 'downloadStalled' });
  });
});

describe('[M3.books] starting a book', () => {
  it('[M3.books] a repeat of a key finds what the first made and adds nothing', async () => {
    const { asked, qbittorrent } = upstream([recorded('debian-queued')]);
    const handle = await download(qbittorrent).start(request, release(DEBIAN), 'a-key');
    expect(handle).toMatchObject({ hash: DEBIAN, owned: true });
    expect(asked.map((call) => call.path)).toEqual(['torrents/info']);
  });

  it('[M3.books] a torrent of the household is followed, and its cancel sends no delete', async () => {
    const { asked, qbittorrent } = upstream([underAnotherCategory('debian-queued')]);
    const steps = download(qbittorrent);
    const handle = await steps.start(request, release(DEBIAN), 'a-key');
    expect(handle).toMatchObject({ hash: DEBIAN, owned: false });
    await steps.cancel({ handle });
    expect(asked.map((call) => call.path)).toEqual(['torrents/info']);
  });

  it('[M3.books] adding chooses no files', async () => {
    const { asked, qbittorrent } = upstream([
      recorded('info-absent'),
      recorded('create-category'),
      recorded('add-magnet'),
    ]);
    await download(qbittorrent).start(request, release(DEBIAN), 'a-key');
    expect(asked.map((call) => call.path)).toEqual([
      'torrents/info',
      'torrents/createCategory',
      'torrents/add',
    ]);
    expect(asked.at(-1)?.body).not.toMatch(/prio|skip/i);
  });

  it('[M3.books] a category or a torrent that is already there is no failure', async () => {
    const { qbittorrent } = upstream([
      recorded('info-absent'),
      recorded('create-category-again'),
      recorded('add-existing'),
    ]);
    const handle = await download(qbittorrent).start(request, release(DEBIAN), 'a-key');
    expect(handle).toMatchObject({ hash: DEBIAN, owned: true });
  });
});

describe('[M3.books] following a book', () => {
  it('[M3.books] a torrent gone just after its add is waited for, and past two minutes is failed', async () => {
    const { qbittorrent } = upstream([recorded('info-absent')]);
    const handle = { hash: DEBIAN, owned: true, addedAt: clock };
    const steps = download(qbittorrent);
    clock += 2 * MINUTE - 1;
    expect(await steps.poll(handle)).toEqual({ kind: 'queued' });
    clock += 1;
    expect(await steps.poll(handle)).toEqual({ kind: 'failed', reason: 'cancelledUpstream' });
  });

  it.each([
    ['metaDL', 0, { kind: 'downloading', progress: 0 }],
    ['forcedMetaDL', 0, { kind: 'downloading', progress: 0 }],
    ['downloading', 0.5, { kind: 'downloading', progress: 0.5 }],
    ['forcedDL', 0.5, { kind: 'downloading', progress: 0.5 }],
    ['stalledDL', 0.9, { kind: 'downloading', progress: 0.9 }],
    ['stoppedDL', 0.9, { kind: 'downloading', progress: 0.9 }],
    ['queuedDL', 0, { kind: 'queued' }],
    ['checkingDL', 0.3, { kind: 'queued' }],
    ['checkingResumeData', 0.3, { kind: 'queued' }],
    ['moving', 1, { kind: 'queued' }],
    ['allocating', 0, { kind: 'queued' }],
    ['stalledUP', 1, { kind: 'done' }],
    ['uploading', 1, { kind: 'done' }],
    ['stoppedUP', 1, { kind: 'done' }],
    ['queuedUP', 1, { kind: 'done' }],
    ['forcedUP', 1, { kind: 'done' }],
    ['checkingUP', 1, { kind: 'done' }],
    ['error', 0.5, { kind: 'failed', reason: 'downloadFailed' }],
    ['missingFiles', 1, { kind: 'failed', reason: 'downloadFailed' }],
    ['a state nobody knows', 1, { kind: 'failed', reason: 'downloadFailed' }],
  ] as const)('[M3.books] %s at %d reads as its outcome', (state, progress, outcome) => {
    expect(pollOutcome({ state, progress })).toEqual(outcome);
  });

  it('[M3.books] an upstream that cannot be reached holds the request, a refusal does not', async () => {
    const away = new QbittorrentClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: '<token>',
      fetch: () => Promise.reject(new Error('refused')),
    });
    const handle = { hash: DEBIAN, owned: true, addedAt: clock };
    await expect(download(away).poll(handle)).rejects.toBeInstanceOf(StepUnavailable);
    const broken = new QbittorrentClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: '<token>',
      fetch: () => Promise.resolve(new Response('', { status: 502 })),
    });
    await expect(download(broken).poll(handle)).rejects.toBeInstanceOf(StepUnavailable);
    const refused = new QbittorrentClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: 'not-the-key',
      fetch: replayFetch([{ ...recorded('unauthorized'), request: recorded('info-done').request }]),
    });
    const thrown = await download(refused)
      .poll(handle)
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(StepUnavailable);
  });
});

describe('[M3.books] cancelling a book', () => {
  it('[M3.books] by handle deletes our torrent with its files, and again does no harm', async () => {
    const { asked, qbittorrent } = upstream([recorded('delete'), recorded('delete-missing')]);
    const steps = download(qbittorrent);
    const handle = { hash: DEBIAN, owned: true, addedAt: clock };
    await steps.cancel({ handle });
    await steps.cancel({ handle });
    expect(asked).toHaveLength(2);
    const sent = new URLSearchParams(asked[0]?.body);
    expect(sent.get('hashes')).toBe(DEBIAN);
    expect(sent.get('deleteFiles')).toBe('true');
  });

  it('[M3.books] by key finds what that key tagged in our category, and deletes those', async () => {
    const { asked, qbittorrent } = upstream([recorded('info-by-tag'), recorded('delete')]);
    await download(qbittorrent).cancel({ key: 'record', release: release(DEBIAN) });
    expect(new URLSearchParams(asked[0]?.query).get('tag')).toBe('auralis-record');
    expect(new URLSearchParams(asked[0]?.query).get('category')).toBe(BOOKS_CATEGORY);
    expect(new URLSearchParams(asked[1]?.body).get('hashes')?.split('|').sort()).toEqual(
      [DEBIAN, MADE_UP].sort(),
    );
  });

  it('[M3.books] by a key no start reached sends no delete, whatever the release hash', async () => {
    const { asked, qbittorrent } = upstream([recorded('info-by-unused-tag')]);
    await download(qbittorrent).cancel({ key: 'no-such-key', release: release(DEBIAN) });
    expect(asked.map((call) => call.path)).toEqual(['torrents/info']);
  });
});
