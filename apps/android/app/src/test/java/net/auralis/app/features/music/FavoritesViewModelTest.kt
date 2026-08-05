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
 * [MockWebServer], no fake repository. [FavoritesViewModel.load] issues its three section
 * requests (artists, albums, tracks) *sequentially* — see that method's own doc comment for
 * why — so a plain FIFO `enqueue()` in that exact order is always safe here, unlike a case
 * needing a keyed `Dispatcher` for genuinely concurrent requests. */
class FavoritesViewModelTest {
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

    private fun configuredResponse() =
        MockResponse().setBody(
            """{"configured":true,"baseUrl":"https://jellyfin.example.com","hasCredentials":true}""",
        )

    private fun pageResponse(
        items: String,
        total: Int,
    ) = MockResponse().setBody("""{"items":$items,"total":$total,"startIndex":0}""")

    @Test
    fun `load with an available server maps all three favourited sections`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(
                pageResponse("""[{"id":"art1","name":"Radiohead","favorite":true}]""", total = 1),
            )
            mockWebServer.enqueue(
                pageResponse(
                    """[{"id":"alb1","name":"OK Computer","artistName":"Radiohead","favorite":true}]""",
                    total = 1,
                ),
            )
            mockWebServer.enqueue(
                pageResponse(
                    """[{"id":"trk1","name":"Airbag","albumId":"alb1","artistNames":["Radiohead"],
                        "durationSeconds":284.0,"favorite":true}]""",
                    total = 1,
                ),
            )
            val viewModel = FavoritesViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is FavoritesUiState.Loading } as FavoritesUiState.Loaded

            assertEquals(listOf("Radiohead"), state.artists.map { it.name })
            assertEquals(listOf("OK Computer"), state.albums.map { it.name })
            assertEquals(listOf("Airbag"), state.tracks.map { it.title })
            assertFalse(state.isEmpty)
        }

    @Test
    fun `load with no favourites in any section reaches an empty Loaded state, not Failed`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(pageResponse("[]", total = 0))
            mockWebServer.enqueue(pageResponse("[]", total = 0))
            mockWebServer.enqueue(pageResponse("[]", total = 0))
            val viewModel = FavoritesViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is FavoritesUiState.Loading } as FavoritesUiState.Loaded

            assertTrue(state.isEmpty)
        }

    @Test
    fun `load with no Jellyfin server connected reports Unconfigured and fetches nothing else`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"configured":false,"baseUrl":null,"hasCredentials":false}"""),
            )
            val viewModel = FavoritesViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is FavoritesUiState.Loading }

            assertEquals(FavoritesUiState.Unconfigured, state)
            assertEquals(1, mockWebServer.requestCount)
        }

    @Test
    fun `a failing section reports Failed with mapped copy, not the raw code`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            val viewModel = FavoritesViewModel(musicRepository, serverConfigRepository)

            viewModel.load()
            val state = viewModel.uiState.first { it !is FavoritesUiState.Loading }

            val failed = state as FavoritesUiState.Failed
            assertFalse(failed.message.contains("upstream_auth_expired"))
        }

    @Test
    fun `toggleTrackFavorite updates only the tapped track, in place, without removing it from the list`() =
        runTest {
            mockWebServer.enqueue(configuredResponse())
            mockWebServer.enqueue(pageResponse("[]", total = 0))
            mockWebServer.enqueue(pageResponse("[]", total = 0))
            // Loaded unfavourited, mirroring AlbumDetailViewModelTest's own
            // "toggleAlbumFavorite flips optimistically, then reconciles..." test: the optimistic
            // flip (see FavoritesViewModel.toggleFavorite) must land on a *different* boolean than
            // the server's eventual answer, or the predicate below could be satisfied by the
            // synchronous optimistic write alone, before the network call ever completes — see the
            // comment further down for why that would defeat the point of awaiting at all.
            mockWebServer.enqueue(
                pageResponse(
                    """[{"id":"trk1","name":"Airbag","albumId":"alb1","artistNames":["Radiohead"],
                        "durationSeconds":284.0,"favorite":false}]""",
                    total = 1,
                ),
            )
            val viewModel = FavoritesViewModel(musicRepository, serverConfigRepository)
            viewModel.load()
            viewModel.uiState.first { it !is FavoritesUiState.Loading }

            // The server disagrees with the requested state — reconciliation must end on *its*
            // answer (false), not the optimistic guess (true).
            mockWebServer.enqueue(MockResponse().setBody("""{"favorite":false}"""))
            viewModel.toggleTrackFavorite("trk1")

            // Flips immediately, synchronously, before the request even reaches the network — the
            // optimistic write happens before toggleFavorite's own suspension point. Asserting it
            // here, against `.value` rather than through `.first{}`, is what proves the predicate
            // below can only be satisfied by the *later*, settled emission: if the optimistic value
            // were left equal to the server's eventual answer (as it was before this fix — both
            // ended up `false`), `.first { favorite == false }` would already be true at this exact
            // instant and return without ever forcing the awaited coroutine's network round trip to
            // complete, leaving it still running when @After's mockWebServer.shutdown() tears down
            // the server out from under it.
            assertTrue(
                (viewModel.uiState.value as FavoritesUiState.Loaded).tracks.first { it.id == "trk1" }.favorite,
            )

            val settled =
                viewModel.uiState.first {
                    (it as? FavoritesUiState.Loaded)?.tracks?.firstOrNull()?.favorite == false
                } as FavoritesUiState.Loaded

            // Still present — this screen flips state in place rather than removing the item,
            // matching apps/web/src/features/music/FavoriteToggle.tsx's own mutation, per
            // FavoritesViewModel.toggleArtistFavorite's doc comment.
            assertEquals(1, settled.tracks.size)
            assertFalse(settled.tracks[0].favorite)
        }
}
