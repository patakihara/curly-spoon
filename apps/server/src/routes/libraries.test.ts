import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { FAKE_NON_ADMIN_CREDENTIALS } from '../testSupport/fakes/fakeAbs.js';

async function authedApp() {
  const { app } = buildTestApp();
  const cookie = await loginTestUser(app);
  return { app, cookie };
}

/** Logs in as 'morty' — the fixture's non-admin user, seeded with zero progress
 * (see fakeAbs.ts's progress-seeding comment) — for exercising the cold-start
 * path of GET /libraries/:id/recommended without a second fixture user. */
async function authedAppAsMorty(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: FAKE_NON_ADMIN_CREDENTIALS,
  });
  const setCookieHeader = response.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!cookieHeader) throw new Error(`test login failed: ${response.statusCode} ${response.body}`);
  const match = /auralis_session=([^;]+)/.exec(cookieHeader);
  if (!match?.[1]) throw new Error('login response carried no session cookie');
  return match[1];
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
    // 10 fixture books as of wave 13b, which widened the catalog (more genres,
    // authors, and shared-author/series/narrator items) to give the
    // recommendations scorer something to rank — was 5 before item-crimson
    // through item-emberwars2 existed.
    expect(body.total).toBe(10);
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

describe('GET /api/v1/libraries/:id/recommended', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns shelves with real items and non-empty reasons, and excludes the progressed item', async () => {
    const { app, cookie } = await authedApp();

    // Seed listening history through the real PATCH path (not fixture
    // defaults, which would leak into every other test using this fake —
    // see fakeAbs.ts's comment on `progressByKey`). item-crimson (finished)
    // and item-emberwars1 (in progress) each share an author/narrator/series
    // with another fixture book, so the scorer has something to rank.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-crimson',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 500, duration: 500, progress: 1, isFinished: true },
    });
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-emberwars1',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 240, duration: 600, progress: 0.4, isFinished: false },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.length).toBeGreaterThan(0);

    for (const shelf of shelves) {
      expect(shelf.items.length).toBeGreaterThanOrEqual(2);
      expect(typeof shelf.reason).toBe('string');
      expect(shelf.reason.length).toBeGreaterThan(0);
      // Every returned item must be a real, resolved LibraryItem, not a bare id.
      for (const item of shelf.items) {
        expect(typeof item.media.title).toBe('string');
      }
    }

    // The wiring this test exists to catch: a route that built shelves but
    // forgot to exclude known items would still return 200 with
    // plausible-looking carousels — this is the one assertion that would
    // fail if that exclusion silently broke.
    const allItemIds = shelves.flatMap((s: { items: { id: string }[] }) =>
      s.items.map((i) => i.id),
    );
    expect(allItemIds).not.toContain('item-crimson');
    expect(allItemIds).not.toContain('item-emberwars1');
  });

  it('returns no shelves for a user with no listening history (cold start)', async () => {
    const { app } = buildTestApp();
    const cookie = await authedAppAsMorty(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ shelves: [] });
  });
});
