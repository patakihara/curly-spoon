/** Zod schemas for the BFF's own request boundary (params/query/body) — see validation.ts. */

import { z } from 'zod';
import { REQUEST_STATUSES } from '../requests/requestStatus.js';

// Query strings are always raw text, so a plain `z.boolean()` would reject `"true"`.
// `Boolean("false")` is also `true`, so `z.coerce.boolean()` is wrong here too — accept
// the literal tokens a client would actually send and normalise those.
const boolQueryParam = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

export const idParamSchema = z.object({ id: z.string().min(1) });
export const itemIdParamSchema = z.object({ itemId: z.string().min(1) });
export const itemEpisodeParamSchema = z.object({
  itemId: z.string().min(1),
  episodeId: z.string().min(1),
});
export const mediaTrackParamSchema = z.object({
  itemId: z.string().min(1),
  fileId: z.string().min(1),
});
export const progressQuerySchema = z.object({
  episodeId: z.string().min(1).optional(),
});

export const libraryItemsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  page: z.coerce.number().int().min(0).optional(),
  sort: z.string().optional(),
  desc: boolQueryParam,
  filter: z.string().optional(),
  minified: boolQueryParam,
  collapseseries: boolQueryParam,
});

export const getItemQuerySchema = z.object({
  expanded: boolQueryParam,
  include: z.enum(['progress']).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'q is required'),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const seriesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  page: z.coerce.number().int().min(0).optional(),
});

export const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const setupBodySchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid absolute URL'),
});

export const syncBodySchema = z.object({
  currentTime: z.number().min(0),
  timeListened: z.number().min(0),
  duration: z.number().min(0),
});

export const updateProgressBodySchema = z.object({
  currentTime: z.number().min(0).optional(),
  duration: z.number().min(0).optional(),
  progress: z.number().min(0).max(1).optional(),
  isFinished: z.boolean().optional(),
});

export const coverQuerySchema = z.object({
  width: z.coerce.number().int().positive().max(4000).optional(),
  height: z.coerce.number().int().positive().max(4000).optional(),
  format: z.enum(['jpeg', 'webp', 'png']).optional(),
});

// -----------------------------------------------------------------------------
// Book requests (routes/requests.ts)
// -----------------------------------------------------------------------------

/** Mirrors `requests/types.ts`'s `Release` field-for-field — this is the boundary that
 * turns an untyped "release the client picked" body into something `RequestService` can
 * trust without re-validating it itself. */
export const releaseSchema = z.object({
  guid: z.string().min(1),
  indexerId: z.string().min(1),
  sourceName: z.string(),
  title: z.string(),
  sizeBytes: z.number().nullable(),
  seeders: z.number(),
  leechers: z.number(),
  publishedAt: z.number().nullable(),
  downloadUrl: z.string().nullable(),
  magnetUri: z.string().nullable(),
  categories: z.array(z.string()),
  format: z.string().nullable(),
});

export const listRequestsQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
});

export const createRequestBodySchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(500),
  author: z.string().trim().min(1).optional(),
  release: releaseSchema.optional(),
});

export const searchReleasesQuerySchema = z.object({
  term: z.string().trim().min(1, 'term is required'),
  author: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// -----------------------------------------------------------------------------
// Music requests (routes/musicRequests.ts)
// -----------------------------------------------------------------------------

export const musicSearchQuerySchema = z.object({
  term: z.string().trim().min(1, 'term is required'),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// -----------------------------------------------------------------------------
// Providers (indexers, download clients) — routes/requests.ts
// -----------------------------------------------------------------------------

export const providerConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  baseUrl: z.string().nullable().optional(),
  options: z.record(z.unknown()).optional(),
  /** Raw field values keyed by `SecretField.key` — see `assembleSecret` in requests.ts for
   * how this turns into the single stored secret string. */
  secret: z.record(z.string()).optional(),
});

// -----------------------------------------------------------------------------
// Request-pipeline settings (routes/requests.ts)
// -----------------------------------------------------------------------------

export const requestSettingsBodySchema = z.object({
  approvalPolicy: z.enum(['auto', 'manual']).optional(),
  bookSavePath: z.string().nullable().optional(),
  bookCategory: z.string().nullable().optional(),
});

// -----------------------------------------------------------------------------
// Podcast discovery (routes/podcasts.ts) — search, feed preview, subscribe
// -----------------------------------------------------------------------------

export const searchPodcastDirectoryQuerySchema = z.object({
  term: z.string().trim().min(1, 'term is required'),
  country: z.string().trim().min(1).optional(),
});

export const previewPodcastFeedBodySchema = z.object({
  rssFeed: z.string().url('rssFeed must be a valid absolute URL'),
});

/** Mirrors `AbsClient`'s `PodcastSubscribeMetadata` field-for-field — see
 * `subscribePodcast` in `@auralis/abs-client` for how each field maps onto the
 * upstream `media.metadata` Audiobookshelf expects when creating a podcast. */
export const podcastSubscribeMetadataSchema = z.object({
  author: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  genres: z.array(z.string()).optional(),
  language: z.string().nullable().optional(),
  explicit: z.boolean().optional(),
  itunesPageUrl: z.string().nullable().optional(),
  itunesId: z.number().nullable().optional(),
});

export const subscribePodcastBodySchema = z.object({
  libraryId: z.string().min(1),
  folderId: z.string().min(1),
  folderPath: z.string().min(1),
  rssFeed: z.string().url('rssFeed must be a valid absolute URL'),
  title: z.string().trim().min(1, 'title is required'),
  metadata: podcastSubscribeMetadataSchema.optional(),
  autoDownloadEpisodes: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// Jellyfin music (routes/jellyfin.ts)
// -----------------------------------------------------------------------------

/** `baseUrl` is optional: after the first successful login it's reused from the stored
 * `jellyfin` settings row (see routes/jellyfin.ts), same as re-authenticating doesn't
 * require re-typing the server address. */
export const jellyfinLoginBodySchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid absolute URL').optional(),
  username: z.string().min(1),
  password: z.string().min(1),
});

const jellyfinSortOrderSchema = z.enum(['Ascending', 'Descending']);

/** Shared by artists/albums/tracks — mirrors `@auralis/jellyfin-client`'s `LibraryQuery`
 * field-for-field. `sortBy` is passed through unvalidated, same reasoning as the client
 * itself: the valid set is server-defined (`ItemSortBy`) and open to server versions
 * ahead of what this BFF knows about. */
export const jellyfinLibraryQuerySchema = z.object({
  parentId: z.string().min(1).optional(),
  startIndex: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  sortBy: z.string().optional(),
  sortOrder: jellyfinSortOrderSchema.optional(),
  /** Mirrors `@auralis/jellyfin-client`'s `LibraryQuery.favoritesOnly` — scopes the
   * listing to just this user's favourited items via that client's `filters=IsFavorite`. */
  favoritesOnly: boolQueryParam,
  /** Mirrors `@auralis/jellyfin-client`'s `LibraryQuery.ids` — a comma-separated list, the
   * wire shape a query string param actually takes (an HTTP query string has no native
   * array type), split back into individual ids here at the boundary. */
  ids: z
    .string()
    .min(1)
    .optional()
    .transform((v) => (v === undefined ? undefined : v.split(',').filter(Boolean))),
});

export const jellyfinAlbumsQuerySchema = jellyfinLibraryQuerySchema.extend({
  artistId: z.string().min(1).optional(),
});

export const jellyfinTracksQuerySchema = jellyfinLibraryQuerySchema.extend({
  albumId: z.string().min(1).optional(),
});

export const jellyfinSearchQuerySchema = z.object({
  term: z.string().trim().min(1, 'term is required'),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const jellyfinItemIdParamSchema = z.object({ itemId: z.string().min(1) });

export const jellyfinPlaylistIdParamSchema = z.object({ playlistId: z.string().min(1) });

/** Query for `GET /jellyfin/playlists/:playlistId/items` — deliberately narrower than
 * `jellyfinLibraryQuerySchema`: a playlist's own item order is fixed server-side (see
 * `JellyfinClient.getPlaylistItems`'s doc comment), so `sortBy`/`sortOrder`/`favoritesOnly`
 * don't apply here the way they do to a library browse. */
export const jellyfinPlaylistItemsQuerySchema = z.object({
  startIndex: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const jellyfinCreatePlaylistBodySchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  itemIds: z.array(z.string().min(1)).optional(),
});

export const jellyfinAddToPlaylistBodySchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, 'itemIds must include at least one item'),
});

/** Mirrors `jellyfinLibraryQuerySchema.ids`'s comma-separated-query-string shape — an HTTP
 * query string has no native array type. Unlike that field, this one is required and
 * non-empty: a `DELETE` with nothing to remove is a caller bug worth rejecting rather than
 * silently no-op'ing against Jellyfin. These are `PlaylistItem.playlistItemId` values, not
 * track ids — see `JellyfinClient.removeFromPlaylist`'s doc comment for why the distinction
 * is load-bearing. */
export const jellyfinRemoveFromPlaylistQuerySchema = z.object({
  playlistItemIds: z
    .string()
    .min(1, 'playlistItemIds is required')
    .transform((v) => v.split(',').filter(Boolean))
    .refine((ids) => ids.length > 0, 'playlistItemIds must include at least one entry'),
});

/** Body for the three `POST /jellyfin/playback/*` routes — mirrors `JellyfinClient`'s
 * `reportPlaybackStart`/`reportPlaybackProgress`/`reportPlaybackStopped` parameters
 * one-for-one. `positionSeconds` stays in seconds at this boundary too, same reasoning as
 * the client package: the tick conversion is Jellyfin's own internal concern, not
 * something either the BFF or its caller should have to think about. Non-negative only —
 * a negative position can't correspond to anything Jellyfin would accept as meaningful. */
export const jellyfinPlaybackReportBodySchema = z.object({
  itemId: z.string().min(1),
  positionSeconds: z.number().min(0),
});

export const jellyfinPlaybackProgressBodySchema = jellyfinPlaybackReportBodySchema.extend({
  isPaused: z.boolean().optional(),
});
