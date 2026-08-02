import { describe, expect, it } from 'vitest';
import type { LoginResult } from '@auralis/abs-client';
import { openDatabase } from '../db/connection.js';
import { getUpstreamToken } from '../db/secretsRepo.js';
import { completeLogin, endSession, resolveSession } from './sessionService.js';

const sessionSecret = 'a'.repeat(32);

const loginResult: LoginResult = {
  token: 'upstream-token-abc',
  defaultLibraryId: 'lib-1',
  user: { id: 'abs-user-1', username: 'kara', permissions: {}, mediaProgress: [], bookmarks: [] },
};

describe('completeLogin', () => {
  it('creates a local user, stores the encrypted upstream token, and returns a usable session', () => {
    const db = openDatabase(':memory:');
    const session = completeLogin(db, sessionSecret, loginResult);

    expect(session.username).toBe('kara');
    expect(getUpstreamToken(db, session.userId, sessionSecret)).toBe('upstream-token-abc');

    const resolved = resolveSession(db, session.token);
    expect(resolved?.userId).toBe(session.userId);
  });

  it('reuses the same local user on a second login for the same upstream account', () => {
    const db = openDatabase(':memory:');
    const first = completeLogin(db, sessionSecret, loginResult);
    const second = completeLogin(db, sessionSecret, loginResult);
    expect(second.userId).toBe(first.userId);
  });
});

describe('resolveSession', () => {
  it('returns null for a bogus token', () => {
    const db = openDatabase(':memory:');
    expect(resolveSession(db, 'garbage')).toBeNull();
  });

  it('returns null after the session has been ended', () => {
    const db = openDatabase(':memory:');
    const session = completeLogin(db, sessionSecret, loginResult);
    endSession(db, session.token);
    expect(resolveSession(db, session.token)).toBeNull();
  });
});
