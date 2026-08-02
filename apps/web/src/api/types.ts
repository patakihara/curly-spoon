/**
 * The BFF's response shapes, as seen from the web app.
 *
 * These are a deliberate, independent restatement of the shapes
 * `apps/server/src/routes/**` sends — not an import of `@auralis/abs-client`'s
 * domain types. `apps/web` does not depend on that package (it talks to the BFF's
 * own JSON contract, not Audiobookshelf's), and pulling in a package only for
 * types would blur that boundary. Keep this file in sync with the route handlers
 * by hand; a mismatch here surfaces as a type error at the call site, not a typed
 * runtime error, which is the one deliberate exception to this codebase's
 * "parse at every upstream boundary" rule — see the Phase 4 report for why.
 */

export interface SetupState {
  configured: boolean;
  baseUrl: string | null;
}

export interface SetupResult extends SetupState {
  serverVersion?: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  permissions?: Record<string, boolean>;
  mediaProgress?: MediaProgress[];
  bookmarks?: unknown[];
}

export interface LoginResponse {
  user: { id: string; username: string };
}

export interface Library {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  icon: string | null;
}

export interface AuthorRef {
  id: string;
  name: string;
}

/** Chapter markers, in seconds from the start of the whole book/episode. */
export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

/**
 * One audio file within a multi-file book. `startOffset` is where this track begins
 * within the *whole* item's timeline (seconds), so a global `currentTime` can be
 * mapped onto (track, offset-within-track) without the player needing to know how
 * many files a book was split into.
 */
export interface AudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string | null;
  /** Upstream-relative path, e.g. `/api/items/:itemId/file/:fileId` — the last
   *  segment is the `fileId` `api.audioTrackUrl` needs. */
  contentUrl: string | null;
  mimeType: string | null;
}

export interface MediaSummary {
  kind: 'book' | 'podcast';
  title: string;
  subtitle?: string | null;
  authors?: AuthorRef[];
  author?: string | null;
  narrator?: string | null;
  description?: string | null;
  duration?: number;
  /** Only present on an *expanded* fetch (`?expanded=1`) — absent, not `[]`, otherwise. */
  tracks?: AudioTrack[];
  chapters?: Chapter[];
}

/**
 * What `POST /items/:id/play` hands back. Unlike `MediaSummary.tracks`/`chapters`
 * (only present when the item was fetched expanded), a session's `audioTracks` and
 * `chapters` are always populated — the BFF's `playItem` always returns the full
 * shape, per `packages/abs-client`'s `normalizePlaybackSession`. `currentTime` is
 * the resume point the server already knows about.
 */
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

export interface LibraryItem {
  id: string;
  libraryId: string;
  coverPath: string | null;
  media: MediaSummary;
  progress: MediaProgress | null;
}

export interface Shelf {
  id: string;
  label: string;
  type: string;
  items: LibraryItem[];
}

export interface MediaProgress {
  id: string;
  libraryItemId: string;
  episodeId: string | null;
  duration: number;
  currentTime: number;
  progress: number;
  isFinished: boolean;
}

export interface LibraryItemsPage {
  items: LibraryItem[];
  total: number;
  limit: number | null;
  page: number | null;
}

export interface SearchResults {
  books: LibraryItem[];
  podcasts: LibraryItem[];
}
