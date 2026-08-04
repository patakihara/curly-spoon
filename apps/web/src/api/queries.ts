/**
 * The app's React Query hooks — one place mapping server state to query keys, so
 * cache invalidation (e.g. "setup changed, libraries might now be visible") is
 * declared once instead of scattered across every page that happens to read it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './ApiContext.js';
import { shouldPollRequests, REQUEST_POLL_INTERVAL_MS } from '../features/requests/polling.js';
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
      api.getJellyfinTracks({ albumId, startIndex, limit: JELLYFIN_PAGE_SIZE }, signal),
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
