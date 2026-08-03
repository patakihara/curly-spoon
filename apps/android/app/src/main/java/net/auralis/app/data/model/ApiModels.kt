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
