/**
 * Regression coverage for `useJellyfinTracksQuery`'s sort order — see the doc comment on
 * `TRACK_ORDER_SORT_BY` in `queries.ts` for the reasoning. `MusicAlbumPage.tsx` builds both
 * its track list *and* its playback queue straight from this query's result, so if the hook
 * forwards no `sortBy`, the BFF falls through to Jellyfin's own default (`SortName`) and an
 * album lists — and plays — its tracks alphabetically by title instead of in album order,
 * which is the one ordering this hook exists to serve (it has no other caller).
 *
 * This exercises the hook as a plain function, mocking `useQuery`/`useApi` rather than
 * rendering a component: the root Vitest config runs `apps/web/src/**` in a plain `node`
 * environment with no DOM and no React Testing Library, so there is no render available to a
 * `.test.ts` file here — component/page behaviour is covered by Playwright instead.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getJellyfinTracks = vi.fn();
const getJellyfinArtists = vi.fn();
const markJellyfinFavorite = vi.fn();
const unmarkJellyfinFavorite = vi.fn();

/** Same content-based key hashing the production rollback guard uses (`hashKey` from
 * `@tanstack/react-query`, mocked below) — every query key in this file is a flat array
 * of primitives, so `JSON.stringify` is an exact stand-in. */
function hashKey(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

/** A minimal in-memory stand-in for the real query cache. Most tests below don't need
 * this and seed nothing (an empty cache, same as before); the overlapping-mutation race
 * test does, because it depends on one mutation's `onMutate`/`onError` actually seeing
 * the cache effects of a second, concurrent mutation's `onMutate` — something a purely
 * canned `mockReturnValue` can't express. */
let fakeCache: Map<string, { key: readonly unknown[]; data: unknown }>;

function seedCache(entries: [readonly unknown[], unknown][]): void {
  for (const [key, data] of entries) fakeCache.set(hashKey(key), { key, data });
}

const mockQueryClient = {
  cancelQueries: vi.fn(),
  getQueriesData: vi.fn((): [readonly unknown[], unknown][] => []),
  setQueriesData: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
};

vi.mock('@tanstack/react-query', () => ({
  // Real `useQuery`/`useMutation` schedule work through React; these tests only care what
  // options the hook *would* configure them with, so the mocks just hand the options object
  // straight back for inspection — same idiom `useJellyfinTracksQuery`'s existing test below
  // already established for `useQuery` alone. `hashKey` is real production surface
  // (`queries.ts`'s rollback guard keys its applied-state map with it) — reimplemented
  // here as plain `JSON.stringify`, an exact match for the flat-array keys this file uses.
  useQuery: (options: { queryFn: (ctx: { signal?: AbortSignal }) => unknown }) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => mockQueryClient,
  hashKey: (key: readonly unknown[]) => JSON.stringify(key),
}));

vi.mock('./ApiContext.js', () => ({
  useApi: () => ({
    getJellyfinTracks,
    getJellyfinArtists,
    markJellyfinFavorite,
    unmarkJellyfinFavorite,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeCache = new Map();
  // Wire the query-client mocks to the fake cache above by default. A test that wants
  // canned, non-interacting behaviour (most of the ones below) can still override any of
  // these with its own `.mockReturnValue`/`.mockResolvedValue`, same as before.
  mockQueryClient.getQueriesData.mockImplementation(() =>
    Array.from(fakeCache.values()).map((entry) => [entry.key, entry.data]),
  );
  mockQueryClient.setQueriesData.mockImplementation(
    (_filter: unknown, updater: (data: unknown) => unknown) => {
      for (const entry of fakeCache.values()) entry.data = updater(entry.data);
    },
  );
  mockQueryClient.getQueryData.mockImplementation(
    (key: readonly unknown[]) => fakeCache.get(hashKey(key))?.data,
  );
  mockQueryClient.setQueryData.mockImplementation((key: readonly unknown[], data: unknown) => {
    const existing = fakeCache.get(hashKey(key));
    if (existing) existing.data = data;
    else fakeCache.set(hashKey(key), { key, data });
  });
});

/** What the mocked `useQuery` above actually hands back — the real `useJellyfinTracksQuery`
 * return type is React Query's `UseQueryResult`, which has no `queryFn`; the mock returns
 * the raw options object instead, so this is that object's shape, not the hook's real one. */
interface CapturedQueryOptions {
  queryFn: (ctx: { signal?: AbortSignal }) => unknown;
}

describe('useJellyfinTracksQuery', () => {
  it("requests tracks in album order (disc, then track number), not Jellyfin's alphabetical default", async () => {
    const { useJellyfinTracksQuery } = await import('./queries.js');
    const { queryFn } = useJellyfinTracksQuery('album-1', 0) as unknown as CapturedQueryOptions;
    await queryFn({ signal: undefined });

    expect(getJellyfinTracks).toHaveBeenCalledWith(
      expect.objectContaining({
        albumId: 'album-1',
        startIndex: 0,
        sortBy: 'ParentIndexNumber,IndexNumber',
      }),
      undefined,
    );
  });
});

describe('useJellyfinArtistQuery', () => {
  it('fetches exactly one artist by id, not a full listing', async () => {
    const { useJellyfinArtistQuery } = await import('./queries.js');
    const { queryFn } = useJellyfinArtistQuery('artist-1') as unknown as CapturedQueryOptions;
    await queryFn({ signal: undefined });

    expect(getJellyfinArtists).toHaveBeenCalledWith({ id: 'artist-1', limit: 1 }, undefined);
  });
});

describe('useJellyfinFavoriteArtistsQuery', () => {
  it('requests only favourited artists', async () => {
    const { useJellyfinFavoriteArtistsQuery } = await import('./queries.js');
    const { queryFn } = useJellyfinFavoriteArtistsQuery() as unknown as CapturedQueryOptions;
    await queryFn({ signal: undefined });

    expect(getJellyfinArtists).toHaveBeenCalledWith(
      expect.objectContaining({ favoritesOnly: true }),
      undefined,
    );
  });
});

describe('useToggleJellyfinFavoriteMutation', () => {
  /** `applied` is the new field: a snapshot of what *this* mutation's own `onMutate`
   * just wrote, keyed the same way `previous` is. `onError`'s rollback guard uses it to
   * tell "nothing has touched this query since I wrote it" (safe to roll back) apart from
   * "a later overlapping mutation already wrote something newer on top" (rolling back
   * would clobber that newer state with this mutation's now-stale pre-write snapshot) —
   * see the race test below and `queries.ts`'s own `onError` comment for the full
   * reasoning. */
  interface CapturedMutationOptions {
    mutationFn: (vars: { itemId: string; favorite: boolean }) => Promise<unknown>;
    onMutate: (vars: { itemId: string; favorite: boolean }) => Promise<{
      previous: [readonly unknown[], unknown][];
      applied: [readonly unknown[], unknown][];
    }>;
    onError: (
      err: unknown,
      vars: unknown,
      context:
        | { previous: [readonly unknown[], unknown][]; applied: [readonly unknown[], unknown][] }
        | undefined,
    ) => void;
    onSettled: () => void;
  }

  async function loadMutation(): Promise<CapturedMutationOptions> {
    const { useToggleJellyfinFavoriteMutation } = await import('./queries.js');
    return useToggleJellyfinFavoriteMutation() as unknown as CapturedMutationOptions;
  }

  it('calls markJellyfinFavorite when the target state is favorite: true', async () => {
    const options = await loadMutation();
    await options.mutationFn({ itemId: 'album-1', favorite: true });
    expect(markJellyfinFavorite).toHaveBeenCalledWith('album-1');
    expect(unmarkJellyfinFavorite).not.toHaveBeenCalled();
  });

  it('calls unmarkJellyfinFavorite when the target state is favorite: false', async () => {
    const options = await loadMutation();
    await options.mutationFn({ itemId: 'album-1', favorite: false });
    expect(unmarkJellyfinFavorite).toHaveBeenCalledWith('album-1');
    expect(markJellyfinFavorite).not.toHaveBeenCalled();
  });

  it('onMutate cancels in-flight jellyfin queries, snapshots the cache, then applies the optimistic update', async () => {
    const cachedPage = { items: [{ id: 'album-1', favorite: false }], total: 1, startIndex: 0 };
    const pageKey = ['jellyfin', 'albums', 'artist-1', 0];
    seedCache([[pageKey, cachedPage]]);

    const options = await loadMutation();
    const context = await options.onMutate({ itemId: 'album-1', favorite: true });

    expect(mockQueryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: ['jellyfin'] });
    expect(mockQueryClient.setQueriesData).toHaveBeenCalledWith(
      { queryKey: ['jellyfin'] },
      expect.any(Function),
    );
    // The snapshot handed back is what onError rolls back to — confirm it's exactly the
    // pre-write cache contents, not a re-derived or partial copy.
    expect(context.previous).toEqual([[pageKey, cachedPage]]);

    // `applied` is what onError's rollback guard compares the *current* cache against to
    // detect a later mutation having overwritten this entry — it must reflect this call's
    // own optimistic write, not the pre-write snapshot `previous` holds.
    expect(context.applied).toEqual([
      [pageKey, { items: [{ id: 'album-1', favorite: true }], total: 1, startIndex: 0 }],
    ]);

    // The updater passed to setQueriesData is `withFavoriteState` applied with this
    // mutation's own itemId/favorite — confirm it actually flips the cached page rather
    // than being a no-op or wired to the wrong arguments.
    const [, updater] = mockQueryClient.setQueriesData.mock.calls[0] as [
      unknown,
      (d: unknown) => unknown,
    ];
    expect(updater(cachedPage)).toEqual({
      items: [{ id: 'album-1', favorite: true }],
      total: 1,
      startIndex: 0,
    });
  });

  it('onError rolls back a query to its pre-toggle value when nothing has touched it since this mutation applied its own optimistic write', async () => {
    const originalPage = { items: [{ id: 'album-1', favorite: false }], total: 1, startIndex: 0 };
    const pageKey = ['jellyfin', 'albums', 'artist-1', 0];
    seedCache([[pageKey, originalPage]]);

    const options = await loadMutation();
    const context = await options.onMutate({ itemId: 'album-1', favorite: true });

    options.onError(new Error('upstream failed'), { itemId: 'album-1', favorite: true }, context);

    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(pageKey, originalPage);
  });

  it('onError is a no-op when onMutate never ran (no snapshot to roll back)', async () => {
    const options = await loadMutation();
    options.onError(new Error('boom'), { itemId: 'album-1', favorite: true }, undefined);
    expect(mockQueryClient.setQueryData).not.toHaveBeenCalled();
  });

  it("onError does not clobber a second, overlapping mutation's optimistic write with its own stale snapshot", async () => {
    // Two different items (album-1, album-2) sitting on the same cached page — realistic,
    // since an artist's album grid holds every album, not just the one being toggled.
    // `favorite: false` for both to start.
    const page = {
      items: [
        { id: 'album-1', favorite: false },
        { id: 'album-2', favorite: false },
      ],
      total: 2,
      startIndex: 0,
    };
    const pageKey = ['jellyfin', 'albums', 'artist-1', 0];
    seedCache([[pageKey, page]]);

    // First toggle: album-1 favourited. Second toggle fires — a different item, but on
    // the same cached page — before the first one's request has settled.
    const first = await loadMutation();
    const firstContext = await first.onMutate({ itemId: 'album-1', favorite: true });

    const second = await loadMutation();
    await second.onMutate({ itemId: 'album-2', favorite: true });

    // The first request now fails, *after* the second's optimistic write already landed.
    first.onError(
      new Error('upstream failed'),
      { itemId: 'album-1', favorite: true },
      firstContext,
    );

    // The second mutation's optimistic favourite must survive the first one's rollback —
    // restoring the first mutation's pre-write snapshot (both albums `favorite: false`)
    // would otherwise blindly erase album-2's state too, even though its own mutation is
    // still in flight and hasn't failed.
    expect(fakeCache.get(hashKey(pageKey))?.data).toEqual({
      items: [
        // album-1 is left as the second mutation's write last set it, not necessarily
        // rolled back — self-heals via either mutation's own onSettled invalidation,
        // same as the bounded impact the failing toggle already has without this guard.
        { id: 'album-1', favorite: true },
        { id: 'album-2', favorite: true },
      ],
      total: 2,
      startIndex: 0,
    });
  });

  it('onSettled invalidates the whole jellyfin cache slice to reconcile with the server', async () => {
    const options = await loadMutation();
    options.onSettled();
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['jellyfin'] });
  });
});
