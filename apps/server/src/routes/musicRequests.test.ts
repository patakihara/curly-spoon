import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { setProviderConfig } from '../db/providerConfigRepo.js';
import { createRequest } from '../db/requestsRepo.js';
import type { MusicCandidate } from '../requests/types.js';
import {
  createFakeSlskdUpstream,
  FAKE_SLSKD_API_KEY,
  FAKE_SLSKD_BASE_URL,
} from '../testSupport/fakes/fakeSlskd.js';

function candidate(overrides: Partial<MusicCandidate> = {}): MusicCandidate {
  return {
    guid: JSON.stringify({ username: 'peer-a', filename: 'Artist/Album/Track.mp3', size: 4000 }),
    providerId: 'slskd',
    sourceName: 'peer-a',
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    sizeBytes: 4000,
    bitrateKbps: 320,
    format: 'mp3',
    ...overrides,
  };
}

/** `requests.user_id` is a foreign key into the local `users` table, populated only by a
 * real login — `loginTestUser` must run first. Mirrors `routes/requests.test.ts`'s helper
 * of the same name. */
function firstUserId(app: FastifyInstance): string {
  const row = app.db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  if (!row) throw new Error('firstUserId: no user row — call loginTestUser(app) first');
  return row.id;
}

/** Seeds one **book** request row directly at the repo layer — used only to prove the
 * music routes correctly refuse to see/act on it. */
function seedBookRequest(app: FastifyInstance, id: string, userId: string) {
  return createRequest(app.db, { id, userId, title: 'A Book', status: 'pending' });
}

function configureSlskd(
  app: Awaited<ReturnType<typeof buildTestApp>>['app'],
  sessionSecret: string,
  overrides: { enabled?: boolean; secret?: string | null; baseUrl?: string } = {},
) {
  setProviderConfig(
    app.db,
    {
      id: 'slskd',
      kind: 'music',
      enabled: overrides.enabled ?? true,
      baseUrl: overrides.baseUrl ?? FAKE_SLSKD_BASE_URL,
      options: {},
      secret: overrides.secret === undefined ? FAKE_SLSKD_API_KEY : overrides.secret,
    },
    sessionSecret,
  );
}

// -----------------------------------------------------------------------------
// Authentication
// -----------------------------------------------------------------------------

describe('authentication', () => {
  const endpoints: Array<{ method: 'GET' | 'POST' | 'DELETE'; url: string }> = [
    { method: 'GET', url: '/api/v1/music-requests/search?term=echo' },
    { method: 'GET', url: '/api/v1/music-requests' },
    { method: 'POST', url: '/api/v1/music-requests' },
    { method: 'GET', url: '/api/v1/music-requests/abc' },
    { method: 'POST', url: '/api/v1/music-requests/abc/approve' },
    { method: 'POST', url: '/api/v1/music-requests/abc/reject' },
    { method: 'POST', url: '/api/v1/music-requests/abc/retry' },
    { method: 'POST', url: '/api/v1/music-requests/abc/grab' },
    { method: 'DELETE', url: '/api/v1/music-requests/abc' },
  ];

  it.each(endpoints)('rejects $method $url without a session', async ({ method, url }) => {
    const { app } = buildTestApp();
    const response = await app.inject({ method, url });
    expect(response.statusCode).toBe(401);
  });
});

// -----------------------------------------------------------------------------
// GET /api/v1/music-requests/search
// -----------------------------------------------------------------------------

describe('GET /api/v1/music-requests/search', () => {
  it('400s a missing term', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests/search',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns candidates from an enabled, credentialed slskd', async () => {
    const upstream = createFakeSlskdUpstream();
    upstream.setNextSearch([
      {
        username: 'peer-a',
        files: [{ filename: 'Artist/Album/01 - Track.mp3', size: 4_000_000, bitRate: 320 }],
      },
    ]);
    const { app, sessionSecret } = buildTestApp({ providerFetch: upstream.fetch });
    const cookie = await loginTestUser(app);
    configureSlskd(app, sessionSecret);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests/search?term=track',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.errors).toEqual([]);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      providerId: 'slskd',
      sourceName: 'peer-a',
      title: '01 - Track',
      artist: 'Artist',
      album: 'Album',
    });
  });

  it('degrades to an empty candidate list with a reported error when slskd rejects the key, rather than 500ing', async () => {
    const upstream = createFakeSlskdUpstream();
    const { app, sessionSecret } = buildTestApp({ providerFetch: upstream.fetch });
    const cookie = await loginTestUser(app);
    configureSlskd(app, sessionSecret, { secret: 'the-wrong-key' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests/search?term=track',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.candidates).toEqual([]);
    expect(body.errors).toEqual([
      { providerId: 'slskd', kind: 'unauthorized', message: 'slskd rejected the API key.' },
    ]);
  });

  it('returns no candidates when no music provider is configured at all', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests/search?term=track',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ candidates: [], errors: [] });
  });
});

// -----------------------------------------------------------------------------
// POST/GET /api/v1/music-requests — create and list
// -----------------------------------------------------------------------------

describe('POST /api/v1/music-requests', () => {
  it('creates a request from a candidate, landing in approved under the default policy', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate: candidate() },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.request).toMatchObject({
      title: 'Track',
      author: 'Artist',
      mediaType: 'music',
      status: 'approved',
    });
    expect(body.request.candidate).toEqual(candidate());
  });

  it('400s a body missing candidate', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: {},
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/v1/music-requests', () => {
  it('lists a created request', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate: candidate() },
      cookies: { auralis_session: cookie },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().requests).toHaveLength(1);
  });

  // Regression pin for migration 4 (`db/migrations.ts`), the music-side mirror of
  // `routes/requests.test.ts`'s "never lists a music request" pin: a book row must never
  // appear on this route either.
  it('never lists a book request, even when one exists alongside a music request', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedBookRequest(app, 'r-book', firstUserId(app));
    await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate: candidate() },
      cookies: { auralis_session: cookie },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const requests = response.json().requests as Array<{ mediaType: string }>;
    expect(requests.map((r) => r.mediaType)).toEqual(['music']);
  });
});

describe('GET /api/v1/music-requests/:id', () => {
  it('404s for a book request id — this is the music route', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedBookRequest(app, 'r-book', firstUserId(app));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests/r-book',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/music-requests/:id', () => {
  it('404s for a book request id, leaving it undeleted', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedBookRequest(app, 'r-book', firstUserId(app));

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/music-requests/r-book',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
    expect(app.db.prepare('SELECT id FROM requests WHERE id = ?').get('r-book')).toBeDefined();
  });

  it('deletes its own row and returns 204', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate: candidate() },
      cookies: { auralis_session: cookie },
    });
    const id = created.json().request.id as string;

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/music-requests/${id}`,
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(204);
  });
});

// -----------------------------------------------------------------------------
// POST /api/v1/music-requests/:id/grab — wires the provider's real add()
// -----------------------------------------------------------------------------

describe('POST /api/v1/music-requests/:id/grab', () => {
  it("enqueues the request's candidate with slskd and lands on downloading", async () => {
    const upstream = createFakeSlskdUpstream();
    const { app, sessionSecret } = buildTestApp({ providerFetch: upstream.fetch });
    const cookie = await loginTestUser(app);
    setProviderConfig(
      app.db,
      {
        id: 'slskd',
        kind: 'music',
        enabled: true,
        baseUrl: FAKE_SLSKD_BASE_URL,
        options: {},
        secret: FAKE_SLSKD_API_KEY,
      },
      sessionSecret,
    );
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate: candidate() },
      cookies: { auralis_session: cookie },
    });
    const id = created.json().request.id as string;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/music-requests/${id}/grab`,
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.request.status).toBe('downloading');
    expect(body.request.indexerId).toBe('slskd');
    // slskd.ts's `encodeHandle` — `{ username, id }` JSON, not a `username::id` string.
    expect(JSON.parse(body.request.downloadHandle)).toMatchObject({ username: 'peer-a' });
  });

  it('409s grabbing a request still pending under manual approval', async () => {
    const { app, sessionSecret } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response0 = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/requests',
      payload: { approvalPolicy: 'manual' },
      cookies: { auralis_session: cookie },
    });
    expect(response0.statusCode).toBe(200);
    setProviderConfig(
      app.db,
      { id: 'slskd', kind: 'music', enabled: true, baseUrl: FAKE_SLSKD_BASE_URL, options: {} },
      sessionSecret,
    );
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate: candidate() },
      cookies: { auralis_session: cookie },
    });
    expect(created.json().request.status).toBe('pending');
    const id = created.json().request.id as string;

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/music-requests/${id}/grab`,
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(409);
  });

  it('404s for a book request id', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    seedBookRequest(app, 'r-book', firstUserId(app));

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests/r-book/grab',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

// -----------------------------------------------------------------------------
// The existing /providers routes already cover slskd — pin that they do
// -----------------------------------------------------------------------------

describe('GET /api/v1/providers includes the music provider', () => {
  it('lists slskd alongside the indexer and download-client descriptors', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const slskd = response.json().providers.find((p: { id: string }) => p.id === 'slskd');
    expect(slskd).toMatchObject({
      kind: 'music',
      requiresBaseUrl: true,
      requiresSecret: true,
      configured: false,
    });
  });
});

describe('PUT /api/v1/providers/slskd', () => {
  it('stores the API key and reports it configured, without ever echoing it back', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/providers/slskd',
      payload: {
        enabled: true,
        baseUrl: FAKE_SLSKD_BASE_URL,
        secret: { apiKey: FAKE_SLSKD_API_KEY },
      },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ id: 'slskd', kind: 'music', configured: true, hasSecret: true });
    expect(JSON.stringify(body)).not.toContain(FAKE_SLSKD_API_KEY);
  });
});

describe('POST /api/v1/providers/slskd/test', () => {
  it('succeeds against a correctly configured slskd', async () => {
    const upstream = createFakeSlskdUpstream();
    const { app, sessionSecret } = buildTestApp({ providerFetch: upstream.fetch });
    const cookie = await loginTestUser(app);
    configureSlskd(app, sessionSecret, { enabled: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/slskd/test',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('maps a rejected API key to 401 provider_unauthorized', async () => {
    const upstream = createFakeSlskdUpstream();
    const { app, sessionSecret } = buildTestApp({ providerFetch: upstream.fetch });
    const cookie = await loginTestUser(app);
    configureSlskd(app, sessionSecret, { secret: 'the-wrong-key' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/slskd/test',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('provider_unauthorized');
  });

  it('maps an unreachable slskd to 502 provider_unreachable, and never names the configured host', async () => {
    const upstream = createFakeSlskdUpstream();
    const { app, sessionSecret } = buildTestApp({ providerFetch: upstream.fetch });
    const cookie = await loginTestUser(app);
    configureSlskd(app, sessionSecret, { baseUrl: 'http://slskd.internal.example.test:5030' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/slskd/test',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('provider_unreachable');
    expect(JSON.stringify(response.json())).not.toContain('slskd.internal.example.test');
  });
});

// -----------------------------------------------------------------------------
// No route in this file ever leaks the slskd API key into a response body
// -----------------------------------------------------------------------------

describe('no music-provider route ever leaks the configured slskd API key', () => {
  it('sweeps search, provider listing, provider config and provider test — success and failure paths', async () => {
    const upstream = createFakeSlskdUpstream();
    upstream.setNextSearch([
      { username: 'peer-a', files: [{ filename: 'Artist/Album/Track.mp3', size: 1000 }] },
    ]);
    const { app, sessionSecret } = buildTestApp({ providerFetch: upstream.fetch });
    const cookie = await loginTestUser(app);
    configureSlskd(app, sessionSecret);

    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/music-requests/search?term=track',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/providers',
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'PUT',
        url: '/api/v1/providers/slskd',
        payload: { secret: { apiKey: FAKE_SLSKD_API_KEY } },
        cookies: { auralis_session: cookie },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/providers/slskd/test',
        cookies: { auralis_session: cookie },
      }),
    ]);

    // A wrong-key run, separately, so its 401 body is swept too.
    configureSlskd(app, sessionSecret, { secret: 'a-completely-different-wrong-key' });
    const unauthorizedRun = await app.inject({
      method: 'POST',
      url: '/api/v1/providers/slskd/test',
      cookies: { auralis_session: cookie },
    });
    // Restore the working key before create/grab — they must succeed to be worth sweeping.
    configureSlskd(app, sessionSecret);

    // create then grab, sequential (grab needs the id create returns) — the API key must
    // never surface in either body, including inside the round-tripped `candidate`/handle.
    const createRun = await app.inject({
      method: 'POST',
      url: '/api/v1/music-requests',
      payload: { candidate: candidate() },
      cookies: { auralis_session: cookie },
    });
    const grabRun = await app.inject({
      method: 'POST',
      url: `/api/v1/music-requests/${createRun.json().request.id}/grab`,
      cookies: { auralis_session: cookie },
    });

    for (const response of [...responses, unauthorizedRun, createRun, grabRun]) {
      const raw = response.body;
      expect(raw).not.toContain(FAKE_SLSKD_API_KEY);
      expect(raw).not.toContain('a-completely-different-wrong-key');
      const headerBlob = JSON.stringify(response.headers);
      expect(headerBlob).not.toContain(FAKE_SLSKD_API_KEY);
    }
  });
});
