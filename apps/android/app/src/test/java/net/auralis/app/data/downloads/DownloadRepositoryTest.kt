package net.auralis.app.data.downloads

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DownloadRepositoryTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var keyValueStore: FakeKeyValueStore
    private lateinit var apiClient: ApiClient
    private lateinit var downloadEngine: FakeDownloadEngine
    private lateinit var repository: DownloadRepository
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()
        keyValueStore = FakeKeyValueStore()
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar) { baseUrl }
        downloadEngine = FakeDownloadEngine()
        repository = DownloadRepository(apiClient, keyValueStore, downloadEngine)
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    /** `POST /items/{id}/play` response — the only network call [DownloadRepository.enqueue] makes (`audioTrackUrl` is a pure string build, not a request). */
    private fun enqueuePlayItem(
        itemId: String,
        audioTracksJson: String,
    ) {
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"session":{"id":"s1","libraryItemId":"$itemId","mediaType":"book",
                 "displayTitle":"Sample Book","duration":100.0,"currentTime":0.0,
                 "audioTracks":$audioTracksJson,"chapters":[]}}
                """.trimIndent(),
            ),
        )
    }

    @Test
    fun `enqueue resolves every track of the item and hands each one's URL to the engine`() =
        runTest {
            enqueuePlayItem(
                itemId = "item1",
                audioTracksJson =
                    """[
                        {"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f1"},
                        {"index":1,"startOffset":50.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f2"}
                    ]""",
            )

            val result = repository.enqueue("item1")

            assertEquals(DownloadEnqueueResult.Enqueued(2), result)
            assertEquals(2, downloadEngine.enqueueCalls.size)
            assertEquals(
                FakeDownloadEngine.EnqueueCall("item1", "f1", "${baseUrl.trimEnd('/')}/api/v1/media/item1/track/f1"),
                downloadEngine.enqueueCalls[0],
            )
            assertEquals(
                FakeDownloadEngine.EnqueueCall("item1", "f2", "${baseUrl.trimEnd('/')}/api/v1/media/item1/track/f2"),
                downloadEngine.enqueueCalls[1],
            )
        }

    @Test
    fun `enqueue marks the item kept-offline only once tracks are actually queued`() =
        runTest {
            enqueuePlayItem(
                itemId = "item1",
                audioTracksJson = """[{"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f1"}]""",
            )

            assertTrue(repository.keptOfflineItemIds().isEmpty())

            repository.enqueue("item1")

            assertEquals(setOf("item1"), repository.keptOfflineItemIds())
        }

    @Test
    fun `enqueue degrades to NoPlayableTrack, not a crash, when the item has no audio tracks`() =
        runTest {
            enqueuePlayItem(itemId = "item1", audioTracksJson = "[]")

            val result = repository.enqueue("item1")

            assertEquals(DownloadEnqueueResult.NoPlayableTrack, result)
            assertTrue(downloadEngine.enqueueCalls.isEmpty())
            assertTrue(repository.keptOfflineItemIds().isEmpty())
        }

    @Test
    fun `enqueue degrades to NoPlayableTrack when every track's contentUrl is unparseable`() =
        runTest {
            enqueuePlayItem(
                itemId = "item1",
                audioTracksJson = """[{"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":null}]""",
            )

            val result = repository.enqueue("item1")

            assertEquals(DownloadEnqueueResult.NoPlayableTrack, result)
            assertTrue(downloadEngine.enqueueCalls.isEmpty())
        }

    @Test
    fun `enqueue degrades to Failed, not a crash, when the API errors`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Boom"}}"""),
            )

            val result = repository.enqueue("item1")

            assertTrue(result is DownloadEnqueueResult.Failed)
            assertEquals("internal_error", (result as DownloadEnqueueResult.Failed).code)
            assertTrue(downloadEngine.enqueueCalls.isEmpty())
            assertTrue(repository.keptOfflineItemIds().isEmpty())
        }

    @Test
    fun `keptOfflineItemIds round-trips multiple items through the KeyValueStore`() =
        runTest {
            enqueuePlayItem(
                itemId = "item1",
                audioTracksJson = """[{"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f1"}]""",
            )
            enqueuePlayItem(
                itemId = "item2",
                audioTracksJson = """[{"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item2/file/f1"}]""",
            )

            repository.enqueue("item1")
            repository.enqueue("item2")

            assertEquals(setOf("item1", "item2"), repository.keptOfflineItemIds())
        }

    @Test
    fun `cancel removes every track from the engine and the item from the kept-offline set`() =
        runTest {
            enqueuePlayItem(
                itemId = "item1",
                audioTracksJson =
                    """[
                        {"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f1"},
                        {"index":1,"startOffset":50.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f2"}
                    ]""",
            )
            repository.enqueue("item1")

            repository.cancel("item1")

            assertEquals(2, downloadEngine.cancelCalls.size)
            assertTrue(downloadEngine.cancelCalls.contains(FakeDownloadEngine.CancelCall("item1", "f1")))
            assertTrue(downloadEngine.cancelCalls.contains(FakeDownloadEngine.CancelCall("item1", "f2")))
            assertTrue(repository.keptOfflineItemIds().isEmpty())
        }

    @Test
    fun `cancel on an item with nothing downloaded is a harmless no-op`() =
        runTest {
            repository.cancel("never-downloaded")

            assertTrue(downloadEngine.cancelCalls.isEmpty())
            assertTrue(repository.keptOfflineItemIds().isEmpty())
        }

    @Test
    fun `enqueue against an unavailable engine returns Unavailable without ever calling the API`() =
        runTest {
            // Deliberately no `enqueuePlayItem` stub queued: an unavailable engine must short-circuit
            // before the network call, so if this test needed one, `apiClient.playItem` would throw
            // rather than the repository silently proceeding past the availability check.
            val unavailableEngine = FakeDownloadEngine(isAvailable = false)
            val repositoryWithUnavailableEngine = DownloadRepository(apiClient, keyValueStore, unavailableEngine)

            val result = repositoryWithUnavailableEngine.enqueue("item1")

            assertEquals(DownloadEnqueueResult.Unavailable, result)
            assertEquals(0, mockWebServer.requestCount)
        }

    @Test
    fun `enqueue against an unavailable engine never calls the engine and leaves the kept-offline set empty`() =
        runTest {
            val unavailableEngine = FakeDownloadEngine(isAvailable = false)
            val repositoryWithUnavailableEngine = DownloadRepository(apiClient, keyValueStore, unavailableEngine)

            repositoryWithUnavailableEngine.enqueue("item1")

            assertTrue(unavailableEngine.enqueueCalls.isEmpty())
            assertTrue(repositoryWithUnavailableEngine.keptOfflineItemIds().isEmpty())
        }

    @Test
    fun `cancel against an unavailable engine is a harmless no-op that leaves the kept-offline set empty`() =
        runTest {
            val unavailableEngine = FakeDownloadEngine(isAvailable = false)
            val repositoryWithUnavailableEngine = DownloadRepository(apiClient, keyValueStore, unavailableEngine)

            repositoryWithUnavailableEngine.cancel("item1")

            assertTrue(unavailableEngine.cancelCalls.isEmpty())
            assertTrue(repositoryWithUnavailableEngine.keptOfflineItemIds().isEmpty())
        }

    @Test
    fun `downloadSummaries is empty when nothing is kept offline`() =
        runTest {
            assertTrue(repository.downloadSummaries().isEmpty())
        }

    @Test
    fun `downloadSummaries returns one summary per kept-offline item, rolling up its tracks`() =
        runTest {
            enqueuePlayItem(
                itemId = "item1",
                audioTracksJson =
                    """[
                        {"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f1"},
                        {"index":1,"startOffset":50.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f2"}
                    ]""",
            )
            enqueuePlayItem(
                itemId = "item2",
                audioTracksJson = """[{"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item2/file/f1"}]""",
            )

            repository.enqueue("item1")
            repository.enqueue("item2")

            val summaries = repository.downloadSummaries().associateBy { it.itemId }

            assertEquals(setOf("item1", "item2"), summaries.keys)
            // FakeDownloadEngine.enqueue always records QUEUED entries — summarizeDownloads
            // rolls both of item1's tracks up into a single DOWNLOADING summary.
            assertEquals(DownloadState.DOWNLOADING, summaries.getValue("item1").state)
            assertEquals(DownloadState.DOWNLOADING, summaries.getValue("item2").state)
        }

    @Test
    fun `downloadSummaries drops a kept-offline item whose engine has forgotten every track`() =
        runTest {
            enqueuePlayItem(
                itemId = "item1",
                audioTracksJson = """[{"index":0,"startOffset":0.0,"duration":50.0,"contentUrl":"/api/items/item1/file/f1"}]""",
            )
            repository.enqueue("item1")
            assertEquals(setOf("item1"), repository.keptOfflineItemIds())

            // Simulates the engine losing its record of every track through some path other than
            // DownloadRepository.cancel() (which would also clear the kept-offline entry below) —
            // summarizeDownloads' null-on-empty-list case is what keeps this from producing a
            // fabricated zero-state row instead of dropping the item outright.
            downloadEngine.forgetAllTracks("item1")

            assertTrue(repository.downloadSummaries().isEmpty())
            // The kept-offline set itself is untouched — only the derived summary degrades.
            assertEquals(setOf("item1"), repository.keptOfflineItemIds())
        }
}
