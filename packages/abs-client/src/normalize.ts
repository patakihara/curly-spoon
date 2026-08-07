/**
 * Maps validated raw Audiobookshelf payloads onto the domain model in domain.ts.
 * Every function here is total over its *validated* input (zod has already run) —
 * this is the "normalise, don't re-model" layer ARCHITECTURE.md asks for.
 */

import type {
  RawLibraryItem,
  rawAudioTrackSchema,
  rawChapterSchema,
  rawLibrarySchema,
  rawLibraryFolderSchema,
  rawShelfSchema,
  rawSeriesSchema,
  rawAuthorSchema,
  rawAuthorDetailSchema,
  rawCollectionSchema,
  rawFilterDataSchema,
  rawBookmarkSchema,
  rawUserSchema,
  rawLoginResponseSchema,
  rawPlaybackSessionSchema,
  rawPodcastEpisodeSchema,
  rawSearchResponseSchema,
  rawItunesPodcastResultSchema,
  rawPodcastFeedPreviewSchema,
  rawPodcastFeedEpisodeSchema,
} from './schemas/raw.js';
import { rawLibraryItemSchema, rawMediaProgressSchema } from './schemas/raw.js';
import type { z } from 'zod';
import type {
  AudioTrack,
  Chapter,
  Library,
  LibraryFolder,
  LibraryItem,
  Media,
  Shelf,
  Series,
  Author,
  AuthorDetail,
  Collection,
  FilterData,
  MediaProgress,
  Bookmark,
  UserProfile,
  LoginResult,
  PlaybackSession,
  PodcastEpisode,
  SearchResults,
  PodcastDirectoryResult,
  PodcastFeedPreview,
  PodcastFeedEpisode,
} from './domain.js';

export function normalizeAudioTrack(raw: z.infer<typeof rawAudioTrackSchema>): AudioTrack {
  return {
    index: raw.index,
    startOffset: raw.startOffset,
    duration: raw.duration,
    title: raw.title ?? null,
    contentUrl: raw.contentUrl ?? null,
    mimeType: raw.mimeType ?? null,
  };
}

export function normalizeChapter(raw: z.infer<typeof rawChapterSchema>): Chapter {
  return { id: raw.id, start: raw.start, end: raw.end, title: raw.title };
}

export function normalizePodcastEpisode(
  raw: z.infer<typeof rawPodcastEpisodeSchema>,
): PodcastEpisode {
  return {
    id: raw.id,
    index: raw.index ?? null,
    season: raw.season ?? null,
    episodeNumber: raw.episode ?? null,
    title: raw.title,
    subtitle: raw.subtitle ?? null,
    description: raw.description ?? null,
    publishedAt: raw.publishedAt ?? null,
    duration: raw.duration ?? raw.audioTrack?.duration ?? 0,
    audioTrack: raw.audioTrack ? normalizeAudioTrack(raw.audioTrack) : null,
  };
}

function normalizeMedia(raw: RawLibraryItem): Media {
  if (raw.mediaType === 'book') {
    const { metadata } = raw.media;
    const authors =
      metadata.authors?.map((a) => ({ id: a.id, name: a.name })) ??
      (metadata.authorName ? [{ id: metadata.authorName, name: metadata.authorName }] : []);
    // Verified against Audiobookshelf 2.36.0 source (`server/models/Book.js`
    // `oldMetadataToJSONMinified()`): a minified item — every list/shelf/personalized
    // response, not just an edge case — never sends a `series` array, only the
    // flattened `seriesName` string (itself a comma-joined "Name #sequence" summary
    // when a book is in more than one series, same ambiguity `authorName` already has
    // above). Without this fallback, every minified response normalized `series` to
    // `[]`, silently dropping series membership from every home-shelf and
    // library-browse card.
    const series =
      metadata.series?.map((s) => ({ id: s.id, name: s.name, sequence: s.sequence ?? null })) ??
      (metadata.seriesName
        ? [{ id: metadata.seriesName, name: metadata.seriesName, sequence: null }]
        : []);

    return {
      kind: 'book',
      title: metadata.title,
      subtitle: metadata.subtitle ?? null,
      authors,
      narrator: metadata.narratorName ?? null,
      series,
      genres: metadata.genres ?? [],
      publishedYear: metadata.publishedYear ?? null,
      description: metadata.description ?? null,
      isbn: metadata.isbn ?? null,
      duration: raw.media.duration ?? 0,
      // `tracks`/`chapters` distinguish presence (expanded) from absence (minified):
      // an expanded item with zero tracks is still `[]`, never confused with "not fetched".
      tracks: raw.media.tracks?.map(normalizeAudioTrack),
      chapters: raw.media.chapters?.map(normalizeChapter),
    };
  }

  const { metadata } = raw.media;
  return {
    kind: 'podcast',
    title: metadata.title,
    author: metadata.author ?? null,
    description: metadata.description ?? null,
    genres: metadata.genres ?? [],
    numEpisodes: raw.media.numEpisodes ?? raw.media.episodes?.length ?? 0,
    episodes: raw.media.episodes?.map(normalizePodcastEpisode),
  };
}

/**
 * `include=progress` attaches `userMediaProgress` to the raw item. It isn't validated
 * at the request boundary the way top-level responses are (nested, best-effort): a
 * malformed progress blob degrades to "no progress" rather than failing the whole item.
 */
function extractItemProgress(raw: RawLibraryItem): MediaProgress | null {
  const candidate = (raw as { userMediaProgress?: unknown }).userMediaProgress;
  if (!candidate || typeof candidate !== 'object') return null;
  const parsed = rawMediaProgressSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return normalizeMediaProgress(parsed.data);
}

// Only book media carries a `size` field upstream; narrowing on `mediaType` first
// (rather than reading `raw.media.size` off the union directly) keeps this total
// without TypeScript collapsing the access to `never`.
function itemSize(raw: RawLibraryItem): number {
  if (raw.mediaType === 'book') return raw.size ?? raw.media.size ?? 0;
  return raw.size ?? 0;
}

export function normalizeLibraryItem(raw: RawLibraryItem): LibraryItem {
  return {
    id: raw.id,
    libraryId: raw.libraryId,
    addedAt: raw.addedAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    coverPath: raw.media.coverPath ?? null,
    size: itemSize(raw),
    media: normalizeMedia(raw),
    progress: extractItemProgress(raw),
  };
}

export function normalizeLibraryFolder(raw: z.infer<typeof rawLibraryFolderSchema>): LibraryFolder {
  return { id: raw.id, path: raw.fullPath };
}

export function normalizeLibrary(raw: z.infer<typeof rawLibrarySchema>): Library {
  return {
    id: raw.id,
    name: raw.name,
    mediaType: raw.mediaType,
    icon: raw.icon ?? null,
    folders: raw.folders?.map(normalizeLibraryFolder) ?? [],
  };
}

/**
 * A shelf's `entities` are heterogeneous across shelf types (Audiobookshelf sends
 * library items for "Continue Listening" / "Recently Added", but series or author
 * summaries for series-/author-shelves). We keep only entries that parse as a
 * `LibraryItem`, which covers every shelf the UI currently renders; non-item shelves
 * come back with an empty `items` list rather than a normalisation error.
 */
export function normalizeShelf(raw: z.infer<typeof rawShelfSchema>): Shelf {
  const items: LibraryItem[] = [];
  for (const entity of raw.entities) {
    const parsed = rawLibraryItemSchema.safeParse(entity);
    if (parsed.success) items.push(normalizeLibraryItem(parsed.data));
  }
  return { id: raw.id, label: raw.label, type: raw.type, items };
}

export function normalizeSeries(raw: z.infer<typeof rawSeriesSchema>): Series {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    books: raw.books?.map(normalizeLibraryItem) ?? [],
  };
}

export function normalizeAuthor(raw: z.infer<typeof rawAuthorSchema>): Author {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    imagePath: raw.imagePath ?? null,
    numBooks: raw.numBooks ?? 0,
  };
}

export function normalizeAuthorDetail(raw: z.infer<typeof rawAuthorDetailSchema>): AuthorDetail {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    imagePath: raw.imagePath ?? null,
    books: raw.libraryItems?.map(normalizeLibraryItem) ?? [],
  };
}

export function normalizeCollection(raw: z.infer<typeof rawCollectionSchema>): Collection {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    items: raw.books?.map(normalizeLibraryItem) ?? [],
  };
}

export function normalizeFilterData(raw: z.infer<typeof rawFilterDataSchema>): FilterData {
  return {
    genres: raw.genres ?? [],
    tags: raw.tags ?? [],
    series: raw.series ?? [],
    authors: raw.authors?.map((a) => ({ id: a.id, name: a.name })) ?? [],
    narrators: raw.narrators ?? [],
    languages: raw.languages ?? [],
  };
}

export function normalizeMediaProgress(raw: z.infer<typeof rawMediaProgressSchema>): MediaProgress {
  return {
    id: raw.id,
    libraryItemId: raw.libraryItemId,
    episodeId: raw.episodeId ?? null,
    duration: raw.duration,
    currentTime: raw.currentTime,
    progress: raw.progress,
    isFinished: raw.isFinished,
    lastUpdate: raw.lastUpdate ?? null,
    startedAt: raw.startedAt ?? null,
    finishedAt: raw.finishedAt ?? null,
  };
}

export function normalizeBookmark(raw: z.infer<typeof rawBookmarkSchema>): Bookmark {
  return {
    libraryItemId: raw.libraryItemId,
    title: raw.title,
    time: raw.time,
    createdAt: raw.createdAt,
  };
}

export function normalizeUser(raw: z.infer<typeof rawUserSchema>): UserProfile {
  return {
    id: raw.id,
    username: raw.username,
    permissions: raw.permissions ?? {},
    mediaProgress: raw.mediaProgress?.map(normalizeMediaProgress) ?? [],
    bookmarks: raw.bookmarks?.map(normalizeBookmark) ?? [],
  };
}

export function normalizeLogin(raw: z.infer<typeof rawLoginResponseSchema>): LoginResult {
  return {
    token: raw.user.token,
    user: normalizeUser(raw.user),
    defaultLibraryId: raw.userDefaultLibraryId ?? null,
  };
}

export function normalizePlaybackSession(
  raw: z.infer<typeof rawPlaybackSessionSchema>,
): PlaybackSession {
  return {
    id: raw.id,
    libraryItemId: raw.libraryItemId,
    episodeId: raw.episodeId ?? null,
    mediaType: raw.mediaType,
    displayTitle: raw.displayTitle ?? '',
    duration: raw.duration,
    currentTime: raw.currentTime ?? 0,
    audioTracks: raw.audioTracks.map(normalizeAudioTrack),
    chapters: raw.chapters?.map(normalizeChapter) ?? [],
  };
}

export function normalizeSearchResults(
  raw: z.infer<typeof rawSearchResponseSchema>,
): SearchResults {
  return {
    books: raw.book?.map((m) => normalizeLibraryItem(m.libraryItem)) ?? [],
    podcasts: raw.podcast?.map((m) => normalizeLibraryItem(m.libraryItem)) ?? [],
    series: raw.series?.map((s) => normalizeSeries(s.series)) ?? [],
    authors: raw.authors?.map(normalizeAuthor) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Podcast discovery — search directory, feed preview
// ---------------------------------------------------------------------------

/** Feed-level `explicit` arrives as a raw RSS value (a boolean, or a string like
 * `"yes"`/`"true"`/`"no"`) rather than the normalised boolean a library item's own
 * metadata carries. Anything not recognisably truthy degrades to `false` rather than
 * throwing — a podcast preview isn't the place to fail over an ambiguous tag. */
function toExplicitBoolean(value: boolean | string | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['yes', 'true', '1'].includes(value.toLowerCase());
  return false;
}

export function normalizePodcastDirectoryResult(
  raw: z.infer<typeof rawItunesPodcastResultSchema>,
): PodcastDirectoryResult {
  return {
    itunesId: raw.id,
    itunesArtistId: raw.artistId ?? null,
    title: raw.title,
    artistName: raw.artistName ?? null,
    description: raw.description ?? null,
    descriptionPlain: raw.descriptionPlain ?? null,
    releaseDate: raw.releaseDate ?? null,
    genres: raw.genres ?? [],
    cover: raw.cover ?? null,
    trackCount: raw.trackCount ?? 0,
    feedUrl: raw.feedUrl ?? null,
    pageUrl: raw.pageUrl ?? null,
    explicit: raw.explicit ?? false,
  };
}

export function normalizePodcastFeedEpisode(
  raw: z.infer<typeof rawPodcastFeedEpisodeSchema>,
): PodcastFeedEpisode {
  return {
    title: raw.title,
    subtitle: raw.subtitle ?? null,
    description: raw.description ?? null,
    pubDate: raw.pubDate ?? null,
    publishedAt: raw.publishedAt ?? null,
    episodeType: raw.episodeType ?? null,
    season: raw.season ?? null,
    episodeNumber: raw.episode ?? null,
    author: raw.author ?? null,
    duration: raw.duration ?? null,
    durationSeconds: raw.durationSeconds ?? null,
    explicit: toExplicitBoolean(raw.explicit),
    enclosure: raw.enclosure
      ? {
          url: raw.enclosure.url,
          type: raw.enclosure.type ?? null,
          length: raw.enclosure.length ?? null,
        }
      : null,
    guid: raw.guid ?? null,
    chaptersUrl: raw.chaptersUrl ?? null,
    chapters:
      raw.chapters?.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        start: chapter.start,
        end: chapter.end,
      })) ?? [],
  };
}

export function normalizePodcastFeedPreview(
  raw: z.infer<typeof rawPodcastFeedPreviewSchema>,
): PodcastFeedPreview {
  const { metadata, episodes, numEpisodes } = raw.podcast;
  return {
    title: metadata.title ?? null,
    author: metadata.author ?? null,
    description: metadata.description ?? null,
    descriptionPlain: metadata.descriptionPlain ?? null,
    feedUrl: metadata.feedUrl ?? null,
    image: metadata.image ?? null,
    categories: metadata.categories ?? [],
    language: metadata.language ?? null,
    explicit: toExplicitBoolean(metadata.explicit),
    numEpisodes: numEpisodes ?? episodes?.length ?? 0,
    episodes: episodes?.map(normalizePodcastFeedEpisode) ?? [],
    pubDate: metadata.pubDate ?? null,
    link: metadata.link ?? null,
  };
}
