import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { createSession, deleteSession, rotateSession, validateSession } from './sessions.js';
import { upsertUser } from './users.js';

function withUser() {
  const db = openDatabase(':memory:');
  const user = upsertUser(db, { username: 'kara', role: 'member' });
  return { db, user };
}

describe('sessions', () => {
  it('validates a freshly created session and resolves it to the owning user', () => {
    const { db, user } = withUser();
    const session = createSession(db, user.id);

    const validated = validateSession(db, session.token);
    expect(validated?.userId).toBe(user.id);
    expect(validated?.shouldRotate).toBe(false);
  });

  it('never stores the raw token, only its hash', () => {
    const { db, user } = withUser();
    const session = createSession(db, user.id);

    const rows = db.prepare('SELECT id_hash FROM sessions').all() as { id_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows.some((row) => row.id_hash === session.token)).toBe(false);
  });

  it('rejects an unknown token', () => {
    const db = openDatabase(':memory:');
    expect(validateSession(db, 'not-a-real-token')).toBeNull();
  });

  it('rejects and cleans up an expired session', () => {
    const { db, user } = withUser();
    const session = createSession(db, user.id, -1);

    expect(validateSession(db, session.token)).toBeNull();
    expect(db.prepare('SELECT * FROM sessions').all()).toHaveLength(0);
  });

  it('flags a session past half its lifetime for rotation', () => {
    const { db, user } = withUser();
    const session = createSession(db, user.id, 1000);

    expect(validateSession(db, session.token)?.shouldRotate).toBe(true);
  });

  it('deletes a session so it can no longer be validated', () => {
    const { db, user } = withUser();
    const session = createSession(db, user.id);

    deleteSession(db, session.token);

    expect(validateSession(db, session.token)).toBeNull();
  });

  it('rotates a valid session to a new token, invalidating the old one', () => {
    const { db, user } = withUser();
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
