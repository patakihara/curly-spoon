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

/**
 * A book's own author badge — display only, no `id`.
 *
 * This mirrors `@auralis/abs-client`'s `Book.authors: AuthorBadge[]` (see that
 * package's `domain.ts` header) rather than that package's own `AuthorRef`
 * (which *does* carry a real id, for contexts like `FilterData.authors`). The
 * distinction is load-bearing: a minified Audiobookshelf item's per-book
 * author entry has always been a single fabricated fallback — historically
 * with an `id` equal to the display name — and comparing that fake id against
 * a real author id (a route param) is exactly the bug that shipped twice
 * (`findAuthorBooks`, `SeriesPage`'s old `seriesId` lookup; see
 * `docs/HANDOVER.md`). Naming this `AuthorRef` and giving it an `id` would
 * silently re-open the same trap in this file alone, independent of whatever
 * `packages/abs-client` does — this is a hand-maintained mirror of the BFF's
 * JSON contract, not an import of that package's types. There is nothing to
 * migrate: nothing in this codebase reads `.id` off a book's own `authors[]`
 * today (confirmed via `apps/web/src/regressionGuards.test.ts`'s tripwire).
 */
export interface AuthorBadge {
  name: string;
}

/**
 * A book's real author reference — for `ItemPage.tsx`'s book detail screen only
 * (`docs/design/screens/BOOK_DETAIL.md` §4, §5's "Author tap"). Unlike `AuthorBadge`
 * above, `GET /items/:id?expanded=true` genuinely carries a real, matchable author
 * id: it receives Audiobookshelf's *structured* `metadata.authors[]`, never the
 * minified-item `authorName` fallback that fabricates an id equal to the display
 * name (the trap `AuthorBadge`'s own comment documents). `normalizeMedia` passes
 * `metadata.authors[].id` through verbatim when the array is present.
 *
 * Deliberately **not** folded into `MediaSummary`/`AuthorBadge` — every other
 * consumer of a book's `authors[]` reads shelf/list data, where the id is fake.
 * Widening the shared type to admit `id` would silently re-open the trap that
 * shipped twice (`findAuthorBooks`, the old `SeriesPage`). This type exists only
 * to let the one screen that legitimately has a real id use it — see
 * `ItemDetailResponse` below, returned only by `ApiClient.getItemDetail`.
 */
export interface ItemDetailAuthorRef {
  id: string;
  name: string;
}

/**
 * `GET /items/:id?expanded=true&include=progress`'s response, widened only in
 * the one field this screen needs widened. Same wire JSON as `{ item: LibraryItem }`
 * (`ApiClient.getItem`) — this is not a different endpoint or a different fetch,
 * just a different, screen-scoped *view* of the same response, so `ItemPage.tsx`
 * can read the real author id `LibraryItem`'s `MediaSummary.authors: AuthorBadge[]`
 * deliberately hides. `ApiClient.getItemDetail`/`useItemDetailQuery` are the only
 * things that should return or consume this type; every other item-detail consumer
 * (`PodcastDetailPage.tsx`) keeps using `getItem`/`useItemQuery`/`LibraryItem`.
 */
export interface ItemDetailResponse {
  item: LibraryItem & {
    media: Omit<MediaSummary, 'authors'> & { authors?: ItemDetailAuthorRef[] };
  };
}

/** Chapter markers, in seconds from the start of the whole book/episode. */
export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

/**
 * One audio file within a multi-file book — or, since Phase 9's web wave, one track of a
 * Jellyfin album/playlist loaded as a queue (see `features/music/musicQueue.ts`). `startOffset` is where
 * this track begins within the *whole* loaded item's timeline (seconds), so a global
 * `currentTime` can be mapped onto (track, offset-within-track) without the player needing
 * to know how many files a book was split into, or how many tracks an album has — the same
 * mechanism that lets a multi-file audiobook play through file boundaries is what lets an
 * album queue play through track boundaries.
 */
export interface AudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string | null;
  /**
   * An opaque per-source token, meaningful only to whichever `PlaybackSource.resolveTrackUrl`
   * loaded this track (`features/player/playbackSource.ts`) — not a literal URL. Audiobookshelf
   * embeds a `fileId` in a full upstream-relative path, e.g. `/api/items/:itemId/file/:fileId`
   * (`fileIdFromContentUrl` extracts the last segment); Jellyfin has no equivalent path shape,
   * so `jellyfinSource` puts the track's own Jellyfin item id here directly.
   */
  contentUrl: string | null;
  mimeType: string | null;
  /**
   * This track's own artist — populated only for a Jellyfin music queue
   * (`features/music/musicQueue.ts`'s `materialize`, from `QueueTrack.artist`); left
   * `undefined` for an Audiobookshelf book/podcast `AudioTrack`, which has no per-track artist
   * concept at all. Distinct from the *queue*-level artist (an album's or playlist's own name)
   * that `playerUi.ts`'s `playerDisplayMeta` falls back to when a track carries none of its
   * own — see that function's doc comment for the fallback rule this feeds.
   */
  artist?: string | null;
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
  /**
   * `'track'` has no upstream counterpart — Jellyfin has no "library item" concept
   * matching Audiobookshelf's, so `playerStore.currentItem` for a loaded Jellyfin queue
   * is synthesized client-side by `features/music/musicQueueController.ts`, not fetched from the BFF.
   * It never reaches the `'book'`/`'podcast'` routing checks in `LibraryPage.tsx` /
   * `PodcastDetailPage.tsx` / `routeTree.ts` (all plain `===` comparisons, no exhaustive
   * switch) — those only ever see real Audiobookshelf items.
   */
  kind: 'book' | 'podcast' | 'track';
  title: string;
  subtitle?: string | null;
  authors?: AuthorBadge[];
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
  /**
   * Wave 15d-1-books-W: whether this is a real Audiobookshelf item ("owned") or an Open
   * Library-derived placeholder the user does not have ("external") —
   * `GET /libraries/:id/recommended`'s wave 15e-books contract (`docs/HANDOVER.md`), the
   * book equivalent of `JellyfinAlbum.availability` above. Optional for the identical reason:
   * every other endpoint returning a `LibraryItem` (library browse, shelves, search, item
   * detail) never sets it, so the field is simply absent rather than `'owned'` everywhere.
   * Today only `RecommendedShelf.items` ever carries `'external'`. Read this field directly;
   * never infer availability by parsing the `external:<provider>:<id>` id prefix.
   */
  availability?: 'owned' | 'external';
}

export interface Shelf {
  id: string;
  label: string;
  type: string;
  items: LibraryItem[];
}

/** `GET /libraries/:id/recommended`'s shelf shape (docs/ROADMAP.md §13) — a `Shelf`
 * plus the `reason` string the server always attaches ("Because you finished …").
 * `shelfToCarousel` accepts a plain `Shelf`, so this widens rather than replaces it;
 * the reason is carried separately through `forYouFeed.ts` rather than folded into
 * `Shelf` itself, since ordinary Audiobookshelf shelves have no reason to show. */
export interface RecommendedShelf extends Shelf {
  reason: string;
}

/** `GET /music/recommended`'s shelf shape (docs/ROADMAP.md §13, wave 13f-1) — the music
 * equivalent of `RecommendedShelf`, but its `items` are Jellyfin albums, not Audiobookshelf
 * `LibraryItem`s, so it can't just extend `Shelf` (whose `items: LibraryItem[]` wouldn't
 * fit). Kept as its own type rather than a generic `Shelf<T>` for the same reason the rest
 * of this file avoids that: every other shelf-shaped response here is concrete too. */
export interface MusicRecommendedShelf {
  id: string;
  label: string;
  type: string;
  reason: string;
  items: JellyfinAlbum[];
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

/** `GET /authors/:id` — an author's own page: their name plus every book of
 * theirs already scoped server-side by Audiobookshelf (`AbsClient.getAuthor`'s
 * own doc comment has the source trace). `AuthorPage.tsx` renders this
 * directly; there's no client-side author matching involved. */
export interface AuthorBooks {
  id: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  books: LibraryItem[];
}

/** Narrowed to what the Search view actually renders — the BFF's full series/author
 * shape (`packages/abs-client`'s `Series`/`Author`) carries description, cover image
 * and book-membership fields this client has no page to send either result to yet
 * (docs/ROADMAP.md §12b: neither has a detail route in this app). */
export interface SearchSeriesResult {
  id: string;
  name: string;
}

export interface SearchAuthorResult {
  id: string;
  name: string;
}

export interface SearchResults {
  books: LibraryItem[];
  podcasts: LibraryItem[];
  series: SearchSeriesResult[];
  authors: SearchAuthorResult[];
}

// ---------------------------------------------------------------------
// Book requests (Phase 6)
// ---------------------------------------------------------------------

/**
 * `completed`, `importRequested` and `rejected` are terminal — nothing moves a request
 * out of them again. `failed` is *not* terminal: a `retry` action can revive it, but
 * nothing progresses it on its own, which matters for `features/requests/polling.ts`'s
 * decision about when to keep polling `GET /requests`.
 *
 * `importRequested` is a second, honest terminal state out of `importing` — a music
 * request's own, not a book one (see `apps/server/src/requests/requestStatus.ts`'s
 * header comment, the authority for this whole union). A music request lands here once
 * Auralis has asked Jellyfin to rescan its library, which is fire-and-forget: there is no
 * API to confirm the rescan actually found the file. Calling that `completed` would claim
 * a confirmation this codebase does not have.
 */
export type RequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'searching'
  | 'downloading'
  | 'importing'
  | 'completed'
  | 'importRequested'
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

// -----------------------------------------------------------------------------
// Music requests (Phase 9) — mirrors apps/server/src/requests/types.ts's
// `MusicCandidate` and apps/server/src/db/requestsRepo.ts's `MediaRequest` (music rows)
// field-for-field, the same way `Release`/`BookRequest` above mirror the book pipeline's
// server-side shapes.
// -----------------------------------------------------------------------------

/**
 * One file a music provider found, available to enqueue. Deliberately **not** `Release` —
 * see `apps/server/src/requests/types.ts`'s doc comment on the server-side type this
 * mirrors: a Soulseek search result is one file held by one specific peer online *right
 * now*, with no seeders/leechers/magnet/download-url concept, not a stable catalogue entry.
 */
export interface MusicCandidate {
  /** Unique within one search response only — not a stable id across separate searches. */
  guid: string;
  providerId: string;
  /** The peer offering the file, for display — analogous to `Release.sourceName`. */
  sourceName: string;
  title: string;
  artist: string | null;
  album: string | null;
  sizeBytes: number | null;
  bitrateKbps: number | null;
  format: string | null;
}

/**
 * `GET /music-requests/search`'s shape — same partial-results-plus-errors coupling as
 * `RequestSearchResult`, for the same reason (see `AskForBookPanel`'s doc comment): a
 * broken provider must never look identical to "nothing matched".
 */
export interface MusicSearchResult {
  candidates: MusicCandidate[];
  errors: Array<{ providerId: string; kind: string; message: string }>;
}

/**
 * A music request row. Not `BookRequest` with a renamed field: the server's own
 * `MediaRequest` unifies book and music rows behind one `release: Release | null` /
 * `candidate: MusicCandidate | null` pair, but book and music each only ever populate one
 * side, so a client-facing type per media kind (no `release` field a music row can never
 * use, no `candidate` field a book row can never use) is the honest mirror of that, the same
 * way `BookRequest` already omits `candidate`.
 */
export interface MusicRequest {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  status: RequestStatus;
  /** Why it failed, when it failed. Null otherwise. */
  statusDetail: string | null;
  /** The candidate chosen at creation time — always present for a row created through
   * `createMusicRequestBodySchema` (candidate is required there, unlike a book request's
   * optional `release`), but still nullable to match the server's own `MediaRequest.candidate`
   * typing for a hand-edited or pre-migration row. */
  candidate: MusicCandidate | null;
  indexerId: string | null;
  clientId: string | null;
  downloadHandle: string | null;
  /** 0..1. Frozen at whatever `grab()` last wrote — nothing updates it past that point, since
   * the music pipeline has no download-progress poller. See `musicRequestPolling.ts`'s doc
   * comment before wiring a progress bar to this. */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

export type ProviderKind = 'indexer' | 'download' | 'music';

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
  /** `apps/server/src/db/appSettingsRepo.ts`'s `getMusicSavePath` returns `null` for an
   * unset path (its own doc comment: "so it drops straight into `AddDownloadOptions.savePath`"),
   * and `GET /settings/requests` returns that `null` straight through — unlike
   * `bookSavePath` above, which this type declares as non-nullable despite the server
   * being able to send `null` for it too. Typed accurately here rather than repeating that
   * mismatch: `MusicRequestSettingsSection.tsx` is new code with no reason to inherit it. */
  musicSavePath: string | null;
  musicCategory: string | null;
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
  /** Always a definite boolean — see `@auralis/jellyfin-client`'s `Artist.favorite` doc
   * comment for why the BFF never forwards an "unknown" third state. */
  favorite: boolean;
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
  favorite: boolean;
  /**
   * Wave 15d-1-W: whether this is a real Jellyfin album ("owned") or a ListenBrainz-derived
   * placeholder the user does not have ("external") — `GET /music/recommended`'s wave 15d-1-S
   * contract (`docs/HANDOVER.md`). Optional because every other endpoint returning a
   * `JellyfinAlbum` (search, artist/album browsing, favourites) never sets it — those albums
   * are always real, so the field is simply absent rather than `'owned'` on every one of them.
   * Today only `MusicRecommendedShelf.items` ever carries `'external'`. Read this field
   * directly; never infer availability by parsing the `external:<provider>:<id>` id prefix —
   * that implicit coupling is exactly what the server wave stopped clients from having to do.
   */
  availability?: 'owned' | 'external';
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
  favorite: boolean;
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

/** `POST`/`DELETE /jellyfin/items/:itemId/favorite`'s success body — the favourite state
 * Jellyfin actually recorded, not just an echo of the request's own intent. See
 * `@auralis/jellyfin-client`'s `markFavorite`/`unmarkFavorite` doc comments for why. */
export interface JellyfinFavoriteResponse {
  favorite: boolean;
}

// ---------------------------------------------------------------------
// Jellyfin playlists (Phase 9 web wave — playlists)
// ---------------------------------------------------------------------

/** Mirrors `@auralis/jellyfin-client`'s `Playlist` field-for-field. */
export interface JellyfinPlaylist {
  id: string;
  name: string;
  imageTag: string | null;
  trackCount: number | null;
}

/**
 * One row of `GET /jellyfin/playlists/:playlistId/items`, in playlist order — mirrors
 * `@auralis/jellyfin-client`'s `PlaylistItem`. `playlistItemId` identifies *this
 * occurrence* of `track` within the playlist, distinct from `track.id`: the same track can
 * appear twice, each with its own `playlistItemId`, and removal must use this value — see
 * `ApiClient.removeFromJellyfinPlaylist`'s doc comment.
 */
export interface JellyfinPlaylistItem {
  playlistItemId: string;
  track: JellyfinTrack;
}

/** `POST /jellyfin/playlists`'s success body. */
export interface JellyfinCreatePlaylistResult {
  id: string;
}

// ---------------------------------------------------------------------
// Jellyfin lyrics (Phase 9 web wave — synced lyrics view)
// ---------------------------------------------------------------------

/** Mirrors `@auralis/jellyfin-client`'s `LyricLine` field-for-field — the BFF's own
 * domain type, not Jellyfin's raw `LyricLine`. `startSeconds` is `null` for an unsynced
 * line — see `JellyfinLyrics.synced`'s doc comment for how a caller should read that. */
export interface JellyfinLyricLine {
  text: string;
  startSeconds: number | null;
}

/** Mirrors `@auralis/jellyfin-client`'s `Lyrics`. `synced: false` means every line
 * should render as plain, unhighlighted text — never treat a missing timestamp as
 * "starts at 0"; see that package's `normalize.ts`'s `normalizeLyrics` for why `synced`
 * isn't read off Jellyfin's own (never-populated, on this endpoint) `IsSynced` field. */
export interface JellyfinLyrics {
  lines: JellyfinLyricLine[];
  synced: boolean;
}

/** `GET /jellyfin/tracks/:itemId/lyrics`'s success body. `lyrics: null` means Jellyfin
 * has nothing for this track — a normal, common outcome, not an error; the route always
 * 200s for it (see `routes/jellyfin.ts`'s own doc comment on that route). */
export interface JellyfinLyricsResponse {
  lyrics: JellyfinLyrics | null;
}
