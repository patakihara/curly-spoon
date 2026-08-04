package net.auralis.app.features.home

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.downloads.DownloadRepository
import net.auralis.app.data.downloads.FakeDownloadEngine
import net.auralis.app.data.downloads.UnavailableDownloadEngine
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class HomeViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var keyValueStore: FakeKeyValueStore
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var apiClient: ApiClient
    private lateinit var downloadRepository: DownloadRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        mockWebServer = MockWebServer()
        mockWebServer.start()
        keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
        // These tests exercise only the shelf-loading half of HomeViewModel; the download half
        // has its own coverage below. UnavailableDownloadEngine is the same documented no-op
        // stand-in AppContainer used before Wave F2a, sufficient here since nothing in this file
        // calls startDownload().
        downloadRepository = DownloadRepository(apiClient, keyValueStore, UnavailableDownloadEngine())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    @Test
    fun `no base URL saved produces an error state`() =
        runTest {
            val viewModel = HomeViewModel(apiClient, serverConfigRepository, downloadRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Error)
            assertEquals("No Auralis server configured", (state as HomeUiState.Error).message)
        }

    @Test
    fun `no libraries produces an empty loaded state`() =
        runTest {
            serverConfigRepository.setBaseUrl(mockWebServer.url("/").toString())
            mockWebServer.enqueue(MockResponse().setBody("""{"libraries":[]}"""))

            val viewModel = HomeViewModel(apiClient, serverConfigRepository, downloadRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Loaded)
            assertEquals(emptyList<ShelfUi>(), (state as HomeUiState.Loaded).shelves)
        }

    @Test
    fun `a library's home shelves are mapped, with cover URLs built from the base URL`() =
        runTest {
            val baseUrl = mockWebServer.url("/").toString()
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"libraries":[{"id":"lib1","name":"Audiobooks","mediaType":"book","icon":null}]}""",
                ),
            )
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"shelves":[{"id":"shelf1","label":"Continue Listening","type":"book","items":[
                      {"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Sample Book"},"progress":null}
                    ]}]}
                    """.trimIndent(),
                ),
            )

            val viewModel = HomeViewModel(apiClient, serverConfigRepository, downloadRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Loaded)
            val shelves = (state as HomeUiState.Loaded).shelves
            assertEquals(1, shelves.size)
            assertEquals("shelf1", shelves[0].id)
            assertEquals("Continue Listening", shelves[0].label)
            assertEquals(1, shelves[0].items.size)
            val item = shelves[0].items[0]
            assertEquals("item1", item.id)
            assertEquals("Sample Book", item.title)
            assertEquals(
                "${baseUrl.trimEnd('/')}/api/v1/media/item1/cover?width=200",
                item.coverUrl,
            )
        }

    @Test
    fun `a 401 from GET libraries produces an error state with the server's message`() =
        runTest {
            serverConfigRepository.setBaseUrl(mockWebServer.url("/").toString())
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"not_authenticated","message":"Not signed in"}}"""),
            )

            val viewModel = HomeViewModel(apiClient, serverConfigRepository, downloadRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Error)
            assertEquals("Not signed in", (state as HomeUiState.Error).message)
        }

    /** `POST /items/{id}/play` response with one resolvable track — enough for
     * `DownloadRepository.enqueue` to succeed. Mirrors `DownloadRepositoryTest`'s own helper. */
    private fun enqueuePlayItem(audioTracksJson: String) {
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"session":{"id":"s1","libraryItemId":"item1","mediaType":"book",
                 "displayTitle":"Sample","duration":100.0,"currentTime":0.0,
                 "audioTracks":$audioTracksJson,"chapters":[]}}
                """.trimIndent(),
            ),
        )
    }

    @Test
    fun `startDownload with a resolvable track sets ENQUEUED and emits a track-count message`() =
        runTest {
            val enqueueRepository = DownloadRepository(apiClient, keyValueStore, FakeDownloadEngine())
            val viewModel = HomeViewModel(apiClient, serverConfigRepository, enqueueRepository)
            enqueuePlayItem("""[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/item1/file/f1"}]""")

            val eventDeferred = async { viewModel.downloadEvents.first() }
            viewModel.startDownload("item1")
            val states = viewModel.downloadStates.first { it["item1"] == DownloadActionState.ENQUEUED }
            val event = eventDeferred.await()

            assertEquals(DownloadActionState.ENQUEUED, states["item1"])
            assertEquals("item1", event.itemId)
            assertEquals("Downloading 1 track…", event.message)
        }

    @Test
    fun `startDownload on an item with no audio tracks sets NO_PLAYABLE_TRACK`() =
        runTest {
            val enqueueRepository = DownloadRepository(apiClient, keyValueStore, FakeDownloadEngine())
            val viewModel = HomeViewModel(apiClient, serverConfigRepository, enqueueRepository)
            enqueuePlayItem("[]")

            val eventDeferred = async { viewModel.downloadEvents.first() }
            viewModel.startDownload("item1")
            val states = viewModel.downloadStates.first { it["item1"] == DownloadActionState.NO_PLAYABLE_TRACK }
            val event = eventDeferred.await()

            assertEquals(DownloadActionState.NO_PLAYABLE_TRACK, states["item1"])
            assertEquals("This item has no track that can be downloaded.", event.message)
        }

    @Test
    fun `startDownload against a failing API sets FAILED with the error code in the message`() =
        runTest {
            val enqueueRepository = DownloadRepository(apiClient, keyValueStore, FakeDownloadEngine())
            val viewModel = HomeViewModel(apiClient, serverConfigRepository, enqueueRepository)
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Boom"}}"""),
            )

            val eventDeferred = async { viewModel.downloadEvents.first() }
            viewModel.startDownload("item1")
            val states = viewModel.downloadStates.first { it["item1"] == DownloadActionState.FAILED }
            val event = eventDeferred.await()

            assertEquals(DownloadActionState.FAILED, states["item1"])
            assertEquals("Download failed (internal_error).", event.message)
        }

    @Test
    fun `startDownload against an unavailable engine sets UNAVAILABLE without calling the API`() =
        runTest {
            // `downloadRepository` from setUp wraps UnavailableDownloadEngine — no MockResponse
            // is queued here, so if this ever called the API the test would hang on the real
            // MockWebServer connection rather than fail cleanly, which is itself evidence the
            // short-circuit didn't happen.
            val viewModel = HomeViewModel(apiClient, serverConfigRepository, downloadRepository)

            // CoroutineStart.UNDISPATCHED (not the default async{} used by the other
            // startDownload tests in this file): the unavailable-engine path never suspends —
            // downloadRepository.enqueue() returns DownloadEnqueueResult.Unavailable directly, so
            // startDownload()'s whole viewModelScope.launch body (dispatched via
            // Dispatchers.Main.immediate = UnconfinedTestDispatcher from setUp) runs eagerly and
            // completes, including the downloadEvents.emit() below, before this test's own
            // runTest coroutine — which runs on runTest's ambient StandardTestDispatcher, not
            // Unconfined — would otherwise get a chance to actually start a plain async{} block
            // (merely queued, not run, until something suspends). downloadEvents has
            // replay = 0, so a value emitted before this collector has actually subscribed is
            // not buffered for it — extraBufferCapacity only lets emit() return without
            // suspending, it is not a replay mechanism for a later subscriber — and this
            // collector would then wait forever for an event that already came and went, which
            // is exactly the UncompletedCoroutinesError this produced. UNDISPATCHED guarantees
            // the subscription happens inline, before this line returns, regardless of the
            // ambient dispatcher, closing the race. The other three startDownload tests in this
            // file don't need this: their DownloadRepository.enqueue() suspends on real
            // (fake-server) network I/O, so startDownload() returns before the state/event
            // update happens, and this test's own next suspension (downloadStates.first{}
            // below, genuinely waiting on a not-yet-reached state) gives the scheduler a chance
            // to run the queued async{} before the real completion later emits.
            val eventDeferred = async(start = CoroutineStart.UNDISPATCHED) { viewModel.downloadEvents.first() }
            viewModel.startDownload("item1")
            val states = viewModel.downloadStates.first { it["item1"] == DownloadActionState.UNAVAILABLE }
            val event = eventDeferred.await()

            assertEquals(DownloadActionState.UNAVAILABLE, states["item1"])
            assertEquals("Downloads aren't available on this build.", event.message)
            assertEquals(0, mockWebServer.requestCount)
        }
}
