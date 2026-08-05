package net.auralis.app.features.player

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.features.music.MusicRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Exercises [LyricsViewModel] against a real [MusicRepository]/[ApiClient] over [MockWebServer]
 * — same pattern `FavoritesViewModelTest`/`MusicLibraryViewModelTest` use, no hand-rolled fake
 * repository. `ApiClient`'s `ioDispatcher` is the test's own [UnconfinedTestDispatcher], shared
 * with `Dispatchers.Main` — see `docs/HANDOVER.md`'s "Android CI" section for why that is
 * load-bearing: without it, `LyricsViewModel.ensureLoaded`'s request escapes onto the real
 * `Dispatchers.IO` pool, invisible to `runTest`, and can throw during an unrelated later test.
 * Under this shared `UnconfinedTestDispatcher`, the whole call is synchronous, so every
 * assertion below reads `uiState.value` directly with no `Flow.first { }` await.
 */
class LyricsViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var viewModel: LyricsViewModel

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
        viewModel = LyricsViewModel(MusicRepository(apiClient))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    @Test
    fun `a synced-lyrics response loads with every line and its startSeconds intact`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"lyrics":{"lines":[{"text":"First","startSeconds":0.0},{"text":"Second","startSeconds":5.5}],"synced":true}}""",
                ),
            )

            viewModel.ensureLoaded("track-1")

            val state = viewModel.uiState.value as? LyricsUiState.Loaded
            assertEquals(2, state?.lyrics?.lines?.size)
            assertEquals("Second", state?.lyrics?.lines?.get(1)?.text)
            assertEquals(5.5, state?.lyrics?.lines?.get(1)?.startSeconds)
            assertTrue(state?.lyrics?.synced ?: false)
        }

    /** `lyrics: null` — Jellyfin has nothing for this track — is a normal `Loaded` outcome, not
     * [LyricsUiState.Failed]. This is the common case across most of a library. */
    @Test
    fun `a null lyrics body loads as Loaded with a null lyrics field, not Failed`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"lyrics":null}"""))

            viewModel.ensureLoaded("track-2")

            val state = viewModel.uiState.value
            assertTrue(state is LyricsUiState.Loaded)
            assertNull((state as LyricsUiState.Loaded).lyrics)
        }

    @Test
    fun `an upstream failure surfaces as Failed with the originating error code`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setResponseCode(401).setBody(
                    """{"error":{"code":"upstream_auth_expired","message":"expired"}}""",
                ),
            )

            viewModel.ensureLoaded("track-3")

            val state = viewModel.uiState.value as? LyricsUiState.Failed
            assertEquals("upstream_auth_expired", state?.code)
        }

    /** A repeated call for the *same* track — e.g. a recomposition triggered by an unrelated
     * player-state change — must not re-fetch: only one request should ever reach the server. */
    @Test
    fun `calling ensureLoaded twice for the same item id issues only one request`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"lyrics":null}"""))

            viewModel.ensureLoaded("track-4")
            viewModel.ensureLoaded("track-4")

            assertEquals(1, mockWebServer.requestCount)
        }

    /** A *different* track id must trigger a fresh request — the guard is keyed on the id, not
     * "any previous load happened". */
    @Test
    fun `calling ensureLoaded for a different item id issues a new request`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"lyrics":{"lines":[{"text":"A","startSeconds":0.0}],"synced":true}}""",
                ),
            )
            mockWebServer.enqueue(MockResponse().setBody("""{"lyrics":null}"""))

            viewModel.ensureLoaded("track-5")
            val first = viewModel.uiState.value as? LyricsUiState.Loaded
            assertEquals(1, first?.lyrics?.lines?.size)

            viewModel.ensureLoaded("track-6")
            val second = viewModel.uiState.value as? LyricsUiState.Loaded

            assertEquals(2, mockWebServer.requestCount)
            assertNull(second?.lyrics)
        }
}
