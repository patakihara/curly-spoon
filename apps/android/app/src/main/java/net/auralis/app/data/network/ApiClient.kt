package net.auralis.app.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import net.auralis.app.data.model.ApiErrorBody
import net.auralis.app.data.model.AuthUser
import net.auralis.app.data.model.HomeResponse
import net.auralis.app.data.model.Library
import net.auralis.app.data.model.LibrariesResponse
import net.auralis.app.data.model.LoginRequestBody
import net.auralis.app.data.model.LoginResponse
import net.auralis.app.data.model.MeResponse
import net.auralis.app.data.model.OkResponse
import net.auralis.app.data.model.SetupRequestBody
import net.auralis.app.data.model.SetupResult
import net.auralis.app.data.model.SetupState
import net.auralis.app.data.model.Shelf
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

    private suspend fun apiUrl(path: String): HttpUrl = "${baseUrl().trimEnd('/')}/api/v1$path".toHttpUrl()

    private suspend inline fun <reified T> get(path: String): T =
        execute(Request.Builder().url(apiUrl(path)).get().build())

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
