/**
 * The advance job through its real store and machine, with stand-in steps for what each medium
 * does upstream. What stands behind `importing → inLibrary` is the real index job on the recorded
 * libraries, so a request is in the library only once the recordings' index has found it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RequestList,
  RequestStatus,
  RequestView,
  SESSION_COOKIE,
  type MediaRef,
  type RequestMedium,
  type RequestRef,
} from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { claimsOf } from './store/claims.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import {
  createRequest,
  deleteRequest,
  getRequest,
  peopleOn,
  saveRequest,
  type StoredRequest,
} from './store/requests.js';
import { createSession } from './store/sessions.js';
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
          expect(chooseRelease(job, one.id, 'b')).not.toBeNull();
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
    expect(claimsOf(db, ana)).toEqual(
      expect.arrayContaining([
        { ref: book, reason: 'requested' },
        { ref: album, reason: 'requested' },
        { ref: songsAlbum, reason: 'added' },
        { ref: show, reason: 'subscribed' },
      ]),
    );
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

    chooseRelease(job, one.id, 'a');
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
    expect(chooseRelease(job, one.id, 'a')).toBeNull();
    await runUntil(job, one, 'needsChoice');
    expect(chooseRelease(job, one.id, 'nobody-offered-this')).toBeNull();
    expect(chooseRelease(job, 'no-such-request', 'a')).toBeNull();
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
      import: (one, key) => (refuse ? Promise.reject(new Error('refused')) : counted(one, key)),
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
    expect(chooseRelease(job, one.id, 'one')).toBeNull();
    expect(chooseRelease(job, one.id, 'three')).toMatchObject({
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
    chooseRelease(job, one.id, 'two');
    await runUntil(job, one, 'failed');
    expect(await pickAnotherRelease(job, one.id)).toMatchObject({ candidates: [others[1]] });
  });

  it('[M3.requests/b] goes from a failure to another release only through the choice', async () => {
    const steps = failingWith(others);
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'failed');
    expect(chooseRelease(job, one.id, 'two')).toBeNull();
    expect(reread(one).state.status).toBe('failed');

    await pickAnotherRelease(job, one.id);
    expect(chooseRelease(job, one.id, 'two')).toMatchObject({
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
    expect(chooseRelease(job, one.id, 'one')).toBeNull();
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
    expect(chooseRelease(job, one.id, 'two')).toBeNull();
    expect(await retryRequest(job, 'no-such-request')).toBeNull();
  });
});

describe('the windows a crash, a cancel or a second tap can fall into', () => {
  /** A job whose process dies at the first save after `died` is called: the store never hears. */
  const dyingJob = (job: RequestJobDeps, died: { yes: boolean }): RequestJobDeps => ({
    ...job,
    now: () => {
      if (died.yes) throw new Error('the process died here');
      return clock;
    },
  });

  it('never starts a second download after a crash between starting one and saving its handle', async () => {
    const steps = standInSteps('song');
    const start = steps.download!.start;
    const one = request('song');
    await runUntil(deps(steps), one, 'downloading');

    const died = { yes: false };
    const download = {
      ...steps.download!,
      start: async (...args: Parameters<typeof start>) => {
        const handle = await start(...args);
        died.yes = true;
        return handle;
      },
    };
    await advanceRequests(dyingJob(deps({ ...steps, download }), died));
    expect(reread(one).handle).toBeNull();

    await advanceRequests(deps(steps));
    expect(steps.calls.start).toBe(1);
  });

  it('never imports twice after a crash between importing and saving what it named', async () => {
    const steps = standInSteps('podcast', { imports: show });
    const imports = steps.import;
    const one = request('podcast');
    await runUntil(deps(steps), one, 'importing');

    const died = { yes: false };
    const dying = async (...args: Parameters<typeof imports>) => {
      const named = await imports(...args);
      died.yes = true;
      return named;
    };
    await advanceRequests(dyingJob(deps({ ...steps, import: dying }), died));
    expect(reread(one).result).toBeNull();

    await advanceRequests(deps(steps));
    expect(steps.calls.import).toBe(1);
  });

  it('takes no step for a request cancelled while the run was busy with an earlier one', async () => {
    const earlier = request('book');
    clock += 1;
    const cancelled = request('podcast');
    saveRequest(db, earlier.id, { state: { status: 'searching' } }, clock);
    saveRequest(db, cancelled.id, { state: { status: 'importing' } }, clock);
    const podcast = standInSteps('podcast', { imports: show });
    const book = {
      ...standInSteps('book'),
      search: () => {
        deleteRequest(db, cancelled.id);
        return Promise.resolve({ kind: 'none', reason: 'noRelease' } as const);
      },
    };

    await advanceRequests(deps(book, podcast));
    expect(podcast.calls.import).toBe(0);
  });

  it('keeps the handle of a download started while a second retry was still dropping the old one', async () => {
    const steps = standInSteps('song', { polls: [{ kind: 'failed', reason: 'downloadFailed' }] });
    const drops: (() => void)[] = [];
    const download = {
      ...steps.download!,
      cancel: () => new Promise<void>((resolve) => drops.push(resolve)),
    };
    const job = deps({ ...steps, download });
    const one = request('song');
    await runUntil(job, one, 'failed');

    const firstTap = retryRequest(job, one.id);
    const secondTap = retryRequest(job, one.id);
    drops[0]!();
    await firstTap;
    await advanceRequests(job);
    const started = reread(one).handle;
    expect(started).not.toBeNull();

    drops[1]!();
    await secondTap;
    expect(reread(one).handle).toEqual(started);
  });

  it('saves the key before the step is called, and passes that same key to the step', async () => {
    const steps = standInSteps('song');
    const start = steps.download!.start;
    const saved: (string | null)[] = [];
    const passed: string[] = [];
    const download = {
      ...steps.download!,
      start: (...args: Parameters<typeof start>) => {
        saved.push(reread(one).stepKey);
        passed.push(args[2]);
        return start(...args);
      },
    };
    const job = deps({ ...steps, download });
    const one = request('song');
    await runUntil(job, one, 'downloading');
    await advanceRequests(job);
    expect(saved).toEqual(passed);
    expect(saved[0]).toEqual(expect.any(String));
    expect(reread(one).stepKey).toBeNull();
  });

  it('asks again under the same key after a start that threw, as it may have got through', async () => {
    const steps = standInSteps('song');
    const start = steps.download!.start;
    const keys: string[] = [];
    const download = {
      ...steps.download!,
      start: (...args: Parameters<typeof start>) => {
        keys.push(args[2]);
        return keys.length === 1 ? Promise.reject(new Error('timed out')) : start(...args);
      },
    };
    const job = deps({ ...steps, download });
    const one = request('song');
    await runUntil(job, one, 'failed');
    await retryRequest(job, one.id);
    await advanceRequests(job);
    expect(keys[1]).toBe(keys[0]);
    expect(reread(one).handle).not.toBeNull();
  });

  it('fails a queued request whose start throws with a download failure at queued', async () => {
    const steps = standInSteps('album');
    const download = {
      ...steps.download!,
      start: () => Promise.reject(new Error('the client is down')),
    };
    const one = request('album');
    await runUntil(deps({ ...steps, download }), one, 'failed');
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'queued',
      reason: 'downloadFailed',
    });
  });

  it('fails a downloading request whose poll throws with a download failure at downloading', async () => {
    const steps = standInSteps('song');
    const download = {
      ...steps.download!,
      poll: () => Promise.reject(new Error('the client is down')),
    };
    const one = request('song');
    await runUntil(deps({ ...steps, download }), one, 'failed');
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'downloading',
      reason: 'downloadFailed',
    });
  });

  it('records no failure on a request cancelled while its step was throwing', async () => {
    const one = request('book');
    const steps = {
      ...standInSteps('book'),
      search: () => {
        deleteRequest(db, one.id);
        return Promise.reject(new Error('down'));
      },
    };
    saveRequest(db, one.id, { state: { status: 'searching' } }, clock);
    await advanceRequests(deps(steps));
    expect(getRequest(db, one.id)).toBeNull();
  });

  it('lets a person ask for something whose live request cannot be read', () => {
    const one = request('book');
    db.prepare('UPDATE requests SET handle = ? WHERE id = ?').run('{', one.id);
    expect(() => createRequest(db, ana, refs.book, clock)).not.toThrow();
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

  it('closes only once a running turn has finished', async () => {
    const one = request('podcast');
    let finish = () => undefined as void;
    const held = new Promise<void>((resolve) => (finish = resolve));
    const steps = standInSteps('podcast');
    let searching = false;
    const app = await buildApp({
      webDistDir: null,
      db,
      requests: {
        steps: stepsRegistry([
          {
            ...steps,
            search: async (...args) => {
              searching = true;
              await held;
              return steps.search(...args);
            },
          },
        ]),
        everyMs: 5,
        notIndexedAfterMs: CAP,
      },
    });
    saveRequest(db, one.id, { state: { status: 'searching' } }, clock);
    await vi.waitFor(() => expect(searching).toBe(true));

    let closed = false;
    const closing = app.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(false);

    finish();
    await closing;
    expect(reread(one).state.status).toBe('importing');
  });

  it('schedules no job when none is configured', async () => {
    const one = request('podcast');
    const app = await buildApp({ webDistDir: null, db });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reread(one).state.status).toBe('requested');
    await app.close();
  });
});

describe('the requests routes', () => {
  const PUBLIC = 'https://audio.example.org';
  const others = [standInRelease('two'), standInRelease('three')];
  let app: FastifyInstance | null = null;
  let ben: string;
  const cookies: Record<string, string> = {};

  const signIn = (userId: string, name: string) => {
    const { id } = createDevice(db, { userId, kind: 'web' });
    cookies[name] = `${SESSION_COOKIE}=${createSession(db, { userId, deviceId: id }).token}`;
  };

  /** The app with these steps; its job's first turn has passed, and the test moves it after that. */
  const serving = async (...steps: MediumSteps[]) => {
    ben = upsertUser(db, { username: 'ben', role: 'member' }).id;
    signIn(ana, 'ana');
    signIn(ben, 'ben');
    app = await buildApp({
      webDistDir: null,
      db,
      publicOrigin: PUBLIC,
      now: () => clock,
      ...(steps.length === 0
        ? {}
        : {
            requests: { steps: stepsRegistry(steps), everyMs: 3_600_000, notIndexedAfterMs: CAP },
          }),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return deps(...steps);
  };
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  const call = (method: 'GET' | 'POST', url: string, who: string | null, payload?: object) =>
    app!.inject({
      method,
      url: `/api/requests${url}`,
      headers: {
        origin: PUBLIC,
        ...(who === null ? {} : { cookie: cookies[who] ?? '' }),
      },
      ...(payload === undefined ? {} : { payload }),
    });
  const ask = async (medium: RequestMedium, who = 'ana') => {
    const res = await call('POST', '', who, { ref: refs[medium] });
    expect(res.statusCode).toBe(200);
    return RequestView.parse(res.json());
  };
  const list = async (who = 'ana') => {
    const res = await call('GET', '', who);
    expect(res.statusCode).toBe(200);
    return RequestList.parse(res.json());
  };
  const view = async (id: string, who = 'ana') => {
    const res = await call('GET', `/${id}`, who);
    expect(res.statusCode).toBe(200);
    return RequestView.parse(res.json());
  };
  const stored = (id: string) => getRequest(db, id)!;

  /** Runs the job until a request reaches a status, or fails the test. */
  const until = async (job: RequestJobDeps, id: string, status: RequestStatus) =>
    runUntil(job, stored(id), status);

  it('answers 409 medium_unavailable when no medium has steps, and makes nothing', async () => {
    await serving();
    const res = await call('POST', '', 'ana', { ref: refs.book });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'medium_unavailable' });
    expect(db.prepare('SELECT id FROM requests').all()).toEqual([]);
  });

  it('answers 409 medium_unavailable for a medium with no steps while another has some', async () => {
    await serving(standInSteps('book'));
    expect((await call('POST', '', 'ana', { ref: refs.album })).statusCode).toBe(409);
  });

  it('refuses a request signed out, from a foreign origin, or naming no catalogue id', async () => {
    await serving(standInSteps('book'));
    expect((await call('POST', '', null, { ref: refs.book })).statusCode).toBe(401);
    expect((await call('GET', '', null)).statusCode).toBe(401);
    const foreign = await app!.inject({
      method: 'POST',
      url: '/api/requests',
      headers: { origin: 'https://elsewhere.example.org', cookie: cookies.ana ?? '' },
      payload: { ref: refs.book },
    });
    expect(foreign.statusCode).toBe(403);
    const bare = { medium: 'book', target: { title: 'A Book', creator: null, ids: {} } };
    expect((await call('POST', '', 'ana', { ref: bare })).statusCode).toBe(400);
    expect(db.prepare('SELECT id FROM requests').all()).toEqual([]);
  });

  it('lists a downloading request in raw values, with nothing of how it is fetched', async () => {
    const job = await serving(
      standInSteps('song', { polls: [{ kind: 'downloading', progress: 0.4 }] }),
    );
    const { id } = await ask('song');
    await until(job, id, 'downloading');
    await advanceRequests(job);
    await advanceRequests(job);

    const shown = await list();
    expect(shown).toEqual({
      needsChoice: [],
      inFlight: [
        {
          id,
          medium: 'song',
          title: 'A Song',
          creator: 'An Artist',
          art: null,
          source: 'stand-in',
          size: 1_000_000,
          status: 'downloading',
          progress: 0.4,
          reason: null,
          verbs: ['cancel'],
          candidates: [],
        },
      ],
    });
    const raw = (await call('GET', '', 'ana')).body;
    expect(raw).not.toContain('stand-in:');
    expect(raw).not.toContain('stepKey');
  });

  it('leaves podcasts off the list and what has arrived, but keeps them as requests', async () => {
    const job = await serving(
      standInSteps('podcast', { imports: show }),
      standInSteps('song', { imports: songsAlbum }),
    );
    const podcast = await ask('podcast');
    const song = await ask('song');
    expect((await list()).inFlight.map((one) => one.id)).toEqual([song.id]);
    expect((await view(podcast.id)).medium).toBe('podcast');

    await indexRecordings(db, clock);
    await until(job, song.id, 'inLibrary');
    expect(await list()).toEqual({ inFlight: [], needsChoice: [] });
    const arrived = await view(song.id);
    expect(arrived).toMatchObject({ status: 'inLibrary', verbs: [] });
    expect(arrived.art).toMatch(/^\/api\/media\//);
  });

  it('offers a needed choice with candidates, takes one by id, and refuses one nobody offered', async () => {
    const job = await serving(standInSteps('album', { search: { kind: 'choose', candidates } }));
    const { id } = await ask('album');
    await until(job, id, 'needsChoice');

    const { needsChoice, inFlight } = await list();
    expect(inFlight).toEqual([]);
    expect(needsChoice[0]).toMatchObject({
      id,
      verbs: ['choose', 'cancel'],
      source: null,
      candidates: [
        { id: 'a', title: 'Release a', source: 'stand-in', size: 1_000_000 },
        { id: 'b', title: 'Release b', source: 'stand-in', size: 1_000_000 },
      ],
    });
    expect(JSON.stringify(needsChoice[0])).not.toContain('details');

    const refused = await call('POST', `/${id}/choose`, 'ana', { candidate: 'nobody' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'not_offered' });

    const chosen = await call('POST', `/${id}/choose`, 'ana', { candidate: 'b' });
    expect(chosen.statusCode).toBe(200);
    expect(RequestView.parse(chosen.json())).toMatchObject({
      status: 'queued',
      source: 'stand-in',
    });
    expect(stored(id).release).toEqual(candidates[1]);
  });

  it('retries a failed request, and refuses to retry one that has not failed', async () => {
    const steps = standInSteps('song', {
      polls: [{ kind: 'failed', reason: 'downloadFailed' }, { kind: 'done' }],
    });
    const job = await serving(steps);
    const { id } = await ask('song');
    expect((await call('POST', `/${id}/retry`, 'ana')).statusCode).toBe(409);
    await until(job, id, 'failed');
    expect(await view(id)).toMatchObject({
      status: 'failed',
      reason: 'downloadFailed',
      verbs: ['retry', 'cancel'],
      candidates: [],
    });

    const retried = await call('POST', `/${id}/retry`, 'ana');
    expect(RequestView.parse(retried.json())).toMatchObject({ status: 'downloading', progress: 0 });
    expect(steps.cancelled).toEqual([{ release: 'one', start: 1 }]);
  });

  describe('one tap on another release from a failed row', () => {
    const failing = () =>
      standInSteps('book', {
        search: { kind: 'picked', release: standInRelease('one'), others },
        polls: [{ kind: 'failed', reason: 'downloadFailed' }, { kind: 'done' }],
        imports: book,
      });

    it('offers pickAnother only where other candidates exist', async () => {
      const job = await serving(
        failing(),
        standInSteps('album', {
          search: { kind: 'picked', release: standInRelease('one'), others: [] },
          polls: [{ kind: 'failed', reason: 'downloadFailed' }],
        }),
      );
      const withOthers = await ask('book');
      const without = await ask('album');
      await until(job, withOthers.id, 'failed');
      await until(job, without.id, 'failed');

      const failed = await view(withOthers.id);
      expect(failed.verbs).toEqual(['retry', 'pickAnother', 'cancel']);
      expect(failed.candidates.map((c) => c.id)).toEqual(['two', 'three']);
      expect(await view(without.id)).toMatchObject({
        verbs: ['retry', 'cancel'],
        candidates: [],
      });
    });

    it('drops the old download and queues the new release, in the one tap', async () => {
      const steps = failing();
      const job = await serving(steps);
      const { id } = await ask('book');
      await until(job, id, 'failed');

      const tapped = await call('POST', `/${id}/choose`, 'ana', { candidate: 'three' });
      expect(tapped.statusCode).toBe(200);
      expect(RequestView.parse(tapped.json())).toMatchObject({ status: 'queued' });
      expect(steps.cancelled).toEqual([{ release: 'one', start: 1 }]);
      expect(stored(id)).toMatchObject({ handle: null, release: others[1], candidates: others });
    });

    it('never re-offers the release that failed: choosing it refuses and drops nothing', async () => {
      const steps = failing();
      const job = await serving(steps);
      const { id } = await ask('book');
      await until(job, id, 'failed');

      expect((await call('POST', `/${id}/choose`, 'ana', { candidate: 'one' })).statusCode).toBe(
        409,
      );
      expect(steps.cancelled).toEqual([]);
      expect(stored(id).state.status).toBe('failed');
    });

    it('clears what the old release imported, so the new one imports for itself', async () => {
      const steps = standInSteps('book', {
        search: { kind: 'picked', release: standInRelease('one'), others },
        imports: book,
      });
      const job = await serving(steps);
      const { id } = await ask('book');
      await until(job, id, 'importing');
      await advanceRequests(job);
      expect(stored(id).result).toEqual(book);
      clock += CAP;
      await until(job, id, 'failed');

      await call('POST', `/${id}/choose`, 'ana', { candidate: 'two' });
      expect(stored(id)).toMatchObject({ state: { status: 'queued' }, result: null });
    });
  });

  describe('a request two people are on', () => {
    it('joins a second person to the first request, one download, and both get the claim', async () => {
      const steps = standInSteps('album', { imports: album });
      const job = await serving(steps);
      const first = await ask('album', 'ana');
      const second = await ask('album', 'ben');
      expect(second.id).toBe(first.id);
      expect(peopleOn(db, first.id).sort()).toEqual([ana, ben].sort());

      await until(job, first.id, 'importing');
      await advanceRequests(job);
      expect(claimsOf(db, ana)).toEqual([]);
      await indexRecordings(db, clock);
      await until(job, first.id, 'inLibrary');

      expect(steps.calls.start).toBe(1);
      for (const person of [ana, ben]) {
        expect(claimsOf(db, person)).toEqual([{ ref: album, reason: 'requested' }]);
      }
    });

    it('takes off only the one who cancels: the download and the row stay for the other', async () => {
      const steps = standInSteps('song', { polls: [{ kind: 'downloading', progress: 0.5 }] });
      const job = await serving(steps);
      const { id } = await ask('song', 'ana');
      await ask('song', 'ben');
      await until(job, id, 'downloading');
      await advanceRequests(job);
      await advanceRequests(job);

      const left = await call('POST', `/${id}/cancel`, 'ana');
      expect(left.statusCode).toBe(200);
      expect(left.json()).toEqual({ ok: true });
      expect(steps.cancelled).toEqual([]);
      expect(peopleOn(db, id)).toEqual([ben]);
      expect((await call('GET', `/${id}`, 'ana')).statusCode).toBe(404);
      expect((await list('ana')).inFlight).toEqual([]);
      expect((await view(id, 'ben')).status).toBe('downloading');

      expect((await call('POST', `/${id}/cancel`, 'ben')).statusCode).toBe(200);
      expect(steps.cancelled).toEqual([{ release: 'one', start: 1 }]);
      expect(getRequest(db, id)).toBeNull();
    });

    it('gives no claim to someone who left before it arrived', async () => {
      const job = await serving(standInSteps('album', { imports: album }));
      const { id } = await ask('album', 'ana');
      await ask('album', 'ben');
      await call('POST', `/${id}/cancel`, 'ana');
      await until(job, id, 'importing');
      await advanceRequests(job);
      await indexRecordings(db, clock);
      await until(job, id, 'inLibrary');
      expect(claimsOf(db, ana)).toEqual([]);
      expect(claimsOf(db, ben)).toEqual([{ ref: album, reason: 'requested' }]);
    });

    it('retries a failed request when someone joins it, and both people see it move', async () => {
      const steps = standInSteps('song', {
        polls: [{ kind: 'failed', reason: 'downloadFailed' }, { kind: 'done' }],
      });
      const job = await serving(steps);
      const { id } = await ask('song', 'ana');
      await until(job, id, 'failed');

      const joined = await ask('song', 'ben');
      expect(joined).toMatchObject({ id, status: 'downloading', reason: null });
      expect(steps.calls.search).toBe(1);
      expect((await view(id, 'ana')).status).toBe('downloading');
      expect((await view(id, 'ben')).status).toBe('downloading');

      await until(job, id, 'importing');
      expect((await view(id, 'ana')).status).toBe('importing');
    });

    it('answers in the library with a claim for what has already arrived, starting nothing', async () => {
      const steps = standInSteps('album', { imports: album });
      const job = await serving(steps);
      const { id } = await ask('album', 'ana');
      await until(job, id, 'importing');
      await advanceRequests(job);
      await indexRecordings(db, clock);
      await until(job, id, 'inLibrary');

      const again = await ask('album', 'ben');
      expect(again).toMatchObject({ id, status: 'inLibrary', verbs: [] });
      expect(claimsOf(db, ben)).toEqual([{ ref: album, reason: 'requested' }]);
      expect(db.prepare('SELECT id FROM requests').all()).toEqual([{ id }]);
      expect(steps.calls.search).toBe(1);
    });

    it('makes a new request when what arrived has since left the index', async () => {
      const job = await serving(standInSteps('album', { imports: album }));
      const { id } = await ask('album', 'ana');
      await until(job, id, 'importing');
      await advanceRequests(job);
      await indexRecordings(db, clock);
      await until(job, id, 'inLibrary');
      db.prepare('DELETE FROM index_items WHERE source = ? AND upstream_id = ?').run(
        album.source,
        album.id,
      );

      const again = await ask('album', 'ben');
      expect(again.id).not.toBe(id);
      expect(again.status).toBe('requested');
    });

    it('refuses a cancel of what has already arrived', async () => {
      const job = await serving(standInSteps('album', { imports: album }));
      const { id } = await ask('album', 'ana');
      await until(job, id, 'importing');
      await advanceRequests(job);
      await indexRecordings(db, clock);
      await until(job, id, 'inLibrary');
      const res = await call('POST', `/${id}/cancel`, 'ana');
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'in_library' });
    });
  });

  it('cancels a lone request: the medium drops its download and the row goes', async () => {
    const steps = standInSteps('song', { polls: [{ kind: 'downloading', progress: 0.5 }] });
    const job = await serving(steps);
    const { id } = await ask('song');
    await until(job, id, 'downloading');
    await advanceRequests(job);
    expect((await call('POST', `/${id}/cancel`, 'ana')).statusCode).toBe(200);
    expect(steps.cancelled).toEqual([{ release: 'one', start: 1 }]);
    expect(getRequest(db, id)).toBeNull();
    expect((await list()).inFlight).toEqual([]);
  });

  it('answers 404 to another person’s request id on every verb, and changes nothing', async () => {
    const steps = standInSteps('song', { polls: [{ kind: 'failed', reason: 'downloadFailed' }] });
    const job = await serving(steps);
    const { id } = await ask('song', 'ana');
    await until(job, id, 'failed');
    expect((await list('ben')).inFlight).toEqual([]);

    for (const [method, url, body] of [
      ['GET', `/${id}`, undefined],
      ['POST', `/${id}/retry`, undefined],
      ['POST', `/${id}/cancel`, undefined],
      ['POST', `/${id}/choose`, { candidate: 'one' }],
      ['GET', '/no-such-request', undefined],
    ] as const) {
      const res = await call(method, url, 'ben', body);
      expect(res.statusCode, url).toBe(404);
    }
    expect(peopleOn(db, id)).toEqual([ana]);
    expect(stored(id).state.status).toBe('failed');
    expect(steps.cancelled).toEqual([]);
  });

  it('hides a request that cannot be read, and leaves the others', async () => {
    await serving(standInSteps('song'), standInSteps('album'));
    const bad = await ask('song');
    const good = await ask('album');
    db.prepare('UPDATE requests SET handle = ? WHERE id = ?').run('{', bad.id);
    expect((await list()).inFlight.map((one) => one.id)).toEqual([good.id]);
    expect((await call('GET', `/${bad.id}`, 'ana')).statusCode).toBe(404);
  });
});
