package net.develivarr.auralis.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
import net.develivarr.auralis.data.settings.ServerConfigRepository
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
        currentTime: Double = 0.0,
    ) {
        enqueue(
            """
            {"session":{"id":"s1","libraryItemId":"$itemId","mediaType":"book",
             "displayTitle":"$displayTitle","duration":100.0,"currentTime":$currentTime,
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
    fun `resolves a book-prefixed browse id to a ResolvedPlayback whose uri is the expected audioTrackUrl`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1")
            enqueueLibraryItem(itemId = "item1")

            val resolved = resolver.resolve(BrowseIds.book("item1"))

            assertEquals(
                "${baseUrl.trimEnd('/')}/api/v1/media/item1/track/f1",
                resolved?.uri,
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

            val resolved = resolver.resolve("item7")

            assertNotNull(resolved)
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

            val resolved = resolver.resolve(BrowseIds.book("item1"))

            assertEquals("Sample Book", resolved?.title)
            assertEquals("Solo Author", resolved?.artist)
            assertEquals(
                "${baseUrl.trimEnd('/')}/api/v1/media/item1/cover?width=200",
                resolved?.artworkUrl,
            )
            // LibraryItem.media.subtitle is null in this fixture (enqueueLibraryItem never sets
            // it), matching the overwhelming majority of real audiobooks — so subtitle must fall
            // back to the same author string as artist, keeping the browse row (which shows
            // title + author as its subtitle, per BrowseTreeRepository.toBrowseBook) and this
            // item's now-playing metadata from going blank on the subtitle line the moment it
            // starts playing.
            assertEquals("Solo Author", resolved?.subtitle)
        }

    @Test
    fun `preserves the browse mediaId on the returned ResolvedPlayback`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1")
            enqueueLibraryItem(itemId = "item1")

            val browseId = BrowseIds.book("item1")
            val resolved = resolver.resolve(browseId)

            assertEquals(browseId, resolved?.mediaId)
        }

    @Test
    fun `still returns a playable ResolvedPlayback, with plainer metadata, when the libraryItem metadata call errors`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1", displayTitle = "Sample Book")
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"No such item"}}"""),
            )

            val resolved = resolver.resolve(BrowseIds.book("item1"))

            assertNotNull(resolved)
            assertEquals("Sample Book", resolved?.title)
            assertNull(resolved?.artist)
        }

    @Test
    fun `maps the play session's currentTime to startPositionMs, in milliseconds`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1", currentTime = 42.5)
            enqueueLibraryItem(itemId = "item1")

            val resolved = resolver.resolve(BrowseIds.book("item1"))

            assertEquals(42_500L, resolved?.startPositionMs)
        }

    @Test
    fun `startPositionMs is zero for a session with no recorded progress`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayItem(itemId = "item1", currentTime = 0.0)
            enqueueLibraryItem(itemId = "item1")

            val resolved = resolver.resolve(BrowseIds.book("item1"))

            assertEquals(0L, resolved?.startPositionMs)
        }

    // -------------------------------------------------------------------------------------
    // resolveEpisode — the podcast-episode counterpart to resolve(). Uses the same
    // buildResolvedPlayback path, so only what genuinely differs (which endpoint is called,
    // the mediaId shape) gets its own coverage here; title/artist/artwork/startPositionMs
    // enrichment is already covered above.
    // -------------------------------------------------------------------------------------

    /** `POST /items/{itemId}/play/{episodeId}` response — the episode-scoped counterpart to
     * [enqueuePlayItem]. */
    private fun enqueuePlayEpisode(
        itemId: String,
        episodeId: String,
        displayTitle: String = "Sample Episode",
        audioTracksJson: String = """[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}]""",
        currentTime: Double = 0.0,
    ) {
        enqueue(
            """
            {"session":{"id":"s1","libraryItemId":"$itemId","episodeId":"$episodeId","mediaType":"podcast_episode",
             "displayTitle":"$displayTitle","duration":100.0,"currentTime":$currentTime,
             "audioTracks":$audioTracksJson,"chapters":[]}}
            """.trimIndent(),
        )
    }

    @Test
    fun `resolveEpisode calls the episode-scoped play endpoint, not playItem's`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayEpisode(itemId = "pod1", episodeId = "ep1")
            enqueueLibraryItem(itemId = "pod1", title = "Sample Podcast")

            resolver.resolveEpisode("pod1", "ep1")

            val playRequest = mockWebServer.takeRequest()
            assertEquals("/api/v1/items/pod1/play/ep1", playRequest.path)
        }

    @Test
    fun `resolveEpisode resolves to the expected audioTrackUrl`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayEpisode(itemId = "pod1", episodeId = "ep1")
            enqueueLibraryItem(itemId = "pod1", title = "Sample Podcast")

            val resolved = resolver.resolveEpisode("pod1", "ep1")

            assertEquals("${baseUrl.trimEnd('/')}/api/v1/media/pod1/track/f1", resolved?.uri)
        }

    @Test
    fun `resolveEpisode's mediaId encodes both the item id and the episode id`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayEpisode(itemId = "pod1", episodeId = "ep1")
            enqueueLibraryItem(itemId = "pod1", title = "Sample Podcast")

            val resolved = resolver.resolveEpisode("pod1", "ep1")

            assertEquals("episode:pod1:ep1", resolved?.mediaId)
        }

    @Test
    fun `resolveEpisode's title is the episode's own displayTitle, not the podcast container's`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayEpisode(itemId = "pod1", episodeId = "ep1", displayTitle = "Episode 12: The Big One")
            enqueueLibraryItem(itemId = "pod1", title = "Sample Podcast", author = "Podcast Host")

            val resolved = resolver.resolveEpisode("pod1", "ep1")

            assertEquals("Episode 12: The Big One", resolved?.title)
            assertEquals("Podcast Host", resolved?.artist)
        }

    @Test
    fun `resolveEpisode returns null when the session has no playable track`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePlayEpisode(itemId = "pod1", episodeId = "ep1", audioTracksJson = "[]")
            // No libraryItem response enqueued: resolveEpisode must return before spending it.

            val result = resolver.resolveEpisode("pod1", "ep1")

            assertNull(result)
        }

    @Test
    fun `resolveEpisode returns null, not throwing, when playEpisode errors`() =
        runTest {
            withBaseUrlConfigured()
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"No such episode"}}"""),
            )

            val result = resolver.resolveEpisode("pod1", "missing-ep")

            assertNull(result)
        }
}
