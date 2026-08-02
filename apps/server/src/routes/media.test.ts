import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';

describe('GET /api/v1/media/:itemId/cover', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/media/item-dune/cover' });
    expect(response.statusCode).toBe(401);
  });

  it('proxies the cover bytes with a cache header and forwards size params', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/cover?width=300',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['cache-control']).toContain('max-age');
    expect(response.rawPayload.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/media/:itemId/track/:fileId — Range passthrough', () => {
  it('returns the full file with a 200 and Accept-Ranges when no Range header is sent', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/file-dune-1',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(Number(response.headers['content-length'])).toBe(6300);
    expect(response.rawPayload.length).toBe(6300);
  });

  it('serves a mid-file byte range as 206 with a correct Content-Range', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/file-dune-1',
      headers: { range: 'bytes=100-199' },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe('bytes 100-199/6300');
    expect(response.headers['content-length']).toBe('100');
    expect(response.rawPayload.length).toBe(100);
  });

  it('serves an open-ended range ("bytes=6000-") to the end of the file', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/file-dune-1',
      headers: { range: 'bytes=6000-' },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe('bytes 6000-6299/6300');
    expect(response.rawPayload.length).toBe(300);
  });

  it('serves a suffix range ("bytes=-500") for the last N bytes', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/file-dune-1',
      headers: { range: 'bytes=-500' },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe('bytes 5800-6299/6300');
    expect(response.rawPayload.length).toBe(500);
  });

  it('returns 416 for a range beyond EOF, with a Content-Range reporting the real size', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/file-dune-1',
      headers: { range: 'bytes=99999-100005' },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(416);
    expect(response.headers['content-range']).toBe('bytes */6300');
    expect(response.rawPayload.length).toBe(0);
  });

  it('answers a HEAD request with the full-file headers and no body', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'HEAD',
      url: '/api/v1/media/item-dune/track/file-dune-1',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-length']).toBe('6300');
    expect(response.rawPayload.length).toBe(0);
  });

  it('answers a HEAD request with a Range header using 206 headers and no body', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'HEAD',
      url: '/api/v1/media/item-dune/track/file-dune-1',
      headers: { range: 'bytes=0-99' },
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers['content-range']).toBe('bytes 0-99/6300');
    expect(response.rawPayload.length).toBe(0);
  });

  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/file-dune-1',
    });
    expect(response.statusCode).toBe(401);
  });

  it('maps an unknown file id to 404', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/does-not-exist',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('serves the second track of a multi-track book independently', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/media/item-dune/track/file-dune-2',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.length).toBe(6300);
  });
});
