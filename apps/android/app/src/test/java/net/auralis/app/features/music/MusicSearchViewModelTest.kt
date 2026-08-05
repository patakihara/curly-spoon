package net.auralis.app.features.music

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
 * Exercises [MusicSearchViewModel] against a real [MusicRepository]/[ApiClient] over
 * [MockWebServer] — same pattern [MusicLibraryViewModelTest] uses; there is no fake
 * `ApiClient`/`MusicRepository` in this project for a ViewModel test to use instead.
 *
 * Unlike that class, [MusicSearchViewModel.onQueryChange] debounces via a real `delay()` on
 * `Dispatchers.Main` before firing a request — the one genuine use of coroutine virtual time
 * among this app's ViewModel tests. [testDispatcher] is therefore kept as its own field here,
 * not just handed anonymously to `Dispatchers.setMain` the way [MusicLibraryViewModelTest] does
 * it: `runTest`'s own ambient scheduler is a *separate* object from whatever `Dispatchers.Main`
 * happens to be (see `HomeViewModelTest`'s `startDownload against an unavailable engine...` test
 * for this project's own prior documentation of that split), so a test that only advanced
 * `runTest`'s own scheduler would leave `onQueryChange`'s `delay()` parked forever. Driving
 * [testDispatcher] — the exact object installed as `Dispatchers.Main`, and so the dispatcher
 * `viewModelScope.launch` actually schedules onto — removes that ambiguity outright.
 */
class MusicSearchViewModelTest {
    private lateinit var mockWebServer: MockWebServer
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
        val apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
        musicRepository = MusicRepository(apiClient)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun searchResponse(
        artists: String = "[]",
        albums: String = "[]",
        tracks: String = "[]",
    ) = MockResponse().setBody("""{"artists":$artists,"albums":$albums,"tracks":$tracks}""")

    private fun artistJson(
        id: String,
        name: String,
    ) = """{"id":"$id","name":"$name"}"""

    /** Lets [MusicSearchViewModel.onQueryChange]'s debounce `delay()` — dispatched on
     * `Dispatchers.Main.immediate`, i.e. [testDispatcher] — actually elapse. See this class's
     * own doc comment for why this drives [testDispatcher] directly. */
    private fun advanceDebounce() = testDispatcher.scheduler.advanceUntilIdle()

    @Test
    fun `rapid typing within the debounce window sends no request until it settles`() =
        runTest {
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("p")
            viewModel.onQueryChange("pi")
            viewModel.onQueryChange("pink")

            // No time has been advanced yet — a per-keystroke implementation would already have
            // sent up to three requests here.
            assertEquals(0, mockWebServer.requestCount)

            mockWebServer.enqueue(searchResponse(artists = "[${artistJson("art1", "Pink Floyd")}]"))
            advanceDebounce()
            val state = viewModel.uiState.first { it.resultsState is MusicSearchResultsUiState.Results }

            // Exactly one request for the whole burst, not one per keystroke and not one per
            // intermediate value ("p", "pi") either.
            assertEquals(1, mockWebServer.requestCount)
            val results = state.resultsState as MusicSearchResultsUiState.Results
            assertEquals(listOf("Pink Floyd"), results.artists.map { it.name })
        }

    @Test
    fun `clearing the field settles back to Idle without waiting on a request`() =
        runTest {
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("pink")
            // No response is enqueued — clearing the field below must win immediately rather
            // than this test hanging on a request nothing will ever answer.
            viewModel.onQueryChange("")

            assertEquals(MusicSearchResultsUiState.Idle, viewModel.uiState.value.resultsState)
            assertEquals(0, mockWebServer.requestCount)
        }

    @Test
    fun `a query with matches reaches Results with all three sections mapped from the repository`() =
        runTest {
            mockWebServer.enqueue(
                searchResponse(
                    artists = "[${artistJson("art1", "Pink Floyd")}]",
                    albums = """[{"id":"alb1","name":"The Wall","artistId":"art1","artistName":"Pink Floyd"}]""",
                    tracks =
                        """[{"id":"trk1","name":"Comfortably Numb","albumId":"alb1","albumName":"The Wall",
                            "artistNames":["Pink Floyd"]}]""",
                ),
            )
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("pink")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is MusicSearchResultsUiState.Results }
                    .resultsState as MusicSearchResultsUiState.Results

            assertFalse(state.isEmpty)
            assertEquals(listOf("Pink Floyd"), state.artists.map { it.name })
            assertEquals(listOf("The Wall"), state.albums.map { it.name })
            assertEquals(listOf("Comfortably Numb"), state.tracks.map { it.title })
            assertEquals("alb1", state.tracks.single().albumId)
        }

    @Test
    fun `a settled search with no matches reaches an empty Results state, not Idle or Failed`() =
        runTest {
            mockWebServer.enqueue(searchResponse())
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("zzz")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is MusicSearchResultsUiState.Results }
                    .resultsState as MusicSearchResultsUiState.Results

            assertTrue(state.isEmpty)
        }

    @Test
    fun `a track with no albumId is carried through as non-interactive (albumId null)`() =
        runTest {
            mockWebServer.enqueue(
                searchResponse(
                    tracks = """[{"id":"trk1","name":"Orphaned Track","artistNames":["Unknown"]}]""",
                ),
            )
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("orphan")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is MusicSearchResultsUiState.Results }
                    .resultsState as MusicSearchResultsUiState.Results

            // MusicSearchScreen.kt's SearchTrackRow only attaches a `clickable` modifier when
            // albumId is non-null — this is the data-level guarantee that check relies on.
            assertEquals(null, state.tracks.single().albumId)
        }

    @Test
    fun `a real failure reaches Failed with mapped copy, not the raw code`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"upstream_error","message":"boom"}}"""),
            )
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("pink")
            advanceDebounce()
            val state = viewModel.uiState.first { it.resultsState is MusicSearchResultsUiState.Failed }

            val failed = state.resultsState as MusicSearchResultsUiState.Failed
            assertFalse(failed.message.contains("upstream_error"))
        }

    @Test
    fun `jellyfin not configured reaches the calm Unconfigured state, not Failed`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(400)
                    .setBody("""{"error":{"code":"jellyfin_not_configured","message":"no server"}}"""),
            )
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("pink")
            advanceDebounce()
            val state = viewModel.uiState.first { it.resultsState !is MusicSearchResultsUiState.Searching }

            assertEquals(MusicSearchResultsUiState.Unconfigured, state.resultsState)
        }

    @Test
    fun `a stale response for a superseded query does not overwrite the newer one`() =
        runTest {
            // Deliberately slow: this response must still be in flight when the second query
            // supersedes it below, or this test would not be exercising the race it is named
            // for — a debounce test alone (see the "rapid typing" test above) only proves a
            // *pending* search never fires; this proves an *already in-flight* one can't win.
            //
            // Why a custom Dispatcher instead of two enqueue() calls (the shape every other
            // test in this file uses): MockWebServer's default queue-based dispatcher hands
            // out enqueued responses in the order requests ARRIVE at the server, not in the
            // order they were enqueued against a particular query. Both searches below are
            // real, concurrent OkHttp calls dispatched onto Dispatchers.IO's thread pool with
            // no synchronization between them (see this class's own doc comment on the
            // withContext(Dispatchers.IO)-is-blocking gap) — so which one physically connects
            // to the server first is a genuine, unpredictable race, and the *first* call also
            // pays real thread-pool warm-up cost the second one doesn't, biasing that race
            // against the assumption "wro" arrives before "right". Two enqueue() calls would
            // therefore sometimes hand "wro"'s request the fast response meant for "right" and
            // vice versa — a response/query mismatch that has nothing to do with staleness or
            // cancellation, which is exactly what made this test fail on three separate
            // commits despite two fixes aimed at the (unrelated) sequencing logic. Keying the
            // response on each request's own `term` query parameter removes the ambiguity at
            // its root: whichever request the server sees first, "wro" always gets the
            // deliberately slow body and "right" always gets the instant one, so the only
            // thing left to prove is that the *slow* one never wins — which is the actual
            // behaviour this test is named for.
            mockWebServer.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse =
                        when (request.requestUrl?.queryParameter("term")) {
                            "wro" ->
                                searchResponse(artists = "[${artistJson("art1", "Wrong Artist")}]")
                                    .setBodyDelay(200, TimeUnit.MILLISECONDS)
                            "right" -> searchResponse(artists = "[${artistJson("art2", "Right Artist")}]")
                            else -> MockResponse().setResponseCode(404)
                        }
                }
            val viewModel = MusicSearchViewModel(musicRepository, serverConfigRepository)

            viewModel.onQueryChange("wro")
            advanceDebounce()
            // The debounce has elapsed and the first request is now sent, suspended on
            // Dispatchers.IO awaiting the deliberately delayed response above. Superseding it
            // here — before that response arrives — is the actual race under test:
            // onQueryChange cancels the still-pending search job, so its eventual (stale)
            // response must never reach _uiState even once it does arrive.
            viewModel.onQueryChange("right")
            advanceDebounce()
            val state =
                viewModel.uiState.first { it.resultsState is MusicSearchResultsUiState.Results }
                    .resultsState as MusicSearchResultsUiState.Results

            assertEquals(listOf("Right Artist"), state.artists.map { it.name })

            // The check above alone would still pass even with the production guard deleted:
            // `first{}` stops looking the instant a Results state appears, which happens here
            // the moment "right"'s instant response lands — well before "wro"'s deliberately
            // slow (200ms) response has even arrived. A guard-less overwrite would land *after*
            // that assertion already ran, making it a tautology that can't actually catch a
            // regression. Waiting out the full delay window and then re-reading the *current*
            // value (not another `first{}`, which would just re-return the same already-settled
            // state) is what pins "never", not just "not immediately": if the guard were gone,
            // "wro"'s response would still be flowing back from performSearch's `when (result)`
            // branch and would overwrite _uiState with "Wrong Artist" sometime in this window,
            // and the assertion below would catch it.
            //
            // This also doubles as the pre-existing teardown wait: it lets the cancelled first
            // request's real (slow) network call actually finish on its own background thread
            // before @After's mockWebServer.shutdown() runs — otherwise that shutdown races a
            // still-in-flight real socket read on a thread this test no longer controls. The
            // delay is real wall-clock time (MockWebServer's own dispatcher thread), not virtual
            // test time, so it has to be waited out the same way rather than advanced. See
            // PodcastsViewModelTest's and MusicLibraryViewModelTest's own comments on the
            // identical-in-spirit leaked-coroutine/teardown-race failure mode this avoids.
            Thread.sleep(300)
            val finalState = viewModel.uiState.value.resultsState as MusicSearchResultsUiState.Results
            assertEquals(listOf("Right Artist"), finalState.artists.map { it.name })
        }
}
