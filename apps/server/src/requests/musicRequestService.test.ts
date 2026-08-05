/**
 * Tests the music request service's provider-listing and search fan-out against fake
 * `MusicRequestProvider`s, injected through a mocked registry — never the real `slskd.ts`.
 * Mirrors `requestService.test.ts`'s approach for the same reason: proves genericity over
 * `MusicRequestProvider` and keeps these tests off the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '@auralis/abs-client';
import type { JellyfinClient, Library } from '@auralis/jellyfin-client';
import { openDatabase, type Db } from '../db/connection.js';
import { upsertUser } from '../db/usersRepo.js';
import { setProviderConfig } from '../db/providerConfigRepo.js';
import { APP_SETTING_KEYS, setAppSetting } from '../db/appSettingsRepo.js';
import { getRequest, updateRequest } from '../db/requestsRepo.js';
import {
  ProviderError,
  type DownloadStatus,
  type MusicCandidate,
  type MusicRequestProvider,
} from './types.js';

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
  opts: Partial<Pick<MusicRequestProvider, 'search' | 'add' | 'status'>> = {},
): MusicRequestProvider {
  return {
    id,
    displayName: id,
    search: opts.search ?? (async () => []),
    add: opts.add ?? (async () => `handle-${id}`),
    status:
      opts.status ??
      (async () => {
        throw new Error('not used in this test');
      }),
    remove: async () => {},
    testConnection: async () => {},
  };
}

function registerProvider(provider: MusicRequestProvider): void {
  musicRegistry.factories[provider.id] = () => provider;
}

function downloadStatus(overrides: Partial<DownloadStatus> = {}): DownloadStatus {
  return {
    clientId: 'slskd',
    handle: 'peer-a::transfer-1',
    state: 'downloading',
    progress: 0,
    contentPath: null,
    downloadRateBytes: 0,
    etaSeconds: null,
    errorMessage: null,
    ...overrides,
  };
}

/** Mirrors `requestService.test.ts`'s `makeFakeAbs` for the Jellyfin side: a minimal fake
 * satisfying only the two `JellyfinClient` methods `musicRequestService.ts`'s rescan path
 * calls, cast past the rest of the real client's surface — this file never needs a real
 * `fetch` or a real Jellyfin server. */
function makeFakeJellyfin(
  overrides: Partial<{
    getLibraries: () => Promise<Library[]>;
    refreshItem: (itemId: string) => Promise<void>;
  }> = {},
): JellyfinClient {
  const fake = {
    getLibraries:
      overrides.getLibraries ??
      (async () => [{ id: 'lib-music', name: 'Music', collectionType: 'music' }]),
    refreshItem: overrides.refreshItem ?? (async () => {}),
  };
  return fake as unknown as JellyfinClient;
}

function makeUser(db: Db, upstreamUserId = 'abs-user-1') {
  return upsertUser(db, { username: 'kara', upstreamUserId });
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
    jellyfinFor: () => makeFakeJellyfin(),
    ...overrides,
  };
}

/** Mirrors `requestService.test.ts`'s `makeDownloadingRequest`: creates a request through
 * the real service (so it carries a real candidate/provider), then fast-forwards it past
 * `grab()` directly at the repo layer, the same shortcut book's fixture takes. */
function makeDownloadingRequest(
  db: Db,
  service: ReturnType<typeof createMusicRequestService>,
  userId: string,
  overrides: { clientId?: string; downloadHandle?: string } = {},
) {
  const created = service.createRequest({ userId, candidate: candidate() });
  updateRequest(db, created.id, { status: 'searching' });
  updateRequest(db, created.id, {
    status: 'downloading',
    clientId: overrides.clientId ?? 'slskd',
    downloadHandle: overrides.downloadHandle ?? 'peer-a::transfer-1',
  });
  const row = getRequest(db, created.id);
  if (!row) throw new Error('fixture request vanished');
  return row;
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

// ---------------------------------------------------------------------------
// createRequest / listRequests
// ---------------------------------------------------------------------------

describe('createRequest', () => {
  it('persists a music row, deriving title/author from the candidate', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);

    const created = createMusicRequestService(makeDeps(db)).createRequest({
      userId: user.id,
      candidate: candidate({ title: 'Echo', artist: 'Solstice' }),
    });

    expect(created).toMatchObject({
      userId: user.id,
      title: 'Echo',
      author: 'Solstice',
      mediaType: 'music',
      status: 'approved', // default approval policy is 'auto'
    });
    expect(created.candidate).toEqual(candidate({ title: 'Echo', artist: 'Solstice' }));
    expect(created.release).toBeNull();
  });

  it('lands in pending, not approved, under manual approval policy', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    setAppSetting(db, APP_SETTING_KEYS.approvalPolicy, 'manual');

    const created = createMusicRequestService(makeDeps(db)).createRequest({
      userId: user.id,
      candidate: candidate(),
    });

    expect(created.status).toBe('pending');
  });
});

describe('listRequests', () => {
  it('lists only music rows, never a book row from the same table', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const service = createMusicRequestService(makeDeps(db));
    service.createRequest({ userId: user.id, candidate: candidate({ guid: 'a' }) });
    // A book row, written directly at the repo layer — proves the service-level filter,
    // not just that nothing else happens to create book rows in this test.
    db.prepare(
      `INSERT INTO requests (id, user_id, title, status, progress, media_type, created_at, updated_at)
       VALUES ('req-book', ?, 'A Book', 'pending', 0, 'book', ?, ?)`,
    ).run(user.id, Date.now(), Date.now());

    const musicOnly = service.listRequests();
    expect(musicOnly.map((r) => r.mediaType)).toEqual(['music']);
  });

  it('filters by status when given one', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    setAppSetting(db, APP_SETTING_KEYS.approvalPolicy, 'manual'); // so reject() is legal
    const service = createMusicRequestService(makeDeps(db));
    const toReject = service.createRequest({
      userId: user.id,
      candidate: candidate({ guid: 'a' }),
    });
    const rejected = service.reject(toReject.id);
    service.createRequest({ userId: user.id, candidate: candidate({ guid: 'b' }) });

    expect(service.listRequests('rejected').map((r) => r.id)).toEqual([rejected.id]);
  });
});

// ---------------------------------------------------------------------------
// approve / reject / retry
// ---------------------------------------------------------------------------

describe('approve / reject / retry', () => {
  it('moves pending -> approved -> ... and rejected/retried requests through the shared state table', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    setAppSetting(db, APP_SETTING_KEYS.approvalPolicy, 'manual');
    const service = createMusicRequestService(makeDeps(db));

    const pending = service.createRequest({ userId: user.id, candidate: candidate() });
    expect(pending.status).toBe('pending');

    const approved = service.approve(pending.id);
    expect(approved.status).toBe('approved');

    const rejected = service.reject(
      service.createRequest({ userId: user.id, candidate: candidate({ guid: 'b' }) }).id,
    );
    expect(rejected.status).toBe('rejected');
  });

  it('throws RequestTransitionError approving an already-approved request', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const service = createMusicRequestService(makeDeps(db));
    const created = service.createRequest({ userId: user.id, candidate: candidate() });
    expect(created.status).toBe('approved'); // auto policy

    expect(() => service.approve(created.id)).toThrowError(/cannot move a request/);
  });

  it('404s (RequestNotFoundError) for a book request id', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    db.prepare(
      `INSERT INTO requests (id, user_id, title, status, progress, media_type, created_at, updated_at)
       VALUES ('req-book', ?, 'A Book', 'pending', 0, 'book', ?, ?)`,
    ).run(user.id, Date.now(), Date.now());

    const service = createMusicRequestService(makeDeps(db));
    expect(() => service.approve('req-book')).toThrowError(/not found/);
  });
});

// ---------------------------------------------------------------------------
// grab
// ---------------------------------------------------------------------------

describe('grab', () => {
  it("calls the owning provider's add() and lands on downloading with its handle", async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    let addedWith: unknown;
    registerProvider(
      makeProvider('slskd', {
        add: async (c) => {
          addedWith = c;
          return 'peer-a::transfer-1';
        },
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const created = service.createRequest({ userId: user.id, candidate: candidate() });
    expect(created.status).toBe('approved');

    const grabbed = await service.grab(created.id);

    expect(grabbed.status).toBe('downloading');
    expect(grabbed.indexerId).toBe('slskd');
    expect(grabbed.clientId).toBe('slskd');
    expect(grabbed.downloadHandle).toBe('peer-a::transfer-1');
    expect(addedWith).toEqual(candidate());
  });

  it('fails the request (not throws) when the owning provider is not configured', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    // No provider registered/configured at all — the candidate names 'slskd' but nothing
    // builds it.
    const service = createMusicRequestService(makeDeps(db));
    const created = service.createRequest({ userId: user.id, candidate: candidate() });

    const grabbed = await service.grab(created.id);

    expect(grabbed.status).toBe('failed');
    expect(grabbed.statusDetail).toMatch(/not configured/);
  });

  it("fails the request when the provider's add() throws a ProviderError", async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        add: async () => {
          throw new ProviderError('rejected', 'slskd', 'slskd only accepts a relative path.');
        },
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const created = service.createRequest({ userId: user.id, candidate: candidate() });

    const grabbed = await service.grab(created.id);

    expect(grabbed.status).toBe('failed');
    expect(grabbed.statusDetail).toBe('slskd only accepts a relative path.');
  });

  it('passes the configured music save path and category to add(), never the book ones', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    setAppSetting(db, APP_SETTING_KEYS.bookSavePath, '/an/absolute/book/path');
    setAppSetting(db, APP_SETTING_KEYS.musicSavePath, 'relative/music/path');
    setAppSetting(db, APP_SETTING_KEYS.musicCategory, 'my-music');
    let optionsSeen: unknown;
    registerProvider(
      makeProvider('slskd', {
        add: async (_c, options) => {
          optionsSeen = options;
          return 'handle';
        },
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const created = service.createRequest({ userId: user.id, candidate: candidate() });

    await service.grab(created.id);

    expect(optionsSeen).toEqual({ savePath: 'relative/music/path', category: 'my-music' });
  });

  it('passes a request already in "searching" straight through, rather than throwing for lacking a self-loop', async () => {
    // `TRANSITIONS` (requestStatus.ts) has no `searching -> searching` entry — mirrors
    // `requestService.ts`'s own `grab()`, which relies on exactly this pass-through so a
    // `retry()` (-> searching) followed by `grab()` doesn't throw RequestTransitionError.
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(makeProvider('slskd'));
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const created = service.createRequest({ userId: user.id, candidate: candidate() });
    expect(created.status).toBe('approved');
    updateRequest(db, created.id, { status: 'searching' });

    const grabbed = await service.grab(created.id);

    expect(grabbed.status).toBe('downloading');
  });

  it('retry() then grab() recovers a failed request', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    let firstAttempt = true;
    registerProvider(
      makeProvider('slskd', {
        add: async () => {
          if (firstAttempt) {
            firstAttempt = false;
            throw new ProviderError('unreachable', 'slskd', 'Could not reach slskd.');
          }
          return 'handle-2';
        },
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const created = service.createRequest({ userId: user.id, candidate: candidate() });

    const failed = await service.grab(created.id);
    expect(failed.status).toBe('failed');

    service.retry(failed.id);
    const recovered = await service.grab(failed.id);

    expect(recovered.status).toBe('downloading');
    expect(recovered.downloadHandle).toBe('handle-2');
  });

  it('404s (RequestNotFoundError) for a book request id', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    db.prepare(
      `INSERT INTO requests (id, user_id, title, status, progress, media_type, created_at, updated_at)
       VALUES ('req-book', ?, 'A Book', 'approved', 0, 'book', ?, ?)`,
    ).run(user.id, Date.now(), Date.now());

    const service = createMusicRequestService(makeDeps(db));
    await expect(service.grab('req-book')).rejects.toThrowError(/not found/);
  });
});

// ---------------------------------------------------------------------------
// pollDownloads — the Jellyfin rescan wave. Mirrors `requestService.test.ts`'s own
// `pollDownloads` suite; see that file for the book-side comparison this deliberately
// diverges from at the "completed vs. importRequested" step (requestStatus.ts's header
// comment has the full reasoning).
// ---------------------------------------------------------------------------

describe('pollDownloads', () => {
  it('advances progress without changing status mid-download', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        status: async () => downloadStatus({ state: 'downloading', progress: 0.3 }),
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const req = makeDownloadingRequest(db, service, user.id);

    await service.pollDownloads();

    const updated = getRequest(db, req.id);
    expect(updated?.status).toBe('downloading');
    expect(updated?.progress).toBe(0.3);
  });

  it.each(['completed', 'seeding'] as const)(
    'moves to importRequested (never completed) and asks Jellyfin to refresh the music library when the provider reports %s',
    async (state) => {
      const db = openDatabase(':memory:');
      const user = makeUser(db);
      registerProvider(
        makeProvider('slskd', {
          status: async () => downloadStatus({ state, progress: 1 }),
        }),
      );
      configureProvider(db, 'slskd', { secret: 'api-key' });
      const refreshItem = vi.fn(async () => {});
      const service = createMusicRequestService(
        makeDeps(db, { jellyfinFor: () => makeFakeJellyfin({ refreshItem }) }),
      );
      const req = makeDownloadingRequest(db, service, user.id);

      await service.pollDownloads();

      const updated = getRequest(db, req.id);
      // Not 'completed': Jellyfin's refresh has no completion signal at all (see
      // `JellyfinClient.refreshItem`'s doc comment), so this codebase does not claim the
      // file actually landed — only that it asked.
      expect(updated?.status).toBe('importRequested');
      expect(updated?.statusDetail).toBeNull();
      expect(refreshItem).toHaveBeenCalledWith('lib-music');
    },
  );

  it('triggers exactly one rescan across two pollDownloads calls for the same completed request', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        status: async () => downloadStatus({ state: 'completed', progress: 1 }),
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    makeDownloadingRequest(db, service, user.id);
    const refreshItem = vi.fn(async () => {});
    const serviceWithSpy = createMusicRequestService(
      makeDeps(db, { jellyfinFor: () => makeFakeJellyfin({ refreshItem }) }),
    );

    await serviceWithSpy.pollDownloads();
    await serviceWithSpy.pollDownloads();

    expect(refreshItem).toHaveBeenCalledTimes(1);
  });

  it('still reaches importRequested, with an explanatory note, when no music library is found', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        status: async () => downloadStatus({ state: 'completed', progress: 1 }),
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(
      makeDeps(db, { jellyfinFor: () => makeFakeJellyfin({ getLibraries: async () => [] }) }),
    );
    const req = makeDownloadingRequest(db, service, user.id);

    await service.pollDownloads();

    const updated = getRequest(db, req.id);
    expect(updated?.status).toBe('importRequested');
    expect(updated?.statusDetail).toMatch(/no music library/i);
  });

  it('still reaches importRequested, with an explanatory note, when the rescan call itself fails', async () => {
    // e.g. the connected Jellyfin account is not an administrator — `refreshItem` is
    // verified to require elevation, so a 403 here is an expected failure mode, not a bug.
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        status: async () => downloadStatus({ state: 'completed', progress: 1 }),
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(
      makeDeps(db, {
        jellyfinFor: () =>
          makeFakeJellyfin({
            refreshItem: async () => {
              throw new Error('403 forbidden');
            },
          }),
      }),
    );
    const req = makeDownloadingRequest(db, service, user.id);

    await service.pollDownloads();

    const updated = getRequest(db, req.id);
    expect(updated?.status).toBe('importRequested');
    expect(updated?.statusDetail).toMatch(/rescan failed to start/i);
  });

  it('never echoes the underlying rescan error into statusDetail — a generic note only, so a Jellyfin error message (which could carry an upstream URL/token) never reaches a stored, servable field', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        status: async () => downloadStatus({ state: 'completed', progress: 1 }),
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(
      makeDeps(db, {
        jellyfinFor: () =>
          makeFakeJellyfin({
            refreshItem: async () => {
              throw new Error(
                'Could not reach Jellyfin: fetch failed for http://jellyfin.local/Items/lib-music/Refresh?ApiKey=super-secret-token',
              );
            },
          }),
      }),
    );
    const req = makeDownloadingRequest(db, service, user.id);

    await service.pollDownloads();

    const updated = getRequest(db, req.id);
    expect(updated?.statusDetail).not.toContain('super-secret-token');
    expect(updated?.statusDetail).not.toMatch(/jellyfin\.local/);
    expect(updated?.statusDetail).toBe('downloaded, but the library rescan failed to start');
  });

  it('marks the request failed with the provider error message when the provider reports error', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        status: async () => downloadStatus({ state: 'error', errorMessage: 'peer disconnected' }),
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const req = makeDownloadingRequest(db, service, user.id);

    await service.pollDownloads();

    const updated = getRequest(db, req.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.statusDetail).toBe('peer disconnected');
  });

  it('marks the request failed when it vanished from the provider', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerProvider(
      makeProvider('slskd', {
        status: async () => downloadStatus({ state: 'missing' }),
      }),
    );
    configureProvider(db, 'slskd', { secret: 'api-key' });
    const service = createMusicRequestService(makeDeps(db));
    const req = makeDownloadingRequest(db, service, user.id);

    await service.pollDownloads();

    const updated = getRequest(db, req.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.statusDetail).toMatch(/vanished/i);
  });

  it('marks the request failed when its provider is no longer configured', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    // No provider registered/configured at all — 'slskd' is orphaned.
    const service = createMusicRequestService(makeDeps(db));
    const req = makeDownloadingRequest(db, service, user.id);

    await service.pollDownloads();

    const updated = getRequest(db, req.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.statusDetail).toMatch(/no longer configured/i);
  });

  it('never picks up a book request stuck in downloading', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    db.prepare(
      `INSERT INTO requests
         (id, user_id, title, status, progress, media_type, client_id, download_handle, created_at, updated_at)
       VALUES ('req-book', ?, 'A Book', 'downloading', 0, 'book', 'transmission', 'hash-1', ?, ?)`,
    ).run(user.id, Date.now(), Date.now());
    const service = createMusicRequestService(makeDeps(db));

    await service.pollDownloads();

    const updated = getRequest(db, 'req-book');
    // Unchanged: pollDownloads never even looks at a book row.
    expect(updated?.status).toBe('downloading');
  });
});
