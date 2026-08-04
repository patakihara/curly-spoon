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

/** One of a library's watched folders on disk — `folders[0]` is what a new podcast
 * subscription is created under (see `SubscribePodcastBody`). */
export interface LibraryFolder {
  id: string;
  path: string;
}

export interface Library {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  icon: string | null;
  folders: LibraryFolder[];
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

/**
 * One episode of a subscribed podcast, as returned inside a *library item's* own
 * `media.episodes` (an expanded `GET /items/:id` fetch) — distinct from
 * `PodcastFeedEpisode`, which describes an episode in an as-yet-unsubscribed RSS
 * feed and has no `id` yet. Mirrors `packages/abs-client/src/domain.ts`'s
 * `PodcastEpisode` field-for-field.
 */
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
  /** Podcast only. Same expanded/minified split as `tracks`/`chapters` above. */
  episodes?: PodcastEpisode[];
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

// ---------------------------------------------------------------------
// Book requests (Phase 6)
// ---------------------------------------------------------------------

/**
 * `completed` and `rejected` are terminal — nothing moves a request out of them
 * again. `failed` is *not* terminal: a `retry` action can revive it, but nothing
 * progresses it on its own, which matters for `features/requests/polling.ts`'s
 * decision about when to keep polling `GET /requests`.
 */
export type RequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'searching'
  | 'downloading'
  | 'importing'
  | 'completed'
  | 'failed';

/** One release a search against the configured indexers turned up. */
export interface Release {
  guid: string;
  indexerId: string;
  sourceName: string;
  title: string;
  sizeBytes: number | null;
  seeders: number;
  leechers: number;
  publishedAt: number | null;
  downloadUrl: string | null;
  magnetUri: string | null;
  categories: string[];
  format: string | null;
}

export interface BookRequest {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  status: RequestStatus;
  /** Why it failed, when it failed. Null otherwise — nothing else populates it. */
  statusDetail: string | null;
  release: Release | null;
  indexerId: string | null;
  clientId: string | null;
  downloadHandle: string | null;
  /** 0..1. */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * `GET /requests/search`'s shape deliberately couples partial results with
 * per-indexer failures in one response — see `AskForBookPanel`'s doc comment for
 * why both have to render together rather than one hiding the other.
 */
export interface RequestSearchResult {
  releases: Release[];
  errors: Array<{ indexerId: string; kind: string; message: string }>;
}

export type ProviderKind = 'indexer' | 'download';

export interface ProviderSecretField {
  key: string;
  label: string;
  kind: 'text' | 'password';
}

export interface ProviderEntry {
  id: string;
  displayName: string;
  kind: ProviderKind;
  requiresBaseUrl: boolean;
  requiresSecret: boolean;
  secretFields: ProviderSecretField[];
  summary: string;
  configured: boolean;
  enabled: boolean;
  baseUrl: string | null;
  /** True once a secret is stored — the API never returns the secret itself. */
  hasSecret: boolean;
}

/** Body for `PUT /providers/:id`. `secret` is keyed by `ProviderSecretField.key`. */
export interface ProviderUpdateBody {
  enabled?: boolean;
  baseUrl?: string;
  options?: Record<string, unknown>;
  secret?: Record<string, string>;
}

/**
 * `approvalPolicy` is left as `string` rather than a narrow union: the BFF is the
 * source of truth for what values it accepts, and this app only ever needs to
 * distinguish `'manual'` from everything else (see `RequestsPage`'s approval
 * affordances) rather than exhaustively model every policy.
 */
export interface RequestSettings {
  approvalPolicy: string;
  bookSavePath: string;
  bookCategory: string;
}

// ---------------------------------------------------------------------
// Podcast discovery (Phase 8, wave A backend / wave B web UI)
// ---------------------------------------------------------------------

/** One podcast the iTunes-backed directory search turned up — `GET /podcasts/search`. */
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

/** One `podcast:chapters` chapter, already parsed into seconds by Audiobookshelf. */
export interface PodcastFeedChapter {
  id: number;
  title: string;
  start: number;
  end: number;
}

/**
 * One episode as it appears in an as-yet-unsubscribed RSS feed (`POST /podcasts/feed`) —
 * not yet a library entity, so no `id`. `duration` stays the raw feed string rather than
 * being parsed into seconds, since feeds format it inconsistently (`"3600"` vs `"1:00:00"`);
 * `durationSeconds` is Audiobookshelf's own already-parsed value and safe to use directly.
 */
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

/** Mirrors the BFF's `podcastSubscribeMetadataSchema` field-for-field. */
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

/** Body for `POST /podcasts` — mirrors the BFF's `subscribePodcastBodySchema`. */
export interface SubscribePodcastBody {
  libraryId: string;
  folderId: string;
  folderPath: string;
  rssFeed: string;
  title: string;
  metadata?: PodcastSubscribeMetadata;
  autoDownloadEpisodes?: boolean;
}

// ---------------------------------------------------------------------
// Jellyfin music (Phase 9 wave A — browse/search, no playback yet)
// ---------------------------------------------------------------------

/** `GET /jellyfin/config` — mirrors the shape `POST /jellyfin/login` also returns
 * on success, minus the `user` field a login response adds. */
export interface JellyfinConfig {
  configured: boolean;
  baseUrl: string | null;
  hasCredentials: boolean;
}

/** `POST /jellyfin/login`'s success body. `baseUrl` is required only the first
 * time (before anything is configured) — see `routes/jellyfin.ts`'s doc comment. */
export interface JellyfinLoginBody {
  baseUrl?: string;
  username: string;
  password: string;
}

export interface JellyfinLoginResult extends JellyfinConfig {
  user: { id: string; name: string };
}

/** Mirrors `packages/jellyfin-client/src/domain.ts`'s `Artist` field-for-field —
 * this is the BFF's own domain type, not Jellyfin's raw `BaseItemDto`. */
export interface JellyfinArtist {
  id: string;
  name: string;
  overview: string | null;
  imageTag: string | null;
  albumCount: number | null;
}

export interface JellyfinAlbum {
  id: string;
  name: string;
  sortName: string | null;
  artistId: string | null;
  artistName: string | null;
  productionYear: number | null;
  overview: string | null;
  genres: string[];
  imageTag: string | null;
  trackCount: number | null;
}

export interface JellyfinTrack {
  id: string;
  name: string;
  albumId: string | null;
  albumName: string | null;
  artistNames: string[];
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
  imageTag: string | null;
  genres: string[];
}

/** One page of a Jellyfin browse list. `total` is upstream's real
 * `TotalRecordCount`, never estimated — see `features/music/pagination.ts`. */
export interface JellyfinLibraryPage<T> {
  items: T[];
  total: number;
  startIndex: number;
}

export interface JellyfinSearchResults {
  artists: JellyfinArtist[];
  albums: JellyfinAlbum[];
  tracks: JellyfinTrack[];
}
