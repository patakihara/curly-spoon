package net.develivarr.auralis.api

import java.io.IOException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import net.develivarr.auralis.auth.Session
import net.develivarr.auralis.generated.api.AppToken
import net.develivarr.auralis.generated.api.ErrorResponse
import net.develivarr.auralis.generated.api.TokenBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** The server refused a call: its HTTP [status] and the `error` it named, when it named one. */
class ApiException(val status: Int, val error: String?) : IOException("HTTP $status ${error.orEmpty()}")

/**
 * The Auralis server's API over OkHttp, read and written with the generated models. Every call
 * carries the app's bearer token, added per call from [session]; a 401 signs the app out, which
 * sends it back to Sign in. Calls block: run them off the main thread.
 */
class ApiClient(
    private val server: ServerConfig,
    private val session: Session,
    private val http: OkHttpClient,
) {
    /** Swaps the one-time code from the sign-in callback, with its PKCE verifier, for a token. */
    fun appToken(body: TokenBody): AppToken =
        send(post("api/auth/token", TokenBody.serializer(), body), AppToken.serializer(), bearer = false)

    fun <R> get(path: String, response: KSerializer<R>): R =
        send(Request.Builder().url(url(path)).get(), response, bearer = true)

    fun <B, R> post(path: String, body: B, bodySerializer: KSerializer<B>, response: KSerializer<R>): R =
        send(post(path, bodySerializer, body), response, bearer = true)

    private fun url(path: String) = server.baseUrl.newBuilder().addPathSegments(path).build()

    private fun <B> post(path: String, serializer: KSerializer<B>, body: B): Request.Builder =
        Request.Builder().url(url(path))
            .post(ApiJson.encodeToString(serializer, body).toRequestBody(JSON))

    private fun <R> send(builder: Request.Builder, response: KSerializer<R>, bearer: Boolean): R {
        val token = if (bearer) session.token.value else null
        if (token != null) builder.header("Authorization", "Bearer $token")
        http.newCall(builder.build()).execute().use { reply ->
            val text = reply.body?.string().orEmpty()
            if (!reply.isSuccessful) {
                if (reply.code == 401 && token != null) session.signedOut()
                throw ApiException(reply.code, errorOf(text))
            }
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
