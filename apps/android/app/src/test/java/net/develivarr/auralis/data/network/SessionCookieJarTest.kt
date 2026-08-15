package net.develivarr.auralis.data.network

import kotlinx.coroutines.test.TestScope
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionCookieJarTest {
    private val url = "https://auralis.example.com/".toHttpUrl()
    private val otherHostUrl = "https://other.example.com/".toHttpUrl()

    private fun sessionCookie(value: String = "abc123") =
        Cookie.Builder()
            .name("auralis_session")
            .value(value)
            .domain("auralis.example.com")
            .path("/")
            .httpOnly()
            .build()

    @Test
    fun `loadForRequest returns a cookie just saved via saveFromResponse for a matching URL`() {
        val testScope = TestScope()
        val jar = SessionCookieJar(FakeKeyValueStore(), testScope)

        jar.saveFromResponse(url, listOf(sessionCookie()))

        val loaded = jar.loadForRequest(url)
        assertEquals(1, loaded.size)
        assertEquals("abc123", loaded[0].value)
    }

    @Test
    fun `loadForRequest returns nothing for a different host`() {
        val testScope = TestScope()
        val jar = SessionCookieJar(FakeKeyValueStore(), testScope)

        jar.saveFromResponse(url, listOf(sessionCookie()))

        assertTrue(jar.loadForRequest(otherHostUrl).isEmpty())
    }

    @Test
    fun `a cookie saved before restart is available from a fresh jar over the same store`() {
        val store = FakeKeyValueStore()
        val testScope = TestScope()
        val jar1 = SessionCookieJar(store, testScope)

        jar1.saveFromResponse(url, listOf(sessionCookie()))
        testScope.testScheduler.advanceUntilIdle()

        val jar2 = SessionCookieJar(store, TestScope())
        val loaded = jar2.loadForRequest(url)
        assertEquals(1, loaded.size)
        assertEquals("abc123", loaded[0].value)
    }

    @Test
    fun `a host-only cookie stays host-only after a persist-then-reload cycle`() {
        val store = FakeKeyValueStore()
        val testScope = TestScope()
        val jar1 = SessionCookieJar(store, testScope)
        val hostOnlyCookie =
            Cookie.Builder()
                .name("auralis_session")
                .value("abc123")
                .hostOnlyDomain("auralis.example.com")
                .path("/")
                .httpOnly()
                .build()
        assertTrue(hostOnlyCookie.hostOnly)

        jar1.saveFromResponse(url, listOf(hostOnlyCookie))
        testScope.testScheduler.advanceUntilIdle()

        val jar2 = SessionCookieJar(store, TestScope())
        val loaded = jar2.loadForRequest(url)
        assertEquals(1, loaded.size)
        assertTrue(loaded[0].hostOnly)
    }

    @Test
    fun `a non-host-only (domain-matching) cookie stays non-host-only after a persist-then-reload cycle`() {
        val store = FakeKeyValueStore()
        val testScope = TestScope()
        val jar1 = SessionCookieJar(store, testScope)
        val domainCookie =
            Cookie.Builder()
                .name("auralis_session")
                .value("abc123")
                .domain("auralis.example.com")
                .path("/")
                .httpOnly()
                .build()
        assertTrue(!domainCookie.hostOnly)

        jar1.saveFromResponse(url, listOf(domainCookie))
        testScope.testScheduler.advanceUntilIdle()

        val jar2 = SessionCookieJar(store, TestScope())
        val loaded = jar2.loadForRequest(url)
        assertEquals(1, loaded.size)
        assertTrue(!loaded[0].hostOnly)
    }

    @Test
    fun `clearAll empties the in-memory cache immediately`() {
        val testScope = TestScope()
        val jar = SessionCookieJar(FakeKeyValueStore(), testScope)
        jar.saveFromResponse(url, listOf(sessionCookie()))

        jar.clearAll()

        assertTrue(jar.loadForRequest(url).isEmpty())
    }

    @Test
    fun `clearAll also clears the persisted store, so a fresh jar loads nothing`() {
        val store = FakeKeyValueStore()
        val testScope = TestScope()
        val jar1 = SessionCookieJar(store, testScope)
        jar1.saveFromResponse(url, listOf(sessionCookie()))
        testScope.testScheduler.advanceUntilIdle()

        jar1.clearAll()
        testScope.testScheduler.advanceUntilIdle()

        val jar2 = SessionCookieJar(store, TestScope())
        assertTrue(jar2.loadForRequest(url).isEmpty())
    }
}
