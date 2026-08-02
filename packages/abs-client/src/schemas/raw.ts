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

export const rawLibrarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    mediaType: z.enum(['book', 'podcast']),
    icon: z.string().optional(),
    displayOrder: z.number().optional(),
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
