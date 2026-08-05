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
import { describe, expect, it, vi } from 'vitest';

const getJellyfinTracks = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  // Real `useQuery` schedules a fetch; this test only cares what request the hook *would*
  // issue, so the mock just hands the options object straight back for inspection.
  useQuery: (options: { queryFn: (ctx: { signal?: AbortSignal }) => unknown }) => options,
}));

vi.mock('./ApiContext.js', () => ({
  useApi: () => ({ getJellyfinTracks }),
}));

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
