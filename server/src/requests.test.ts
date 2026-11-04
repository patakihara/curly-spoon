/**
 * The advance job through its real store and machine, with stand-in steps for what each medium
 * does upstream. What stands behind `importing → inLibrary` is the real index job on the recorded
 * libraries, so a request is in the library only once the recordings' index has found it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestStatus, type MediaRef, type RequestMedium, type RequestRef } from '@auralis/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbsClient } from './adapters/audiobookshelf/client.js';
import { readFeed } from './adapters/feed/client.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import {
  standInRelease,
  standInSteps,
  type StandInScript,
  type StandInSteps,
} from './adapters/http/standIn.js';
import { JellyfinClient } from './adapters/jellyfin/client.js';
import { buildApp } from './app.js';
import { runIndex } from './libraryIndex/job.js';
import { indexedRow } from './libraryIndex/store.js';
import {
  advanceRequests,
  chooseRelease,
  pickAnotherRelease,
  retryRequest,
  type RequestJobDeps,
} from './requests/job.js';
import { ROUTES } from './requests/machine.js';
import { type MediumSteps, stepsRegistry } from './requests/steps.js';
import { openDatabase, type Db } from './store/connection.js';
import {
  createRequest,
  deleteRequest,
  getRequest,
  saveRequest,
  type StoredRequest,
} from './store/requests.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const HOUR = 3_600_000;
const CAP = 24 * HOUR;

function recording(upstream: string, call: string): Recording {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
const abs = (call: string) => recording('audiobookshelf', call);
const jf = (call: string) => recording('jellyfin', call);
const json = <T>(r: Recording) => (r.response.body as { json: T }).json;

const book: MediaRef = { source: 'abs', id: json<{ id: string }>(abs('index-book-1')).id };
const show: MediaRef = { source: 'abs', id: json<{ id: string }>(abs('index-show-1')).id };
const albums = json<{ Items: { Id: string }[] }>(jf('jf-library-albums-1')).Items;
const album: MediaRef = { source: 'jellyfin', id: albums[0]!.Id };
const songsAlbum: MediaRef = { source: 'jellyfin', id: albums[1]!.Id };

const common = { baseUrl: 'http://upstream.invalid', token: '<token>' };

/** The real index job on the recorded page of each library. */
async function indexRecordings(db: Db, at: number) {
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
    now: () => at,
    random: () => 0,
    pageSize: 2,
    pages: { first: 4, count: 1 },
  });
  expect(result.abs?.error).toBeNull();
  expect(result.jellyfin?.error).toBeNull();
}

const refs: Record<RequestMedium, RequestRef> = {
  book: {
    medium: 'book',
    target: { title: 'A Book', creator: 'An Author', ids: { asin: 'B0036S4B76' } },
  },
  album: {
    medium: 'album',
    target: {
      title: 'An Album',
      creator: 'An Artist',
      ids: { mbid: '3f8a5e7c-1b2d-4e6f-9a0b-c1d2e3f4a5b6' },
    },
  },
  song: {
    medium: 'song',
    target: { title: 'A Song', creator: 'An Artist', ids: { youtubeMusicId: 'dQw4w9WgXcQ' } },
  },
  podcast: {
    medium: 'podcast',
    target: { title: 'A Show', creator: null, ids: { feedUrl: 'https://feeds.example.com/show' } },
  },
};

const candidates = [standInRelease('a'), standInRelease('b')];

let db: Db;
let ana: string;
let clock: number;
let logged: Record<string, unknown>[];

beforeEach(() => {
  db = openDatabase(':memory:');
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
  clock = Date.UTC(2026, 9, 13, 8);
  logged = [];
});

const deps = (...steps: MediumSteps[]): RequestJobDeps => ({
  db,
  steps: stepsRegistry(steps),
  log: { error: (details) => logged.push(details) },
  now: () => clock,
  notIndexedAfterMs: CAP,
});

const request = (medium: RequestMedium) => createRequest(db, ana, refs[medium], clock).request;
const reread = (one: StoredRequest) => getRequest(db, one.id)!;

/** Runs the job until the request reaches a status, or fails the test. */
async function runUntil(job: RequestJobDeps, one: StoredRequest, status: RequestStatus) {
  for (let turn = 0; turn < 20; turn += 1) {
    if (reread(one).state.status === status) return;
    clock += 1_000;
    await advanceRequests(job);
  }
  throw new Error(`never reached ${status}: ${JSON.stringify(reread(one).state)}`);
}

/** Runs the job until the import has named its item, which then waits for the index. */
async function runUntilImported(job: RequestJobDeps, one: StoredRequest) {
  await runUntil(job, one, 'importing');
  clock += 1_000;
  await advanceRequests(job);
  expect(reread(one).result).not.toBeNull();
}

describe('[M3.requests/a] one request per medium through every status its route has', () => {
  const scripts: Record<RequestMedium, StandInScript> = {
    book: {
      search: { kind: 'choose', candidates },
      polls: [{ kind: 'queued' }, { kind: 'downloading', progress: 0.5 }, { kind: 'done' }],
      imports: book,
    },
    album: {
      search: { kind: 'choose', candidates },
      polls: [{ kind: 'downloading', progress: 0.25 }, { kind: 'done' }],
      imports: album,
    },
    song: {
      polls: [{ kind: 'downloading', progress: 0.5 }, { kind: 'done' }],
      imports: songsAlbum,
    },
    podcast: { imports: show },
  };

  it('[M3.requests/a] walks each route to the library, waiting at importing for the real index', async () => {
    const media = Object.keys(scripts) as RequestMedium[];
    const job = deps(...media.map((m) => standInSteps(m, scripts[m])));
    const requests = media.map(request);
    const seen = new Map<string, RequestStatus[]>(
      requests.map((one) => [one.id, [one.state.status]]),
    );
    const look = () => {
      for (const one of requests) {
        const statuses = seen.get(one.id)!;
        const status = reread(one).state.status;
        if (statuses.at(-1) !== status) statuses.push(status);
      }
    };

    for (let turn = 0; turn < 12; turn += 1) {
      clock += 1_000;
      await advanceRequests(job);
      look();
      for (const one of requests) {
        if (reread(one).state.status === 'needsChoice') {
          expect(await chooseRelease(job, one.id, 'b')).not.toBeNull();
          look();
        }
      }
    }

    // Everything is imported and has waited turn after turn: nothing is in the library until the
    // index has really found it.
    for (const one of requests) {
      const now = reread(one);
      expect(now.state, one.medium).toEqual({ status: 'importing' });
      expect(indexedRow(db, now.result!.source, now.result!.id), one.medium).toBeUndefined();
    }

    await indexRecordings(db, clock);
    clock += 1_000;
    await advanceRequests(job);
    look();

    for (const one of requests) {
      expect(seen.get(one.id), one.medium).toEqual(ROUTES[one.medium]);
    }
    const covered = new Set([...seen.values()].flat());
    expect(RequestStatus.options.filter((s) => !covered.has(s))).toEqual(['failed']);
    expect(reread(requests[0]!).result).toEqual(book);
  });

  it('[M3.requests/a] takes one step per request per run', async () => {
    const job = deps(standInSteps('podcast'));
    const one = request('podcast');
    for (const status of ['searching', 'importing', 'importing'] as const) {
      await advanceRequests(job);
      expect(reread(one).state.status).toBe(status);
    }
  });

  it('[M3.requests/a] follows a chosen release through the download, and starts it once', async () => {
    const steps = standInSteps('album', scripts.album);
    const job = deps(steps);
    const one = request('album');
    await runUntil(job, one, 'needsChoice');
    expect(reread(one).candidates).toEqual(candidates);
    await advanceRequests(job);
    expect(reread(one).state.status).toBe('needsChoice');
    expect(steps.calls.search).toBe(1);

    await chooseRelease(job, one.id, 'a');
    expect(reread(one)).toMatchObject({ state: { status: 'queued' }, release: candidates[0] });
    await advanceRequests(job);
    expect(reread(one)).toMatchObject({ state: { status: 'queued' }, handle: { release: 'a' } });
    await advanceRequests(job);
    expect(reread(one).state).toEqual({ status: 'downloading', progress: 0.25 });
    await runUntil(job, one, 'importing');
    expect(steps.calls.start).toBe(1);
  });

  it('[M3.requests/a] refuses a choice of a release nobody offered', async () => {
    const job = deps(standInSteps('album', scripts.album));
    const one = request('album');
    expect(await chooseRelease(job, one.id, 'a')).toBeNull();
    await runUntil(job, one, 'needsChoice');
    expect(await chooseRelease(job, one.id, 'nobody-offered-this')).toBeNull();
    expect(await chooseRelease(job, 'no-such-request', 'a')).toBeNull();
    expect(reread(one).state.status).toBe('needsChoice');
  });
});

describe('[M3.requests/b] a failed step names its status and reason, and a retry resumes there', () => {
  const failing = (): StandInSteps =>
    standInSteps('album', {
      polls: [
        { kind: 'downloading', progress: 0.5 },
        { kind: 'failed', reason: 'downloadFailed' },
        { kind: 'done' },
      ],
      imports: album,
    });

  it('[M3.requests/b] fails at downloading with its reason; a retry downloads again without searching again', async () => {
    const steps = failing();
    const job = deps(steps);
    const one = request('album');
    await runUntil(job, one, 'failed');
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'downloading',
      reason: 'downloadFailed',
    });
    await advanceRequests(job);
    expect(steps.calls.poll).toBe(2);

    expect(await retryRequest(job, one.id)).toMatchObject({
      state: { status: 'downloading', progress: 0 },
      handle: null,
      release: standInRelease('one'),
    });
    expect(steps.cancelled).toEqual([{ release: 'one', start: 1 }]);
    await runUntil(job, one, 'importing');
    expect(steps.calls.search).toBe(1);
    expect(steps.calls.start).toBe(2);
  });

  it('[M3.requests/b] still retries when the failed download cannot be dropped, and logs it', async () => {
    const steps = failing();
    const download = {
      ...steps.download!,
      cancel: () => Promise.reject(new Error('the client is down')),
    };
    const job = deps({ ...steps, download });
    const one = request('album');
    await runUntil(job, one, 'failed');
    expect(await retryRequest(job, one.id)).toMatchObject({ state: { status: 'downloading' } });
    expect(logged).toEqual([expect.objectContaining({ request: one.id })]);
  });

  it('[M3.requests/b] fails at importing when the import throws; a retry imports again and no more', async () => {
    let refuse = true;
    const steps = standInSteps('podcast', { imports: show });
    const counted = steps.import.bind(steps);
    const job = deps({
      ...steps,
      import: (one) => (refuse ? Promise.reject(new Error('refused')) : counted(one)),
    });
    const one = request('podcast');
    await runUntil(job, one, 'failed');
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'importing',
      reason: 'importFailed',
    });

    refuse = false;
    expect(await retryRequest(job, one.id)).toMatchObject({ state: { status: 'importing' } });
    await advanceRequests(job);
    expect(reread(one).result).toEqual(show);
    expect(steps.calls.search).toBe(1);
  });

  it('[M3.requests/b] fails notIndexed past the cap, not before; a retry waits for the index again without importing again', async () => {
    const steps = standInSteps('album', { imports: album });
    const job = deps(steps);
    const one = request('album');
    await runUntilImported(job, one);

    clock += CAP - 1;
    await advanceRequests(job);
    expect(reread(one).state).toEqual({ status: 'importing' });
    clock += 1;
    await advanceRequests(job);
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'importing',
      reason: 'notIndexed',
    });

    await retryRequest(job, one.id);
    clock += CAP - 1;
    await advanceRequests(job);
    expect(reread(one).state).toEqual({ status: 'importing' });

    await indexRecordings(db, clock);
    await advanceRequests(job);
    expect(reread(one).state).toEqual({ status: 'inLibrary' });
    expect(steps.calls).toMatchObject({ search: 1, start: 1, import: 1 });
  });

  it('[M3.requests/b] records why a search failed, and a retry searches again', async () => {
    const none = standInSteps('book', { search: { kind: 'none', reason: 'noRelease' } });
    const one = request('book');
    await runUntil(deps(none), one, 'failed');
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'searching',
      reason: 'noRelease',
    });
    await retryRequest(deps(none), one.id);
    expect(reread(one).state).toEqual({ status: 'searching' });

    const thrown = {
      ...standInSteps('album'),
      search: () => Promise.reject(new Error('the indexer is down')),
    };
    const other = request('album');
    await runUntil(deps(thrown), other, 'failed');
    expect(reread(other).state).toEqual({
      status: 'failed',
      failedStep: 'searching',
      reason: 'searchFailed',
    });
    expect(logged).toEqual(
      expect.arrayContaining([expect.objectContaining({ request: other.id })]),
    );
  });

  it('[M3.requests/b] fails a search offering no candidates as no release', async () => {
    const steps = standInSteps('book', { search: { kind: 'choose', candidates: [] } });
    const one = request('book');
    await runUntil(deps(steps), one, 'failed');
    expect(reread(one).state).toMatchObject({ failedStep: 'searching', reason: 'noRelease' });
  });

  it('[M3.requests/b] one failing request never stops another in the same run', async () => {
    const broken = {
      ...standInSteps('book'),
      search: () => Promise.reject(new Error('down')),
    };
    const job = deps(broken, standInSteps('album'));
    const first = request('book');
    const second = request('album');
    saveRequest(db, first.id, { state: { status: 'searching' } }, clock);
    saveRequest(db, second.id, { state: { status: 'searching' } }, clock);

    await advanceRequests(job);
    expect(reread(first).state.status).toBe('failed');
    expect(reread(second).state.status).toBe('queued');
  });

  it('[M3.requests/b] one request that cannot be read or saved never stops another', async () => {
    const job = deps(standInSteps('book'), standInSteps('album'));
    const unreadable = request('book');
    const good = request('album');
    db.prepare('UPDATE requests SET handle = ? WHERE id = ?').run('{', unreadable.id);

    await advanceRequests(job);
    expect(reread(good).state.status).toBe('searching');
    expect(logged).toEqual([expect.objectContaining({ request: unreadable.id })]);
  });

  it('[M3.requests/b] leaves a request whose medium has no steps where it is', async () => {
    const job = deps(standInSteps('book'));
    const one = request('album');
    await advanceRequests(job);
    expect(reread(one).state.status).toBe('requested');
    expect(logged).toEqual([]);
  });

  it('[M3.requests/b] a job that restarts mid-download picks up from the stored handle', async () => {
    const before = standInSteps('song', { polls: [{ kind: 'downloading', progress: 0.4 }] });
    const one = request('song');
    await runUntil(deps(before), one, 'downloading');
    await advanceRequests(deps(before));
    await advanceRequests(deps(before));
    expect(reread(one)).toMatchObject({
      state: { status: 'downloading', progress: 0.4 },
      handle: { release: 'one' },
    });

    const after = standInSteps('song', { imports: songsAlbum });
    await advanceRequests(deps(after));
    expect(after.polled).toEqual([{ release: 'one', start: 1 }]);
    expect(after.calls).toMatchObject({ search: 0, start: 0 });
    expect(reread(one).state).toEqual({ status: 'importing' });
  });

  it('[M3.requests/b] drops a download started for a request cancelled meanwhile', async () => {
    const steps = standInSteps('song');
    const start = steps.download!.start;
    const one = request('song');
    const job = deps({
      ...steps,
      download: {
        ...steps.download!,
        start: (...args) => {
          deleteRequest(db, one.id);
          return start(...args);
        },
      },
    });
    saveRequest(
      db,
      one.id,
      { state: { status: 'downloading', progress: 0 }, release: standInRelease('one') },
      clock,
    );
    await advanceRequests(job);
    expect(steps.cancelled).toEqual([{ release: 'one', start: 1 }]);
  });
});

describe('[M3.requests/b] picking another release after a failure', () => {
  const others = [standInRelease('two'), standInRelease('three')];
  const failingWith = (rest: typeof others): StandInSteps =>
    standInSteps('book', {
      search: { kind: 'picked', release: standInRelease('one'), others: rest },
      polls: [{ kind: 'failed', reason: 'downloadFailed' }, { kind: 'done' }],
      imports: book,
    });

  it('[M3.requests/b] offers the search’s other candidates, leaving out the release that failed', async () => {
    const steps = failingWith(others);
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'failed');
    expect(reread(one).candidates).toEqual(others);

    expect(await pickAnotherRelease(job, one.id)).toMatchObject({
      state: { status: 'needsChoice' },
      candidates: others,
      handle: null,
      release: null,
    });
    expect(await chooseRelease(job, one.id, 'one')).toBeNull();
    expect(await chooseRelease(job, one.id, 'three')).toMatchObject({
      state: { status: 'queued' },
      release: others[1],
    });
    expect(steps.cancelled).toEqual([{ release: 'one', start: 1 }]);
    await runUntil(job, one, 'importing');
    expect(steps.calls).toMatchObject({ search: 1, start: 2 });
  });

  it('[M3.requests/b] leaves a chosen candidate out too once that one has failed', async () => {
    const steps = standInSteps('book', {
      search: { kind: 'choose', candidates: others },
      polls: [{ kind: 'failed', reason: 'downloadFailed' }],
    });
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'needsChoice');
    await chooseRelease(job, one.id, 'two');
    await runUntil(job, one, 'failed');
    expect(await pickAnotherRelease(job, one.id)).toMatchObject({ candidates: [others[1]] });
  });

  it('[M3.requests/b] takes another release straight from a failure, with one tap', async () => {
    const steps = failingWith(others);
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'failed');
    expect(await chooseRelease(job, one.id, 'one')).toBeNull();
    expect(await chooseRelease(job, one.id, 'two')).toMatchObject({
      state: { status: 'queued' },
      release: others[0],
      candidates: others,
      handle: null,
    });
  });

  it('[M3.requests/b] clears what an import named when a new release replaces it', async () => {
    const steps = standInSteps('book', {
      search: { kind: 'picked', release: standInRelease('one'), others },
      imports: book,
    });
    const job = deps(steps);
    const one = request('book');
    await runUntilImported(job, one);
    clock += CAP;
    await advanceRequests(job);
    expect(reread(one).state).toMatchObject({ reason: 'notIndexed' });
    expect(await pickAnotherRelease(job, one.id)).toMatchObject({ result: null });
  });

  it('[M3.requests/b] refuses to pick another with no other candidate; retry still works', async () => {
    const steps = failingWith([]);
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'failed');

    expect(await pickAnotherRelease(job, one.id)).toBeNull();
    expect(await chooseRelease(job, one.id, 'one')).toBeNull();
    expect(reread(one).state).toMatchObject({ status: 'failed', failedStep: 'queued' });
    expect(steps.cancelled).toEqual([]);

    expect(await retryRequest(job, one.id)).toMatchObject({ state: { status: 'queued' } });
    await runUntil(job, one, 'importing');
    expect(steps.calls).toMatchObject({ search: 1, start: 2 });
  });

  it('[M3.requests/b] takes no retry of a request that has not failed, and no other release for a song', async () => {
    const song = standInSteps('song', {
      search: { kind: 'picked', release: standInRelease('one'), others },
      polls: [{ kind: 'failed', reason: 'downloadFailed' }],
    });
    const job = deps(song);
    const one = request('song');
    expect(await retryRequest(job, one.id)).toBeNull();
    expect(await pickAnotherRelease(job, one.id)).toBeNull();
    await runUntil(job, one, 'failed');
    expect(await pickAnotherRelease(job, one.id)).toBeNull();
    expect(await chooseRelease(job, one.id, 'two')).toBeNull();
    expect(await retryRequest(job, 'no-such-request')).toBeNull();
  });
});

describe('the advance job in the app', () => {
  it('moves requests on its own turn, and stops with the app', async () => {
    const one = request('podcast');
    const app = await buildApp({
      webDistDir: null,
      db,
      requests: {
        steps: stepsRegistry([standInSteps('podcast', { imports: show })]),
        everyMs: 5,
        notIndexedAfterMs: CAP,
      },
    });
    await vi.waitFor(() => expect(reread(one).result).toEqual(show));
    await app.close();
    const stopped = reread(one).updatedAt;
    clock += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(reread(one).updatedAt).toBe(stopped);
  });

  it('schedules no job when none is configured', async () => {
    const one = request('podcast');
    const app = await buildApp({ webDistDir: null, db });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reread(one).state.status).toBe('requested');
    await app.close();
  });
});
