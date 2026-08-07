package net.auralis.app.features.search

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
import net.auralis.app.features.music.MusicRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

/**
 * Exercises [UnifiedSearchViewModel] against a real [MusicRepository]/[ApiClient] over
 * [MockWebServer] — same pattern `MusicSearchViewModelTest` uses; there is no fake
 * `ApiClient`/`MusicRepository` in this project for a ViewModel test to use instead.
 *
 * A single query here fires *several* concurrent requests (one `GET /libraries`, one
 * `GET /libraries/{id}/search` per book/podcast library, and one `GET /jellyfin/search`), so
 * every test routes [mockWebServer] through a path-keyed [Dispatcher] rather than a queue of
 * plain `enqueue()` calls — `MockWebServer`'s default dispatcher hands out enqueued responses
 * in request-*arrival* order, not enqueue order, and with this many concurrent requests in
 * flight per query that ordering is not just unpredictable, it is actively likely to swap
 * bodies between endpoints (see `MusicSearchViewModelTest`'s own doc comment on the identical
 * trap with only two concurrent requests).
 */
class UnifiedSearchViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient
    private lateinit var musicRepository: MusicRepository
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var testDispatcher: TestDispatcher

    @Before
    fun setUp() {
        testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
        musicRepository = MusicRepository(apiClient)
        runTest { serverConfigRepository.setBaseUrl(mockWebServer.url("/").toString()) }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun viewModel() = UnifiedSearchViewModel(apiClient, musicRepository, serverConfigRepository)

    private fun advanceDebounce() = testDispatcher.scheduler.advanceUntilIdle()

    private fun librariesBody(libraries: String) = """{"libraries":$libraries}"""

    private fun searchLibraryBody(
        books: String = "[]",
        podcasts: String = "[]",
        series: String = "[]",
        authors: String = "[]",
    ) = """{"books":$books,"podcasts":$podcasts,"series":$series,"authors":$authors}"""

    private fun jellyfinSearchBody(
        artists: String = "[]",
        albums: String = "[]",
        tracks: String = "[]",
    ) = """{"artists":$artists,"albums":$albums,"tracks":$tracks}"""

    private val oneBookLibrary = """[{"id":"lib-book","name":"Books","mediaType":"book"}]"""
    private val bookAndPodcastLibraries =
        """[{"id":"lib-book","name":"Books","mediaType":"book"},
            {"id":"lib-podcast","name":"Podcasts","mediaType":"podcast"}]"""

    /** Routes every request by path, always returning [libraries] for `GET /libraries` and
     * delegating everything else to [onOther] — the shared skeleton every test in this file
     * builds its own [Dispatcher] from. */
    private fun routingDispatcher(
        libraries: String,
        onOther: (RecordedRequest) -> MockResponse,
    ) = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val path = request.path ?: return MockResponse().setResponseCode(404)
            return if (path.startsWith("/api/v1/libraries") && !path.contains("/search")) {
                MockResponse().setBody(librariesBody(libraries))
            } else {
                onOther(request)
            }
        }
    }

    @Test
    fun `rapid typing within the debounce window sends no request until it settles`() =
        runTest {
            mockWebServer.dispatcher =
                routingDispatcher(oneBookLibrary) { request ->
                    when {
                        request.path?.contains("/libraries/lib-book/search") == true ->
                            MockResponse().setBody(searchLibraryBody())
                        request.path?.contains("/jellyfin/search") == true ->
                            MockResponse().setBody(jellyfinSearchBody())
                        else -> MockResponse().setResponseCode(404)
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("d")
            viewModel.onQueryChange("du")
            viewModel.onQueryChange("dune")

            // No time has been advanced yet — a per-keystroke implementation would already have
            // fired the fan-out up to three times here.
            assertEquals(0, mockWebServer.requestCount)

            advanceDebounce()
            viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }

            // GET /libraries, GET /libraries/lib-book/search and GET /jellyfin/search — exactly
            // one fan-out, not one per keystroke and not one per intermediate value either.
            assertEquals(3, mockWebServer.requestCount)
        }

    @Test
    fun `clearing the field settles back to Idle without waiting on a request`() =
        runTest {
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            // No dispatcher/response is set up at all — clearing the field below must win
            // immediately rather than this test hanging on a request nothing will ever answer.
            viewModel.onQueryChange("")

            assertEquals(UnifiedSearchResultsUiState.Idle, viewModel.uiState.value.resultsState)
            assertEquals(0, mockWebServer.requestCount)
        }

    @Test
    fun `a settled search groups books, podcasts, series, authors and music together`() =
        runTest {
            mockWebServer.dispatcher =
                routingDispatcher(bookAndPodcastLibraries) { request ->
                    when {
                        request.path?.contains("/libraries/lib-book/search") == true ->
                            MockResponse().setBody(
                                searchLibraryBody(
                                    books = """[{"id":"book1","libraryId":"lib-book",
                                        "media":{"kind":"book","title":"Dune","author":"Frank Herbert"}}]""",
                                    series = """[{"id":"ser1","name":"Dune Saga"}]""",
                                    authors = """[{"id":"auth1","name":"Frank Herbert"}]""",
                                ),
                            )
                        request.path?.contains("/libraries/lib-podcast/search") == true ->
                            MockResponse().setBody(
                                searchLibraryBody(
                                    podcasts = """[{"id":"pod1","libraryId":"lib-podcast",
                                        "media":{"kind":"podcast","title":"Dune Discussions"}}]""",
                                ),
                            )
                        request.path?.contains("/jellyfin/search") == true ->
                            MockResponse().setBody(
                                jellyfinSearchBody(
                                    artists = """[{"id":"art1","name":"Dune Soundtrack"}]""",
                                    albums = """[{"id":"alb1","name":"Dune Score","artistId":"art1",
                                        "artistName":"Dune Soundtrack"}]""",
                                    tracks = """[{"id":"trk1","name":"Arrakis","albumId":"alb1",
                                        "artistNames":["Dune Soundtrack"]}]""",
                                ),
                            )
                        else -> MockResponse().setResponseCode(404)
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }
                    .resultsState as UnifiedSearchResultsUiState.Results

            assertFalse(state.isEmpty)
            assertEquals(listOf("Dune"), state.books.map { it.title })
            assertEquals("Frank Herbert", state.books.single().subtitle)
            assertEquals(listOf("Dune Discussions"), state.podcasts.map { it.title })
            assertEquals(listOf("Dune Saga"), state.series.map { it.name })
            assertEquals(listOf("Frank Herbert"), state.authors.map { it.name })
            assertEquals(listOf("Dune Soundtrack"), state.artists.map { it.name })
            assertEquals(listOf("Dune Score"), state.albums.map { it.name })
            assertEquals(listOf("Arrakis"), state.tracks.map { it.title })
            assertEquals(null, state.libraryError)
            assertEquals(null, state.musicError)
            assertFalse(state.musicUnconfigured)
        }

    @Test
    fun `a settled search with no matches anywhere reaches an empty Results state, not Idle or Failed`() =
        runTest {
            mockWebServer.dispatcher =
                routingDispatcher(oneBookLibrary) { request ->
                    when {
                        request.path?.contains("/libraries/lib-book/search") == true ->
                            MockResponse().setBody(searchLibraryBody())
                        request.path?.contains("/jellyfin/search") == true ->
                            MockResponse().setBody(jellyfinSearchBody())
                        else -> MockResponse().setResponseCode(404)
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("zzz")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }
                    .resultsState as UnifiedSearchResultsUiState.Results

            assertTrue(state.isEmpty)
        }

    @Test
    fun `jellyfin unconfigured still returns book results, degrading only the music side`() =
        runTest {
            mockWebServer.dispatcher =
                routingDispatcher(oneBookLibrary) { request ->
                    when {
                        request.path?.contains("/libraries/lib-book/search") == true ->
                            MockResponse().setBody(
                                searchLibraryBody(
                                    books = """[{"id":"book1","libraryId":"lib-book",
                                        "media":{"kind":"book","title":"Dune"}}]""",
                                ),
                            )
                        request.path?.contains("/jellyfin/search") == true ->
                            MockResponse()
                                .setResponseCode(400)
                                .setBody("""{"error":{"code":"jellyfin_not_configured","message":"no server"}}""")
                        else -> MockResponse().setResponseCode(404)
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }
                    .resultsState as UnifiedSearchResultsUiState.Results

            // A user with no music server must still get their book results — this is the
            // per-source degrade guarantee, not a whole-search failure.
            assertEquals(listOf("Dune"), state.books.map { it.title })
            assertTrue(state.musicUnconfigured)
            assertEquals(null, state.musicError)
        }

    @Test
    fun `a library fetch failure still returns music results, degrading only the library side`() =
        runTest {
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setResponseCode(500).setBody(
                                    """{"error":{"code":"upstream_error","message":"boom"}}""",
                                )
                            path.contains("/jellyfin/search") ->
                                MockResponse().setBody(
                                    jellyfinSearchBody(artists = """[{"id":"art1","name":"Dune Soundtrack"}]"""),
                                )
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }
                    .resultsState as UnifiedSearchResultsUiState.Results

            assertEquals(listOf("Dune Soundtrack"), state.artists.map { it.name })
            assertTrue(state.books.isEmpty())
            assertTrue(state.libraryError != null)
        }

    @Test
    fun `a stale search's slow library response never overwrites the newer settled one`() =
        runTest {
            // Deliberately slow on the library side for "wro", instant for "right" — see this
            // class's own doc comment on why a path-keyed Dispatcher, not two enqueue() calls,
            // is what makes this deterministic with this many concurrent requests in flight.
            // Keyed on the request's own "q" query parameter for the same reason
            // MusicSearchViewModelTest keys on "term": whichever request the server sees first,
            // "wro" always gets the deliberately slow body and "right" always gets the instant
            // one, so the only thing left to prove is that the slow one never wins.
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") -> {
                                val term = request.requestUrl?.queryParameter("q")
                                when (term) {
                                    "wro" ->
                                        MockResponse()
                                            .setBody(
                                                searchLibraryBody(
                                                    books = """[{"id":"wrong","libraryId":"lib-book",
                                                        "media":{"kind":"book","title":"Wrong Book"}}]""",
                                                ),
                                            ).setBodyDelay(200, TimeUnit.MILLISECONDS)
                                    "right" ->
                                        MockResponse().setBody(
                                            searchLibraryBody(
                                                books = """[{"id":"correct","libraryId":"lib-book",
                                                    "media":{"kind":"book","title":"Right Book"}}]""",
                                            ),
                                        )
                                    else -> MockResponse().setResponseCode(404)
                                }
                            }
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("wro")
            advanceDebounce()
            // The debounce has elapsed and the first fan-out is now sent, suspended on
            // Dispatchers.IO awaiting the deliberately delayed library response above.
            // Superseding it here — before that response arrives — is the actual race under
            // test: onQueryChange cancels the still-pending search job, so its eventual (stale)
            // response must never reach _uiState even once it does arrive.
            viewModel.onQueryChange("right")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }
                    .resultsState as UnifiedSearchResultsUiState.Results

            assertEquals(listOf("Right Book"), state.books.map { it.title })

            // The check above alone would still pass even with the production guard deleted:
            // `first{}` stops looking the instant a Results state appears, which happens here
            // the moment "right"'s instant response lands — well before "wro"'s deliberately
            // slow (200ms) response has even arrived. Waiting out the full delay window and
            // then re-reading the *current* value (not another `first{}`) is what pins "never",
            // not just "not immediately": if the sequence guard were gone, "wro"'s response
            // would still be flowing back through performSearch's coroutineScope and would
            // overwrite _uiState with "Wrong Book" sometime in this window, and the assertion
            // below would catch it. This also doubles as the pre-existing teardown wait — see
            // MusicSearchViewModelTest's identical comment on letting the cancelled request's
            // real (slow) network call finish before @After's mockWebServer.shutdown() runs.
            Thread.sleep(300)
            val finalState = viewModel.uiState.value.resultsState as UnifiedSearchResultsUiState.Results
            assertEquals(listOf("Right Book"), finalState.books.map { it.title })
        }
}
