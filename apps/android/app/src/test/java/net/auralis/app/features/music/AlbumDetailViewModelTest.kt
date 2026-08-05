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
        // Shared with ApiClient below, not just Dispatchers.Main: a request otherwise runs on
        // the real Dispatchers.IO thread pool, invisible to runTest, and a fire-and-forget
        // caller (a viewModelScope.launch a test never explicitly awaits) can then leak that
        // request past this test's own @After — see ApiClient.ioDispatcher's own doc comment.
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

    private fun tracksPageResponse(
        total: Int,
        startIndex: Int = 0,
        items: String,
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":$startIndex}""")

    /**
     * Response for the second, sequential request [AlbumDetailViewModel.load] issues after a
     * successful tracks page — [AlbumDetailViewModel.fetchAlbumFavorite]'s own
     * `musicRepository.albums(id = albumId, limit = 1)` call. Every test below that reaches
     * [AlbumDetailUiState.Loaded] via [AlbumDetailViewModel.load] must enqueue one of these
     * *after* its tracks-page response — both requests are sent from the same coroutine, in
     * this order, so FIFO enqueue order matches arrival order and there is no race to key a
     * `Dispatcher` against (see `MusicSearchViewModelTest`'s own doc comment for the case where
     * that guard *would* be needed: concurrent, not sequential, requests). An empty page is
     * enough for every existing test here, since none of them assert on [favorite] and
     * [AlbumDetailViewModel.fetchAlbumFavorite] already degrades a missing item to `false`.
     */
    private fun albumByIdResponse(favorite: Boolean = false) =
        MockResponse().setBody(
            """{"items":[{"id":"alb1","name":"OK Computer","favorite":$favorite}],"total":1,"startIndex":0}""",
        )

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
            mockWebServer.enqueue(albumByIdResponse())
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
            mockWebServer.enqueue(albumByIdResponse())
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            assertEquals("2.1", (state as AlbumDetailUiState.Loaded).tracks[0].position)
        }

    @Test
    fun `load against an empty album falls back to generic names, not an error`() =
        runTest {
            mockWebServer.enqueue(tracksPageResponse(total = 0, items = "[]"))
            mockWebServer.enqueue(albumByIdResponse())
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
            mockWebServer.enqueue(albumByIdResponse())
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            // `_uiState` only leaves Loading once the whole Loaded object is constructed, and
            // `albumFavorite = fetchAlbumFavorite()` (load()'s second, sequential request) is
            // one of that constructor's own arguments — so this single await already guarantees
            // both of load()'s requests have been consumed before the queue is touched again,
            // unlike MusicLibraryViewModelTest's two-independent-state-fields case, which needs
            // two separate awaits for the same reason.
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
            mockWebServer.enqueue(albumByIdResponse())
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
            mockWebServer.enqueue(albumByIdResponse())
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            val queue =
                viewModel.buildQueueFrom(
                    MusicTrackUi(id = "gone", title = "Gone", position = "1", durationSeconds = 0L, favorite = false),
                )

            assertTrue(queue.isEmpty())
        }

    // -----------------------------------------------------------------------------
    // toggleAlbumFavorite() / toggleTrackFavorite() — see AlbumDetailViewModel.toggleFavorite's
    // own doc comment for the optimistic-update/rollback guarantee under test here. A dedicated
    // regression test for the *overlapping-toggle* race that guarantee exists to prevent was
    // deliberately not written: constructing it would need a custom MockWebServer Dispatcher
    // that reliably tells two bodiless, same-path, same-method requests apart (this wave's own
    // final report explains why — the two toggle calls needed to prove the race collapse to
    // indistinguishable wire traffic for a boolean's only two states), which is exactly the
    // response-mismatch trap MusicSearchViewModelTest's own "stale response" test warns about
    // hitting three times already. The guard's correctness instead rests on its direct structural
    // analogy to MusicSearchViewModel's own `searchSequence` field — capture a generation number
    // before the only suspension point, compare it at every write site — which this codebase
    // already ships and tests for the same "stale response must not overwrite a newer one" shape.
    // -----------------------------------------------------------------------------

    @Test
    fun `toggleAlbumFavorite reconciles against the server's own answer, not the optimistic guess`() =
        runTest {
            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 1,
                    items =
                        """[{"id":"trk1","name":"Airbag","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":1,"discNumber":1,"durationSeconds":284.0}]""",
                ),
            )
            mockWebServer.enqueue(albumByIdResponse(favorite = false))
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            // The server disagrees with the requested state — reconciliation must end on *its*
            // answer (false), not the optimistic guess (true) or a bare "request succeeded, so
            // keep my own guess" — see JellyfinFavoriteResponse's own doc comment for why the
            // resulting state is trusted over the request's own intent.
            //
            // `ioDispatcher` is an `UnconfinedTestDispatcher` here (see setUp), shared by both
            // `Dispatchers.Main` and `ApiClient`'s own IO dispatcher, so `toggleAlbumFavorite`'s
            // `viewModelScope.launch { ... }` runs eagerly and its `withContext(ioDispatcher)`
            // executes inline — the whole toggle (optimistic write, request, settled write)
            // completes synchronously before this call returns. The momentary optimistic flip is
            // therefore not observable through a real `MockWebServer` round trip and isn't
            // asserted here; reconciliation is still pinned directly, since the assertion below
            // fails if the ViewModel kept its own optimistic guess instead of the server's
            // disagreeing answer.
            mockWebServer.enqueue(MockResponse().setBody("""{"favorite":false}"""))
            viewModel.toggleAlbumFavorite()

            val settled = viewModel.uiState.value as AlbumDetailUiState.Loaded
            assertFalse(settled.albumFavorite)
        }

    @Test
    fun `toggleAlbumFavorite rolls back to the previous value when the request fails`() =
        runTest {
            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 1,
                    items =
                        """[{"id":"trk1","name":"Airbag","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":1,"discNumber":1,"durationSeconds":284.0}]""",
                ),
            )
            mockWebServer.enqueue(albumByIdResponse(favorite = true))
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"upstream_error","message":"boom"}}"""),
            )
            viewModel.toggleAlbumFavorite()

            // As above: the synchronous test dispatchers run the optimistic flip (to false), the
            // failing request, and the rollback all inline before this call returns, so `.value`
            // is already the rolled-back state — asserted directly rather than via `.first {}`.
            // This still pins the rollback itself: without it, the optimistic write to false
            // would be the last write, and the assertion below (expecting the original `true`)
            // would fail.
            val settled = viewModel.uiState.value as AlbumDetailUiState.Loaded
            assertTrue(settled.albumFavorite)
        }

    @Test
    fun `toggleTrackFavorite updates only the tapped track, leaving its siblings untouched`() =
        runTest {
            mockWebServer.enqueue(
                tracksPageResponse(
                    total = 2,
                    items =
                        """[{"id":"trk1","name":"Airbag","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":1,"discNumber":1,"durationSeconds":284.0,
                            "favorite":false},
                           {"id":"trk2","name":"Paranoid Android","albumId":"alb1","albumName":"OK Computer",
                            "artistNames":["Radiohead"],"trackNumber":2,"discNumber":1,"durationSeconds":383.5,
                            "favorite":false}]""",
                ),
            )
            mockWebServer.enqueue(albumByIdResponse())
            val viewModel = AlbumDetailViewModel(musicRepository, serverConfigRepository, "alb1")
            viewModel.load()
            viewModel.uiState.first { it !is AlbumDetailUiState.Loading }

            mockWebServer.enqueue(MockResponse().setBody("""{"favorite":true}"""))
            viewModel.toggleTrackFavorite("trk1")

            val loaded = viewModel.uiState.value as AlbumDetailUiState.Loaded
            assertTrue(loaded.tracks.first { it.id == "trk1" }.favorite)
            assertFalse(loaded.tracks.first { it.id == "trk2" }.favorite)
        }
}
