package net.develivarr.auralis

import android.net.Uri
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals

private const val MAX_REDIRECTS = 5

/**
 * Follows [start]'s redirects as a browser would, cookies included, through the recorded-upstreams
 * server's stand-in sign-on, until one leaves HTTP for the app's own scheme; that callback is what
 * the browser would hand the app.
 */
fun followToApp(start: Uri): Uri {
    val http = OkHttpClient.Builder().followRedirects(false).build()
    val cookies = mutableMapOf<String, String>()
    var url = start.toString()
    repeat(MAX_REDIRECTS) {
        val request = Request.Builder().url(url).apply {
            if (cookies.isNotEmpty()) header("Cookie", cookies.entries.joinToString("; ") { "${it.key}=${it.value}" })
        }.build()
        val location = http.newCall(request).execute().use { reply ->
            for (set in reply.headers("Set-Cookie")) {
                val pair = set.substringBefore(';')
                cookies[pair.substringBefore('=')] = pair.substringAfter('=')
            }
            assertEquals("$url: ${reply.body?.string()}", 302, reply.code)
            reply.request.url.resolve(reply.header("Location")!!)?.toString() ?: reply.header("Location")!!
        }
        if (location.startsWith("auralis:")) return Uri.parse(location)
        url = location
    }
    error("no way back to the app from $start")
}
