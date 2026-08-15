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
import org.junit.Assert.assertNull
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

    /** The default `/recommended` body for both libraries in [routingDispatcher] — cold start,
     * matching what the real BFF route sends a user with no listening progress at all
     * (`docs/ROADMAP.md` §13: "deliberately no fallback inside the route"). Individual tests
     * override this via [routingDispatcher]'s `bookRecommendedBody`/`podcastRecommendedBody`. */
    private val emptyRecommended = """{"shelves":[]}"""

    private val bookRecommended =
        """{"shelves":[{"id":"rec-book","label":"Because you finished","type":"recommended","reason":"Because you finished a book","items":[
            {"id":"b2","libraryId":"lib-book","media":{"kind":"book","title":"Recommended Book","author":"Author Two"}}
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
        bookRecommendedResponse: MockResponse = MockResponse().setBody(emptyRecommended),
        podcastRecommendedResponse: MockResponse = MockResponse().setBody(emptyRecommended),
    ) = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val path = request.path?.substringBefore("?") ?: return MockResponse().setResponseCode(404)
            return when {
                path == "/api/v1/libraries" -> libraries
                path == "/api/v1/libraries/lib-book/home" -> MockResponse().setBody(bookHomeBody)
                path == "/api/v1/libraries/lib-pod/home" -> MockResponse().setBody(podcastHomeBody)
                path == "/api/v1/libraries/lib-book/recommended" -> bookRecommendedResponse
                path == "/api/v1/libraries/lib-pod/recommended" -> podcastRecommendedResponse
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
    fun `a cold-start recommended response of no shelves is a visual no-op`() =
        runTest {
            // Both /recommended endpoints default to {"shelves":[]} via routingDispatcher's
            // defaults — the exact response docs/ROADMAP.md §13 says a user with no listening
            // progress gets, with deliberately no fallback inside the BFF route. Nothing here
            // should add a carousel, an empty-state card, or anything else on top of the
            // pre-13d feed.
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            assertEquals(3, state.allCarousels.size)
            assertTrue(state.allCarousels.none { it.id == "rec-book" })
        }

    @Test
    fun `a recommended shelf is appended after the book library's home shelf, reason intact`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                    bookRecommendedResponse = MockResponse().setBody(bookRecommended),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            val bookCarousels = state.allCarousels.filter { it.contentType == ForYouContentType.BOOKS }
            // Existing home shelf first, recommended shelf appended after it — never replacing.
            assertEquals(listOf("shelf-book", "rec-book"), bookCarousels.map { it.id })
            assertEquals("Because you finished a book", bookCarousels.last().reason)
            assertNull(bookCarousels.first().reason)
            assertEquals(4, state.allCarousels.size)
        }

    @Test
    fun `a failing recommended request does not break or drop the existing home carousel`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                    bookRecommendedResponse = MockResponse().setResponseCode(500).setBody(serverError),
                    podcastRecommendedResponse = MockResponse().setResponseCode(500).setBody(serverError),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            // Same 3 carousels as if /recommended didn't exist at all — the failure degrades to
            // "no recommended carousel", not to ForYouUiState.Error and not to dropping the
            // book/podcast home carousels it would otherwise have been appended to.
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
