import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testSupport/buildTestApp.js';
import { FAKE_BASE_URL } from '../testSupport/fakes/fakeAbs.js';

describe('GET /api/v1/setup', () => {
  it('reports unconfigured before /setup has ever succeeded', async () => {
    const { app } = buildTestApp({ configured: false });
    const response = await app.inject({ method: 'GET', url: '/api/v1/setup' });
    expect(response.json()).toEqual({ configured: false, baseUrl: null });
  });

  it('reports the configured base URL', async () => {
    const { app } = buildTestApp({ configured: true });
    const response = await app.inject({ method: 'GET', url: '/api/v1/setup' });
    expect(response.json()).toEqual({ configured: true, baseUrl: FAKE_BASE_URL });
  });
});

describe('POST /api/v1/setup', () => {
  it('probes the given URL and persists it once reachability is confirmed', async () => {
    const { app } = buildTestApp({ configured: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { baseUrl: FAKE_BASE_URL },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configured: true, baseUrl: FAKE_BASE_URL });

    const after = await app.inject({ method: 'GET', url: '/api/v1/setup' });
    expect(after.json()).toEqual({ configured: true, baseUrl: FAKE_BASE_URL });
  });

  it('returns a helpful error and does not persist anything when the URL is unreachable', async () => {
    const { app } = buildTestApp({ configured: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { baseUrl: 'http://does-not-exist.invalid' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('upstream_unreachable');

    const after = await app.inject({ method: 'GET', url: '/api/v1/setup' });
    expect(after.json()).toEqual({ configured: false, baseUrl: null });
  });

  it('rejects a malformed baseUrl with a 400', async () => {
    const { app } = buildTestApp({ configured: false });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { baseUrl: 'not-a-url' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('invalid_request');
  });

  it('does not overwrite a previously working configuration with a bad one', async () => {
    const { app } = buildTestApp({ configured: true });

    await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { baseUrl: 'http://does-not-exist.invalid' },
    });

    const after = await app.inject({ method: 'GET', url: '/api/v1/setup' });
    expect(after.json().baseUrl).toBe(FAKE_BASE_URL);
  });
});
