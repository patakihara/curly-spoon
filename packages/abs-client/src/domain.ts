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
 * `Book.authors` and `Book.series` do NOT follow that convention: a minified
 * item never sends the structured `authors`/`series` arrays either (verified
 * against Audiobookshelf 2.36.0 source), but `normalizeMedia` always fills
 * them in from the flattened `authorName`/`seriesName` strings rather than
 * leaving them `undefined` — so they are *never* absent. On a minified item
 * this is a single fabricated entry whose display name stands in for
 * everything else, including — historically — a fake `id` equal to that same
 * name, because a minified item carries no real author/series id at all.
 *
 * That fabricated `id` is what shipped the bug twice: `findAuthorBooks` and
 * `SeriesPage`'s old `seriesId` lookup both compared it against a real entity
 * id (a route param) and could never match, because "the display name" is
 * never equal to a real id — see `docs/HANDOVER.md`'s two write-ups
 * (`7e57a78`, `7bf6e49`). Prose documented the trap after the first
 * occurrence and the second one shipped anyway, so the fake id is now simply
 * not part of this type: `Book.authors`/`Book.series` are typed as
 * `AuthorBadge[]`/`SeriesBadge[]` — display-only shapes with no `id` field at
 * all. `book.media.authors[0].id` is a compile error.
 *
 * **It is a compile error on an expanded item too, and that is a deliberate
 * over-correction rather than a claim that the id is fake there.** An earlier
 * draft of this comment asserted the id is never trustworthy; review
 * established that is wrong. `normalizeMedia` passes `metadata.authors[].id`
 * through verbatim when the array is present, and those ids are real and
 * matchable — only the `authorName` fallback branch, taken for minified items,
 * fabricates `id = displayName`. The two shapes are indistinguishable at the
 * type level once normalized, so a type that admits `id` admits the fabricated
 * one; that is precisely how the bug shipped twice. This trades a real
 * capability for that safety: an expanded item already holds the author id
 * needed to deep-link `/author/:id` without a second fetch, and no consumer
 * can reach it now. Nothing needs it today. If something does, the fix is to
 * make the two shapes distinguishable — a discriminated `AuthorRef |
 * AuthorBadge` on `Book.authors` — **not** to put `id` back on the badge.
 *
 * Until then, get real identity from a dedicated fetch: `AbsClient.getAuthor`
 * for an author, or the top-level `Series` list for a series.
 *
 * The wire response still carries the fabricated `id` key at runtime —
 * `normalizeMedia` was left constructing it unchanged, because Android's
 * `AuthorRef`/`SeriesSequence` Kotlin models (`ApiModels.kt`) declare `id` as
 * a non-nullable, no-default field: dropping the key from the JSON would
 * throw `MissingFieldException` on every book with authors. Only the
 * TypeScript type stops admitting it; nothing was removed from the payload
 * itself, so Android is unaffected. `AuthorRef`/`SeriesSequence` (below,
 * unchanged) remain the correct types for contexts that *do* carry a real id
 * — `FilterData.authors`, the top-level `Author`/`Series` listings.
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

/** A genuinely-identified author reference — a real, matchable author id.
 * NOT the type of `Book.authors`; see this file's header and `AuthorBadge`. */
export interface AuthorRef {
  id: string;
  name: string;
}

/** A genuinely-identified series reference — a real, matchable series id.
 * NOT the type of `Book.series`; see this file's header and `SeriesBadge`. */
export interface SeriesSequence {
  id: string;
  name: string;
  /** e.g. "3" or "3.5"; `null` when the item isn't numbered within the series. */
  sequence: string | null;
}

/** A book's own author badge — display only. See this file's header for why
 * this carries no `id`: `Book.authors` is never a safe source of author
 * identity, on a minified item or an expanded one. */
export interface AuthorBadge {
  name: string;
}

/** A book's own series badge — display only, same reasoning as `AuthorBadge`. */
export interface SeriesBadge {
  name: string;
  /** e.g. "3" or "3.5"; `null` when the item isn't numbered within the series,
   * or when this badge is a minified-item fallback (which never carries one). */
  sequence: string | null;
}

export interface Book {
  kind: 'book';
  title: string;
  subtitle: string | null;
  authors: AuthorBadge[];
  narrator: string | null;
  series: SeriesBadge[];
  genres: string[];
  publishedYear: string | null;
  description: string | null;
  isbn: string | null;
  /** Amazon's catalogue identifier — what Audnexus/AudiMeta key their metadata lookups
   * on. Present on the same `metadata` object as `isbn`; Audiobookshelf's minified
   * summary strips *structured* fields (`authors[]`/`series[]`), not scalar ones, so
   * this is expected on minified items too, same as `isbn` already is. */
  asin: string | null;
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
  /** The RSS `<guid>` for this specific episode — what PodcastIndex keys episode
   * lookups on, alongside the podcast's own `feedUrl`. Distinct from
   * `PodcastFeedEpisode.enclosure`/no `guid` at all in that pre-import shape's older
   * sibling; this one is a library episode's own real identifier. */
  guid: string | null;
}

export interface Podcast {
  kind: 'podcast';
  title: string;
  author: string | null;
  description: string | null;
  genres: string[];
  numEpisodes: number;
  episodes: PodcastEpisode[] | undefined;
  /** The RSS feed URL — what PodcastIndex keys podcast (not episode) lookups on.
   * Already parsed for the pre-subscribe preview shapes (`PodcastDirectoryResult`,
   * `PodcastFeedPreview`) but dropped for a library item's own `Podcast` until 15a-0. */
  feedUrl: string | null;
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
