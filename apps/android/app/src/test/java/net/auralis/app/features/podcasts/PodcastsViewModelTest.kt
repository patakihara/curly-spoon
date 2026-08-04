package net.auralis.app.features.podcasts

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
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
import java.util.concurrent.TimeUnit

class PodcastsViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar) { baseUrl }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun podcastLibraryResponse(folders: String = """[{"id":"folder1","path":"/data/podcasts"}]""") =
        """{"libraries":[{"id":"lib1","name":"Podcasts","mediaType":"podcast","icon":null,"folders":$folders}]}"""

    private fun bookOnlyLibraryResponse() =
        """{"libraries":[{"id":"lib0","name":"Books","mediaType":"book","icon":null,"folders":[]}]}"""

    private fun libraryItemsResponse() =
        """
        {"items":[{"id":"pod1","libraryId":"lib1","coverPath":null,
         "media":{"kind":"podcast","title":"Sample Podcast","author":"Podcast Host"},"progress":null}],
         "total":1}
        """.trimIndent()

    /** Same shape as [libraryItemsResponse], but with the newly-subscribed "pod2" alongside
     * "pod1" — used for the reload `GET items` that follows a successful `subscribe()`, so a
     * test can distinguish "the reload actually landed" from "the stale pre-subscribe value is
     * still sitting there": [libraryItemsResponse] alone is indistinguishable from the state
     * already set before the reload runs. */
    private fun reloadedLibraryItemsResponse() =
        """
        {"items":[{"id":"pod1","libraryId":"lib1","coverPath":null,
         "media":{"kind":"podcast","title":"Sample Podcast","author":"Podcast Host"},"progress":null},
         {"id":"pod2","libraryId":"lib1","coverPath":null,
         "media":{"kind":"podcast","title":"Result Podcast"},"progress":null}],
         "total":2}
        """.trimIndent()

    @Test
    fun `loadMyPodcasts finds the podcast library and loads its items`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(podcastLibraryResponse()))
            mockWebServer.enqueue(MockResponse().setBody(libraryItemsResponse()))
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)

            viewModel.loadMyPodcasts()
            val state = viewModel.uiState.first { it.myPodcastsState !is MyPodcastsUiState.Loading }

            assertTrue(state.myPodcastsState is MyPodcastsUiState.Loaded)
            val loaded = state.myPodcastsState as MyPodcastsUiState.Loaded
            assertEquals(1, loaded.podcasts.size)
            assertEquals("pod1", loaded.podcasts[0].id)
            assertEquals("Sample Podcast", loaded.podcasts[0].title)
            assertEquals("Podcast Host", loaded.podcasts[0].author)
        }

    @Test
    fun `loadMyPodcasts with no podcast-mediaType library produces NoLibrary, without fetching items`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(bookOnlyLibraryResponse()))
            // No items response enqueued: if loadMyPodcasts called GET items anyway, that
            // request would have nothing queued to answer it and this test would hang until
            // its own timeout rather than fail cleanly — so the explicit requestCount
            // assertion below is what actually proves the call didn't happen, not this
            // absence alone.
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)

            viewModel.loadMyPodcasts()
            val state = viewModel.uiState.first { it.myPodcastsState !is MyPodcastsUiState.Loading }

            assertEquals(MyPodcastsUiState.NoLibrary, state.myPodcastsState)
            assertEquals(1, mockWebServer.requestCount)
        }

    @Test
    fun `loadMyPodcasts against a 500 response produces Failed`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setResponseCode(500).setBody("""{"error":{"code":"server_error","message":"boom"}}"""),
            )
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)

            viewModel.loadMyPodcasts()
            val state = viewModel.uiState.first { it.myPodcastsState !is MyPodcastsUiState.Loading }

            assertTrue(state.myPodcastsState is MyPodcastsUiState.Failed)
        }

    @Test
    fun `submitSearch with a blank term stays Idle and makes no request`() =
        runTest {
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)
            viewModel.onSearchTermChange("   ")

            viewModel.submitSearch()

            assertEquals(DirectorySearchUiState.Idle, viewModel.uiState.value.searchState)
        }

    @Test
    fun `submitSearch with a real term produces Results`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"results":[{"itunesId":123,"title":"Result Podcast","trackCount":10,
                        "explicit":false,"feedUrl":"https://feed.example/rss"}]}""",
                ),
            )
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)
            viewModel.onSearchTermChange("tech news")

            viewModel.submitSearch()
            val state = viewModel.uiState.first { it.searchState !is DirectorySearchUiState.Loading }

            assertTrue(state.searchState is DirectorySearchUiState.Results)
            val results = (state.searchState as DirectorySearchUiState.Results).results
            assertEquals(1, results.size)
            assertEquals("Result Podcast", results[0].title)
        }

    @Test
    fun `startPreview then subscribe succeeds and reloads the podcast list`() =
        runTest {
            // 1: loadMyPodcasts's own two calls, run first to populate the cached library.
            mockWebServer.enqueue(MockResponse().setBody(podcastLibraryResponse()))
            mockWebServer.enqueue(MockResponse().setBody(libraryItemsResponse()))
            // 2: startPreview's POST /podcasts/feed.
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"preview":{"title":"Result Podcast","explicit":false,"numEpisodes":0}}""",
                ),
            )
            // 3: subscribe's POST /podcasts.
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"pod2","libraryId":"lib1","coverPath":null,
                        "media":{"kind":"podcast","title":"Result Podcast"},"progress":null}}""",
                ),
            )
            // 4/5: subscribe's own reload (GET /libraries then GET items). The items response
            // is deliberately *not* identical to (1)'s — see reloadedLibraryItemsResponse's doc
            // comment — so the test below can prove the reload actually completed rather than
            // just that its requests were sent.
            mockWebServer.enqueue(MockResponse().setBody(podcastLibraryResponse()))
            mockWebServer.enqueue(MockResponse().setBody(reloadedLibraryItemsResponse()))

            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)
            viewModel.loadMyPodcasts()
            viewModel.uiState.first { it.myPodcastsState !is MyPodcastsUiState.Loading }

            viewModel.startPreview(directoryResult = null, rssFeed = "https://feed.example/rss")
            viewModel.uiState.first { it.previewState !is FeedPreviewUiState.Loading }

            viewModel.subscribe()
            val state = viewModel.uiState.first { it.subscribeState !is SubscribeUiState.Pending }

            assertEquals(SubscribeUiState.Subscribed, state.subscribeState)
            // subscribe() sets subscribeState = Subscribed *before* the reload it triggers
            // (loadMyPodcasts(), a second, independently-launched coroutine) necessarily
            // completes — myPodcastsState is already Loaded from step 1 at this exact instant,
            // so awaiting `it.myPodcastsState is Loaded` here would spuriously match against
            // that *stale* value instead of proving the reload ran. Draining MockWebServer's
            // request queue directly is what actually proves requests 4/5 above were sent, not
            // just enqueued as responses nothing ever consumed — `takeRequest` blocks (for real,
            // across threads) until each request has actually arrived.
            val paths = (1..6).map { mockWebServer.takeRequest(5, TimeUnit.SECONDS)?.path }
            assertEquals(
                listOf(
                    "/api/v1/libraries",
                    "/api/v1/libraries/lib1/items",
                    "/api/v1/podcasts/feed",
                    "/api/v1/podcasts",
                    "/api/v1/libraries",
                    "/api/v1/libraries/lib1/items",
                ),
                paths,
            )

            // Draining the request queue above only proves requests 4/5 were *sent* — it does
            // not prove the client finished reading and applying their responses. That gap used
            // to let this test method return — and @After tear down (Dispatchers.resetMain()
            // then mockWebServer.shutdown()) — while the reload's own launch{} (started inside
            // subscribe()'s success branch, via loadMyPodcasts()) was still suspended in
            // withContext(Dispatchers.IO), waiting on the response: an un-awaited coroutine
            // outliving this test method, left to resume and throw on its own schedule
            // afterwards (most likely on dispatch back to Dispatchers.Main.immediate, which
            // resetMain() had already pulled out from under it — not a plain IOException from
            // the closed socket, which execute()'s own catch(IOException) already wraps into a
            // handled ApiException). That throw surfaced as UncaughtExceptionsBeforeTest on a
            // later test's runTest. Waiting for the reload's *outcome* here (not just its
            // requests) closes the gap regardless of the exact throw site. It has to be
            // distinguished from the stale Loaded value already set in step 1 —
            // reloadedLibraryItemsResponse's two items vs. libraryItemsResponse's one is what
            // makes that possible; awaiting "any Loaded state" would match the stale value
            // immediately and not wait at all.
            val reloaded =
                viewModel.uiState.first {
                    (it.myPodcastsState as? MyPodcastsUiState.Loaded)?.podcasts?.size == 2
                }
            assertEquals(
                listOf("pod1", "pod2"),
                (reloaded.myPodcastsState as MyPodcastsUiState.Loaded).podcasts.map { it.id },
            )
        }

    @Test
    fun `subscribe with no cached podcast library short-circuits to CannotSubscribe, making no request`() =
        runTest {
            // loadMyPodcasts is never called, so podcastLibrary is null.
            mockWebServer.enqueue(
                MockResponse().setBody("""{"preview":{"title":"Result Podcast","explicit":false,"numEpisodes":0}}"""),
            )
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)

            viewModel.startPreview(directoryResult = null, rssFeed = "https://feed.example/rss")
            viewModel.uiState.first { it.previewState !is FeedPreviewUiState.Loading }
            viewModel.subscribe()

            assertEquals(SubscribeUiState.CannotSubscribe, viewModel.uiState.value.subscribeState)
        }

    @Test
    fun `subscribe against a library with no folder short-circuits to CannotSubscribe`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(podcastLibraryResponse(folders = "[]")))
            mockWebServer.enqueue(MockResponse().setBody(libraryItemsResponse()))
            mockWebServer.enqueue(
                MockResponse().setBody("""{"preview":{"title":"Result Podcast","explicit":false,"numEpisodes":0}}"""),
            )
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)
            viewModel.loadMyPodcasts()
            viewModel.uiState.first { it.myPodcastsState !is MyPodcastsUiState.Loading }
            viewModel.startPreview(directoryResult = null, rssFeed = "https://feed.example/rss")
            viewModel.uiState.first { it.previewState !is FeedPreviewUiState.Loading }

            viewModel.subscribe()

            assertEquals(SubscribeUiState.CannotSubscribe, viewModel.uiState.value.subscribeState)
        }

    @Test
    fun `dismissPreview resets both preview and subscribe state`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"preview":{"title":"Result Podcast","explicit":false,"numEpisodes":0}}"""),
            )
            val viewModel = PodcastsViewModel(apiClient, serverConfigRepository)
            viewModel.startPreview(directoryResult = null, rssFeed = "https://feed.example/rss")
            viewModel.uiState.first { it.previewState !is FeedPreviewUiState.Loading }

            viewModel.dismissPreview()

            assertEquals(FeedPreviewUiState.Idle, viewModel.uiState.value.previewState)
            assertEquals(SubscribeUiState.Idle, viewModel.uiState.value.subscribeState)
        }
}
