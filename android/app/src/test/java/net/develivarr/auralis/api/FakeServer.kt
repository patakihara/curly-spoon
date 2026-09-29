package net.develivarr.auralis.api

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer

/**
 * Stands in for the Auralis server inside OkHttp, so no call leaves the test: each request is
 * kept, and [answer] replies with a status and a JSON body in the server's own schema.
 */
class FakeServer : Interceptor {
    class Seen(val request: Request, val body: String?)

    val seen = mutableListOf<Seen>()

    @Volatile
    var answer: (Request) -> Pair<Int, String> = { 404 to """{"error":"not_found"}""" }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val body = request.body?.let { Buffer().also(it::writeTo).readUtf8() }
        synchronized(seen) { seen += Seen(request, body) }
        val (status, json) = answer(request)
        return Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(status)
            .message("")
            .body(json.toResponseBody("application/json".toMediaType()))
            .build()
    }

    fun client(): OkHttpClient = OkHttpClient.Builder().addInterceptor(this).build()
}
