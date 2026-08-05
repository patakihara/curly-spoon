package net.auralis.app.features.downloads

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.downloads.DownloadRepository
import net.auralis.app.data.downloads.DownloadState
import net.auralis.app.data.downloads.FakeDownloadEngine
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
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
 * Covers [DownloadsViewModel.refresh] and [DownloadsViewModel.cancel] — the framework-free,
 * MockWebServer-testable half of this class. [DownloadsViewModel.startPolling] itself is not
 * covered here; see that function's own doc comment for why.
 */
class DownloadsViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var keyValueStore: FakeKeyValueStore
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var apiClient: ApiClient
    private lateinit var downloadEngine: FakeDownloadEngine
    private lateinit var downloadRepository: DownloadRepository
    private lateinit var viewModel: DownloadsViewModel
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        // Shared with ApiClient below, not just Dispatchers.Main — see ApiClient.ioDispatcher's
        // own doc comment for why a fire-and-forget request otherwise escapes onto the real
        // Dispatchers.IO pool, invisible to runTest and able to leak past this test's @After.
        val testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()
        keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { baseUrl }
        downloadEngine = FakeDownloadEngine()
        downloadRepository = DownloadRepository(apiClient, keyValueStore, downloadEngine)
        viewModel = DownloadsViewModel(apiClient, serverConfigRepository, downloadRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun enqueue(body: String) {
        mockWebServer.enqueue(MockResponse().setBody(body))
    }

    /** `POST /items/{id}/play` response with one resolvable track. */
    private fun enqueuePlayItem(itemId: String) {
        enqueue(
            """
            {"session":{"id":"s1","libraryItemId":"$itemId","mediaType":"book",
             "displayTitle":"Sample","duration":100.0,"currentTime":0.0,
             "audioTracks":[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}],
             "chapters":[]}}
            """.trimIndent(),
        )
    }

    private fun enqueueLibraryItem(
        itemId: String,
        title: String,
    ) {
        enqueue(
            """{"item":{"id":"$itemId","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"$title"},"progress":null}}""",
        )
    }

    /** Marks [itemId] kept-offline via a real `enqueue()` round trip — consumes one queued
     * `POST /items/{id}/play` response. */
    private suspend fun keepOffline(itemId: String) {
        enqueuePlayItem(itemId)
        downloadRepository.enqueue(itemId)
    }

    @Test
    fun `refresh with nothing kept offline produces Loaded with an empty list`() =
        runTest {
            viewModel.refresh()

            val state = viewModel.uiState.value
            assertTrue(state is DownloadsUiState.Loaded)
            assertTrue((state as DownloadsUiState.Loaded).items.isEmpty())
            assertEquals(0, mockWebServer.requestCount)
        }

    @Test
    fun `refresh maps a kept-offline item's summary with title and cover from the base URL`() =
        runTest {
            serverConfigRepository.setBaseUrl(baseUrl)
            keepOffline("item1")
            enqueueLibraryItem("item1", "Sample Book")

            viewModel.refresh()

            val items = (viewModel.uiState.value as DownloadsUiState.Loaded).items
            assertEquals(1, items.size)
            val item = items[0]
            assertEquals("item1", item.itemId)
            assertEquals("Sample Book", item.title)
            assertEquals("${baseUrl.trimEnd('/')}/api/v1/media/item1/cover?width=200", item.coverUrl)
            // FakeDownloadEngine.enqueue leaves the track QUEUED — summarizeDownloads rolls a
            // single non-COMPLETED track up to DOWNLOADING.
            assertEquals(DownloadState.DOWNLOADING, item.state)
            assertEquals(DownloadCancelState.Idle, item.cancelState)
        }

    @Test
    fun `refresh degrades a failing metadata lookup to the bare item id as title`() =
        runTest {
            keepOffline("item1")
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Boom"}}"""),
            )

            viewModel.refresh()

            val items = (viewModel.uiState.value as DownloadsUiState.Loaded).items
            assertEquals(1, items.size)
            assertEquals("item1", items[0].title)
            assertNull(items[0].coverUrl)
        }

    @Test
    fun `refresh does not re-fetch metadata for an item already cached from a previous refresh`() =
        runTest {
            keepOffline("item1")
            enqueueLibraryItem("item1", "Sample Book")
            // A second response queued defensively — if caching regresses and a second GET
            // fires, it consumes this instead of hanging the test on an empty MockWebServer queue.
            enqueueLibraryItem("item1", "Sample Book")

            viewModel.refresh()
            viewModel.refresh()

            // 1 for the playItem POST (keepOffline) + 1 for the single libraryItem GET this
            // scenario should produce across both refreshes combined.
            assertEquals(2, mockWebServer.requestCount)
        }

    @Test
    fun `cancel removes the item's tracks from the engine and it disappears from the next refresh`() =
        runTest {
            keepOffline("item1")
            enqueueLibraryItem("item1", "Sample Book")
            viewModel.refresh()
            assertEquals(1, (viewModel.uiState.value as DownloadsUiState.Loaded).items.size)

            viewModel.cancel("item1")
            val state = viewModel.uiState.first { it is DownloadsUiState.Loaded && (it as DownloadsUiState.Loaded).items.isEmpty() }

            assertTrue((state as DownloadsUiState.Loaded).items.isEmpty())
            assertEquals(listOf(FakeDownloadEngine.CancelCall("item1", "f1")), downloadEngine.cancelCalls)
        }
}
