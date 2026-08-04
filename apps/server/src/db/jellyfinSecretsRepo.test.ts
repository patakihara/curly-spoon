import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { deleteJellyfinToken, getJellyfinToken, setJellyfinToken } from './jellyfinSecretsRepo.js';
import { upsertUser } from './usersRepo.js';

const sessionSecret = 'a'.repeat(32);

describe('jellyfinSecretsRepo', () => {
  it('returns null when no Jellyfin token has been stored for a user', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    expect(getJellyfinToken(db, user.id, sessionSecret)).toBeNull();
  });

  it('stores a token encrypted and returns the decrypted value', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });

    setJellyfinToken(db, user.id, 'jellyfin-token-xyz', sessionSecret);

    const row = db
      .prepare('SELECT ciphertext FROM jellyfin_secrets WHERE user_id = ?')
      .get(user.id) as { ciphertext: string };
    expect(row.ciphertext).not.toContain('jellyfin-token-xyz');
    expect(getJellyfinToken(db, user.id, sessionSecret)).toBe('jellyfin-token-xyz');
  });

  it('overwrites a previous token for the same user', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });

    setJellyfinToken(db, user.id, 'first-token', sessionSecret);
    setJellyfinToken(db, user.id, 'second-token', sessionSecret);

    expect(getJellyfinToken(db, user.id, sessionSecret)).toBe('second-token');
  });

  it('deletes a stored token', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    setJellyfinToken(db, user.id, 'token', sessionSecret);

    deleteJellyfinToken(db, user.id);

    expect(getJellyfinToken(db, user.id, sessionSecret)).toBeNull();
  });

  it('is removed automatically when the owning user is deleted (cascade)', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    setJellyfinToken(db, user.id, 'token', sessionSecret);

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    const row = db.prepare('SELECT * FROM jellyfin_secrets WHERE user_id = ?').get(user.id);
    expect(row).toBeUndefined();
  });

  it('reports a token it cannot decrypt as absent rather than throwing', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    setJellyfinToken(db, user.id, 'jellyfin-token-xyz', sessionSecret);

    // Exactly what rotating SESSION_SECRET does to every stored secret — the settings
    // screen should read this as "not connected", never as a 500.
    expect(() => getJellyfinToken(db, user.id, 'b'.repeat(32))).not.toThrow();
    expect(getJellyfinToken(db, user.id, 'b'.repeat(32))).toBeNull();
  });

  it("does not affect a different user's token", () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    const morty = upsertUser(db, { username: 'morty', upstreamUserId: 'u2' });
    setJellyfinToken(db, kara.id, 'karas-token', sessionSecret);
    setJellyfinToken(db, morty.id, 'mortys-token', sessionSecret);

    deleteJellyfinToken(db, kara.id);

    expect(getJellyfinToken(db, kara.id, sessionSecret)).toBeNull();
    expect(getJellyfinToken(db, morty.id, sessionSecret)).toBe('mortys-token');
  });
});
