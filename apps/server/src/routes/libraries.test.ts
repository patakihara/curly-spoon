import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LibraryItem } from '@auralis/abs-client';
import type { ExternalProviderFactory, TasteProfile } from '../features/recommendations/index.js';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { FAKE_NON_ADMIN_CREDENTIALS } from '../testSupport/fakes/fakeAbs.js';
import {
  FAKE_JELLYFIN_BASE_URL,
  FAKE_JELLYFIN_CREDENTIALS,
} from '../testSupport/fakes/fakeJellyfin.js';
import { buildBookExternalDiscoveryShelf } from './libraries.js';

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

  // Wave 13e-2: cross-media genre affinity. `mergeGenreAffinity`'s own correctness
  // (a matching genre transfers, scaled by `CROSS_MEDIA_GENRE_WEIGHT`; totalSignal is
  // untouched; author/narrator/series never leak across media) is already proven at the
  // pure-core level in `features/recommendations/crossMediaGenre.test.ts`, against a
  // fixture built specifically to overlap — this fixture library's real book genres
  // (Fantasy, Mystery, Horror, War, Science Fiction) and the Jellyfin fake's real music
  // genres (Synthwave, Ambient) do not share a single string, matching the real-world
  // thin-overlap concern `crossMediaGenre.ts`'s doc comment names. So this route-level
  // test proves the *wiring* instead: connecting Jellyfin and having real music listening
  // history must not change this route's cold-start behaviour, error, or leak into a
  // response when nothing here can actually match.
  it('a connected Jellyfin account with music listening history does not break or change the cold-start response', async () => {
    const { app } = buildTestApp();
    const cookie = await authedAppAsMorty(app);

    const jellyfinLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/login',
      payload: { baseUrl: FAKE_JELLYFIN_BASE_URL, ...FAKE_JELLYFIN_CREDENTIALS },
      cookies: { auralis_session: cookie },
    });
    expect(jellyfinLogin.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/stopped',
      cookies: { auralis_session: cookie },
      payload: { itemId: 'track-driftwave-1', positionSeconds: 200 },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    // Still cold start on the books side — a non-overlapping music genre must not
    // conjure a book shelf out of nothing, and `mergeGenreAffinity` deliberately never
    // raises `totalSignal`, so the books route's own cold-start gate is unaffected by
    // Jellyfin listening history alone.
    expect(response.json()).toEqual({ shelves: [] });
  });

  // The cross-media enrichment swallows every failure so the books route keeps working
  // without Jellyfin — correct, and the reason it must not swallow *quietly*. An
  // unconfigured Jellyfin is not a fault and is silent; anything else is a real fault
  // that would otherwise be invisible forever, which is precisely how a broken feature
  // goes on reporting success (`docs/HANDOVER.md`, four occurrences).
  it('logs a real enrichment fault instead of hiding it, while still serving recommendations', async () => {
    const { app } = buildTestApp();
    const cookie = await authedAppAsMorty(app);

    const warn = vi.spyOn(app.log, 'warn');
    // Not a configuration error — this stands in for a network failure, an upstream
    // shape change, or a genuine bug inside the music adapter.
    vi.spyOn(app.jellyfin, 'forUser').mockImplementation(() => {
      throw new Error('upstream exploded');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    // The books route is unaffected: the enrichment is optional by design.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ shelves: [] });
    // ...but the fault reached the log rather than vanishing.
    expect(warn).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('stays silent when Jellyfin is simply not configured, which is not a fault', async () => {
    const { app } = buildTestApp();
    const cookie = await authedAppAsMorty(app);

    const warn = vi.spyOn(app.log, 'warn');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    // A household that has never connected Jellyfin hits this on every single request,
    // so logging it would be pure noise rather than a signal.
    expect(warn).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

describe('GET /api/v1/libraries/:id/recommended — external (Open Library) discovery, wave 15e-books', () => {
  const OPENLIBRARY_ORIGIN = 'https://openlibrary.org';

  function openLibraryFetch(
    respond: (url: URL) => Response,
  ): (input: string, init?: RequestInit) => Promise<Response> {
    return async (input) => {
      const url = new URL(input);
      if (url.origin !== OPENLIBRARY_ORIGIN) {
        throw new Error(`getaddrinfo ENOTFOUND ${url.hostname}`);
      }
      return respond(url);
    };
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function connectedAppWithProviderFetch(
    providerFetch: (input: string, init?: RequestInit) => Promise<Response>,
  ): Promise<{ app: FastifyInstance; cookie: string }> {
    const { app } = buildTestApp({ providerFetch });
    const cookie = await loginTestUser(app);
    return { app, cookie };
  }

  // This is the assertion the wave is judged on: a real HTTP round trip through the route,
  // proving an externally-discovered candidate reaches the response body a client actually
  // parses — not a helper function returning an array (`docs/HANDOVER.md`'s own "a test that
  // only inspects a return value can pin the wrong value as correct").
  it('mixes Open Library candidates into the response ahead of the library shelves, and drops a title she already owns', async () => {
    const { app, cookie } = await connectedAppWithProviderFetch(
      openLibraryFetch((url) => {
        expect(url.pathname).toBe('/search.json');
        expect(url.searchParams.get('author')).toBe('Mara Voss');
        return jsonResponse({
          docs: [
            // Same normalized title as the fixture's real `item-silence` (Mara Voss's own
            // owned book) — must be filtered out as owned, not surfaced as "discovery" of
            // something she already has.
            { key: '/works/OL0000001W', title: 'A Silence Kept', author_name: ['Mara Voss'] },
            { key: '/works/OL0000002W', title: 'Moonless Tide', author_name: ['Mara Voss'] },
            { key: '/works/OL0000003W', title: 'The Glass Orchard', author_name: ['Mara Voss'] },
          ],
        });
      }),
    );

    // Same seeding the library-shelf tests above use: item-crimson (Mara Voss, finished) is
    // what makes "Mara Voss" the strongest (only) author facet.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-crimson',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 500, duration: 500, progress: 1, isFinished: true },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.length).toBeGreaterThan(0);

    const externalShelf = shelves[0];
    expect(externalShelf.id).toBe('shelf-external-openlibrary');
    expect(externalShelf.type).toBe('discover');
    expect(typeof externalShelf.reason).toBe('string');
    expect(externalShelf.reason.length).toBeGreaterThan(0);

    const externalTitles = externalShelf.items.map(
      (item: { media: { title: string } }) => item.media.title,
    );
    expect(externalTitles).toEqual(expect.arrayContaining(['Moonless Tide', 'The Glass Orchard']));
    // The owned-title-match candidate must never reach the response.
    expect(externalTitles).not.toContain('A Silence Kept');
    expect(externalShelf.items).toHaveLength(2);

    // Every external item is namespaced, scoped to the requested library, and honestly
    // blank about what it doesn't know — never a fabricated Audiobookshelf id or cover.
    for (const item of externalShelf.items) {
      expect(item.id).toMatch(/^external:openlibrary:/);
      expect(item.libraryId).toBe('lib-books');
      expect(item.coverPath).toBeNull();
      expect(item.availability).toBe('external');
    }

    // The library-derived shelves (already covered above) still follow — this shelf is
    // additive, not a replacement — and their items are `owned`, not `external`, proving
    // the field isn't a blanket constant.
    expect(shelves.slice(1).every((s: { type: string }) => s.type === 'recommended')).toBe(true);
    for (const shelf of shelves.slice(1)) {
      for (const item of shelf.items) {
        expect(item.availability).toBe('owned');
      }
    }
  });

  it('degrades to library-only shelves, never fails the route, when Open Library is unreachable', async () => {
    // No `providerFetch` at all: `buildTestApp`'s default routes every non-Jellyfin origin
    // (including `openlibrary.org`) to the ABS fake, which simulates a real DNS failure for
    // any origin that isn't its own — see `fakeAbs.ts`'s `fetchFn`.
    const { app, cookie } = await authedApp();
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-crimson',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 500, duration: 500, progress: 1, isFinished: true },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.some((s: { id: string }) => s.id === 'shelf-external-openlibrary')).toBe(false);
    // Library-derived shelves still render — a broken external provider must never take
    // down the rest of the response.
    expect(shelves.length).toBeGreaterThan(0);
  });

  it('degrades to library-only shelves on a non-OK Open Library response', async () => {
    const { app, cookie } = await connectedAppWithProviderFetch(
      openLibraryFetch(() => jsonResponse({ error: 'bad request' }, 400)),
    );
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/progress/item-crimson',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 500, duration: 500, progress: 1, isFinished: true },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/libraries/lib-books/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.some((s: { id: string }) => s.id === 'shelf-external-openlibrary')).toBe(false);
  });

  // Every failure path the three tests above exercise is already absorbed inside
  // `openlibrary.ts`'s own try/catch, which never rethrows — `ExternalRecommendationProvider`
  // is contractually total (see that interface's doc comment). So `buildBookExternalDiscoveryShelf`'s
  // own outer `catch` had no test that could actually reach it: nothing in the suite fails if
  // its `app.log.warn(...)` line is deleted. This drives a provider that violates the "never
  // throws" contract directly, exercising the exported function rather than the route, since no
  // registered provider can be made to throw through `app.inject()` without breaking that
  // contract for real. `providerFactories` exists on `buildBookExternalDiscoveryShelf` for
  // exactly this — see that function's own doc comment.
  it('the outer catch degrades to no external shelf and logs the fault when a provider breaks its "never throws" contract', async () => {
    const { app } = buildTestApp();
    const warn = vi.spyOn(app.log, 'warn');

    const profile: TasteProfile = {
      affinities: { genre: {}, author: { 'Some Author': 5 }, narrator: {}, series: {} },
      seeds: [],
      knownItemIds: [],
      totalSignal: 5,
      facetSeeds: {
        genre: {},
        author: { 'Some Author': { itemId: 'item-1', title: 'Book One' } },
        narrator: {},
        series: {},
      },
    };
    const pool: { items: LibraryItem[] } = { items: [] };
    const throwingFactories: Record<string, ExternalProviderFactory> = {
      broken: () => ({
        providerName: 'broken',
        medium: 'book',
        recommend: async () => {
          throw new Error('this provider violates its own "never throws" contract');
        },
      }),
    };

    const shelf = await buildBookExternalDiscoveryShelf(
      app,
      profile,
      pool,
      'lib-books',
      throwingFactories,
    );

    expect(shelf).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
