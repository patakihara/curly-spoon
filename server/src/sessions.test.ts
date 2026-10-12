/**
 * Listening sessions and their queues through the real routes. The library index holds the
 * recorded album (its fourteen tracks), a track of the second recorded album, and the recorded
 * four-file book. Audiobookshelf answers from the recordings of that book (its chapters, its
 * direct-play session, a sync, a close and a progress read); Jellyfin from the recordings of the
 * album and its first track played. Replay matches a call by method and path. Autoplay works its
 * picks out in the background, so a test waits for them in the store.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ListeningSession, MediaRef, PlaybackPlan, Queue } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemSummarySchema } from './adapters/audiobookshelf/schemas.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { indexQueryResultSchema } from './adapters/jellyfin/schemas.js';
import { buildApp } from './app.js';
import { absTree, albumRow, trackRows } from './libraryIndex/rows.js';
import { applyTree, emptyCounts } from './libraryIndex/store.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { openSession, savePosition } from './store/listening.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const recording = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const json = (r: Recording) => (r.response.body as { json: unknown }).json;

const abs = (call: string) => recording('audiobookshelf', call);
const jf = (call: string) => recording('jellyfin', call);

const albumTracks = indexQueryResultSchema.parse(json(jf('index-album-tracks-1'))).Items;
const otherTracks = indexQueryResultSchema.parse(json(jf('index-album-tracks-2'))).Items;
const albumSummary = indexQueryResultSchema
  .parse(json(jf('index-albums-page')))
  .Items.find((a) => a.Id === albumTracks[0]!.AlbumId)!;
const book = itemSummarySchema.parse(json(abs('multi-detail')));
const progressRead = json(abs('progress-read')) as { currentTime: number; lastUpdate: number };

const ref = (source: MediaRef['source'], id: string): MediaRef => ({ source, id });
const album = ref('jellyfin', albumSummary.Id);
const tracks = albumTracks.map((t) => ref('jellyfin', t.Id));
const lone = ref('jellyfin', otherTracks[0]!.Id);
const bookRef = ref('abs', book.id);
/** The recorded book's chapters, from its recorded answer. */
const bookChapters = (json(abs('multi-detail')) as { media: { chapters: unknown[] } }).media
  .chapters.length;

/** After the recorded progress read, so a position this device keeps now is the newer. */
const NOW = progressRead.lastUpdate + 60_000;
const KEY = Buffer.alloc(32, 7);

const RECORDINGS = [
  // The book's chapters, read as `GET /api/items/{id}?expanded=1`, and a listen to it.
  abs('multi-detail'),
  abs('progress-play'),
  abs('progress-sync'),
  abs('progress-close'),
  abs('progress-read'),
  // A book the index does not hold, played.
  abs('item-play'),
  abs('session-close'),
  // The album and its first track, planned and played.
  jf('jf-album'),
  jf('jf-album-tracks'),
  jf('jf-track'),
  jf('jf-playing'),
  jf('jf-progress'),
  jf('jf-stopped'),
];

let dirs: string[] = [];
let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

function indexed(db: Db): void {
  const counts = emptyCounts();
  applyTree(
    db,
    { top: albumRow(albumSummary), children: trackRows(album.id, albumTracks) },
    1,
    counts,
  );
  applyTree(
    db,
    {
      top: albumRow({ ...albumSummary, Id: otherTracks[0]!.AlbumId! }),
      children: trackRows(otherTracks[0]!.AlbumId!, otherTracks.slice(0, 1)),
    },
    1,
    counts,
  );
  applyTree(db, absTree(book), 1, counts);
}

/** kara on her phone and her laptop, and otto on his phone, each linked to both upstreams. */
function people(db: Db) {
  const bearer: Record<string, string> = {};
  const devices: Record<string, string> = {};
  const users: Record<string, string> = {};
  for (const [name, device] of [
    ['kara', 'phone'],
    ['kara', 'laptop'],
    ['otto', 'phone'],
  ] as const) {
    const user = upsertUser(db, { username: name, role: 'member' });
    users[name] = user.id;
    for (const service of ['abs', 'jellyfin'] as const) {
      saveLink(db, KEY, {
        userId: user.id,
        service,
        upstreamUserId: `${service}-${name}`,
        token: `${service}-token-${name}`,
        state: 'linked',
      });
    }
    const made = createDevice(db, { userId: user.id, kind: 'web', name: device });
    devices[`${name}-${device}`] = made.id;
    bearer[`${name}-${device}`] = createSession(db, {
      userId: user.id,
      deviceId: made.id,
      kind: 'bearer',
    }).token;
  }
  return { bearer, devices, users };
}

async function appOn(db: Db, fetch: FetchLike) {
  const app = await buildApp({
    webDistDir: null,
    db,
    now: () => NOW,
    upstreams: {
      key: KEY,
      config: { absUrl: PLACEHOLDER_ORIGIN, jellyfinUrl: 'http://jellyfin.upstream.invalid' },
      fetch,
    },
  });
  apps.push(app);
  return app;
}

async function server() {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-sessions-'));
  dirs.push(dir);
  const file = join(dir, 'auralis.db');
  const db = openDatabase(file);
  indexed(db);
  const { bearer, devices, users } = people(db);
  const sent: string[] = [];
  const replay = replayFetch(RECORDINGS);
  const fetch: FetchLike = (url, init) => {
    sent.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
    return replay(url, init);
  };
  let app = await appOn(db, fetch);

  const call = (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${bearer[who] ?? ''}` },
      ...(payload === undefined ? {} : { payload }),
    });
  const ok = async <T>(res: Promise<{ statusCode: number; body: string; json(): unknown }>) => {
    const answer = await res;
    expect(answer.statusCode, answer.body).toBe(200);
    return answer.json() as T;
  };
  const queue = (who: string, type: 'music' | 'spoken') =>
    ok<Queue>(call(who, 'GET', `/api/queues/${type}`));
  const put = (who: string, ref: MediaRef, how: string, extra: object = {}) =>
    call(who, 'POST', `/api/queues/${ref.source === 'abs' ? 'spoken' : 'music'}/items`, {
      ref,
      how,
      ...extra,
    });
  const stepped = (who: string, direction: 'next' | 'back') =>
    ok<ListeningSession>(call(who, 'POST', '/api/sessions/this/step', { direction }));
  const play = (who: string, item: MediaRef) =>
    ok<PlaybackPlan>(call(who, 'POST', '/api/play', { ref: item }));
  const stored = (who: string) => {
    const [name] = who.split('-') as [string];
    return openSession(db, users[name]!, devices[who]!)!;
  };
  /** Waits for autoplay, worked out in the background, to have a music pick for `who`. */
  const autoplayed = (who: string) =>
    vi.waitFor(() => expect(stored(who).autoplay.music?.next).toBeTruthy());

  /** A new app on the same database file, as after a restart. */
  const restart = async () => {
    await app.close();
    db.close();
    const reopened = openDatabase(file);
    app = await appOn(reopened, fetch);
    return reopened;
  };
  return { db, sent, call, ok, queue, put, stepped, play, stored, autoplayed, restart };
}

const refs = (items: { ref: MediaRef }[]) => items.map((i) => i.ref);

describe('[M1.sessions/a] one listening session per device, through the API', () => {
  it('[M1.sessions/a] keeps two devices of one user in separate sessions and queues, across a restart', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    await s.ok(s.put('kara-phone', lone, 'next'));

    const phone = await s.queue('kara-phone', 'music');
    expect(phone.current?.ref).toEqual(tracks[0]);
    expect(refs(phone.user)).toEqual([lone, ...tracks.slice(1)]);
    const laptop = await s.queue('kara-laptop', 'music');
    expect(laptop.current).toBeNull();
    expect(laptop.user).toEqual([]);

    await s.ok(s.put('kara-laptop', bookRef, 'now'));
    expect((await s.queue('kara-phone', 'spoken')).current).toBeNull();

    const listed = await s.ok<{ sessions: ListeningSession[] }>(
      s.call('kara-phone', 'GET', '/api/sessions'),
    );
    expect(
      listed.sessions.map((x) => ({
        device: x.deviceName,
        thisDevice: x.thisDevice,
        active: x.active,
        music: x.currents.music?.ref ?? null,
        spoken: x.currents.spoken?.ref ?? null,
      })),
    ).toEqual([
      { device: 'phone', thisDevice: true, active: 'music', music: tracks[0], spoken: null },
      { device: 'laptop', thisDevice: false, active: 'spoken', music: null, spoken: bookRef },
    ]);

    await s.restart();
    expect(await s.queue('kara-phone', 'music')).toEqual(phone);
    expect((await s.queue('kara-laptop', 'spoken')).current?.ref).toEqual(bookRef);
    expect((await s.queue('kara-laptop', 'music')).user).toEqual([]);
  });

  it('never reaches another person’s device: their list, queues and steps are their own', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    const before = s.stored('kara-phone');

    const theirs = await s.ok<{ sessions: ListeningSession[] }>(
      s.call('otto-phone', 'GET', '/api/sessions'),
    );
    expect(theirs.sessions.map((x) => x.deviceName)).toEqual([]);
    expect((await s.queue('otto-phone', 'music')).current).toBeNull();
    await s.stepped('otto-phone', 'next');
    await s.ok(s.call('otto-phone', 'PUT', '/api/sessions/this/active', { queue: 'spoken' }));
    await s.ok(s.call('otto-phone', 'PUT', '/api/sessions/this/style', { queueStyle: 'spotify' }));

    const after = s.stored('kara-phone');
    expect({ ...after, autoplay: null, autoplayAt: null, radio: null }).toEqual({
      ...before,
      autoplay: null,
      autoplayAt: null,
      radio: null,
    });
    const ottos = await s.ok<{ sessions: ListeningSession[] }>(
      s.call('otto-phone', 'GET', '/api/sessions'),
    );
    expect(ottos.sessions.map((x) => [x.deviceName, x.thisDevice, x.queueStyle])).toEqual([
      ['phone', true, 'spotify'],
    ]);
  });
});

describe('changing a queue through the API', () => {
  it('answers 409 to a change made from an older revision, and keeps the newer queue', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    const seen = await s.queue('kara-phone', 'music');
    await s.ok(s.put('kara-phone', lone, 'end', { rev: seen.rev }));
    const newer = await s.queue('kara-phone', 'music');

    const late = await s.call('kara-phone', 'PUT', '/api/queues/music', {
      rev: seen.rev,
      user: [],
    });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'stale_revision' });
    for (const [method, url, payload] of [
      ['POST', '/api/queues/music/items', { ref: lone, how: 'next', rev: seen.rev }],
      ['POST', '/api/sessions/this/step', { direction: 'next', rev: seen.rev }],
      ['PUT', '/api/sessions/this/active', { queue: 'spoken', rev: seen.rev }],
      ['PUT', '/api/sessions/this/style', { queueStyle: 'spotify', rev: seen.rev }],
    ] as const) {
      expect((await s.call('kara-phone', method, url, payload)).statusCode, url).toBe(409);
    }
    expect(await s.queue('kara-phone', 'music')).toEqual(newer);
  });

  it('reorders and removes your queue’s entries by id, refusing an id it does not hold', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    const q = await s.queue('kara-phone', 'music');
    const [second, third, ...rest] = q.user;
    const kept = [third!, second!, ...rest.slice(0, 2)];

    const changed = await s.ok<Queue>(
      s.call('kara-phone', 'PUT', '/api/queues/music', {
        rev: q.rev,
        user: kept.map((i) => i.itemId),
      }),
    );
    expect(changed.user).toEqual(kept);
    expect(changed.current).toEqual(q.current);
    expect(changed.rev).toBe(q.rev + 1);

    const unknown = await s.call('kara-phone', 'PUT', '/api/queues/music', {
      rev: changed.rev,
      user: [q.current!.itemId],
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ error: 'unknown_item' });
  });

  it('puts an item only into its own queue, and refuses one the index does not hold', async () => {
    const s = await server();
    const wrong = await s.call('kara-phone', 'POST', '/api/queues/spoken/items', {
      ref: album,
      how: 'now',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toEqual({ error: 'wrong_queue' });
    const missing = await s.call('kara-phone', 'POST', '/api/queues/spoken/items', {
      ref: ref('abs', 'not-indexed'),
      how: 'now',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('enters a book as its chapters, read from Audiobookshelf as the person', async () => {
    const s = await server();
    const q = await s.ok<Queue>(s.put('kara-phone', bookRef, 'now'));
    expect(q.current).toMatchObject({ ref: bookRef, chapter: 0 });
    expect(q.user.map((i) => i.chapter)).toEqual(
      Array.from({ length: bookChapters - 1 }, (_, n) => n + 1),
    );
    expect(s.sent).toContain(`GET /api/items/${book.id}`);
  });
});

describe('stepping through the API', () => {
  it('autoplays the rest of the album when the queue runs out', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    const q = await s.queue('kara-phone', 'music');
    await s.ok(s.call('kara-phone', 'PUT', '/api/queues/music', { rev: q.rev, user: [] }));
    await s.autoplayed('kara-phone');

    const next = await s.stepped('kara-phone', 'next');
    expect(next.currents.music?.ref).toEqual(tracks[1]);
    const back = await s.stepped('kara-phone', 'back');
    expect(back.currents.music?.ref).toEqual(tracks[0]);
  });

  it('switches the controls to the other queue, pausing this one, and sets the queue style', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    await s.ok(s.put('kara-phone', bookRef, 'end'));
    const switched = await s.ok<ListeningSession>(
      s.call('kara-phone', 'PUT', '/api/sessions/this/active', { queue: 'spoken' }),
    );
    expect(switched.active).toBe('spoken');
    expect(switched.currents.music?.ref).toEqual(tracks[0]);
    expect(switched.currents.spoken).toMatchObject({ ref: bookRef, chapter: 0 });
    const styled = await s.ok<ListeningSession>(
      s.call('kara-phone', 'PUT', '/api/sessions/this/style', { queueStyle: 'spotify' }),
    );
    expect(styled.queueStyle).toBe('spotify');
  });
});

describe('POST /api/play keeps the session', () => {
  it('makes the item current, and names the queue’s next item past what the plan plays', async () => {
    const s = await server();
    const planned = await s.play('kara-phone', album);
    expect(planned.next).toBeUndefined();
    const q = await s.queue('kara-phone', 'music');
    expect(q.current?.ref).toEqual(tracks[0]);
    expect(refs(q.user)).toEqual(tracks.slice(1));

    await s.ok(s.put('kara-phone', lone, 'end'));
    const again = await s.play('kara-phone', album);
    expect(again.next).toEqual(lone);
    expect((await s.queue('kara-phone', 'music')).current?.ref).toEqual(tracks[0]);
  });

  it('steps on to an item the queue has next, recording the one before as played', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', lone, 'now'));
    await s.ok(s.put('kara-phone', tracks[0]!, 'next'));
    await s.play('kara-phone', tracks[0]!);

    const after = s.stored('kara-phone');
    expect(after.queues.music.current?.ref).toEqual(tracks[0]);
    expect(after.queues.music.user).toEqual([]);
    expect(after.history.map((h) => h.ref)).toEqual([lone]);
  });

  it('names autoplay’s kept pick as next when the queue has nothing after the item', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    const q = await s.queue('kara-phone', 'music');
    await s.ok(s.call('kara-phone', 'PUT', '/api/queues/music', { rev: q.rev, user: [] }));
    await s.autoplayed('kara-phone');

    expect((await s.play('kara-phone', tracks[0]!)).next).toEqual(tracks[1]);
  });

  it('starts where this device left off when that is newer than the upstream’s progress', async () => {
    const s = await server();
    const first = await s.play('kara-phone', bookRef);
    const current = s.stored('kara-phone').queues.spoken.current!;
    expect(current).toMatchObject({ ref: bookRef, chapter: 0 });
    const kara = s.stored('kara-phone');

    savePosition(s.db, kara.userId, kara.deviceId, 'spoken', current.itemId, {
      ms: 90_000,
      takenAt: progressRead.lastUpdate + 1,
    });
    expect((await s.play('kara-phone', bookRef)).startAt).toBe(90);
    savePosition(s.db, kara.userId, kara.deviceId, 'spoken', current.itemId, {
      ms: 90_000,
      takenAt: progressRead.lastUpdate - 1,
    });
    expect((await s.play('kara-phone', bookRef)).startAt).toBe(progressRead.currentTime);
    expect(first.startAt).toBe(0);
  });

  it('keeps a progress report’s position on the session; a read takes the newer of it and upstream', async () => {
    const s = await server();
    const { playId } = (await s.play('kara-phone', bookRef)).progressTarget;
    const taken = await s.ok<{ taken: boolean }>(
      s.call('kara-phone', 'POST', '/api/progress', {
        playId,
        seq: 0,
        position: 15,
        listened: 15,
        paused: false,
      }),
    );
    expect(taken.taken).toBe(true);
    expect((await s.queue('kara-phone', 'spoken')).position).toEqual({ ms: 15_000, takenAt: NOW });

    const kara = s.stored('kara-phone');
    savePosition(s.db, kara.userId, kara.deviceId, 'spoken', kara.queues.spoken.current!.itemId, {
      ms: 5_000,
      takenAt: progressRead.lastUpdate - 1,
    });
    expect((await s.queue('kara-phone', 'spoken')).position).toEqual({
      ms: progressRead.currentTime * 1000,
      takenAt: progressRead.lastUpdate,
    });
  });

  it('leaves the session alone for an item the index does not hold, naming nothing next', async () => {
    const s = await server();
    await s.ok(s.put('kara-phone', album, 'now'));
    const before = s.stored('kara-phone');

    const unindexed = ref('abs', abs('item-play').request.path.split('/')[3]!);
    const planned = await s.play('kara-phone', unindexed);
    expect(planned.next).toBeUndefined();
    const after = s.stored('kara-phone');
    expect([after.rev, after.queues]).toEqual([before.rev, before.queues]);
  });
});
