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
  BookRequest,
  JellyfinAlbum,
  JellyfinArtist,
  JellyfinConfig,
  JellyfinLibraryPage,
  JellyfinLoginBody,
  JellyfinLoginResult,
  JellyfinSearchResults,
  JellyfinTrack,
  LibraryItem,
  LibraryItemsPage,
  Library,
  LoginResponse,
  MediaProgress,
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

  /** Configures the shared Jellyfin base URL (if `baseUrl` is given) and signs the
   * caller in, in one call — mirrors `POST /jellyfin/login`'s own doc comment. */
  jellyfinLogin(body: JellyfinLoginBody): Promise<JellyfinLoginResult> {
    return this.request('/jellyfin/login', { method: 'POST', body });
  }

  getJellyfinArtists(
    query: { startIndex?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryPage<JellyfinArtist>> {
    return this.request('/jellyfin/artists', { query, signal });
  }

  getJellyfinAlbums(
    query: { artistId?: string; startIndex?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<JellyfinLibraryPage<JellyfinAlbum>> {
    return this.request('/jellyfin/albums', { query, signal });
  }

  getJellyfinTracks(
    query: { albumId?: string; startIndex?: number; limit?: number } = {},
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
}

/** Type-narrowing re-export so callers don't need a separate import for the error class. */
export { ApiError };
