/**
 * Tests the music request service's provider-listing and search fan-out against fake
 * `MusicRequestProvider`s, injected through a mocked registry — never the real `slskd.ts`.
 * Mirrors `requestService.test.ts`'s approach for the same reason: proves genericity over
 * `MusicRequestProvider` and keeps these tests off the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@auralis/abs-client';
import { openDatabase, type Db } from '../db/connection.js';
import { setProviderConfig } from '../db/providerConfigRepo.js';
import { ProviderError, type MusicCandidate, type MusicRequestProvider } from './types.js';

const musicRegistry = vi.hoisted(() => ({
  factories: {} as Record<string, () => MusicRequestProvider>,
  descriptors: [
    { id: 'slskd', requiresSecret: true },
    { id: 'needs-secret-music', requiresSecret: true },
  ],
}));

vi.mock('./music/registry.js', () => ({
  getMusicProviderFactory: (id: string) => musicRegistry.factories[id] ?? null,
  musicProviderDescriptors: musicRegistry.descriptors,
}));

import { createMusicRequestService, type MusicRequestServiceDeps } from './musicRequestService.js';

const SECRET = 'a'.repeat(32);

beforeEach(() => {
  musicRegistry.factories = {};
});

function candidate(overrides: Partial<MusicCandidate> = {}): MusicCandidate {
  return {
    guid: 'guid-1',
    providerId: 'slskd',
    sourceName: 'peer-a',
    title: 'Echo',
    artist: 'Solstice',
    album: 'Reverie',
    sizeBytes: 5_000_000,
    bitrateKbps: 320,
    format: 'mp3',
    ...overrides,
  };
}

function makeProvider(
  id: string,
  opts: Partial<Pick<MusicRequestProvider, 'search'>> = {},
): MusicRequestProvider {
  return {
    id,
    displayName: id,
    search: opts.search ?? (async () => []),
    add: async () => `handle-${id}`,
    status: async () => {
      throw new Error('not used in this test');
    },
    remove: async () => {},
    testConnection: async () => {},
  };
}

function registerProvider(provider: MusicRequestProvider): void {
  musicRegistry.factories[provider.id] = () => provider;
}

function configureProvider(
  db: Db,
  id: string,
  opts: { enabled?: boolean; secret?: string | null } = {},
): void {
  setProviderConfig(
    db,
    {
      id,
      kind: 'music',
      enabled: opts.enabled ?? true,
      baseUrl: 'http://music-provider.example.test',
      options: {},
      ...(opts.secret !== undefined ? { secret: opts.secret } : {}),
    },
    SECRET,
  );
}

function makeDeps(
  db: Db,
  overrides: Partial<MusicRequestServiceDeps> = {},
): MusicRequestServiceDeps {
  return {
    db,
    sessionSecret: SECRET,
    fetch: (() => {
      throw new Error('unexpected network call in a unit test');
    }) as unknown as FetchLike,
    ...overrides,
  };
}

describe('listProviders', () => {
  it('returns only enabled, known, credentialed providers', () => {
    const db = openDatabase(':memory:');
    registerProvider(makeProvider('slskd'));
    configureProvider(db, 'slskd', { secret: 'api-key' });
    configureProvider(db, 'disabled-one', { enabled: false });

    const service = createMusicRequestService(makeDeps(db));
    expect(service.listProviders().map((p) => p.id)).toEqual(['slskd']);
  });

  it('skips a configured provider missing a required secret, without throwing', () => {
    const db = openDatabase(':memory:');
    registerProvider(makeProvider('needs-secret-music'));
    configureProvider(db, 'needs-secret-music', { secret: null });

    const service = createMusicRequestService(makeDeps(db));
    expect(service.listProviders()).toEqual([]);
  });

  it('skips an enabled row this build has no factory for, without throwing', () => {
    const db = openDatabase(':memory:');
    configureProvider(db, 'unknown-provider');

    const service = createMusicRequestService(makeDeps(db));
    expect(service.listProviders()).toEqual([]);
  });
});

describe('searchMusic', () => {
  it('fans out to every enabled provider and concatenates their candidates', async () => {
    const db = openDatabase(':memory:');
    registerProvider(
      makeProvider('slskd', {
        search: async () => [candidate({ guid: 'a', providerId: 'slskd' })],
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });

    const service = createMusicRequestService(makeDeps(db));
    const outcome = await service.searchMusic({ term: 'echo' });

    expect(outcome.errors).toEqual([]);
    expect(outcome.candidates.map((c) => c.guid)).toEqual(['a']);
  });

  it("reports one provider's ProviderError without failing the whole search", async () => {
    const db = openDatabase(':memory:');
    registerProvider(
      makeProvider('slskd', {
        search: async () => {
          throw new ProviderError('unreachable', 'slskd', 'Could not reach slskd.');
        },
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });

    const service = createMusicRequestService(makeDeps(db));
    const outcome = await service.searchMusic({ term: 'echo' });

    expect(outcome.candidates).toEqual([]);
    expect(outcome.errors).toEqual([
      { providerId: 'slskd', kind: 'unreachable', message: 'Could not reach slskd.' },
    ]);
  });

  it('folds an unexpected (non-ProviderError) throw into a bad_response error rather than rejecting', async () => {
    const db = openDatabase(':memory:');
    registerProvider(
      makeProvider('slskd', {
        search: async () => {
          throw new Error('boom');
        },
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });

    const service = createMusicRequestService(makeDeps(db));
    const outcome = await service.searchMusic({ term: 'echo' });

    expect(outcome.errors).toEqual([
      { providerId: 'slskd', kind: 'bad_response', message: 'boom' },
    ]);
  });

  it('returns no candidates and no errors when no provider is configured', async () => {
    const db = openDatabase(':memory:');
    const service = createMusicRequestService(makeDeps(db));
    const outcome = await service.searchMusic({ term: 'echo' });
    expect(outcome).toEqual({ candidates: [], errors: [] });
  });
});
