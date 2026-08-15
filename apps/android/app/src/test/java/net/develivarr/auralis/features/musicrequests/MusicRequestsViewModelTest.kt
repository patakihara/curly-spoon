package net.develivarr.auralis.features.musicrequests

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.develivarr.auralis.data.model.MusicCandidate
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

/**
 * Exercises [MusicRequestsViewModel] against a real [ApiClient] over [MockWebServer] — same
 * pattern `RequestsViewModelTest` (the book-request equivalent) uses, but with
 * `ioDispatcher = testDispatcher` passed explicitly, per `docs/HANDOVER.md`'s "Android CI:
 * read this before touching an Android test": that makes every call synchronous under
 * [UnconfinedTestDispatcher], so assertions read `.value`/`.first { }` immediately after the
 * triggering call rather than needing a real-time await.
 */
class MusicRequestsViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient

    @Before
    fun setUp() {
        val testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient =
            ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { mockWebServer.url("/").toString() }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun sampleCandidate(guid: String = "c1") =
        MusicCandidate(
            guid = guid,
            providerId = "slskd",
            sourceName = "peer-a",
            title = "Sample Track",
            artist = "Sample Artist",
            album = "Sample Album",
            sizeBytes = 1048576,
            bitrateKbps = 320,
            format = "mp3",
        )

    @Test
    fun `submitSearch with one candidate and no errors produces Results with that candidate`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"candidates":[{"guid":"c1","providerId":"slskd","sourceName":"peer-a",
                      "title":"Sample Track","artist":"Sample Artist","album":"Sample Album",
                      "sizeBytes":1048576,"bitrateKbps":320,"format":"mp3"}],"errors":[]}
                    """.trimIndent(),
                ),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Sample Track")

            viewModel.submitSearch()
            val state =
                viewModel.uiState.first {
                    it.searchState !is MusicSearchUiState.Loading && it.searchState !is MusicSearchUiState.Idle
                }

            assertTrue(state.searchState is MusicSearchUiState.Results)
            val results = state.searchState as MusicSearchUiState.Results
            assertEquals(1, results.candidates.size)
            assertEquals("c1", results.candidates[0].guid)
            assertEquals(emptyList<Any>(), results.errors)
        }

    @Test
    fun `submitSearch with zero candidates and one error produces Results with that error`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"candidates":[],"errors":[{"providerId":"slskd","kind":"upstream_unreachable","message":"slskd timed out"}]}
                    """.trimIndent(),
                ),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Missing Track")

            viewModel.submitSearch()
            val state =
                viewModel.uiState.first {
                    it.searchState !is MusicSearchUiState.Loading && it.searchState !is MusicSearchUiState.Idle
                }

            assertTrue(state.searchState is MusicSearchUiState.Results)
            val results = state.searchState as MusicSearchUiState.Results
            assertEquals(emptyList<Any>(), results.candidates)
            assertEquals(1, results.errors.size)
            assertEquals("slskd timed out", results.errors[0].message)
        }

    @Test
    fun `submitSearch against a 500 response produces Failed with the server's message`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"provider_error","message":"slskd is unreachable"}}"""),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Sample Track")

            viewModel.submitSearch()
            val state =
                viewModel.uiState.first {
                    it.searchState !is MusicSearchUiState.Loading && it.searchState !is MusicSearchUiState.Idle
                }

            assertTrue(state.searchState is MusicSearchUiState.Failed)
            assertEquals("slskd is unreachable", (state.searchState as MusicSearchUiState.Failed).message)
        }

    /**
     * Ported from `RequestsViewModelTest`'s identical test (the book-request equivalent,
     * `features/requests/RequestsViewModelTest.kt`) — see `docs/HANDOVER.md`'s "Android CI"
     * section for the two traps this file's other tests exist to avoid, neither of which
     * applies the same way here:
     *
     * - This test builds its own [ApiClient] with the **default, real [Dispatchers.IO]**
     *   instead of the shared [testDispatcher] this class's `setUp` injects for every other
     *   test. That shared dispatcher is an [UnconfinedTestDispatcher] used as *both* the
     *   `Main` dispatcher and `ApiClient`'s `ioDispatcher` — under that combination,
     *   `withContext(ioDispatcher)` never actually dispatches (same instance, so it runs
     *   inline), so the "slow" network call would block `submitSearch()` itself on the calling
     *   thread for its whole delay instead of running concurrently with a second call. The
     *   book original hits the same requirement for the same reason (its own `apiClient`
     *   never overrides `ioDispatcher` either) — this deviates from this file's usual
     *   synchronous-call pattern deliberately, to get a *real* in-flight race.
     * - Response ordering is forced, not hoped-for: `mockWebServer.takeRequest()` blocks until
     *   the "Slow" request has actually reached the server before the "Fast" one fires, which
     *   guarantees the two requests arrive (and are matched to the two enqueued responses, in
     *   default arrival-order dispatch) in that order — no keyed `Dispatcher` is needed here.
     *   The book original relies on the exact same synchronization and is sound for the same
     *   reason, not passing by luck.
     *
     * Deleting `searchJob?.cancel()` in `MusicRequestsViewModel.submitSearch` would fail this
     * test: without it, the still-running "Slow" job's response arrives during the
     * `Thread.sleep(500)` below and unconditionally overwrites `_uiState.value` with the
     * slow candidate — `finalState`'s `candidates` would then contain `"slow-guid"` instead of
     * being empty.
     */
    @Test
    fun `a slower search cancelled by a faster later one does not overwrite the later result`() =
        runTest {
            val keyValueStore = FakeKeyValueStore()
            val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
            val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
            val realIoApiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }

            mockWebServer.enqueue(
                MockResponse()
                    .setBodyDelay(300, TimeUnit.MILLISECONDS)
                    .setBody(
                        """
                        {"candidates":[{"guid":"slow-guid","providerId":"slskd","sourceName":"peer-a",
                          "title":"Slow Result","artist":"Slow Artist","album":"Slow Album",
                          "sizeBytes":1024,"bitrateKbps":128,"format":"mp3"}],"errors":[]}
                        """.trimIndent(),
                    ),
            )
            mockWebServer.enqueue(MockResponse().setBody("""{"candidates":[],"errors":[]}"""))
            val viewModel = MusicRequestsViewModel(realIoApiClient)

            viewModel.onSearchTermChange("Slow")
            viewModel.submitSearch()
            // Wait for the slow request to actually reach the server before firing the second
            // one, so the two requests are guaranteed to arrive (and be matched to the two
            // enqueued responses) in this order.
            mockWebServer.takeRequest()

            viewModel.onSearchTermChange("Fast")
            viewModel.submitSearch()
            val fastState =
                viewModel.uiState.first { it.submittedTerm == "Fast" && it.searchState is MusicSearchUiState.Results }
            assertEquals(emptyList<Any>(), (fastState.searchState as MusicSearchUiState.Results).candidates)

            // Give the cancelled "Slow" search's response (still in flight, delayed) time to
            // arrive. If submitSearch didn't cancel the earlier job, this would land after and
            // silently overwrite "Fast"'s already-rendered empty result with "Slow"'s candidate.
            Thread.sleep(500)

            val finalState = viewModel.uiState.value
            assertEquals("Fast", finalState.submittedTerm)
            assertTrue(finalState.searchState is MusicSearchUiState.Results)
            assertEquals(emptyList<Any>(), (finalState.searchState as MusicSearchUiState.Results).candidates)
        }

    @Test
    fun `requestCandidate on a 201 response sets that candidate's state to Requested`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setResponseCode(201).setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"Sample Track","status":"pending",
                      "candidate":{"guid":"c1","providerId":"slskd","sourceName":"peer-a","title":"Sample Track"},
                      "progress":0,"createdAt":0,"updatedAt":0}}
                    """.trimIndent(),
                ),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            val candidate = sampleCandidate(guid = "c1")

            viewModel.requestCandidate(candidate)
            val state = viewModel.uiState.first { it.candidateRequestStates["c1"] is CandidateRequestState.Requested }

            assertEquals(CandidateRequestState.Requested, state.candidateRequestStates["c1"])
        }

    @Test
    fun `requestCandidate on a failing response sets Failed for that guid only`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(409)
                    .setBody("""{"error":{"code":"conflict","message":"already requested"}}"""),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            val candidate = sampleCandidate(guid = "c1")

            viewModel.requestCandidate(candidate)
            val state = viewModel.uiState.first { it.candidateRequestStates["c1"] is CandidateRequestState.Failed }

            assertEquals(
                "already requested",
                (state.candidateRequestStates["c1"] as CandidateRequestState.Failed).message,
            )
            // Only this candidate's state is affected — no other guid ever appears in the map.
            assertEquals(setOf("c1"), state.candidateRequestStates.keys)
        }

    @Test
    fun `loadRequests with two requests out of order produces Loaded sorted newest-first`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"Older","status":"pending","progress":0,"createdAt":100,"updatedAt":100},
                      {"id":"req2","userId":"u1","title":"Newer","status":"pending","progress":0,"createdAt":200,"updatedAt":200}
                    ]}
                    """.trimIndent(),
                ),
            )
            val viewModel = MusicRequestsViewModel(apiClient)

            viewModel.loadRequests()
            val state = viewModel.uiState.first { it.requestListState is MusicRequestListUiState.Loaded }

            val loaded = state.requestListState as MusicRequestListUiState.Loaded
            assertEquals(listOf("req2", "req1"), loaded.requests.map { it.id })
        }

    @Test
    fun `loadRequests against a 500 response produces Failed with the server's message`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"database is unavailable"}}"""),
            )
            val viewModel = MusicRequestsViewModel(apiClient)

            viewModel.loadRequests()
            val state = viewModel.uiState.first { it.requestListState is MusicRequestListUiState.Failed }

            assertEquals(
                "database is unavailable",
                (state.requestListState as MusicRequestListUiState.Failed).message,
            )
        }

    @Test
    fun `retryRequest on a 200 response updates that request while leaving another untouched`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"First","status":"failed","progress":0,"createdAt":200,"updatedAt":200},
                      {"id":"req2","userId":"u1","title":"Second","status":"downloading","progress":0.5,"createdAt":100,"updatedAt":100}
                    ]}
                    """.trimIndent(),
                ),
            )
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"First","status":"searching",
                      "progress":0,"createdAt":200,"updatedAt":300}}
                    """.trimIndent(),
                ),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is MusicRequestListUiState.Loaded }

            viewModel.retryRequest("req1")
            val state = viewModel.uiState.first { it.requestActionStates["req1"] is MusicRequestActionState.Idle }

            val loaded = state.requestListState as MusicRequestListUiState.Loaded
            val updated = loaded.requests.first { it.id == "req1" }
            assertEquals("searching", updated.status)
            val untouched = loaded.requests.first { it.id == "req2" }
            assertEquals("downloading", untouched.status)
            assertEquals(0.5, untouched.progress, 0.0)
        }

    @Test
    fun `retryRequest on a failing response sets Failed action state and leaves the list unchanged`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"requests":[{"id":"req1","userId":"u1","title":"First","status":"failed","progress":0,"createdAt":100,"updatedAt":100}]}""",
                ),
            )
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(502)
                    .setBody("""{"error":{"code":"provider_error","message":"slskd is unreachable"}}"""),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is MusicRequestListUiState.Loaded }

            viewModel.retryRequest("req1")
            val state = viewModel.uiState.first { it.requestActionStates["req1"] is MusicRequestActionState.Failed }

            assertEquals(
                "slskd is unreachable",
                (state.requestActionStates["req1"] as MusicRequestActionState.Failed).message,
            )
            val loaded = state.requestListState as MusicRequestListUiState.Loaded
            assertEquals("failed", loaded.requests.first { it.id == "req1" }.status)
        }

    @Test
    fun `deleteRequest on a 204 response removes that request, leaving others untouched`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"First","status":"pending","progress":0,"createdAt":200,"updatedAt":200},
                      {"id":"req2","userId":"u1","title":"Second","status":"pending","progress":0,"createdAt":100,"updatedAt":100}
                    ]}
                    """.trimIndent(),
                ),
            )
            mockWebServer.enqueue(MockResponse().setResponseCode(204))
            val viewModel = MusicRequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is MusicRequestListUiState.Loaded }

            viewModel.deleteRequest("req1")
            val state =
                viewModel.uiState.first {
                    (it.requestListState as? MusicRequestListUiState.Loaded)?.requests?.none { r -> r.id == "req1" } == true
                }

            val loaded = state.requestListState as MusicRequestListUiState.Loaded
            assertEquals(listOf("req2"), loaded.requests.map { it.id })
            // The action-state entry is dropped entirely, not left as some terminal value.
            assertNull(state.requestActionStates["req1"])
        }

    @Test
    fun `deleteRequest on a failing response sets Failed action state and the request remains`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"requests":[{"id":"req1","userId":"u1","title":"First","status":"pending","progress":0,"createdAt":100,"updatedAt":100}]}""",
                ),
            )
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"request \"req1\" not found"}}"""),
            )
            val viewModel = MusicRequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is MusicRequestListUiState.Loaded }

            viewModel.deleteRequest("req1")
            val state = viewModel.uiState.first { it.requestActionStates["req1"] is MusicRequestActionState.Failed }

            val loaded = state.requestListState as MusicRequestListUiState.Loaded
            assertEquals(listOf("req1"), loaded.requests.map { it.id })
        }
}
