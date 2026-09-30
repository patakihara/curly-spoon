package net.develivarr.auralis.api

import java.io.IOException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import net.develivarr.auralis.auth.Session
import net.develivarr.auralis.generated.api.AppToken
import net.develivarr.auralis.generated.api.ErrorResponse
import net.develivarr.auralis.generated.api.TokenBody
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** The server refused a call: its HTTP [status] and the `error` it named, when it named one. */
class ApiException(val status: Int, val error: String?) : IOException("HTTP $status ${error.orEmpty()}")

/**
 * The Auralis server's API over OkHttp, read and written with the generated models. Every call
 * carries the app's bearer token, added per call from [session]; a 401 signs the app out, which
 * sends it back to Sign in, unless the app has signed in afresh since the call set out. Calls block: run them off the main thread.
 */
class ApiClient(
    private val server: ServerConfig,
    private val session: Session,
    private val http: OkHttpClient,
) {
    /**
     * OkHttp with the bearer on every call to the server and a 401 from it signing the app out,
     * for whatever else reads from the server with the same session: the player's track requests.
     * A request anywhere else goes out without the bearer, and its 401 signs nobody out.
     */
    val authorized: OkHttpClient = http.newBuilder()
        .apply { interceptors().add(0, Bearer(session, server.baseUrl)) }
        .build()

    /** A path the server names, such as a plan's track URL (`/api/media/...`), made absolute. */
    fun resolve(reference: String): HttpUrl =
        requireNotNull(server.baseUrl.resolve(reference)) { "not a URL reference: $reference" }

    /** Swaps the one-time code from the sign-in callback, with its PKCE verifier, for a token. */
    fun appToken(body: TokenBody): AppToken =
        send(post("api/auth/token", TokenBody.serializer(), body), AppToken.serializer(), bearer = false)

    fun <R> get(path: String, response: KSerializer<R>): R =
        send(Request.Builder().url(url(path)).get(), response, bearer = true)

    fun <B, R> post(path: String, body: B, bodySerializer: KSerializer<B>, response: KSerializer<R>): R =
        send(post(path, bodySerializer, body), response, bearer = true)

    /** A POST with nothing to send, such as closing a plan's playback session. */
    fun <R> post(path: String, response: KSerializer<R>): R =
        send(Request.Builder().url(url(path)).post(ByteArray(0).toRequestBody(null)), response, bearer = true)

    private fun url(path: String) = server.baseUrl.newBuilder().addPathSegments(path).build()

    private fun <B> post(path: String, serializer: KSerializer<B>, body: B): Request.Builder =
        Request.Builder().url(url(path))
            .post(ApiJson.encodeToString(serializer, body).toRequestBody(JSON))

    private fun <R> send(builder: Request.Builder, response: KSerializer<R>, bearer: Boolean): R {
        (if (bearer) authorized else http).newCall(builder.build()).execute().use { reply ->
            val text = reply.body?.string().orEmpty()
            if (!reply.isSuccessful) throw ApiException(reply.code, errorOf(text))
            return try {
                ApiJson.decodeFromString(response, text)
            } catch (e: SerializationException) {
                throw IOException("unreadable answer from ${reply.request.url.encodedPath}", e)
            }
        }
    }

    private fun errorOf(text: String): String? = try {
        ApiJson.decodeFromString(ErrorResponse.serializer(), text).error
    } catch (e: SerializationException) {
        null
    } catch (e: IllegalArgumentException) {
        null
    }

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}

/**
 * Adds the bearer the app holds to a request for [server] (same scheme, host and port); a 401 for
 * it signs the app out, unless a newer one replaced it. Any other request passes untouched.
 */
private class Bearer(private val session: Session, private val server: HttpUrl) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val url = chain.request().url
        if (url.scheme != server.scheme || url.host != server.host || url.port != server.port) {
            return chain.proceed(chain.request())
        }
        val token = session.token.value
        val request = chain.request().let {
            if (token == null) it else it.newBuilder().header("Authorization", "Bearer $token").build()
        }
        val response = chain.proceed(request)
        if (response.code == 401 && token != null) session.expired(token)
        return response
    }
}
