import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { setProviderConfig } from '../db/providerConfigRepo.js';
import {
  createFakeSlskdUpstream,
  FAKE_SLSKD_API_KEY,
  FAKE_SLSKD_BASE_URL,
} from '../testSupport/fakes/fakeSlskd.js';

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
  it('401s an unauthenticated search', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/music-requests/search?term=echo',
    });
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

    for (const response of [...responses, unauthorizedRun]) {
      const raw = response.body;
      expect(raw).not.toContain(FAKE_SLSKD_API_KEY);
      expect(raw).not.toContain('a-completely-different-wrong-key');
      const headerBlob = JSON.stringify(response.headers);
      expect(headerBlob).not.toContain(FAKE_SLSKD_API_KEY);
    }
  });
});
