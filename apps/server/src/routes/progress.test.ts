import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';

describe('GET /api/v1/me/progress', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/me/progress' });
    expect(response.statusCode).toBe(401);
  });

  it('returns an empty list before anything has been synced', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me/progress',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().progress).toEqual([]);
  });

  it('reflects progress recorded via PATCH /progress/:itemId', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-dune',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 630, duration: 1260, progress: 0.5 },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me/progress',
      cookies: { auralis_session: cookie },
    });

    expect(response.json().progress).toEqual([
      expect.objectContaining({ libraryItemId: 'item-dune', progress: 0.5, currentTime: 630 }),
    ]);
  });
});

describe('PATCH /api/v1/progress/:itemId', () => {
  it('creates and updates progress for a book', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const first = await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-dune',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 100, duration: 1260, progress: 0.08 },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().progress.currentTime).toBe(100);

    const second = await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-dune',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 500, duration: 1260, progress: 0.4 },
    });
    expect(second.json().progress.currentTime).toBe(500);
  });

  it('supports a podcast episode via the episodeId query param, independent of the parent item', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-dailytech?episodeId=ep-dailytech-1',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 60, duration: 300 },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me/progress',
      cookies: { auralis_session: cookie },
    });

    expect(response.json().progress).toEqual([
      expect.objectContaining({ libraryItemId: 'item-dailytech', episodeId: 'ep-dailytech-1' }),
    ]);
  });

  it('rejects an out-of-range progress value', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-dune',
      cookies: { auralis_session: cookie },
      payload: { progress: 1.5 },
    });
    expect(response.statusCode).toBe(400);
  });
});
