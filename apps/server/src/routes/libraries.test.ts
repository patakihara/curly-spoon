import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';

async function authedApp() {
  const { app } = buildTestApp();
  const cookie = await loginTestUser(app);
  return { app, cookie };
}

describe('GET /api/v1/libraries', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/libraries' });
    expect(response.statusCode).toBe(401);
  });

  it('returns the normalised library list', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { libraries } = response.json();
    expect(libraries).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'lib-books', mediaType: 'book' })]),
    );
  });
});

describe('GET /api/v1/libraries/:id/home', () => {
  it('returns personalized shelves with normalised items', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/home',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.some((s: { label: string }) => s.label === 'Continue Listening')).toBe(true);
    const continueListening = shelves.find(
      (s: { label: string }) => s.label === 'Continue Listening',
    );
    expect(continueListening.items[0].media.kind).toBe('book');
  });
});

describe('GET /api/v1/libraries/:id/items', () => {
  it('paginates and returns minified items by default', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/items?limit=2&page=0',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(2);
    // 5 fixture books as of the multi-book "The Lord of the Rings" series added
    // for the series/author detail-page wave (docs/HANDOVER.md 2026-08-07) —
    // was 3 before item-twotowers/item-return existed.
    expect(body.total).toBe(5);
    expect(body.items[0].media.tracks).toBeUndefined();
  });

  it('returns expanded items when minified=false is requested', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/items?minified=false',
      cookies: { auralis_session: cookie },
    });

    const body = response.json();
    const dune = body.items.find((i: { id: string }) => i.id === 'item-dune');
    expect(dune.media.tracks).toHaveLength(2);
  });

  it('rejects an invalid query param with 400', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/items?limit=not-a-number',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });

  // A library id can arrive from a stale bookmark, a link shared after the
  // library was deleted, or a hand-typed URL. Audiobookshelf answers those with
  // a 404, and the BFF must pass that through as one rather than inventing an
  // empty (or worse, a *different* library's) result — a page that silently
  // shows the wrong library's books is harder to notice than one that says the
  // library is gone.
  it('passes an unknown library through as 404', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-does-not-exist/items',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});

describe('GET /api/v1/libraries/:id/series', () => {
  it('returns normalised series with member books', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/series',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { series } = response.json();
    expect(series.find((s: { name: string }) => s.name === 'Dune').books).toHaveLength(1);
  });
});

describe('GET /api/v1/libraries/:id/search', () => {
  it('finds matching items by title', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/search?q=dune',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { books } = response.json();
    expect(books).toHaveLength(1);
    expect(books[0].media.title).toBe('Dune');
  });

  it('requires a non-empty q', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/search',
      cookies: { auralis_session: cookie },
    });
    expect(response.statusCode).toBe(400);
  });
});
