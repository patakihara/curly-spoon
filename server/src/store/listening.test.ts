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
  HistoryRewritten,
  listSessions,
  openSession,
  PositionWithoutItem,
  saveAutoplay,
  savePosition,
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
  autoplay: session.autoplay,
  radio: session.radio,
  autoplayAt: session.autoplayAt,
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
      queues: {
        ...onPhone.queues,
        music: { current: null, position: null, user: [queued], context: null },
      },
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

  it('deletes a device’s session, queues, history and autoplay picks with the device, and nothing else', () => {
    const { user, phone, laptop } = twoDevices();
    for (const device of [phone, laptop]) {
      const session = openSession(db, user.id, device.id)!;
      saveSession(db, user.id, device.id, session.rev, {
        ...value(session),
        queues: {
          ...session.queues,
          spoken: { current: entry(book, 0), position: null, user: [], context: null },
        },
        history: [{ seq: 0, queue: 'music', ref: song, playedAt: 1 }],
        autoplay: { music: { after: { ref: song }, next: { ref: album } }, spoken: null },
        radio: { seed: song, tracks: [album] },
      });
    }

    deleteDevice(db, user.id, phone.id);

    expect(listSessions(db, user.id).map((s) => s.deviceId)).toEqual([laptop.id]);
    const rows = (table: string) =>
      db.prepare(`SELECT DISTINCT device_id FROM ${table}`).all() as { device_id: string }[];
    expect(rows('queue_items')).toEqual([{ device_id: laptop.id }]);
    expect(rows('play_history')).toEqual([{ device_id: laptop.id }]);
    expect(rows('autoplay_picks')).toEqual([{ device_id: laptop.id }]);
    expect(rows('radio_tracks')).toEqual([{ device_id: laptop.id }]);
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
        music: { current: null, position: null, user: [], context: null },
        spoken: { current: null, position: null, user: [], context: null },
      },
      history: [],
      autoplay: { music: null, spoken: null },
      radio: null,
      autoplayAt: null,
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
          current: { ...entry(song), replayOf: 0 },
          position: null,
          user: [
            { ...entry(song), walk: -1, replayOf: 0 },
            { ...entry(album), walk: 0, position: { ms: 4_000, takenAt: 1200 } },
            entry(song),
          ],
          context: { from: { kind: 'album', ref: album }, items: [entry(song), entry(song)] },
        },
        spoken: {
          current: { ...entry(book, 2), after: 1 },
          position: { ms: 61_000, takenAt: 1500 },
          user: [entry(book, 3), entry(book, 4)],
          context: null,
        },
      },
      history: [
        { seq: 0, queue: 'music', ref: song, playedAt: 10 },
        { seq: 1, queue: 'spoken', ref: book, chapter: 1, playedAt: 20, after: 0 },
      ],
      autoplay: {
        music: { after: { ref: song }, next: { ref: album } },
        spoken: { after: { ref: book, chapter: 2 }, next: null },
      },
      radio: { seed: song, tracks: [album, song] },
      autoplayAt: 1500,
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
        currents: {
          music: { itemId: written.queues.music.current!.itemId, ref: song },
          spoken: { itemId: written.queues.spoken.current!.itemId, ref: book, chapter: 2 },
        },
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

  const plays = (from: number, to: number): HistoryEntry[] =>
    Array.from({ length: to - from }, (_, n) => ({
      seq: from + n,
      queue: 'music' as const,
      ref: song,
      playedAt: from + n,
    }));

  it('keeps only the newest plays, forgetting the oldest only as new plays push them out', () => {
    const { user, phone } = twoDevices();
    let session = openSession(db, user.id, phone.id)!;

    session = saveSession(db, user.id, phone.id, session.rev, {
      ...value(session),
      history: plays(0, HISTORY_KEPT + 20),
    })!;
    expect(session.history.map((h) => h.seq)).toEqual(
      plays(20, HISTORY_KEPT + 20).map((h) => h.seq),
    );

    session = saveSession(db, user.id, phone.id, session.rev, {
      ...value(session),
      history: [...session.history.slice(1), ...plays(HISTORY_KEPT + 20, HISTORY_KEPT + 21)],
    })!;
    expect(session.history.map((h) => h.seq)).toEqual(
      plays(21, HISTORY_KEPT + 21).map((h) => h.seq),
    );

    const overTrimmed = [
      ...session.history.slice(2),
      ...plays(HISTORY_KEPT + 21, HISTORY_KEPT + 22),
    ];
    expect(() =>
      saveSession(db, user.id, phone.id, session.rev, { ...value(session), history: overTrimmed }),
    ).toThrow(HistoryRewritten);
    expect(openSession(db, user.id, phone.id)).toEqual(session);
  });

  it('keeps every play when Back walks the history: replays are marked, no play is forgotten', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const played = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      history: plays(0, 3),
    })!;

    const music = {
      current: { ...entry(song), replayOf: 1 },
      position: null,
      user: [{ ...entry(song), walk: 0, replayOf: 2 }],
      context: null,
    };
    const walked = saveSession(db, user.id, phone.id, played.rev, {
      ...value(played),
      queues: { ...played.queues, music },
    })!;

    expect(openSession(db, user.id, phone.id)!.history).toEqual(plays(0, 3));
    expect(openSession(db, user.id, phone.id)!.queues.music).toEqual(music);
    for (const removed of [plays(0, 2), [...plays(0, 1), ...plays(2, 3)], []]) {
      expect(() =>
        saveSession(db, user.id, phone.id, walked.rev, { ...value(walked), history: removed }),
      ).toThrow(HistoryRewritten);
    }
    expect(openSession(db, user.id, phone.id)).toEqual(walked);
  });

  it('takes an unchanged play back whether its missing chapter is left out or undefined', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const played = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      history: plays(0, 2),
    })!;

    const resaved = saveSession(db, user.id, phone.id, played.rev, {
      ...value(played),
      history: played.history.map((h) => ({ ...h, chapter: undefined })),
    });

    expect(resaved?.history).toEqual(plays(0, 2));
  });

  it('refuses a save that edits a stored play, reuses its number or adds an older one', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const played = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      history: [
        { seq: 0, queue: 'music', ref: song, playedAt: 10 },
        { seq: 1, queue: 'music', ref: album, playedAt: 20 },
      ],
    })!;

    const edited = [played.history[0]!, { ...played.history[1]!, ref: song }];
    expect(() =>
      saveSession(db, user.id, phone.id, played.rev, { ...value(played), history: edited }),
    ).toThrow(HistoryRewritten);
    const relinked = [played.history[0]!, { ...played.history[1]!, after: 0 }];
    expect(() =>
      saveSession(db, user.id, phone.id, played.rev, { ...value(played), history: relinked }),
    ).toThrow(HistoryRewritten);

    const reused: HistoryEntry[] = [
      played.history[0]!,
      { seq: 1, queue: 'spoken', ref: book, chapter: 0, playedAt: 30 },
    ];
    expect(() =>
      saveSession(db, user.id, phone.id, played.rev, { ...value(played), history: reused }),
    ).toThrow(HistoryRewritten);

    const gapped = saveSession(db, user.id, phone.id, played.rev, {
      ...value(played),
      history: [...played.history, { seq: 3, queue: 'music', ref: song, playedAt: 30 }],
    })!;
    expect(() =>
      saveSession(db, user.id, phone.id, gapped.rev, {
        ...value(gapped),
        history: [...gapped.history, { seq: 2, queue: 'music', ref: album, playedAt: 40 }],
      }),
    ).toThrow(HistoryRewritten);

    expect(openSession(db, user.id, phone.id)).toEqual(gapped);
  });

  it('keeps what a queue is playing from after its list runs out', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const from = { kind: 'album' as const, ref: album };
    const playing = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      queueStyle: 'spotify',
      queues: {
        ...start.queues,
        music: {
          current: entry(song),
          position: null,
          user: [],
          context: { from, items: [entry(song)] },
        },
      },
    })!;

    const ranOut = saveSession(db, user.id, phone.id, playing.rev, {
      ...value(playing),
      queues: {
        ...playing.queues,
        music: { ...playing.queues.music, context: { from, items: [] } },
      },
    })!;

    expect(ranOut.queues.music.context).toEqual({ from, items: [] });
    expect(openSession(db, user.id, phone.id)!.queues.music.context).toEqual({ from, items: [] });
  });

  it('keeps autoplay’s picks and radio run until the session drops them', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const picked = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      autoplay: { music: { after: { ref: song }, next: { ref: album } }, spoken: null },
      radio: { seed: song, tracks: [] },
    })!;
    expect(openSession(db, user.id, phone.id)!.radio).toEqual({ seed: song, tracks: [] });

    saveSession(db, user.id, phone.id, picked.rev, {
      ...value(picked),
      autoplay: { music: null, spoken: { after: { ref: book, chapter: 9 }, next: null } },
      radio: null,
    });

    const read = openSession(db, user.id, phone.id)!;
    expect(read.autoplay).toEqual({
      music: null,
      spoken: { after: { ref: book, chapter: 9 }, next: null },
    });
    expect(read.radio).toBeNull();
  });

  it('keeps the device’s last position in its current item, and never one without an item', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const position = { ms: 125_000, takenAt: 4000 };
    const saved = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      queues: {
        ...start.queues,
        music: { current: entry(song), position, user: [], context: null },
      },
    })!;

    expect(openSession(db, user.id, phone.id)!.queues.music.position).toEqual(position);
    expect(() =>
      saveSession(db, user.id, phone.id, saved.rev, {
        ...value(saved),
        queues: { ...saved.queues, spoken: { current: null, position, user: [], context: null } },
      }),
    ).toThrow(PositionWithoutItem);
    expect(openSession(db, user.id, phone.id)).toEqual(saved);
  });

  it('keeps a position for the current item it was taken in, leaving the revision alone', () => {
    const { user, phone, laptop } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const playing = entry(song);
    const saved = saveSession(db, user.id, phone.id, start.rev, {
      ...value(start),
      queues: {
        ...start.queues,
        music: { current: playing, position: null, user: [], context: null },
      },
    })!;
    const position = { ms: 61_000, takenAt: 7000 };

    expect(savePosition(db, user.id, phone.id, 'music', playing.itemId, position)).toBe(true);
    expect(
      savePosition(db, user.id, phone.id, 'music', randomUUID(), { ms: 1, takenAt: 8000 }),
    ).toBe(false);
    expect(savePosition(db, user.id, laptop.id, 'music', playing.itemId, position)).toBe(false);
    const other = upsertUser(db, { username: 'otto', role: 'member' });
    expect(savePosition(db, other.id, phone.id, 'music', playing.itemId, position)).toBe(false);

    const read = openSession(db, user.id, phone.id)!;
    expect(read.queues.music.position).toEqual(position);
    expect(read.rev).toBe(saved.rev);
  });

  it('keeps autoplay worked out from the current revision, leaving it alone, and drops a stale one', () => {
    const { user, phone } = twoDevices();
    const start = openSession(db, user.id, phone.id)!;
    const picks = {
      autoplay: { music: { after: { ref: song }, next: { ref: album } }, spoken: null },
      radio: { seed: song, tracks: [album] },
      autoplayAt: 9000,
    };

    expect(saveAutoplay(db, user.id, phone.id, start.rev, picks)).toBe(true);
    const read = openSession(db, user.id, phone.id)!;
    expect(read.rev).toBe(start.rev);
    expect({ autoplay: read.autoplay, radio: read.radio, autoplayAt: read.autoplayAt }).toEqual(
      picks,
    );

    const moved = saveSession(db, user.id, phone.id, read.rev, {
      ...value(read),
      active: 'spoken',
    })!;
    const stale = { autoplay: { music: null, spoken: null }, radio: null, autoplayAt: 10_000 };
    expect(saveAutoplay(db, user.id, phone.id, start.rev, stale)).toBe(false);
    expect(openSession(db, user.id, phone.id)).toEqual(moved);
    const other = upsertUser(db, { username: 'otto', role: 'member' });
    expect(saveAutoplay(db, other.id, phone.id, moved.rev, stale)).toBe(false);
  });
});
