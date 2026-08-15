package net.develivarr.auralis.data.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * OkHttp has no implicit cookie jar the way a browser does, but the BFF's entire auth
 * mechanism is a session cookie (`auralis_session`, httpOnly, no `Max-Age`) that must be
 * resent on every request — this is the missing piece `apps/web` gets for free from the
 * browser. Persisted via [KeyValueStore] so the session survives process death, which
 * Android does far more aggressively than a desktop browser tab closing.
 *
 * Cookie expiry is deliberately not modelled: this server's session cookie carries no
 * `Max-Age`/`Expires`, so every cookie this jar ever sees is treated as valid indefinitely.
 * The server's own session lifetime is what actually enforces expiry — a stale cookie just
 * gets a 401 from the server, which is a later wave's concern, not this jar's.
 */
class SessionCookieJar(
    private val store: KeyValueStore,
    private val scope: CoroutineScope,
) : CookieJar {
    @Volatile
    private var cache: List<Cookie> = emptyList()

    init {
        // Runs once, at construction (effectively app startup) — acceptable to block here.
        cache = runBlocking { loadPersisted() }
    }

    override fun saveFromResponse(
        url: HttpUrl,
        cookies: List<Cookie>,
    ) {
        var updated = cache
        for (cookie in cookies) {
            updated =
                updated.filterNot {
                    it.name == cookie.name && it.domain == cookie.domain && it.path == cookie.path
                } + cookie
        }
        cache = updated
        // Do not block the OkHttp interceptor thread on persistence.
        scope.launch { persist() }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = cache.filter { it.matches(url) }

    /** Empties the jar, in memory and on disk. Called by [ApiClient.logout] after a 200. */
    fun clearAll() {
        cache = emptyList()
        scope.launch { persist() }
    }

    private suspend fun persist() {
        store.putStringSet(COOKIES_KEY, cache.map { encode(it) }.toSet())
    }

    private suspend fun loadPersisted(): List<Cookie> =
        store.getStringSet(COOKIES_KEY).mapNotNull { decode(it) }

    private fun encode(cookie: Cookie): String =
        listOf(
            cookie.name,
            cookie.value,
            cookie.domain,
            cookie.path,
            if (cookie.secure) "1" else "0",
            if (cookie.httpOnly) "1" else "0",
            if (cookie.hostOnly) "1" else "0",
        ).joinToString(FIELD_SEPARATOR)

    /**
     * Skips (rather than crashes on) a malformed persisted string — this is user-device
     * storage, degrade rather than throw. Indexes the split result by position; a 7-element
     * `List` cannot be unpacked with Kotlin destructuring since the stdlib only defines
     * `component1()`..`component5()` for `List`.
     *
     * `hostOnly` (no `Domain=` attribute — this server's session cookie has none, per
     * `apps/server/src/auth/cookies.ts`) has to be persisted explicitly and rebuilt via
     * `hostOnlyDomain(...)`: `.domain(...)` alone always produces a domain-matching cookie,
     * which would silently widen a host-only cookie's scope to subdomains on every reload.
     */
    private fun decode(encoded: String): Cookie? {
        val parts = encoded.split(FIELD_SEPARATOR)
        if (parts.size != 7) return null
        return try {
            Cookie.Builder()
                .name(parts[0])
                .value(parts[1])
                .apply { if (parts[6] == "1") hostOnlyDomain(parts[2]) else domain(parts[2]) }
                .path(parts[3])
                .apply { if (parts[4] == "1") secure() }
                .apply { if (parts[5] == "1") httpOnly() }
                .build()
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    private companion object {
        const val COOKIES_KEY = "session_cookies"

        // Unicode unit separator (U+001F) as a field delimiter — cannot appear in a cookie
        // name/value/domain/path (RFC 6265 cookie-octet excludes control characters), so
        // fields need no escaping beyond this delimiter choice.
        const val FIELD_SEPARATOR = "\u001F"
    }
}
