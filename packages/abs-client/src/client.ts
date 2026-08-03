/**
 * Typed client over the Audiobookshelf REST API.
 *
 * Every method validates the response against a raw zod schema (schemas/raw.ts)
 * and maps it onto the shared domain model (domain.ts, normalize.ts) — callers
 * never see Audiobookshelf's own JSON shapes. Construct with an injected `fetch`
 * so the whole client is testable without a live server; call `withToken` to get
 * an authenticated copy rather than mutating the client in place.
 */

import { z } from 'zod';
import { HttpClient, type FetchLike } from './http.js';
import {
  rawLoginResponseSchema,
  rawLibrariesResponseSchema,
  rawLibraryItemsResponseSchema,
  rawPersonalizedResponseSchema,
  rawSeriesResponseSchema,
  rawCollectionsResponseSchema,
  rawPlaylistsResponseSchema,
  rawAuthorsResponseSchema,
  rawFilterDataSchema,
  rawSearchResponseSchema,
  rawLibraryItemSchema,
  rawPlaybackSessionSchema,
  rawMediaProgressSchema,
  rawMeResponseSchema,
  rawItemsInProgressResponseSchema,
  rawBookmarkSchema,
  rawStatusResponseSchema,
  rawPodcastDirectoryResultsSchema,
  rawPodcastFeedPreviewSchema,
} from './schemas/raw.js';
import {
  normalizeLogin,
  normalizeLibrary,
  normalizeLibraryItem,
  normalizeShelf,
  normalizeSeries,
  normalizeCollection,
  normalizeAuthor,
  normalizeFilterData,
  normalizeSearchResults,
  normalizePlaybackSession,
  normalizeMediaProgress,
  normalizeUser,
  normalizeBookmark,
  normalizePodcastDirectoryResult,
  normalizePodcastFeedPreview,
} from './normalize.js';
import type {
  Library,
  LibraryItem,
  Shelf,
  Series,
  Collection,
  Playlist,
  Author,
  FilterData,
  SearchResults,
  PlaybackSession,
  MediaProgress,
  UserProfile,
  Bookmark,
  LoginResult,
  PodcastDirectoryResult,
  PodcastFeedPreview,
} from './domain.js';
import { AbsError } from './errors.js';

export interface AbsClientConfig {
  baseUrl: string;
  fetch: FetchLike;
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export interface LibraryItemsPage {
  items: LibraryItem[];
  total: number;
  limit: number | null;
  page: number | null;
}

export interface LibraryItemsQuery {
  limit?: number;
  page?: number;
  sort?: string;
  desc?: boolean;
  filter?: string;
  minified?: boolean;
  collapseseries?: boolean;
}

export interface SeriesPage {
  series: Series[];
  total: number;
}

export interface GetItemOptions {
  expanded?: boolean;
  includeProgress?: boolean;
}

export interface PlaySessionOptions {
  /** Force a specific playback method, e.g. `'directplay'` — passed through as-is. */
  forceTranscode?: boolean;
  mediaPlayer?: string;
}

export interface SyncSessionBody {
  currentTime: number;
  timeListened: number;
  duration: number;
}

export interface UpdateProgressBody {
  currentTime?: number;
  duration?: number;
  progress?: number;
  isFinished?: boolean;
}

export interface ServerProbe {
  reachable: true;
  isInit: boolean;
  serverVersion: string | null;
}

/** Fields real Audiobookshelf accepts on a new podcast's `media.metadata` when
 * subscribing (`Podcast.createFromRequest`) — `title` and `feedUrl` are supplied
 * separately by `SubscribePodcastParams` itself, not repeated here. */
export interface PodcastSubscribeMetadata {
  author?: string | null;
  description?: string | null;
  releaseDate?: string | null;
  imageUrl?: string | null;
  genres?: string[];
  language?: string | null;
  explicit?: boolean;
  itunesPageUrl?: string | null;
  itunesId?: number | null;
}

export interface SubscribePodcastParams {
  libraryId: string;
  folderId: string;
  /** The folder's real filesystem path (`LibraryFolder.path`), used to build the new
   * podcast's `path` per the `<folder path>/<sanitized title>` convention. */
  folderPath: string;
  rssFeed: string;
  title: string;
  metadata?: PodcastSubscribeMetadata;
  autoDownloadEpisodes?: boolean;
}

const okSchema = z.unknown();

export class AbsClient {
  private readonly http: HttpClient;

  constructor(config: AbsClientConfig | HttpClient) {
    this.http = config instanceof HttpClient ? config : new HttpClient(config);
  }

  /** A new client bound to `token`, leaving this instance untouched. */
  withToken(token: string | undefined): AbsClient {
    return new AbsClient(this.http.withToken(token));
  }

  get baseUrl(): string {
    return this.http.baseUrl;
  }

  get token(): string | undefined {
    return this.http.token;
  }

  // ---------------------------------------------------------------------
  // Reachability / setup
  // ---------------------------------------------------------------------

  /** Unauthenticated reachability probe, used by the setup flow before a token exists. */
  async probe(): Promise<ServerProbe> {
    const status = await this.http.requestJson('/status', {
      schema: rawStatusResponseSchema,
    });
    return {
      reachable: true,
      isInit: status.isInit ?? true,
      serverVersion: status.version ?? null,
    };
  }

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  async login(username: string, password: string): Promise<LoginResult> {
    const raw = await this.http.requestJson('/login', {
      method: 'POST',
      body: { username, password },
      schema: rawLoginResponseSchema,
      retryable: false,
    });
    return normalizeLogin(raw);
  }

  async getMe(): Promise<UserProfile> {
    const raw = await this.http.requestJson('/api/me', { schema: rawMeResponseSchema });
    return normalizeUser(raw);
  }

  // ---------------------------------------------------------------------
  // Libraries
  // ---------------------------------------------------------------------

  async getLibraries(): Promise<Library[]> {
    const raw = await this.http.requestJson('/api/libraries', {
      schema: rawLibrariesResponseSchema,
    });
    return raw.libraries.map(normalizeLibrary);
  }

  async getLibraryItems(
    libraryId: string,
    query: LibraryItemsQuery = {},
  ): Promise<LibraryItemsPage> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/items`,
      {
        schema: rawLibraryItemsResponseSchema,
        query: {
          limit: query.limit,
          page: query.page,
          sort: query.sort,
          desc: query.desc !== undefined ? (query.desc ? 1 : 0) : undefined,
          filter: query.filter,
          minified: query.minified !== undefined ? (query.minified ? 1 : 0) : undefined,
          collapseseries:
            query.collapseseries !== undefined ? (query.collapseseries ? 1 : 0) : undefined,
        },
      },
    );
    return {
      items: raw.results.map(normalizeLibraryItem),
      total: raw.total,
      limit: raw.limit ?? null,
      page: raw.page ?? null,
    };
  }

  async getLibraryHome(libraryId: string): Promise<Shelf[]> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/personalized`,
      { schema: rawPersonalizedResponseSchema },
    );
    return raw.map(normalizeShelf);
  }

  async getLibrarySeries(
    libraryId: string,
    query: { limit?: number; page?: number } = {},
  ): Promise<SeriesPage> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/series`,
      {
        schema: rawSeriesResponseSchema,
        query: { limit: query.limit, page: query.page },
      },
    );
    return { series: raw.results.map(normalizeSeries), total: raw.total ?? raw.results.length };
  }

  async getLibraryCollections(libraryId: string): Promise<Collection[]> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/collections`,
      { schema: rawCollectionsResponseSchema },
    );
    return raw.collections.map(normalizeCollection);
  }

  async getLibraryPlaylists(libraryId: string): Promise<Playlist[]> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/playlists`,
      { schema: rawPlaylistsResponseSchema },
    );
    return raw.playlists.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
    }));
  }

  async getLibraryAuthors(libraryId: string): Promise<Author[]> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/authors`,
      { schema: rawAuthorsResponseSchema },
    );
    return raw.authors.map(normalizeAuthor);
  }

  async getLibraryFilterData(libraryId: string): Promise<FilterData> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/filterdata`,
      { schema: rawFilterDataSchema },
    );
    return normalizeFilterData(raw);
  }

  async searchLibrary(libraryId: string, q: string, limit?: number): Promise<SearchResults> {
    const raw = await this.http.requestJson(
      `/api/libraries/${encodeURIComponent(libraryId)}/search`,
      {
        schema: rawSearchResponseSchema,
        query: { q, limit },
      },
    );
    return normalizeSearchResults(raw);
  }

  /**
   * Kick off a library rescan. A 404 is swallowed rather than thrown: this endpoint was
   * added to Audiobookshelf at a specific version, and failing an otherwise-successful
   * import because a convenience "scan now" call is missing on an older server is worse
   * than doing nothing and letting Audiobookshelf pick the new file up on its own next
   * scheduled scan. Every other error (auth, 5xx, network) still propagates.
   */
  async scanLibrary(libraryId: string, force = false): Promise<void> {
    try {
      await this.http.requestJson(`/api/libraries/${encodeURIComponent(libraryId)}/scan`, {
        method: 'POST',
        schema: okSchema,
        query: { force: force ? 1 : undefined },
        retryable: false,
      });
    } catch (err) {
      if (err instanceof AbsError && err.code === 'not_found') return;
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------

  async getItem(itemId: string, options: GetItemOptions = {}): Promise<LibraryItem> {
    const raw = await this.http.requestJson(`/api/items/${encodeURIComponent(itemId)}`, {
      schema: rawLibraryItemSchema,
      query: {
        expanded: options.expanded !== undefined ? (options.expanded ? 1 : 0) : undefined,
        include: options.includeProgress ? 'progress' : undefined,
      },
    });
    return normalizeLibraryItem(raw);
  }

  async getItemsInProgress(): Promise<LibraryItem[]> {
    const raw = await this.http.requestJson('/api/me/items-in-progress', {
      schema: rawItemsInProgressResponseSchema,
    });
    return raw.libraryItems.map(normalizeLibraryItem);
  }

  // ---------------------------------------------------------------------
  // Media proxy (raw bytes — the BFF streams these through, never buffering)
  // ---------------------------------------------------------------------

  /** Fetch cover bytes as a raw `Response` for the BFF to stream/cache; never JSON-parsed. */
  async fetchCover(
    itemId: string,
    query: { width?: number; height?: number; format?: string; raw?: boolean } = {},
  ): Promise<Response> {
    return this.http.requestRaw(`/api/items/${encodeURIComponent(itemId)}/cover`, { query });
  }

  /**
   * Fetch audio bytes as a raw `Response`, passing a client `Range` header through
   * verbatim so upstream's 206 partial-content behaviour survives the proxy hop.
   */
  async fetchAudioTrack(itemId: string, fileId: string, range?: string): Promise<Response> {
    return this.http.requestRaw(
      `/api/items/${encodeURIComponent(itemId)}/file/${encodeURIComponent(fileId)}`,
      { headers: range ? { Range: range } : {} },
    );
  }

  // ---------------------------------------------------------------------
  // Playback sessions
  // ---------------------------------------------------------------------

  async playItem(itemId: string, _options: PlaySessionOptions = {}): Promise<PlaybackSession> {
    const raw = await this.http.requestJson(`/api/items/${encodeURIComponent(itemId)}/play`, {
      method: 'POST',
      body: {},
      schema: rawPlaybackSessionSchema,
      retryable: false,
    });
    return normalizePlaybackSession(raw);
  }

  async playEpisode(
    itemId: string,
    episodeId: string,
    _options: PlaySessionOptions = {},
  ): Promise<PlaybackSession> {
    const raw = await this.http.requestJson(
      `/api/items/${encodeURIComponent(itemId)}/play/${encodeURIComponent(episodeId)}`,
      { method: 'POST', body: {}, schema: rawPlaybackSessionSchema, retryable: false },
    );
    return normalizePlaybackSession(raw);
  }

  /** Never retried: applying the same listen-progress delta twice would double-count it. */
  async syncSession(sessionId: string, body: SyncSessionBody): Promise<void> {
    await this.http.requestJson(`/api/session/${encodeURIComponent(sessionId)}/sync`, {
      method: 'POST',
      body,
      schema: okSchema,
      retryable: false,
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.http.requestJson(`/api/session/${encodeURIComponent(sessionId)}/close`, {
      method: 'POST',
      schema: okSchema,
      retryable: false,
    });
  }

  // ---------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------

  /** `null` when Audiobookshelf has no progress recorded for this item (a 404 there is not an error). */
  async getProgress(itemId: string, episodeId?: string): Promise<MediaProgress | null> {
    const path = episodeId
      ? `/api/me/progress/${encodeURIComponent(itemId)}/${encodeURIComponent(episodeId)}`
      : `/api/me/progress/${encodeURIComponent(itemId)}`;
    try {
      const raw = await this.http.requestJson(path, { schema: rawMediaProgressSchema });
      return normalizeMediaProgress(raw);
    } catch (err) {
      if (err instanceof AbsError && err.code === 'not_found') return null;
      throw err;
    }
  }

  async updateProgress(
    itemId: string,
    episodeId: string | undefined,
    patch: UpdateProgressBody,
  ): Promise<MediaProgress> {
    const path = episodeId
      ? `/api/me/progress/${encodeURIComponent(itemId)}/${encodeURIComponent(episodeId)}`
      : `/api/me/progress/${encodeURIComponent(itemId)}`;
    const raw = await this.http.requestJson(path, {
      method: 'PATCH',
      body: patch,
      schema: rawMediaProgressSchema,
      retryable: false,
    });
    return normalizeMediaProgress(raw);
  }

  // ---------------------------------------------------------------------
  // Bookmarks
  // ---------------------------------------------------------------------

  async addBookmark(itemId: string, time: number, title: string): Promise<Bookmark> {
    const raw = await this.http.requestJson(`/api/me/item/${encodeURIComponent(itemId)}/bookmark`, {
      method: 'POST',
      body: { time, title },
      schema: rawBookmarkSchema,
      retryable: false,
    });
    return normalizeBookmark(raw);
  }

  async updateBookmark(itemId: string, time: number, title: string): Promise<Bookmark> {
    const raw = await this.http.requestJson(`/api/me/item/${encodeURIComponent(itemId)}/bookmark`, {
      method: 'PATCH',
      body: { time, title },
      schema: rawBookmarkSchema,
      retryable: false,
    });
    return normalizeBookmark(raw);
  }

  async deleteBookmark(itemId: string, time: number): Promise<void> {
    await this.http.requestJson(
      `/api/me/item/${encodeURIComponent(itemId)}/bookmark/${encodeURIComponent(String(time))}`,
      { method: 'DELETE', schema: okSchema, retryable: false },
    );
  }

  // ---------------------------------------------------------------------
  // Podcast discovery — search directory, feed preview, subscribe
  // ---------------------------------------------------------------------

  /** iTunes-backed podcast directory search. Idempotent GET, so left retryable — the
   * default GET retry policy applies. An empty result is normal (upstream swallows its
   * own provider failures to `[]`), not surfaced as an error. */
  async searchPodcastDirectory(term: string, country?: string): Promise<PodcastDirectoryResult[]> {
    const raw = await this.http.requestJson('/api/search/podcast', {
      schema: rawPodcastDirectoryResultsSchema,
      query: { term, country },
    });
    return raw.map(normalizePodcastDirectoryResult);
  }

  /** Fetches and parses an RSS feed upstream before subscribing — expensive (a real
   * network fetch + XML parse on the Audiobookshelf side), so never retried. */
  async previewPodcastFeed(rssFeedUrl: string): Promise<PodcastFeedPreview> {
    const raw = await this.http.requestJson('/api/podcasts/feed', {
      method: 'POST',
      body: { rssFeed: rssFeedUrl },
      schema: rawPodcastFeedPreviewSchema,
      retryable: false,
    });
    return normalizePodcastFeedPreview(raw);
  }

  /**
   * Subscribes to a podcast, creating a new library item. Never retried — it has a
   * real, non-idempotent side effect (a new item on disk and in Audiobookshelf's DB);
   * retrying a timed-out attempt could create the same podcast twice.
   *
   * Builds `path` as `"<folder.path>/<sanitized title>"` (the convention Audiobookshelf
   * needs to place a new podcast under an existing library folder) — the title is
   * sanitized only enough to keep a literal `/` from escaping into an unintended path
   * segment, and to keep a title of exactly `.` or `..` from resolving to the folder
   * itself or its parent once it becomes a path segment; a full filesystem-safe-name
   * sanitizer is out of scope here.
   */
  async subscribePodcast(params: SubscribePodcastParams): Promise<LibraryItem> {
    const slashSanitized = params.title.replaceAll('/', '-');
    // A title that is *only* dots survives the slash-stripping above unchanged (there is
    // no '/' to replace) and would otherwise resolve as a `.`/`..` path segment — i.e. the
    // folder itself or its parent — once concatenated onto folderPath below.
    const sanitizedTitle = /^\.+$/.test(slashSanitized) ? `_${slashSanitized}` : slashSanitized;
    const folderPath = params.folderPath.replace(/\/+$/, '');
    const path = `${folderPath}/${sanitizedTitle}`;
    const metadata = params.metadata ?? {};

    const raw = await this.http.requestJson('/api/podcasts', {
      method: 'POST',
      body: {
        libraryId: params.libraryId,
        folderId: params.folderId,
        path,
        media: {
          metadata: {
            title: params.title,
            feedUrl: params.rssFeed,
            author: metadata.author,
            description: metadata.description,
            releaseDate: metadata.releaseDate,
            imageUrl: metadata.imageUrl,
            genres: metadata.genres,
            language: metadata.language,
            explicit: metadata.explicit,
            itunesPageUrl: metadata.itunesPageUrl,
            itunesId: metadata.itunesId,
          },
          autoDownloadEpisodes: params.autoDownloadEpisodes,
        },
      },
      schema: rawLibraryItemSchema,
      retryable: false,
    });
    return normalizeLibraryItem(raw);
  }
}
