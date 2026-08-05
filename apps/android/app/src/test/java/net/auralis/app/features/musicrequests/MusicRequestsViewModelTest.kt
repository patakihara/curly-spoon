package net.auralis.app.features.musicrequests

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.model.MusicCandidate
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
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
