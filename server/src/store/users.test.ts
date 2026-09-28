import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import {
  getUserById,
  hasAdmin,
  listUsers,
  signInUser,
  upsertUser,
  UsernameTaken,
} from './users.js';

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

describe('[M0.sso/b] who a sign-on identity is', () => {
  const ISSUER = 'https://upstream.invalid';
  const kara = { issuer: ISSUER, sub: 'sub-kara', username: 'kara', directoryAdmin: false };

  it('makes a new member at first sign-in, and finds the same user by subject after', () => {
    const db = openDatabase(':memory:');
    const first = signInUser(db, kara);
    expect(first).toMatchObject({ username: 'kara', role: 'member', roleSource: 'directory' });
    const renamed = signInUser(db, { ...kara, username: 'kara2' });
    expect(renamed.id).toBe(first.id);
    expect(renamed.username).toBe('kara2');
  });

  it('adopts the setup admin of the same username for a directory admin, and never demotes them', () => {
    const db = openDatabase(':memory:');
    const admin = upsertUser(db, { username: 'kara', role: 'admin' });
    const signedIn = signInUser(db, { ...kara, directoryAdmin: true });
    expect(signedIn.id).toBe(admin.id);
    expect(signedIn).toMatchObject({ role: 'admin', roleSource: 'setup' });
    expect(signInUser(db, kara)).toMatchObject({ id: admin.id, role: 'admin' });
  });

  it('refuses to hand the setup admin to someone outside the directory admin group', () => {
    const db = openDatabase(':memory:');
    const admin = upsertUser(db, { username: 'kara', role: 'admin' });
    expect(() => signInUser(db, kara)).toThrow(UsernameTaken);
    expect(getUserById(db, admin.id)).toMatchObject({ role: 'admin', roleSource: 'setup' });
    expect(listUsers(db)).toHaveLength(1);
  });

  it('gives admin to the directory admin group, and takes it back on leaving', () => {
    const db = openDatabase(':memory:');
    expect(signInUser(db, { ...kara, directoryAdmin: true }).role).toBe('admin');
    expect(signInUser(db, kara).role).toBe('member');
  });

  it('refuses a username already tied to another subject', () => {
    const db = openDatabase(':memory:');
    signInUser(db, kara);
    expect(() => signInUser(db, { ...kara, sub: 'sub-other' })).toThrow(UsernameTaken);
  });
});
