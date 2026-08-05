/**
 * The app's React Query hooks — one place mapping server state to query keys, so
 * cache invalidation (e.g. "setup changed, libraries might now be visible") is
 * declared once instead of scattered across every page that happens to read it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './ApiContext.js';
import { shouldPollRequests, REQUEST_POLL_INTERVAL_MS } from '../features/requests/polling.js';
import { withFavoriteState } from '../features/music/favorites.js';
import type {
  JellyfinLoginBody,
  ProviderUpdateBody,
  Release,
  RequestSettings,
  RequestStatus,
  SubscribePodcastBody,
} from './types.js';

export const queryKeys = {
  setup: ['setup'] as const,
  authMe: ['auth', 'me'] as const,
  libraries: ['libraries'] as const,
  libraryHome: (libraryId: string) => ['libraries', libraryId, 'home'] as const,
  libraryItems: (libraryId: string, page: number) =>
    ['libraries', libraryId, 'items', page] as const,
  librarySearch: (libraryId: string, q: string) => ['libraries', libraryId, 'search', q] as const,
  item: (itemId: string) => ['items', itemId] as const,
  requests: (status?: RequestStatus) => ['requests', status ?? 'all'] as const,
  requestSearch: (term: string, author: string) => ['requests', 'search', term, author] as const,
  providers: ['providers'] as const,
  requestSettings: ['settings', 'requests'] as const,
  podcastDirectorySearch: (term: string) => ['podcasts', 'search', term] as const,
  myProgress: ['me', 'progress'] as const,
  jellyfinConfig: ['jellyfin', 'config'] as const,
  jellyfinArtists: (startIndex: number) => ['jellyfin', 'artists', startIndex] as const,
  jellyfinAlbums: (artistId: string, startIndex: number) =>
    ['jellyfin', 'albums', artistId, startIndex] as const,
  jellyfinTracks: (albumId: string, startIndex: number) =>
    ['jellyfin', 'tracks', albumId, startIndex] as const,
  jellyfinSearch: (term: string) => ['jellyfin', 'search', term] as const,
  jellyfinLyrics: (itemId: string) => ['jellyfin', 'lyrics', itemId] as const,
  /** The single-item fetches behind an album/artist page's own favourite-state toggle —
   * see those hooks' doc comments below for why a dedicated "one item by id" query exists
   * alongside the listing queries above. */
  jellyfinArtist: (artistId: string) => ['jellyfin', 'artists', 'byId', artistId] as const,
  jellyfinAlbum: (albumId: string) => ['jellyfin', 'albums', 'byId', albumId] as const,
  jellyfinFavoriteArtists: ['jellyfin', 'artists', 'favorites'] as const,
  jellyfinFavoriteAlbums: ['jellyfin', 'albums', 'favorites'] as const,
  jellyfinFavoriteTracks: ['jellyfin', 'tracks', 'favorites'] as const,
};

export function useSetupQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.setup,
    queryFn: ({ signal }) => api.getSetupState(signal),
    staleTime: 10_000,
  });
}

export function useSubmitSetupMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (baseUrl: string) => api.submitSetup(baseUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.setup }),
  });
}

export function useLoginMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.login(username, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.authMe }),
  });
}

export function useLogoutMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => queryClient.clear(),
  });
}

export function useLibrariesQuery(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.libraries,
    queryFn: ({ signal }) => api.getLibraries(signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useLibraryHomeQuery(libraryId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.libraryHome(libraryId),
    queryFn: ({ signal }) => api.getLibraryHome(libraryId, signal),
    staleTime: 30_000,
  });
}

export function useLibraryItemsQuery(libraryId: string, page = 0) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.libraryItems(libraryId, page),
    queryFn: ({ signal }) => api.getLibraryItems(libraryId, { page, limit: 40 }, signal),
    staleTime: 30_000,
  });
}

export function useItemQuery(itemId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.item(itemId),
    queryFn: ({ signal }) => api.getItem(itemId, signal),
    staleTime: 30_000,
  });
}

/**
 * `sync`/`close` aren't wrapped as query hooks: they're fire-and-forget calls made
 * from a background interval and on unmount (see `features/player/useProgressSync.ts`),
 * never feed React Query's cache, and nothing renders their result — a `useMutation`
 * would add machinery with no consumer. `play` is different: a button click awaits it
 * directly to seed the player, so it gets the usual hook.
 */
export function usePlayItemMutation() {
  const api = useApi();
  return useMutation({
    mutationFn: (itemId: string) => api.playItem(itemId),
  });
}

/** Podcast counterpart to `usePlayItemMutation` — same shape, one extra id. */
export function usePlayEpisodeMutation() {
  const api = useApi();
  return useMutation({
    mutationFn: ({ itemId, episodeId }: { itemId: string; episodeId: string }) =>
      api.playEpisode(itemId, episodeId),
  });
}

/**
 * Every progress record for the signed-in user — the podcast detail view's
 * source for per-episode played/in-progress/unplayed state (see
 * `getMyProgress`'s doc comment on `ApiClient` for why `getItem`'s own
 * `include: 'progress'` isn't enough for a podcast). `staleTime` matches
 * `useItemQuery`'s: fresh enough that returning from a just-finished episode
 * shows its new state, not so fresh it refetches on every render.
 */
export function useMyProgressQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.myProgress,
    queryFn: ({ signal }) => api.getMyProgress(signal),
    staleTime: 30_000,
  });
}

export function useLibrarySearchQuery(libraryId: string | undefined, q: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.librarySearch(libraryId ?? '', q),
    queryFn: ({ signal }) => api.searchLibrary(libraryId!, q, signal),
    enabled: Boolean(libraryId) && q.trim().length > 0,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------
// Book requests (Phase 6)
// ---------------------------------------------------------------------

/**
 * Polls only while `shouldPollRequests` says something is still moving — see
 * that function's doc comment for which statuses count. `refetchInterval` reads
 * the *cached* data react-query already has for this query rather than a
 * separately-tracked variable, so it always reflects the latest fetch.
 */
export function useRequestsQuery(status?: RequestStatus) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.requests(status),
    queryFn: ({ signal }) => api.getRequests(status, signal),
    refetchInterval: (query) =>
      shouldPollRequests(query.state.data?.requests ?? []) ? REQUEST_POLL_INTERVAL_MS : false,
  });
}

function invalidateRequests(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ['requests'] });
}

export function useCreateRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; author?: string; release?: Release }) =>
      api.createRequest(body),
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useApproveRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approveRequest(id),
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useRejectRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rejectRequest(id),
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useRetryRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retryRequest(id),
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useGrabRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.grabRequest(id),
    onSuccess: () => invalidateRequests(queryClient),
  });
}

export function useDeleteRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRequest(id),
    onSuccess: () => invalidateRequests(queryClient),
  });
}

/**
 * Not debounced here — `AskForBookPanel` only changes `term`/`author` (the
 * values that key this query) on explicit submit, not on every keystroke, since
 * a search fans out to real indexers rather than filtering an in-memory list.
 */
export function useRequestSearchQuery(term: string, author: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.requestSearch(term, author),
    queryFn: ({ signal }) =>
      api.searchRequestReleases({ term, author: author || undefined }, signal),
    enabled: term.trim().length > 0,
    staleTime: 10_000,
  });
}

export function useProvidersQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.providers,
    queryFn: ({ signal }) => api.getProviders(signal),
    staleTime: 30_000,
  });
}

export function useUpdateProviderMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProviderUpdateBody }) =>
      api.updateProvider(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.providers }),
  });
}

/** Not wrapped with an `onSuccess` invalidation — a test doesn't change stored state. */
export function useTestProviderMutation() {
  const api = useApi();
  return useMutation({
    mutationFn: (id: string) => api.testProvider(id),
  });
}

export function useDeleteProviderMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProvider(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.providers }),
  });
}

export function useRequestSettingsQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.requestSettings,
    queryFn: ({ signal }) => api.getRequestSettings(signal),
    staleTime: 30_000,
  });
}

export function useUpdateRequestSettingsMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<RequestSettings>) => api.updateRequestSettings(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.requestSettings }),
  });
}

// ---------------------------------------------------------------------
// Podcast discovery (Phase 8)
// ---------------------------------------------------------------------

/**
 * Search only runs on explicit submit (`AskForBookPanel`'s pattern, not
 * `SearchField`'s live-filter one) — like requests, this fans out to a real
 * upstream (iTunes, via Audiobookshelf) rather than filtering something local.
 */
export function usePodcastDirectorySearchQuery(term: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.podcastDirectorySearch(term),
    queryFn: ({ signal }) => api.searchPodcastDirectory(term, signal),
    enabled: term.trim().length > 0,
    staleTime: 30_000,
  });
}

/**
 * A mutation, not a query: a feed preview is triggered by picking a specific search
 * result or submitting a pasted RSS URL, not derived from a stable cache key the way
 * a search term is — nothing else in the app ever wants "the preview for this URL"
 * read back out of the cache.
 */
export function usePreviewPodcastFeedMutation() {
  const api = useApi();
  return useMutation({
    mutationFn: (rssFeed: string) => api.previewPodcastFeed(rssFeed),
  });
}

/**
 * Invalidates every `['libraries', ...]` query (React Query's default prefix
 * matching), not just `queryKeys.libraries` itself — a new subscription changes
 * that library's item list and home shelves too, and there's no single new item id
 * to target more narrowly yet.
 */
export function useSubscribePodcastMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubscribePodcastBody) => api.subscribePodcast(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['libraries'] }),
  });
}

// ---------------------------------------------------------------------
// Jellyfin music (Phase 9 wave A — browse/search, no playback yet)
// ---------------------------------------------------------------------

/** One browse page's size, for artists, albums and tracks alike — matches
 * `useLibraryItemsQuery`'s own Audiobookshelf page size. */
export const JELLYFIN_PAGE_SIZE = 40;

/** Jellyfin's `ItemSortBy` value for "disc number, then track number" (`ParentIndexNumber`
 * is the disc number, `IndexNumber` the track number — verified against `AudioFileProber.cs`
 * in `jellyfin/jellyfin`, which assigns exactly these two fields from a track's tag-read
 * disc/track numbers). Left unset, the BFF forwards no `sortBy` and Jellyfin falls back to
 * its own default, `SortName` — alphabetical by track title — which is wrong for an album:
 * `useJellyfinTracksQuery` is *only* ever an album's own track list (`MusicAlbumPage.tsx`,
 * which also builds its playback queue straight from this query's result), so "the order
 * tracks sit on the album" is the one ordering that call site ever wants. Mirrors
 * `TRACK_ORDER_SORT_BY` in the Android client's `AlbumDetailViewModel.kt`, which already
 * requests this. */
const TRACK_ORDER_SORT_BY = 'ParentIndexNumber,IndexNumber';

export function useJellyfinConfigQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinConfig,
    queryFn: ({ signal }) => api.getJellyfinConfig(signal),
    staleTime: 10_000,
  });
}

export function useJellyfinLoginMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JellyfinLoginBody) => api.jellyfinLogin(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.jellyfinConfig }),
  });
}

export function useJellyfinArtistsQuery(startIndex = 0, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinArtists(startIndex),
    queryFn: ({ signal }) =>
      api.getJellyfinArtists({ startIndex, limit: JELLYFIN_PAGE_SIZE }, signal),
    enabled,
    staleTime: 30_000,
  });
}

export function useJellyfinAlbumsQuery(artistId: string, startIndex = 0) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinAlbums(artistId, startIndex),
    queryFn: ({ signal }) =>
      api.getJellyfinAlbums({ artistId, startIndex, limit: JELLYFIN_PAGE_SIZE }, signal),
    enabled: artistId.length > 0,
    staleTime: 30_000,
  });
}

export function useJellyfinTracksQuery(albumId: string, startIndex = 0) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinTracks(albumId, startIndex),
    queryFn: ({ signal }) =>
      api.getJellyfinTracks(
        { albumId, startIndex, limit: JELLYFIN_PAGE_SIZE, sortBy: TRACK_ORDER_SORT_BY },
        signal,
      ),
    enabled: albumId.length > 0,
    staleTime: 30_000,
  });
}

/** Search only runs on explicit submit — same reasoning as
 * `usePodcastDirectorySearchQuery`: this fans out to the real Jellyfin server
 * rather than filtering something already in memory. */
export function useJellyfinSearchQuery(term: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinSearch(term),
    queryFn: ({ signal }) => api.searchJellyfin(term, 25, signal),
    enabled: term.trim().length > 0,
    staleTime: 10_000,
  });
}

/**
 * Fetches one track's lyrics. `itemId` is a Jellyfin item id, `null` when nothing should
 * be fetched (e.g. the currently playing item isn't a Jellyfin track at all, or no
 * queue position has resolved yet) — `enabled` is derived from that, not left to the
 * caller to gate separately, so `LyricsView.tsx` (the only caller) never has to remember
 * to check both. `lyrics: null` inside a successful response is a distinct, normal
 * outcome (see `JellyfinLyricsResponse`'s doc comment) from this query's own
 * loading/error states — the two are not the same thing and `LyricsView.tsx` renders them
 * differently. `staleTime` matches `useJellyfinSearchQuery`'s: lyrics for a given track
 * don't change within a session, but there's no reason to cache them any longer than
 * this app's other Jellyfin reads.
 */
export function useJellyfinLyricsQuery(itemId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinLyrics(itemId ?? ''),
    queryFn: ({ signal }) => api.getJellyfinLyrics(itemId as string, signal),
    enabled: itemId != null && itemId.length > 0,
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------
// Jellyfin favourites (Phase 9 web wave — mark/unmark, browse, and the toggles that drive
// both). See `favorites.ts`'s file doc comment for why the optimistic update below rewrites
// every cached Jellyfin query at once rather than just the one list a toggle was clicked from.
// ---------------------------------------------------------------------

/** Fetches exactly one artist by id, via `getJellyfinArtists`' `id` filter. `MusicArtistPage`
 * has no dedicated single-artist BFF route to call (only the artist-scoped albums listing —
 * see that page's own doc comment) and needs the *artist's own* `favorite` flag to render its
 * header toggle correctly on load, which no album in that listing carries. */
export function useJellyfinArtistQuery(artistId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinArtist(artistId),
    queryFn: ({ signal }) => api.getJellyfinArtists({ id: artistId, limit: 1 }, signal),
    enabled: artistId.length > 0,
    staleTime: 30_000,
  });
}

/** Fetches exactly one album by id — see `useJellyfinArtistQuery`'s doc comment for the
 * same reasoning, applied to `MusicAlbumPage`'s own header toggle. */
export function useJellyfinAlbumQuery(albumId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinAlbum(albumId),
    queryFn: ({ signal }) => api.getJellyfinAlbums({ id: albumId, limit: 1 }, signal),
    enabled: albumId.length > 0,
    staleTime: 30_000,
  });
}

export function useJellyfinFavoriteArtistsQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinFavoriteArtists,
    queryFn: ({ signal }) =>
      api.getJellyfinArtists({ favoritesOnly: true, limit: JELLYFIN_PAGE_SIZE }, signal),
    staleTime: 30_000,
  });
}

export function useJellyfinFavoriteAlbumsQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinFavoriteAlbums,
    queryFn: ({ signal }) =>
      api.getJellyfinAlbums({ favoritesOnly: true, limit: JELLYFIN_PAGE_SIZE }, signal),
    staleTime: 30_000,
  });
}

export function useJellyfinFavoriteTracksQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinFavoriteTracks,
    queryFn: ({ signal }) =>
      api.getJellyfinTracks({ favoritesOnly: true, limit: JELLYFIN_PAGE_SIZE }, signal),
    staleTime: 30_000,
  });
}

export interface ToggleJellyfinFavoriteVariables {
  itemId: string;
  /** The state to move *to* — the toggle already knows its own current state from the item
   * it's rendering, so this is the target, not a "flip whatever it currently is" instruction
   * this hook would have no way to double-check against the cache it's about to rewrite. */
  favorite: boolean;
}

/**
 * Marks/unmarks a Jellyfin item as a favourite, with an optimistic cache update: every
 * cached artist/album/track listing, favourites list and search-result page gets the new
 * `favorite` state applied immediately (`withFavoriteState`, see that module's doc comment
 * for why *every* cached list needs the same rewrite, not just the one the toggle was
 * clicked from), and rolled back if the request fails.
 *
 * No mutation elsewhere in this file does an optimistic cache write — every other one here
 * just `invalidateQueries` on success (grepped for `onMutate`/`setQueryData` across this
 * codebase before writing this; there is no existing precedent to follow instead). This
 * follows TanStack Query's own documented optimistic-update recipe — cancel in-flight
 * fetches, snapshot the cache, apply the change, roll back from the snapshot in `onError`,
 * reconcile with the server in `onSettled` — rather than inventing a bespoke shape for the
 * one mutation in this app that actually needs one: a toggle that waits for a round trip
 * before flipping reads as broken, which is the whole reason this mutation exists in this
 * shape rather than as a plain `invalidateQueries`-only one like its neighbours.
 *
 * A failed toggle is surfaced to the caller via this hook's own `isError`/`error`, same as
 * every other mutation — the rollback above is silent (the icon just reverts), but the
 * calling component is expected to show the user *why* it reverted using those fields (see
 * `MusicAlbumPage.tsx`/`MusicArtistPage.tsx`'s own favourite-toggle handlers).
 */
export function useToggleJellyfinFavoriteMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, favorite }: ToggleJellyfinFavoriteVariables) =>
      favorite ? api.markJellyfinFavorite(itemId) : api.unmarkJellyfinFavorite(itemId),
    onMutate: async ({ itemId, favorite }: ToggleJellyfinFavoriteVariables) => {
      await queryClient.cancelQueries({ queryKey: ['jellyfin'] });
      const previous = queryClient.getQueriesData({ queryKey: ['jellyfin'] });
      queryClient.setQueriesData({ queryKey: ['jellyfin'] }, (data: unknown) =>
        withFavoriteState(data, itemId, favorite),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jellyfin'] });
    },
  });
}
