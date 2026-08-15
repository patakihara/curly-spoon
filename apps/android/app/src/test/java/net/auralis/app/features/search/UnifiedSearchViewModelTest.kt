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
import net.auralis.app.features.musicrequests.CandidateRequestState
import net.auralis.app.features.requests.ReleaseRequestState
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

    // Set by viewModel() below, so tearDown() can drain whichever instance the running test
    // created — see tearDown()'s own comment for why this exists at all.
    private var lastViewModel: UnifiedSearchViewModel? = null

    @Before
    fun setUp() {
        // ioDispatcher is deliberately left at its default (real Dispatchers.IO), unlike most
        // ViewModel test files in this package — this class's own delay-based staleness tests
        // ("a stale search's slow library response...", "library results settle while the
        // requestable fan-out is still waiting...") need the library and requestable fan-outs to
        // run on genuinely concurrent background threads; forcing ioDispatcher onto the same
        // Unconfined dispatcher as Main would make every call run synchronously to completion
        // (see e.g. PlaylistDetailViewModelTest's identical doc comment on that effect) and
        // collapse exactly the interleaving those two tests exist to pin. tearDown() below is
        // what keeps that choice from leaking a request past this test into the next one.
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

    /**
     * Real Dispatchers.IO (see setUp()'s comment) means every requestable fan-out
     * (fetchRequestableBooks/fetchRequestableMusic, and requestRelease/requestCandidate's own
     * launches) runs on a real background thread this test's own `runTest` cannot see or wait
     * on structurally. A test that only awaits `resultsState` — several in this file do,
     * legitimately, since that is all *their* assertions need — can return while one of those
     * is still in flight. `Dispatchers.resetMain()` then tears down the Main dispatcher that
     * in-flight call's continuation needs to resume on, and the resulting
     * `IllegalStateException` (not an `ApiException`, so nothing in this class's own
     * try/catch blocks catches it) surfaces as `UncaughtExceptionsBeforeTest` against
     * whichever *other* test runs next — see `docs/HANDOVER.md`'s "Android CI" section for the
     * general shape of this failure class. Draining both requestable states to a settled
     * (non-Loading) value here, once per test regardless of what that test itself checked,
     * closes the gap structurally rather than relying on every current and future test in this
     * file to remember its own explicit await.
     */
    @After
    fun tearDown() {
        lastViewModel?.let { viewModel ->
            runTest {
                viewModel.uiState.first {
                    it.requestableBooksState !is RequestableBooksUiState.Loading &&
                        it.requestableMusicState !is RequestableMusicUiState.Loading
                }
            }
        }
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun viewModel(): UnifiedSearchViewModel {
        val created = UnifiedSearchViewModel(apiClient, musicRepository, serverConfigRepository)
        lastViewModel = created
        return created
    }

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
    private val twoBookLibraries =
        """[{"id":"lib-book-a","name":"Books A","mediaType":"book"},
            {"id":"lib-book-b","name":"Books B","mediaType":"book"}]"""

    // -----------------------------------------------------------------------------
    // 12b-A2 — the requestable fan-out. Every dispatcher below still needs the plain library/
    // music branches above (searchLibraryBody()/jellyfinSearchBody() with no arguments is
    // "found nothing"), since fetchRequestableBooks/fetchRequestableMusic are siblings of that
    // fan-out, not a replacement for it — a query this file's tests fire always triggers both.
    // -----------------------------------------------------------------------------

    private fun providersBody(providers: String = "[]") = """{"providers":$providers}"""

    private fun releaseSearchBody(
        releases: String = "[]",
        errors: String = "[]",
    ) = """{"releases":$releases,"errors":$errors}"""

    private fun musicRequestSearchBody(
        candidates: String = "[]",
        errors: String = "[]",
    ) = """{"candidates":$candidates,"errors":$errors}"""

    private val enabledBookProviders =
        """[{"kind":"indexer","configured":true,"enabled":true},
            {"kind":"download","configured":true,"enabled":true}]"""

    private val enabledMusicProvider = """[{"kind":"music","configured":true,"enabled":true}]"""

    private val oneRelease =
        """[{"guid":"g1","indexerId":"idx1","sourceName":"Prowlarr","title":"Dune",
            "seeders":5,"leechers":0,"categories":[]}]"""

    private val oneCandidate = """[{"guid":"c1","providerId":"slskd","sourceName":"slskd","title":"Arrakis"}]"""

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
            viewModel.uiState.first { it.requestableBooksState !is RequestableBooksUiState.Loading }

            // GET /libraries, GET /libraries/lib-book/search, GET /jellyfin/search and one
            // shared GET /providers (fetchRequestableBooks/fetchRequestableMusic await the same
            // Deferred — see UnifiedSearchViewModel's own doc comment) — exactly one fan-out,
            // not one per keystroke and not one per intermediate value either. The 404 default
            // dispatch branch below closes both requestable gates, so neither
            // GET /requests/search nor GET /music-requests/search ever fires.
            assertEquals(4, mockWebServer.requestCount)
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
            // The requestable sections must not render on an empty query either — both settle
            // back to Idle alongside resultsState, not merely "whatever they last were".
            assertEquals(RequestableBooksUiState.Idle, viewModel.uiState.value.requestableBooksState)
            assertEquals(RequestableMusicUiState.Idle, viewModel.uiState.value.requestableMusicState)
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

    // -----------------------------------------------------------------------------
    // 12b-A2 — the requestable fan-out (docs/ROADMAP.md §12b/12b-A2).
    // -----------------------------------------------------------------------------

    @Test
    fun `library results settle while the requestable fan-out is still waiting on a deliberately slow providers response`() =
        runTest {
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") -> MockResponse().setBody(searchLibraryBody())
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            // Deliberately slow — this is the only thing standing between the
                            // requestable sections and settling, and it must never hold up the
                            // library fan-out above, which has no dependency on it at all.
                            path.contains("/providers") ->
                                MockResponse().setBody(providersBody(enabledBookProviders))
                                    .setBodyDelay(200, TimeUnit.MILLISECONDS)
                            path.contains("/requests/search") -> MockResponse().setBody(releaseSearchBody(oneRelease))
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }

            // Library has settled; the requestable fan-out is still waiting on the deliberately
            // delayed GET /providers above — this is the property this whole wave exists for.
            assertEquals(RequestableBooksUiState.Loading, viewModel.uiState.value.requestableBooksState)
            assertEquals(RequestableMusicUiState.Loading, viewModel.uiState.value.requestableMusicState)

            viewModel.uiState.first { it.requestableBooksState is RequestableBooksUiState.Loaded }
            val booksState = viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded
            assertEquals(listOf("Dune"), booksState.releases.map { it.title })
        }

    @Test
    fun `a requestable book search failure leaves the library results intact`() =
        runTest {
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") ->
                                MockResponse().setBody(
                                    searchLibraryBody(
                                        books = """[{"id":"book1","libraryId":"lib-book",
                                            "media":{"kind":"book","title":"Dune"}}]""",
                                    ),
                                )
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            path.contains("/providers") -> MockResponse().setBody(providersBody(enabledBookProviders))
                            path.contains("/requests/search") ->
                                MockResponse().setResponseCode(500).setBody(
                                    """{"error":{"code":"upstream_error","message":"boom"}}""",
                                )
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            // The library fetch and the requestable fan-out are two independent async paths
            // (see the "12b-A2 — the requestable fan-out" tests above) — one settling says
            // nothing about the other. Awaiting only `requestableBooksState` and then casting
            // `resultsState` immediately after is a race: on a slower/busier CI runner the
            // requestable path can settle first, and `resultsState` is still `Loading` when
            // the cast below runs, throwing ClassCastException. Both `.first{}` calls are
            // needed — each already returns immediately if its condition is already true, so
            // this adds no artificial synchronisation and does not touch the real concurrency
            // the sibling test above exists to pin.
            viewModel.uiState.first { it.requestableBooksState is RequestableBooksUiState.Loaded }
            viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }

            val results = viewModel.uiState.value.resultsState as UnifiedSearchResultsUiState.Results
            assertEquals(listOf("Dune"), results.books.map { it.title })
            assertEquals(null, results.libraryError)

            val booksState = viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded
            assertTrue(booksState.releases.isEmpty())
            assertTrue(booksState.error != null)
            // The search itself failed, not "nothing matched" — but the two are deliberately
            // indistinguishable here: see RequestableBooksUiState.Loaded.offerRequestAnyway's
            // own doc comment on why a user whose indexer is down still gets offered the button.
            assertTrue(booksState.offerRequestAnyway)
        }

    @Test
    fun `a library search failure leaves the requestable book results intact`() =
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
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            path.contains("/providers") -> MockResponse().setBody(providersBody(enabledBookProviders))
                            path.contains("/requests/search") -> MockResponse().setBody(releaseSearchBody(oneRelease))
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            // Same race as "a requestable book search failure leaves the library results
            // intact" above: the library fetch and the requestable fan-out settle
            // independently, so both conditions must be awaited before either state is cast.
            viewModel.uiState.first { it.requestableBooksState is RequestableBooksUiState.Loaded }
            viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }

            val results = viewModel.uiState.value.resultsState as UnifiedSearchResultsUiState.Results
            assertTrue(results.books.isEmpty())
            assertTrue(results.libraryError != null)

            val booksState = viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded
            assertEquals(listOf("Dune"), booksState.releases.map { it.title })
            assertEquals(null, booksState.error)
        }

    @Test
    fun `the book and music request gates are honoured independently`() =
        runTest {
            // Only the book gate is satisfied here — no "music"-kind provider entry at all —
            // so the music side must settle to Idle without ever calling GET
            // /music-requests/search, while the book side searches and finds a release.
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") -> MockResponse().setBody(searchLibraryBody())
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            path.contains("/providers") -> MockResponse().setBody(providersBody(enabledBookProviders))
                            path.contains("/requests/search") -> MockResponse().setBody(releaseSearchBody(oneRelease))
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            viewModel.uiState.first { it.requestableBooksState is RequestableBooksUiState.Loaded }

            val booksState = viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded
            assertEquals(listOf("Dune"), booksState.releases.map { it.title })
            assertEquals(RequestableMusicUiState.Idle, viewModel.uiState.value.requestableMusicState)
        }

    @Test
    fun `a failed release request leaves the row Failed, not Requested`() =
        runTest {
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") -> MockResponse().setBody(searchLibraryBody())
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            path.contains("/providers") -> MockResponse().setBody(providersBody(enabledBookProviders))
                            path.contains("/requests/search") -> MockResponse().setBody(releaseSearchBody(oneRelease))
                            path == "/api/v1/requests" ->
                                MockResponse().setResponseCode(500).setBody(
                                    """{"error":{"code":"upstream_error","message":"boom"}}""",
                                )
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            viewModel.uiState.first { it.requestableBooksState is RequestableBooksUiState.Loaded }
            val release = (viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded).releases.single()

            viewModel.requestRelease(release)
            viewModel.uiState.first {
                val state = it.requestableBooksState
                state is RequestableBooksUiState.Loaded && state.releaseStates[release.guid] is ReleaseRequestState.Failed
            }

            val finalState = viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded
            assertTrue(finalState.releaseStates[release.guid] is ReleaseRequestState.Failed)
        }

    /**
     * Pins the sequence guard on [UnifiedSearchViewModel.requestRelease]'s eventual write —
     * `docs/HANDOVER.md`'s review of `664e817` found this missing: [performSearch]'s own three
     * fetch write-sites all check `sequence != searchSequence` before writing `_uiState`, but the
     * mutation callbacks (`requestRelease`/`updateReleaseState` and their music counterparts)
     * checked only `current is Loaded` — true for *any* settled search, not just the one that
     * fired the request. A `POST /requests` resolving after the user has already typed a new
     * query, and after that new query has already settled its own fresh
     * [RequestableBooksUiState.Loaded], would splice the old guid into the new search's
     * `releaseStates` map even though the new search's own `releases` list never contained it.
     */
    @Test
    fun `a slow release request resolving after a new search settles never leaks into that search's state`() =
        runTest {
            val otherRelease =
                """[{"guid":"g2","indexerId":"idx1","sourceName":"Prowlarr","title":"Other Book",
                    "seeders":3,"leechers":0,"categories":[]}]"""
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") -> MockResponse().setBody(searchLibraryBody())
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            path.contains("/providers") -> MockResponse().setBody(providersBody(enabledBookProviders))
                            path.contains("/requests/search") -> {
                                // Keyed on the request's own "term" param, same reasoning as this
                                // class's own "a stale search's slow library response..." test —
                                // "dune"'s requestable release must never appear for "other".
                                when (request.requestUrl?.queryParameter("term")) {
                                    "dune" -> MockResponse().setBody(releaseSearchBody(oneRelease))
                                    "other" -> MockResponse().setBody(releaseSearchBody(otherRelease))
                                    else -> MockResponse().setResponseCode(404)
                                }
                            }
                            // Deliberately slow — this is the request this test supersedes
                            // before it resolves.
                            path == "/api/v1/requests" ->
                                MockResponse()
                                    .setBody(
                                        """{"request":{"id":"req1","userId":"u1","title":"Dune","status":"pending",
                                            "progress":0,"createdAt":1,"updatedAt":1}}""",
                                    ).setBodyDelay(200, TimeUnit.MILLISECONDS)
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            viewModel.uiState.first { it.requestableBooksState is RequestableBooksUiState.Loaded }
            val release = (viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded).releases.single()

            // Fires the deliberately slow POST /requests above, then immediately supersedes it
            // with a new search — the sequence this request captured is stale well before its
            // response ever arrives.
            viewModel.requestRelease(release)
            viewModel.onQueryChange("other")
            advanceDebounce()
            viewModel.uiState.first {
                val state = it.requestableBooksState
                state is RequestableBooksUiState.Loaded && state.releases.map { it.title } == listOf("Other Book")
            }

            // Let the slow request actually resolve before asserting "never", not just "not
            // immediately" — identical reasoning to this class's own slow-library test.
            Thread.sleep(300)
            val finalState = viewModel.uiState.value.requestableBooksState as RequestableBooksUiState.Loaded
            assertEquals(listOf("Other Book"), finalState.releases.map { it.title })
            assertTrue(finalState.releaseStates.isEmpty())
        }

    @Test
    fun `requesting a music candidate creates the request and immediately grabs it when approved`() =
        runTest {
            var grabbed = false
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") -> MockResponse().setBody(searchLibraryBody())
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            path.contains("/providers") -> MockResponse().setBody(providersBody(enabledMusicProvider))
                            path.contains("/music-requests/search") ->
                                MockResponse().setBody(musicRequestSearchBody(oneCandidate))
                            path == "/api/v1/music-requests" ->
                                MockResponse().setBody(
                                    """{"request":{"id":"req1","userId":"u1","title":"Arrakis",
                                        "status":"approved","progress":0,"createdAt":1,"updatedAt":1}}""",
                                )
                            path == "/api/v1/music-requests/req1/grab" -> {
                                grabbed = true
                                MockResponse().setBody(
                                    """{"request":{"id":"req1","userId":"u1","title":"Arrakis",
                                        "status":"downloading","progress":0,"createdAt":1,"updatedAt":1}}""",
                                )
                            }
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            viewModel.uiState.first { it.requestableMusicState is RequestableMusicUiState.Loaded }
            val candidate = (viewModel.uiState.value.requestableMusicState as RequestableMusicUiState.Loaded).candidates.single()

            viewModel.requestCandidate(candidate)
            viewModel.uiState.first {
                val state = it.requestableMusicState
                state is RequestableMusicUiState.Loaded && state.candidateStates[candidate.guid] is CandidateRequestState.Requested
            }

            assertTrue(grabbed)
            val finalState = viewModel.uiState.value.requestableMusicState as RequestableMusicUiState.Loaded
            assertEquals(CandidateRequestState.Requested, finalState.candidateStates[candidate.guid])
            assertEquals(null, finalState.grabWarnings[candidate.guid])
        }

    @Test
    fun `a failed candidate request leaves the row Failed, not Requested`() =
        runTest {
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path ?: return MockResponse().setResponseCode(404)
                        return when {
                            path.startsWith("/api/v1/libraries") && !path.contains("/search") ->
                                MockResponse().setBody(librariesBody(oneBookLibrary))
                            path.contains("/libraries/lib-book/search") -> MockResponse().setBody(searchLibraryBody())
                            path.contains("/jellyfin/search") -> MockResponse().setBody(jellyfinSearchBody())
                            path.contains("/providers") -> MockResponse().setBody(providersBody(enabledMusicProvider))
                            path.contains("/music-requests/search") ->
                                MockResponse().setBody(musicRequestSearchBody(oneCandidate))
                            path == "/api/v1/music-requests" ->
                                MockResponse().setResponseCode(500).setBody(
                                    """{"error":{"code":"upstream_error","message":"boom"}}""",
                                )
                            else -> MockResponse().setResponseCode(404)
                        }
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("dune")
            advanceDebounce()
            viewModel.uiState.first { it.requestableMusicState is RequestableMusicUiState.Loaded }
            val candidate = (viewModel.uiState.value.requestableMusicState as RequestableMusicUiState.Loaded).candidates.single()

            viewModel.requestCandidate(candidate)
            viewModel.uiState.first {
                val state = it.requestableMusicState
                state is RequestableMusicUiState.Loaded && state.candidateStates[candidate.guid] is CandidateRequestState.Failed
            }

            val finalState = viewModel.uiState.value.requestableMusicState as RequestableMusicUiState.Loaded
            assertTrue(finalState.candidateStates[candidate.guid] is CandidateRequestState.Failed)
        }

    /**
     * Named follow-up from wave 12b-A1 (`docs/ROADMAP.md` §12b): no test covered two
     * *concurrent* book libraries of the same kind. `fetchLibraryResults` fires one
     * `GET /libraries/{id}/search` per matching library via `async`, so each library's own
     * result is paired with its own closure over `library.id` rather than by the order
     * responses happen to arrive at the server — but that is exactly the kind of thing this
     * project's own history says not to assume without a test that can actually catch a
     * mismatch (see `docs/HANDOVER.md`'s Android test-trap notes on `MockWebServer` serving
     * responses in request-arrival order, not enqueue order).
     *
     * This deliberately makes library A's response slow and library B's instant, so B's
     * response reaches the server first even though A is first in `apiClient.libraries()`'s
     * own list — the out-of-arrival-order case the attribution has to survive. Each library's
     * path already carries its own id (`/libraries/lib-book-a/search` vs
     * `/libraries/lib-book-b/search`), so no extra query-parameter keying is needed the way
     * the staleness tests above need `q`.
     */
    @Test
    fun `two concurrent book libraries of the same kind never swap results`() =
        runTest {
            mockWebServer.dispatcher =
                routingDispatcher(twoBookLibraries) { request ->
                    when {
                        request.path?.contains("/libraries/lib-book-a/search") == true ->
                            MockResponse()
                                .setBody(
                                    searchLibraryBody(
                                        books = """[{"id":"book-a","libraryId":"lib-book-a",
                                            "media":{"kind":"book","title":"Alpha Book","author":"Author A"}}]""",
                                    ),
                                )
                                .setBodyDelay(200, TimeUnit.MILLISECONDS)
                        request.path?.contains("/libraries/lib-book-b/search") == true ->
                            MockResponse().setBody(
                                searchLibraryBody(
                                    books = """[{"id":"book-b","libraryId":"lib-book-b",
                                        "media":{"kind":"book","title":"Beta Book","author":"Author B"}}]""",
                                ),
                            )
                        request.path?.contains("/jellyfin/search") == true ->
                            MockResponse().setBody(jellyfinSearchBody())
                        else -> MockResponse().setResponseCode(404)
                    }
                }
            val viewModel = viewModel()

            viewModel.onQueryChange("book")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is UnifiedSearchResultsUiState.Results }
                    .resultsState as UnifiedSearchResultsUiState.Results

            assertEquals(setOf("Alpha Book", "Beta Book"), state.books.map { it.title }.toSet())
            val alpha = state.books.single { it.title == "Alpha Book" }
            val beta = state.books.single { it.title == "Beta Book" }
            // The point of the test: each title is paired with *its own* library's author, never
            // the other library's — a swap would show "Author B" on Alpha or vice versa.
            assertEquals("Author A", alpha.subtitle)
            assertEquals("Author B", beta.subtitle)
        }
}
