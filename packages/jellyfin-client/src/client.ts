/**
 * Typed client over the Jellyfin REST API, scoped to what a music experience
 * needs: authentication, browsing artists/albums/tracks, search, and pure
 * stream/artwork URL builders. Structurally a sibling of
 * `@auralis/abs-client`'s `AbsClient` — same injected-`fetch`,
 * validate-then-normalise shape — adapted for Jellyfin's own auth scheme and
 * `/Items` query model. See `schemas/raw.ts`'s file doc comment for the
 * sources each raw shape was verified against.
 *
 * Out of scope for this wave (see the phase 9 spec): playlists, favourites,
 * transcoding decisions, and the slskd music-request provider. Lyrics *display*
 * (`getLyrics`, below) shipped in the synced-lyrics-view wave; lyric *search* remains
 * out of scope — Jellyfin has no lyric-text search at all, see `docs/INTEGRATIONS.md`.
 */

import { z } from 'zod';
import { HttpClient, type FetchLike } from './http.js';
import type { JellyfinDeviceInfo } from './auth.js';
import {
  rawAuthenticationResultSchema,
  rawLyricDtoSchema,
  rawQueryResultSchema,
  rawUserItemDataDtoSchema,
  type rawBaseItemDtoSchema,
} from './schemas/raw.js';
import {
  normalizeAlbum,
  normalizeArtist,
  normalizeFavoriteState,
  normalizeLogin,
  normalizeLyrics,
  normalizeTrack,
} from './normalize.js';
import type {
  Album,
  Artist,
  LibraryPage,
  LoginResult,
  Lyrics,
  SearchResults,
  Track,
} from './domain.js';
import {
  buildImageUrl,
  buildStreamUrl,
  type ImageUrlOptions,
  type StreamUrlOptions,
} from './urls.js';
import { JellyfinError } from './errors.js';

export interface JellyfinClientConfig {
  baseUrl: string;
  fetch: FetchLike;
  device: JellyfinDeviceInfo;
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export type SortOrder = 'Ascending' | 'Descending';

export interface LibraryQuery {
  /** Scope to a specific library/folder id. Omitted, a query searches every
   * music library the user can see — `Recursive=true` is always sent, so
   * this narrows rather than being required to find anything. */
  parentId?: string;
  startIndex?: number;
  limit?: number;
  /** One of Jellyfin's `ItemSortBy` values, e.g. `'SortName'`, `'Album'`,
   * `'PremiereDate'`. Passed through verbatim — not validated client-side,
   * since the valid set is server-defined and open to server versions ahead
   * of this package. */
  sortBy?: string;
  sortOrder?: SortOrder;
  /** Scope to only this user's favourited items, via `/Items`' `filters=IsFavorite` —
   * verified directly against `Jellyfin.Api/Controllers/ItemsController.cs`'s `GetItems`,
   * whose `filters` parameter doc comment lists `IsFavorite` among the accepted
   * `ItemFilter` values (`[FromQuery, ModelBinder(typeof(CommaDelimitedCollectionModelBinder))]
   * ItemFilter[] filters`). A query param, not a separate endpoint: the same `/Items` route
   * every other library-browsing method here already uses, so favouriting composes with
   * `parentId`/`artistId`/`albumId`/pagination/sort for free rather than needing its own
   * bespoke listing method per item kind. */
  favoritesOnly?: boolean;
  /** Scopes to exactly the given item ids, via `/Items`' `ids` filter — verified against
   * `Jellyfin.Api/Controllers/ItemsController.cs`'s `GetItems`
   * (`[FromQuery, ModelBinder(typeof(CommaDelimitedCollectionModelBinder))] Guid[] ids`).
   * The one caller today (the web app's single-artist/single-album favourite-state fetch,
   * where a page has an id from its own route param but no listing endpoint that returns
   * just that one item) only ever passes one id, but this mirrors Jellyfin's own
   * multi-id-capable filter rather than inventing a narrower single-id parameter. */
  ids?: string[];
}

export type ArtistsQuery = LibraryQuery;

export interface AlbumsQuery extends LibraryQuery {
  /** Scope to one artist's albums, via the `albumArtistIds` filter — chosen
   * over `artistIds` because it matches Jellyfin's own "album artist" vs.
   * "contributing artist" distinction (`ItemsController.cs`'s
   * `albumArtistIds`/`artistIds`/`contributingArtistIds` are three separate
   * filters); an album's featured guest artists shouldn't pull it into an
   * unrelated artist's album list. */
  artistId?: string;
}

export interface TracksQuery extends LibraryQuery {
  /** Scope to one album's tracks, via the `albumIds` filter. Not `parentId`:
   * `Audio` items are not necessarily folder-children of their `MusicAlbum`
   * item in Jellyfin's virtual library tree, so `albumIds` is the filter
   * that is actually documented to work for this
   * (`ItemsController.cs`'s `albumIds` parameter). */
  albumId?: string;
}

export interface SearchOptions {
  limit?: number;
}

type RawBaseItemDto = z.infer<typeof rawBaseItemDtoSchema>;

const MUSIC_ARTIST_TYPE = 'MusicArtist';
const MUSIC_ALBUM_TYPE = 'MusicAlbum';
const AUDIO_TYPE = 'Audio';

/** .NET tick resolution: 100ns per tick, 10,000,000 ticks per second. This is the same
 * constant `normalize.ts` uses for `RunTimeTicks` — see that file's doc comment for the
 * "AudioController.cs's own comment is a stale typo" note. Playback-report
 * `PositionTicks` uses the identical convention: verified against
 * `MediaBrowser.Model/Session/PlaybackProgressInfo.cs`, whose `PositionTicks` is a
 * `long?` with no unit override, so it inherits the standard .NET `TimeSpan` tick. */
const TICKS_PER_SECOND = 10_000_000;

/**
 * Converts a position in seconds — the unit every public `JellyfinClient` playback-report
 * method takes — to the `PositionTicks` value Jellyfin's `PlaybackProgressInfo`/
 * `PlaybackStopInfo` DTOs expect. Exported and pure so it can be unit-tested on its own
 * and so a caller building a request body by hand (there shouldn't be one, but) never has
 * to re-derive the constant. Callers of this package should never need to think in
 * Jellyfin's internal tick unit — that is the entire reason this conversion is isolated
 * to one named function rather than inlined at each call site.
 */
export function secondsToTicks(positionSeconds: number): number {
  return Math.round(positionSeconds * TICKS_PER_SECOND);
}

function requireToken(token: string | undefined, action: string): string {
  if (!token) {
    throw new JellyfinError(
      'auth',
      `A token is required to ${action} — call login() or withToken() first`,
    );
  }
  return token;
}

export class JellyfinClient {
  private readonly http: HttpClient;

  constructor(config: JellyfinClientConfig | HttpClient) {
    this.http = config instanceof HttpClient ? config : new HttpClient(config);
  }

  /** A new client bound to `token`, leaving this instance untouched. */
  withToken(token: string | undefined): JellyfinClient {
    return new JellyfinClient(this.http.withToken(token));
  }

  get baseUrl(): string {
    return this.http.baseUrl;
  }

  get token(): string | undefined {
    return this.http.token;
  }

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  async login(username: string, password: string): Promise<LoginResult> {
    const raw = await this.http.requestJson('/Users/AuthenticateByName', {
      method: 'POST',
      body: { Username: username, Pw: password },
      schema: rawAuthenticationResultSchema,
      retryable: false,
    });
    return normalizeLogin(raw);
  }

  // ---------------------------------------------------------------------
  // Library browsing — all three go through /Items, Jellyfin's one listing
  // endpoint for every item kind (`ItemsController.GetItems`).
  // ---------------------------------------------------------------------

  private async queryItems(
    includeItemTypes: string,
    query: LibraryQuery & { searchTerm?: string; albumArtistIds?: string; albumIds?: string },
  ): Promise<{ items: RawBaseItemDto[]; total: number; startIndex: number }> {
    const raw = await this.http.requestJson('/Items', {
      schema: rawQueryResultSchema,
      query: {
        includeItemTypes,
        recursive: true,
        parentId: query.parentId,
        startIndex: query.startIndex,
        limit: query.limit,
        sortBy: query.sortBy ?? 'SortName',
        sortOrder: query.sortOrder ?? 'Ascending',
        searchTerm: query.searchTerm,
        albumArtistIds: query.albumArtistIds,
        albumIds: query.albumIds,
        filters: query.favoritesOnly ? 'IsFavorite' : undefined,
        ids: query.ids && query.ids.length > 0 ? query.ids.join(',') : undefined,
      },
    });
    return {
      items: raw.Items ?? [],
      total: raw.TotalRecordCount ?? 0,
      startIndex: raw.StartIndex ?? 0,
    };
  }

  async getArtists(query: ArtistsQuery = {}): Promise<LibraryPage<Artist>> {
    const page = await this.queryItems(MUSIC_ARTIST_TYPE, query);
    return {
      items: page.items.map(normalizeArtist),
      total: page.total,
      startIndex: page.startIndex,
    };
  }

  async getAlbums(query: AlbumsQuery = {}): Promise<LibraryPage<Album>> {
    const page = await this.queryItems(MUSIC_ALBUM_TYPE, {
      ...query,
      albumArtistIds: query.artistId,
    });
    return {
      items: page.items.map(normalizeAlbum),
      total: page.total,
      startIndex: page.startIndex,
    };
  }

  async getTracks(query: TracksQuery = {}): Promise<LibraryPage<Track>> {
    const page = await this.queryItems(AUDIO_TYPE, { ...query, albumIds: query.albumId });
    return {
      items: page.items.map(normalizeTrack),
      total: page.total,
      startIndex: page.startIndex,
    };
  }

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  /**
   * Searches artists, albums and tracks in one call via `/Items?searchTerm=`,
   * not Jellyfin's dedicated `/Search/Hints` (`SearchController.cs`).
   * Deliberate: `/Search/Hints` returns `SearchHintResult`, a lighter,
   * differently-shaped DTO (`SearchHintInfo`) than `/Items`'s `BaseItemDto`,
   * which would need its own raw schema, its own normalize path, and would
   * hand back an item with far less data (no `AlbumArtists`, no full
   * `ImageTags`) than everything else in this client already knows how to
   * read. Reusing `/Items` keeps one normalize path for every result and
   * gives search results the same richness as browsing.
   */
  async search(term: string, options: SearchOptions = {}): Promise<SearchResults> {
    const page = await this.queryItems(`${MUSIC_ARTIST_TYPE},${MUSIC_ALBUM_TYPE},${AUDIO_TYPE}`, {
      searchTerm: term,
      limit: options.limit,
    });

    const artists: Artist[] = [];
    const albums: Album[] = [];
    const tracks: Track[] = [];
    for (const item of page.items) {
      if (item.Type === MUSIC_ARTIST_TYPE) artists.push(normalizeArtist(item));
      else if (item.Type === MUSIC_ALBUM_TYPE) albums.push(normalizeAlbum(item));
      else if (item.Type === AUDIO_TYPE) tracks.push(normalizeTrack(item));
      // Any other Type is dropped rather than mis-bucketed — includeItemTypes
      // already scopes the query, so this only guards against a future
      // Jellyfin version returning something outside that filter.
    }
    return { artists, albums, tracks };
  }

  // ---------------------------------------------------------------------
  // Lyrics — `Jellyfin.Api/Controllers/LyricsController.cs`'s `GetLyrics`. Verified
  // directly against that controller (not memory), 2026-08-05: `[HttpGet("Audio/{itemId}/
  // Lyrics")]`, `[Authorize]`, and it returns `NotFound()` — a bare 404, no body — in
  // *two* distinct cases it cannot tell apart from one another: the item id doesn't
  // resolve to an `Audio` item at all, and the item resolves but
  // `ILyricManager.GetLyricsAsync` came back `null` (no lyric file/stream found). Either
  // way, 404 here means exactly one thing a caller can act on: "nothing to show for this
  // id" — never a transient failure — so it is folded into a typed `null` return rather
  // than a thrown `JellyfinError`, matching this package's "total functions that degrade
  // rather than throw" convention. Every other non-2xx status still throws normally.
  //
  // `GetLyricsAsync` (`MediaBrowser.Providers/Lyric/LyricManager.cs`) hands back whatever
  // the first matching `ILyricParser.ParseLyrics` produces, unmodified — no synchronous
  // "is this synced" flag is added at that layer either, which is why `normalize.ts`'s
  // `normalizeLyrics` has to derive sync state itself; see that function's doc comment.
  // ---------------------------------------------------------------------

  /**
   * Fetches `itemId`'s lyrics, or `null` if Jellyfin has none for it — see this section's
   * comment above for why a 404 is folded into `null` rather than thrown. This is the
   * common case for most of a library, not an error condition.
   */
  async getLyrics(itemId: string): Promise<Lyrics | null> {
    try {
      const raw = await this.http.requestJson(`/Audio/${itemId}/Lyrics`, {
        schema: rawLyricDtoSchema,
      });
      return normalizeLyrics(raw);
    } catch (err) {
      if (err instanceof JellyfinError && err.code === 'not_found') return null;
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Playback progress reporting — `Jellyfin.Api/Controllers/PlaystateController.cs`'s
  // `ReportPlaybackStart`/`ReportPlaybackProgress`/`ReportPlaybackStopped`. Verified
  // directly against that controller (not memory): all three are `[HttpPost]`, take a
  // `[FromBody]` DTO (`PlaybackStartInfo`/`PlaybackProgressInfo`/`PlaybackStopInfo`, the
  // first an empty subclass of the second — `MediaBrowser.Model/Session/
  // PlaybackStartInfo.cs`), and all three `return NoContent()` on success — HTTP 204,
  // empty body, hence `schema: z.void()` below rather than any parsed shape.
  //
  // `SessionId` is deliberately never sent: the controller overwrites whatever the body
  // carries with `RequestHelpers.GetSessionId(...)`, derived server-side from the
  // authenticated device/token, before calling into `SessionManager`. `PlaySessionId` is
  // likewise omitted — it only matters for killing an in-flight transcode job on stop
  // (`ReportPlaybackStopped`'s body), and this client only ever requests a static,
  // non-transcoded stream (`urls.ts`'s `buildStreamUrl` defaults `static: true`).
  //
  // Progress/stop do not require a prior start report at the controller level — neither
  // checks for an existing session state before proceeding — but `SessionManager.
  // OnPlaybackStart` is what first populates the session's `NowPlayingItem`, which is
  // what Jellyfin's "continue watching"/resume data is built from, so callers should
  // still send a start report before relying on progress reports alone.
  // ---------------------------------------------------------------------

  /** Reports that `itemId` has begun playing, at `positionSeconds` (default 0, i.e. from
   * the start). Establishes the session's `NowPlayingItem` server-side — see this
   * section's file comment. */
  async reportPlaybackStart(itemId: string, positionSeconds = 0): Promise<void> {
    await this.http.requestJson('/Sessions/Playing', {
      method: 'POST',
      body: {
        ItemId: itemId,
        PositionTicks: secondsToTicks(positionSeconds),
        IsPaused: false,
      },
      schema: z.void(),
      retryable: false,
    });
  }

  /** Reports the current position of an in-progress playback, in seconds. */
  async reportPlaybackProgress(
    itemId: string,
    positionSeconds: number,
    options: { isPaused?: boolean } = {},
  ): Promise<void> {
    await this.http.requestJson('/Sessions/Playing/Progress', {
      method: 'POST',
      body: {
        ItemId: itemId,
        PositionTicks: secondsToTicks(positionSeconds),
        IsPaused: options.isPaused ?? false,
      },
      schema: z.void(),
      retryable: false,
    });
  }

  /** Reports that playback of `itemId` has stopped at `positionSeconds`. */
  async reportPlaybackStopped(itemId: string, positionSeconds: number): Promise<void> {
    await this.http.requestJson('/Sessions/Playing/Stopped', {
      method: 'POST',
      body: {
        ItemId: itemId,
        PositionTicks: secondsToTicks(positionSeconds),
      },
      schema: z.void(),
      retryable: false,
    });
  }

  // ---------------------------------------------------------------------
  // Favourites — `Jellyfin.Api/Controllers/UserLibraryController.cs`'s `MarkFavoriteItem`/
  // `UnmarkFavoriteItem`. Verified directly against that controller (not memory),
  // 2026-08-05: both are `[HttpPost("UserFavoriteItems/{itemId}")]`/
  // `[HttpDelete("UserFavoriteItems/{itemId}")]` — no Jellyfin user id needs to be sent;
  // see `schemas/raw.ts`'s favourites section comment for why the token alone is enough.
  // Neither takes a body; both return a `UserItemDataDto`, whose `IsFavorite` reflects the
  // state *after* the change — used as the return value here rather than just trusting the
  // request succeeded, so a caller's optimistic UI update can reconcile against what the
  // server actually recorded rather than what it merely asked for.
  // ---------------------------------------------------------------------

  /** Marks `itemId` as a favourite for the signed-in user. Returns the resulting favourite
   * state (expected to be `true`) rather than `void`, so callers reconcile against the
   * server's own answer instead of assuming the request they sent is the state that stuck. */
  async markFavorite(itemId: string): Promise<boolean> {
    const raw = await this.http.requestJson(`/UserFavoriteItems/${itemId}`, {
      method: 'POST',
      schema: rawUserItemDataDtoSchema,
      retryable: false,
    });
    return normalizeFavoriteState(raw);
  }

  /** Unmarks `itemId` as a favourite for the signed-in user. See `markFavorite`'s doc
   * comment for why this returns the resulting state (expected to be `false`) rather than
   * `void`. */
  async unmarkFavorite(itemId: string): Promise<boolean> {
    const raw = await this.http.requestJson(`/UserFavoriteItems/${itemId}`, {
      method: 'DELETE',
      schema: rawUserItemDataDtoSchema,
      retryable: false,
    });
    return normalizeFavoriteState(raw);
  }

  // ---------------------------------------------------------------------
  // Playable / artwork URLs — pure, synchronous; see urls.ts.
  // ---------------------------------------------------------------------

  streamUrl(itemId: string, options?: StreamUrlOptions): string {
    const token = requireToken(this.token, 'build a stream URL');
    return buildStreamUrl(this.baseUrl, itemId, token, options);
  }

  imageUrl(itemId: string, options?: ImageUrlOptions): string {
    const token = requireToken(this.token, 'build an image URL');
    return buildImageUrl(this.baseUrl, itemId, token, options);
  }
}
