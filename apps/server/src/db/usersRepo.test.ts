import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { getUserById, upsertUser } from './usersRepo.js';

describe('usersRepo', () => {
  it('creates a new local user on first login', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'abs-user-1' });
    expect(user.username).toBe('kara');
    expect(user.upstreamUserId).toBe('abs-user-1');
    expect(user.upstream).toBe('audiobookshelf');
    expect(getUserById(db, user.id)).toEqual(user);
  });

  it('reuses the same local user for the same upstream account on a later login', () => {
    const db = openDatabase(':memory:');
    const first = upsertUser(db, { username: 'kara', upstreamUserId: 'abs-user-1' });
    const second = upsertUser(db, { username: 'kara', upstreamUserId: 'abs-user-1' });
    expect(second.id).toBe(first.id);
  });

  it('refreshes the username if it changed upstream', () => {
    const db = openDatabase(':memory:');
    const first = upsertUser(db, { username: 'kara', upstreamUserId: 'abs-user-1' });
    const renamed = upsertUser(db, { username: 'kara-new', upstreamUserId: 'abs-user-1' });
    expect(renamed.id).toBe(first.id);
    expect(renamed.username).toBe('kara-new');
  });

  it('treats the same upstream user id on different upstreams as different local users', () => {
    const db = openDatabase(':memory:');
    const abs = upsertUser(db, { username: 'kara', upstreamUserId: 'user-1', upstream: 'audiobookshelf' });
    const jelly = upsertUser(db, { username: 'kara', upstreamUserId: 'user-1', upstream: 'jellyfin' });
    expect(abs.id).not.toBe(jelly.id);
  });

  it('returns null for an unknown id', () => {
    const db = openDatabase(':memory:');
    expect(getUserById(db, 'does-not-exist')).toBeNull();
  });
});
