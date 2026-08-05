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
 * Exercises [AddToPlaylistViewModel] against a real [MusicRepository]/[ApiClient] over
 * [MockWebServer] — same pattern every other ViewModel test in this package uses.
 */
class AddToPlaylistViewModelTest {
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

    private fun playlistsPageResponse(
        items: String,
        total: Int,
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":0}""")

    @Test
    fun `load maps the playlists page`() =
        runTest {
            mockWebServer.enqueue(
                playlistsPageResponse(
                    """[{"id":"pl1","name":"Road Trip","imageTag":null,"trackCount":3}]""",
                    total = 1,
                ),
            )
            val viewModel = AddToPlaylistViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is AddToPlaylistUiState.Loading } as AddToPlaylistUiState.Loaded

            assertEquals(listOf("Road Trip"), state.playlists.map { it.name })
            assertFalse(state.busy)
        }

    @Test
    fun `load against a failing playlists call reports Failed with mapped copy, not the raw code`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            val viewModel = AddToPlaylistViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is AddToPlaylistUiState.Loading }

            val failed = state as AddToPlaylistUiState.Failed
            assertFalse(failed.message.contains("upstream_auth_expired"))
        }

    @Test
    fun `addToExisting emits Added on success and clears busy`() =
        runTest {
            mockWebServer.enqueue(
                playlistsPageResponse(
                    """[{"id":"pl1","name":"Road Trip","imageTag":null,"trackCount":3}]""",
                    total = 1,
                ),
            )
            val viewModel = AddToPlaylistViewModel(musicRepository, serverConfigRepository)
            val events = mutableListOf<AddToPlaylistEvent>()
            val collectJob = launch { viewModel.events.collect { events.add(it) } }
            viewModel.load()
            viewModel.uiState.first { it is AddToPlaylistUiState.Loaded }

            mockWebServer.enqueue(MockResponse().setResponseCode(204))
            viewModel.addToExisting("pl1", "Road Trip", listOf("trk1"))
            val state = viewModel.uiState.value as AddToPlaylistUiState.Loaded

            assertFalse(state.busy)
            assertEquals(listOf(AddToPlaylistEvent.Added("Road Trip")), events)
            collectJob.cancel()
        }

    @Test
    fun `a failing addToExisting clears busy and emits Failed rather than Added`() =
        runTest {
            mockWebServer.enqueue(
                playlistsPageResponse(
                    """[{"id":"pl1","name":"Road Trip","imageTag":null,"trackCount":3}]""",
                    total = 1,
                ),
            )
            val viewModel = AddToPlaylistViewModel(musicRepository, serverConfigRepository)
            val events = mutableListOf<AddToPlaylistEvent>()
            val collectJob = launch { viewModel.events.collect { events.add(it) } }
            viewModel.load()
            viewModel.uiState.first { it is AddToPlaylistUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            viewModel.addToExisting("pl1", "Road Trip", listOf("trk1"))
            val state = viewModel.uiState.value as AddToPlaylistUiState.Loaded

            assertFalse(state.busy)
            assertEquals(1, events.size)
            assertTrue(events[0] is AddToPlaylistEvent.Failed)
            collectJob.cancel()
        }

    @Test
    fun `createAndAdd seeds the new playlist with itemIds in the same call and emits Added`() =
        runTest {
            mockWebServer.enqueue(playlistsPageResponse("[]", total = 0))
            val viewModel = AddToPlaylistViewModel(musicRepository, serverConfigRepository)
            val events = mutableListOf<AddToPlaylistEvent>()
            val collectJob = launch { viewModel.events.collect { events.add(it) } }
            viewModel.load()
            viewModel.uiState.first { it is AddToPlaylistUiState.Loaded }

            mockWebServer.takeRequest() // the initial GET /jellyfin/playlists from load() above
            mockWebServer.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"pl-new"}"""))
            viewModel.createAndAdd("Road Trip", listOf("trk1", "trk2"))

            val recorded = mockWebServer.takeRequest(2, java.util.concurrent.TimeUnit.SECONDS)
            assertEquals(true, recorded?.body?.readUtf8()?.contains("\"itemIds\":[\"trk1\",\"trk2\"]"))
            assertEquals(listOf(AddToPlaylistEvent.Added("Road Trip")), events)
            collectJob.cancel()
        }

    @Test
    fun `createAndAdd with a blank name is a no-op`() =
        runTest {
            mockWebServer.enqueue(playlistsPageResponse("[]", total = 0))
            val viewModel = AddToPlaylistViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it is AddToPlaylistUiState.Loaded }

            viewModel.createAndAdd("   ", listOf("trk1"))

            // Only the initial playlists-page request was ever made — no create request.
            assertEquals(1, mockWebServer.requestCount)
        }
}
