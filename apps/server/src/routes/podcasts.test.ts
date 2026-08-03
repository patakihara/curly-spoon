import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { FAKE_NON_ADMIN_CREDENTIALS } from '../testSupport/fakes/fakeAbs.js';
import { resolveSession } from '../auth/sessionService.js';
import { setUpstreamToken } from '../db/secretsRepo.js';

const KNOWN_FEED_URL = 'https://feeds.fake.abs.local/daily-tech.xml';

async function authedApp() {
  const { app, sessionSecret } = buildTestApp();
  const cookie = await loginTestUser(app);
  return { app, cookie, sessionSecret };
}

/** Logs in as the fake's non-admin fixture user — same cookie-extraction shape as
 * `loginTestUser`, just against a different credential pair. */
async function loginAsNonAdmin(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: FAKE_NON_ADMIN_CREDENTIALS,
  });
  const setCookieHeader = response.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!cookieHeader) throw new Error(`non-admin login failed: ${response.statusCode}`);
  const match = /auralis_session=([^;]+)/.exec(cookieHeader);
  if (!match?.[1]) throw new Error('non-admin login response carried no session cookie');
  return match[1];
}

describe('GET /api/v1/podcasts/search', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/podcasts/search?term=daily+tech',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns normalised results for a matching term', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/podcasts/search?term=daily+tech',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { results } = response.json();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: 'The Daily Tech Digest',
      feedUrl: KNOWN_FEED_URL,
    });
  });

  it('returns an empty array (not an error) for a term with no matches', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/podcasts/search?term=no+such+podcast+at+all',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [] });
  });

  it('is reachable by a non-admin account (no admin gate upstream)', async () => {
    const { app } = buildTestApp();
    const cookie = await loginAsNonAdmin(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/podcasts/search?term=daily+tech',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('POST /api/v1/podcasts/feed', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts/feed',
      payload: { rssFeed: KNOWN_FEED_URL },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns a normalised feed preview for an admin account', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts/feed',
      payload: { rssFeed: KNOWN_FEED_URL },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { preview } = response.json();
    expect(preview.title).toBe('The Daily Tech Digest');
    expect(preview.episodes).toHaveLength(1);
    expect(preview.episodes[0]).toMatchObject({ title: 'Episode 1: Welcome', duration: '3600' });
  });

  it('rejects a non-admin account with 403 upstream_forbidden, not a 401', async () => {
    const { app } = buildTestApp();
    const cookie = await loginAsNonAdmin(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts/feed',
      payload: { rssFeed: KNOWN_FEED_URL },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('upstream_forbidden');
  });

  it('rejects a non-absolute-URL rssFeed with 400 before ever calling upstream', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts/feed',
      payload: { rssFeed: 'not-a-url' },
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/podcasts', () => {
  const subscribeBody = {
    libraryId: 'lib-podcasts',
    folderId: 'folder-podcasts',
    folderPath: '/data/podcasts',
    rssFeed: KNOWN_FEED_URL,
    title: 'The Daily Tech Digest',
    metadata: { author: 'Tech Media Collective' },
  };

  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts',
      payload: subscribeBody,
    });
    expect(response.statusCode).toBe(401);
  });

  it('creates the podcast library item for an admin account', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts',
      payload: subscribeBody,
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(201);
    const { item } = response.json();
    expect(item.libraryId).toBe('lib-podcasts');
    expect(item.media.kind).toBe('podcast');
    expect(item.media.title).toBe('The Daily Tech Digest');
  });

  it('rejects a non-admin account with 403 upstream_forbidden, not a 401', async () => {
    const { app } = buildTestApp();
    const cookie = await loginAsNonAdmin(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts',
      payload: subscribeBody,
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('upstream_forbidden');
  });

  it('rejects a missing title with 400 before ever calling upstream', async () => {
    const { app, cookie } = await authedApp();
    const { title: _title, ...withoutTitle } = subscribeBody;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts',
      payload: withoutTitle,
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('upstream 401 vs 403 reach the HTTP layer as genuinely different responses', () => {
  it('a stale/invalid stored token 401s as upstream_auth_expired on an ungated route', async () => {
    const { app, cookie, sessionSecret } = await authedApp();
    const { userId } = resolveSession(app.db, cookie)!;
    // Corrupt the stored upstream token so the fake's own auth check fails, producing a
    // genuine upstream 401 — distinct from the BFF's own session-cookie guard (which
    // this request still passes, since the *session* cookie itself is untouched).
    setUpstreamToken(app.db, userId, 'corrupted-not-a-real-token', sessionSecret);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/podcasts/search?term=daily+tech',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('upstream_auth_expired');
  });

  it('a valid non-admin token 403s as upstream_forbidden on an admin-gated route', async () => {
    const { app } = buildTestApp();
    const cookie = await loginAsNonAdmin(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/podcasts/feed',
      payload: { rssFeed: KNOWN_FEED_URL },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('upstream_forbidden');
    expect(response.json().error.code).not.toBe('upstream_auth_expired');
  });
});
