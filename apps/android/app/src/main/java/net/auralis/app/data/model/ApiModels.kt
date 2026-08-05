package net.auralis.app.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Single shared JSON instance for the whole data layer. `ignoreUnknownKeys` matters because
 * the BFF's responses (e.g. `AuthUser`) carry fields this wave deliberately does not model
 * (`permissions`, `mediaProgress`) — an upstream addition must never break decoding here.
 */
val auralisJson: Json = Json { ignoreUnknownKeys = true }

/** GET /setup response. */
@Serializable
data class SetupState(
    val configured: Boolean,
    val baseUrl: String? = null,
)

/** POST /setup response. */
@Serializable
data class SetupResult(
    val configured: Boolean,
    val baseUrl: String? = null,
    val serverVersion: String? = null,
)

/** POST /setup request body. */
@Serializable
data class SetupRequestBody(
    val baseUrl: String,
)

/** POST /auth/login request body. */
@Serializable
data class LoginRequestBody(
    val username: String,
    val password: String,
)

/** Minimal `{id, username}` shape shared by anywhere the server sends only that much. */
@Serializable
data class UserRef(
    val id: String,
    val username: String,
)

/** POST /auth/login response — deliberately a smaller shape than `AuthUser`. */
@Serializable
data class LoginResponse(
    val user: UserRef,
)

/** GET /auth/me's `user` shape. `permissions`/`mediaProgress`/extras are ignored for this wave. */
@Serializable
data class AuthUser(
    val id: String,
    val username: String,
)

/** GET /auth/me response envelope. */
@Serializable
data class MeResponse(
    val user: AuthUser,
)

/** POST /auth/logout response. */
@Serializable
data class OkResponse(
    val ok: Boolean,
)

/**
 * One folder attached to a library — Audiobookshelf's own unit for "where on disk new content
 * for this library lands." Needed only to build a podcast subscribe body
 * ([SubscribePodcastBody.folderId]/[SubscribePodcastBody.folderPath] are both required by the
 * upstream schema); nothing else in this app reads it yet. Mirrors
 * `packages/abs-client/src/domain.ts`'s `LibraryFolder`.
 */
@Serializable
data class LibraryFolder(
    val id: String,
    val path: String,
)

/** One entry from GET /libraries. */
@Serializable
data class Library(
    val id: String,
    val name: String,
    val mediaType: String,
    val icon: String? = null,
    /** `[]` when the server predates this field or the library genuinely has none — see
     * [LibraryFolder]'s doc comment for why this app needs it at all. */
    val folders: List<LibraryFolder> = emptyList(),
)

/** GET /libraries response envelope. */
@Serializable
data class LibrariesResponse(
    val libraries: List<Library>,
)

@Serializable
data class AuthorRef(
    val id: String,
    val name: String,
)

/** Only present on an *expanded* item fetch — this wave never requests one, model anyway. */
@Serializable
data class Chapter(
    val id: Int,
    val start: Double,
    val end: Double,
    val title: String,
)

/** Only present on an *expanded* item fetch — this wave never requests one, model anyway. */
@Serializable
data class AudioTrack(
    val index: Int,
    val startOffset: Double,
    val duration: Double,
    val title: String? = null,
    val contentUrl: String? = null,
    val mimeType: String? = null,
)

/** Nested in a Book's `media.series` field — never present on a podcast. Mirrors
 * `packages/abs-client/src/domain.ts`'s `SeriesSequence` (a smaller shape than the
 * top-level `Series` object below, hence the distinct name). */
@Serializable
data class SeriesSequence(
    val id: String,
    val name: String,
    val sequence: String? = null,
)

/** One episode of a podcast item's `media.episodes` — only present on an *expanded* fetch,
 * same split as `MediaSummary.tracks`/`chapters` for a book. Mirrors
 * `packages/abs-client/src/domain.ts`'s `PodcastEpisode` field-for-field. */
@Serializable
data class PodcastEpisode(
    val id: String,
    val index: Int? = null,
    val season: String? = null,
    val episodeNumber: String? = null,
    val title: String,
    val subtitle: String? = null,
    val description: String? = null,
    val publishedAt: Long? = null,
    val duration: Double,
    val audioTrack: AudioTrack? = null,
)

@Serializable
data class MediaSummary(
    val kind: String,
    val title: String,
    val subtitle: String? = null,
    val authors: List<AuthorRef>? = null,
    val author: String? = null,
    val narrator: String? = null,
    val description: String? = null,
    val duration: Double? = null,
    val tracks: List<AudioTrack>? = null,
    val chapters: List<Chapter>? = null,
    val series: List<SeriesSequence>? = null,
    /** Podcast only; absent on a book. Verified against `normalizeMedia` in
     * `packages/abs-client/src/normalize.ts` — it always fills this with
     * `numEpisodes ?? episodes?.length ?? 0`, so it is genuinely present regardless of
     * expanded/minified, unlike `episodes` below. Nullable anyway, per house style: decoding
     * degrades rather than throws if a future server response ever omits it. */
    val numEpisodes: Int? = null,
    /** Podcast only, and only on an *expanded* fetch — same minified/expanded split as
     * `tracks`/`chapters` above. `null` means "not fetched", not "no episodes". */
    val episodes: List<PodcastEpisode>? = null,
)

/** A series and the books in it. Mirrors `packages/abs-client/src/domain.ts`'s `Series`. */
@Serializable
data class Series(
    val id: String,
    val name: String,
    val description: String? = null,
    val books: List<LibraryItem> = emptyList(),
)

/** One author entry from GET /libraries/{id}/search. */
@Serializable
data class Author(
    val id: String,
    val name: String,
    val description: String? = null,
    val imagePath: String? = null,
    val numBooks: Int = 0,
)

/** GET /libraries/{id}/items response — unwrapped, the object itself. */
@Serializable
data class LibraryItemsPage(
    val items: List<LibraryItem>,
    val total: Int,
    val limit: Int? = null,
    val page: Int? = null,
)

/** GET /libraries/{id}/series response — unwrapped, the object itself. */
@Serializable
data class SeriesPage(
    val series: List<Series>,
    val total: Int,
)

/** GET /libraries/{id}/search response — unwrapped, the object itself. */
@Serializable
data class SearchResults(
    val books: List<LibraryItem> = emptyList(),
    val podcasts: List<LibraryItem> = emptyList(),
    val series: List<Series> = emptyList(),
    val authors: List<Author> = emptyList(),
)

/** GET /items/{id} response envelope. */
@Serializable
data class LibraryItemResponse(
    val item: LibraryItem,
)

@Serializable
data class MediaProgress(
    val id: String,
    val libraryItemId: String,
    val episodeId: String? = null,
    val duration: Double,
    val currentTime: Double,
    val progress: Double,
    val isFinished: Boolean,
)

@Serializable
data class LibraryItem(
    val id: String,
    val libraryId: String,
    val coverPath: String? = null,
    val media: MediaSummary,
    val progress: MediaProgress? = null,
)

@Serializable
data class Shelf(
    val id: String,
    val label: String,
    val type: String,
    val items: List<LibraryItem>,
)

/** GET /libraries/{id}/home response envelope. */
@Serializable
data class HomeResponse(
    val shelves: List<Shelf>,
)

/** The nested `session` object returned by POST /items/{id}/play and read by the player. */
@Serializable
data class PlaybackSession(
    val id: String,
    val libraryItemId: String,
    val episodeId: String? = null,
    val mediaType: String,
    val displayTitle: String,
    val duration: Double,
    val currentTime: Double,
    val audioTracks: List<AudioTrack>,
    val chapters: List<Chapter>,
)

/** POST /items/{id}/play response envelope. */
@Serializable
data class PlayResponse(
    val session: PlaybackSession,
)

/** POST /sessions/{id}/sync request body. */
@Serializable
data class SyncSessionBody(
    val currentTime: Double,
    val timeListened: Double,
    val duration: Double,
)

/** Shape every non-2xx BFF response uses. See apps/server/src/httpErrors.ts. */
@Serializable
data class ApiErrorDetail(
    val code: String,
    val message: String,
)

@Serializable
data class ApiErrorBody(
    val error: ApiErrorDetail,
)

/**
 * One release a search against the configured indexers turned up. Mirrors
 * `apps/server/src/routes/schemas.ts`'s `releaseSchema` and `apps/web/src/api/types.ts`'s
 * `Release` field-for-field. `sizeBytes`/`publishedAt` are `Long`, not `Double` like this
 * file's playback-position fields — they are byte counts and epoch-millisecond timestamps,
 * which can exceed `Int` range but have no fractional meaning.
 */
@Serializable
data class Release(
    val guid: String,
    val indexerId: String,
    val sourceName: String,
    val title: String,
    val sizeBytes: Long? = null,
    val seeders: Int,
    val leechers: Int,
    val publishedAt: Long? = null,
    val downloadUrl: String? = null,
    val magnetUri: String? = null,
    val categories: List<String>,
    val format: String? = null,
)

/** One indexer's failure to answer a search — surfaced alongside partial `Release` results. */
@Serializable
data class SearchError(
    val indexerId: String,
    val kind: String,
    val message: String,
)

/** GET /requests/search response envelope. */
@Serializable
data class RequestSearchResult(
    val releases: List<Release>,
    val errors: List<SearchError>,
)

/**
 * A book request and its pipeline state. Mirrors `apps/web/src/api/types.ts`'s `BookRequest`.
 * `status` is left as a plain `String` rather than a Kotlin enum so an upstream addition to
 * the server's `RequestStatus` union decodes rather than throwing.
 */
@Serializable
data class BookRequest(
    val id: String,
    val userId: String,
    val title: String,
    val author: String? = null,
    val status: String,
    val statusDetail: String? = null,
    val release: Release? = null,
    val indexerId: String? = null,
    val clientId: String? = null,
    val downloadHandle: String? = null,
    val progress: Double,
    val createdAt: Long,
    val updatedAt: Long,
)

/** POST /requests request body. */
@Serializable
data class CreateRequestBody(
    val title: String,
    val author: String? = null,
    val release: Release? = null,
)

/** GET /requests response envelope. */
@Serializable
data class RequestsResponse(
    val requests: List<BookRequest>,
)

/** Envelope shared by every `{request}`-returning book-request endpoint. */
@Serializable
data class RequestResponse(
    val request: BookRequest,
)

// -----------------------------------------------------------------------------
// Podcast discovery (routes/podcasts.ts) — search, feed preview, subscribe
// -----------------------------------------------------------------------------

/**
 * One result from GET /podcasts/search, the iTunes-backed podcast directory. Not a
 * library entity — `itunesId`/`itunesArtistId` are iTunes's own numeric ids, kept as
 * `Long` (not `Int`) for the same reason `Release.sizeBytes`/`publishedAt` are: an
 * upstream id has no guaranteed upper bound this codebase controls.
 */
@Serializable
data class PodcastDirectoryResult(
    val itunesId: Long,
    val itunesArtistId: Long? = null,
    val title: String,
    val artistName: String? = null,
    val description: String? = null,
    val descriptionPlain: String? = null,
    val releaseDate: String? = null,
    val genres: List<String> = emptyList(),
    val cover: String? = null,
    val trackCount: Int,
    val feedUrl: String? = null,
    val pageUrl: String? = null,
    val explicit: Boolean,
)

/** GET /podcasts/search response envelope. */
@Serializable
data class PodcastSearchResponse(
    val results: List<PodcastDirectoryResult>,
)

/** One `podcast:chapters` chapter, already parsed into seconds by Audiobookshelf before a
 * feed-preview response reaches the BFF. Nested in [PodcastFeedEpisode.chapters]. */
@Serializable
data class PodcastFeedChapter(
    val id: Int,
    val title: String,
    val start: Double,
    val end: Double,
)

/** The raw audio-file reference for one [PodcastFeedEpisode], straight from its RSS `<enclosure>`. */
@Serializable
data class PodcastFeedEnclosure(
    val url: String,
    val type: String? = null,
    val length: String? = null,
)

/**
 * One episode as it appears in an as-yet-unsubscribed RSS feed (POST /podcasts/feed) — not
 * yet a library entity, so no `id`. `duration` stays the raw feed string (feeds format it
 * inconsistently, e.g. `"3600"` vs `"1:00:00"`) while `durationSeconds` is Audiobookshelf's
 * own already-parsed value — see `packages/abs-client/src/domain.ts`'s `PodcastFeedEpisode`
 * doc comment for the full reasoning.
 */
@Serializable
data class PodcastFeedEpisode(
    val title: String,
    val subtitle: String? = null,
    val description: String? = null,
    val pubDate: String? = null,
    val publishedAt: Long? = null,
    val episodeType: String? = null,
    val season: String? = null,
    val episodeNumber: String? = null,
    val author: String? = null,
    val duration: String? = null,
    val durationSeconds: Double? = null,
    val explicit: Boolean,
    val enclosure: PodcastFeedEnclosure? = null,
    val guid: String? = null,
    val chaptersUrl: String? = null,
    val chapters: List<PodcastFeedChapter> = emptyList(),
)

/** A previewed RSS feed, before subscribing — the `preview` object POST /podcasts/feed returns. */
@Serializable
data class PodcastFeedPreview(
    val title: String? = null,
    val author: String? = null,
    val description: String? = null,
    val descriptionPlain: String? = null,
    val feedUrl: String? = null,
    val image: String? = null,
    val categories: List<String> = emptyList(),
    val language: String? = null,
    val explicit: Boolean,
    val numEpisodes: Int,
    val episodes: List<PodcastFeedEpisode> = emptyList(),
    val pubDate: String? = null,
    val link: String? = null,
)

/** POST /podcasts/feed response envelope. */
@Serializable
data class PodcastFeedPreviewResponse(
    val preview: PodcastFeedPreview,
)

/** POST /podcasts/feed request body. */
@Serializable
data class PreviewPodcastFeedBody(
    val rssFeed: String,
)

/** Mirrors the BFF's `podcastSubscribeMetadataSchema` (routes/schemas.ts) field-for-field —
 * everything a directory search result or a feed preview can seed onto a new subscription. */
@Serializable
data class PodcastSubscribeMetadata(
    val author: String? = null,
    val description: String? = null,
    val releaseDate: String? = null,
    val imageUrl: String? = null,
    val genres: List<String>? = null,
    val language: String? = null,
    val explicit: Boolean? = null,
    val itunesPageUrl: String? = null,
    val itunesId: Long? = null,
)

/** POST /podcasts request body. Mirrors `subscribePodcastBodySchema` (routes/schemas.ts). */
@Serializable
data class SubscribePodcastBody(
    val libraryId: String,
    val folderId: String,
    val folderPath: String,
    val rssFeed: String,
    val title: String,
    val metadata: PodcastSubscribeMetadata? = null,
    val autoDownloadEpisodes: Boolean? = null,
)

/** POST /podcasts response envelope — the newly created library item. */
@Serializable
data class SubscribePodcastResponse(
    val item: LibraryItem,
)

/**
 * GET /me/progress response envelope — every [MediaProgress] record for the signed-in user,
 * book and podcast-episode alike (a book's record has `episodeId == null`). Audiobookshelf
 * never populates item-level progress on a podcast container, since it tracks progress per
 * `(item, episode)` pair instead — see `apps/server/src/routes/progress.ts` and
 * `apps/web/src/features/podcasts/episodeProgress.ts` for the same reasoning on the web side.
 */
@Serializable
data class MyProgressResponse(
    val progress: List<MediaProgress>,
)

// -----------------------------------------------------------------------------
// Jellyfin music (routes/jellyfin.ts) — Android data layer, phase 9. No UI wave yet;
// see net.auralis.app.features.music.MusicRepository for the layer that consumes these.
// Field names are read directly off apps/server/src/routes/jellyfin.ts and
// packages/jellyfin-client/src/domain.ts (the plain object that route's handlers
// `reply.send()` without any further wrapping), not inferred from apps/web.
// -----------------------------------------------------------------------------

/** GET /jellyfin/config response. */
@Serializable
data class JellyfinConfig(
    val configured: Boolean,
    val baseUrl: String? = null,
    val hasCredentials: Boolean = false,
)

/** POST /jellyfin/login request body. `baseUrl` is optional — omitted, the BFF reuses the
 * `jellyfin` settings row from an earlier login (see routes/jellyfin.ts); sent, it configures
 * (or reconfigures) the shared server address as a side effect of this same call. */
@Serializable
data class JellyfinLoginRequestBody(
    val baseUrl: String? = null,
    val username: String,
    val password: String,
)

/** The `user` object POST /jellyfin/login echoes back — id/name only, deliberately never the
 * access token (see that route's own doc comment). */
@Serializable
data class JellyfinUserRef(
    val id: String,
    val name: String,
)

/** POST /jellyfin/login response. */
@Serializable
data class JellyfinLoginResponse(
    val configured: Boolean,
    val baseUrl: String? = null,
    val user: JellyfinUserRef,
)

/** One entry from GET /jellyfin/artists. Mirrors `@auralis/jellyfin-client`'s `Artist`
 * (packages/jellyfin-client/src/domain.ts) field-for-field. `favorite` defaults `false` for
 * decoding purposes only — the upstream domain type guarantees it is always a definite
 * boolean, never absent (see that interface's own doc comment), so this default exists solely
 * to keep every fixture written before favourites existed (none of which include the field)
 * decoding successfully rather than throwing; it is not evidence the field is genuinely
 * optional on the wire, and should not be "tightened" to a required field later without
 * checking every existing fixture first. */
@Serializable
data class JellyfinArtist(
    val id: String,
    val name: String,
    val overview: String? = null,
    val imageTag: String? = null,
    val albumCount: Int? = null,
    val favorite: Boolean = false,
)

/** One entry from GET /jellyfin/albums. Mirrors `@auralis/jellyfin-client`'s `Album`. See
 * [JellyfinArtist.favorite]'s doc comment for why this defaults `false` rather than being
 * required. */
@Serializable
data class JellyfinAlbum(
    val id: String,
    val name: String,
    val sortName: String? = null,
    val artistId: String? = null,
    val artistName: String? = null,
    val productionYear: Int? = null,
    val overview: String? = null,
    val genres: List<String> = emptyList(),
    val imageTag: String? = null,
    val trackCount: Int? = null,
    val favorite: Boolean = false,
)

/** One entry from GET /jellyfin/tracks. Mirrors `@auralis/jellyfin-client`'s `Track`.
 * `durationSeconds` is a `Double` (not `Int`) because the upstream client derives it by
 * dividing .NET ticks by a constant (`normalize.ts`'s `TICKS_PER_SECOND`), not a whole number.
 * See [JellyfinArtist.favorite]'s doc comment for why `favorite` defaults `false`. */
@Serializable
data class JellyfinTrack(
    val id: String,
    val name: String,
    val albumId: String? = null,
    val albumName: String? = null,
    val artistNames: List<String> = emptyList(),
    val trackNumber: Int? = null,
    val discNumber: Int? = null,
    val durationSeconds: Double? = null,
    val imageTag: String? = null,
    val genres: List<String> = emptyList(),
    val favorite: Boolean = false,
)

/** GET /jellyfin/artists response — unwrapped, the object itself. Mirrors
 * `@auralis/jellyfin-client`'s `LibraryPage<Artist>`; `total` is the upstream's
 * `TotalRecordCount`, independent of how many items this page actually carries — the field a
 * pager needs, not a count of [items]. */
@Serializable
data class JellyfinArtistsPage(
    val items: List<JellyfinArtist>,
    val total: Int,
    val startIndex: Int,
)

/** GET /jellyfin/albums response — unwrapped, the object itself. See [JellyfinArtistsPage]'s
 * doc comment for what [total] means. */
@Serializable
data class JellyfinAlbumsPage(
    val items: List<JellyfinAlbum>,
    val total: Int,
    val startIndex: Int,
)

/** GET /jellyfin/tracks response — unwrapped, the object itself. See [JellyfinArtistsPage]'s
 * doc comment for what [total] means. */
@Serializable
data class JellyfinTracksPage(
    val items: List<JellyfinTrack>,
    val total: Int,
    val startIndex: Int,
)

/** GET /jellyfin/search response — unwrapped, the object itself. Mirrors
 * `@auralis/jellyfin-client`'s `SearchResults`: one `/Items` query fanned out into three
 * buckets server-side, not three separate requests. */
@Serializable
data class JellyfinSearchResults(
    val artists: List<JellyfinArtist> = emptyList(),
    val albums: List<JellyfinAlbum> = emptyList(),
    val tracks: List<JellyfinTrack> = emptyList(),
)

/** Response body of both `POST /jellyfin/items/:itemId/favorite` and
 * `DELETE /jellyfin/items/:itemId/favorite` — see `routes/jellyfin.ts`'s favourites section:
 * both respond `{ favorite }` reflecting the state Jellyfin actually recorded *after* the
 * change, not just an echo of which request was sent. [MusicRepository.setFavorite] trusts
 * this value over the request's own intent for exactly that reason. */
@Serializable
data class JellyfinFavoriteResponse(
    val favorite: Boolean,
)

// -----------------------------------------------------------------------------
// Jellyfin playlists (routes/jellyfin.ts) — Android wave F (music playlists). Mirrors
// `@auralis/jellyfin-client`'s `Playlist`/`PlaylistItem`/`LibraryPage<T>` field-for-field, same
// as every other Jellyfin model above.
// -----------------------------------------------------------------------------

/** One entry from GET /jellyfin/playlists. Mirrors `@auralis/jellyfin-client`'s `Playlist`
 * (packages/jellyfin-client/src/domain.ts) — unlike [JellyfinArtist]/[JellyfinAlbum] a playlist
 * carries no `favorite` field at all (Jellyfin playlists aren't favouritable the way library
 * items are), so there is nothing to default here. */
@Serializable
data class JellyfinPlaylist(
    val id: String,
    val name: String,
    val imageTag: String? = null,
    val trackCount: Int? = null,
)

/** GET /jellyfin/playlists response — unwrapped, the object itself. See
 * [JellyfinArtistsPage]'s doc comment for what [total] means. */
@Serializable
data class JellyfinPlaylistsPage(
    val items: List<JellyfinPlaylist>,
    val total: Int,
    val startIndex: Int,
)

/** One row of a GET /jellyfin/playlists/:playlistId/items response — one track occurrence
 * *within* the playlist, in playlist order. Mirrors `@auralis/jellyfin-client`'s
 * `PlaylistItem`. [playlistItemId] is the id of *this occurrence*, distinct from
 * [track]'s own id: the same track can appear twice in one playlist, each with its own
 * [playlistItemId], and removal keys on this value, never `track.id` — see
 * `packages/jellyfin-client/src/domain.ts`'s `PlaylistItem` doc comment for the full
 * reasoning this mirrors. */
@Serializable
data class JellyfinPlaylistItem(
    val playlistItemId: String,
    val track: JellyfinTrack,
)

/** GET /jellyfin/playlists/:playlistId/items response — unwrapped, the object itself. See
 * [JellyfinArtistsPage]'s doc comment for what [total] means. */
@Serializable
data class JellyfinPlaylistItemsPage(
    val items: List<JellyfinPlaylistItem>,
    val total: Int,
    val startIndex: Int,
)

/** Request body of POST /jellyfin/playlists — [itemIds] seeds the new playlist, empty/omitted
 * for an empty playlist. Mirrors `jellyfinCreatePlaylistBodySchema` (apps/server/src/routes/
 * schemas.ts) field-for-field. */
@Serializable
data class JellyfinCreatePlaylistBody(
    val name: String,
    val itemIds: List<String>? = null,
)

/** Response body of POST /jellyfin/playlists — the new playlist's id, nothing else (Jellyfin's
 * own `PlaylistCreationResult` carries more fields; the BFF route only forwards `id`, see
 * `routes/jellyfin.ts`). */
@Serializable
data class JellyfinCreatePlaylistResponse(
    val id: String,
)

/** Request body of POST /jellyfin/playlists/:playlistId/items — mirrors
 * `jellyfinAddToPlaylistBodySchema`; the BFF rejects an empty [itemIds], so callers must not
 * send one. */
@Serializable
data class JellyfinAddToPlaylistBody(
    val itemIds: List<String>,
)

/** Request body shared by POST /jellyfin/playback/start and POST /jellyfin/playback/stopped —
 * mirrors `jellyfinPlaybackReportBodySchema` (`apps/server/src/routes/schemas.ts`), which has no
 * `isPaused` field; see [JellyfinPlaybackProgressBody] for the one route that adds it. */
@Serializable
data class JellyfinPlaybackReportBody(
    val itemId: String,
    val positionSeconds: Double,
)

/** Request body of POST /jellyfin/playback/progress — mirrors
 * `jellyfinPlaybackProgressBodySchema`, which extends [JellyfinPlaybackReportBody] with an
 * optional `isPaused`. Not a Kotlin `data class` extension of [JellyfinPlaybackReportBody] (this
 * project's serialization setup has no inheritance story here) — a separate, structurally
 * identical-plus-one-field class, matching how every other pair of sibling BFF request bodies in
 * this file is modelled. */
@Serializable
data class JellyfinPlaybackProgressBody(
    val itemId: String,
    val positionSeconds: Double,
    val isPaused: Boolean? = null,
)
