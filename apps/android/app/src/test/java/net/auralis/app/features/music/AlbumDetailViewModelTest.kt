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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Same pattern as `MusicLibraryViewModelTest`/`ArtistDetailViewModelTest`: a real
 * [MusicRepository]/[ApiClient] over [MockWebServer], no fake repository. */
class AlbumDetailViewModelTest {
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

    private fun tracksPageResponse(
        total: Int,
        startIndex: Int = 0,
        items: String,
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":$startIndex}""")

    @Test
    fun `load derives album and artist name from the first track and lists every track in order`() =
        runTest {
            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 2,
                    items =
                        """[{"id":"trk1","name":"Airbag","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":1,"discNumber":1,"durationSeconds":284.0},
                           {"id":"trk2","name":"Paranoid Android","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":2,"discNumber":1,"durationSeconds":383.5}]""",
                ),
            )
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            val loaded = state as AlbumDetailUiState.Loaded
            assertEquals("OK Computer", loaded.albumName)
            assertEquals("Radiohead", loaded.artistName)
            assertEquals(listOf("Airbag", "Paranoid Android"), loaded.tracks.map { it.title })
            assertEquals(listOf("1", "2"), loaded.tracks.map { it.position })
            assertEquals(384L, loaded.tracks[1].durationSeconds)
            assertFalse(loaded.hasMore)
        }

    @Test
    fun `a second disc renders as disc dot track, not the bare track number`() =
        runTest {
            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 1,
                    items =
                        """[{"id":"trk1","name":"Side B Opener","albumId":"alb1","albumName":"A Double Album",
                            "artistNames":["Some Band"],"trackNumber":1,"discNumber":2,"durationSeconds":200.0}]""",
                ),
            )
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            assertEquals("2.1", (state as AlbumDetailUiState.Loaded).tracks[0].position)
        }

    @Test
    fun `load against an empty album falls back to generic names, not an error`() =
        runTest {
            mockWebServer.enqueue(tracksPageResponse(total = 0, items = "[]"))
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            val loaded = state as AlbumDetailUiState.Loaded
            assertEquals("Album", loaded.albumName)
            assertNull(loaded.artistName)
            assertTrue(loaded.tracks.isEmpty())
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
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            assertEquals(AlbumDetailUiState.Unconfigured, state)
        }

    @Test
    fun `loadMoreTracks appends the next page in order`() =
        runTest {
            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 2,
                    items =
                        """[{"id":"trk1","name":"Airbag","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":1,"discNumber":1,"durationSeconds":284.0}]""",
                ),
            )
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 2,
                    startIndex = 1,
                    items =
                        """[{"id":"trk2","name":"Paranoid Android","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":2,"discNumber":1,"durationSeconds":383.5}]""",
                ),
            )
            viewModel.loadMoreTracks()
            val state =
                viewModel.uiState.first {
                    (it as? AlbumDetailUiState.Loaded)?.tracks?.size == 2
                } as AlbumDetailUiState.Loaded

            assertEquals(listOf("Airbag", "Paranoid Android"), state.tracks.map { it.title })
            assertFalse(state.hasMore)
        }

    @Test
    fun `buildQueueFrom queues the tapped track and every track after it, with a BFF stream url`() =
        runTest {
            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 3,
                    items =
                        """[{"id":"trk1","name":"Airbag","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":1,"discNumber":1,"durationSeconds":284.0},
                           {"id":"trk2","name":"Paranoid Android","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":2,"discNumber":1,"durationSeconds":383.5},
                           {"id":"trk3","name":"Subterranean Homesick Alien","albumId":"alb1",
                            "albumName":"OK Computer","artistNames":["Radiohead"],"trackNumber":3,
                            "discNumber":1,"durationSeconds":267.0}]""",
                ),
            )
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            val loaded =
                viewModel.uiState.first { it !is AlbumDetailUiState.Loading } as AlbumDetailUiState.Loaded

            // Tap the second track: the queue must start there, not from the album's beginning.
            val queue = viewModel.buildQueueFrom(loaded.tracks[1])

            assertEquals(listOf("Paranoid Android", "Subterranean Homesick Alien"), queue.map { it.title })
            assertEquals("track:trk2", queue[0].mediaId)
            assertEquals("Radiohead", queue[0].artist)
            assertEquals("OK Computer", queue[0].subtitle)
            assertTrue(queue[0].uri.contains("/jellyfin/tracks/trk2/stream"))
            assertFalse(queue[0].uri.contains("token", ignoreCase = true))
        }

    @Test
    fun `buildQueueFrom against a track no longer on the page returns an empty queue, not a crash`() =
        runTest {
            mockWebServer.enqueue(tracksPageResponse(total = 0, items = "[]"))
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            val queue =
                viewModel.buildQueueFrom(
                    MusicTrackUi(id = "gone", title = "Gone", position = "1", durationSeconds = 0L),
                )

            assertTrue(queue.isEmpty())
        }
}
