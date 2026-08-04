package net.auralis.app.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import net.auralis.app.data.model.ApiErrorBody
import net.auralis.app.data.model.AuthUser
import net.auralis.app.data.model.BookRequest
import net.auralis.app.data.model.CreateRequestBody
import net.auralis.app.data.model.HomeResponse
import net.auralis.app.data.model.Library
import net.auralis.app.data.model.LibrariesResponse
import net.auralis.app.data.model.LibraryItem
import net.auralis.app.data.model.LibraryItemResponse
import net.auralis.app.data.model.LibraryItemsPage
import net.auralis.app.data.model.LoginRequestBody
import net.auralis.app.data.model.LoginResponse
import net.auralis.app.data.model.MeResponse
import net.auralis.app.data.model.OkResponse
import net.auralis.app.data.model.PlaybackSession
import net.auralis.app.data.model.PlayResponse
import net.auralis.app.data.model.Release
import net.auralis.app.data.model.RequestResponse
import net.auralis.app.data.model.RequestSearchResult
import net.auralis.app.data.model.RequestsResponse
import net.auralis.app.data.model.SearchResults
import net.auralis.app.data.model.SeriesPage
import net.auralis.app.data.model.SetupRequestBody
import net.auralis.app.data.model.SetupResult
import net.auralis.app.data.model.SetupState
import net.auralis.app.data.model.Shelf
import net.auralis.app.data.model.SyncSessionBody
import net.auralis.app.data.model.auralisJson
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Talks to the Fastify BFF (`apps/server`) the same way `apps/web` does, over the session
 * cookie [SessionCookieJar] maintains. `httpClient` must already have been built with
 * `.cookieJar(cookieJar)` — that wiring happens wherever this class is constructed, not here.
 */
class ApiClient(
    private val httpClient: OkHttpClient,
    private val cookieJar: SessionCookieJar,
    private val baseUrl: suspend () -> String,
) {
    suspend fun getSetupState(): SetupState = get("/setup")

    suspend fun postSetup(baseUrl: String): SetupResult = post("/setup", SetupRequestBody(baseUrl))

    suspend fun login(
        username: String,
        password: String,
    ): LoginResponse = post("/auth/login", LoginRequestBody(username, password))

    suspend fun logout() {
        postNoBody<OkResponse>("/auth/logout")
        cookieJar.clearAll()
    }

    suspend fun me(): AuthUser = get<MeResponse>("/auth/me").user

    suspend fun libraries(): List<Library> = get<LibrariesResponse>("/libraries").libraries

    suspend fun libraryHome(libraryId: String): List<Shelf> = get<HomeResponse>("/libraries/$libraryId/home").shelves

    /** GET /libraries/{id}/items — used by Android Auto's browse tree (a later wave) to
     * list a library's items page by page. */
    suspend fun libraryItems(
        libraryId: String,
        page: Int? = null,
        limit: Int? = null,
        sort: String? = null,
        desc: Boolean? = null,
        filter: String? = null,
    ): LibraryItemsPage {
        val params =
            buildMap {
                page?.let { put("page", it.toString()) }
                limit?.let { put("limit", it.toString()) }
                sort?.let { put("sort", it) }
                desc?.let { put("desc", it.toString()) }
                filter?.let { put("filter", it) }
            }
        return get("/libraries/$libraryId/items", params)
    }

    /** GET /libraries/{id}/series — used by Android Auto's browse tree (a later wave) to
     * list a library's series. */
    suspend fun librarySeries(
        libraryId: String,
        page: Int? = null,
        limit: Int? = null,
    ): SeriesPage {
        val params =
            buildMap {
                page?.let { put("page", it.toString()) }
                limit?.let { put("limit", it.toString()) }
            }
        return get("/libraries/$libraryId/series", params)
    }

    /** GET /libraries/{id}/search — used by Android Auto's browse tree (a later wave) for
     * voice/text search within a library. */
    suspend fun searchLibrary(
        libraryId: String,
        query: String,
        limit: Int? = null,
    ): SearchResults {
        val params =
            buildMap {
                put("q", query)
                limit?.let { put("limit", it.toString()) }
            }
        return get("/libraries/$libraryId/search", params)
    }

    /** GET /items/{id} — used by Android Auto's browse tree (a later wave) to resolve a
     * single item, optionally expanded (tracks/chapters) and/or with playback progress. */
    suspend fun libraryItem(
        itemId: String,
        expanded: Boolean = false,
        includeProgress: Boolean = false,
    ): LibraryItem {
        val params =
            buildMap {
                if (expanded) put("expanded", "true")
                if (includeProgress) put("include", "progress")
            }
        return get<LibraryItemResponse>("/items/$itemId", params).item
    }

    suspend fun playItem(itemId: String): PlaybackSession = postNoBody<PlayResponse>("/items/$itemId/play").session

    suspend fun syncSession(
        sessionId: String,
        currentTime: Double,
        timeListened: Double,
        duration: Double,
    ) {
        post<SyncSessionBody, OkResponse>("/sessions/$sessionId/sync", SyncSessionBody(currentTime, timeListened, duration))
    }

    suspend fun closeSession(sessionId: String) {
        postNoBody<OkResponse>("/sessions/$sessionId/close")
    }

    suspend fun audioTrackUrl(
        itemId: String,
        fileId: String,
    ): String = apiUrl("/media/$itemId/track/$fileId").toString()

    suspend fun searchReleases(
        term: String,
        author: String? = null,
        limit: Int? = null,
    ): RequestSearchResult {
        val params =
            buildMap {
                put("term", term)
                author?.let { put("author", it) }
                limit?.let { put("limit", it.toString()) }
            }
        return get("/requests/search", params)
    }

    suspend fun listRequests(status: String? = null): List<BookRequest> {
        val params = status?.let { mapOf("status" to it) } ?: emptyMap()
        return get<RequestsResponse>("/requests", params).requests
    }

    suspend fun createRequest(
        title: String,
        author: String? = null,
        release: Release? = null,
    ): BookRequest = post<CreateRequestBody, RequestResponse>("/requests", CreateRequestBody(title, author, release)).request

    suspend fun getRequest(id: String): BookRequest = get<RequestResponse>("/requests/$id").request

    suspend fun approveRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/approve").request

    suspend fun rejectRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/reject").request

    suspend fun retryRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/retry").request

    suspend fun grabRequest(id: String): BookRequest = postNoBody<RequestResponse>("/requests/$id/grab").request

    suspend fun deleteRequest(id: String) {
        executeNoContent(Request.Builder().url(apiUrl("/requests/$id")).delete().build())
    }

    private suspend fun apiUrl(path: String): HttpUrl = "${baseUrl().trimEnd('/')}/api/v1$path".toHttpUrl()

    private suspend inline fun <reified T> get(
        path: String,
        queryParams: Map<String, String> = emptyMap(),
    ): T {
        val url =
            apiUrl(path).newBuilder().apply {
                queryParams.forEach { (key, value) -> addQueryParameter(key, value) }
            }.build()
        return execute(Request.Builder().url(url).get().build())
    }

    private suspend inline fun <reified B, reified T> post(
        path: String,
        body: B,
    ): T {
        val requestBody =
            auralisJson.encodeToString(body)
                .toRequestBody("application/json".toMediaType())
        return execute(Request.Builder().url(apiUrl(path)).post(requestBody).build())
    }

    private suspend inline fun <reified T> postNoBody(path: String): T =
        execute(Request.Builder().url(apiUrl(path)).post(ByteArray(0).toRequestBody(null)).build())

    private suspend inline fun <reified T> execute(request: Request): T =
        withContext(Dispatchers.IO) {
            var status = 0
            try {
                httpClient.newCall(request).execute().use { response ->
                    status = response.code
                    val bodyString = response.body?.string().orEmpty()
                    if (!response.isSuccessful) throw apiExceptionFromErrorBody(bodyString, response.code)
                    auralisJson.decodeFromString<T>(bodyString)
                }
            } catch (e: IOException) {
                throw ApiException("network_error", "Could not reach the Auralis server: ${e.message}", 0)
            } catch (e: SerializationException) {
                // A 2xx response whose body doesn't match the expected shape — same
                // "unexpected_response" treatment as an undecodable non-2xx error body.
                throw ApiException("unexpected_response", "Unexpected response from the server (HTTP $status)", status)
            }
        }

    /**
     * Like [execute], but for the one response with no body at all (`DELETE /requests/:id`'s
     * 204) — decoding an empty string as JSON would throw, so this variant only checks the
     * status and never calls into `auralisJson`.
     */
    private suspend fun executeNoContent(request: Request) =
        withContext(Dispatchers.IO) {
            try {
                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        throw apiExceptionFromErrorBody(response.body?.string().orEmpty(), response.code)
                    }
                }
            } catch (e: IOException) {
                throw ApiException("network_error", "Could not reach the Auralis server: ${e.message}", 0)
            }
        }

    private fun apiExceptionFromErrorBody(
        body: String,
        status: Int,
    ): ApiException {
        if (body.isNotEmpty()) {
            try {
                val parsed = auralisJson.decodeFromString<ApiErrorBody>(body)
                return ApiException(parsed.error.code, parsed.error.message, status)
            } catch (e: SerializationException) {
                // fall through — body wasn't the expected error shape
            }
        }
        return ApiException("unexpected_response", "Unexpected response from the server (HTTP $status)", status)
    }
}
