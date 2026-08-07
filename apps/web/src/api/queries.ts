/**
 * The app's React Query hooks — one place mapping server state to query keys, so
 * cache invalidation (e.g. "setup changed, libraries might now be visible") is
 * declared once instead of scattered across every page that happens to read it.
 */
import { hashKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './ApiContext.js';
import { shouldPollRequests, REQUEST_POLL_INTERVAL_MS } from '../features/requests/polling.js';
import {
  shouldPollMusicRequests,
  MUSIC_REQUEST_POLL_INTERVAL_MS,
} from '../features/music/musicRequestPolling.js';
import { withFavoriteState } from '../features/music/favorites.js';
import { appendPlaylistItems, removePlaylistItems } from '../features/music/playlists.js';
import type {
  JellyfinLoginBody,
  JellyfinTrack,
  MusicCandidate,
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
  librarySeries: (libraryId: string) => ['libraries', libraryId, 'series'] as const,
  item: (itemId: string) => ['items', itemId] as const,
  author: (authorId: string) => ['authors', authorId] as const,
  requests: (status?: RequestStatus) => ['requests', status ?? 'all'] as const,
  requestSearch: (term: string, author: string) => ['requests', 'search', term, author] as const,
  providers: ['providers'] as const,
  requestSettings: ['settings', 'requests'] as const,
  musicRequests: (status?: RequestStatus) => ['musicRequests', status ?? 'all'] as const,
  musicRequestSearch: (term: string) => ['musicRequests', 'search', term] as const,
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
  jellyfinPlaylists: (startIndex: number) => ['jellyfin', 'playlists', startIndex] as const,
  /** See `jellyfinArtist`/`jellyfinAlbum`'s identical doc comment — the single-item fetch
   * behind `MusicPlaylistPage`'s own header, which the items listing alone can't provide
   * (a playlist's own name isn't part of `GET /jellyfin/playlists/:id/items`'s response). */
  jellyfinPlaylist: (playlistId: string) => ['jellyfin', 'playlists', 'byId', playlistId] as const,
  /** `startIndex` defaults to (and, for page 0, collapses to the same 4-element key as)
   * the pre-pagination shape — so the existing page-0 optimistic add/remove mutations
   * below, which only ever target page 0's cache entry, keep hitting the same key a
   * `useJellyfinPlaylistItemsQuery(playlistId)` call for the first page also uses, with no
   * change to their own tests. A non-zero page gets its own distinct key, the same
   * pattern `jellyfinTracks` already uses for `MusicAlbumPage.tsx`. */
  jellyfinPlaylistItems: (playlistId: string, startIndex = 0) =>
    startIndex === 0
      ? (['jellyfin', 'playlists', playlistId, 'items'] as const)
      : (['jellyfin', 'playlists', playlistId, 'items', startIndex] as const),
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

/**
 * The full series list for a library — `SeriesPage`'s only fetch, since there is no
 * per-id series route on the BFF (see `ApiClient.getLibrarySeries`'s own doc comment).
 * `enabled` gates on `libraryId` being resolved yet, the same pattern
 * `useLibrarySearchQuery` below already uses.
 */
export function useLibrarySeriesQuery(libraryId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.librarySeries(libraryId ?? ''),
    queryFn: ({ signal }) => api.getLibrarySeries(libraryId!, signal),
    enabled: Boolean(libraryId),
    staleTime: 30_000,
  });
}

/** An author's own page — `AuthorPage`'s source of truth. Not library-scoped
 * (see `ApiClient.getAuthor`'s own doc comment), so unlike
 * `useLibrarySeriesQuery` this needs no library id and no `enabled` gate. */
export function useAuthorQuery(authorId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.author(authorId),
    queryFn: ({ signal }) => api.getAuthor(authorId, signal),
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
// Music requests (Phase 9)
// ---------------------------------------------------------------------

/**
 * Polls only while `shouldPollMusicRequests` says something is still moving — see that
 * function's doc comment for why `downloading` is deliberately excluded here, unlike
 * `useRequestsQuery`'s book equivalent.
 */
export function useMusicRequestsQuery(status?: RequestStatus) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.musicRequests(status),
    queryFn: ({ signal }) => api.getMusicRequests(status, signal),
    refetchInterval: (query) =>
      shouldPollMusicRequests(query.state.data?.requests ?? [])
        ? MUSIC_REQUEST_POLL_INTERVAL_MS
        : false,
  });
}

function invalidateMusicRequests(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ['musicRequests'] });
}

export function useCreateMusicRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidate: MusicCandidate) => api.createMusicRequest(candidate),
    onSuccess: () => invalidateMusicRequests(queryClient),
  });
}

export function useApproveMusicRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approveMusicRequest(id),
    onSuccess: () => invalidateMusicRequests(queryClient),
  });
}

export function useRejectMusicRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rejectMusicRequest(id),
    onSuccess: () => invalidateMusicRequests(queryClient),
  });
}

export function useRetryMusicRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retryMusicRequest(id),
    onSuccess: () => invalidateMusicRequests(queryClient),
  });
}

/** Not called from `MusicRequestList.tsx`'s per-row actions directly — `retry` already
 * chains this server-side (`routes/musicRequests.ts`). Used by the search panel and the
 * approve action instead, to drive a fresh `approved` request on to `downloading` — see
 * `MusicRequestList.tsx`'s doc comment for why nothing does this automatically otherwise. */
export function useGrabMusicRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.grabMusicRequest(id),
    onSuccess: () => invalidateMusicRequests(queryClient),
  });
}

export function useDeleteMusicRequestMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMusicRequest(id),
    onSuccess: () => invalidateMusicRequests(queryClient),
  });
}

/** Search only runs on explicit submit (`AskForBookPanel`'s pattern) — this fans out to a
 * real, slow Soulseek search (`music/slskd.ts`'s `pollUntilComplete`, up to ~17s), not an
 * in-memory filter, so it must not run on every keystroke. */
export function useMusicRequestSearchQuery(term: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.musicRequestSearch(term),
    queryFn: ({ signal }) => api.searchMusicRequests({ term }, signal),
    enabled: term.trim().length > 0,
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
export const TRACK_ORDER_SORT_BY = 'ParentIndexNumber,IndexNumber';

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
 *
 * The rollback is **guarded**, not unconditional: `onError` only restores a query to its
 * pre-toggle snapshot if that query still holds exactly what *this* mutation's own
 * `onMutate` wrote. Two overlapping toggles share one cache — the same heart double-clicked,
 * or a second item toggled before the first settles — and `withFavoriteState` rewrites
 * *every* cached Jellyfin page on each call, not just the one holding the item in question.
 * Without the guard, an earlier toggle failing after a later one has already applied its own
 * optimistic write would blindly restore the earlier toggle's stale pre-write snapshot,
 * silently erasing the later toggle's still-in-flight state. See `onError` below for the
 * mechanics; `queries.test.ts`'s overlapping-mutation test is what this guards against.
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
      // Snapshot exactly what *this* mutation just wrote to each query — `onError` compares
      // the cache's *current* contents against this to tell "nothing has touched this query
      // since I wrote it" (safe to roll back) apart from "a later overlapping mutation has
      // since applied its own optimistic write on top" (rolling back would clobber it). This
      // reads the snapshot back from the cache itself, rather than trusting the updater's
      // return value — that keeps the comparison correct under React Query's default
      // structural sharing too: `setQueryData` can hand a query back its *previous*
      // reference when a write doesn't actually change that entry's content, and reading
      // live means `applied` always matches whatever reference the cache truly holds.
      const applied = queryClient.getQueriesData({ queryKey: ['jellyfin'] });
      return { previous, applied };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      const appliedByKey = new Map(context.applied.map(([key, data]) => [hashKey(key), data]));
      for (const [queryKey, previousData] of context.previous) {
        // Only roll back if the entry is still exactly what this mutation's own onMutate
        // applied (reference equality — see the comment on `applied` above for why that
        // stays correct under structural sharing). If it's something else, a later
        // overlapping mutation has since written its own optimistic state on top of this
        // one, and restoring this mutation's pre-write snapshot would overwrite that newer
        // state with stale data. Leaving it alone is safe either way — the newer mutation's
        // own onSettled still reconciles the cache with the server shortly after, same as
        // this one's.
        if (queryClient.getQueryData(queryKey) === appliedByKey.get(hashKey(queryKey))) {
          queryClient.setQueryData(queryKey, previousData);
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jellyfin'] });
    },
  });
}

// ---------------------------------------------------------------------
// Jellyfin playlists (Phase 9 web wave — playlists)
// ---------------------------------------------------------------------

export function useJellyfinPlaylistsQuery(startIndex = 0) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinPlaylists(startIndex),
    queryFn: ({ signal }) =>
      api.getJellyfinPlaylists({ startIndex, limit: JELLYFIN_PAGE_SIZE }, signal),
    staleTime: 30_000,
  });
}

/** Fetches exactly one playlist by id, via `getJellyfinPlaylists`'s `id` filter — see
 * `queryKeys.jellyfinPlaylist`'s doc comment for why `MusicPlaylistPage` needs this
 * alongside the items listing below. */
export function useJellyfinPlaylistQuery(playlistId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinPlaylist(playlistId),
    queryFn: ({ signal }) => api.getJellyfinPlaylists({ id: playlistId, limit: 1 }, signal),
    enabled: playlistId.length > 0,
    staleTime: 30_000,
  });
}

/** Fetches `playlistId`'s tracks in playlist order — see `JellyfinPlaylistItem`'s doc
 * comment for why that's what this resolves to, not an alphabetical re-sort.
 *
 * `startIndex` defaults to 0 (the first `JELLYFIN_PAGE_SIZE` tracks) so a playlist longer
 * than one page doesn't just silently truncate: `MusicPlaylistPage.tsx` threads its own
 * pagination state through here the same way `MusicAlbumPage.tsx` does via
 * `useJellyfinTracksQuery`. */
export function useJellyfinPlaylistItemsQuery(playlistId: string, startIndex = 0) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.jellyfinPlaylistItems(playlistId, startIndex),
    queryFn: ({ signal }) =>
      api.getJellyfinPlaylistItems(playlistId, { startIndex, limit: JELLYFIN_PAGE_SIZE }, signal),
    enabled: playlistId.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Creates a playlist, optionally seeded with `itemIds` (already in the desired order —
 * `createJellyfinPlaylist` forwards them straight through, see that method's own doc
 * comment). Not optimistic, unlike the add/remove mutations below: creation hands back a
 * server-assigned id with nothing pre-existing in the cache to speculatively rewrite, so
 * there's no stale state to hide the way there is for a toggle or an append to an
 * already-open list — the caller's own `isPending` state is what covers the round trip.
 * Invalidates the whole `['jellyfin', 'playlists']` slice on success (list pages and any
 * open item pages alike) so a freshly created playlist appears without a manual refetch.
 */
export function useCreateJellyfinPlaylistMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, itemIds }: { name: string; itemIds?: string[] }) =>
      api.createJellyfinPlaylist(name, itemIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jellyfin', 'playlists'] });
    },
  });
}

export interface AddToJellyfinPlaylistVariables {
  playlistId: string;
  /** Full track objects, not just ids — the optimistic write needs each track's own name/
   * duration/artwork to render a real-looking row immediately, not just a placeholder; see
   * `playlists.ts`'s `appendPlaylistItems`. */
  tracks: JellyfinTrack[];
}

/**
 * Appends `tracks` to `playlistId`, with an optimistic cache write and a guarded rollback —
 * same shape as `useToggleJellyfinFavoriteMutation` (cancel, snapshot, apply, and in
 * `onError` only restore if nothing has touched the query since this mutation's own write),
 * scoped to the *one* cache entry that's actually wrong until the next fetch: this
 * playlist's own items page (`queryKeys.jellyfinPlaylistItems`). See `playlists.ts`'s file
 * doc comment for why that single-key scope is enough here, unlike favourites' broad
 * `['jellyfin']` rewrite.
 *
 * Each optimistically-added row gets a client-only `playlistItemId` (`playlists.ts`'s
 * `isOptimisticPlaylistItem`) until the server assigns the real one — `onSettled` always
 * invalidates to replace it, and callers should disable a remove control on a still-
 * optimistic row rather than try to remove it by an id Jellyfin has never heard of.
 */
export function useAddToJellyfinPlaylistMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, tracks }: AddToJellyfinPlaylistVariables) =>
      api.addToJellyfinPlaylist(
        playlistId,
        tracks.map((t) => t.id),
      ),
    onMutate: async ({ playlistId, tracks }: AddToJellyfinPlaylistVariables) => {
      const queryKey = queryKeys.jellyfinPlaylistItems(playlistId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      const applied = appendPlaylistItems(previous, tracks);
      queryClient.setQueryData(queryKey, applied);
      return { queryKey, previous, applied };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      // Guard, same reasoning as `useToggleJellyfinFavoriteMutation`'s: only roll back if
      // the cache still holds exactly what *this* mutation's own `onMutate` wrote — a later
      // overlapping add/remove on the same playlist may have already written its own
      // optimistic state on top, which restoring this mutation's stale pre-write snapshot
      // would otherwise clobber.
      if (queryClient.getQueryData(context.queryKey) === context.applied) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.jellyfinPlaylistItems(vars.playlistId),
      });
      void queryClient.invalidateQueries({ queryKey: ['jellyfin', 'playlists'] });
    },
  });
}

export interface RemoveFromJellyfinPlaylistVariables {
  playlistId: string;
  /** `JellyfinPlaylistItem.playlistItemId` values, never `track.id` — see that type's doc
   * comment for why a track duplicated within one playlist needs this distinction. */
  playlistItemIds: string[];
}

/** Removes playlist entries, with the same optimistic-write-plus-guarded-rollback shape as
 * `useAddToJellyfinPlaylistMutation` above — see that hook's doc comment for the full
 * reasoning, which applies here unchanged. */
export function useRemoveFromJellyfinPlaylistMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, playlistItemIds }: RemoveFromJellyfinPlaylistVariables) =>
      api.removeFromJellyfinPlaylist(playlistId, playlistItemIds),
    onMutate: async ({ playlistId, playlistItemIds }: RemoveFromJellyfinPlaylistVariables) => {
      const queryKey = queryKeys.jellyfinPlaylistItems(playlistId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      const applied = removePlaylistItems(previous, playlistItemIds);
      queryClient.setQueryData(queryKey, applied);
      return { queryKey, previous, applied };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      if (queryClient.getQueryData(context.queryKey) === context.applied) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.jellyfinPlaylistItems(vars.playlistId),
      });
      void queryClient.invalidateQueries({ queryKey: ['jellyfin', 'playlists'] });
    },
  });
}
