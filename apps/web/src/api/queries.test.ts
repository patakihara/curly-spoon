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

const mockQueryClient = {
  cancelQueries: vi.fn(),
  getQueriesData: vi.fn((): [readonly unknown[], unknown][] => []),
  setQueriesData: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
};

vi.mock('@tanstack/react-query', () => ({
  // Real `useQuery`/`useMutation` schedule work through React; these tests only care what
  // options the hook *would* configure them with, so the mocks just hand the options object
  // straight back for inspection — same idiom `useJellyfinTracksQuery`'s existing test below
  // already established for `useQuery` alone.
  useQuery: (options: { queryFn: (ctx: { signal?: AbortSignal }) => unknown }) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => mockQueryClient,
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
  mockQueryClient.getQueriesData.mockReturnValue([]);
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
  interface CapturedMutationOptions {
    mutationFn: (vars: { itemId: string; favorite: boolean }) => Promise<unknown>;
    onMutate: (vars: {
      itemId: string;
      favorite: boolean;
    }) => Promise<{ previous: [readonly unknown[], unknown][] }>;
    onError: (
      err: unknown,
      vars: unknown,
      context: { previous: [readonly unknown[], unknown][] } | undefined,
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
    mockQueryClient.getQueriesData.mockReturnValue([
      [['jellyfin', 'albums', 'artist-1', 0], cachedPage],
    ]);

    const options = await loadMutation();
    const context = await options.onMutate({ itemId: 'album-1', favorite: true });

    expect(mockQueryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: ['jellyfin'] });
    expect(mockQueryClient.setQueriesData).toHaveBeenCalledWith(
      { queryKey: ['jellyfin'] },
      expect.any(Function),
    );
    // The snapshot handed back is what onError rolls back to — confirm it's exactly what
    // getQueriesData returned, not a re-derived or partial copy.
    expect(context.previous).toEqual([[['jellyfin', 'albums', 'artist-1', 0], cachedPage]]);

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

  it('onError rolls back every snapshotted query to its pre-toggle value', async () => {
    const options = await loadMutation();
    const previousPage = { items: [{ id: 'album-1', favorite: false }], total: 1, startIndex: 0 };
    const context: { previous: [readonly unknown[], unknown][] } = {
      previous: [[['jellyfin', 'albums', 'artist-1', 0], previousPage]],
    };

    options.onError(new Error('upstream failed'), { itemId: 'album-1', favorite: true }, context);

    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['jellyfin', 'albums', 'artist-1', 0],
      previousPage,
    );
  });

  it('onError is a no-op when onMutate never ran (no snapshot to roll back)', async () => {
    const options = await loadMutation();
    options.onError(new Error('boom'), { itemId: 'album-1', favorite: true }, undefined);
    expect(mockQueryClient.setQueryData).not.toHaveBeenCalled();
  });

  it('onSettled invalidates the whole jellyfin cache slice to reconcile with the server', async () => {
    const options = await loadMutation();
    options.onSettled();
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['jellyfin'] });
  });
});
