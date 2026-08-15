package net.develivarr.auralis.features.home

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
import net.develivarr.auralis.data.settings.ServerConfigRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * [ForYouViewModel]'s three-source fan-out (docs/ROADMAP.md §12d). Follows the shared
 * `ioDispatcher = testDispatcher` convention (`docs/HANDOVER.md`'s "Android CI: read this
 * before touching an Android test") — nothing here is timing-dependent, so the whole
 * `load()` call runs synchronously once every response is enqueued, and every assertion below
 * reads `uiState.value` directly rather than awaiting a `Flow`.
 */
class ForYouViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var apiClient: ApiClient
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        val testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { baseUrl }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private val twoLibraries =
        """{"libraries":[
            {"id":"lib-book","name":"Audiobooks","mediaType":"book"},
            {"id":"lib-pod","name":"Podcasts","mediaType":"podcast"}
        ]}"""

    private val bookHome =
        """{"shelves":[{"id":"shelf-book","label":"Continue Listening","type":"book","items":[
            {"id":"b1","libraryId":"lib-book","media":{"kind":"book","title":"Sample Book","author":"Author One"}}
        ]}]}"""

    private val podcastHome =
        """{"shelves":[{"id":"shelf-pod","label":"New Episodes","type":"episode","items":[
            {"id":"p1","libraryId":"lib-pod","media":{"kind":"podcast","title":"Sample Episode","author":"Show One"}}
        ]}]}"""

    private val favoriteAlbums =
        """{"items":[{"id":"al1","name":"Album One","artistName":"Artist One","favorite":true}],
            "total":1,"startIndex":0}"""

    private val serverError = """{"error":{"code":"internal_error","message":"Boom"}}"""

    /** Routes every request by path — required here since `load()` issues several concurrent
     * requests and [MockWebServer] serves enqueued responses in request-*arrival* order, not
     * enqueue order (`docs/HANDOVER.md`'s own warning). [libraries]/[jellyfin] are full
     * [MockResponse]s (so a test can make either one fail); [bookHomeBody]/[podcastHomeBody]
     * are success bodies only — nothing here needs the home calls to fail independently of
     * `libraries()` itself failing. */
    private fun routingDispatcher(
        libraries: MockResponse,
        jellyfin: MockResponse,
        bookHomeBody: String = bookHome,
        podcastHomeBody: String = podcastHome,
    ) = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val path = request.path?.substringBefore("?") ?: return MockResponse().setResponseCode(404)
            return when {
                path == "/api/v1/libraries" -> libraries
                path == "/api/v1/libraries/lib-book/home" -> MockResponse().setBody(bookHomeBody)
                path == "/api/v1/libraries/lib-pod/home" -> MockResponse().setBody(podcastHomeBody)
                path.startsWith("/api/v1/jellyfin/albums") -> jellyfin
                else -> MockResponse().setResponseCode(404)
            }
        }
    }

    @Test
    fun `no base URL saved produces an error state`() =
        runTest {
            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)

            val state = viewModel.uiState.first { it !is ForYouUiState.Loading }

            assertTrue(state is ForYouUiState.Error)
            assertEquals("No Auralis server configured", (state as ForYouUiState.Error).message)
            assertEquals(0, mockWebServer.requestCount)
        }

    @Test
    fun `every source succeeding produces one carousel per source`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            assertEquals(3, state.allCarousels.size)
            assertEquals(
                setOf(ForYouContentType.BOOKS, ForYouContentType.PODCASTS, ForYouContentType.MUSIC),
                state.allCarousels.map { it.contentType }.toSet(),
            )
        }

    @Test
    fun `a Jellyfin failure still produces book and podcast carousels`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setResponseCode(500).setBody(serverError),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            assertEquals(
                setOf(ForYouContentType.BOOKS, ForYouContentType.PODCASTS),
                state.allCarousels.map { it.contentType }.toSet(),
            )
        }

    @Test
    fun `an Audiobookshelf libraries failure still produces a music carousel (vice versa)`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setResponseCode(500).setBody(serverError),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            assertEquals(listOf(ForYouContentType.MUSIC), state.allCarousels.map { it.contentType })
        }

    @Test
    fun `total failure of every source produces Error, not an empty Loaded`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setResponseCode(500).setBody(serverError),
                    jellyfin = MockResponse().setResponseCode(500).setBody(serverError),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading }

            assertTrue(state is ForYouUiState.Error)
        }

    @Test
    fun `changing the filter changes which carousels uiState exposes, without refetching`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            viewModel.uiState.first { it !is ForYouUiState.Loading }
            val requestCountAfterLoad = mockWebServer.requestCount

            viewModel.selectFilter("music")
            val filtered = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            assertEquals("music", filtered.filter)
            assertEquals(listOf(ForYouContentType.MUSIC), filtered.visibleCarousels.map { it.contentType })
            // Still every carousel underneath — only the *visible* slice narrowed.
            assertEquals(3, filtered.allCarousels.size)
            assertEquals(requestCountAfterLoad, mockWebServer.requestCount)
        }

    @Test
    fun `re-selecting the active filter clears it back to all, still without refetching`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            viewModel.uiState.first { it !is ForYouUiState.Loading }

            viewModel.selectFilter("music")
            viewModel.selectFilter("music")
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            assertEquals("all", state.filter)
            assertEquals(3, state.visibleCarousels.size)
        }
}
