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
  type RequestIds,
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
  RequestTurns,
  chooseRelease,
  otherReleases,
  pickAnotherRelease,
  retryRequest,
  type RequestJobDeps,
} from './requests/job.js';
import { ROUTES } from './requests/machine.js';
import {
  type DownloadHandle,
  type ImportOutcome,
  type MediumSteps,
  type PollOutcome,
  StepUnavailable,
  stepsRegistry,
} from './requests/steps.js';
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
import { rememberTracks } from './store/streamedTracks.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const HOUR = 3_600_000;
const CAP = 24 * HOUR;
const STEP_LIMIT = 60_000;
const MINUTE = 60_000;
const STALL = 15 * MINUTE;
const HOLD = 60 * MINUTE;

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
/** A track on `songsAlbum`, as a kept song's import names it. */
const songsTrack: MediaRef = {
  source: 'jellyfin',
  id: json<{ Items: { Id: string }[] }>(jf('index-album-tracks-2')).Items[0]!.Id,
};

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

/** The stand-in song as search named it, so `POST /keep` builds `refs.song`'s target from it. */
const STREAMED_SONG = {
  id: refs.song.target.ids.youtubeMusicId!,
  title: refs.song.target.title,
  artists: [refs.song.target.creator!],
  album: null,
  duration: 200,
  artUrl: null,
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
  stepTimeoutMs: STEP_LIMIT,
  stallAfterMs: STALL,
  holdAfterMs: HOLD,
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

    expect(await secondTap).toBeNull();
    expect(drops).toHaveLength(1);
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

describe('[M3.books] an import that has to wait for its folder to be seen', () => {
  const keysOf = (steps: StandInSteps) => {
    const keys: string[] = [];
    const imports = steps.import;
    return {
      keys,
      steps: {
        ...steps,
        import: (...args: Parameters<typeof imports>) => {
          keys.push(args[1]);
          return imports(...args);
        },
      },
    };
  };

  it('[M3.books] calls again under the same key, saving nothing, and then arrives', async () => {
    const { keys, steps } = keysOf(standInSteps('podcast', { importWaits: 2, imports: show }));
    const job = deps(steps);
    const one = request('podcast');
    await runUntil(job, one, 'importing');

    clock += 1_000;
    await advanceRequests(job);
    const waiting = reread(one);
    expect(waiting.result).toBeNull();
    clock += 1_000;
    await advanceRequests(job);
    expect(reread(one)).toEqual(waiting);

    clock += 1_000;
    await advanceRequests(job);
    expect(reread(one).result).toEqual(show);
    expect(reread(one).stepKey).toBeNull();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
  });

  it('[M3.books] fails notIndexed when the wait never ends, not before, and a retry asks under the same key', async () => {
    const { keys, steps } = keysOf(
      standInSteps('podcast', { importWaits: Infinity, imports: show }),
    );
    const job = deps(steps);
    const one = request('podcast');
    await runUntil(job, one, 'importing');
    clock += 1_000;
    await advanceRequests(job);

    clock += CAP - 1_000;
    await advanceRequests(job);
    expect(reread(one).state).toEqual({ status: 'importing' });

    clock += 1_000;
    await advanceRequests(job);
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'importing',
      reason: 'notIndexed',
    });

    await retryRequest(job, one.id);
    await advanceRequests(job);
    expect(new Set(keys).size).toBe(1);
  });
});

describe('[M3.books] an upstream that cannot be reached holds the request where it stands', () => {
  type Step = 'search' | 'start' | 'poll' | 'import';
  /** The steps, with one of them refusing as a dropped connection does while `down` is set. */
  const refusing = (step: Step, steps: StandInSteps) => {
    const line = { down: false, keys: [] as string[] };
    const refused = () => Promise.reject(new StepUnavailable('connection refused'));
    const { search, download } = steps;
    const imports = steps.import;
    const { start, poll } = download!;
    return {
      line,
      steps: {
        ...steps,
        search: (...args: Parameters<typeof search>) =>
          line.down && step === 'search' ? refused() : search(...args),
        import: (...args: Parameters<typeof imports>) => {
          if (step === 'import') line.keys.push(args[1]);
          return line.down && step === 'import' ? refused() : imports(...args);
        },
        download: {
          ...download!,
          start: (...args: Parameters<typeof start>) => {
            if (step === 'start') line.keys.push(args[2]);
            return line.down && step === 'start' ? refused() : start(...args);
          },
          poll: (...args: Parameters<typeof poll>) =>
            line.down && step === 'poll' ? refused() : poll(...args),
        },
      },
    };
  };
  const cases = [
    { step: 'search', status: 'searching', reason: 'searchFailed' },
    { step: 'start', status: 'queued', reason: 'downloadFailed' },
    { step: 'poll', status: 'downloading', reason: 'downloadFailed' },
    { step: 'import', status: 'importing', reason: 'importFailed' },
  ] as const;

  it.each(cases)(
    '[M3.books] holds at $step with nothing saved, then fails $reason past the hold',
    async ({ step, status, reason }) => {
      const stand = standInSteps('book', {
        polls: [{ kind: 'downloading', progress: 0.5 }, { kind: 'done' }],
      });
      const { line, steps } = refusing(step, stand);
      const job = deps(steps);
      const one = request('book');
      await runUntil(job, one, status);
      line.down = true;

      clock += 1_000;
      await advanceRequests(job);
      const held = reread(one);
      expect(held.state.status).toBe(status);
      expect(logged.at(-1)).toMatchObject({ request: one.id, step: status });

      clock = held.heldSince! + HOLD - 1_000;
      await advanceRequests(job);
      expect(reread(one)).toEqual(held);

      clock += 1_000;
      await advanceRequests(job);
      expect(reread(one).state).toEqual({ status: 'failed', failedStep: status, reason });
    },
  );

  it.each(cases.filter(({ step }) => step === 'start' || step === 'import'))(
    '[M3.books] goes on under the same key once $step answers again',
    async ({ step, status }) => {
      const { line, steps } = refusing(step, standInSteps('book'));
      const job = deps(steps);
      const one = request('book');
      await runUntil(job, one, status);
      line.down = true;
      clock += MINUTE;
      await advanceRequests(job);
      clock += MINUTE;
      await advanceRequests(job);
      line.down = false;
      clock += MINUTE;
      await advanceRequests(job);
      expect(line.keys).toHaveLength(3);
      expect(new Set(line.keys).size).toBe(1);
      expect(reread(one).stepKey).toBeNull();
    },
  );

  describe('[M3.books] the hold is timed from when the service went away', () => {
    /** An import still waiting for the service to see its folder, its last save long ago. */
    const longWaiting = async () => {
      const { line, steps } = refusing(
        'import',
        standInSteps('book', { importWaits: Infinity, imports: { source: 'abs', id: 'b' } }),
      );
      const job = deps(steps);
      const one = request('book');
      await runUntil(job, one, 'importing');
      clock += 1_000;
      await advanceRequests(job);
      clock += 2 * HOLD;
      await advanceRequests(job);
      return { line, job, one };
    };

    it('[M3.books] holds an import that has waited over an hour on its first refusal', async () => {
      const { line, job, one } = await longWaiting();
      line.down = true;
      const wentAway = clock + MINUTE;
      clock = wentAway;
      await advanceRequests(job);
      expect(reread(one).state).toEqual({ status: 'importing' });
      expect(reread(one).heldSince).toBe(wentAway);

      clock = wentAway + HOLD - 1_000;
      await advanceRequests(job);
      expect(reread(one).state).toEqual({ status: 'importing' });

      clock = wentAway + HOLD;
      await advanceRequests(job);
      expect(reread(one).state).toEqual({
        status: 'failed',
        failedStep: 'importing',
        reason: 'importFailed',
      });
    });

    it('[M3.books] starts the hold again once the service has answered in between', async () => {
      const { line, job, one } = await longWaiting();
      line.down = true;
      clock += MINUTE;
      await advanceRequests(job);
      clock += HOLD - MINUTE;
      line.down = false;
      await advanceRequests(job);
      expect(reread(one).heldSince).toBeNull();

      line.down = true;
      clock += MINUTE;
      const again = clock;
      await advanceRequests(job);
      expect(reread(one).heldSince).toBe(again);
      clock = again + HOLD - 1_000;
      await advanceRequests(job);
      expect(reread(one).state).toEqual({ status: 'importing' });
    });

    it('[M3.books] writes the hold without touching the version or the last save', async () => {
      const { line, job, one } = await longWaiting();
      const before = reread(one);
      line.down = true;
      clock += MINUTE;
      await advanceRequests(job);
      const held = reread(one);
      expect(held.version).toBe(before.version);
      expect(held.updatedAt).toBe(before.updatedAt);
    });

    it('[M3.books] ends the hold with any save, so a retry gets a whole hold of its own', async () => {
      const { line, steps } = refusing('search', standInSteps('book'));
      const job = deps(steps);
      const one = request('book');
      await runUntil(job, one, 'searching');
      line.down = true;
      clock += MINUTE;
      await advanceRequests(job);
      clock += HOLD;
      await advanceRequests(job);
      expect(reread(one).state).toMatchObject({ status: 'failed', reason: 'searchFailed' });
      expect(reread(one).heldSince).toBeNull();

      await retryRequest(job, one.id);
      clock += MINUTE;
      await advanceRequests(job);
      expect(reread(one).state.status).not.toBe('failed');
    });
  });

  it('[M3.books] still fails at once on any other throw', async () => {
    const steps = standInSteps('podcast');
    const job = deps({ ...steps, search: () => Promise.reject(new Error('a 401')) });
    const one = request('podcast');
    await runUntil(job, one, 'failed');
    expect(reread(one).state).toMatchObject({ reason: 'searchFailed' });
  });

  const standing = (progress = 0.5) =>
    standInSteps('book', { polls: [{ kind: 'downloading', progress }] });

  it('[M3.books] leaves the stall clock unwritten while the poll cannot be answered', async () => {
    const { line, steps } = refusing('poll', standing());
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'downloading');
    const { progressAt } = reread(one);
    line.down = true;
    clock += 20 * MINUTE;
    await advanceRequests(job);
    expect(reread(one).progressAt).toBe(progressAt);
  });

  it.each([STALL - MINUTE, STALL, 30 * MINUTE])(
    '[M3.books] never takes a moving download for a stalled one after %d ms of no answers',
    async (flap) => {
      const { line, steps } = refusing('poll', standing());
      const job = deps(steps);
      const one = request('book');
      await runUntil(job, one, 'downloading');
      line.down = true;
      clock += flap;
      await advanceRequests(job);
      line.down = false;
      clock += 1_000;
      await advanceRequests(job);
      expect(reread(one).state).toEqual({ status: 'downloading', progress: 0.5 });
    },
  );

  it('[M3.books] counts the stall afresh after a long gap, and it still fires', async () => {
    const { line, steps } = refusing('poll', standing());
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'downloading');
    line.down = true;
    clock += 30 * MINUTE;
    await advanceRequests(job);
    line.down = false;
    await advanceRequests(job);
    expect(reread(one).state.status).toBe('downloading');
    for (let minute = 0; minute < 14; minute += 1) {
      clock += MINUTE;
      await advanceRequests(job);
    }
    expect(reread(one).state.status).toBe('downloading');
    clock += MINUTE;
    await advanceRequests(job);
    expect(reread(one).state).toMatchObject({ reason: 'downloadStalled' });
  });

  it('[M3.books] does not count a short outage towards the stall', async () => {
    const { line, steps } = refusing('poll', standing());
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'downloading');
    for (let minute = 0; minute < 10; minute += 1) {
      clock += MINUTE;
      await advanceRequests(job);
    }
    line.down = true;
    clock += 6 * MINUTE;
    await advanceRequests(job);
    line.down = false;
    clock += 1_000;
    await advanceRequests(job);
    expect(reread(one).state).toEqual({ status: 'downloading', progress: 0.5 });
  });
});

describe('[M3.books] a download that stops moving', () => {
  const others = [standInRelease('b'), standInRelease('c')];
  const picked = { kind: 'picked', release: standInRelease('a'), others } as const;
  const everyMinute = async (job: RequestJobDeps, minutes: number) => {
    for (let minute = 0; minute < minutes; minute += 1) {
      clock += MINUTE;
      await advanceRequests(job);
    }
  };

  it('[M3.books] fails downloadStalled at the limit and not a minute before', async () => {
    const job = deps(standInSteps('book', { polls: [{ kind: 'downloading', progress: 0.94 }] }));
    const one = request('book');
    await runUntil(job, one, 'downloading');

    await everyMinute(job, 14);
    expect(reread(one).state).toEqual({ status: 'downloading', progress: 0.94 });
    await everyMinute(job, 1);
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'downloading',
      reason: 'downloadStalled',
    });
  });

  it('[M3.books] catches metadata that never comes, as progress that stays at nothing', async () => {
    const job = deps(standInSteps('book', { polls: [{ kind: 'downloading', progress: 0 }] }));
    const one = request('book');
    await runUntil(job, one, 'downloading');
    await everyMinute(job, 15);
    expect(reread(one).state).toMatchObject({ status: 'failed', reason: 'downloadStalled' });
  });

  it('[M3.books] takes rising progress as life, however slow', async () => {
    const polls = Array.from({ length: 40 }, (_, turn) => ({
      kind: 'downloading' as const,
      progress: (turn + 1) / 100,
    }));
    const job = deps(standInSteps('book', { polls }));
    const one = request('book');
    await runUntil(job, one, 'downloading');
    for (let turn = 0; turn < 8; turn += 1) {
      clock += 10 * MINUTE;
      await advanceRequests(job);
      expect(reread(one).state.status).toBe('downloading');
      expect(reread(one).progressAt).toBe(clock);
    }
  });

  it('[M3.books] does not count time spent in the client’s queue', async () => {
    const polls = [
      { kind: 'downloading', progress: 0.5 },
      ...Array.from({ length: 6 }, () => ({ kind: 'queued' as const })),
      { kind: 'downloading', progress: 0.5 },
    ] satisfies PollOutcome[];
    const job = deps(standInSteps('book', { polls }));
    const one = request('book');
    await runUntil(job, one, 'downloading');
    for (let turn = 0; turn < 7; turn += 1) {
      clock += 10 * MINUTE;
      await advanceRequests(job);
      expect(reread(one).state).toEqual({ status: 'downloading', progress: 0.5 });
    }
    expect(reread(one).progressAt).toBe(clock - 10 * MINUTE);
  });

  it('[M3.books] drops the dead one and starts the next release by itself, down to the last', async () => {
    const steps = standInSteps('book', {
      search: picked,
      polls: [{ kind: 'downloading', progress: 0.5 }],
    });
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'downloading');

    await everyMinute(job, 15);
    expect(reread(one)).toMatchObject({
      state: { status: 'queued' },
      release: { id: 'b' },
      handle: null,
    });
    expect(steps.cancelled).toEqual([{ release: 'a', start: 1 }]);

    await runUntil(job, one, 'downloading');
    await everyMinute(job, 15);
    expect(reread(one).release?.id).toBe('c');
    expect(steps.cancelled).toEqual([
      { release: 'a', start: 1 },
      { release: 'b', start: 2 },
    ]);

    await runUntil(job, one, 'downloading');
    await everyMinute(job, 15);
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'downloading',
      reason: 'downloadStalled',
    });
    expect(otherReleases(reread(one))).toEqual([]);
    expect(steps.calls.start).toBe(3);
    await everyMinute(job, 30);
    expect(steps.calls.start).toBe(3);
    expect(steps.calls.search).toBe(1);
  });

  it('[M3.books] starts at most 3 more releases by itself, however many a person was offered', async () => {
    const offered = ['a', 'b', 'c', 'd', 'e', 'f'].map(standInRelease);
    const steps = standInSteps('book', {
      search: { kind: 'choose', candidates: offered },
      polls: [{ kind: 'downloading', progress: 0.5 }],
    });
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'needsChoice');
    chooseRelease(job, one.id, 'a');
    await everyMinute(job, 120);
    expect(steps.calls.start).toBe(4);
  });

  it('[M3.books] past the three, fails and offers what is left, and a person may still choose it', async () => {
    const offered = ['a', 'b', 'c', 'd', 'e', 'f'].map(standInRelease);
    const steps = standInSteps('book', {
      search: { kind: 'choose', candidates: offered },
      polls: [{ kind: 'downloading', progress: 0.5 }],
    });
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'needsChoice');
    chooseRelease(job, one.id, 'a');
    await everyMinute(job, 120);
    expect(reread(one).state).toMatchObject({ status: 'failed', reason: 'downloadStalled' });
    expect(reread(one).autoStarts).toBe(3);
    expect(otherReleases(reread(one)).map((release) => release.id)).toEqual(['e', 'f']);

    await pickAnotherRelease(job, one.id);
    chooseRelease(job, one.id, 'e');
    await everyMinute(job, 60);
    expect(steps.calls.start).toBe(5);
    expect(reread(one).state.status).toBe('failed');
  });

  it('[M3.books] gives an album the same rule, and a song, with no choice, stays failed', async () => {
    const stood = { polls: [{ kind: 'downloading', progress: 0.5 } as const] };
    const album = standInSteps('album', { ...stood, search: picked });
    const song = standInSteps('song', stood);
    const job = deps(album, song);
    const [theAlbum, theSong] = [request('album'), request('song')];
    await runUntil(job, theSong, 'downloading');
    await everyMinute(job, 18);
    expect(reread(theAlbum).release?.id).toBe('b');
    expect(reread(theSong).state).toMatchObject({ status: 'failed', reason: 'downloadStalled' });
    expect(song.calls.start).toBe(1);
  });

  it('[M3.books] drops the dead one before the next one starts', async () => {
    const order: string[] = [];
    const steps = standInSteps('book', {
      search: picked,
      polls: [{ kind: 'downloading', progress: 0.5 }],
    });
    const { start, cancel } = steps.download!;
    const job = deps({
      ...steps,
      download: {
        ...steps.download!,
        start: (one, release, key) => {
          order.push(`start ${release.id}`);
          return start(one, release, key);
        },
        cancel: async (target) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push('cancel');
          return cancel(target);
        },
      },
    });
    const one = request('book');
    await runUntil(job, one, 'downloading');
    await everyMinute(job, 16);
    expect(order).toEqual(['start a', 'cancel', 'start b']);
  });

  it('[M3.books] a next release started for a request cancelled meanwhile still drops itself', async () => {
    const steps = standInSteps('book', {
      search: picked,
      polls: [{ kind: 'downloading', progress: 0.5 }],
    });
    const { start } = steps.download!;
    const one = request('book');
    const job = deps({
      ...steps,
      download: {
        ...steps.download!,
        start: (...args) => {
          if (args[1].id === 'b') deleteRequest(db, one.id);
          return start(...args);
        },
      },
    });
    await runUntil(job, one, 'downloading');
    await everyMinute(job, 16);
    expect(getRequest(db, one.id)).toBeNull();
    expect(steps.cancelled).toEqual([
      { release: 'a', start: 1 },
      { release: 'b', start: 2 },
    ]);
  });

  it('[M3.books] a retry of a stalled download keeps what it has and follows it, starting nothing', async () => {
    const steps = standInSteps('book', { polls: [{ kind: 'downloading', progress: 0.5 }] });
    const start = vi.fn(steps.download!.start);
    const cancel = vi.fn(steps.download!.cancel);
    const job = deps({ ...steps, download: { ...steps.download!, start, cancel } });
    const one = request('book');
    await runUntil(job, one, 'downloading');
    const handle = reread(one).handle;
    await everyMinute(job, 15);
    expect(reread(one).state).toMatchObject({ reason: 'downloadStalled' });

    await retryRequest(job, one.id);
    await everyMinute(job, 1);
    expect(cancel).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
    expect(reread(one).handle).toEqual(handle);
    expect(reread(one).state.status).toBe('downloading');
  });

  it('[M3.books] a retry of a stalled download gets a full limit again', async () => {
    const steps = standInSteps('book', { polls: [{ kind: 'downloading', progress: 0.5 }] });
    const job = deps(steps);
    const one = request('book');
    await runUntil(job, one, 'downloading');
    await everyMinute(job, 15);
    expect(reread(one).state).toMatchObject({ reason: 'downloadStalled' });

    await retryRequest(job, one.id);
    await everyMinute(job, 2);
    expect(reread(one).state).toEqual({ status: 'downloading', progress: 0.5 });
    await everyMinute(job, 13);
    expect(reread(one).state.status).toBe('downloading');
    await everyMinute(job, 1);
    expect(reread(one).state).toMatchObject({ reason: 'downloadStalled' });
  });
});

describe('a step that never answers', () => {
  const hung = <T>(): Promise<T> => new Promise<T>(() => undefined);
  /** The job with a limit short enough to wait out. */
  const impatient = (...steps: MediumSteps[]) => ({ ...deps(...steps), stepTimeoutMs: 5 });

  /** A second request of the same run, on a medium whose steps answer. */
  const other = () => {
    const steps = standInSteps('podcast', { imports: show });
    return { steps, one: request('podcast') };
  };

  it('fails a search that hangs at searching, moves another request, and the next turn runs', async () => {
    const steps = { ...standInSteps('book'), search: () => hung<never>() };
    const stuck = request('book');
    const answering = other();
    const job = impatient(steps, answering.steps);

    await advanceRequests(job);
    await advanceRequests(job);
    expect(reread(stuck).state).toEqual({
      status: 'failed',
      failedStep: 'searching',
      reason: 'searchFailed',
    });
    expect(reread(answering.one).state.status).toBe('importing');

    await advanceRequests(job);
    expect(reread(answering.one).result).toEqual(show);
    expect(logged.map((entry) => entry.step)).toEqual(['searching']);
  });

  it('fails a start that hangs at queued, keeps its key, and a retry cannot double it', async () => {
    const steps = standInSteps('book');
    const answers = steps.download!;
    const keys: string[] = [];
    let hangs = true;
    const download = {
      ...answers,
      start: (...args: Parameters<typeof answers.start>) => {
        keys.push(args[2]);
        return hangs ? hung<DownloadHandle>() : answers.start(...args);
      },
    };
    const job = impatient({ ...steps, download });
    const one = request('book');
    await runUntil(job, one, 'failed');
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'queued',
      reason: 'downloadFailed',
    });
    const { stepKey } = reread(one);
    expect(stepKey).toEqual(expect.any(String));

    hangs = false;
    await retryRequest(job, one.id);
    await advanceRequests(job);
    expect(keys).toEqual([stepKey, stepKey]);
    expect(reread(one).handle).not.toBeNull();
    expect(steps.calls.start).toBe(1);
  });

  it('fails a poll that hangs at downloading, moves another request, and keeps the handle', async () => {
    const steps = standInSteps('song');
    const download = { ...steps.download!, poll: () => hung<never>() };
    const stuck = request('song');
    const answering = other();
    const job = impatient({ ...steps, download }, answering.steps);
    await runUntil(job, stuck, 'failed');
    expect(reread(stuck).state).toEqual({
      status: 'failed',
      failedStep: 'downloading',
      reason: 'downloadFailed',
    });
    expect(reread(answering.one).state.status).toBe('importing');
  });

  it('fails an import that hangs at importing, keeps its key, and a retry cannot double it', async () => {
    const steps = standInSteps('podcast', { imports: show });
    const imports = steps.import;
    const keys: string[] = [];
    let hangs = true;
    const job = impatient({
      ...steps,
      import: (...args: Parameters<typeof imports>) => {
        keys.push(args[1]);
        return hangs ? hung<ImportOutcome>() : imports(...args);
      },
    });
    const one = request('podcast');
    await runUntil(job, one, 'failed');
    expect(reread(one).state).toEqual({
      status: 'failed',
      failedStep: 'importing',
      reason: 'importFailed',
    });
    const { stepKey } = reread(one);
    expect(stepKey).toEqual(expect.any(String));

    hangs = false;
    await retryRequest(job, one.id);
    await advanceRequests(job);
    expect(keys).toEqual([stepKey, stepKey]);
    expect(reread(one).result).toEqual(show);
    expect(steps.calls.import).toBe(1);
  });

  it('frees a medium from a cancel that hangs: the retry answers, logs it, and a start still goes', async () => {
    const steps = standInSteps('song', { polls: [{ kind: 'failed', reason: 'downloadFailed' }] });
    const answers = steps.download!;
    let hangs = false;
    const download = {
      ...answers,
      cancel: (...args: Parameters<typeof answers.cancel>) =>
        hangs ? hung<void>() : answers.cancel(...args),
    };
    const job = impatient({ ...steps, download });
    const one = request('song');
    await runUntil(job, one, 'failed');

    hangs = true;
    const started = steps.calls.start!;
    await retryRequest(job, one.id);
    expect(logged.map((entry) => entry.request)).toEqual([one.id]);
    await advanceRequests(job);
    expect(steps.calls.start).toBe(started + 1);
    expect(reread(one).handle).not.toBeNull();
  });

  it('frees a medium from a start that hangs: a later start is not left behind it', async () => {
    const steps = standInSteps('song');
    const answers = steps.download!;
    let hangs = true;
    const download = {
      ...answers,
      start: (...args: Parameters<typeof answers.start>) =>
        hangs ? hung<DownloadHandle>() : answers.start(...args),
    };
    const job = impatient({ ...steps, download });
    const first = request('song');
    await runUntil(job, first, 'failed');

    hangs = false;
    const second = createRequest(
      db,
      ana,
      { ...refs.song, target: { ...refs.song.target, ids: { youtubeMusicId: 'otherSongId' } } },
      clock,
    ).request;
    await runUntil(job, second, 'downloading');
    await advanceRequests(job);
    expect(reread(second).handle).not.toBeNull();
  });

  it('runs the app job past a hung step, so a request made afterwards still moves', async () => {
    const steps = { ...standInSteps('book'), search: () => hung<never>() };
    const stuck = request('book');
    const app = await buildApp({
      webDistDir: null,
      db,
      requests: {
        steps: stepsRegistry([steps, standInSteps('podcast', { imports: show })]),
        everyMs: 5,
        notIndexedAfterMs: CAP,
        stepTimeoutMs: 5,
        stallAfterMs: STALL,
        holdAfterMs: HOLD,
      },
    });
    await vi.waitFor(() => expect(reread(stuck).state.status).toBe('failed'));
    const later = request('podcast');
    await vi.waitFor(() => expect(reread(later).result).toEqual(show));
    await app.close();
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
        stepTimeoutMs: STEP_LIMIT,
        stallAfterMs: STALL,
        holdAfterMs: HOLD,
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
        stepTimeoutMs: STEP_LIMIT,
        stallAfterMs: STALL,
        holdAfterMs: HOLD,
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

describe('[M3.keep] the job woken between its turns', () => {
  /** Prompt song steps whose polls each wait to be let through, counting how many are out at once. */
  function gated() {
    const base = standInSteps('song', { polls: [{ kind: 'downloading', progress: 0.5 }] });
    const gates: (() => void)[] = [];
    let out = 0;
    let most = 0;
    const steps: MediumSteps = {
      ...base,
      prompt: true,
      download: {
        ...base.download!,
        poll: async (handle) => {
          out += 1;
          most = Math.max(most, out);
          await new Promise<void>((resolve) => gates.push(resolve));
          out -= 1;
          return base.download!.poll(handle);
        },
      },
    };
    return { steps, gates, most: () => most };
  }

  it('[M3.keep] a prompt request walks its route in one wake, each step once the one before is saved', async () => {
    const turns = new RequestTurns(
      deps({ ...standInSteps('song', { imports: songsTrack }), prompt: true }),
    );
    const one = request('song');
    turns.wake();
    await vi.waitFor(() => expect(reread(one).result).toEqual(songsTrack));
    expect(reread(one).state.status).toBe('importing');
    await turns.stop();
  });

  it('[M3.keep] a wake runs one more turn after the running one, never two at once, however many come', async () => {
    const { steps, gates, most } = gated();
    const turns = new RequestTurns(deps(steps));
    const one = request('song');
    turns.wake();
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    expect(reread(one).handle).not.toBeNull();

    turns.wake();
    turns.wake();
    turns.wake();
    void turns.tick();
    gates[0]!();
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    gates[1]!();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gates).toHaveLength(2);
    await turns.stop();
    expect(most()).toBe(1);
  });

  it('[M3.keep] a wake moves no medium that is not prompt; the next turn does', async () => {
    const turns = new RequestTurns(deps(standInSteps('book')));
    const one = request('book');
    turns.wake();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reread(one).state.status).toBe('requested');
    await turns.tick();
    expect(reread(one).state.status).toBe('searching');
  });

  it('[M3.keep] a kept song that arrives claims its album for everyone on the request', async () => {
    const ben = upsertUser(db, { username: 'ben', role: 'member' }).id;
    const one = request('song');
    createRequest(db, ben, refs.song, clock);
    const job = deps(standInSteps('song', { imports: songsTrack }));
    await runUntilImported(job, one);
    await indexRecordings(db, clock);
    await runUntil(job, one, 'inLibrary');
    for (const person of [ana, ben]) {
      expect(claimsOf(db, person)).toEqual([{ ref: songsAlbum, reason: 'added' }]);
    }
  });
});

describe('the requests routes', () => {
  const PUBLIC = 'https://audio.example.org';
  const others = [standInRelease('two'), standInRelease('three')];
  let app: FastifyInstance | null = null;
  let ben: string;
  let mostLive: number | undefined;
  const cookies: Record<string, string> = {};

  const signIn = (userId: string, name: string) => {
    const { id } = createDevice(db, { userId, kind: 'web' });
    cookies[name] = `${SESSION_COOKIE}=${createSession(db, { userId, deviceId: id }).token}`;
  };

  /** The app with these steps; its job's first turn has passed, and the test moves it after that. */
  const serving = async (...steps: MediumSteps[]) => {
    ben = upsertUser(db, { username: 'ben', role: 'member' }).id;
    rememberTracks(db, [STREAMED_SONG], clock);
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
            requests: {
              steps: stepsRegistry(steps),
              everyMs: 3_600_000,
              notIndexedAfterMs: CAP,
              stepTimeoutMs: STEP_LIMIT,
              stallAfterMs: STALL,
              holdAfterMs: HOLD,
              ...(mostLive === undefined ? {} : { maxLive: mostLive }),
            },
          }),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return deps(...steps);
  };
  afterEach(async () => {
    await app?.close();
    app = null;
    mostLive = undefined;
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
  /** Asks for a medium's stand-in thing; a song through its own door, as search named it. */
  const ask = async (medium: RequestMedium, who = 'ana') => {
    const res =
      medium === 'song'
        ? await app!.inject({
            method: 'POST',
            url: '/api/keep',
            headers: { origin: PUBLIC, cookie: cookies[who] ?? '' },
            payload: { ref: { source: 'ytmusic', id: refs.song.target.ids.youtubeMusicId } },
          })
        : await call('POST', '', who, { ref: refs[medium] });
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

  describe('[M3.books] how many live requests a person may hold', () => {
    const bookNo = (n: number): RequestRef => ({
      medium: 'book',
      target: {
        title: `Book ${n}`,
        creator: null,
        ids: { asin: `B${String(n).padStart(9, '0')}` },
      },
    });
    const filled = (count: number) =>
      [...Array(count).keys()].map((n) => createRequest(db, ana, bookNo(n), clock).request);

    it('answers 429 too_many_requests past the limit, and makes nothing', async () => {
      await serving(standInSteps('book'));
      filled(20);
      const res = await call('POST', '', 'ana', { ref: bookNo(20) });
      expect(res.statusCode).toBe(429);
      expect(res.json()).toEqual({ error: 'too_many_requests' });
      expect(db.prepare('SELECT id FROM requests').all()).toHaveLength(20);
    });

    it('takes the twentieth', async () => {
      await serving(standInSteps('book'));
      filled(19);
      expect((await call('POST', '', 'ana', { ref: bookNo(19) })).statusCode).toBe(200);
    });

    it('counts joining: a person at the limit joins nobody else’s, and stays off it', async () => {
      await serving(standInSteps('book'));
      filled(20);
      const { request } = createRequest(db, ben, bookNo(20), clock);
      const res = await call('POST', '', 'ana', { ref: bookNo(20) });
      expect(res.statusCode).toBe(429);
      expect(peopleOn(db, request.id)).toEqual([ben]);
    });

    it('counts a join toward the limit', async () => {
      await serving(standInSteps('book'));
      filled(19);
      createRequest(db, ben, bookNo(19), clock);
      expect((await call('POST', '', 'ana', { ref: bookNo(19) })).statusCode).toBe(200);
      expect((await call('POST', '', 'ana', { ref: bookNo(20) })).statusCode).toBe(429);
    });

    it('still answers a person at the limit asking again for what they hold', async () => {
      await serving(standInSteps('book'));
      const [first] = filled(20);
      const res = await call('POST', '', 'ana', { ref: bookNo(0) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: first!.id });
    });

    it('counts every medium and every failed request, but not one that reached the library', async () => {
      await serving(standInSteps('book'), standInSteps('podcast'));
      const held = filled(20);
      const feed = refs.podcast;
      expect((await call('POST', '', 'ana', { ref: feed })).statusCode).toBe(429);
      saveRequest(
        db,
        held[0]!.id,
        { state: { status: 'failed', failedStep: 'searching', reason: 'noRelease' } },
        clock,
      );
      expect((await call('POST', '', 'ana', { ref: feed })).statusCode).toBe(429);
      saveRequest(
        db,
        held[1]!.id,
        { state: { status: 'inLibrary' }, result: { source: 'abs', id: 'landed' } },
        clock,
      );
      expect((await call('POST', '', 'ana', { ref: feed })).statusCode).toBe(200);
    });

    it('takes its limit from the configuration', async () => {
      mostLive = 2;
      await serving(standInSteps('book'));
      filled(2);
      expect((await call('POST', '', 'ana', { ref: bookNo(2) })).statusCode).toBe(429);
    });

    it('refuses a title or a creator over 300 characters, and takes one of 300', async () => {
      await serving(standInSteps('book'));
      const named = (title: string, creator: string): RequestRef => ({
        medium: 'book',
        target: { title, creator, ids: { asin: 'B000000099' } },
      });
      const long = 'x'.repeat(301);
      const most = 'x'.repeat(300);
      expect((await call('POST', '', 'ana', { ref: named(long, 'a') })).statusCode).toBe(400);
      expect((await call('POST', '', 'ana', { ref: named('a', long) })).statusCode).toBe(400);
      expect((await call('POST', '', 'ana', { ref: named(most, most) })).statusCode).toBe(200);
    });
  });

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

  describe('[M3.keep] keeping a song', () => {
    const keep = (ref: object, who = 'ana') =>
      app!.inject({
        method: 'POST',
        url: '/api/keep',
        headers: { origin: PUBLIC, cookie: cookies[who] ?? '' },
        payload: { ref },
      });

    it('[M3.keep] keeps only a song search named, its target built from what search said', async () => {
      await serving(standInSteps('song'));
      for (const ref of [
        { source: 'ytmusic', id: 'neverNamed1' },
        { source: 'jellyfin', id: songsTrack.id },
      ]) {
        const refused = await keep(ref);
        expect(refused.statusCode).toBe(404);
        expect(refused.json()).toEqual({ error: 'not_found' });
      }
      expect(db.prepare('SELECT id FROM requests').all()).toEqual([]);

      const { id } = await ask('song');
      expect(stored(id).target).toEqual(refs.song.target);
    });

    it('[M3.keep] answers 400 use_keep to a song asked for by POST /requests, and makes nothing', async () => {
      await serving(standInSteps('song'));
      const res = await call('POST', '', 'ana', { ref: refs.song });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'use_keep' });
      expect(db.prepare('SELECT id FROM requests').all()).toEqual([]);
    });

    it('[M3.keep] answers 409 medium_unavailable while songs cannot be kept', async () => {
      await serving(standInSteps('book'));
      const res = await keep({ source: 'ytmusic', id: refs.song.target.ids.youtubeMusicId });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'medium_unavailable' });
    });

    it('[M3.keep] two people keeping one song are on one request', async () => {
      await serving(standInSteps('song'));
      const first = await ask('song', 'ana');
      const second = await ask('song', 'ben');
      expect(second.id).toBe(first.id);
      expect(peopleOn(db, first.id).sort()).toEqual([ana, ben].sort());
    });

    it('[M3.keep] a song already kept answers the keep from the library, claiming its album', async () => {
      const job = await serving(standInSteps('song', { imports: songsTrack }));
      const first = await ask('song', 'ana');
      await indexRecordings(db, clock);
      await until(job, first.id, 'inLibrary');

      const again = await ask('song', 'ben');
      expect(again).toMatchObject({ id: first.id, status: 'inLibrary' });
      expect(claimsOf(db, ben)).toEqual([{ ref: songsAlbum, reason: 'added' }]);
    });

    it('[M3.keep] a keep wakes the job: the song walks on with no turn of the job asked', async () => {
      await serving({ ...standInSteps('song', { imports: songsTrack }), prompt: true });
      const { id } = await ask('song');
      await vi.waitFor(() => expect(stored(id).result).toEqual(songsTrack));
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

  describe('what a fresh test of the routes found', () => {
    it('refuses a target whose title is only spaces, which would list as a blank row', async () => {
      await serving(standInSteps('book'));
      const target = { ...refs.book.target, title: '   ' };
      const res = await call('POST', '', 'ana', { ref: { ...refs.book, target } });
      expect(res.statusCode).toBe(400);
      expect(db.prepare('SELECT id FROM requests').all()).toEqual([]);
    });

    it('answers 409 medium_unavailable on a retry once its medium has no steps', async () => {
      const failing = standInSteps('song', {
        polls: [{ kind: 'failed', reason: 'downloadFailed' }],
      });
      const job = await serving(failing);
      const { id } = await ask('song');
      await until(job, id, 'failed');
      await app!.close();
      app = await buildApp({ webDistDir: null, db, publicOrigin: PUBLIC, now: () => clock });
      const res = await call('POST', `/${id}/retry`, 'ana');
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'medium_unavailable' });
      expect(stored(id).state.status).toBe('failed');
      expect((await view(id)).verbs).toEqual(['cancel']);
    });

    it('offers no choice to take once its medium has no steps', async () => {
      const job = await serving(standInSteps('album', { search: { kind: 'choose', candidates } }));
      const { id } = await ask('album');
      await until(job, id, 'needsChoice');
      await app!.close();
      app = await buildApp({ webDistDir: null, db, publicOrigin: PUBLIC, now: () => clock });
      const res = await call('POST', `/${id}/choose`, 'ana', { candidate: 'a' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'medium_unavailable' });
      expect(stored(id).state.status).toBe('needsChoice');
      expect(await view(id)).toMatchObject({ verbs: ['cancel'], candidates: [] });
    });

    it('finds what arrived by a catalogue id a person joined with, starting nothing', async () => {
      const steps = standInSteps('book', { imports: book });
      const job = await serving(steps);
      const { asin } = refs.book.target.ids;
      const isbn = '9780000000002';
      const { id } = await ask('book', 'ana');
      const joined = await call('POST', '', 'ben', {
        ref: { ...refs.book, target: { ...refs.book.target, ids: { asin, isbn } } },
      });
      expect(RequestView.parse(joined.json()).id).toBe(id);
      await until(job, id, 'importing');
      await advanceRequests(job);
      await indexRecordings(db, clock);
      await until(job, id, 'inLibrary');

      const res = await call('POST', '', 'ana', {
        ref: { ...refs.book, target: { ...refs.book.target, ids: { isbn } } },
      });
      expect(RequestView.parse(res.json())).toMatchObject({ id, status: 'inLibrary' });
      expect(db.prepare('SELECT id FROM requests').all()).toEqual([{ id }]);
    });

    it('finds what arrived by a new id someone brought when they asked for it there', async () => {
      const job = await serving(standInSteps('book', { imports: book }));
      const { asin } = refs.book.target.ids;
      const isbn = '9780000000002';
      const { id } = await ask('book', 'ana');
      await until(job, id, 'importing');
      await advanceRequests(job);
      await indexRecordings(db, clock);
      await until(job, id, 'inLibrary');
      const asking = (ids: RequestIds) =>
        call('POST', '', 'ben', { ref: { ...refs.book, target: { ...refs.book.target, ids } } });

      expect(RequestView.parse((await asking({ asin, isbn })).json()).id).toBe(id);
      expect(RequestView.parse((await asking({ isbn })).json()).id).toBe(id);
      expect(db.prepare('SELECT id FROM requests').all()).toEqual([{ id }]);
    });

    it('drops by its key a download whose start threw after it got through, when cancelled', async () => {
      const steps = standInSteps('song');
      const start = steps.download!.start;
      const got: DownloadHandle[] = [];
      steps.download!.start = async (...args) => {
        got.push(await start(...args));
        throw new Error('the answer was lost');
      };
      const job = await serving(steps);
      const { id } = await ask('song');
      await until(job, id, 'failed');
      expect(stored(id).handle).toBeNull();

      expect((await call('POST', `/${id}/cancel`, 'ana')).statusCode).toBe(200);
      expect(steps.cancelled).toEqual(got);
    });

    it('a start waits for a cancel still out, so a release keyed by hash stays up', async () => {
      const live = new Set<string>(['same-info-hash']);
      const held: (() => void)[] = [];
      const steps: MediumSteps = {
        medium: 'song',
        search: () =>
          Promise.resolve({ kind: 'picked', release: standInRelease('one'), others: [] }),
        import: () => Promise.resolve({ kind: 'arrived', ref: songsAlbum }),
        download: {
          start: () => {
            live.add('same-info-hash');
            return Promise.resolve({ hash: 'same-info-hash' });
          },
          poll: () => Promise.resolve({ kind: 'downloading', progress: 0.5 }),
          cancel: () =>
            new Promise<void>((resolve) => {
              held.push(() => {
                live.delete('same-info-hash');
                resolve();
              });
            }),
        },
      };
      const job = await serving(steps);
      const { id } = await ask('song');
      await until(job, id, 'downloading');
      await advanceRequests(job);
      const at = stored(id);
      const state = {
        status: 'failed',
        failedStep: 'downloading',
        reason: 'downloadFailed',
      } as const;
      saveRequest(db, id, { state }, clock, at.version);

      const retried = call('POST', `/${id}/retry`, 'ana');
      await vi.waitFor(() => expect(held).toHaveLength(1));
      const turn = advanceRequests(job);
      await new Promise((resolve) => setTimeout(resolve, 20));
      held[0]!();
      await Promise.all([retried, turn]);

      expect(stored(id).handle).toEqual({ hash: 'same-info-hash' });
      expect(live.has('same-info-hash')).toBe(true);
    });

    it('drops a download that started but whose answer was lost, when the request is cancelled', async () => {
      const steps = standInSteps('song', { polls: [{ kind: 'downloading', progress: 0.5 }] });
      const job = await serving(steps);
      const { id } = await ask('song');
      await until(job, id, 'downloading');
      const at = stored(id);
      saveRequest(db, id, { state: at.state, stepKey: 'lost-answer' }, clock);
      const upstream = await steps.download!.start(stored(id), at.release!, 'lost-answer');

      expect((await call('POST', `/${id}/cancel`, 'ana')).statusCode).toBe(200);
      expect(steps.cancelled).toEqual([upstream]);
    });

    it('a double-tapped retry never drops the download the first tap started again', async () => {
      const hash = { hash: 'same-info-hash' };
      const live = new Set<string>(['same-info-hash']);
      const held: (() => void)[] = [];
      const steps: MediumSteps = {
        medium: 'song',
        search: () =>
          Promise.resolve({ kind: 'picked', release: standInRelease('one'), others: [] }),
        import: () => Promise.resolve({ kind: 'arrived', ref: songsAlbum }),
        download: {
          start: () => {
            live.add(hash.hash);
            return Promise.resolve(hash);
          },
          poll: () => Promise.resolve({ kind: 'downloading', progress: 0.5 }),
          cancel: () =>
            new Promise<void>((resolve) => {
              held.push(() => {
                live.delete(hash.hash);
                resolve();
              });
            }),
        },
      };
      const job = await serving(steps);
      const { id } = await ask('song');
      await until(job, id, 'downloading');
      await advanceRequests(job);
      const at = stored(id);
      saveRequest(
        db,
        id,
        { state: { status: 'failed', failedStep: 'downloading', reason: 'downloadFailed' } },
        clock,
        at.version,
      );

      const first = call('POST', `/${id}/retry`, 'ana');
      const second = call('POST', `/${id}/retry`, 'ana');
      await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
      await new Promise((resolve) => setTimeout(resolve, 20));
      held.shift()!();
      await first;
      await advanceRequests(job);
      expect(live.has(hash.hash)).toBe(true);
      for (const release of held) release();
      await second;

      expect(stored(id).handle).toEqual(hash);
      expect(live.has(hash.hash)).toBe(true);
    });
  });
});
