import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import {
  FAKE_JELLYFIN_BASE_URL,
  FAKE_JELLYFIN_CREDENTIALS,
} from '../testSupport/fakes/fakeJellyfin.js';
import { NotConfiguredError } from '../absUpstream.js';
import type { AbsClient, LibraryItem } from '@auralis/abs-client';
import type { Album, JellyfinClient } from '@auralis/jellyfin-client';

async function authedApp() {
  const { app } = buildTestApp();
  const cookie = await loginTestUser(app);
  return { app, cookie };
}

async function connectJellyfin(app: Awaited<ReturnType<typeof authedApp>>['app'], cookie: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/jellyfin/login',
    payload: { baseUrl: FAKE_JELLYFIN_BASE_URL, ...FAKE_JELLYFIN_CREDENTIALS },
    cookies: { auralis_session: cookie },
  });
  if (response.statusCode !== 200) {
    throw new Error(`jellyfin login failed in test setup: ${response.statusCode} ${response.body}`);
  }
}

/**
 * Finishes `item-fellowship` (J.R.R. Tolkien, genre `Fantasy`, series "The Lord of the
 * Rings"). This produces two tied-weight facets from one seed: `genre:Fantasy` and
 * `author:J.R.R. Tolkien`. `shelves.ts`'s `facetCandidates.sort` breaks weight ties by
 * `value.localeCompare` ascending, and `"Fantasy" < "J.R.R. Tolkien"`, so the genre
 * facet is considered *first* and claims the pool before the author facet can. That
 * ordering matters here: the remaining unseeded Fantasy-genre pool is
 * `item-twotowers`/`item-return` (same author, same series — `dedupeByParent` collapses
 * them to one), `item-hobbit` (same author, no series, its own parent key), and this
 * wave's new fixture `item-wyrmwood` (a podcast, genre `Fantasy`, different author) —
 * so the genre facet's post-dedupe pool spans **two `media.kind`s**, exactly the mixed
 * shelf this route exists to produce. (Picking a genre shared *only* by same-author
 * books — e.g. `Mystery`'s Mara Voss titles — does not work: the author facet would tie
 * and sort first there, consuming both books before the genre facet ever ran, leaving
 * the podcast alone with fewer than the 2 items a shelf requires.)
 */
async function finishFantasySeed(
  app: Awaited<ReturnType<typeof authedApp>>['app'],
  cookie: string,
) {
  await app.inject({
    method: 'PATCH',
    url: '/api/v1/progress/item-fellowship',
    cookies: { auralis_session: cookie },
    payload: { currentTime: 500, duration: 500, progress: 1, isFinished: true },
  });
}

describe('GET /api/v1/recommended', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/recommended' });
    expect(response.statusCode).toBe(401);
  });

  it('returns an empty 200 response when neither upstream has any signal (cold start, Jellyfin never connected)', async () => {
    const { app, cookie } = await authedApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ shelves: [] });
  });

  // The headline assertion this wave exists for: a real HTTP round trip produces a
  // shelf whose `itemIds` span two `media.kind`s, and `itemLabels` — 15c-1's
  // mechanism, never reachable from any route until this one — survives serialization
  // with the exact pinned label strings.
  it('produces a mixed book+podcast shelf with populated itemLabels', async () => {
    const { app, cookie } = await authedApp();
    await finishFantasySeed(app, cookie);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.length).toBeGreaterThan(0);

    const fantasyShelf = shelves.find((s: { id: string }) => s.id === 'shelf-genre-fantasy');
    expect(fantasyShelf).toBeDefined();

    const kinds = new Set(fantasyShelf.items.map((item: { kind: string }) => item.kind));
    expect(kinds.size).toBeGreaterThan(1);
    expect(kinds).toEqual(new Set(['book', 'podcast']));

    expect(fantasyShelf.itemLabels).toBeDefined();
    // Pinned exactly, per spec — a test that cannot fail is a pin, not a proof. Built
    // from the shelf's own items (rather than hardcoding ids) because `dedupeByParent`
    // may keep either of `item-twotowers`/`item-return` — the label string pinned per
    // kind is what must never drift, not which specific Tolkien sequel survives.
    const expectedLabels: Record<string, string> = {};
    for (const item of fantasyShelf.items as { id: string; kind: string }[]) {
      expectedLabels[item.id] = item.kind === 'podcast' ? 'Podcast' : 'Audiobook';
    }
    expect(fantasyShelf.itemLabels).toEqual(expectedLabels);
    // And the shelf must genuinely contain more than one book, not just one book plus
    // the podcast — otherwise the pin above would trivially pass with a 2-item shelf.
    expect(fantasyShelf.items.length).toBeGreaterThanOrEqual(3);

    // Every item in every shelf of this route is `owned` — no external discovery is
    // mixed into this response (see `recommended.ts`'s header comment).
    for (const shelf of shelves) {
      for (const item of shelf.items) {
        expect(item.availability).toBe('owned');
      }
    }
  });

  // The regression guard for wave 15c-2-S-2's trap. `recommended.ts` namespaces every
  // candidate/signal id (`abs:`/`jf:`) before handing the pool to the scoring core, so a
  // colliding Audiobookshelf id and Jellyfin id no longer shadow each other in
  // `shelves.ts`'s maps — but `shelf.itemLabels` is keyed by that same namespaced id, and
  // if the route stripped the prefix from `items[].id` without *also* stripping it from
  // every `itemLabels` key, the keys would match no rendered card and the mixed-shelf
  // labelling feature would silently stop working while every other assertion still
  // passed. This must fail if either side is left prefixed.
  it('itemLabels keys are exactly the bare item ids of the shelf, not the internal namespaced pool ids', async () => {
    const { app, cookie } = await authedApp();
    await finishFantasySeed(app, cookie);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    const mixedShelves = shelves.filter(
      (s: { itemLabels?: Record<string, string> }) => s.itemLabels !== undefined,
    );
    // Guard the guard: this test proves nothing if no shelf in the fixture actually
    // spans more than one kind.
    expect(mixedShelves.length).toBeGreaterThan(0);

    for (const shelf of mixedShelves as {
      items: { id: string }[];
      itemLabels: Record<string, string>;
    }[]) {
      const itemIds = shelf.items.map((item) => item.id).sort();
      const labelKeys = Object.keys(shelf.itemLabels).sort();
      expect(labelKeys).toEqual(itemIds);
    }

    // No internal namespace prefix ever reaches the wire, on any shelf.
    for (const shelf of shelves as { items: { id: string }[] }[]) {
      for (const item of shelf.items) {
        expect(item.id.startsWith('abs:')).toBe(false);
        expect(item.id.startsWith('jf:')).toBe(false);
      }
    }
  });

  // Required test 2 (the collision case). Constructs a mock where an Audiobookshelf
  // book and a Jellyfin album share the literal upstream id `collide-1`. Before this
  // wave's fix, `shelves.ts`'s `candidatesById`/`used`/`itemLabels` maps were keyed by
  // this bare id, so the last-written pool's candidate would silently shadow the
  // other everywhere — `toMixedItem`'s Audiobookshelf-first lookup would then render
  // whichever candidate happened to still resolve, mislabelled, while the other
  // vanished from the shelf entirely. With namespacing, both candidates carry distinct
  // internal ids (`abs:collide-1` / `jf:collide-1`) and both survive into the response.
  it('keeps a colliding Audiobookshelf item and Jellyfin album distinct, both surviving as correctly-kinded items', async () => {
    const { app, cookie } = await authedApp();

    const seedBook: LibraryItem = {
      id: 'seed-book',
      libraryId: 'lib-1',
      addedAt: null,
      updatedAt: null,
      coverPath: null,
      size: 0,
      progress: null,
      media: {
        kind: 'book',
        title: 'Seed Book',
        subtitle: null,
        authors: [{ name: 'Seed Author' }],
        narrator: null,
        series: [],
        genres: ['Fantasy'],
        publishedYear: null,
        description: null,
        isbn: null,
        asin: null,
        duration: 0,
        tracks: undefined,
        chapters: undefined,
      },
    };

    // Same literal id as `collideAlbum` below — the collision this test exists to
    // exercise. Different genre-matching author than the seed so it isn't itself
    // treated as a second seed.
    const collideBook: LibraryItem = {
      id: 'collide-1',
      libraryId: 'lib-1',
      addedAt: null,
      updatedAt: null,
      coverPath: '/cover/collide-book.jpg',
      size: 0,
      progress: null,
      media: {
        kind: 'book',
        title: 'Colliding Book',
        subtitle: null,
        authors: [{ name: 'Other Author' }],
        narrator: null,
        series: [],
        genres: ['Fantasy'],
        publishedYear: null,
        description: null,
        isbn: null,
        asin: null,
        duration: 0,
        tracks: undefined,
        chapters: undefined,
      },
    };

    const fakeAbsClient = {
      async getMe() {
        return {
          id: 'user-1',
          username: 'collision-tester',
          permissions: {},
          // Finishes `seed-book`, establishing genre affinity for 'Fantasy' — the
          // facet the two colliding candidates below both match.
          mediaProgress: [
            {
              id: 'mp-1',
              libraryItemId: 'seed-book',
              episodeId: null,
              duration: 100,
              currentTime: 100,
              progress: 1,
              isFinished: true,
              lastUpdate: Date.now(),
              startedAt: null,
              finishedAt: Date.now(),
            },
          ],
          bookmarks: [],
        };
      },
      async getLibraries() {
        return [{ id: 'lib-1', name: 'Lib', mediaType: 'book' as const, icon: null, folders: [] }];
      },
      async getLibraryItems() {
        return { items: [seedBook, collideBook], total: 2, limit: 300, page: 0 };
      },
    };

    // Same literal id as `collideBook` above.
    const collideAlbum: Album = {
      id: 'collide-1',
      name: 'Colliding Album',
      sortName: null,
      artistId: null,
      artistName: 'Album Artist',
      productionYear: null,
      overview: null,
      genres: ['Fantasy'],
      imageTag: 'tag-collide',
      trackCount: 10,
      favorite: false,
      playCount: 0,
      lastPlayedAt: null,
      musicBrainzAlbumId: null,
      musicBrainzReleaseGroupId: null,
    };

    const fakeJellyfinClient = {
      async getAlbums() {
        return { items: [collideAlbum], total: 1, startIndex: 0 };
      },
      async getTracks() {
        return { items: [], total: 0, startIndex: 0 };
      },
    };

    vi.spyOn(app.abs, 'forUser').mockReturnValue(fakeAbsClient as unknown as AbsClient);
    vi.spyOn(app.jellyfin, 'forUser').mockReturnValue(
      fakeJellyfinClient as unknown as JellyfinClient,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    const fantasyShelf = shelves.find((s: { id: string }) => s.id === 'shelf-genre-fantasy');
    expect(fantasyShelf).toBeDefined();

    const items = fantasyShelf.items as {
      kind: string;
      id: string;
      title: string;
      subtitle: string | null;
      coverPath: string | null;
      imageTag: string | null;
    }[];

    // The headline assertion: without the fix, only one of these two survives (the
    // last write into `shelves.ts`'s bare-id-keyed maps) — so the shelf would contain
    // exactly one item bearing id `collide-1`, not two.
    const collidingItems = items.filter((item) => item.id === 'collide-1');
    expect(collidingItems).toHaveLength(2);

    const book = collidingItems.find((item) => item.kind === 'book');
    const album = collidingItems.find((item) => item.kind === 'album');
    expect(book).toBeDefined();
    expect(album).toBeDefined();

    // Each retains its own upstream data — neither shadows the other's title/cover.
    expect(book?.title).toBe('Colliding Book');
    expect(book?.coverPath).toBe('/cover/collide-book.jpg');
    expect(album?.title).toBe('Colliding Album');
    expect(album?.imageTag).toBe('tag-collide');

    // `items[].id` is the bare upstream id on the wire — no `abs:`/`jf:` prefix leaks.
    for (const item of items) {
      expect(item.id.startsWith('abs:')).toBe(false);
      expect(item.id.startsWith('jf:')).toBe(false);
    }

    vi.restoreAllMocks();
  });

  it('degrades to Audiobookshelf-only (book/podcast) shelves when Jellyfin is unconfigured', async () => {
    const { app, cookie } = await authedApp();
    await finishFantasySeed(app, cookie);
    // Jellyfin is never connected in this test — `app.jellyfin.forUser` throws
    // `JellyfinNotConfiguredError` before any network call, exactly as it does for a
    // household that has never connected Jellyfin.

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.length).toBeGreaterThan(0);
    for (const shelf of shelves) {
      for (const item of shelf.items) {
        expect(['book', 'podcast']).toContain(item.kind);
      }
    }
  });

  it('degrades to Jellyfin-only (album) shelves when Audiobookshelf fails', async () => {
    const { app, cookie } = await authedApp();
    await connectJellyfin(app, cookie);

    // Stand in for Audiobookshelf being unreachable — real unconfiguration can't be
    // exercised here because the Auralis session itself is authenticated via ABS
    // (`buildTestApp({ configured: false })` makes login itself fail 409), so this
    // mocks the same failure `app.abs.forUser` would throw in that state. Same
    // technique `libraries.test.ts` uses for the mirror-image Jellyfin case.
    vi.spyOn(app.abs, 'forUser').mockImplementation(() => {
      throw new NotConfiguredError();
    });

    // Real Jellyfin listening history, so the music side has genuine signal:
    // driftwave-1 finished, matching `libraries.test.ts`'s own seeding.
    await app.inject({
      method: 'POST',
      url: '/api/v1/jellyfin/playback/stopped',
      cookies: { auralis_session: cookie },
      payload: { itemId: 'track-driftwave-1', positionSeconds: 200 },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { shelves } = response.json();
    expect(shelves.length).toBeGreaterThan(0);
    for (const shelf of shelves) {
      for (const item of shelf.items) {
        expect(item.kind).toBe('album');
      }
    }

    vi.restoreAllMocks();
  });

  it('returns 200 with an empty shelf list when both upstreams fail', async () => {
    const { app, cookie } = await authedApp();
    // Jellyfin is never connected (throws JellyfinNotConfiguredError internally), and
    // Audiobookshelf is mocked to fail the same way the previous test does.
    vi.spyOn(app.abs, 'forUser').mockImplementation(() => {
      throw new NotConfiguredError();
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ shelves: [] });

    vi.restoreAllMocks();
  });

  it('logs a real Audiobookshelf fault instead of hiding it, while Jellyfin still serves', async () => {
    const { app, cookie } = await authedApp();
    await connectJellyfin(app, cookie);
    const warn = vi.spyOn(app.log, 'warn');

    vi.spyOn(app.abs, 'forUser').mockImplementation(() => {
      throw new Error('upstream exploded');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(warn).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('stays silent (no warn log) when Jellyfin is simply not configured', async () => {
    const { app, cookie } = await authedApp();
    const warn = vi.spyOn(app.log, 'warn');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommended',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(warn).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
