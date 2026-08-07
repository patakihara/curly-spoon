package net.auralis.app.features.player

import android.content.ContextWrapper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
import net.auralis.app.playback.PlaybackItemResolver
import net.auralis.app.playback.ResolvedPlayback
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
 * Covers the fix for a shipped defect: [PlayerViewModel.musicQueue]'s own doc comment has the
 * full account, and this file is the regression coverage for it. The context menu's "Play
 * next"/"Play last" reported success and inserted nothing, because the wave that added them
 * wrote into [musicQueue] — a store nothing ever reads back into playback — instead of into
 * Media3's real playlist. [PlayerViewModel.enqueueTrackNext]/[PlayerViewModel.enqueueTrackLast]
 * are the fix: insert directly into [PlaybackHandle], and refuse (without inserting) unless a
 * music playlist is actually loaded.
 *
 * Same [FakePlaybackHandle]/[ResolvedPlayback]-over-[MockWebServer] pattern as
 * `PlayerViewModelQueueTest.kt` — reused rather than shared, since neither file's private test
 * helpers cross a file boundary in Kotlin.
 */
class PlayerViewModelEnqueueTest {
    private lateinit var handle: FakePlaybackHandle
    private lateinit var mockWebServer: MockWebServer
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var viewModel: PlayerViewModel

    @Before
    fun setUp() {
        val testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        handle = FakePlaybackHandle()
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        val baseUrl = mockWebServer.url("/").toString()
        val apiClient = ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { baseUrl }
        val playbackItemResolver = PlaybackItemResolver(apiClient, serverConfigRepository)
        viewModel =
            PlayerViewModel(
                context = ContextWrapper(null),
                playbackItemResolver = playbackItemResolver,
                jellyfinPlaybackReportSender = NoOpJellyfinPlaybackReportSender(),
                controllerOverride = handle,
                toPlayableMediaItem = ::fakeEnqueueMediaItem,
            )
        runTest { serverConfigRepository.setBaseUrl(baseUrl) }
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
        Dispatchers.resetMain()
    }

    private fun enqueuePlayItem(itemId: String) {
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"session":{"id":"s-$itemId","libraryItemId":"$itemId","mediaType":"book",
                 "displayTitle":"Book","duration":100.0,"currentTime":0.0,
                 "audioTracks":[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}],
                 "chapters":[]}}
                """.trimIndent(),
            ),
        )
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"item":{"id":"$itemId","libraryId":"lib1","coverPath":null,
                 "media":{"kind":"book","title":"Book"},"progress":null}}
                """.trimIndent(),
            ),
        )
    }

    private fun enqueuePlayEpisode(
        itemId: String,
        episodeId: String,
    ) {
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"session":{"id":"s-$episodeId","libraryItemId":"$itemId","mediaType":"podcast",
                 "displayTitle":"Episode","duration":100.0,"currentTime":0.0,
                 "audioTracks":[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}],
                 "chapters":[]}}
                """.trimIndent(),
            ),
        )
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"item":{"id":"$itemId","libraryId":"lib1","coverPath":null,
                 "media":{"kind":"book","title":"Podcast"},"progress":null}}
                """.trimIndent(),
            ),
        )
    }

    // -- Refusal: nothing is playing, or something non-music is playing ---------------------

    @Test
    fun `play next refuses when nothing is playing`() =
        runTest {
            val inserted = viewModel.enqueueTrackNext(track("t1"))

            assertFalse(inserted)
            assertTrue(handle.addMediaItemCalls.isEmpty())
            assertTrue(handle.addMediaItemsCalls.isEmpty())
        }

    @Test
    fun `play last refuses when nothing is playing`() =
        runTest {
            val inserted = viewModel.enqueueTrackLast(track("t1"))

            assertFalse(inserted)
            assertTrue(handle.addMediaItemsCalls.isEmpty())
        }

    @Test
    fun `play next refuses while an audiobook is playing`() =
        runTest {
            enqueuePlayItem("book-1")
            viewModel.playItem("book-1")

            val inserted = viewModel.enqueueTrackNext(track("t1"))

            assertFalse(inserted)
            assertTrue(handle.addMediaItemCalls.isEmpty())
        }

    @Test
    fun `play last refuses while a podcast episode is playing`() =
        runTest {
            enqueuePlayEpisode("show-1", "ep-1")
            viewModel.playEpisode("show-1", "ep-1")

            val inserted = viewModel.enqueueTrackLast(track("t1"))

            assertFalse(inserted)
            assertTrue(handle.addMediaItemsCalls.isEmpty())
        }

    // -- Success: a music playlist is loaded -- insert into the real Media3 playlist --------

    @Test
    fun `play next inserts immediately after the currently playing item`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("current"), resolvedTrack("other")) })
            // Simulates Media3 reporting the controller is now sitting on index 0 of a two-item
            // playlist -- the real MediaControllerPlaybackHandle reads this straight off the
            // controller; this fake is told directly, matching FakePlaybackHandle's own pattern.
            handle.currentMediaItemIndexValue = 0

            val inserted = viewModel.enqueueTrackNext(track("t1"))

            assertTrue(inserted)
            assertEquals(1, handle.addMediaItemCalls.size)
            val (index, item) = handle.addMediaItemCalls.single()
            assertEquals(1, index)
            assertEquals("track:t1", item.mediaId)
            // The refusal path must never also fire alongside a real insert.
            assertTrue(handle.addMediaItemsCalls.isEmpty())
        }

    @Test
    fun `play next inserts after a later current index too, not always at position 1`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("t0"), resolvedTrack("t1"), resolvedTrack("t2")) })
            handle.currentMediaItemIndexValue = 2

            viewModel.enqueueTrackNext(track("new"))

            assertEquals(3, handle.addMediaItemCalls.single().first)
        }

    @Test
    fun `play last appends to the end of the real Media3 playlist`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("current")) })

            val inserted = viewModel.enqueueTrackLast(track("t1"))

            assertTrue(inserted)
            assertEquals(1, handle.addMediaItemsCalls.size)
            assertEquals(listOf("track:t1"), handle.addMediaItemsCalls.single().map { it.mediaId })
            // The insert-after-current primitive must never also fire for "play last".
            assertTrue(handle.addMediaItemCalls.isEmpty())
        }

    @Test
    fun `a successful play next does not touch musicQueue -- Media3 is the only real queue`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("current")) })
            val queueBefore = viewModel.musicQueue.state.value

            viewModel.enqueueTrackNext(track("t1"))

            // See musicQueue's own doc comment: this store is write-once (seeded by playQueue)
            // and is deliberately left untouched by the fix, rather than mirrored -- a stale
            // mirror invites exactly the bug this file regression-tests.
            assertEquals(queueBefore, viewModel.musicQueue.state.value)
        }
}

private fun track(id: String): ResolvedPlayback =
    ResolvedPlayback(
        mediaId = "track:$id",
        uri = "https://example.invalid/$id.mp3",
        title = id,
        artist = null,
        subtitle = null,
        artworkUrl = null,
        startPositionMs = 0,
    )

private fun resolvedTrack(id: String): ResolvedPlayback = track(id)

private fun fakeEnqueueMediaItem(resolved: ResolvedPlayback): MediaItem =
    MediaItem.Builder()
        .setMediaId(resolved.mediaId)
        .setMediaMetadata(MediaMetadata.Builder().setTitle(resolved.title).build())
        .build()
