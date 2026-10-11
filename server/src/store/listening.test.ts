import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HistoryEntry, MediaRef, QueueItem } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.js';
import { createDevice, deleteDevice } from './devices.js';
import {
  HISTORY_KEPT,
  listSessions,
  openSession,
  saveSession,
  StaleRevision,
  type SessionValue,
  type StoredSession,
} from './listening.js';
import { upsertUser } from './users.js';

const song: MediaRef = { source: 'jellyfin', id: '0123456789abcdef0123456789abcdef' };
const album: MediaRef = { source: 'jellyfin', id: 'fedcba9876543210fedcba9876543210' };
const book: MediaRef = { source: 'abs', id: 'book-1' };

const entry = (ref: MediaRef, chapter?: number): QueueItem => ({
  itemId: randomUUID(),
  ref,
  ...(chapter === undefined ? {} : { chapter }),
});

const value = (session: StoredSession): SessionValue => ({
  active: session.active,
  switchAfterCurrent: session.switchAfterCurrent,
  queueStyle: session.queueStyle,
  queues: session.queues,
  history: session.history,
});

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-listening-'));
  db = openDatabase(join(dir, 'auralis.db'));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function twoDevices() {
  const user = upsertUser(db, { username: 'kara', role: 'member' });
  const phone = createDevice(db, { userId: user.id, kind: 'android', name: 'Phone' });
  const laptop = createDevice(db, { userId: user.id, kind: 'web', name: 'Laptop' });
  return { user, phone, laptop };
}

describe('[M1.sessions/a] one listening session per device', () => {
  it('keeps two devices of one user in separate sessions and queues, across a restart', () => {
    const { user, phone, laptop } = twoDevices();
    const onPhone = openSession(db, user.id, phone.id, 1000)!;
    openSession(db, user.id, laptop.id, 1000);

    const queued = entry(song);
    saveSession(db, user.id, phone.id, onPhone.rev, {
      ...value(onPhone),
      queues: { ...onPhone.queues, music: { current: null, user: [queued], context: null } },
    });

    expect(openSession(db, user.id, phone.id)!.queues.music.user).toEqual([queued]);
    const laptopQueues = openSession(db, user.id, laptop.id)!.queues;
    expect(laptopQueues.music.user).toEqual([]);
    expect(laptopQueues.spoken.user).toEqual([]);

    db.close();
    db = openDatabase(join(dir, 'auralis.db'));
    expect(listSessions(db, user.id).map((s) => [s.deviceName, s.rev])).toEqual([
      ['Phone', 1],
      ['Laptop', 0],
    ]);
    expect(openSession(db, user.id, phone.id)!.queues.music.user).toEqual([queued]);
    expect(openSession(db, user.id, laptop.id)!.queues.music.user).toEqual([]);
  });

  it('deletes a device’s session, queues and history with the device, and nothing else', () => {
    const { user, phone, laptop } = twoDevices();
    for (const device of [phone, laptop]) {
      const session = openSession(db, user.id, device.id)!;
      saveSession(db, user.id, device.id, session.rev, {
        ...value(session),
        queues: { ...session.queues, spoken: { current: entry(book, 0), user: [], context: null } },
        history: [{ seq: 0, queue: 'music', ref: song, playedAt: 1 }],
      });
    }

    deleteDevice(db, user.id, phone.id);

    expect(listSessions(db, user.id).map((s) => s.deviceId)).toEqual([laptop.id]);
    const rows = (table: string) =>
      db.prepare(`SELECT DISTINCT device_id FROM ${table}`).all() as { device_id: string }[];
    expect(rows('queue_items')).toEqual([{ device_id: laptop.id }]);
    expect(rows('play_history')).toEqual([{ device_id: laptop.id }]);
  });

  it('never opens or lists a session on another user’s device', () => {
    const { user, phone } = twoDevices();
    const other = upsertUser(db, { username: 'sofia', role: 'member' });
    const own = openSession(db, user.id, phone.id)!;

    expect(openSession(db, other.id, phone.id)).toBeNull();
    expect(listSessions(db, other.id)).toEqual([]);
    expect(saveSession(db, other.id, phone.id, own.rev, value(own))).toBeNull();
    expect(openSession(db, user.id, phone.id)).toEqual(own);
  });
});

describe('a listening session in the store', () => {
  it('starts on first use with empty queues, music active, YouTube Music style, revision 0', () => {
    const { user, phone } = twoDevices();
    expect(listSessions(db, user.id)).toEqual([]);

    const session = openSession(db, user.id, phone.id, 1000);

    expect(session).toEqual({
      userId: user.id,
      deviceId: phone.id,
      active: 'music',
      switchAfterCurrent: null,
      queueStyle: 'youtube',
      queues: {
        music: { current: null, user: [], context: null },
        spoken: { current: null, user: [], context: null },
      },
      history: [],
      rev: 0,
      updatedAt: 1000,
    });
  });

  it('keeps everything a session holds, in order, and goes up one revision per write', () => {
    const { user, phone } = twoDevices();
    const session = openSession(db, user.id, phone.id, 1000)!;
    const written: SessionValue = {
      active: 'spoken',
      switchAfterCurrent: 'music',
      queueStyle: 'spotify',
      queues: {
        music: {
          current: entry(song),
          user: [entry(song), entry(album)],
          context: { from: album, items: [entry(song), entry(song)] },
        },
        spoken: { current: entry(book, 2), user: [entry(book, 3), entry(book, 4)], context: null },
      },
      history: [
        { seq: 0, queue: 'music', ref: song, playedAt: 10 },
        { seq: 1, queue: 'spoken', ref: book, chapter: 1, playedAt: 20 },
      ],
    };

    const saved = saveSession(db, user.id, phone.id, session.rev, written, 2000);

    expect(saved).toEqual({
      ...written,
      userId: user.id,
      deviceId: phone.id,
      rev: 1,
      updatedAt: 2000,
    });
    expect(openSession(db, user.id, phone.id)).toEqual(saved);
    expect(listSessions(db, user.id)).toEqual([
      {
        deviceId: phone.id,
        deviceName: 'Phone',
        active: 'spoken',
        switchAfterCurrent: 'music',
        queueStyle: 'spotify',
        currents: { music: written.queues.music.current, spoken: written.queues.spoken.current },
        rev: 1,
        updatedAt: 2000,
      },
    ]);
  });

  it('refuses a write made from an older revision, and keeps the newer one', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const first = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      active: 'spoken',
    });

    expect(() =>
      saveSession(db, user.id, phone.id, start.rev, { ...value(start), queueStyle: 'spotify' }),
    ).toThrow(StaleRevision);
    expect(openSession(db, user.id, phone.id)).toEqual(first);
  });

  it('keeps only the newest plays, and forgets one Back took off the end', () => {
    const { user, phone } = twoDevices();
    let session = openSession(db, user.id, phone.id)!;
    const plays = (from: number, to: number): HistoryEntry[] =>
      Array.from({ length: to - from }, (_, n) => ({
        seq: from + n,
        queue: 'music' as const,
        ref: song,
        playedAt: from + n,
      }));

    session = saveSession(db, user.id, phone.id, session.rev, {
      ...value(session),
      history: plays(0, HISTORY_KEPT + 20),
    })!;
    expect(session.history.map((h) => h.seq)).toEqual(
      plays(20, HISTORY_KEPT + 20).map((h) => h.seq),
    );

    session = saveSession(db, user.id, phone.id, session.rev, {
      ...value(session),
      history: session.history.slice(0, -1),
    })!;
    expect(session.history.at(-1)?.seq).toBe(HISTORY_KEPT + 18);
    expect(session.history).toHaveLength(HISTORY_KEPT - 1);
  });
});
