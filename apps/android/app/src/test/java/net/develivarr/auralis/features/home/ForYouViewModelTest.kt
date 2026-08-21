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
 * [ForYouViewModel]'s four-source fan-out (docs/ROADMAP.md §12d, wave 15c-2-A). Follows the
 * shared `ioDispatcher = testDispatcher` convention (`docs/HANDOVER.md`'s "Android CI: read this
 * before touching an Android test") — nothing here is timing-dependent, so the whole
 * `load()` call runs synchronously once every response is enqueued, and every assertion below
 * reads `uiState.value` directly rather than awaiting a `Flow`.
 *
 * Wave 15c-2-A replaced the two per-medium `GET /libraries/{id}/recommended` fetches this suite
 * used to mock (`bookRecommendedResponse`/`podcastRecommendedResponse`) with one
 * `GET /api/v1/recommended` mock (`recommendedResponse`) — see [routingDispatcher].
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

    /** The default `/api/v1/recommended` body for [routingDispatcher] — cold start, matching
     * what the real BFF route sends a user with no listening progress at all (`docs/ROADMAP.md`
     * §13: "deliberately no fallback inside the route"). Individual tests override this via
     * [routingDispatcher]'s `recommendedResponse`. */
    private val emptyRecommended = """{"shelves":[]}"""

    /** Wave 15c-2-A: a single-kind (books-only) mixed shelf — no `itemLabels`, matching the
     * server's "absent below a kind-count of two" contract. */
    private val bookOnlyRecommended =
        """{"shelves":[{"id":"rec-mixed-book","label":"Because you finished","type":"recommended","reason":"Because you finished a book","items":[
            {"kind":"book","id":"b2","title":"Recommended Book","subtitle":"Author Two","availability":"owned"}
        ]}]}"""

    /** Wave 15c-2-A: one owned book and one external (unowned) album in the same shelf — proves
     * `itemLabels` reaches [FeedItem.typeLabel] and `availability` reaches [FeedItem.isExternal]
     * through the real deserialization path, not just through a unit test of
     * [mixedShelfToCarousel] in isolation. */
    private val mixedRecommended =
        """{"shelves":[{"id":"rec-mixed","label":"For you","type":"recommended","reason":"Mixed picks",
            "itemLabels":{"b2":"Audiobook","al2":"Album"},
            "items":[
                {"kind":"book","id":"b2","title":"Recommended Book","subtitle":"Author Two","availability":"owned"},
                {"kind":"album","id":"al2","title":"Discover Album","subtitle":"Some Artist","availability":"external"}
            ]}]}"""

    private val favoriteAlbums =
        """{"items":[{"id":"al1","name":"Album One","artistName":"Artist One","favorite":true}],
            "total":1,"startIndex":0}"""

    private val serverError = """{"error":{"code":"internal_error","message":"Boom"}}"""

    /** Routes every request by path — required here since `load()` issues several concurrent
     * requests and [MockWebServer] serves enqueued responses in request-*arrival* order, not
     * enqueue order (`docs/HANDOVER.md`'s own warning). [libraries]/[jellyfin] are full
     * [MockResponse]s (so a test can make either one fail); [bookHomeBody]/[podcastHomeBody]/
     * [recommendedResponse] default to success bodies a passing test never needs to think about. */
    private fun routingDispatcher(
        libraries: MockResponse,
        jellyfin: MockResponse,
        bookHomeBody: String = bookHome,
        podcastHomeBody: String = podcastHome,
        recommendedResponse: MockResponse = MockResponse().setBody(emptyRecommended),
    ) = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val path = request.path?.substringBefore("?") ?: return MockResponse().setResponseCode(404)
            return when {
                path == "/api/v1/libraries" -> libraries
                path == "/api/v1/libraries/lib-book/home" -> MockResponse().setBody(bookHomeBody)
                path == "/api/v1/libraries/lib-pod/home" -> MockResponse().setBody(podcastHomeBody)
                path == "/api/v1/recommended" -> recommendedResponse
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
    fun `every source succeeding with a cold-start recommended response produces one carousel per ABS-Jellyfin source`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            // Cold-start /recommended contributes no carousel — a visual no-op, same as before
            // this wave. 3 carousels: book home, podcast home, Jellyfin favourites.
            assertEquals(3, state.allCarousels.size)
            assertEquals(
                setOf(ForYouContentType.BOOKS, ForYouContentType.PODCASTS, ForYouContentType.MUSIC),
                state.allCarousels.map { it.contentType }.toSet(),
            )
        }

    @Test
    fun `a non-empty recommended response adds a fourth carousel, appended after the other three`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                    recommendedResponse = MockResponse().setBody(bookOnlyRecommended),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            assertEquals(4, state.allCarousels.size)
            assertEquals("rec-mixed-book", state.allCarousels.last().id)
            assertEquals("Because you finished a book", state.allCarousels.last().reason)
            // Single-kind mixed shelf: contentType is the shared kind, not null.
            assertEquals(ForYouContentType.BOOKS, state.allCarousels.last().contentType)
        }

    /** Proves `itemLabels`/`availability` reach [FeedItem.typeLabel]/[FeedItem.isExternal]
     * through the real deserialization path ([net.develivarr.auralis.data.model
     * .MixedRecommendedShelf] via [ApiClient.recommended]), not just through a unit test of
     * [mixedShelfToCarousel] in isolation — the same "assert through to observable behaviour"
     * standard `docs/HANDOVER.md` names as the fix for the four writer-with-no-reader failures. */
    @Test
    fun `a mixed shelf's items carry their typeLabel and isExternal through to the loaded state`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                    recommendedResponse = MockResponse().setBody(mixedRecommended),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            val mixedCarousel = state.allCarousels.single { it.id == "rec-mixed" }
            assertNull(mixedCarousel.contentType) // spans book + album -> mixed
            val book = mixedCarousel.items.single { it.id == "b2" }
            val album = mixedCarousel.items.single { it.id == "al2" }
            assertEquals("Audiobook", book.typeLabel)
            assertTrue(!book.isExternal)
            assertEquals("Album", album.typeLabel)
            assertTrue(album.isExternal)
        }

    @Test
    fun `a failing recommended request does not break or drop the existing home carousels`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setBody(twoLibraries),
                    jellyfin = MockResponse().setBody(favoriteAlbums),
                    recommendedResponse = MockResponse().setResponseCode(500).setBody(serverError),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading } as ForYouUiState.Loaded

            // Same 3 carousels as if /recommended didn't exist at all — the failure degrades to
            // "no mixed carousel", not to ForYouUiState.Error and not to dropping the other
            // three sources' carousels.
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

    /** Wave 15c-2-A: [fetchMixedRecommendedCarousel] needs no library id, so it does not depend
     * on `libraries()` at all — a libraries failure must not prevent a non-empty recommended
     * response from still contributing its carousel. */
    @Test
    fun `an Audiobookshelf libraries failure does not prevent the recommended carousel from loading`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setResponseCode(500).setBody(serverError),
                    jellyfin = MockResponse().setResponseCode(500).setBody(serverError),
                    recommendedResponse = MockResponse().setBody(bookOnlyRecommended),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading }

            // books/podcasts/music all failed, but the mixed source succeeded — Loaded, not Error.
            assertTrue(state is ForYouUiState.Loaded)
            assertEquals(1, (state as ForYouUiState.Loaded).allCarousels.size)
            assertEquals("rec-mixed-book", state.allCarousels.single().id)
        }

    @Test
    fun `total failure of every source, including recommended, produces Error, not an empty Loaded`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setResponseCode(500).setBody(serverError),
                    jellyfin = MockResponse().setResponseCode(500).setBody(serverError),
                    recommendedResponse = MockResponse().setResponseCode(500).setBody(serverError),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading }

            assertTrue(state is ForYouUiState.Error)
        }

    /** The 4-way AND's other half: every source failing *except* recommended must NOT produce
     * [ForYouUiState.Error] — see `an Audiobookshelf libraries failure does not prevent the
     * recommended carousel from loading` above for the mirror case (recommended succeeds, the
     * rest fail). This one pins that recommended succeeding-but-empty also keeps the gate open
     * when the other three genuinely fail, distinguishing the 4-way AND from a stricter "any
     * failure is fatal" gate. */
    @Test
    fun `every source but recommended failing, with recommended cold-start-empty, is still Loaded`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.dispatcher =
                routingDispatcher(
                    libraries = MockResponse().setResponseCode(500).setBody(serverError),
                    jellyfin = MockResponse().setResponseCode(500).setBody(serverError),
                )

            val viewModel = ForYouViewModel(apiClient, serverConfigRepository)
            val state = viewModel.uiState.first { it !is ForYouUiState.Loading }

            assertTrue(state is ForYouUiState.Loaded)
            assertTrue((state as ForYouUiState.Loaded).allCarousels.isEmpty())
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
