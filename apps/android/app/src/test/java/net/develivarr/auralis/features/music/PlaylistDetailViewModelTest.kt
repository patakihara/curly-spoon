package net.develivarr.auralis.features.music

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
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
            viewModel.load()
            val loaded = viewModel.uiState.first { it is PlaylistDetailUiState.Loaded } as PlaylistDetailUiState.Loaded
            val toRemove = loaded.entries.first { it.playlistItemId == "entry1" }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            val eventDeferred = async(start = CoroutineStart.UNDISPATCHED) { viewModel.events.first() }
            viewModel.removeTrack(toRemove)
            val state = viewModel.uiState.value as PlaylistDetailUiState.Loaded
            val event = eventDeferred.await()

            // Rolled back to its original position and count.
            assertEquals(listOf("entry1", "entry2"), state.entries.map { it.playlistItemId })
            assertEquals(2, state.total)
            assertTrue(event is PlaylistDetailEvent.RemoveFailed)
        }

    /**
     * Pins [PlaylistDetailViewModel.removeTrack]'s rollback-position fix: restoring a removed
     * *non-first* entry must land it back between the same two neighbours, not merely "somewhere
     * in a list of the right length". This test alone can't reproduce the drift the fix targets
     * — `ioDispatcher` being an `UnconfinedTestDispatcher` (see setUp) makes the whole call
     * (optimistic write, request, rollback write) run synchronously to completion before
     * `removeTrack` returns, so nothing can mutate `entries` between the optimistic removal and
     * the rollback the way a concurrent `loadMore()`/another removal could in production — but it
     * does exercise the "preceding entry still present" branch of the neighbour-based restore
     * (`entry1`'s own failing-removal test above exercises the other branch, `precedingId == null`
     * for a first entry) and would fail if that branch ever mis-derived the insertion index.
     */
    @Test
    fun `a failing removeTrack of a middle entry rolls back between the same two neighbours`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[
                        {"playlistItemId":"entry1","track":${trackJson("trkA", "First")}},
                        {"playlistItemId":"entry2","track":${trackJson("trkB", "Second")}},
                        {"playlistItemId":"entry3","track":${trackJson("trkC", "Third")}}
                    ],"total":3,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")
            viewModel.load()
            val loaded = viewModel.uiState.first { it is PlaylistDetailUiState.Loaded } as PlaylistDetailUiState.Loaded
            val toRemove = loaded.entries.first { it.playlistItemId == "entry2" }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )
            viewModel.removeTrack(toRemove)
            val state = viewModel.uiState.value as PlaylistDetailUiState.Loaded

            assertEquals(listOf("entry1", "entry2", "entry3"), state.entries.map { it.playlistItemId })
            assertEquals(3, state.total)
        }

    /**
     * Removal keys on [MusicPlaylistEntryUi.playlistItemId], not [MusicPlaylistEntryUi.trackId]
     * — a playlist can legitimately contain the same track twice under two different playlist
     * entries (e.g. added once by hand, once via an album), and removing one occurrence must
     * not remove both. If [PlaylistDetailViewModel.removeTrack] ever regressed to keying on
     * trackId, this would fail: the surviving entry shares [MusicPlaylistEntryUi.trackId] with
     * the removed one, so a trackId-keyed removal would drop it too.
     */
    @Test
    fun `removeTrack keys on playlistItemId, not trackId, when the same track appears twice`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[
                        {"playlistItemId":"entry1","track":${trackJson("trkA", "Repeat")}},
                        {"playlistItemId":"entry2","track":${trackJson("trkA", "Repeat")}}
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

    // -----------------------------------------------------------------------------
    // appendRemainingToQueue — wave I's cross-page queueing, the playlist counterpart to
    // AlbumDetailViewModelTest's own tests of the same shape. See
    // PlaylistDetailViewModel.appendRemainingToQueue's own doc comment for why this reuses
    // appendRemainingQueuePages unmodified.
    // -----------------------------------------------------------------------------

    @Test
    fun `appendRemainingToQueue against a fully-loaded playlist fetches nothing extra`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[{"playlistItemId":"entry1","track":${trackJson("trkA", "First")}}],
                        "total":1,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")
            viewModel.load()
            viewModel.uiState.first { it is PlaylistDetailUiState.Loaded }

            val pages = mutableListOf<List<net.develivarr.auralis.playback.ResolvedPlayback>>()
            viewModel.appendRemainingToQueue { pages.add(it) }

            // Reaching this assertion at all proves no further request was made — nothing else
            // is enqueued on mockWebServer to answer one.
            assertTrue(pages.isEmpty())
        }

    @Test
    fun `appendRemainingToQueue against a multi-page playlist queues every remaining entry, in playlist order`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[{"playlistItemId":"entry1","track":${trackJson("trkA", "First")}}],
                        "total":3,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")
            viewModel.load()
            viewModel.uiState.first { it is PlaylistDetailUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[
                        {"playlistItemId":"entry2","track":${trackJson("trkB", "Second")}},
                        {"playlistItemId":"entry3","track":${trackJson("trkC", "Third")}}
                    ],"total":3,"startIndex":1}""",
                ),
            )
            val pages = mutableListOf<List<net.develivarr.auralis.playback.ResolvedPlayback>>()
            viewModel.appendRemainingToQueue { pages.add(it) }

            assertEquals(1, pages.size)
            assertEquals(listOf("Second", "Third"), pages[0].map { it.title })
            assertEquals("track:trkB", pages[0][0].mediaId)
            assertTrue(pages[0][0].uri.contains("/jellyfin/tracks/trkB/stream"))
            assertEquals("Road Trip", pages[0][0].subtitle)
        }

    @Test
    fun `appendRemainingToQueue against a failed page fetch stops without retrying`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[{"playlistItemId":"entry1","track":${trackJson("trkA", "First")}}],
                        "total":3,"startIndex":0}""",
                ),
            )
            mockWebServer.enqueue(playlistNameResponse("Road Trip"))
            val viewModel = PlaylistDetailViewModel(musicRepository, "pl1")
            viewModel.load()
            viewModel.uiState.first { it is PlaylistDetailUiState.Loaded }

            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"upstream_error","message":"boom"}}"""),
            )
            val pages = mutableListOf<List<net.develivarr.auralis.playback.ResolvedPlayback>>()
            // Must not throw — a failed page fetch mid-playback is non-fatal.
            viewModel.appendRemainingToQueue { pages.add(it) }

            assertTrue(pages.isEmpty())
        }
}
