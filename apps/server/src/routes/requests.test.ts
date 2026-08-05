import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { FetchLike } from '@auralis/abs-client';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { createRequest } from '../db/requestsRepo.js';
import { getProviderConfig, setProviderConfig } from '../db/providerConfigRepo.js';
import type { RequestStatus } from '../requests/requestStatus.js';

/** Seeds one request row, forcing `created_at` when given so ordering tests don't depend
 * on two `Date.now()` calls landing in different milliseconds. */
function seedRequest(
  app: FastifyInstance,
  overrides: {
    id?: string;
    userId?: string;
    title?: string;
    status?: RequestStatus;
    createdAt?: number;
  } = {},
) {
  const id = overrides.id ?? randomUUID();
  const created = createRequest(app.db, {
    id,
    userId: overrides.userId ?? 'user-1',
    title: overrides.title ?? 'Some Book',
    status: overrides.status ?? 'pending',
  });
  if (overrides.createdAt !== undefined) {
    app.db.prepare('UPDATE requests SET created_at = ? WHERE id = ?').run(overrides.createdAt, id);
  }
  return created;
}

/** Seeds one **music** request row directly at the repo layer — used only to prove the
 * book routes correctly refuse to see/act on it (see migration 4's comment and this wave's
 * report on why `GET /requests`/`GET /requests/:id`/`DELETE /requests/:id` must not). */
function seedMusicRequest(app: FastifyInstance, id: string, userId: string) {
  return createRequest(app.db, {
    id,
    userId,
    title: 'A Track',
    status: 'pending',
    mediaType: 'music',
    candidate: {
      guid: 'g',
      providerId: 'slskd',
      sourceName: 'peer-a',
      title: 'A Track',
      artist: null,
      album: null,
      sizeBytes: null,
      bitrateKbps: null,
      format: null,
    },
  });
}

/** `requests.user_id` is a foreign key into the local `users` table, which is only
 * populated by a real login — `loginTestUser` must run first. */
function firstUserId(app: FastifyInstance): string {
  const row = app.db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  if (!row) throw new Error('firstUserId: no user row — call loginTestUser(app) first');
  return row.id;
}

// --- provider fetch fakes ----------------------------------------------------------------

/** A Prowlarr `/api/v1/search` responder. Anything else is a test bug, so it throws. */
function prowlarrSearchFetch(handler: (url: URL) => Response): FetchLike {
  return async (input) => {
    const url = new URL(input);
    if (url.pathname === '/api/v1/search') return handler(url);
    throw new Error(`unexpected fetch in test: ${input}`);
  };
}

/**
 * A scripted qBittorrent WebUI: `POST /api/v2/auth/login` then `GET /api/v2/app/version`,
 * matching `testConnection`'s exact call sequence in `download/qbittorrent.ts`. Chosen as
 * the one provider whose `testConnection` can produce all five `ProviderErrorKind`s off
 * plain HTTP responses, so a single fake fetch drives every mapping test.
 */
function qbittorrentTestFetch(opts: {
  loginThrows?: boolean;
  loginStatus?: number;
  loginBody?: string;
  loginSetCookie?: string;
  versionStatus?: number;
}): FetchLike {
  return async (input) => {
    const url = new URL(input);
    if (url.pathname === '/api/v2/auth/login') {
      if (opts.loginThrows) throw new Error('simulated network failure');
      const headers: Record<string, string> = {};
      if (opts.loginSetCookie) headers['set-cookie'] = opts.loginSetCookie;
      return new Response(opts.loginBody ?? 'Ok.', { status: opts.loginStatus ?? 200, headers });
    }
    if (url.pathname === '/api/v2/app/version') {
      return new Response('v4.6.0', { status: opts.versionStatus ?? 200 });
    }
    throw new Error(`unexpected fetch in test: ${input}`);
  };
}

const QBIT_SECRET = JSON.stringify({ username: 'kara', password: 'hunter2' });

// -----------------------------------------------------------------------------
// Authentication
// -----------------------------------------------------------------------------

describe('authentication', () => {
  const endpoints: Array<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string }> = [
    { method: 'GET', url: '/api/v1/requests' },
    { method: 'POST', url: '/api/v1/requests' },
    { method: 'GET', url: '/api/v1/requests/search?term=dune' },
    { method: 'GET', url: '/api/v1/requests/abc' },
    { method: 'POST', url: '/api/v1/requests/abc/approve' },
    { method: 'POST', url: '/api/v1/requests/abc/reject' },
    { method: 'POST', url: '/api/v1/requests/abc/retry' },
    { method: 'POST', url: '/api/v1/requests/abc/grab' },
    { method: 'DELETE', url: '/api/v1/requests/abc' },
    { method: 'GET', url: '/api/v1/providers' },
    { method: 'PUT', url: '/api/v1/providers/prowlarr' },
    { method: 'POST', url: '/api/v1/providers/prowlarr/test' },
    { method: 'DELETE', url: '/api/v1/providers/prowlarr' },
    { method: 'GET', url: '/api/v1/settings/requests' },
    { method: 'PUT', url: '/api/v1/settings/requests' },
  ];

  it.each(endpoints)('rejects $method $url without a session', async ({ method, url }) => {
    const { app } = buildTestApp();
    const response = await app.inject({ method, url });
    expect(response.statusCode).toBe(401);
  });
});

// -----------------------------------------------------------------------------
// POST /requests
// -----------------------------------------------------------------------------

describe('POST /api/v1/requests', () => {
  it('creates a request and returns 201', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/requests',
      cookies: { auralis_session: cookie },
      payload: { title: 'Dune', author: 'Frank Herbert' },
    });

    expect(response.statusCode).toBe(201);
    // Default `approvalPolicy` is `auto`, so a fresh request lands directly in `approved`.
    expect(response.json().request).toMatchObject({
      title: 'Dune',
      author: 'Frank Herbert',
      status: 'approved',
    });
  });

  it('rejects an empty title with 400', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/requests',
      cookies: { auralis_session: cookie },
      payload: { title: '' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a whitespace-only title with 400', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/requests',
      cookies: { auralis_session: cookie },
      payload: { title: '   ' },
    });
    expect(response.statusCode).toBe(400);
  });
});

// -----------------------------------------------------------------------------
// GET /requests
// -----------------------------------------------------------------------------

describe('GET /api/v1/requests', () => {
  it('lists newest first', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const userId = firstUserId(app);
    seedRequest(app, { id: 'r-old', title: 'Old', createdAt: 1_000, userId });
    seedRequest(app, { id: 'r-new', title: 'New', createdAt: 2_000, userId });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const ids = response.json().requests.map((r: { id: string }) => r.id);
    expect(ids).toEqual(['r-new', 'r-old']);
  });

  it('filters by status', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const userId = firstUserId(app);
    seedRequest(app, { id: 'r-pending', status: 'pending', createdAt: 1_000, userId });
    seedRequest(app, { id: 'r-approved', status: 'approved', createdAt: 2_000, userId });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests?status=approved',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const ids = response.json().requests.map((r: { id: string }) => r.id);
    expect(ids).toEqual(['r-approved']);
  });

  it('rejects an invalid status with 400', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests?status=not-a-real-status',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  // Regression pin for migration 4 (`db/migrations.ts`): this route must keep behaving
  // exactly as it did before a music row could exist in the same `requests` table — see
  // `musicRequestService.ts`'s file comment and the wave's own report.
  it('never lists a music request, even when one exists alongside a book request', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const userId = firstUserId(app);
    seedRequest(app, { id: 'r-book', title: 'A Book', userId });
    seedMusicRequest(app, 'r-music', userId);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const ids = response.json().requests.map((r: { id: string }) => r.id);
    expect(ids).toEqual(['r-book']);
  });
});

// -----------------------------------------------------------------------------
// GET /requests/:id, DELETE /requests/:id
// -----------------------------------------------------------------------------

describe('GET /api/v1/requests/:id', () => {
  it('404s for a missing id', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/does-not-exist',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('returns the request', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedRequest(app, { id: 'r1', title: 'Dune', userId: firstUserId(app) });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/r1',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().request).toMatchObject({ id: 'r1', title: 'Dune' });
  });

  it('404s for a music request id — this is the book route', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedMusicRequest(app, 'r-music', firstUserId(app));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/r-music',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/requests/:id', () => {
  it('returns 204 and the request is then gone', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedRequest(app, { id: 'r1', userId: firstUserId(app) });

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/v1/requests/r1',
      cookies: { auralis_session: cookie },
    });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe('');

    const get = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/r1',
      cookies: { auralis_session: cookie },
    });
    expect(get.statusCode).toBe(404);
  });

  it('404s for a missing id', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/requests/does-not-exist',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('404s for a music request id, leaving it undeleted', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedMusicRequest(app, 'r-music', firstUserId(app));

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/requests/r-music',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
    expect(app.db.prepare('SELECT id FROM requests WHERE id = ?').get('r-music')).toBeDefined();
  });
});

// -----------------------------------------------------------------------------
// Illegal transitions
// -----------------------------------------------------------------------------

describe('POST /api/v1/requests/:id/approve', () => {
  it('rejects approving an already-approved request with 409', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedRequest(app, { id: 'r1', status: 'approved', userId: firstUserId(app) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/r1/approve',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('invalid_transition');
  });
});

describe('POST /api/v1/requests/:id/retry', () => {
  it('actually tries again rather than only resetting the status', async () => {
    // `retry` on its own moves failed → searching and stops. If the handler ever loses its
    // follow-up `grab`, the request parks in `searching` with nothing driving it forward and
    // looks permanently busy. No providers are configured here, so the grab fails — which is
    // the point: only a grab that ran can move the request out of `searching`.
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedRequest(app, { id: 'r1', status: 'failed', userId: firstUserId(app) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/requests/r1/retry',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().request.status).not.toBe('searching');
    expect(response.json().request.statusDetail).toBeTruthy();
  });
});

// -----------------------------------------------------------------------------
// GET /requests/search
// -----------------------------------------------------------------------------

describe('GET /api/v1/requests/search', () => {
  it('requires a term', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/search',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns releases from a configured, enabled indexer', async () => {
    const providerFetch = prowlarrSearchFetch(
      () =>
        new Response(
          JSON.stringify([
            {
              guid: 'guid-1',
              title: 'Dune',
              indexer: 'MyIndexer',
              size: 123_456,
              seeders: 10,
              leechers: 2,
              publishDate: '2024-01-01T00:00:00Z',
              downloadUrl: 'http://example.test/dune.torrent',
              magnetUrl: null,
              protocol: 'torrent',
              categories: [{ id: 3030, name: 'Audiobook' }],
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const { app, sessionSecret } = buildTestApp({ providerFetch });
    const cookie = await loginTestUser(app);
    setProviderConfig(
      app.db,
      {
        id: 'prowlarr',
        kind: 'indexer',
        enabled: true,
        baseUrl: 'http://prowlarr.test',
        options: {},
        secret: 'api-key-123',
      },
      sessionSecret,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/search?term=dune',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.releases).toHaveLength(1);
    expect(body.releases[0]).toMatchObject({
      guid: 'guid-1',
      indexerId: 'prowlarr',
      title: 'Dune',
    });
    expect(body.errors).toEqual([]);
  });

  it('reports a failing indexer as a per-indexer error, without failing the whole search', async () => {
    const providerFetch = prowlarrSearchFetch(
      () => new Response('server exploded', { status: 500 }),
    );
    const { app, sessionSecret } = buildTestApp({ providerFetch });
    const cookie = await loginTestUser(app);
    setProviderConfig(
      app.db,
      {
        id: 'prowlarr',
        kind: 'indexer',
        enabled: true,
        baseUrl: 'http://prowlarr.test',
        options: {},
        secret: 'api-key-123',
      },
      sessionSecret,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/search?term=dune',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.releases).toEqual([]);
    expect(body.errors).toEqual([
      { indexerId: 'prowlarr', kind: 'rejected', message: expect.any(String) },
    ]);
  });

  it('is not swallowed by /requests/:id — a search hits the search handler, not a 404 for id "search"', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/requests/search?term=anything',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('releases');
    expect(body).toHaveProperty('errors');
    expect(body).not.toHaveProperty('error');
  });
});

// -----------------------------------------------------------------------------
// GET /providers
// -----------------------------------------------------------------------------

describe('GET /api/v1/providers', () => {
  it('lists every descriptor, including unconfigured ones, and never leaks a stored secret', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);
    const secretPlaintext = 'super-secret-prowlarr-api-key';
    setProviderConfig(
      app.db,
      {
        id: 'prowlarr',
        kind: 'indexer',
        enabled: true,
        baseUrl: 'http://prowlarr.test',
        options: {},
        secret: secretPlaintext,
      },
      sessionSecret,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const ids = body.providers.map((p: { id: string }) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(['prowlarr', 'audiobookbay', 'qbittorrent', 'transmission']),
    );

    const prowlarrEntry = body.providers.find((p: { id: string }) => p.id === 'prowlarr');
    expect(prowlarrEntry).toMatchObject({
      configured: true,
      enabled: true,
      baseUrl: 'http://prowlarr.test',
      hasSecret: true,
    });

    // Unconfigured providers still appear, so the settings screen can offer them.
    const audiobookbayEntry = body.providers.find((p: { id: string }) => p.id === 'audiobookbay');
    expect(audiobookbayEntry).toMatchObject({ configured: false, enabled: false, baseUrl: null });

    expect(response.body).not.toContain(secretPlaintext);
  });
});

// -----------------------------------------------------------------------------
// PUT /providers/:id
// -----------------------------------------------------------------------------

describe('PUT /api/v1/providers/:id', () => {
  it('stores a single-field secret raw', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/prowlarr',
      cookies: { auralis_session: cookie },
      payload: { enabled: true, baseUrl: 'http://prowlarr.test', secret: { apiKey: 'abc123' } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('abc123');
    const stored = getProviderConfig(app.db, 'prowlarr', sessionSecret);
    expect(stored?.secret).toBe('abc123');
  });

  it('stores a two-field secret as JSON', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/qbittorrent',
      cookies: { auralis_session: cookie },
      payload: {
        enabled: true,
        baseUrl: 'http://qbit.test',
        secret: { username: 'kara', password: 'hunter2' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('hunter2');
    const stored = getProviderConfig(app.db, 'qbittorrent', sessionSecret);
    expect(JSON.parse(stored!.secret!)).toEqual({ username: 'kara', password: 'hunter2' });
  });

  it('keeps the other field when a multi-field secret is updated one field at a time', async () => {
    // Regression: the stored format used to be chosen by how many fields the *body* sent,
    // so a form submitting only the username wrote the bare string "kara" where JSON
    // belonged — and every later call failed with "credentials are not valid JSON", an
    // error describing neither what the user did nor how to undo it. The descriptor decides
    // the format now, and a partial update merges over what is stored.
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);

    await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/qbittorrent',
      cookies: { auralis_session: cookie },
      payload: {
        enabled: true,
        baseUrl: 'http://qbit.test',
        secret: { username: 'kara', password: 'hunter2' },
      },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/qbittorrent',
      cookies: { auralis_session: cookie },
      payload: { secret: { password: 'newpass' } },
    });

    expect(response.statusCode).toBe(200);
    const stored = getProviderConfig(app.db, 'qbittorrent', sessionSecret);
    expect(JSON.parse(stored!.secret!)).toEqual({ username: 'kara', password: 'newpass' });
  });

  it('stores a lone multi-field value as JSON, not as a bare string', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/qbittorrent',
      cookies: { auralis_session: cookie },
      payload: { enabled: true, baseUrl: 'http://qbit.test', secret: { username: 'kara' } },
    });

    expect(response.statusCode).toBe(200);
    const stored = getProviderConfig(app.db, 'qbittorrent', sessionSecret);
    expect(JSON.parse(stored!.secret!)).toEqual({ username: 'kara' });
  });

  it('keeps the stored secret when the body sends only keys the descriptor does not declare', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);

    await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/prowlarr',
      cookies: { auralis_session: cookie },
      payload: { enabled: true, baseUrl: 'http://prowlarr.test', secret: { apiKey: 'abc123' } },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/prowlarr',
      cookies: { auralis_session: cookie },
      payload: { secret: { nonsense: 'x' } },
    });

    expect(response.statusCode).toBe(200);
    expect(getProviderConfig(app.db, 'prowlarr', sessionSecret)?.secret).toBe('abc123');
  });

  it('omitting secret keeps the stored one', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);

    await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/prowlarr',
      cookies: { auralis_session: cookie },
      payload: { enabled: true, baseUrl: 'http://prowlarr.test', secret: { apiKey: 'abc123' } },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/prowlarr',
      cookies: { auralis_session: cookie },
      payload: { baseUrl: 'http://prowlarr-2.test' },
    });

    expect(response.statusCode).toBe(200);
    const stored = getProviderConfig(app.db, 'prowlarr', sessionSecret);
    expect(stored?.secret).toBe('abc123');
    expect(stored?.baseUrl).toBe('http://prowlarr-2.test');
  });

  it('an all-empty secret clears the stored one', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);

    await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/prowlarr',
      cookies: { auralis_session: cookie },
      payload: { enabled: true, baseUrl: 'http://prowlarr.test', secret: { apiKey: 'abc123' } },
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/prowlarr',
      cookies: { auralis_session: cookie },
      payload: { secret: { apiKey: '' } },
    });

    expect(response.statusCode).toBe(200);
    const stored = getProviderConfig(app.db, 'prowlarr', sessionSecret);
    expect(stored?.secret).toBeNull();
  });

  it('an unknown id is 400', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/does-not-exist',
      cookies: { auralis_session: cookie },
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('unknown_provider');
  });
});

// -----------------------------------------------------------------------------
// POST /providers/:id/test
// -----------------------------------------------------------------------------

describe('POST /api/v1/providers/:id/test', () => {
  const scenarios: Array<{
    name: string;
    status: number;
    code: string;
    fetchOpts: Parameters<typeof qbittorrentTestFetch>[0];
  }> = [
    {
      name: 'unreachable — a network failure',
      status: 502,
      code: 'provider_unreachable',
      fetchOpts: { loginThrows: true },
    },
    {
      name: 'unauthorized — qBittorrent rejects the credentials',
      status: 401,
      code: 'provider_unauthorized',
      fetchOpts: { loginBody: 'Fails.' },
    },
    {
      name: 'bad_response — login succeeds but carries no session cookie',
      status: 400,
      code: 'provider_rejected',
      fetchOpts: {},
    },
    {
      name: 'not_found — the version endpoint 404s',
      status: 404,
      code: 'provider_not_found',
      fetchOpts: { loginSetCookie: 'SID=abc123; path=/', versionStatus: 404 },
    },
    {
      name: 'rejected — the version endpoint 500s',
      status: 400,
      code: 'provider_rejected',
      fetchOpts: { loginSetCookie: 'SID=abc123; path=/', versionStatus: 500 },
    },
  ];

  it.each(scenarios)('maps $name to $status $code', async ({ fetchOpts, status, code }) => {
    const { app, sessionSecret } = buildTestApp({
      providerFetch: qbittorrentTestFetch(fetchOpts),
    });
    const cookie = await loginTestUser(app);
    setProviderConfig(
      app.db,
      {
        id: 'qbittorrent',
        kind: 'download',
        enabled: false,
        baseUrl: 'http://qbit.test',
        options: {},
        secret: QBIT_SECRET,
      },
      sessionSecret,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/qbittorrent/test',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(status);
    expect(response.json().error.code).toBe(code);
  });

  it('succeeds when qBittorrent answers normally, even while the provider is disabled', async () => {
    const { app, sessionSecret } = buildTestApp({
      providerFetch: qbittorrentTestFetch({ loginSetCookie: 'SID=abc123; path=/' }),
    });
    const cookie = await loginTestUser(app);
    setProviderConfig(
      app.db,
      {
        id: 'qbittorrent',
        kind: 'download',
        enabled: false,
        baseUrl: 'http://qbit.test',
        options: {},
        secret: QBIT_SECRET,
      },
      sessionSecret,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/qbittorrent/test',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('400s a provider with no stored configuration', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/qbittorrent/test',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(400);
  });

  it('400s an id with no descriptor', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/does-not-exist/test',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('unknown_provider');
  });
});

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------

describe('GET/PUT /api/v1/settings/requests', () => {
  it('round-trips a settings update', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/requests',
      cookies: { auralis_session: cookie },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({
      approvalPolicy: 'auto',
      bookSavePath: null,
      bookCategory: 'auralis-books',
      musicSavePath: null,
      musicCategory: 'auralis-music',
    });

    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/requests',
      cookies: { auralis_session: cookie },
      payload: {
        approvalPolicy: 'manual',
        bookSavePath: '/downloads/books',
        bookCategory: 'books',
        musicSavePath: 'music-downloads',
        musicCategory: 'tracks',
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({
      approvalPolicy: 'manual',
      bookSavePath: '/downloads/books',
      bookCategory: 'books',
      musicSavePath: 'music-downloads',
      musicCategory: 'tracks',
    });

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/requests',
      cookies: { auralis_session: cookie },
    });
    expect(after.json()).toEqual({
      approvalPolicy: 'manual',
      bookSavePath: '/downloads/books',
      bookCategory: 'books',
      musicSavePath: 'music-downloads',
      musicCategory: 'tracks',
    });
  });

  it('rejects an invalid approvalPolicy with 400', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/requests',
      cookies: { auralis_session: cookie },
      payload: { approvalPolicy: 'sometimes' },
    });

    expect(response.statusCode).toBe(400);
  });
});
