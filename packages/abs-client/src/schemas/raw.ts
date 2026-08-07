/**
 * Zod schemas for Audiobookshelf's *raw* wire shapes.
 *
 * These exist only to get from `unknown` to something normalise.ts can map
 * from safely — they are never re-exported to callers of the client. We are
 * strict about fields the normaliser reads, and `.passthrough()` everywhere
 * else: Audiobookshelf's payloads are large, versioned loosely, and carry
 * many fields we don't use. Rejecting on unknown fields would make the client
 * brittle against upstream additions; ignoring fields we don't read is right.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

/**
 * One entry of a playback session's `audioTracks`. Verified against Audiobookshelf
 * v2.36.0 source, two independent producers:
 *
 * - Direct play (`server/models/Book.js` `getTracklist`): clones the item's stored
 *   `AudioFile` (`server/objects/files/AudioFile.js`), so `metadata` is always the
 *   real `FileMetadata` object.
 * - Transcode/HLS (`server/objects/files/AudioTrack.js` `setFromStream`): never sets
 *   `metadata` at all, and `toJSON()` sends it as `metadata: null` — not omitted, an
 *   explicit `null`, which `.optional()` alone does not accept.
 *
 * This matters more than it looks: `AbsClient.playItem`/`playEpisode` (`client.ts`)
 * always POST an empty body, never `supportedMimeTypes`. `PlaybackSessionManager
 * .startSession`'s `checkCanDirectPlay(options.supportedMimeTypes, …)` fails closed
 * on a non-array (`!Array.isArray(undefined)`), so **every real playback session
 * Auralis starts takes the transcode path** — this is not an edge case, it is the
 * only case, and is why a real server 502'd "did not match the expected shape" on
 * every single Resume tap. `metadata` is unused by `normalizeAudioTrack` in
 * normalize.ts, so accepting `null` costs nothing downstream.
 */
export const rawAudioTrackSchema = z
  .object({
    index: z.number(),
    startOffset: z.number(),
    duration: z.number(),
    title: z.string().optional(),
    contentUrl: z.string().optional(),
    mimeType: z.string().optional(),
    metadata: z
      .object({
        filename: z.string().optional(),
        ext: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const rawChapterSchema = z
  .object({
    id: z.number(),
    start: z.number(),
    end: z.number(),
    title: z.string(),
  })
  .passthrough();

export const rawAuthorMinifiedSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .passthrough();

export const rawSeriesSequenceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sequence: z.string().nullable().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Book / podcast metadata (minified and expanded share the same metadata shape)
// ---------------------------------------------------------------------------

export const rawBookMetadataSchema = z
  .object({
    title: z.string(),
    subtitle: z.string().nullable().optional(),
    authorName: z.string().nullable().optional(),
    authors: z.array(rawAuthorMinifiedSchema).optional(),
    narratorName: z.string().nullable().optional(),
    seriesName: z.string().nullable().optional(),
    series: z.array(rawSeriesSequenceSchema).optional(),
    genres: z.array(z.string()).optional(),
    publishedYear: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    isbn: z.string().nullable().optional(),
    asin: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    explicit: z.boolean().optional(),
  })
  .passthrough();

export const rawPodcastMetadataSchema = z
  .object({
    title: z.string(),
    author: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    feedUrl: z.string().nullable().optional(),
    genres: z.array(z.string()).optional(),
    language: z.string().nullable().optional(),
    explicit: z.boolean().optional(),
  })
  .passthrough();

export const rawPodcastEpisodeSchema = z
  .object({
    id: z.string(),
    index: z.number().optional(),
    season: z.string().nullable().optional(),
    episode: z.string().nullable().optional(),
    title: z.string(),
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    pubDate: z.string().nullable().optional(),
    publishedAt: z.number().nullable().optional(),
    duration: z.number().optional(),
    audioFile: z.unknown().optional(),
    audioTrack: rawAudioTrackSchema.optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Library item — minified vs expanded media, and book vs podcast
// ---------------------------------------------------------------------------

// `tracks`/`chapters`/`episodes` are optional on a single combined schema rather than
// a minified/expanded union: Audiobookshelf's `.passthrough()` objects would let a
// minified payload satisfy either alternative, so a union can't discriminate the
// variant. Presence of the key (checked at runtime in normalize.ts) is what tells us
// whether the item was minified or expanded, not which schema alternative matched.
const rawBookMediaSchema = z
  .object({
    metadata: rawBookMetadataSchema,
    coverPath: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    numTracks: z.number().optional(),
    duration: z.number().optional(),
    size: z.number().optional(),
    tracks: z.array(rawAudioTrackSchema).optional(),
    chapters: z.array(rawChapterSchema).optional(),
  })
  .passthrough();

const rawPodcastMediaSchema = z
  .object({
    metadata: rawPodcastMetadataSchema,
    coverPath: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    numEpisodes: z.number().optional(),
    episodes: z.array(rawPodcastEpisodeSchema).optional(),
  })
  .passthrough();

const rawBookItemSchema = z
  .object({
    id: z.string(),
    libraryId: z.string(),
    folderId: z.string().optional(),
    path: z.string().optional(),
    relPath: z.string().optional(),
    mediaType: z.literal('book'),
    addedAt: z.number().optional(),
    updatedAt: z.number().optional(),
    size: z.number().optional(),
    media: rawBookMediaSchema,
    userMediaProgress: z.unknown().optional(),
  })
  .passthrough();

const rawPodcastItemSchema = z
  .object({
    id: z.string(),
    libraryId: z.string(),
    folderId: z.string().optional(),
    path: z.string().optional(),
    relPath: z.string().optional(),
    mediaType: z.literal('podcast'),
    addedAt: z.number().optional(),
    updatedAt: z.number().optional(),
    size: z.number().optional(),
    media: rawPodcastMediaSchema,
    userMediaProgress: z.unknown().optional(),
  })
  .passthrough();

export const rawLibraryItemSchema = z.discriminatedUnion('mediaType', [
  rawBookItemSchema,
  rawPodcastItemSchema,
]);

export type RawLibraryItem = z.infer<typeof rawLibraryItemSchema>;

// ---------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------

export const rawLibraryFolderSchema = z
  .object({
    id: z.string(),
    fullPath: z.string(),
    libraryId: z.string(),
    addedAt: z.number(),
  })
  .passthrough();

export const rawLibrarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    mediaType: z.enum(['book', 'podcast']),
    icon: z.string().optional(),
    displayOrder: z.number().optional(),
    // Optional: not every existing fixture/older-server response carries folders, and a
    // library predating this field is still a valid library — just one normalizeLibrary
    // treats as having none to subscribe a podcast into.
    folders: z.array(rawLibraryFolderSchema).optional(),
  })
  .passthrough();

export const rawLibrariesResponseSchema = z
  .object({
    libraries: z.array(rawLibrarySchema),
  })
  .passthrough();

export const rawLibraryItemsResponseSchema = z
  .object({
    results: z.array(rawLibraryItemSchema),
    total: z.number(),
    limit: z.number().optional(),
    page: z.number().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Personalized shelves
// ---------------------------------------------------------------------------

export const rawShelfSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    labelStringKey: z.string().optional(),
    type: z.string(),
    entities: z.array(z.unknown()),
  })
  .passthrough();

export const rawPersonalizedResponseSchema = z.array(rawShelfSchema);

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

export const rawSeriesSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    books: z.array(rawLibraryItemSchema).optional(),
  })
  .passthrough();

export type RawSeries = z.infer<typeof rawSeriesSchema>;

interface RawSeriesResponse {
  results: RawSeries[];
  total?: number;
}

// Cast, not a looser schema: `z.array(rawSeriesSchema)` nested inside this object is
// exactly what TypeScript can validate fine standalone (see RawSeries above) — it's
// only the *printed* type of the doubly-nested object (series containing library
// items) that exceeds tsc's serialization budget (TS7056). The runtime schema is
// unchanged; only the static type is restated in a form tsc can print.
export const rawSeriesResponseSchema = z
  .object({
    results: z.array(rawSeriesSchema),
    total: z.number().optional(),
  })
  .passthrough() as unknown as z.ZodType<RawSeriesResponse>;

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

export const rawAuthorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    imagePath: z.string().nullable().optional(),
    numBooks: z.number().optional(),
  })
  .passthrough();

export const rawAuthorsResponseSchema = z
  .object({
    authors: z.array(rawAuthorSchema),
  })
  .passthrough();

/**
 * `GET /authors/:id?include=items` — a single level of nesting (an object with
 * one array of library items), unlike `rawSeriesResponseSchema`/
 * `rawCollectionsResponseSchema` above, which nest an array of objects that
 * each hold their own array of items — that double nesting is what triggers
 * the TS7056 workaround those two use. This schema doesn't need it, same as
 * `rawLibraryItemsResponseSchema`.
 */
export const rawAuthorDetailSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    imagePath: z.string().nullable().optional(),
    libraryItems: z.array(rawLibraryItemSchema).optional(),
  })
  .passthrough();

export type RawAuthorDetail = z.infer<typeof rawAuthorDetailSchema>;

// ---------------------------------------------------------------------------
// Collections / playlists (lighter normalisation — see abs-client README note)
// ---------------------------------------------------------------------------

export const rawCollectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    books: z.array(rawLibraryItemSchema).optional(),
  })
  .passthrough();

export type RawCollection = z.infer<typeof rawCollectionSchema>;

interface RawCollectionsResponse {
  collections: RawCollection[];
}

// See the note on rawSeriesResponseSchema above — same TS7056 workaround.
export const rawCollectionsResponseSchema = z
  .object({
    collections: z.array(rawCollectionSchema),
  })
  .passthrough() as unknown as z.ZodType<RawCollectionsResponse>;

export const rawPlaylistSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    items: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const rawPlaylistsResponseSchema = z
  .object({
    playlists: z.array(rawPlaylistSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Filter data
// ---------------------------------------------------------------------------

export const rawFilterDataSchema = z
  .object({
    genres: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    series: z.array(z.string()).optional(),
    authors: z.array(rawAuthorMinifiedSchema).optional(),
    narrators: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const rawSearchItemMatchSchema = z
  .object({
    libraryItem: rawLibraryItemSchema,
    matchText: z.string().optional(),
  })
  .passthrough();

export type RawSearchItemMatch = z.infer<typeof rawSearchItemMatchSchema>;
export type RawAuthor = z.infer<typeof rawAuthorSchema>;

interface RawSearchResponse {
  book?: RawSearchItemMatch[];
  podcast?: RawSearchItemMatch[];
  series?: Array<{ series: RawSeries }>;
  authors?: RawAuthor[];
}

// See the note on rawSeriesResponseSchema above — same TS7056 workaround.
export const rawSearchResponseSchema = z
  .object({
    book: z.array(rawSearchItemMatchSchema).optional(),
    podcast: z.array(rawSearchItemMatchSchema).optional(),
    series: z.array(z.object({ series: rawSeriesSchema }).passthrough()).optional(),
    authors: z.array(rawAuthorSchema).optional(),
  })
  .passthrough() as unknown as z.ZodType<RawSearchResponse>;

// ---------------------------------------------------------------------------
// Auth / user / progress
// ---------------------------------------------------------------------------

export const rawMediaProgressSchema = z
  .object({
    id: z.string(),
    libraryItemId: z.string(),
    episodeId: z.string().nullable().optional(),
    duration: z.number(),
    progress: z.number(),
    currentTime: z.number(),
    isFinished: z.boolean(),
    lastUpdate: z.number().optional(),
    startedAt: z.number().nullable().optional(),
    finishedAt: z.number().nullable().optional(),
  })
  .passthrough();

export const rawBookmarkSchema = z
  .object({
    libraryItemId: z.string(),
    title: z.string(),
    time: z.number(),
    createdAt: z.number(),
  })
  .passthrough();

export const rawUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    type: z.string().optional(),
    token: z.string().optional(),
    mediaProgress: z.array(rawMediaProgressSchema).optional(),
    bookmarks: z.array(rawBookmarkSchema).optional(),
    permissions: z.record(z.string(), z.boolean()).optional(),
  })
  .passthrough();

export const rawLoginResponseSchema = z
  .object({
    user: rawUserSchema.extend({ token: z.string() }),
    userDefaultLibraryId: z.string().optional(),
  })
  .passthrough();

export const rawMeResponseSchema = rawUserSchema;

export const rawItemsInProgressResponseSchema = z
  .object({
    libraryItems: z.array(rawLibraryItemSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Playback sessions
//
// The top-level shape (`server/objects/PlaybackSession.js` `toJSONForClient`,
// returned by `POST /api/items/:id/play[/:episodeId]` per
// `server/managers/PlaybackSessionManager.js` `startSessionRequest`) is verified
// against Audiobookshelf v2.36.0 source. See `rawAudioTrackSchema` above for why its
// `metadata` field has to tolerate `null`, not just absence.
// ---------------------------------------------------------------------------

export const rawPlaybackSessionSchema = z
  .object({
    id: z.string(),
    userId: z.string().optional(),
    libraryItemId: z.string(),
    episodeId: z.string().nullable().optional(),
    mediaType: z.enum(['book', 'podcast']),
    displayTitle: z.string().optional(),
    duration: z.number(),
    currentTime: z.number().optional(),
    playMethod: z.number().optional(),
    audioTracks: z.array(rawAudioTrackSchema),
    chapters: z.array(rawChapterSchema).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Setup / reachability probe
// ---------------------------------------------------------------------------

export const rawPingResponseSchema = z
  .object({
    app: z.string().optional(),
    serverVersion: z.string().optional(),
  })
  .passthrough();

export const rawStatusResponseSchema = z
  .object({
    isInit: z.boolean().optional(),
    language: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Podcast discovery — search directory, feed preview, subscribe
//
// Shapes verified against Audiobookshelf 2.36.0 source (advplyr/audiobookshelf):
// `SearchController.findPodcasts` (GET /search/podcast, proxies iTunes, no admin
// gate), `iTunesProvider.cleanPodcast` (the search result shape), and
// `podcastUtils.js`'s `extractPodcastMetadata`/`cleanEpisodeData` (the feed-preview
// shape returned by POST /podcasts/feed). Both `POST /podcasts/feed` and
// `POST /podcasts` require `req.user.isAdminOrUp` upstream (403 for anyone else);
// the search endpoint has no such check.
// ---------------------------------------------------------------------------

/** One iTunes search-result entry from `GET /api/search/podcast` — a bare array, not
 * wrapped in an object; upstream swallows its own provider failures to `[]`. */
export const rawItunesPodcastResultSchema = z
  .object({
    id: z.number(),
    artistId: z.number().nullable().optional(),
    title: z.string(),
    artistName: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    genres: z.array(z.string()).optional(),
    cover: z.string().nullable().optional(),
    trackCount: z.number().nullable().optional(),
    feedUrl: z.string().nullable().optional(),
    pageUrl: z.string().nullable().optional(),
    explicit: z.boolean().optional(),
  })
  .passthrough();

export const rawPodcastDirectoryResultsSchema = z.array(rawItunesPodcastResultSchema);

/** One `podcast:chapters` chapter as Audiobookshelf's `podcastUtils.js` already parses
 * it server-side (`extractEpisodeData`'s `psc:chapters` handling) — `start`/`end` are
 * seconds, already computed from the chapter timestamps and the episode duration. */
export const rawPodcastFeedChapterSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    start: z.number(),
    end: z.number(),
  })
  .passthrough();

/** The RSS-episode shape `POST /api/podcasts/feed` returns — distinct from
 * `rawPodcastEpisodeSchema` above, which is the shape of an episode already imported
 * into a library. This one has no `id` (it isn't a library entity yet), and its
 * `explicit`/`duration` come straight off the feed XML as loosely-typed strings rather
 * than the normalised numbers/booleans a library episode carries. `durationSeconds` and
 * `chapters`, unlike `duration`, are *not* raw feed text — Audiobookshelf's own
 * `podcastUtils.js` already parses them server-side (`timestampToSeconds` and
 * `psc:chapters` respectively) before this response is sent, so passing them through
 * typed carries no parsing risk of our own. */
export const rawPodcastFeedEpisodeSchema = z
  .object({
    title: z.string(),
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    pubDate: z.string().nullable().optional(),
    publishedAt: z.number().nullable().optional(),
    episodeType: z.string().nullable().optional(),
    season: z.string().nullable().optional(),
    episode: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    duration: z.string().nullable().optional(),
    durationSeconds: z.number().nullable().optional(),
    explicit: z.union([z.boolean(), z.string()]).nullable().optional(),
    enclosure: z
      .object({
        url: z.string(),
        type: z.string().optional(),
        length: z.string().optional(),
      })
      .nullable()
      .optional(),
    guid: z.string().nullable().optional(),
    chaptersUrl: z.string().nullable().optional(),
    chaptersType: z.string().nullable().optional(),
    chapters: z.array(rawPodcastFeedChapterSchema).optional(),
  })
  .passthrough();

/** Feed metadata as `POST /api/podcasts/feed` returns it — a different shape from
 * `rawPodcastMetadataSchema` (a library item's metadata): straight off the RSS
 * channel, so `explicit` is the raw feed string/boolean rather than a normalised
 * boolean, and categories arrive as `categories`, not `genres`. */
export const rawPodcastFeedMetadataSchema = z
  .object({
    title: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    descriptionPlain: z.string().nullable().optional(),
    feedUrl: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    categories: z.array(z.string()).optional(),
    language: z.string().nullable().optional(),
    explicit: z.union([z.boolean(), z.string()]).nullable().optional(),
    type: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
    pubDate: z.string().nullable().optional(),
  })
  .passthrough();

export const rawPodcastFeedPreviewSchema = z
  .object({
    podcast: z
      .object({
        metadata: rawPodcastFeedMetadataSchema,
        episodes: z.array(rawPodcastFeedEpisodeSchema).optional(),
        numEpisodes: z.number().optional(),
      })
      .passthrough(),
  })
  .passthrough();
