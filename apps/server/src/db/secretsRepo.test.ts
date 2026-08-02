import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { deleteUpstreamToken, getUpstreamToken, setUpstreamToken } from './secretsRepo.js';
import { upsertUser } from './usersRepo.js';

const sessionSecret = 'a'.repeat(32);

describe('secretsRepo', () => {
  it('returns null when no token has been stored for a user', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    expect(getUpstreamToken(db, user.id, sessionSecret)).toBeNull();
  });

  it('stores a token encrypted and returns the decrypted value', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });

    setUpstreamToken(db, user.id, 'upstream-token-xyz', sessionSecret);

    const row = db.prepare('SELECT ciphertext FROM secrets WHERE user_id = ?').get(user.id) as {
      ciphertext: string;
    };
    expect(row.ciphertext).not.toContain('upstream-token-xyz');
    expect(getUpstreamToken(db, user.id, sessionSecret)).toBe('upstream-token-xyz');
  });

  it('overwrites a previous token for the same user', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });

    setUpstreamToken(db, user.id, 'first-token', sessionSecret);
    setUpstreamToken(db, user.id, 'second-token', sessionSecret);

    expect(getUpstreamToken(db, user.id, sessionSecret)).toBe('second-token');
  });

  it('deletes a stored token', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    setUpstreamToken(db, user.id, 'token', sessionSecret);

    deleteUpstreamToken(db, user.id);

    expect(getUpstreamToken(db, user.id, sessionSecret)).toBeNull();
  });

  it('is removed automatically when the owning user is deleted (cascade)', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    setUpstreamToken(db, user.id, 'token', sessionSecret);

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    const row = db.prepare('SELECT * FROM secrets WHERE user_id = ?').get(user.id);
    expect(row).toBeUndefined();
  });
});
