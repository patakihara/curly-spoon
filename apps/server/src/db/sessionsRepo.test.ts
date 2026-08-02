import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { createSession, deleteSession, rotateSession, validateSession } from './sessionsRepo.js';
import { upsertUser } from './usersRepo.js';

describe('sessionsRepo', () => {
  it('validates a freshly created session and resolves it to the owning user', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    const session = createSession(db, user.id);

    const validated = validateSession(db, session.token);
    expect(validated?.userId).toBe(user.id);
    expect(validated?.shouldRotate).toBe(false);
  });

  it('never stores the raw token — only its hash is queryable', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    const session = createSession(db, user.id);

    const rows = db.prepare('SELECT id_hash FROM sessions').all() as Array<{ id_hash: string }>;
    expect(rows.some((row) => row.id_hash === session.token)).toBe(false);
  });

  it('rejects an unknown token', () => {
    const db = openDatabase(':memory:');
    expect(validateSession(db, 'not-a-real-token')).toBeNull();
  });

  it('rejects and cleans up an expired session', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    const session = createSession(db, user.id, -1); // already expired

    expect(validateSession(db, session.token)).toBeNull();
    const rows = db.prepare('SELECT * FROM sessions').all();
    expect(rows).toHaveLength(0);
  });

  it('flags a session nearing expiry for rotation', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    const session = createSession(db, user.id, 1000); // 1s TTL, well under the rotation threshold

    expect(validateSession(db, session.token)?.shouldRotate).toBe(true);
  });

  it('deletes a session so it can no longer be validated', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    const session = createSession(db, user.id);

    deleteSession(db, session.token);

    expect(validateSession(db, session.token)).toBeNull();
  });

  it('rotates a valid session to a new token, invalidating the old one', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    const session = createSession(db, user.id);

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
