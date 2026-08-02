import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';

describe('GET /api/v1/items/:id', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/items/item-dune' });
    expect(response.statusCode).toBe(401);
  });

  it('returns a minified item by default', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/items/item-dune',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { item } = response.json();
    expect(item.media.title).toBe('Dune');
    expect(item.media.tracks).toBeUndefined();
  });

  it('returns tracks and chapters when expanded=true', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/items/item-dune?expanded=true',
      cookies: { auralis_session: cookie },
    });

    const { item } = response.json();
    expect(item.media.tracks).toHaveLength(2);
    expect(item.media.chapters).toHaveLength(2);
  });

  it('maps an unknown item id to 404', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/items/does-not-exist',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});
