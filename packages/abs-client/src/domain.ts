/**
 * The domain model every AbsClient method returns.
 *
 * Audiobookshelf's own JSON is never handed to callers — see schemas/raw.ts
 * and normalize.ts. Books and podcast episodes are shaped so the UI can treat
 * both uniformly (a title, a duration, artwork, progress), per ARCHITECTURE.md.
 *
 * A field typed `T[] | undefined` (as opposed to `T[]`) means "this list is
 * only present when the source payload was the *expanded* variant" — the
 * minified list endpoints never populate it. Treat `undefined` as "not
 * fetched", and `[]` as "fetched, genuinely empty".
 *
 * `Book.authors` and `Book.series` do NOT follow that convention, and this is
 * a real trap, not a nuance — it is what let the series/author detail pages
 * ship broken (see `docs/HANDOVER.md`, "author and series detail pages",
 * 2026-08-07). A minified item never sends the structured `authors`/`series`
 * arrays either (verified against Audiobookshelf 2.36.0 source), but
 * `normalizeMedia` always fills them in from the flattened `authorName`/
 * `seriesName` strings rather than leaving them `undefined` — so they are
 * *never* absent, and code that only checks "is this array non-empty" will
 * not notice it's looking at fallback data. The fabricated entries are
 * detectable only by field: their `id` equals the display name (a minified
 * item carries no real author/series id at all, so there is nothing else to
 * put there), and their `sequence` is always `null`. Comparing that `id`
 * against a real entity id (an author id from a route param, a series id
 * from a route param) will *never* match on a minified item — this is
 * exactly the bug `findAuthorBooks` and `SeriesPage`'s old `seriesId`
 * lookup had. Fetch the entity's own detail endpoint instead of matching
 * against these fields when you need real identity; they're fine for
 * display (a name badge) and unsafe for identity lookups.
 */

export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface AudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string | null;
  /** Upstream-relative path used to build a playable URL via `buildAudioTrackUrl`. */
  contentUrl: string | null;
  mimeType: string | null;
}

export interface AuthorRef {
  id: string;
  name: string;
}

export interface SeriesSequence {
  id: string;
  name: string;
  /** e.g. "3" or "3.5"; `null` when the item isn't numbered within the series. */
  sequence: string | null;
}

export interface Book {
  kind: 'book';
  title: string;
  subtitle: string | null;
  authors: AuthorRef[];
  narrator: string | null;
  series: SeriesSequence[];
  genres: string[];
  publishedYear: string | null;
  description: string | null;
  isbn: string | null;
  duration: number;
  tracks: AudioTrack[] | undefined;
  chapters: Chapter[] | undefined;
}

export interface PodcastEpisode {
  id: string;
  index: number | null;
  season: string | null;
  episodeNumber: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  publishedAt: number | null;
  duration: number;
  audioTrack: AudioTrack | null;
}

export interface Podcast {
  kind: 'podcast';
  title: string;
  author: string | null;
  description: string | null;
  genres: string[];
  numEpisodes: number;
  episodes: PodcastEpisode[] | undefined;
}

export type Media = Book | Podcast;

export interface LibraryItem {
  id: string;
  libraryId: string;
  addedAt: number | null;
  updatedAt: number | null;
  coverPath: string | null;
  size: number;
  media: Media;
  /** Present only when the request asked for `include=progress`. */
  progress: MediaProgress | null;
}

export interface LibraryFolder {
  id: string;
  /** The real filesystem path Audiobookshelf watches for this folder — used to build
   * the `path` a new podcast subscription is created under (see `subscribePodcast`). */
  path: string;
}

export interface Library {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  icon: string | null;
  /** `[]` when the source payload carried no folders (or predates this field) — never
   * `undefined`, unlike the `tracks`/`chapters`/`episodes` minified/expanded split
   * above: every `getLibraries()` call is already a "full" library listing. */
  folders: LibraryFolder[];
}

export interface Shelf {
  id: string;
  label: string;
  type: string;
  items: LibraryItem[];
}

export interface Series {
  id: string;
  name: string;
  description: string | null;
  /** Populated when the listing endpoint expands book membership; `[]` otherwise. */
  books: LibraryItem[];
}

export interface Author {
  id: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  numBooks: number;
}

/**
 * `GET /authors/:id?include=items` — the author's own real page. Unlike `Author`
 * above (a summary row from the library-wide author list), this carries the
 * author's actual books, fetched server-side by Audiobookshelf itself
 * (`AuthorController.findOne`'s `Database.libraryItemModel.getForAuthor`) rather
 * than derived by matching `Book.authors[].id` against minified items — which,
 * per the trap documented on this file's header comment, can never work.
 * `books` is minified (Audiobookshelf's own `toOldJSONMinified()`), same as
 * every other list/shelf response.
 */
export interface AuthorDetail {
  id: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  books: LibraryItem[];
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  items: LibraryItem[];
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
}

export interface FilterData {
  genres: string[];
  tags: string[];
  series: string[];
  authors: AuthorRef[];
  narrators: string[];
  languages: string[];
}

export interface SearchResults {
  books: LibraryItem[];
  podcasts: LibraryItem[];
  series: Series[];
  authors: Author[];
}

export interface MediaProgress {
  id: string;
  libraryItemId: string;
  episodeId: string | null;
  duration: number;
  /**
   * Seconds, not milliseconds — this project's convention is that unsuffixed time
   * fields are seconds and only `Ms`-suffixed fields are milliseconds. Verified against
   * Audiobookshelf 2.36.0 source: `server/objects/PlaybackSession.js` derives it from
   * `MediaProgress.currentTime` (`server/managers/PlaybackSessionManager.js`,
   * `userStartTime = Number.parseFloat(userProgress.currentTime)`), which is stored and
   * compared directly against `duration` (itself seconds, from ffprobe) with no scaling
   * anywhere in the chain.
   */
  currentTime: number;
  /** 0..1 */
  progress: number;
  isFinished: boolean;
  lastUpdate: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface Bookmark {
  libraryItemId: string;
  title: string;
  time: number;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  username: string;
  permissions: Record<string, boolean>;
  mediaProgress: MediaProgress[];
  bookmarks: Bookmark[];
}

export interface LoginResult {
  token: string;
  user: UserProfile;
  defaultLibraryId: string | null;
}

export interface PlaybackSession {
  id: string;
  libraryItemId: string;
  episodeId: string | null;
  mediaType: 'book' | 'podcast';
  displayTitle: string;
  duration: number;
  /**
   * Seconds, not milliseconds — this project's convention is that unsuffixed time
   * fields are seconds and only `Ms`-suffixed fields are milliseconds. Verified against
   * Audiobookshelf 2.36.0 source: `server/objects/PlaybackSession.js` derives it from
   * `MediaProgress.currentTime` (`server/managers/PlaybackSessionManager.js`,
   * `userStartTime = Number.parseFloat(userProgress.currentTime)`), which is stored and
   * compared directly against `duration` (itself seconds, from ffprobe) with no scaling
   * anywhere in the chain.
   */
  currentTime: number;
  audioTracks: AudioTrack[];
  chapters: Chapter[];
}

export interface ServerPing {
  reachable: true;
  serverVersion: string | null;
}

// ---------------------------------------------------------------------------
// Podcast discovery — search directory, feed preview, subscribe
// ---------------------------------------------------------------------------

/** One result from the iTunes-backed podcast directory search (`GET /search/podcast`).
 * Not a library entity — `itunesId`/`itunesArtistId` are iTunes's own numeric ids, kept
 * distinct from this codebase's own string entity ids so a caller can never mistake one
 * for the other. */
export interface PodcastDirectoryResult {
  itunesId: number;
  itunesArtistId: number | null;
  title: string;
  artistName: string | null;
  description: string | null;
  descriptionPlain: string | null;
  releaseDate: string | null;
  genres: string[];
  cover: string | null;
  trackCount: number;
  feedUrl: string | null;
  pageUrl: string | null;
  explicit: boolean;
}

/** One `podcast:chapters` chapter, already parsed into seconds by Audiobookshelf itself
 * before the feed-preview response reaches us — see `PodcastFeedEpisode.chapters`. */
export interface PodcastFeedChapter {
  id: number;
  title: string;
  start: number;
  end: number;
}

/** One episode as it appears in an as-yet-unsubscribed RSS feed (`POST /podcasts/feed`) —
 * not yet a library entity, so no `id`; `duration` stays the raw feed string rather than
 * being parsed into seconds, since feeds format it inconsistently (`"3600"` vs `"1:00:00"`)
 * and getting that wrong silently would be worse than passing it through unparsed.
 * `durationSeconds` and `chapters`, unlike `duration`, are safe to carry as typed values:
 * Audiobookshelf's own feed parser has already done that parsing server-side, so there is
 * no parsing risk of our own to get wrong. */
export interface PodcastFeedEpisode {
  title: string;
  subtitle: string | null;
  description: string | null;
  pubDate: string | null;
  publishedAt: number | null;
  episodeType: string | null;
  season: string | null;
  episodeNumber: string | null;
  author: string | null;
  duration: string | null;
  durationSeconds: number | null;
  explicit: boolean;
  enclosure: { url: string; type: string | null; length: string | null } | null;
  guid: string | null;
  chaptersUrl: string | null;
  chapters: PodcastFeedChapter[];
}

/** A previewed RSS feed, before subscribing — the response of `POST /podcasts/feed`. */
export interface PodcastFeedPreview {
  title: string | null;
  author: string | null;
  description: string | null;
  descriptionPlain: string | null;
  feedUrl: string | null;
  image: string | null;
  categories: string[];
  language: string | null;
  explicit: boolean;
  numEpisodes: number;
  episodes: PodcastFeedEpisode[];
  pubDate: string | null;
  link: string | null;
}
