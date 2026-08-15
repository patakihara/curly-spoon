package net.develivarr.auralis.features.player

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
import net.develivarr.auralis.features.music.LyricsResult
import net.develivarr.auralis.features.music.MusicRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * Covers [MusicRepository.lyrics] (Android wave J). Deliberately placed in this package rather
 * than alongside `MusicRepositoryTest` under `features/music` — this wave's own "do not touch"
 * list restricts edits under `features/music/` to `MusicRepository.kt`/`ApiClient.kt` themselves,
 * to stay disjoint from a concurrent session's work on that directory's screens/ViewModels; a new
 * test file there would violate that even though it targets an allowed file. [MusicRepository]
 * is public, so testing it from a different package is unaffected by that split.
 */
class MusicRepositoryLyricsTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var repository: MusicRepository

    @Before
    fun setUp() {
        val testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val cookieJar = SessionCookieJar(FakeKeyValueStore(), CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        val apiClient =
            ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { mockWebServer.url("/").toString() }
        repository = MusicRepository(apiClient)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    @Test
    fun `lyrics returns Loaded with the parsed lines when Jellyfin has synced lyrics`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"lyrics":{"lines":[{"text":"Hello","startSeconds":1.5}],"synced":true}}""",
                ),
            )

            val result = repository.lyrics("track-1")

            val loaded = result as? LyricsResult.Loaded
            assertEquals(1, loaded?.lyrics?.lines?.size)
            assertEquals(1.5, loaded?.lyrics?.lines?.get(0)?.startSeconds)
        }

    /** `lyrics: null` is a normal `Loaded` outcome — see `ApiClient.jellyfinLyrics`'s own doc
     * comment for why Jellyfin's "no lyrics" 404 never reaches this layer as a failure. */
    @Test
    fun `lyrics returns Loaded with a null lyrics field when the track has none, not Failed`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"lyrics":null}"""))

            val result = repository.lyrics("track-2")

            val loaded = result as? LyricsResult.Loaded
            assertNull(loaded?.lyrics)
        }

    @Test
    fun `lyrics returns Failed with the upstream error code on a genuine upstream failure`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setResponseCode(404).setBody(
                    """{"error":{"code":"item_not_found","message":"not found"}}""",
                ),
            )

            val result = repository.lyrics("track-missing")

            val failed = result as? LyricsResult.Failed
            assertEquals("item_not_found", failed?.code)
        }
}
