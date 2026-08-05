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
 * Exercises [PlaylistDetailViewModel] against a real [MusicRepository]/[ApiClient] over
 * [MockWebServer] — same pattern [AlbumDetailViewModelTest] uses. [PlaylistDetailViewModel.load]
 * issues its items page, then a single-item `playlists(id=...)` name fetch, sequentially — see
 * [PlaylistDetailViewModel.fetchPlaylistName]'s own doc comment for why — so a plain FIFO
 * `enqueue()` in that order is always safe here.
 */
class PlaylistDetailViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var musicRepository: MusicRepository

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

    private fun trackJson(
        id: String,
        name: String,
    ) = """{"id":"$id","name":"$name","albumId":null,"albumName":null,"artistNames":[],
        "trackNumber":null,"discNumber":null,"durationSeconds":200.0,"imageTag":null,"genres":[]}"""

    private fun playlistNameResponse(name: String) =
        MockResponse().setBody(
            """{"items":[{"id":"pl1","name":"$name","imageTag":null,"trackCount":2}],"total":1,"startIndex":0}""",
        )

    /** Entries are seeded deliberately out of natural id order (`entry2` before `entry1`) so
     * "order comes from the server, unsorted" cannot pass by coincidence. */
    @Test
    fun `load preserves server-given order and fetches the playlist's own name`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[
                        {"playlistItemId":"entry2","track":${trackJson("trkB", "Second")}},
                        {"playlistItemId":"entry1","track":${trackJson("trkA", "First")}}
                    ],"total":2,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistDetailUiState.Loading } as PlaylistDetailUiState.Loaded

            assertEquals("Road Trip", state.playlistName)
            assertEquals(listOf("entry2", "entry1"), state.entries.map { it.playlistItemId })
            assertEquals(listOf("Second", "First"), state.entries.map { it.title })
        }

    @Test
    fun `load with an empty playlist reaches an empty Loaded state, not Failed`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":0}"""))
            mockWebServer.enqueue(playlistNameResponse("Empty"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistDetailUiState.Loading } as PlaylistDetailUiState.Loaded

            assertTrue(state.entries.isEmpty())
        }

    @Test
    fun `load against a failing items call reports Failed with mapped copy, not the raw code`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistDetailUiState.Loading }

            val failed = state as PlaylistDetailUiState.Failed
            assertFalse(failed.message.contains("upstream_auth_expired"))
        }

    @Test
    fun `load against jellyfin_not_configured reports Unconfigured, not Failed`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(409)
                    .setBody("""{"error":{"code":"jellyfin_not_configured","message":"Not configured"}}"""),
            )
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is PlaylistDetailUiState.Loading }

            assertEquals(PlaylistDetailUiState.Unconfigured, state)
        }

    @Test
    fun `loadMore appends the next page and stops offering more once total is reached`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[{"playlistItemId":"entry1","track":${trackJson("trkA", "First")}}],
                        "total":2,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")
            viewModel.load()
            viewModel.uiState.first { it is PlaylistDetailUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[{"playlistItemId":"entry2","track":${trackJson("trkB", "Second")}}],
                        "total":2,"startIndex":1}""",
                ),
            )
            viewModel.loadMore()
            val loaded =
                viewModel.uiState.first {
                    (it as? PlaylistDetailUiState.Loaded)?.entries?.size == 2
                } as PlaylistDetailUiState.Loaded

            assertEquals(listOf("First", "Second"), loaded.entries.map { it.title })
            assertFalse(loaded.hasMore)
            assertFalse(loaded.loadingMore)
        }

    @Test
    fun `removeTrack removes the entry optimistically and stays removed on success`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[
                        {"playlistItemId":"entry1","track":${trackJson("trkA", "First")}},
                        {"playlistItemId":"entry2","track":${trackJson("trkB", "Second")}}
                    ],"total":2,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")
            viewModel.load()
            val loaded = viewModel.uiState.first { it is PlaylistDetailUiState.Loaded } as PlaylistDetailUiState.Loaded
            val toRemove = loaded.entries.first { it.playlistItemId == "entry1" }

            mockWebServer.enqueue(MockResponse().setResponseCode(204))
            viewModel.removeTrack(toRemove)
            val state = viewModel.uiState.value as PlaylistDetailUiState.Loaded

            assertEquals(listOf("entry2"), state.entries.map { it.playlistItemId })
            assertEquals(1, state.total)
        }

    /**
     * A failing removal must roll back the optimistic removal **and** notify the screen — a
     * silent revert would leave the user believing the removal landed. `ioDispatcher` is an
     * `UnconfinedTestDispatcher` here (see setUp), so the whole call (optimistic write, request,
     * rollback write) completes synchronously before `removeTrack` returns — see
     * `FavoritesViewModelTest`'s identical reasoning for why `.value` is asserted directly
     * rather than through a `Flow.first {}` await.
     */
    @Test
    fun `a failing removeTrack rolls back the removal and emits RemoveFailed`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[
                        {"playlistItemId":"entry1","track":${trackJson("trkA", "First")}},
                        {"playlistItemId":"entry2","track":${trackJson("trkB", "Second")}}
                    ],"total":2,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")
            val events = mutableListOf<PlaylistDetailEvent>()
            val collectJob = launch { viewModel.events.collect { events.add(it) } }
            viewModel.load()
            val loaded = viewModel.uiState.first { it is PlaylistDetailUiState.Loaded } as PlaylistDetailUiState.Loaded
            val toRemove = loaded.entries.first { it.playlistItemId == "entry1" }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            viewModel.removeTrack(toRemove)
            val state = viewModel.uiState.value as PlaylistDetailUiState.Loaded

            // Rolled back to its original position and count.
            assertEquals(listOf("entry1", "entry2"), state.entries.map { it.playlistItemId })
            assertEquals(2, state.total)
            assertEquals(1, events.size)
            assertTrue(events[0] is PlaylistDetailEvent.RemoveFailed)
            collectJob.cancel()
        }
}
