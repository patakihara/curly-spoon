import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { getUserById, hasAdmin, listUsers, upsertUser } from './users.js';

describe('users', () => {
  it('creates a new user with the role asked for', () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', role: 'member' });
    expect(user.username).toBe('kara');
    expect(user.role).toBe('member');
    expect(getUserById(db, user.id)).toEqual(user);
  });

  it('reuses the same user for the same username, changing only the role', () => {
    const db = openDatabase(':memory:');
    const first = upsertUser(db, { username: 'kara', role: 'member' });
    const second = upsertUser(db, { username: 'kara', role: 'admin' });
    expect(second.id).toBe(first.id);
    expect(second.role).toBe('admin');
    expect(listUsers(db)).toHaveLength(1);
  });

  it('counts as configured only once an admin exists', () => {
    const db = openDatabase(':memory:');
    expect(hasAdmin(db)).toBe(false);
    upsertUser(db, { username: 'kara', role: 'member' });
    expect(hasAdmin(db)).toBe(false);
    upsertUser(db, { username: 'sofia', role: 'admin' });
    expect(hasAdmin(db)).toBe(true);
  });

  it('lists every user by username', () => {
    const db = openDatabase(':memory:');
    upsertUser(db, { username: 'sofia', role: 'admin' });
    upsertUser(db, { username: 'kara', role: 'member' });
    expect(listUsers(db).map((u) => [u.username, u.role])).toEqual([
      ['kara', 'member'],
      ['sofia', 'admin'],
    ]);
  });

  it('refuses a role the store does not know', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db
        .prepare(
          "INSERT INTO users (id, username, role, created_at, updated_at) VALUES ('x', 'x', 'owner', 0, 0)",
        )
        .run(),
    ).toThrow();
  });

  it('returns null for an unknown id', () => {
    const db = openDatabase(':memory:');
    expect(getUserById(db, 'does-not-exist')).toBeNull();
  });
});
