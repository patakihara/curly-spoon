package net.develivarr.auralis.features.requests

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.develivarr.auralis.data.model.Release
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class RequestsViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    @Test
    fun `submitSearch with one release and no errors produces Results with that release`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"releases":[{"guid":"g1","indexerId":"idx1","sourceName":"AudiobookBay",
                      "title":"Sample Book","sizeBytes":1048576,"seeders":5,"leechers":1,
                      "categories":["audiobook"]}],"errors":[]}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Sample Book")

            viewModel.submitSearch()
            val state = viewModel.uiState.first { it.searchState !is SearchUiState.Loading && it.searchState !is SearchUiState.Idle }

            assertTrue(state.searchState is SearchUiState.Results)
            val results = state.searchState as SearchUiState.Results
            assertEquals(1, results.releases.size)
            assertEquals("g1", results.releases[0].guid)
            assertEquals(emptyList<Any>(), results.errors)
        }

    @Test
    fun `submitSearch with zero releases and one error produces Results and offers request anyway`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"releases":[],"errors":[{"indexerId":"idx1","kind":"timeout","message":"AudiobookBay timed out"}]}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Missing Book")

            viewModel.submitSearch()
            val state = viewModel.uiState.first { it.searchState !is SearchUiState.Loading && it.searchState !is SearchUiState.Idle }

            assertTrue(state.searchState is SearchUiState.Results)
            val results = state.searchState as SearchUiState.Results
            assertEquals(emptyList<Any>(), results.releases)
            assertEquals(1, results.errors.size)
            assertEquals("AudiobookBay timed out", results.errors[0].message)
            assertTrue(state.offerRequestAnyway)
        }

    @Test
    fun `submitSearch against a 500 response produces Failed with the server's message`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"indexer_error","message":"Prowlarr is unreachable"}}"""),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Sample Book")

            viewModel.submitSearch()
            val state = viewModel.uiState.first { it.searchState !is SearchUiState.Loading && it.searchState !is SearchUiState.Idle }

            assertTrue(state.searchState is SearchUiState.Failed)
            assertEquals("Prowlarr is unreachable", (state.searchState as SearchUiState.Failed).message)
            // A hard search failure is exactly when "request anyway" matters most — an indexer
            // or BFF outage, not just "nothing matched". See `offerRequestAnyway`'s doc comment.
            assertTrue(state.offerRequestAnyway)
        }

    @Test
    fun `offerRequestAnyway is false for a blank submitted term even with zero releases`() {
        val state =
            RequestsUiState(
                submittedTerm = "",
                searchState = SearchUiState.Results(releases = emptyList(), errors = emptyList()),
            )

        assertFalse(state.offerRequestAnyway)
    }

    @Test
    fun `a slower search cancelled by a faster later one does not overwrite the later result`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setBodyDelay(300, TimeUnit.MILLISECONDS)
                    .setBody(
                        """
                        {"releases":[{"guid":"slow-guid","indexerId":"idx1","sourceName":"AudiobookBay",
                          "title":"Slow Result","sizeBytes":1024,"seeders":1,"leechers":0,
                          "categories":["audiobook"]}],"errors":[]}
                        """.trimIndent(),
                    ),
            )
            mockWebServer.enqueue(MockResponse().setBody("""{"releases":[],"errors":[]}"""))
            val viewModel = RequestsViewModel(apiClient)

            viewModel.onSearchTermChange("Slow")
            viewModel.submitSearch()
            // Wait for the slow request to actually reach the server before firing the second
            // one, so the two requests are guaranteed to arrive (and be matched to the two
            // enqueued responses) in this order.
            mockWebServer.takeRequest()

            viewModel.onSearchTermChange("Fast")
            viewModel.submitSearch()
            val fastState =
                viewModel.uiState.first { it.submittedTerm == "Fast" && it.searchState is SearchUiState.Results }
            assertEquals(emptyList<Any>(), (fastState.searchState as SearchUiState.Results).releases)

            // Give the cancelled "Slow" search's response (still in flight, delayed) time to
            // arrive. If submitSearch didn't cancel the earlier job, this would land after and
            // silently overwrite "Fast"'s already-rendered empty result with "Slow"'s release.
            Thread.sleep(500)

            val finalState = viewModel.uiState.value
            assertEquals("Fast", finalState.submittedTerm)
            assertTrue(finalState.searchState is SearchUiState.Results)
            assertEquals(emptyList<Any>(), (finalState.searchState as SearchUiState.Results).releases)
        }

    @Test
    fun `requestRelease on a 200 response sets that release's state to Requested`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"Sample Book","status":"pending",
                      "progress":0,"createdAt":0,"updatedAt":0}}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            val release = sampleRelease(guid = "g1")

            viewModel.requestRelease(release)
            val state = viewModel.uiState.first { it.releaseRequestStates["g1"] is ReleaseRequestState.Requested }

            assertEquals(ReleaseRequestState.Requested, state.releaseRequestStates["g1"])
        }

    @Test
    fun `requestRelease on a failing response sets Failed for that guid only`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Could not create this request."}}"""),
            )
            val viewModel = RequestsViewModel(apiClient)
            // A pre-existing state for a different release must survive untouched — awaited to
            // completion before the second request so the two calls don't race each other.
            viewModel.requestRelease(sampleRelease(guid = "other"))
            viewModel.uiState.first { it.releaseRequestStates["other"] is ReleaseRequestState.Failed }
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Could not create this request."}}"""),
            )
            val release = sampleRelease(guid = "g1")

            viewModel.requestRelease(release)
            val state = viewModel.uiState.first { it.releaseRequestStates["g1"] is ReleaseRequestState.Failed }

            assertEquals(
                "Could not create this request.",
                (state.releaseRequestStates["g1"] as ReleaseRequestState.Failed).message,
            )
            assertTrue(state.releaseRequestStates["other"] is ReleaseRequestState.Failed)
        }

    @Test
    fun `requestRelease sends the submitted author, not a live edit, and the release attached`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"releases":[{"guid":"g1","indexerId":"idx1","sourceName":"AudiobookBay",
                      "title":"Sample Book","sizeBytes":1024,"seeders":5,"leechers":1,
                      "categories":["audiobook"]}],"errors":[]}
                    """.trimIndent(),
                ),
            )
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"Sample Book","status":"pending",
                      "progress":0,"createdAt":0,"updatedAt":0}}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Sample Book")
            viewModel.onSearchAuthorChange("Original Author")
            viewModel.submitSearch()
            viewModel.uiState.first { it.searchState is SearchUiState.Results }
            mockWebServer.takeRequest() // the search request, not the one under test

            // Edited after submit — requestRelease must ignore this and use submittedAuthor.
            viewModel.onSearchAuthorChange("Live Author")

            viewModel.requestRelease(sampleRelease(guid = "g1"))
            viewModel.uiState.first { it.releaseRequestStates["g1"] is ReleaseRequestState.Requested }

            val body = mockWebServer.takeRequest().body.readUtf8()
            assertTrue(body.contains("\"author\":\"Original Author\""))
            assertFalse(body.contains("Live Author"))
            assertTrue(body.contains("\"release\":{"))
            assertTrue(body.contains("\"guid\":\"g1\""))
        }

    @Test
    fun `requestAnyway sends the submitted title and author with no release attached`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"releases":[],"errors":[]}"""))
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"Missing Book","status":"pending",
                      "progress":0,"createdAt":0,"updatedAt":0}}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Missing Book")
            viewModel.onSearchAuthorChange("Some Author")
            viewModel.submitSearch()
            viewModel.uiState.first { it.searchState is SearchUiState.Results }
            mockWebServer.takeRequest() // the search request, not the one under test

            viewModel.requestAnyway()
            viewModel.uiState.first { it.titleRequestState is TitleRequestState.Requested }

            val body = mockWebServer.takeRequest().body.readUtf8()
            assertTrue(body.contains("\"title\":\"Missing Book\""))
            assertTrue(body.contains("\"author\":\"Some Author\""))
            // `CreateRequestBody.release` defaults to null, and `auralisJson` doesn't set
            // `encodeDefaults`, so a null release is omitted entirely rather than serialized as
            // `"release":null`. That matters: the server's `createRequestBodySchema` declares
            // `release: releaseSchema.optional()` (accepts the key being absent) with no
            // `.nullable()`, so an explicit `"release":null` would actually fail zod validation
            // against the real BFF. Omission is the correct wire behaviour, not a gap to paper
            // over.
            assertFalse(body.contains("\"release\""))
        }

    @Test
    fun `requestAnyway success sets titleRequestState to Requested`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"releases":[],"errors":[]}"""))
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"Missing Book","status":"pending",
                      "progress":0,"createdAt":0,"updatedAt":0}}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Missing Book")
            viewModel.submitSearch()
            // Awaited before requestAnyway so the two calls' HTTP requests can't reach
            // MockWebServer's FIFO queue out of the order their responses were enqueued in.
            viewModel.uiState.first { it.searchState is SearchUiState.Results }

            viewModel.requestAnyway()
            val state = viewModel.uiState.first { it.titleRequestState is TitleRequestState.Requested }

            assertEquals(TitleRequestState.Requested, state.titleRequestState)
        }

    @Test
    fun `requestAnyway failure sets titleRequestState to Failed`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"releases":[],"errors":[]}"""))
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Could not create this request."}}"""),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Missing Book")
            viewModel.submitSearch()
            viewModel.uiState.first { it.searchState is SearchUiState.Results }

            viewModel.requestAnyway()
            val state = viewModel.uiState.first { it.titleRequestState is TitleRequestState.Failed }

            assertEquals(
                "Could not create this request.",
                (state.titleRequestState as TitleRequestState.Failed).message,
            )
        }

    @Test
    fun `submitSearch resets a previously Requested titleRequestState to Idle`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"releases":[],"errors":[]}"""),
            )
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"Missing Book","status":"pending",
                      "progress":0,"createdAt":0,"updatedAt":0}}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.onSearchTermChange("Missing Book")
            viewModel.submitSearch()
            viewModel.uiState.first { it.searchState is SearchUiState.Results }
            viewModel.requestAnyway()
            viewModel.uiState.first { it.titleRequestState is TitleRequestState.Requested }

            mockWebServer.enqueue(
                MockResponse().setBody("""{"releases":[],"errors":[]}"""),
            )
            viewModel.onSearchTermChange("Missing Book Again")
            viewModel.submitSearch()

            // titleRequestState resets synchronously, as part of submitSearch's own state
            // update — this assertion doesn't need the network call below to have completed.
            assertEquals(TitleRequestState.Idle, viewModel.uiState.value.titleRequestState)

            // Drain the search launched above before the test ends. Left un-awaited, its
            // viewModelScope coroutine is still suspended in withContext(Dispatchers.IO) —
            // real background-thread I/O against MockWebServer — when this test method
            // returns. @After then calls Dispatchers.resetMain() and mockWebServer.shutdown()
            // while that coroutine is still in flight; when it eventually resumes, dispatching
            // back onto the now-reset Main dispatcher throws, uncaught, in a SupervisorJob-
            // rooted scope with no handler — and kotlinx-coroutines-test attributes that to
            // whichever test's runTest starts next, as UncaughtExceptionsBeforeTest. (Confirmed
            // by JUnit4's MethodSorters.DEFAULT ordering: this test is the one that runs
            // immediately before `requestRelease sends the submitted author...`, which is
            // exactly the test that started failing with that exception.)
            viewModel.uiState.first { it.searchState is SearchUiState.Results }
        }

    @Test
    fun `loadRequests with two requests out of order produces Loaded sorted newest-first`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"Older Book","status":"pending","progress":0,"createdAt":100,"updatedAt":100},
                      {"id":"req2","userId":"u1","title":"Newer Book","status":"pending","progress":0,"createdAt":200,"updatedAt":200}
                    ]}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)

            viewModel.loadRequests()
            val state = viewModel.uiState.first { it.requestListState is RequestListUiState.Loaded }

            val loaded = state.requestListState as RequestListUiState.Loaded
            assertEquals(2, loaded.requests.size)
            assertEquals("req2", loaded.requests[0].id)
            assertEquals("req1", loaded.requests[1].id)
        }

    @Test
    fun `loadRequests against a 500 response produces Failed with the server's message`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Could not load requests."}}"""),
            )
            val viewModel = RequestsViewModel(apiClient)

            viewModel.loadRequests()
            val state = viewModel.uiState.first { it.requestListState is RequestListUiState.Failed }

            assertEquals(
                "Could not load requests.",
                (state.requestListState as RequestListUiState.Failed).message,
            )
        }

    @Test
    fun `retryRequest on a 200 response updates that request while leaving another untouched`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"Failed Book","status":"failed","statusDetail":"Download failed","progress":0,"createdAt":100,"updatedAt":100},
                      {"id":"req2","userId":"u1","title":"Other Book","status":"pending","progress":0,"createdAt":200,"updatedAt":200}
                    ]}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is RequestListUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"request":{"id":"req1","userId":"u1","title":"Failed Book","status":"searching","progress":0,"createdAt":100,"updatedAt":150}}
                    """.trimIndent(),
                ),
            )

            viewModel.retryRequest("req1")
            val state =
                viewModel.uiState.first {
                    val loaded = it.requestListState as? RequestListUiState.Loaded
                    loaded?.requests?.find { r -> r.id == "req1" }?.status == "searching"
                }

            val loaded = state.requestListState as RequestListUiState.Loaded
            assertEquals("searching", loaded.requests.find { it.id == "req1" }?.status)
            assertEquals("pending", loaded.requests.find { it.id == "req2" }?.status)
            assertEquals(RequestActionState.Idle, state.requestActionStates["req1"])
        }

    @Test
    fun `retryRequest on a failing response sets Failed action state and leaves the list unchanged`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"Failed Book","status":"failed","progress":0,"createdAt":100,"updatedAt":100}
                    ]}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is RequestListUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Could not retry this request."}}"""),
            )

            viewModel.retryRequest("req1")
            val state = viewModel.uiState.first { it.requestActionStates["req1"] is RequestActionState.Failed }

            assertEquals(
                "Could not retry this request.",
                (state.requestActionStates["req1"] as RequestActionState.Failed).message,
            )
            val loaded = state.requestListState as RequestListUiState.Loaded
            assertEquals("failed", loaded.requests.find { it.id == "req1" }?.status)
        }

    @Test
    fun `deleteRequest on a 204 response removes that request, leaving others untouched`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"Book One","status":"completed","progress":1,"createdAt":100,"updatedAt":100},
                      {"id":"req2","userId":"u1","title":"Book Two","status":"pending","progress":0,"createdAt":200,"updatedAt":200}
                    ]}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is RequestListUiState.Loaded }

            mockWebServer.enqueue(MockResponse().setResponseCode(204))

            viewModel.deleteRequest("req1")
            val state =
                viewModel.uiState.first {
                    (it.requestListState as? RequestListUiState.Loaded)?.requests?.none { r -> r.id == "req1" } == true
                }

            val loaded = state.requestListState as RequestListUiState.Loaded
            assertEquals(1, loaded.requests.size)
            assertEquals("req2", loaded.requests[0].id)
            assertFalse(state.requestActionStates.containsKey("req1"))
        }

    @Test
    fun `deleteRequest on a failing response sets Failed action state and the request remains`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"requests":[
                      {"id":"req1","userId":"u1","title":"Book One","status":"pending","progress":0,"createdAt":100,"updatedAt":100}
                    ]}
                    """.trimIndent(),
                ),
            )
            val viewModel = RequestsViewModel(apiClient)
            viewModel.loadRequests()
            viewModel.uiState.first { it.requestListState is RequestListUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Could not delete this request."}}"""),
            )

            viewModel.deleteRequest("req1")
            val state = viewModel.uiState.first { it.requestActionStates["req1"] is RequestActionState.Failed }

            assertEquals(
                "Could not delete this request.",
                (state.requestActionStates["req1"] as RequestActionState.Failed).message,
            )
            val loaded = state.requestListState as RequestListUiState.Loaded
            assertEquals(1, loaded.requests.size)
            assertEquals("req1", loaded.requests[0].id)
        }

    private fun sampleRelease(guid: String) =
        Release(
            guid = guid,
            indexerId = "idx1",
            sourceName = "AudiobookBay",
            title = "Sample Book",
            sizeBytes = 1024,
            seeders = 5,
            leechers = 1,
            categories = listOf("audiobook"),
        )
}
