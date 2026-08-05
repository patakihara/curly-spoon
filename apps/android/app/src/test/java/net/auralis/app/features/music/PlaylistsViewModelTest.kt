package net.auralis.app.features.music

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Exercises [PlaylistsViewModel] against a real [MusicRepository]/[ApiClient] over
 * [MockWebServer] — same pattern [MusicLibraryViewModelTest]/[FavoritesViewModelTest] use.
 * [PlaylistsViewModel.load] issues one section's requests sequentially (availability, then the
 * first playlists page), so a plain FIFO `enqueue()` in that order is always safe here.
 */
class PlaylistsViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var musicRepository: MusicRepository
    private lateinit var serverConfigRepository: ServerConfigRepository

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
        val apiClient =
            ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { mockWebServer.url("/").toString() }
        musicRepository = MusicRepository(apiClient)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun configuredResponse() =
        MockResponse().setBody(
            """{"configured":true,"baseUrl":"https://jellyfin.example.com","hasCredentials":true}""",
        )

    private fun playlistsPageResponse(
        items: String,
        total: Int,
        startIndex: Int = 0,
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":$startIndex}""")

    @Test
    fun `load with an available server maps the playlists page`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(
                playlistsPageResponse(
                    """[{"id":"pl1","name":"Road Trip","imageTag":null,"trackCount":12}]""",
                    total = 1,
                ),
            )
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistsUiState.Loading } as PlaylistsUiState.Loaded

            assertEquals(listOf("Road Trip"), state.items.map { it.name })
            assertEquals(1, state.total)
        }

    @Test
    fun `load with no playlists reaches an empty Loaded state, not Failed`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(playlistsPageResponse("[]", total = 0))
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistsUiState.Loading } as PlaylistsUiState.Loaded

            assertTrue(state.items.isEmpty())
        }

    @Test
    fun `load with no Jellyfin server connected reports Unconfigured and fetches nothing else`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"configured":false,"baseUrl":null,"hasCredentials":false}"""),
            )
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistsUiState.Loading }

            assertEquals(PlaylistsUiState.Unconfigured, state)
            assertEquals(1, mockWebServer.requestCount)
        }

    @Test
    fun `load against a failing playlists call reports Failed with mapped copy, not the raw code`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistsUiState.Loading }

            val failed = state as PlaylistsUiState.Failed
            assertFalse(failed.message.contains("upstream_auth_expired"))
        }

    @Test
    fun `loadMore appends the next page and stops offering more once total is reached`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(
                playlistsPageResponse("""[{"id":"pl1","name":"Road Trip","imageTag":null,"trackCount":3}]""", total = 2),
            )
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it is PlaylistsUiState.Loaded }

            mockWebServer.enqueue(
                playlistsPageResponse(
                    """[{"id":"pl2","name":"Chill","imageTag":null,"trackCount":8}]""",
                    total = 2,
                    startIndex = 1,
                ),
            )
            viewModel.loadMore()
            val loaded =
                viewModel.uiState.first {
                    (it as? PlaylistsUiState.Loaded)?.items?.size == 2
                } as PlaylistsUiState.Loaded

            assertEquals(listOf("Road Trip", "Chill"), loaded.items.map { it.name })
            assertFalse(loaded.hasMore)
            assertFalse(loaded.loadingMore)
        }

    @Test
    fun `createPlaylist prepends the new playlist to the loaded list`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(playlistsPageResponse("[]", total = 0))
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it is PlaylistsUiState.Loaded }

            mockWebServer.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"pl-new"}"""))
            viewModel.createPlaylist("Road Trip")
            val state = viewModel.uiState.value as PlaylistsUiState.Loaded

            assertEquals(listOf("Road Trip"), state.items.map { it.name })
            assertEquals(1, state.total)
            assertFalse(state.creating)
        }

    @Test
    fun `createPlaylist emits a PlaylistEvent Created with the new playlist's id`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(playlistsPageResponse("[]", total = 0))
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)
            val events = mutableListOf<PlaylistEvent>()
            val collectJob = launch { viewModel.events.collect { events.add(it) } }
            viewModel.load()
            viewModel.uiState.first { it is PlaylistsUiState.Loaded }

            mockWebServer.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"pl-new"}"""))
            viewModel.createPlaylist("Road Trip")

            assertEquals(listOf(PlaylistEvent.Created("pl-new")), events)
            collectJob.cancel()
        }

    @Test
    fun `a failed createPlaylist leaves the list unchanged and emits PlaylistEvent Failed`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(playlistsPageResponse("[]", total = 0))
            val viewModel = PlaylistsViewModel(musicRepository, serverConfigRepository)
            val events = mutableListOf<PlaylistEvent>()
            val collectJob = launch { viewModel.events.collect { events.add(it) } }
            viewModel.load()
            viewModel.uiState.first { it is PlaylistsUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            viewModel.createPlaylist("Road Trip")
            val state = viewModel.uiState.value as PlaylistsUiState.Loaded

            assertTrue(state.items.isEmpty())
            assertFalse(state.creating)
            assertEquals(1, events.size)
            assertTrue(events[0] is PlaylistEvent.Failed)
            collectJob.cancel()
        }
}
