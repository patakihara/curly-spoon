/**
 * Typed client over the BFF's `/api/v1` surface.
 *
 * Takes an injected `fetch` (never imports the global) so it is testable without
 * a network — the same house rule `packages/abs-client` follows. Every method
 * either resolves to a typed value or rejects with an `ApiError`; nothing else
 * escapes `request()`.
 */
import { ApiError, apiErrorFromNetworkFailure, apiErrorFromResponse } from './errors.js';
import type {
  AuthorBooks,
  BookRequest,
  JellyfinAlbum,
  JellyfinArtist,
  JellyfinConfig,
  JellyfinCreatePlaylistResult,
  JellyfinFavoriteResponse,
  JellyfinLibraryPage,
  JellyfinLoginBody,
  JellyfinLoginResult,
  JellyfinLyricsResponse,
  JellyfinPlaylist,
  JellyfinPlaylistItem,
  JellyfinSearchResults,
  JellyfinTrack,
  ItemDetailResponse,
  LibraryItem,
  LibraryItemsPage,
  Library,
  LoginResponse,
  MediaProgress,
  MixedRecommendedShelf,
  MusicCandidate,
  MusicRecommendedShelf,
  MusicRequest,
  MusicSearchResult,
  PlaybackSession,
  PodcastDirectoryResult,
  PodcastFeedPreview,
  ProviderEntry,
  ProviderUpdateBody,
  Release,
  RequestSearchResult,
  RequestSettings,
  RequestStatus,
  SearchResults,
  Shelf,
  SetupResult,
  SetupState,
  SubscribePodcastBody,
} from './types.js';

/** Deliberately narrower than `typeof fetch` (matches `@auralis/abs-client`'s own `FetchLike`) — a real `fetch` satisfies this, and so does a simple test stub. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * One `series[]` entry on a book's own metadata — the BFF sends this on every book
 * returned by `getLibrarySeries` (`packages/abs-client`'s `Book.series`), but it isn't
 * on the shared `LibraryItem`/`MediaSummary` shape in `types.ts` because nothing read
 * it before this wave. Declared locally rather than widening the shared type — see
 * `types.ts`'s own doc comment on keeping it narrowed to what's actually consumed.
 *
 * No `id` field, deliberately — this mirrors `packages/abs-client`'s `Book.series:
 * SeriesBadge[]`, not its id-carrying `SeriesSequence`. A minified item's per-book
 * series entry has always been a single fabricated fallback (historically with an
 * `id` equal to the display name), and comparing that against a real series id is
 * exactly the bug `SeriesPage`'s old `seriesId` lookup shipped — see this file's own
 * `SeriesPage.tsx` header comment and `docs/HANDOVER.md`. `SeriesPage` now trusts
 * `getLibrarySeries`'s array order instead of re-deriving a sequence, so nothing
 * here currently reads `id` or `sequence` either — kept for the wire shape, not
 * because anything consumes it.
 */
export interface LibrarySeriesBookBadge {
  name: string;
  /** e.g. "3" or "3.5"; `null` when this book has no number within the series. */
  sequence: string | null;
}

/** A book as it appears inside a `getLibrarySeries` response — `LibraryItem` plus the
 * `series` sequence array `SeriesPage` needs to order its shelf. */
export interface LibrarySeriesBook extends Omit<LibraryItem, 'media'> {
  media: LibraryItem['media'] & { series?: LibrarySeriesBookBadge[] };
}

export interface LibrarySeriesEntry {
  id: string;
  name: string;
  description: string | null;
  books: LibrarySeriesBook[];
}

export interface ApiClientOptions {
  fetch: FetchLike;
  /** Defaults to `/api/v1`, i.e. same-origin — this app is always served by the BFF. */
  baseUrl?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  // `baseUrl` is relative ("/api/v1"), so anchor against a fixed placeholder origin
  // purely to reuse URLSearchParams/URL — the returned string is stripped back to
  // path+query, which is what `fetch` wants for a same-origin request.
  const url = new URL(baseUrl + path, 'http://placeholder.invalid');
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

export class ApiClient {
  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;

  constructor(options: ApiClientOptions) {
    this.fetchFn = options.fetch;
    this.baseUrl = options.baseUrl ?? '/api/v1';
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = buildUrl(this.baseUrl, path, options.query);
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        // The BFF's session lives in an httpOnly cookie — every request must carry it.
        credentials: 'include',
        signal: options.signal,
      });
    } catch (cause) {
      throw apiErrorFromNetworkFailure(cause);
    }

    if (!response.ok) throw await apiErrorFromResponse(response);

    const text = await response.text();
    if (text.length === 0) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw apiErrorFromNetworkFailure(cause);
    }
  }

  // ---------------------------------------------------------------------
  // Setup / health
  // ---------------------------------------------------------------------

  getSetupState(signal?: AbortSignal): Promise<SetupState> {
    return this.request<SetupState>('/setup', { signal });
  }

  submitSetup(baseUrl: string): Promise<SetupResult> {
    return this.request<SetupResult>('/setup', { method: 'POST', body: { baseUrl } });
  }

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  login(username: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  logout(): Promise<void> {
    return this.request<void>('/auth/logout', { method: 'POST' });
  }

  me(signal?: AbortSignal): Promise<{ user: { id: string; username: string } }> {
    return this.request('/auth/me', { signal });
  }

  // ---------------------------------------------------------------------
  // Libraries
  // ---------------------------------------------------------------------

  getLibraries(signal?: AbortSignal): Promise<{ libraries: Library[] }> {
    return this.request('/libraries', { signal });
  }

  getLibraryHome(libraryId: string, signal?: AbortSignal): Promise<{ shelves: Shelf[] }> {
    return this.request(`/libraries/${encodeURIComponent(libraryId)}/home`, { signal });
  }

  /** `GET /api/v1/recommended` (docs/ROADMAP.md §15c-2, wave 15c-2-W,
   * `docs/agent-specs/15c-2-CLIENTS.md`) — the cross-medium recommendation aggregator,
   * scoped to the signed-in user rather than to one library: it pools candidates from
   * both Audiobookshelf and Jellyfin and can return shelves mixing books, podcasts and
   * albums. Replaces the book-only, library-scoped `getLibraryRecommended` this wave
   * deleted (For You was its only web caller). A cold-start user (no listening history
   * on either upstream) gets `{ shelves: [] }` back, which is correct and not an error. */
  getRecommended(signal?: AbortSignal): Promise<{ shelves: MixedRecommendedShelf[] }> {
    return this.request('/recommended', { signal });
  }

  getLibraryItems(
    libraryId: string,
    query: { limit?: number; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<LibraryItemsPage> {
    return this.request(`/libraries/${encodeURIComponent(libraryId)}/items`, { query, signal });
  }

  searchLibrary(libraryId: string, q: string, signal?: AbortSignal): Promise<SearchResults> {
    return this.request(`/libraries/${encodeURIComponent(libraryId)}/search`, {
      query: { q },
      signal,
    });
  }

  /**
   * `GET /libraries/:id/series` — every series in the library, each with its member
   * books already nested (`docs/agent-specs/04-phase12c1-web-series-author-pages.md`
   * confirmed this against `apps/server/src/routes/libraries.test.ts`: the real
   * Audiobookshelf listing endpoint returns full book membership, not just a count).
   * There is no per-id "fetch one series" route on the BFF, so `SeriesPage` fetches the
   * whole list (capped at the BFF's own max of 500) and finds its id client-side — the
   * same shape `getLibraryItems` already returns, just not filterable by id.
   */
  getLibrarySeries(
    libraryId: string,
    signal?: AbortSignal,
  ): Promise<{ series: LibrarySeriesEntry[]; total: number }> {
    return this.request(`/libraries/${encodeURIComponent(libraryId)}/series`, {
      query: { limit: 500 },
      signal,
    });
  }

  /**
   * `GET /authors/:id` — an author's own page. Not library-scoped (Audiobookshelf
   * author ids are global), unlike every other method on this section. A 404
   * here is a real "author not found", not an empty match — see
   * `AbsClient.getAuthor`'s doc comment (`packages/abs-client`) for why this
   * replaces client-side matching against `media.authors[]` entirely rather
   * than being an alternative to it.
   */
  getAuthor(authorId: string, signal?: AbortSignal): Promise<AuthorBooks> {
    return this.request(`/authors/${encodeURIComponent(authorId)}`, { signal });
  }

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------

  getItem(itemId: string, signal?: AbortSignal): Promise<{ item: LibraryItem }> {
    return this.request(`/items/${encodeURIComponent(itemId)}`, {
      query: { expanded: true, include: 'progress' },
      signal,
    });
  }

  /**
   * Same request as `getItem` — identical URL, identical query, identical wire
   * response — typed as `ItemDetailResponse` instead of `{ item: LibraryItem }` so
   * `ItemPage.tsx`'s book detail screen can read the real author id `LibraryItem`
   * deliberately hides (see `ItemDetailResponse`'s doc comment in `types.ts`).
   * Screen-scoped on purpose: every other item-detail consumer keeps using
   * `getItem`/`useItemQuery`.
   */
  getItemDetail(itemId: string, signal?: AbortSignal): Promise<ItemDetailResponse> {
    return this.request(`/items/${encodeURIComponent(itemId)}`, {
      query: { expanded: true, include: 'progress' },
      signal,
    });
  }

  /**
   * Every `MediaProgress` record for the signed-in user, book and podcast-episode
   * alike (a book's record has `episodeId: null`). `getItem`'s own `include:
   * 'progress'` only ever resolves the *item-level* record — for a podcast
   * container that's not meaningful, since Audiobookshelf tracks progress per
   * episode — so the podcast detail view reads this list instead and matches
   * episodes against it itself (`features/podcasts/episodeProgress.ts`).
   */
  getMyProgress(signal?: AbortSignal): Promise<{ progress: MediaProgress[] }> {
    return this.request('/me/progress', { signal });
  }

  // ---------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------

  playItem(itemId: string, signal?: AbortSignal): Promise<{ session: PlaybackSession }> {
    return this.request(`/items/${encodeURIComponent(itemId)}/play`, {
      method: 'POST',
      signal,
    });
  }

  /**
   * Podcast counterpart to `playItem` — opens a session scoped to one episode
   * rather than the whole item. The returned `PlaybackSession.id` is already
   * episode-scoped upstream (Audiobookshelf's own play-session API), so
   * `syncSession`/`closeSession` below need no separate `episodeId` — the same
   * two calls work unchanged for a book or an episode session.
   */
  playEpisode(
    itemId: string,
    episodeId: string,
    signal?: AbortSignal,
  ): Promise<{ session: PlaybackSession }> {
    return this.request(
      `/items/${encodeURIComponent(itemId)}/play/${encodeURIComponent(episodeId)}`,
      { method: 'POST', signal },
    );
  }

  /**
   * `timeListened`/`duration` are required by the BFF's `syncBodySchema` (not
   * optional, despite how loosely the route is often described) — always send all
   * three or the request 400s.
   */
  syncSession(
    sessionId: string,
    body: { currentTime: number; timeListened: number; duration: number },
  ): Promise<{ ok: true }> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/sync`, {
      method: 'POST',
      body,
    });
  }

  closeSession(sessionId: string): Promise<{ ok: true }> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/close`, { method: 'POST' });
  }

  // ---------------------------------------------------------------------
  // Media URLs (not fetched via `request` — used directly as `<img>`/`<audio>` src)
  // ---------------------------------------------------------------------

  coverUrl(itemId: string, options: { width?: number } = {}): string {
    return buildUrl(this.baseUrl, `/media/${encodeURIComponent(itemId)}/cover`, {
      width: options.width,
    });
  }

  audioTrackUrl(itemId: string, fileId: string): string {
    return buildUrl(
      this.baseUrl,
      `/media/${encodeURIComponent(itemId)}/track/${encodeURIComponent(fileId)}`,
    );
  }

  // ---------------------------------------------------------------------
  // Book requests (Phase 6)
  // ---------------------------------------------------------------------

  getRequests(status?: RequestStatus, signal?: AbortSignal): Promise<{ requests: BookRequest[] }> {
    return this.request('/requests', { query: { status }, signal });
  }

  createRequest(body: {
    title: string;
    author?: string;
    release?: Release;
  }): Promise<{ request: BookRequest }> {
    return this.request('/requests', { method: 'POST', body });
  }

  getRequest(id: string, signal?: AbortSignal): Promise<{ request: BookRequest }> {
    return this.request(`/requests/${encodeURIComponent(id)}`, { signal });
  }

  approveRequest(id: string): Promise<{ request: BookRequest }> {
    return this.request(`/requests/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  }

  rejectRequest(id: string): Promise<{ request: BookRequest }> {
    return this.request(`/requests/${encodeURIComponent(id)}/reject`, { method: 'POST' });
  }

  retryRequest(id: string): Promise<{ request: BookRequest }> {
    return this.request(`/requests/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  }

  grabRequest(id: string): Promise<{ request: BookRequest }> {
    return this.request(`/requests/${encodeURIComponent(id)}/grab`, { method: 'POST' });
  }

  deleteRequest(id: string): Promise<void> {
    return this.request(`/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  searchRequestReleases(
    query: { term: string; author?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<RequestSearchResult> {
    return this.request('/requests/search', { query, signal });
  }

  getProviders(signal?: AbortSignal): Promise<{ providers: ProviderEntry[] }> {
    return this.request('/providers', { signal });
  }

  updateProvider(id: string, body: ProviderUpdateBody): Promise<{ provider: ProviderEntry }> {
    return this.request(`/providers/${encodeURIComponent(id)}`, { method: 'PUT', body });
  }

  testProvider(id: string): Promise<{ ok: true }> {
    return this.request(`/providers/${encodeURIComponent(id)}/test`, { method: 'POST' });
  }

  deleteProvider(id: string): Promise<void> {
    return this.request(`/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  getRequestSettings(signal?: AbortSignal): Promise<RequestSettings> {
    return this.request('/settings/requests', { signal });
  }

  updateRequestSettings(body: Partial<RequestSettings>): Promise<RequestSettings> {
    return this.request('/settings/requests', { method: 'PUT', body });
  }

  // ---------------------------------------------------------------------
  // Music requests (Phase 9) — mirrors the book-request methods above one for one;
  // see routes/musicRequests.ts's header comment for why there is no `/music-requests/:id`
  // getter used here (the list already carries everything the UI needs) and why grab stops
  // at `downloading`.
  // ---------------------------------------------------------------------

  searchMusicRequests(
    query: { term: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<MusicSearchResult> {
    return this.request('/music-requests/search', { query, signal });
  }

  getMusicRequests(
    status?: RequestStatus,
    signal?: AbortSignal,
  ): Promise<{ requests: MusicRequest[] }> {
    return this.request('/music-requests', { query: { status }, signal });
  }

  createMusicRequest(candidate: MusicCandidate): Promise<{ request: MusicRequest }> {
    return this.request('/music-requests', { method: 'POST', body: { candidate } });
  }

  approveMusicRequest(id: string): Promise<{ request: MusicRequest }> {
    return this.request(`/music-requests/${encodeURIComponent(id)}/approve`, { method: 'POST' });
  }

  rejectMusicRequest(id: string): Promise<{ request: MusicRequest }> {
    return this.request(`/music-requests/${encodeURIComponent(id)}/reject`, { method: 'POST' });
  }

  retryMusicRequest(id: string): Promise<{ request: MusicRequest }> {
    return this.request(`/music-requests/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  }

  grabMusicRequest(id: string): Promise<{ request: MusicRequest }> {
    return this.request(`/music-requests/${encodeURIComponent(id)}/grab`, { method: 'POST' });
  }

  deleteMusicRequest(id: string): Promise<void> {
    return this.request(`/music-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------------
  // Podcast discovery (Phase 8)
  // ---------------------------------------------------------------------

  searchPodcastDirectory(
    term: string,
    signal?: AbortSignal,
  ): Promise<{ results: PodcastDirectoryResult[] }> {
    return this.request('/podcasts/search', { query: { term }, signal });
  }

  /** `POST /podcasts/feed` — parses an RSS feed so it can be shown before subscribing. */
  previewPodcastFeed(rssFeed: string): Promise<{ preview: PodcastFeedPreview }> {
    return this.request('/podcasts/feed', { method: 'POST', body: { rssFeed } });
  }

  subscribePodcast(body: SubscribePodcastBody): Promise<{ item: LibraryItem }> {
    return this.request('/podcasts', { method: 'POST', body });
  }

  // ---------------------------------------------------------------------
  // Jellyfin music (Phase 9 wave A — browse/search, no playback yet)
  // ---------------------------------------------------------------------

  getJellyfinConfig(signal?: AbortSignal): Promise<JellyfinConfig> {
    return this.request('/jellyfin/config', { signal });
  }

  /** `GET /music/recommended` (docs/ROADMAP.md §13, wave 13f-1) — Auralis's own ranked
   * album shelves for the separate `/music` screen (untouched by wave 15c-2-W's
   * `getRecommended` above, which is For You's own aggregator). Rejects with a typed
   * `ApiError` (`jellyfin_not_configured`, 409, or `jellyfin_unauthenticated`, 401) when
   * Jellyfin isn't reachable for this user — same as every other `/jellyfin/*` method
   * here, not a special case. Callers must treat that rejection as "no shelves", the same
   * degrade-to-empty `MusicHomePage.tsx` already gives an unconfigured Jellyfin, never as
   * an error to surface: see `docs/HANDOVER.md`'s standing rule that `/music` must never
   * show an error state where a connect prompt or a quiet no-op belongs. */
  getMusicRecommended(signal?: AbortSignal): Promise<{ shelves: MusicRecommendedShelf[] }> {
    return this.request('/music/recommended', { signal });
  }

  /** Configures the shared Jellyfin base URL (if `baseUrl` is given) and signs the
   * caller in, in one call — mirrors `POST /jellyfin/login`'s own doc comment. */
  jellyfinLogin(body: JellyfinLoginBody): Promise<JellyfinLoginResult> {
    return this.request('/jellyfin/login', { method: 'POST', body });
  }

  getJellyfinArtists(
    query: {
      startIndex?: number;
      limit?: number;
      favoritesOnly?: boolean;
      /** A single artist id, joined the same comma-separated way as every other
       * `ids`-filter caller — see `@auralis/jellyfin-client`'s `LibraryQuery.ids` doc
       * comment. This BFF route only ever forwards one id today (the artist page's own
       * favourite-state fetch), so it's typed as a single optional id here rather than
       * an array a caller would just build a one-element array for. */
      id?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryPage<JellyfinArtist>> {
    const { id, ...rest } = query;
    return this.request('/jellyfin/artists', { query: { ...rest, ids: id }, signal });
  }

  getJellyfinAlbums(
    query: {
      artistId?: string;
      startIndex?: number;
      limit?: number;
      favoritesOnly?: boolean;
      /** See `getJellyfinArtists`'s `id` param doc comment — same shape, same reasoning. */
      id?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryPage<JellyfinAlbum>> {
    const { id, ...rest } = query;
    return this.request('/jellyfin/albums', { query: { ...rest, ids: id }, signal });
  }

  getJellyfinTracks(
    // `sortBy` is a Jellyfin `ItemSortBy` value (e.g. `'ParentIndexNumber,IndexNumber'` for
    // disc/track order) passed straight through to the BFF's own pass-through parameter —
    // this method never interprets it, same as every other query field here.
    query: {
      albumId?: string;
      startIndex?: number;
      limit?: number;
      sortBy?: string;
      favoritesOnly?: boolean;
    } = {},
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryPage<JellyfinTrack>> {
    return this.request('/jellyfin/tracks', { query, signal });
  }

  searchJellyfin(
    term: string,
    limit: number | undefined,
    signal?: AbortSignal,
  ): Promise<JellyfinSearchResults> {
    return this.request('/jellyfin/search', { query: { term, limit }, signal });
  }

  /** `lyrics: null` in the resolved value means Jellyfin has nothing for this track — a
   * normal outcome (see `JellyfinLyricsResponse`'s own doc comment), not a rejected
   * promise. Only an actual transport/upstream failure rejects, same as every other
   * method here. */
  getJellyfinLyrics(itemId: string, signal?: AbortSignal): Promise<JellyfinLyricsResponse> {
    return this.request(`/jellyfin/tracks/${encodeURIComponent(itemId)}/lyrics`, { signal });
  }

  /** Marks `itemId` (artist, album or track — the BFF route is item-kind agnostic, same as
   * Jellyfin's own favourite endpoints) as a favourite. Resolves to the state Jellyfin
   * actually recorded — see `JellyfinFavoriteResponse`'s doc comment for why that's trusted
   * over the request's own intent. */
  markJellyfinFavorite(itemId: string): Promise<JellyfinFavoriteResponse> {
    return this.request(`/jellyfin/items/${encodeURIComponent(itemId)}/favorite`, {
      method: 'POST',
    });
  }

  /** Unmarks `itemId` as a favourite. See `markJellyfinFavorite`'s doc comment. */
  unmarkJellyfinFavorite(itemId: string): Promise<JellyfinFavoriteResponse> {
    return this.request(`/jellyfin/items/${encodeURIComponent(itemId)}/favorite`, {
      method: 'DELETE',
    });
  }

  // ---------------------------------------------------------------------
  // Jellyfin playlists (Phase 9 web wave — playlists)
  // ---------------------------------------------------------------------

  getJellyfinPlaylists(
    query: {
      startIndex?: number;
      limit?: number;
      /** See `getJellyfinArtists`'s identical `id` param doc comment — same shape, same
       * reasoning: `MusicPlaylistPage` has no dedicated single-playlist BFF route, only
       * this listing's own `ids` filter, to get the one playlist's name for its header. */
      id?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryPage<JellyfinPlaylist>> {
    const { id, ...rest } = query;
    return this.request('/jellyfin/playlists', { query: { ...rest, ids: id }, signal });
  }

  /** Fetches `playlistId`'s tracks in playlist order — see `JellyfinPlaylistItem`'s doc
   * comment for why that order, not an alphabetical re-sort, is what this resolves to. */
  getJellyfinPlaylistItems(
    playlistId: string,
    query: { startIndex?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryPage<JellyfinPlaylistItem>> {
    return this.request(`/jellyfin/playlists/${encodeURIComponent(playlistId)}/items`, {
      query,
      signal,
    });
  }

  /** Creates a playlist named `name`, optionally seeded with `itemIds` (in the given
   * order), and resolves to its new id. */
  createJellyfinPlaylist(name: string, itemIds?: string[]): Promise<JellyfinCreatePlaylistResult> {
    return this.request('/jellyfin/playlists', {
      method: 'POST',
      body: { name, itemIds },
    });
  }

  /** Appends `itemIds` to the end of `playlistId`. */
  addToJellyfinPlaylist(playlistId: string, itemIds: string[]): Promise<void> {
    return this.request(`/jellyfin/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'POST',
      body: { itemIds },
    });
  }

  /** Removes the given playlist entries. `playlistItemIds` must be
   * `JellyfinPlaylistItem.playlistItemId` values, never `track.id` — see that type's doc
   * comment for why a track duplicated within one playlist needs this distinction to
   * remove a single occurrence. */
  removeFromJellyfinPlaylist(playlistId: string, playlistItemIds: string[]): Promise<void> {
    return this.request(`/jellyfin/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'DELETE',
      query: { playlistItemIds: playlistItemIds.join(',') },
    });
  }

  /** Not fetched via `request()` — used directly as an `<img>` src, same reasoning
   * as `coverUrl` above. The token that makes this URL work lives server-side,
   * behind the session cookie this request already carries — never in the URL. */
  jellyfinArtworkUrl(itemId: string): string {
    return buildUrl(this.baseUrl, `/jellyfin/items/${encodeURIComponent(itemId)}/artwork`);
  }

  /** Not fetched via `request()` — used directly as an `<audio>` src, same reasoning as
   * `audioTrackUrl` above: Jellyfin's own stream URL embeds the access token in the query
   * string, so it is built server-side and proxied (`GET /jellyfin/tracks/:itemId/stream`),
   * never constructed client-side. `itemId` is the track's own Jellyfin item id — Jellyfin
   * has no separate `fileId` concept the way Audiobookshelf does, so unlike `audioTrackUrl`
   * this takes a single id. */
  jellyfinTrackStreamUrl(itemId: string): string {
    return buildUrl(this.baseUrl, `/jellyfin/tracks/${encodeURIComponent(itemId)}/stream`);
  }

  // ---------------------------------------------------------------------
  // Jellyfin playback progress reporting (Phase 9 wave — see
  // `features/player/playbackSource.ts`'s `jellyfinSource`, the only caller). All three
  // routes 204 with an empty body on success, same as `closeSession` above — `request()`
  // already resolves an empty body to `undefined`, hence `Promise<void>` here rather than
  // an `{ ok: true }` wrapper. `positionSeconds` is plain seconds throughout, never
  // Jellyfin's internal tick unit — that conversion happens once, server-side
  // (`@auralis/jellyfin-client`'s `secondsToTicks`), so nothing on this side of the BFF
  // ever has to think about it.
  // ---------------------------------------------------------------------

  reportJellyfinPlaybackStart(itemId: string, positionSeconds: number): Promise<void> {
    return this.request('/jellyfin/playback/start', {
      method: 'POST',
      body: { itemId, positionSeconds },
    });
  }

  reportJellyfinPlaybackProgress(
    itemId: string,
    positionSeconds: number,
    options: { isPaused?: boolean } = {},
  ): Promise<void> {
    return this.request('/jellyfin/playback/progress', {
      method: 'POST',
      body: { itemId, positionSeconds, isPaused: options.isPaused },
    });
  }

  reportJellyfinPlaybackStopped(itemId: string, positionSeconds: number): Promise<void> {
    return this.request('/jellyfin/playback/stopped', {
      method: 'POST',
      body: { itemId, positionSeconds },
    });
  }
}

/** Type-narrowing re-export so callers don't need a separate import for the error class. */
export { ApiError };
