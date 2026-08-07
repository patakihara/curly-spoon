import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';

async function authedApp() {
  const { app } = buildTestApp();
  const cookie = await loginTestUser(app);
  return { app, cookie };
}

describe('GET /api/v1/authors/:id', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/authors/author-tolkien' });
    expect(response.statusCode).toBe(401);
  });

  it("returns the author's name and every one of their books, scoped server-side", async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/authors/author-tolkien',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.name).toBe('J.R.R. Tolkien');
    const ids = body.books.map((b: { id: string }) => b.id).sort();
    expect(ids).toEqual(['item-fellowship', 'item-hobbit', 'item-return', 'item-twotowers']);
    // Every book here is a minified item, same shape as every other list/shelf
    // endpoint — this is what proves the BFF isn't reading `media.authors[].id`
    // client-side (that field is never populated on a minified item).
    expect(body.books[0].media.tracks).toBeUndefined();
  });

  // A stale link, a typo, or an author removed upstream. Audiobookshelf 404s an
  // unknown author id (source-derived from v2.36.0's `AuthorController`, not
  // live-verified — no credential available); the BFF must pass that through
  // rather than inventing an empty match, the same contract
  // `GET /libraries/:id/items` already has for an unknown library id.
  it('passes an unknown author id through as 404', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/authors/does-not-exist',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});
