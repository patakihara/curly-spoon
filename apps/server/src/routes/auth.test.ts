import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { FAKE_CREDENTIALS } from '../testSupport/fakes/fakeAbs.js';

describe('POST /api/v1/auth/login', () => {
  it('signs in with valid credentials and sets an httpOnly session cookie', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: FAKE_CREDENTIALS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: expect.any(String), username: 'kara' } });

    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain('auralis_session=');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Lax');
  });

  it('rejects wrong credentials with 401 invalid_credentials, never a raw upstream 401', async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'kara', password: 'wrong' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('invalid_credentials');
  });

  it('rejects login before /setup has been completed', async () => {
    const { app } = buildTestApp({ configured: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: FAKE_CREDENTIALS,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('not_configured');
  });

  it('rejects a malformed body with 400', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it('never returns the upstream token or any secret in the response body', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: FAKE_CREDENTIALS,
    });
    const raw = response.body;
    expect(raw).not.toMatch(/token/i);
  });

  it('rate-limits repeated login attempts from the same client', async () => {
    const { app } = buildTestApp();

    let lastStatus = 0;
    for (let i = 0; i < 11; i += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'kara', password: 'wrong' },
      });
      lastStatus = response.statusCode;
    }

    expect(lastStatus).toBe(429);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session so a subsequent authenticated call is rejected', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { auralis_session: cookie },
    });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { auralis_session: cookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it('succeeds even with no session cookie at all', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(response.statusCode).toBe(200);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthenticated');
  });

  it('returns the normalised user profile for a signed-in user', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ username: 'kara' });
  });

  it('never leaks the upstream token in the /me response', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { auralis_session: cookie },
    });

    expect(response.body).not.toMatch(/upstream-token|"token"/i);
  });

  it('rejects a garbage session cookie', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { auralis_session: 'not-a-real-session' },
    });
    expect(response.statusCode).toBe(401);
  });
});
