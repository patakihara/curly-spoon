import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from './connection.js';
import {
  createSession,
  deleteSession,
  rotateSession,
  startSessionSweep,
  sweepExpiredSessions,
  validateSession,
} from './sessions.js';
import { createDevice, deleteDevice } from './devices.js';
import { upsertUser } from './users.js';

function withUser() {
  const db = openDatabase(':memory:');
  const user = upsertUser(db, { username: 'kara', role: 'member' });
  const device = createDevice(db, { userId: user.id, kind: 'web' });
  const on = { userId: user.id, deviceId: device.id };
  return { db, user, device, on };
}

describe('sessions', () => {
  it('validates a freshly created session and resolves it to the owning user', () => {
    const { db, user, on } = withUser();
    const session = createSession(db, on);

    const validated = validateSession(db, session.token);
    expect(validated?.userId).toBe(user.id);
    expect(validated?.shouldRotate).toBe(false);
  });

  it('never stores the raw token, only its hash', () => {
    const { db, on } = withUser();
    const session = createSession(db, on);

    const rows = db.prepare('SELECT id_hash FROM sessions').all() as { id_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows.some((row) => row.id_hash === session.token)).toBe(false);
  });

  it('rejects an unknown token', () => {
    const db = openDatabase(':memory:');
    expect(validateSession(db, 'not-a-real-token')).toBeNull();
  });

  it('rejects and cleans up an expired session', () => {
    const { db, on } = withUser();
    const session = createSession(db, { ...on, ttlMs: -1 });

    expect(validateSession(db, session.token)).toBeNull();
    expect(db.prepare('SELECT * FROM sessions').all()).toHaveLength(0);
  });

  it('flags a session past half its lifetime for rotation', () => {
    const { db, on } = withUser();
    const session = createSession(db, { ...on, ttlMs: 1000 });

    expect(validateSession(db, session.token)?.shouldRotate).toBe(true);
  });

  it('deletes a session so it can no longer be validated', () => {
    const { db, on } = withUser();
    const session = createSession(db, on);

    deleteSession(db, session.token);

    expect(validateSession(db, session.token)).toBeNull();
  });

  it('rotates a valid session to a new token, invalidating the old one', () => {
    const { db, user, on } = withUser();
    const session = createSession(db, on);

    const rotated = rotateSession(db, session.token);

    expect(rotated).not.toBeNull();
    expect(rotated?.token).not.toBe(session.token);
    expect(validateSession(db, session.token)).toBeNull();
    expect(validateSession(db, rotated!.token)?.userId).toBe(user.id);
  });

  it('returns null when rotating an invalid session', () => {
    const db = openDatabase(':memory:');
    expect(rotateSession(db, 'garbage')).toBeNull();
  });
});

describe('[M0.sso/b] sessions on devices', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('resolves a session to its device as well as its user', () => {
    const { db, device, on } = withUser();
    expect(validateSession(db, createSession(db, on).token)?.deviceId).toBe(device.id);
  });

  it('refuses a cookie value sent as a bearer token, and the other way round', () => {
    const { db, on } = withUser();
    const cookie = createSession(db, on);
    const bearer = createSession(db, { ...on, kind: 'bearer' });
    expect(validateSession(db, cookie.token, 'bearer')).toBeNull();
    expect(validateSession(db, bearer.token, 'cookie')).toBeNull();
    expect(validateSession(db, bearer.token, 'bearer')).not.toBeNull();
  });

  it('slides a bearer token 90 days from each use, and never asks to rotate it', () => {
    const { db, on } = withUser();
    const t0 = 1_800_000_000_000;
    const bearer = createSession(db, { ...on, kind: 'bearer', now: t0 });
    expect(bearer.expiresAt).toBe(t0 + 90 * DAY);
    const later = validateSession(db, bearer.token, 'bearer', t0 + 80 * DAY);
    expect(later?.expiresAt).toBe(t0 + 170 * DAY);
    expect(later?.shouldRotate).toBe(false);
    expect(validateSession(db, bearer.token, 'bearer', t0 + 169 * DAY)).not.toBeNull();
  });

  it('ends every session on a device when the device is deleted, and only those', () => {
    const { db, user, on } = withUser();
    const other = createDevice(db, { userId: user.id, kind: 'android' });
    const here = createSession(db, on);
    const there = createSession(db, { userId: user.id, deviceId: other.id, kind: 'bearer' });
    expect(deleteDevice(db, user.id, on.deviceId)).toBe(true);
    expect(validateSession(db, here.token)).toBeNull();
    expect(validateSession(db, there.token, 'bearer')).not.toBeNull();
  });
});

describe('sweeping expired sessions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const count = (db: ReturnType<typeof openDatabase>) =>
    db.prepare('SELECT * FROM sessions').all().length;

  it('removes only the sessions that have expired by the given time', () => {
    const { db, user, on } = withUser();
    createSession(db, { ...on, ttlMs: 1_000 });
    const kept = createSession(db, { ...on, ttlMs: 60_000 });

    expect(sweepExpiredSessions(db, Date.now() + 2_000)).toBe(1);
    expect(count(db)).toBe(1);
    expect(validateSession(db, kept.token)?.userId).toBe(user.id);
  });

  it('sweeps once at start and then every hour, until stopped', () => {
    vi.useFakeTimers();
    const { db, on } = withUser();
    let clock = Date.now();
    createSession(db, { ...on, ttlMs: 1_000 });
    createSession(db, { ...on, ttlMs: 2 * 60 * 60 * 1000 });

    clock += 5_000;

    const stop = startSessionSweep(db, { now: () => clock });
    expect(count(db)).toBe(1);

    clock += 3 * 60 * 60 * 1000;
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(count(db)).toBe(1);
    vi.advanceTimersByTime(60 * 1000);
    expect(count(db)).toBe(0);

    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
