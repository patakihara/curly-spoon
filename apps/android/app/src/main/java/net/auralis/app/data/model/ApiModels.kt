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

/** One entry from GET /libraries. */
@Serializable
data class Library(
    val id: String,
    val name: String,
    val mediaType: String,
    val icon: String? = null,
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
