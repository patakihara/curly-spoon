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

export interface Library {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  icon: string | null;
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
  currentTime: number;
  audioTracks: AudioTrack[];
  chapters: Chapter[];
}

export interface ServerPing {
  reachable: true;
  serverVersion: string | null;
}
