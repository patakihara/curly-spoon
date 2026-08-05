package net.auralis.app.features.music

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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Same pattern as `MusicLibraryViewModelTest`: a real [MusicRepository]/[ApiClient] over
 * [MockWebServer], no fake repository (see that test's own header comment). */
class ArtistDetailViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var musicRepository: MusicRepository
    private lateinit var serverConfigRepository: ServerConfigRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        val apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
        musicRepository = MusicRepository(apiClient)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private fun albumsPageResponse(
        total: Int,
        startIndex: Int = 0,
        items: String,
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":$startIndex}""")

    @Test
    fun `load derives the artist name from the first loaded album and lists every album`() =
        runTest {
            mockWebServer.enqueue(
                albumsPageResponse(
                    total = 2,
                    items =
                        """[{"id":"alb1","name":"OK Computer","artistId":"art1","artistName":"Radiohead"},
                            {"id":"alb2","name":"In Rainbows","artistId":"art1","artistName":"Radiohead"}]""",
                ),
            )
            val viewModel = ArtistDetailViewModel(musicRepository, serverConfigRepository, "art1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is ArtistDetailUiState.Loading }

            val loaded = state as ArtistDetailUiState.Loaded
            assertEquals("Radiohead", loaded.artistName)
            assertEquals(listOf("OK Computer", "In Rainbows"), loaded.albums.map { it.name })
            assertFalse(loaded.hasMore)
        }

    @Test
    fun `load against an artist with no albums falls back to a generic name, not an error`() =
        runTest {
            mockWebServer.enqueue(albumsPageResponse(total = 0, items = "[]"))
            val viewModel = ArtistDetailViewModel(musicRepository, serverConfigRepository, "art1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is ArtistDetailUiState.Loading }

            val loaded = state as ArtistDetailUiState.Loaded
            assertEquals("Artist", loaded.artistName)
            assertTrue(loaded.albums.isEmpty())
        }

    @Test
    fun `load against jellyfin_not_configured reports the calm Unconfigured state, not Failed`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(409)
                    .setBody(
                        """{"error":{"code":"jellyfin_not_configured","message":"Jellyfin isn't configured"}}""",
                    ),
            )
            val viewModel = ArtistDetailViewModel(musicRepository, serverConfigRepository, "art1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is ArtistDetailUiState.Loading }

            assertEquals(ArtistDetailUiState.Unconfigured, state)
        }

    @Test
    fun `load against any other upstream failure reports Failed with mapped copy`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            val viewModel = ArtistDetailViewModel(musicRepository, serverConfigRepository, "art1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is ArtistDetailUiState.Loading }

            val failed = state as ArtistDetailUiState.Failed
            assertFalse(failed.message.contains("upstream_auth_expired"))
        }

    @Test
    fun `loadMoreAlbums appends the next page`() =
        runTest {
            mockWebServer.enqueue(
                albumsPageResponse(total = 2, items = """[{"id":"alb1","name":"OK Computer","artistName":"Radiohead"}]"""),
            )
            val viewModel = ArtistDetailViewModel(musicRepository, serverConfigRepository, "art1")
            viewModel.load()
            viewModel.uiState.first { it !is ArtistDetailUiState.Loading }

            mockWebServer.enqueue(
                albumsPageResponse(
                    total = 2,
                    startIndex = 1,
                    items = """[{"id":"alb2","name":"In Rainbows","artistName":"Radiohead"}]""",
                ),
            )
            viewModel.loadMoreAlbums()
            val state =
                viewModel.uiState.first {
                    (it as? ArtistDetailUiState.Loaded)?.albums?.size == 2
                } as ArtistDetailUiState.Loaded

            assertEquals(listOf("OK Computer", "In Rainbows"), state.albums.map { it.name })
            assertFalse(state.hasMore)
        }
}
