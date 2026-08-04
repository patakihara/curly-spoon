package net.auralis.app.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class PlaybackItemResolverTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var keyValueStore: FakeKeyValueStore
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var apiClient: ApiClient
    private lateinit var resolver: PlaybackItemResolver
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()
        keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar) { baseUrl }
        resolver = PlaybackItemResolver(apiClient, serverConfigRepository)
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    private suspend fun withBaseUrlConfigured() {
        serverConfigRepository.setBaseUrl(baseUrl)
    }

    private fun enqueue(body: String) {
        mockWebServer.enqueue(MockResponse().setBody(body))
    }

    /** `POST /items/{id}/play` response — the first network call [PlaybackItemResolver.resolve] makes. */
    private fun enqueuePlayItem(
        itemId: String,
        displayTitle: String = "Sample Book",
        audioTracksJson: String = """[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}]""",
    ) {
        enqueue(
            """
            {"session":{"id":"s1","libraryItemId":"$itemId","mediaType":"book",
             "displayTitle":"$displayTitle","duration":100.0,"currentTime":0.0,
             "audioTracks":$audioTracksJson,"chapters":[]}}
            """.trimIndent(),
        )
    }

    /** `GET /items/{id}` response — the second network call, used for artist/author metadata only. */
    private fun enqueueLibraryItem(
        itemId: String,
        title: String = "Sample Book",
        author: String? = "Solo Author",
    ) {
        val authorField = author?.let { ""","author":"$it"""" }.orEmpty()
        enqueue(
            """
            {"item":{"id":"$itemId","libraryId":"lib1","coverPath":null,
             "media":{"kind":"book","title":"$title"$authorField},"progress":null}}
            """.trimIndent(),
        )
    }

    @Test
    fun `resolves a book-prefixed browse id to a MediaItem whose URI is the expected audioTrackUrl`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1")
            enqueueLibraryItem(itemId = "item1")

            val mediaItem = resolver.resolve(BrowseIds.book("item1"))

            assertEquals(
                "${baseUrl.trimEnd('/')}/api/v1/media/item1/track/f1",
                mediaItem?.localConfiguration?.uri.toString(),
            )
        }

    @Test
    fun `consumes exactly the browse id BrowseIds-book produces, calling playItem with the underlying item id`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item42")
            enqueueLibraryItem(itemId = "item42")

            resolver.resolve(BrowseIds.book("item42"))

            val playRequest = mockWebServer.takeRequest()
            assertEquals("/api/v1/items/item42/play", playRequest.path)
        }

    @Test
    fun `resolves a bare, unprefixed item id too`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item7")
            enqueueLibraryItem(itemId = "item7")

            val mediaItem = resolver.resolve("item7")

            assertNotNull(mediaItem)
            val playRequest = mockWebServer.takeRequest()
            assertEquals("/api/v1/items/item7/play", playRequest.path)
        }

    @Test
    fun `returns null for a series browse id, which is browsable not playable`() =
        runTest {
            withBaseUrlConfigured()
            // No response enqueued: if the resolver called the API here, the request would
            // block/fail with no queued response, failing this test loudly.
            val result = resolver.resolve(BrowseIds.seriesNode("s1"))

            assertNull(result)
        }

    @Test
    fun `returns null when the session has no playable track`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1", audioTracksJson = "[]")
            // No libraryItem response enqueued: resolve must return before spending it.

            val result = resolver.resolve(BrowseIds.book("item1"))

            assertNull(result)
        }

    @Test
    fun `returns null, not throwing, when playItem errors`() =
        runTest {
            withBaseUrlConfigured()
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"No such item"}}"""),
            )

            val result = resolver.resolve(BrowseIds.book("missing"))

            assertNull(result)
        }

    @Test
    fun `populates title, artist and an artwork URL matching BrowseTreeRepository's own cover URL format`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1", displayTitle = "Sample Book")
            enqueueLibraryItem(itemId = "item1", author = "Solo Author")

            val mediaItem = resolver.resolve(BrowseIds.book("item1"))

            assertEquals("Sample Book", mediaItem?.mediaMetadata?.title?.toString())
            assertEquals("Solo Author", mediaItem?.mediaMetadata?.artist?.toString())
            assertEquals(
                "${baseUrl.trimEnd('/')}/api/v1/media/item1/cover?width=200",
                mediaItem?.mediaMetadata?.artworkUri.toString(),
            )
        }

    @Test
    fun `preserves the browse mediaId on the returned MediaItem`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1")
            enqueueLibraryItem(itemId = "item1")

            val browseId = BrowseIds.book("item1")
            val mediaItem = resolver.resolve(browseId)

            assertEquals(browseId, mediaItem?.mediaId)
        }

    @Test
    fun `still returns a playable MediaItem, with plainer metadata, when the libraryItem metadata call errors`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1", displayTitle = "Sample Book")
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"No such item"}}"""),
            )

            val mediaItem = resolver.resolve(BrowseIds.book("item1"))

            assertNotNull(mediaItem)
            assertEquals("Sample Book", mediaItem?.mediaMetadata?.title?.toString())
            assertNull(mediaItem?.mediaMetadata?.artist)
        }
}
