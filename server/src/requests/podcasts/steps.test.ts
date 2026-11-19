/**
 * A podcast request through the real job, store and index, on recorded answers: iTunes' search,
 * the feed as Auralis read it, and a throwaway Audiobookshelf 2.37.2's subscribe calls.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestRef } from '@auralis/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from '../../adapters/audiobookshelf/client.js';
import { AbsProvisioner } from '../../adapters/audiobookshelf/provision.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type FeedFetch, feedFetch } from '../../adapters/http/publicFetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { ItunesClient } from '../../adapters/itunes/client.js';
import { indexOneAbsItem } from '../../libraryIndex/job.js';
import { emptyCounts, indexedRow, listIndexed, recordRun } from '../../libraryIndex/store.js';
import { claimsOf, unfollowShow } from '../../store/claims.js';
import { type Db, openDatabase } from '../../store/connection.js';
import { createRequest, getRequest, peopleOn } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests, type RequestJobDeps, retryRequest } from '../job.js';
import { stepsRegistry } from '../steps.js';
import { heldShow } from './held.js';
import { podcastImport, podcastSearch } from './steps.js';

const ADAPTERS = fileURLToPath(new URL('../../adapters/', import.meta.url));
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const abs = (call: string) => recorded('audiobookshelf', call);
const BASE = 'http://upstream.invalid';
const ITEM = (abs('podcasts-item').response.body as { json: { id: string } }).json.id;

/** The show the recordings subscribed to, as iTunes' recorded search found it. */
async function searchedRef(): Promise<RequestRef> {
  const itunes = new ItunesClient({
    baseUrl: 'https://itunes.apple.com',
    fetch: replayFetch([recorded('itunes', 'search-history')]),
    clock: { now: () => 0, sleep: async () => undefined },
  });
  const show = (await itunes.searchShows('history')).find(
    ({ title }) => title === 'Not What You Thought You Knew',
  )!;
  return {
    medium: 'podcast',
    target: {
      title: show.title,
      creator: show.host,
      ids: { feedUrl: show.feedUrl, itunesId: String(show.itunesId) },
    },
  };
}

/** The recorded feed, read as the guard would hand it over. */
const recordedFeed: FeedFetch = async (url, init) => ({
  response: await replayFetch([recorded('feed', 'subscribe-feed')])(url, init),
  url,
});

/** The recorded libraries answer with its Podcasts library taken out, as a household without one. */
function withoutPodcastLibrary(): Recording {
  const recording = abs('podcasts-libraries');
  const body = recording.response.body as { json: { libraries: { mediaType: string }[] } };
  const libraries = body.json.libraries.filter(({ mediaType }) => mediaType !== 'podcast');
  return { ...recording, response: { ...recording.response, body: { json: { libraries } } } };
}

/**
 * Audiobookshelf as recorded, each create answered in turn and the last again after; every call is kept. `stops` names
 * how many reads of the made item fail first, as when the server stops before the answer is saved.
 */
function absServer(creates: string[], { stops = 0, libraries = abs('podcasts-libraries') } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const reads = replayFetch([libraries, abs('podcasts-feed'), abs('podcasts-item')]);
  let stopsLeft = stops;
  const fetch: FetchLike = async (url, init) => {
    const { pathname } = new URL(url);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method: init?.method ?? 'GET', path: pathname, body });
    if (pathname === `/api/items/${ITEM}` && stopsLeft > 0) {
      stopsLeft -= 1;
      throw new Error('the server stopped');
    }
    if (pathname === '/api/podcasts') {
      const next = creates.length > 1 ? creates.shift() : creates[0];
      if (next === undefined) throw new Error('no create left');
      return replayFetch([abs(next)])(url, init);
    }
    return reads(url, init);
  };
  return { fetch, calls };
}

let db: Db;
let clock: number;
let ana: string;
let ben: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
  ben = upsertUser(db, { username: 'ben', role: 'member' }).id;
  clock = Date.UTC(2026, 10, 18, 8);
});

function job(fetch: FetchLike, feed: FeedFetch = recordedFeed): RequestJobDeps {
  const provisioner = new AbsProvisioner({ baseUrl: BASE, provisionKey: '<token>', fetch });
  return {
    db,
    steps: stepsRegistry([
      {
        medium: 'podcast',
        prompt: true,
        search: podcastSearch({ feed, provisioner }),
        import: podcastImport({
          db,
          abs: new AbsClient({ baseUrl: BASE, token: '<token>', fetch }),
          provisioner,
          now: () => clock,
        }),
      },
    ]),
    log: { error: () => undefined },
    now: () => clock,
    notIndexedAfterMs: 3_600_000,
    stepTimeoutMs: 60_000,
    stallAfterMs: 900_000,
    holdAfterMs: 3_600_000,
  };
}

async function settle(deps: RequestJobDeps, id: string) {
  for (let turn = 0; turn < 10; turn += 1) {
    const { status } = getRequest(db, id)!.state;
    if (status === 'inLibrary' || status === 'failed') return getRequest(db, id)!;
    clock += 1_000;
    await advanceRequests(deps);
  }
  throw new Error(`never settled: ${JSON.stringify(getRequest(db, id)!.state)}`);
}

/** A whole index pass over Audiobookshelf, finding the recorded show where it was made. */
async function indexPass() {
  const reads = new AbsClient({
    baseUrl: BASE,
    token: '<token>',
    fetch: replayFetch([abs('podcasts-item')]),
  });
  await indexOneAbsItem(db, reads, ITEM, clock);
  const counts = emptyCounts();
  recordRun(db, {
    source: 'abs',
    startedAt: clock,
    finishedAt: clock,
    complete: true,
    error: null,
    counts,
  });
}

const createdPaths = (calls: { path: string; body: unknown }[]) =>
  calls
    .filter(({ path }) => path === '/api/podcasts')
    .map(({ body }) => (body as { path: string }).path);

/** Turns of the job, a second apart. */
async function turns(deps: RequestJobDeps, count: number) {
  for (let turn = 0; turn < count; turn += 1) {
    clock += 1_000;
    await advanceRequests(deps);
  }
}

const recordedBody = (call: string) => (abs(call).request.body as { json: unknown }).json;

describe('[M3.podcasts/a] subscribing to a show the household lacks', () => {
  it('[M3.podcasts/a] walks a searched show to the library through the recorded calls, indexes it and subscribes everyone who asked', async () => {
    const ref = await searchedRef();
    const server = absServer(['podcasts-create']);
    const deps = job(server.fetch);
    const { request } = createRequest(db, ana, ref, clock);
    createRequest(db, ben, ref, clock);
    expect(peopleOn(db, request.id).sort()).toEqual([ana, ben].sort());

    const done = await settle(deps, request.id);

    expect(done.state.status).toBe('inLibrary');
    expect(done.result).toEqual({ source: 'abs', id: ITEM });
    expect(indexedRow(db, 'abs', ITEM)?.kind).toBe('show');
    for (const person of [ana, ben]) {
      expect(claimsOf(db, person)).toEqual([
        { ref: { source: 'abs', id: ITEM }, reason: 'subscribed' },
      ]);
    }
    const create = server.calls.find(({ path }) => path === '/api/podcasts')!;
    expect(create.body).toEqual(recordedBody('podcasts-create'));
    expect(create.body).toMatchObject({
      path: '/data/Podcasts/Not What You Thought You Knew',
      media: { autoDownloadEpisodes: false, metadata: { itunesId: '1472870897' } },
    });
  });

  it('[M3.podcasts/a] leaves the show to anyone still following it when one person unsubscribes, asking Audiobookshelf nothing', async () => {
    const ref = await searchedRef();
    const server = absServer(['podcasts-create']);
    const { request } = createRequest(db, ana, ref, clock);
    createRequest(db, ben, ref, clock);
    await settle(job(server.fetch), request.id);
    const asked = server.calls.length;

    unfollowShow(db, ana, { source: 'abs', id: ITEM }, clock);

    expect(claimsOf(db, ana)).toEqual([]);
    expect(claimsOf(db, ben)).toEqual([{ ref: { source: 'abs', id: ITEM }, reason: 'subscribed' }]);
    expect(indexedRow(db, 'abs', ITEM)).toBeDefined();
    expect(server.calls).toHaveLength(asked);
  });

  it('[M3.podcasts/a] finds a show the household holds by its feed or iTunes id once indexed', async () => {
    const ref = await searchedRef();
    const { request } = createRequest(db, ana, ref, clock);
    await settle(job(absServer(['podcasts-create']).fetch), request.id);
    const held = { source: 'abs', id: ITEM };

    expect(heldShow(db, { itunesId: '1472870897' })).toEqual(held);
    const feed = new URL(ref.target.ids.feedUrl!);
    expect(heldShow(db, { feedUrl: `http://${feed.host.toUpperCase()}${feed.pathname}/` })).toEqual(
      held,
    );
    expect(heldShow(db, { feedUrl: 'https://feeds.example.com/another' })).toBeNull();
  });

  it('[M3.podcasts/a] takes the next folder when Audiobookshelf says the show already exists and an index pass since shows it is another show', async () => {
    const server = absServer([
      'podcasts-create-exists',
      'podcasts-create-exists',
      'podcasts-create',
    ]);
    const deps = job(server.fetch);
    const { request } = createRequest(db, ana, await searchedRef(), clock);

    await turns(deps, 3);
    expect(getRequest(db, request.id)!.state.status).toBe('importing');
    expect(createdPaths(server.calls)).toEqual(['/data/Podcasts/Not What You Thought You Knew']);
    clock += 60_000;
    recordRun(db, {
      source: 'abs',
      startedAt: clock,
      finishedAt: clock,
      complete: true,
      error: null,
      counts: emptyCounts(),
    });

    expect((await settle(deps, request.id)).state.status).toBe('inLibrary');
    expect(createdPaths(server.calls)).toEqual([
      '/data/Podcasts/Not What You Thought You Knew',
      '/data/Podcasts/Not What You Thought You Knew',
      '/data/Podcasts/Not What You Thought You Knew (2)',
    ]);
  });

  it('[M3.podcasts/a] makes no second show when a retry follows a create whose answer was lost, and ends in the library with the one show', async () => {
    const server = absServer(['podcasts-create', 'podcasts-create-exists'], { stops: 1 });
    const deps = job(server.fetch);
    const { request } = createRequest(db, ana, await searchedRef(), clock);
    expect((await settle(deps, request.id)).state).toMatchObject({
      status: 'failed',
      reason: 'importFailed',
    });

    await retryRequest(deps, request.id);
    await turns(deps, 1);
    expect(getRequest(db, request.id)!.state.status).toBe('importing');
    clock += 60_000;
    await indexPass();
    const done = await settle(deps, request.id);

    expect(done.state.status).toBe('inLibrary');
    expect(done.result).toEqual({ source: 'abs', id: ITEM });
    expect(createdPaths(server.calls)).toEqual([
      '/data/Podcasts/Not What You Thought You Knew',
      '/data/Podcasts/Not What You Thought You Knew',
    ]);
    expect(listIndexed(db, { source: 'abs' }).filter(({ kind }) => kind === 'show')).toHaveLength(
      1,
    );
    expect(claimsOf(db, ana)).toEqual([{ ref: { source: 'abs', id: ITEM }, reason: 'subscribed' }]);
  });

  it('[M3.podcasts/a] answers a retry from the index when the lost create was already indexed, asking Audiobookshelf to make nothing', async () => {
    const server = absServer(['podcasts-create'], { stops: 1 });
    const deps = job(server.fetch);
    const { request } = createRequest(db, ana, await searchedRef(), clock);
    await settle(deps, request.id);
    await indexPass();
    const asked = createdPaths(server.calls).length;

    await retryRequest(deps, request.id);
    const done = await settle(deps, request.id);

    expect(done.state.status).toBe('inLibrary');
    expect(done.result).toEqual({ source: 'abs', id: ITEM });
    expect(createdPaths(server.calls)).toHaveLength(asked);
  });

  it('[M3.podcasts/a] fails as noPodcastLibrary when Audiobookshelf has no Podcasts library, making nothing', async () => {
    const server = absServer([], { libraries: withoutPodcastLibrary() });
    const { request } = createRequest(db, ana, await searchedRef(), clock);

    const done = await settle(job(server.fetch), request.id);

    expect(done.state).toMatchObject({ status: 'failed', reason: 'noPodcastLibrary' });
    expect(createdPaths(server.calls)).toEqual([]);
  });

  it('[M3.podcasts/a] fails a feed address that resolves privately as privateAddress, before Audiobookshelf hears it', async () => {
    const server = absServer([]);
    const guarded = feedFetch({ lookup: async () => ['10.0.0.5'] });
    const { request } = createRequest(db, ana, await searchedRef(), clock);

    const done = await settle(job(server.fetch, guarded), request.id);

    expect(done.state).toMatchObject({ status: 'failed', reason: 'privateAddress' });
    expect(server.calls).toEqual([]);
  });

  it('[M3.podcasts/a] fails a feed address whose host does not exist as feedUnreachable at once, before Audiobookshelf hears it', async () => {
    const server = absServer([]);
    const missing = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const guarded = feedFetch({ lookup: async () => Promise.reject(missing) });
    const { request } = createRequest(db, ana, await searchedRef(), clock);
    const deps = job(server.fetch, guarded);

    await turns(deps, 2);

    expect(getRequest(db, request.id)!.state).toMatchObject({
      status: 'failed',
      reason: 'feedUnreachable',
    });
    expect(server.calls).toEqual([]);
  });

  it("[M3.podcasts/a] fails as privateAddress when Audiobookshelf's filter refuses the address (recorded) and the guard now finds it private", async () => {
    const refused = replayFetch([abs('podcasts-feed-private')]);
    const calls: string[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push(new URL(url).pathname);
      return refused(url, init);
    };
    const guarded = feedFetch({ lookup: async () => ['10.0.0.5'] });
    let reads = 0;
    const turnsPrivate: FeedFetch = async (url, init) =>
      (reads += 1) === 1 ? recordedFeed(url, init) : guarded(url, init);
    const { request } = createRequest(db, ana, await searchedRef(), clock);

    const done = await settle(job(fetch, turnsPrivate), request.id);

    expect(done.state).toMatchObject({ status: 'failed', reason: 'privateAddress' });
    expect(calls).toEqual(['/api/podcasts/feed']);
  });

  it("[M3.podcasts/a] holds the request as away when Audiobookshelf cannot read a feed Auralis's guard still reads as public, and subscribes once it can", async () => {
    const refused = replayFetch([abs('podcasts-feed-private')]);
    const server = absServer(['podcasts-create']);
    let failing = 1;
    const fetch: FetchLike = async (url, init) => {
      if (new URL(url).pathname === '/api/podcasts/feed' && failing > 0) {
        failing -= 1;
        return refused(url, init);
      }
      return server.fetch(url, init);
    };
    const deps = job(fetch);
    const { request } = createRequest(db, ana, await searchedRef(), clock);

    await turns(deps, 2);
    expect(failing).toBe(0);
    const held = getRequest(db, request.id)!;
    expect(held.state.status).toBe('searching');
    expect(held.heldSince).not.toBeNull();

    const done = await settle(deps, request.id);
    expect(done.state.status).toBe('inLibrary');
  });
});
