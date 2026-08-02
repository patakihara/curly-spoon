import { describe, expect, it } from 'vitest';
import { openDatabase } from './db/connection.js';
import { setSettings } from './db/settingsRepo.js';
import { setUpstreamToken } from './db/secretsRepo.js';
import { upsertUser } from './db/usersRepo.js';
import { createAbsUpstreamFactory, NoCredentialsError, NotConfiguredError } from './absUpstream.js';

const sessionSecret = 'a'.repeat(32);
const noopFetch = async () => new Response('{}', { status: 200 });

describe('AbsUpstreamFactory.forSetup', () => {
  it('builds an unauthenticated client bound to the given base URL', () => {
    const db = openDatabase(':memory:');
    const factory = createAbsUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    const client = factory.forSetup('https://abs.example.com');
    expect(client.baseUrl).toBe('https://abs.example.com');
    expect(client.token).toBeUndefined();
  });
});

describe('AbsUpstreamFactory.forUser', () => {
  it('throws NotConfiguredError when there is no settings row yet', () => {
    const db = openDatabase(':memory:');
    const factory = createAbsUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    expect(() => factory.forUser('some-user')).toThrow(NotConfiguredError);
  });

  it('throws NoCredentialsError when settings exist but this user has no stored token', () => {
    const db = openDatabase(':memory:');
    setSettings(db, 'https://abs.example.com');
    const factory = createAbsUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    expect(() => factory.forUser('some-user')).toThrow(NoCredentialsError);
  });

  it('builds a client bound to the shared base URL and the user\'s decrypted token', () => {
    const db = openDatabase(':memory:');
    setSettings(db, 'https://abs.example.com');
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    setUpstreamToken(db, user.id, 'super-secret-token', sessionSecret);

    const factory = createAbsUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    const client = factory.forUser(user.id);

    expect(client.baseUrl).toBe('https://abs.example.com');
    expect(client.token).toBe('super-secret-token');
  });
});
