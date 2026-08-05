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

/**
 * Exercises [MusicLibraryViewModel] against a real [MusicRepository]/[ApiClient] over
 * [MockWebServer] — same pattern `PodcastsViewModelTest`/`MusicRepositoryTest` use; there is no
 * fake `ApiClient`/`MusicRepository` in this project for a ViewModel test to use instead.
 */
class MusicLibraryViewModelTest {
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

    private fun artistsPageResponse(
        total: Int = 1,
        startIndex: Int = 0,
        items: String = """[{"id":"art1","name":"Radiohead","overview":null,"imageTag":null,"albumCount":9}]""",
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":$startIndex}""")

    private fun albumsPageResponse(
        total: Int = 1,
        startIndex: Int = 0,
        items: String =
            """[{"id":"alb1","name":"OK Computer","sortName":null,"artistId":"art1",
                "artistName":"Radiohead","productionYear":1997,"overview":null,"genres":[],
                "imageTag":null,"trackCount":12}]""",
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":$startIndex}""")

    @Test
    fun `load with an available Jellyfin server loads artists and albums`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(artistsPageResponse())
            mockWebServer.enqueue(albumsPageResponse())
            val viewModel = MusicLibraryViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it.availability is MusicAvailabilityUiState.Available }
            val artists = viewModel.uiState.first { it.artistsState is ArtistsSectionUiState.Loaded }.artistsState
            val albums = viewModel.uiState.first { it.albumsState is AlbumsSectionUiState.Loaded }.albumsState

            assertEquals(MusicAvailabilityUiState.Available, state.availability)
            assertEquals("Radiohead", (artists as ArtistsSectionUiState.Loaded).items[0].name)
            assertEquals("OK Computer", (albums as AlbumsSectionUiState.Loaded).items[0].name)
        }

    @Test
    fun `load with no Jellyfin server connected reports Unconfigured and fetches neither list`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"configured":false,"baseUrl":null,"hasCredentials":false}"""),
            )
            val viewModel = MusicLibraryViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it.availability !is MusicAvailabilityUiState.Loading }

            assertEquals(MusicAvailabilityUiState.Unconfigured, state.availability)
            assertEquals(1, mockWebServer.requestCount)
        }

    @Test
    fun `load against a failing config call reports Failed with mapped copy, not the raw code`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            val viewModel = MusicLibraryViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it.availability !is MusicAvailabilityUiState.Loading }

            val failed = state.availability as MusicAvailabilityUiState.Failed
            assertFalse(failed.message.contains("upstream_auth_expired"))
            assertTrue(failed.message.contains("expired"))
        }

    @Test
    fun `loadMoreArtists appends the next page and stops offering more once total is reached`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(artistsPageResponse(total = 2, items = """[{"id":"art1","name":"Radiohead"}]"""))
            mockWebServer.enqueue(albumsPageResponse(total = 0, items = "[]"))
            val viewModel = MusicLibraryViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it.artistsState is ArtistsSectionUiState.Loaded }
            // load() runs one coroutine that fetches artists and *then* albums, sequentially.
            // Awaiting only artistsState here would let this test enqueue and consume the
            // MockWebServer response below while that same coroutine is still in flight
            // fetching the albums page — racing two in-flight requests against MockWebServer's
            // strictly-FIFO queue, so one request gets the response meant for the other, its
            // parse fails, and the exception surfaces asynchronously after @After has already
            // torn down MockWebServer/Dispatchers.Main, landing on whichever test's runTest
            // happens to run next as UncaughtExceptionsBeforeTest. Awaiting albumsState too
            // proves the whole of load() has settled before the queue is touched again. See
            // PodcastsViewModelTest's `startPreview then subscribe succeeds and reloads the
            // podcast list` test for the same mechanism, diagnosed first.
            viewModel.uiState.first { it.albumsState is AlbumsSectionUiState.Loaded }

            mockWebServer.enqueue(
                artistsPageResponse(total = 2, startIndex = 1, items = """[{"id":"art2","name":"Sigur Rós"}]"""),
            )
            viewModel.loadMoreArtists()
            val loaded =
                viewModel.uiState.first {
                    (it.artistsState as? ArtistsSectionUiState.Loaded)?.items?.size == 2
                }.artistsState as ArtistsSectionUiState.Loaded

            assertEquals(listOf("Radiohead", "Sigur Rós"), loaded.items.map { it.name })
            assertFalse(loaded.hasMore)
            assertFalse(loaded.loadingMore)
        }

    @Test
    fun `a failed loadMoreArtists keeps the already-loaded items and stops the spinner`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(artistsPageResponse(total = 2, items = """[{"id":"art1","name":"Radiohead"}]"""))
            mockWebServer.enqueue(albumsPageResponse(total = 0, items = "[]"))
            val viewModel = MusicLibraryViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it.artistsState is ArtistsSectionUiState.Loaded }
            // See the identical comment in `loadMoreArtists appends the next page...` above:
            // load()'s albums fetch can still be in flight here, and touching the MockWebServer
            // queue before it settles races it against loadMoreArtists()'s own request.
            viewModel.uiState.first { it.albumsState is AlbumsSectionUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"upstream_error","message":"boom"}}"""),
            )
            viewModel.loadMoreArtists()
            val state =
                viewModel.uiState.first {
                    (it.artistsState as? ArtistsSectionUiState.Loaded)?.loadingMore == false
                }
            val loaded = state.artistsState as ArtistsSectionUiState.Loaded

            assertEquals(listOf("Radiohead"), loaded.items.map { it.name })
            assertFalse(loaded.loadingMore)
        }

    @Test
    fun `retryArtists re-issues the artists first page after a Failed section and reaches Loaded`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"upstream_error","message":"boom"}}"""),
            )
            mockWebServer.enqueue(albumsPageResponse())
            val viewModel = MusicLibraryViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it.artistsState is ArtistsSectionUiState.Failed }
            // load() fetches artists then albums sequentially regardless of the artists outcome —
            // await albums settling too before touching the queue again, same race as the
            // loadMoreArtists tests above.
            viewModel.uiState.first { it.albumsState is AlbumsSectionUiState.Loaded }

            // Retry on a Failed first page used to be wired to loadMoreArtists(), which starts
            // with `artistsState as? Loaded ?: return` — a silent no-op against a Failed state,
            // no request ever sent. retryArtists() re-issues the first-page fetch instead.
            mockWebServer.enqueue(artistsPageResponse())
            viewModel.retryArtists()
            val loaded =
                viewModel.uiState.first { it.artistsState is ArtistsSectionUiState.Loaded }.artistsState
                    as ArtistsSectionUiState.Loaded

            assertEquals(listOf("Radiohead"), loaded.items.map { it.name })
        }

    @Test
    fun `retryAlbums re-issues the albums first page after a Failed section and reaches Loaded`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(artistsPageResponse())
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"upstream_error","message":"boom"}}"""),
            )
            val viewModel = MusicLibraryViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it.artistsState is ArtistsSectionUiState.Loaded }
            viewModel.uiState.first { it.albumsState is AlbumsSectionUiState.Failed }

            mockWebServer.enqueue(albumsPageResponse())
            viewModel.retryAlbums()
            val loaded =
                viewModel.uiState.first { it.albumsState is AlbumsSectionUiState.Loaded }.albumsState
                    as AlbumsSectionUiState.Loaded

            assertEquals(listOf("OK Computer"), loaded.items.map { it.name })
        }
}
