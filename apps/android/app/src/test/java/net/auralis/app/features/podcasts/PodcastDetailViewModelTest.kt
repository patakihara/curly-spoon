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

class PodcastDetailViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient
    private lateinit var serverConfigRepository: ServerConfigRepository
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
        val keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { baseUrl }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private suspend fun withBaseUrlConfigured() {
        serverConfigRepository.setBaseUrl(baseUrl)
    }

    /** `GET /items/{id}?expanded=true` — the first network call [PodcastDetailViewModel.load] makes. */
    private fun enqueuePodcastItem(
        itemId: String = "pod1",
        title: String = "Sample Podcast",
        author: String? = "Podcast Host",
        episodesJson: String =
            """[{"id":"ep1","title":"Episode One","duration":120.0,"publishedAt":1000},
                {"id":"ep2","title":"Episode Two","duration":180.0,"publishedAt":2000}]""",
        kind: String = "podcast",
    ) {
        val authorField = author?.let { ""","author":"$it"""" }.orEmpty()
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"item":{"id":"$itemId","libraryId":"lib1","coverPath":null,
                 "media":{"kind":"$kind","title":"$title"$authorField,"episodes":$episodesJson},"progress":null}}
                """.trimIndent(),
            ),
        )
    }

    /** `GET /me/progress` — the second network call. */
    private fun enqueueProgress(progressJson: String = "[]") {
        mockWebServer.enqueue(MockResponse().setBody("""{"progress":$progressJson}"""))
    }

    @Test
    fun `load populates title, author and episodes newest first by default`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePodcastItem()
            enqueueProgress()
            val viewModel = PodcastDetailViewModel(apiClient, serverConfigRepository, "pod1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is PodcastDetailUiState.Loading }

            assertTrue(state is PodcastDetailUiState.Loaded)
            val data = (state as PodcastDetailUiState.Loaded).data
            assertEquals("Sample Podcast", data.title)
            assertEquals("Podcast Host", data.author)
            // publishedAt 2000 (ep2) is newer than 1000 (ep1) — newest-first default puts it first.
            assertEquals(listOf("ep2", "ep1"), data.episodes.map { it.id })
            assertEquals(EpisodeOrder.NEWEST, state.order)
        }

    @Test
    fun `load resolves per-episode progress state from GET me-progress`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePodcastItem()
            enqueueProgress(
                """[{"id":"prog1","libraryItemId":"pod1","episodeId":"ep1","duration":120.0,
                     "currentTime":120.0,"progress":1.0,"isFinished":true}]""",
            )
            val viewModel = PodcastDetailViewModel(apiClient, serverConfigRepository, "pod1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is PodcastDetailUiState.Loading } as PodcastDetailUiState.Loaded

            val ep1 = state.data.episodes.first { it.id == "ep1" }
            val ep2 = state.data.episodes.first { it.id == "ep2" }
            assertEquals(EpisodeProgressState.PLAYED, ep1.progressState)
            assertEquals(EpisodeProgressState.UNPLAYED, ep2.progressState)
        }

    @Test
    fun `a non-podcast item produces NotAPodcast, not Loaded`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePodcastItem(kind = "book", episodesJson = "null")
            // No progress response enqueued: load must return before spending it.

            val viewModel = PodcastDetailViewModel(apiClient, serverConfigRepository, "pod1")
            viewModel.load()
            val state = viewModel.uiState.first { it !is PodcastDetailUiState.Loading }

            assertTrue(state is PodcastDetailUiState.NotAPodcast)
            assertEquals("Sample Podcast", (state as PodcastDetailUiState.NotAPodcast).title)
        }

    @Test
    fun `a failed item fetch produces Failed with the server's message`() =
        runTest {
            withBaseUrlConfigured()
            mockWebServer.enqueue(
                MockResponse().setResponseCode(404).setBody("""{"error":{"code":"not_found","message":"No such item"}}"""),
            )

            val viewModel = PodcastDetailViewModel(apiClient, serverConfigRepository, "missing")
            viewModel.load()
            val state = viewModel.uiState.first { it !is PodcastDetailUiState.Loading }

            assertTrue(state is PodcastDetailUiState.Failed)
            assertEquals("No such item", (state as PodcastDetailUiState.Failed).message)
        }

    @Test
    fun `a failed progress fetch degrades to every episode reading unplayed, not to Failed`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePodcastItem()
            mockWebServer.enqueue(
                MockResponse().setResponseCode(500).setBody("""{"error":{"code":"server_error","message":"boom"}}"""),
            )

            val viewModel = PodcastDetailViewModel(apiClient, serverConfigRepository, "pod1")
            viewModel.load()
            val state = viewModel.uiState.first { it !is PodcastDetailUiState.Loading }

            assertTrue(state is PodcastDetailUiState.Loaded)
            val data = (state as PodcastDetailUiState.Loaded).data
            assertTrue(data.episodes.all { it.progressState == EpisodeProgressState.UNPLAYED })
        }

    @Test
    fun `setOrder re-sorts already-loaded episodes with no additional network call`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePodcastItem()
            enqueueProgress()
            val viewModel = PodcastDetailViewModel(apiClient, serverConfigRepository, "pod1")
            viewModel.load()
            viewModel.uiState.first { it !is PodcastDetailUiState.Loading }

            viewModel.setOrder(EpisodeOrder.OLDEST)
            val state = viewModel.uiState.value as PodcastDetailUiState.Loaded

            assertEquals(listOf("ep1", "ep2"), state.data.episodes.map { it.id })
            assertEquals(EpisodeOrder.OLDEST, state.order)
        }

    @Test
    fun `coverUrl matches the same media-cover URL format used elsewhere in the app`() =
        runTest {
            withBaseUrlConfigured()
            enqueuePodcastItem()
            enqueueProgress()
            val viewModel = PodcastDetailViewModel(apiClient, serverConfigRepository, "pod1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is PodcastDetailUiState.Loading } as PodcastDetailUiState.Loaded

            assertEquals("${baseUrl.trimEnd('/')}/api/v1/media/pod1/cover?width=400", state.data.coverUrl)
        }
}
