/**
 * Tests the request service against fake indexer/download-client providers, injected through
 * mocked registries — never the real `prowlarr.ts`/`audiobookbay.ts`/`qbittorrent.ts`/
 * `transmission.ts`. The service is meant to be generic over `IndexerProvider`/
 * `DownloadClientProvider` (see `types.ts`); driving it with fakes proves that genericity and
 * keeps these tests entirely off the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AbsClient, FetchLike, Library } from '@auralis/abs-client';
// Type-only, so these do not defeat the `vi.mock` calls below — they exist purely to give
// `vi.importActual` a return type without an inline `import()` annotation.
import type * as RealIndexerRegistry from './indexers/registry.js';
import type * as RealDownloadRegistry from './download/registry.js';
import { openDatabase, type Db } from '../db/connection.js';
import { upsertUser } from '../db/usersRepo.js';
import { setProviderConfig } from '../db/providerConfigRepo.js';
import { APP_SETTING_KEYS, setAppSetting } from '../db/appSettingsRepo.js';
import {
  createRequest as createRequestRow,
  getRequest as getRequestRow,
  updateRequest as updateRequestRow,
} from '../db/requestsRepo.js';
import {
  ProviderError,
  type DownloadClientProvider,
  type DownloadStatus,
  type IndexerProvider,
  type Release,
} from './types.js';

// Fake registries: the service imports `getIndexerFactory`/`indexerDescriptors` from
// `./indexers/registry.js` and the download equivalents from `./download/registry.js`. Mocking
// those two modules lets every test hand the service a fully-controlled `IndexerProvider`/
// `DownloadClientProvider` without touching the real provider implementations or the network —
// `vi.hoisted` is required because `vi.mock` factories run before the rest of the file.
const indexerRegistry = vi.hoisted(() => ({
  factories: {} as Record<string, () => IndexerProvider>,
  descriptors: [
    { id: 'prowlarr', requiresSecret: true },
    { id: 'audiobookbay', requiresSecret: false },
    { id: 'needs-secret-idx', requiresSecret: true },
  ],
}));

const downloadRegistry = vi.hoisted(() => ({
  factories: {} as Record<string, () => DownloadClientProvider>,
  descriptors: [
    { id: 'qbittorrent', requiresSecret: true },
    { id: 'transmission', requiresSecret: false },
  ],
}));

// The mocked descriptors above hand-copy `requiresSecret` from the real registries, which
// this file never imports. Without this guard, relaxing a real provider's credential
// requirement would leave these tests passing against an assumption that is no longer
// true — the failure mode where the suite is green and wrong at the same time.
describe('mocked provider descriptors', () => {
  it('still match the real registries they stand in for', async () => {
    const realIndexers =
      await vi.importActual<typeof RealIndexerRegistry>('./indexers/registry.js');
    const realDownloads =
      await vi.importActual<typeof RealDownloadRegistry>('./download/registry.js');
    const real = new Map(
      [...realIndexers.indexerDescriptors, ...realDownloads.downloadClientDescriptors].map((d) => [
        d.id,
        d.requiresSecret,
      ]),
    );

    for (const fake of [...indexerRegistry.descriptors, ...downloadRegistry.descriptors]) {
      // Ids invented purely for these tests have no real counterpart to drift from.
      if (!real.has(fake.id)) continue;
      expect(real.get(fake.id), `requiresSecret drifted for "${fake.id}"`).toBe(
        fake.requiresSecret,
      );
    }
    // Guard the guard: if the real ids are ever renamed, this catches that too.
    expect([...real.keys()].sort()).toEqual([
      'audiobookbay',
      'prowlarr',
      'qbittorrent',
      'transmission',
    ]);
  });
});

vi.mock('./indexers/registry.js', () => ({
  getIndexerFactory: (id: string) => indexerRegistry.factories[id] ?? null,
  indexerDescriptors: indexerRegistry.descriptors,
}));

vi.mock('./download/registry.js', () => ({
  getDownloadClientFactory: (id: string) => downloadRegistry.factories[id] ?? null,
  downloadClientDescriptors: downloadRegistry.descriptors,
}));

import {
  createRequestService,
  RequestNotFoundError,
  RequestTransitionError,
  type RequestServiceDeps,
} from './requestService.js';

const SECRET = 'a'.repeat(32);

beforeEach(() => {
  indexerRegistry.factories = {};
  downloadRegistry.factories = {};
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUser(db: Db, upstreamUserId = 'abs-user-1') {
  return upsertUser(db, { username: 'kara', upstreamUserId });
}

function release(overrides: Partial<Release> = {}): Release {
  return {
    guid: 'guid-1',
    indexerId: 'audiobookbay',
    sourceName: 'AudioBook Bay',
    title: 'Dune [M4B]',
    sizeBytes: null,
    seeders: 0,
    leechers: 0,
    publishedAt: null,
    downloadUrl: null,
    magnetUri: 'magnet:?xt=urn:btih:abc123',
    categories: [],
    format: null,
    ...overrides,
  };
}

function downloadStatus(overrides: Partial<DownloadStatus> = {}): DownloadStatus {
  return {
    clientId: 'transmission',
    handle: 'hash-1',
    state: 'downloading',
    progress: 0,
    contentPath: null,
    downloadRateBytes: 0,
    etaSeconds: null,
    errorMessage: null,
    ...overrides,
  };
}

function makeIndexer(
  id: string,
  opts: Partial<Pick<IndexerProvider, 'search' | 'resolveDownload'>> = {},
): IndexerProvider {
  return {
    id,
    displayName: id,
    search: opts.search ?? (async () => []),
    resolveDownload: opts.resolveDownload,
    testConnection: async () => {},
  };
}

function makeDownloadClient(
  id: string,
  opts: Partial<Pick<DownloadClientProvider, 'add' | 'status'>> = {},
): DownloadClientProvider {
  return {
    id,
    displayName: id,
    add: opts.add ?? (async () => `handle-${id}`),
    status: opts.status ?? (async () => downloadStatus({ clientId: id })),
    remove: async () => {},
    testConnection: async () => {},
  };
}

function registerIndexer(provider: IndexerProvider): void {
  indexerRegistry.factories[provider.id] = () => provider;
}

function registerDownloadClient(provider: DownloadClientProvider): void {
  downloadRegistry.factories[provider.id] = () => provider;
}

function configureIndexer(
  db: Db,
  id: string,
  opts: { enabled?: boolean; secret?: string | null } = {},
): void {
  setProviderConfig(
    db,
    {
      id,
      kind: 'indexer',
      enabled: opts.enabled ?? true,
      baseUrl: 'http://indexer.example.test',
      options: {},
      ...(opts.secret !== undefined ? { secret: opts.secret } : {}),
    },
    SECRET,
  );
}

function configureDownloadClient(
  db: Db,
  id: string,
  opts: { enabled?: boolean; secret?: string | null } = {},
): void {
  setProviderConfig(
    db,
    {
      id,
      kind: 'download',
      enabled: opts.enabled ?? true,
      baseUrl: 'http://client.example.test',
      options: {},
      ...(opts.secret !== undefined ? { secret: opts.secret } : {}),
    },
    SECRET,
  );
}

function makeFakeAbs(
  overrides: Partial<{
    getLibraries: () => Promise<Library[]>;
    scanLibrary: (id: string) => Promise<void>;
  }> = {},
): AbsClient {
  const fake = {
    getLibraries:
      overrides.getLibraries ??
      (async () => [{ id: 'lib-books', name: 'Books', mediaType: 'book', icon: null }]),
    scanLibrary: overrides.scanLibrary ?? (async () => {}),
  };
  return fake as unknown as AbsClient;
}

function makeDeps(db: Db, overrides: Partial<RequestServiceDeps> = {}): RequestServiceDeps {
  return {
    db,
    sessionSecret: SECRET,
    fetch: (() => {
      throw new Error('unexpected network call in a unit test');
    }) as unknown as FetchLike,
    absFor: () => makeFakeAbs(),
    ...overrides,
  };
}

/** A request already sitting in `downloading`, wired to a client id and a handle. */
function makeDownloadingRequest(
  db: Db,
  userId: string,
  overrides: { id?: string; clientId?: string; downloadHandle?: string } = {},
) {
  const id = overrides.id ?? 'r1';
  createRequestRow(db, { id, userId, title: 'Dune', status: 'approved' });
  updateRequestRow(db, id, { status: 'searching' });
  updateRequestRow(db, id, {
    status: 'downloading',
    clientId: overrides.clientId ?? 'transmission',
    downloadHandle: overrides.downloadHandle ?? 'hash-1',
  });
  const row = getRequestRow(db, id);
  if (!row) throw new Error('fixture request vanished');
  return row;
}

// ---------------------------------------------------------------------------
// listIndexers / getDownloadClient
// ---------------------------------------------------------------------------

describe('listIndexers', () => {
  it('skips an enabled row whose factory this build does not know, and warns', () => {
    const db = openDatabase(':memory:');
    configureIndexer(db, 'gone-in-this-build');
    const warn = vi.fn();
    const service = createRequestService(makeDeps(db, { logger: { info: vi.fn(), warn } }));

    expect(service.listIndexers()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips an enabled row that requires a secret it does not have, and warns', () => {
    const db = openDatabase(':memory:');
    registerIndexer(makeIndexer('needs-secret-idx'));
    configureIndexer(db, 'needs-secret-idx'); // no secret supplied
    const warn = vi.fn();
    const service = createRequestService(makeDeps(db, { logger: { info: vi.fn(), warn } }));

    expect(service.listIndexers()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('builds every enabled, known provider whose secret requirement is satisfied', () => {
    const db = openDatabase(':memory:');
    registerIndexer(makeIndexer('audiobookbay'));
    configureIndexer(db, 'audiobookbay');
    const service = createRequestService(makeDeps(db));

    expect(service.listIndexers().map((p) => p.id)).toEqual(['audiobookbay']);
  });
});

describe('getDownloadClient', () => {
  it('returns null when nothing is configured', () => {
    const db = openDatabase(':memory:');
    const service = createRequestService(makeDeps(db));
    expect(service.getDownloadClient()).toBeNull();
  });

  it('returns the first enabled, known client by id — deterministic because configs are id-ordered', () => {
    const db = openDatabase(':memory:');
    registerDownloadClient(makeDownloadClient('qbittorrent'));
    registerDownloadClient(makeDownloadClient('transmission'));
    configureDownloadClient(db, 'transmission');
    configureDownloadClient(db, 'qbittorrent', { secret: 'user:pass' });
    const service = createRequestService(makeDeps(db));

    // 'qbittorrent' < 'transmission' lexically, and listProviderConfigs orders by id.
    expect(service.getDownloadClient()?.id).toBe('qbittorrent');
  });
});

// ---------------------------------------------------------------------------
// searchReleases
// ---------------------------------------------------------------------------

describe('searchReleases', () => {
  it('yields an error entry for a failing indexer while the other still returns results', async () => {
    const db = openDatabase(':memory:');
    registerIndexer(
      makeIndexer('audiobookbay', {
        search: async () => {
          throw new ProviderError('unreachable', 'audiobookbay', 'connection refused');
        },
      }),
    );
    registerIndexer(
      makeIndexer('prowlarr', {
        search: async () => [release({ indexerId: 'prowlarr', guid: 'p1', seeders: 3 })],
      }),
    );
    configureIndexer(db, 'audiobookbay');
    configureIndexer(db, 'prowlarr', { secret: 'key' });
    const service = createRequestService(makeDeps(db));

    const outcome = await service.searchReleases({ term: 'Dune' });

    expect(outcome.errors).toEqual([
      { indexerId: 'audiobookbay', kind: 'unreachable', message: 'connection refused' },
    ]);
    expect(outcome.releases.map((r) => r.guid)).toEqual(['p1']);
  });

  it('folds a non-ProviderError exception into a bad_response error entry, not a thrown search', async () => {
    const db = openDatabase(':memory:');
    registerIndexer(
      makeIndexer('audiobookbay', {
        search: async () => {
          throw new Error('boom');
        },
      }),
    );
    configureIndexer(db, 'audiobookbay');
    const service = createRequestService(makeDeps(db));

    const outcome = await service.searchReleases({ term: 'Dune' });

    expect(outcome.errors).toEqual([
      { indexerId: 'audiobookbay', kind: 'bad_response', message: 'boom' },
    ]);
    expect(outcome.releases).toEqual([]);
  });

  it('sorts by seeders desc, then publishedAt desc with nulls last, breaking a full tie for prowlarr', async () => {
    const db = openDatabase(':memory:');
    const now = 1_700_000_000_000;
    registerIndexer(
      makeIndexer('audiobookbay', {
        search: async () => [
          release({
            indexerId: 'audiobookbay',
            guid: 'ab-low-seeders',
            seeders: 1,
            publishedAt: now,
          }),
          release({ indexerId: 'audiobookbay', guid: 'ab-tie', seeders: 5, publishedAt: now }),
          release({ indexerId: 'audiobookbay', guid: 'ab-no-date', seeders: 5, publishedAt: null }),
        ],
      }),
    );
    registerIndexer(
      makeIndexer('prowlarr', {
        search: async () => [
          release({ indexerId: 'prowlarr', guid: 'pr-tie', seeders: 5, publishedAt: now }),
          release({ indexerId: 'prowlarr', guid: 'pr-newer', seeders: 5, publishedAt: now + 1000 }),
        ],
      }),
    );
    configureIndexer(db, 'audiobookbay');
    configureIndexer(db, 'prowlarr', { secret: 'key' });
    const service = createRequestService(makeDeps(db));

    const outcome = await service.searchReleases({ term: 'Dune' });

    expect(outcome.releases.map((r) => r.guid)).toEqual([
      'pr-newer',
      'pr-tie',
      'ab-tie',
      'ab-no-date',
      'ab-low-seeders',
    ]);
  });
});

// ---------------------------------------------------------------------------
// createRequest
// ---------------------------------------------------------------------------

describe('createRequest', () => {
  it('is approved under the auto approval policy (the default)', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const service = createRequestService(makeDeps(db));

    const created = service.createRequest({
      userId: user.id,
      title: 'Dune',
      author: 'Frank Herbert',
    });

    expect(created.status).toBe('approved');
    expect(created.title).toBe('Dune');
    expect(created.author).toBe('Frank Herbert');
    expect(created.release).toBeNull();
  });

  it('is pending under the manual approval policy', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    setAppSetting(db, APP_SETTING_KEYS.approvalPolicy, 'manual');
    const service = createRequestService(makeDeps(db));

    const created = service.createRequest({ userId: user.id, title: 'Dune' });

    expect(created.status).toBe('pending');
  });

  it('stores the release when one is supplied', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const service = createRequestService(makeDeps(db));
    const chosen = release({ guid: 'chosen' });

    const created = service.createRequest({ userId: user.id, title: 'Dune', release: chosen });

    expect(created.release).toEqual(chosen);
  });
});

// ---------------------------------------------------------------------------
// approve / reject / retry
// ---------------------------------------------------------------------------

describe('approve / reject / retry', () => {
  it('approves a pending request', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
    });
    const service = createRequestService(makeDeps(db));

    expect(service.approve(req.id).status).toBe('approved');
  });

  it('rejects a pending request', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
    });
    const service = createRequestService(makeDeps(db));

    expect(service.reject(req.id).status).toBe('rejected');
  });

  it('retries a failed request, clearing statusDetail', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'failed',
    });
    updateRequestRow(db, req.id, { statusDetail: 'nothing found last time' });
    const service = createRequestService(makeDeps(db));

    const retried = service.retry(req.id);

    expect(retried.status).toBe('searching');
    expect(retried.statusDetail).toBeNull();
  });

  it('throws RequestTransitionError when approving a request that is not pending', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
    });
    const service = createRequestService(makeDeps(db));

    expect(() => service.approve(req.id)).toThrow(RequestTransitionError);
  });

  it('throws RequestTransitionError when rejecting a request that is not pending', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'downloading',
    });
    const service = createRequestService(makeDeps(db));

    expect(() => service.reject(req.id)).toThrow(RequestTransitionError);
  });

  it('throws RequestTransitionError when retrying a request that is not failed', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'completed',
    });
    const service = createRequestService(makeDeps(db));

    expect(() => service.retry(req.id)).toThrow(RequestTransitionError);
  });

  it('throws RequestNotFoundError for an id that does not exist', () => {
    const db = openDatabase(':memory:');
    const service = createRequestService(makeDeps(db));

    expect(() => service.approve('does-not-exist')).toThrow(RequestNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// grab
// ---------------------------------------------------------------------------

describe('grab', () => {
  it('throws RequestNotFoundError for a missing id', async () => {
    const db = openDatabase(':memory:');
    const service = createRequestService(makeDeps(db));

    await expect(service.grab('does-not-exist')).rejects.toThrow(RequestNotFoundError);
  });

  it('resumes a request already in searching, so retry-then-grab works', async () => {
    // Regression: `retry()` moves failed → searching, and the transition table has no
    // self-loop, so a `grab()` that insisted on transitioning would throw here — leaving
    // the request parked in `searching` with nothing driving it forward.
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'failed',
    });
    updateRequestRow(db, req.id, { statusDetail: 'qbittorrent is unreachable' });
    registerIndexer(
      makeIndexer('prowlarr', { search: async () => [release({ indexerId: 'prowlarr' })] }),
    );
    configureIndexer(db, 'prowlarr', { secret: 'api-key' });
    registerDownloadClient(makeDownloadClient('qbittorrent'));
    configureDownloadClient(db, 'qbittorrent', { secret: '{"username":"u","password":"p"}' });
    const service = createRequestService(makeDeps(db));

    const retried = service.retry(req.id);
    expect(retried.status).toBe('searching');
    expect(retried.statusDetail).toBeNull();

    const grabbed = await service.grab(req.id);
    expect(grabbed.status).toBe('downloading');
  });

  it('throws RequestTransitionError when the request cannot move to searching', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
    });
    const service = createRequestService(makeDeps(db));

    await expect(service.grab(req.id)).rejects.toThrow(RequestTransitionError);
  });

  it('uses the stored release, calls resolveDownload, and records the handle', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const resolveDownload = vi.fn(async (r: Release) => ({
      ...r,
      magnetUri: 'magnet:?xt=urn:btih:resolved',
    }));
    registerIndexer(makeIndexer('audiobookbay', { resolveDownload }));
    configureIndexer(db, 'audiobookbay');
    const add = vi.fn(async () => 'info-hash-1');
    registerDownloadClient(makeDownloadClient('transmission', { add }));
    configureDownloadClient(db, 'transmission');

    const stored = release({
      indexerId: 'audiobookbay',
      guid: 'stored',
      magnetUri: null,
      downloadUrl: null,
    });
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
      release: stored,
    });
    const service = createRequestService(makeDeps(db));

    const grabbed = await service.grab(req.id);

    expect(resolveDownload).toHaveBeenCalledWith(stored);
    expect(add).toHaveBeenCalledTimes(1);
    expect(grabbed.status).toBe('downloading');
    expect(grabbed.downloadHandle).toBe('info-hash-1');
    expect(grabbed.clientId).toBe('transmission');
    expect(grabbed.indexerId).toBe('audiobookbay');
    expect(grabbed.release?.magnetUri).toBe('magnet:?xt=urn:btih:resolved');
  });

  it('does not call resolveDownload when the indexer does not offer it', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerIndexer(makeIndexer('audiobookbay')); // no resolveDownload at all
    configureIndexer(db, 'audiobookbay');
    registerDownloadClient(makeDownloadClient('transmission'));
    configureDownloadClient(db, 'transmission');

    const stored = release({
      indexerId: 'audiobookbay',
      guid: 'stored',
      magnetUri: 'magnet:?xt=urn:btih:already',
    });
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
      release: stored,
    });
    const service = createRequestService(makeDeps(db));

    const grabbed = await service.grab(req.id);

    expect(grabbed.status).toBe('downloading');
    expect(grabbed.release?.magnetUri).toBe('magnet:?xt=urn:btih:already');
  });

  it('searches and picks the top result when no release is stored', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const search = vi.fn(async () => [
      release({ indexerId: 'audiobookbay', guid: 'low', seeders: 1 }),
      release({ indexerId: 'audiobookbay', guid: 'high', seeders: 9 }),
    ]);
    registerIndexer(makeIndexer('audiobookbay', { search }));
    configureIndexer(db, 'audiobookbay');
    registerDownloadClient(makeDownloadClient('transmission'));
    configureDownloadClient(db, 'transmission');

    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      author: 'Frank Herbert',
      status: 'approved',
    });
    const service = createRequestService(makeDeps(db));

    const grabbed = await service.grab(req.id);

    expect(search).toHaveBeenCalledWith({ term: 'Dune', author: 'Frank Herbert' });
    expect(grabbed.release?.guid).toBe('high');
    expect(grabbed.status).toBe('downloading');
  });

  it('fails with a reason when nothing is found', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerIndexer(makeIndexer('audiobookbay'));
    configureIndexer(db, 'audiobookbay');
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
    });
    const service = createRequestService(makeDeps(db));

    const failed = await service.grab(req.id);

    expect(failed.status).toBe('failed');
    expect(failed.statusDetail).toMatch(/no releases found/i);
  });

  it('fails with a reason when no download client is configured', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const stored = release({ indexerId: 'audiobookbay', magnetUri: 'magnet:?xt=urn:btih:x' });
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
      release: stored,
    });
    const service = createRequestService(makeDeps(db));

    const failed = await service.grab(req.id);

    expect(failed.status).toBe('failed');
    expect(failed.statusDetail).toMatch(/no download client/i);
  });

  it('fails with a reason when the release has no usable link', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(makeDownloadClient('transmission'));
    configureDownloadClient(db, 'transmission');
    const stored = release({ indexerId: 'audiobookbay', magnetUri: null, downloadUrl: null });
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
      release: stored,
    });
    const service = createRequestService(makeDeps(db));

    const failed = await service.grab(req.id);

    expect(failed.status).toBe('failed');
    expect(failed.statusDetail).toMatch(/magnet|download url/i);
  });

  it('falls back to the release as-is when its indexer is no longer enabled', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(makeDownloadClient('transmission'));
    configureDownloadClient(db, 'transmission');
    // 'audiobookbay' is neither registered nor configured — the owning indexer lookup misses.
    const stored = release({
      indexerId: 'audiobookbay',
      magnetUri: 'magnet:?xt=urn:btih:already',
    });
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
      release: stored,
    });
    const service = createRequestService(makeDeps(db));

    const grabbed = await service.grab(req.id);

    expect(grabbed.status).toBe('downloading');
    expect(grabbed.release?.magnetUri).toBe('magnet:?xt=urn:btih:already');
  });

  it('fails with a reason when the download client rejects the add', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        add: async () => {
          throw new ProviderError('rejected', 'transmission', 'disk full');
        },
      }),
    );
    configureDownloadClient(db, 'transmission');
    const stored = release({ indexerId: 'audiobookbay', magnetUri: 'magnet:?xt=urn:btih:x' });
    const req = createRequestRow(db, {
      id: 'r1',
      userId: user.id,
      title: 'Dune',
      status: 'approved',
      release: stored,
    });
    const service = createRequestService(makeDeps(db));

    const failed = await service.grab(req.id);

    expect(failed.status).toBe('failed');
    expect(failed.statusDetail).toBe('disk full');
  });
});

// ---------------------------------------------------------------------------
// pollDownloads
// ---------------------------------------------------------------------------

describe('pollDownloads', () => {
  it('advances progress without changing status mid-download', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        status: async () => downloadStatus({ state: 'downloading', progress: 0.42 }),
      }),
    );
    configureDownloadClient(db, 'transmission');
    const req = makeDownloadingRequest(db, user.id);
    const service = createRequestService(makeDeps(db));

    await service.pollDownloads();

    const updated = getRequestRow(db, req.id);
    expect(updated?.status).toBe('downloading');
    expect(updated?.progress).toBe(0.42);
  });

  it.each(['completed', 'seeding'] as const)(
    'completes the request and rescans the book library when the client reports %s',
    async (state) => {
      const db = openDatabase(':memory:');
      const user = makeUser(db);
      registerDownloadClient(
        makeDownloadClient('transmission', {
          status: async () => downloadStatus({ state, progress: 1 }),
        }),
      );
      configureDownloadClient(db, 'transmission');
      const req = makeDownloadingRequest(db, user.id);
      const scanLibrary = vi.fn(async () => {});
      const service = createRequestService(
        makeDeps(db, { absFor: () => makeFakeAbs({ scanLibrary }) }),
      );

      await service.pollDownloads();

      const updated = getRequestRow(db, req.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.statusDetail).toBeNull();
      expect(scanLibrary).toHaveBeenCalledWith('lib-books');
    },
  );

  it('triggers exactly one rescan across two pollDownloads calls for the same completed request', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        status: async () => downloadStatus({ state: 'completed', progress: 1 }),
      }),
    );
    configureDownloadClient(db, 'transmission');
    makeDownloadingRequest(db, user.id);
    const scanLibrary = vi.fn(async () => {});
    const service = createRequestService(
      makeDeps(db, { absFor: () => makeFakeAbs({ scanLibrary }) }),
    );

    await service.pollDownloads();
    await service.pollDownloads();

    expect(scanLibrary).toHaveBeenCalledTimes(1);
  });

  it('marks the request failed with the client error message when the client reports error', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        status: async () => downloadStatus({ state: 'error', errorMessage: 'disk full' }),
      }),
    );
    configureDownloadClient(db, 'transmission');
    const req = makeDownloadingRequest(db, user.id);
    const service = createRequestService(makeDeps(db));

    await service.pollDownloads();

    const updated = getRequestRow(db, req.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.statusDetail).toBe('disk full');
  });

  it('marks the request failed when it vanished from the download client', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        status: async () => downloadStatus({ state: 'missing' }),
      }),
    );
    configureDownloadClient(db, 'transmission');
    const req = makeDownloadingRequest(db, user.id);
    const service = createRequestService(makeDeps(db));

    await service.pollDownloads();

    const updated = getRequestRow(db, req.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.statusDetail).toMatch(/vanished/i);
  });

  it('marks the request failed when its download client is no longer configured', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    // No download client registered or configured at all — 'transmission' is orphaned.
    const req = makeDownloadingRequest(db, user.id, { clientId: 'transmission' });
    const service = createRequestService(makeDeps(db));

    await service.pollDownloads();

    const updated = getRequestRow(db, req.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.statusDetail).toMatch(/no longer configured/i);
  });

  it('still completes the request when the library rescan fails, noting that it did not run', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        status: async () => downloadStatus({ state: 'completed', progress: 1 }),
      }),
    );
    configureDownloadClient(db, 'transmission');
    const req = makeDownloadingRequest(db, user.id);
    const service = createRequestService(
      makeDeps(db, {
        absFor: () =>
          makeFakeAbs({
            getLibraries: async () => {
              throw new Error('audiobookshelf unreachable');
            },
          }),
      }),
    );

    await service.pollDownloads();

    const updated = getRequestRow(db, req.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.statusDetail).toMatch(/rescan/i);
  });

  it('still completes the request when there is no book library to rescan', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        status: async () => downloadStatus({ state: 'completed', progress: 1 }),
      }),
    );
    configureDownloadClient(db, 'transmission');
    const req = makeDownloadingRequest(db, user.id);
    const scanLibrary = vi.fn(async () => {});
    const service = createRequestService(
      makeDeps(db, {
        absFor: () =>
          makeFakeAbs({
            // Only a podcast library exists — no `mediaType: 'book'` entry to scan.
            getLibraries: async () => [
              { id: 'lib-podcasts', name: 'Podcasts', mediaType: 'podcast', icon: null },
            ],
            scanLibrary,
          }),
      }),
    );

    await service.pollDownloads();

    const updated = getRequestRow(db, req.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.statusDetail).toMatch(/no book library/i);
    expect(scanLibrary).not.toHaveBeenCalled();
  });

  it('does not abort the loop when one request throws mid-poll', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    registerDownloadClient(
      makeDownloadClient('transmission', {
        status: async (handle: string) => {
          if (handle === 'bad-hash') throw new Error('unexpected boom');
          return downloadStatus({ state: 'downloading', progress: 0.5 });
        },
      }),
    );
    configureDownloadClient(db, 'transmission');
    makeDownloadingRequest(db, user.id, { id: 'bad', downloadHandle: 'bad-hash' });
    const good = makeDownloadingRequest(db, user.id, { id: 'good', downloadHandle: 'good-hash' });
    const service = createRequestService(makeDeps(db));

    await service.pollDownloads();

    const updatedGood = getRequestRow(db, good.id);
    expect(updatedGood?.status).toBe('downloading');
    expect(updatedGood?.progress).toBe(0.5);
  });
});
