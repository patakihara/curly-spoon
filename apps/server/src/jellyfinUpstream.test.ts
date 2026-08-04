import { describe, expect, it } from 'vitest';
import { openDatabase } from './db/connection.js';
import { setSettings } from './db/settingsRepo.js';
import { setJellyfinToken } from './db/jellyfinSecretsRepo.js';
import { upsertUser } from './db/usersRepo.js';
import {
  AURALIS_JELLYFIN_DEVICE,
  JELLYFIN_UPSTREAM_KEY,
  JellyfinNoCredentialsError,
  JellyfinNotConfiguredError,
  createJellyfinUpstreamFactory,
} from './jellyfinUpstream.js';

const sessionSecret = 'a'.repeat(32);
const noopFetch = async () => new Response('{}', { status: 200 });

describe('JellyfinUpstreamFactory.forSetup', () => {
  it('builds an unauthenticated client bound to the given base URL', () => {
    const db = openDatabase(':memory:');
    const factory = createJellyfinUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    const client = factory.forSetup('https://jellyfin.example.com');
    expect(client.baseUrl).toBe('https://jellyfin.example.com');
    expect(client.token).toBeUndefined();
  });
});

describe('JellyfinUpstreamFactory.forUser', () => {
  it('throws JellyfinNotConfiguredError when there is no jellyfin settings row yet', () => {
    const db = openDatabase(':memory:');
    const factory = createJellyfinUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    expect(() => factory.forUser('some-user')).toThrow(JellyfinNotConfiguredError);
  });

  it('throws JellyfinNoCredentialsError when settings exist but this user has no stored token', () => {
    const db = openDatabase(':memory:');
    setSettings(db, 'https://jellyfin.example.com', JELLYFIN_UPSTREAM_KEY);
    const factory = createJellyfinUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    expect(() => factory.forUser('some-user')).toThrow(JellyfinNoCredentialsError);
  });

  it("builds a client bound to the shared base URL and the user's decrypted token", () => {
    const db = openDatabase(':memory:');
    setSettings(db, 'https://jellyfin.example.com', JELLYFIN_UPSTREAM_KEY);
    const user = upsertUser(db, { username: 'kara', upstreamUserId: 'u1' });
    setJellyfinToken(db, user.id, 'super-secret-jellyfin-token', sessionSecret);

    const factory = createJellyfinUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    const client = factory.forUser(user.id);

    expect(client.baseUrl).toBe('https://jellyfin.example.com');
    expect(client.token).toBe('super-secret-jellyfin-token');
  });

  it('is scoped to the jellyfin settings row, not the shared audiobookshelf one', () => {
    const db = openDatabase(':memory:');
    // Only the ABS settings row exists — jellyfin's own row (a distinct `upstream` key)
    // must not be satisfied by it.
    setSettings(db, 'https://abs.example.com');
    const factory = createJellyfinUpstreamFactory({ db, sessionSecret, fetch: noopFetch });
    expect(() => factory.forUser('some-user')).toThrow(JellyfinNotConfiguredError);
  });
});

describe('AURALIS_JELLYFIN_DEVICE', () => {
  it('identifies Auralis as a stable device to the Jellyfin server', () => {
    expect(AURALIS_JELLYFIN_DEVICE.client).toBe('Auralis');
    expect(AURALIS_JELLYFIN_DEVICE.device).toBe('Auralis BFF');
    expect(AURALIS_JELLYFIN_DEVICE.deviceId).toBe('auralis-bff');
    expect(AURALIS_JELLYFIN_DEVICE.version).toEqual(expect.any(String));
  });
});
