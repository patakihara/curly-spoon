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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Covers Android wave 12f's production wiring: [PlayerViewModel.handlePlaybackEnded] (the method
 * the real `Player.Listener`'s `onPlaybackStateChanged(STATE_ENDED)` calls in production — see
 * that override's own doc comment in `PlayerViewModel.kt`) actually advancing the podcast and
 * audiobook queues and issuing the right [PlaybackHandle] command. [PlayerViewModelTest.kt]
 * already covers `playQueue`'s own generation-guard behaviour; this file is deliberately
 * separate so a change to one doesn't force re-reading the other in review.
 *
 * Unlike that file's `ApiClient` fake (which errors if ever called, since none of its tests
 * touch `playItem`/`playEpisode`), these tests route `playItem`/`playEpisode` through a real
 * [PlaybackItemResolver] against a [MockWebServer] — the same pattern
 * `playback/PlaybackItemResolverTest.kt` already establishes for the exact same two-call
 * (`POST .../play` then `GET /items/:id`) shape.
 */
class PlayerViewModelQueueTest {
    private lateinit var handle: FakePlaybackHandle
    private lateinit var mockWebServer: MockWebServer
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var viewModel: PlayerViewModel
    private lateinit var podcastQueue: QueueStore<PodcastQueueEntry>
    private lateinit var audiobookQueue: QueueStore<AudiobookQueueEntry>

    @Before
    fun setUp() {
        // Shared with ApiClient below, not just Dispatchers.Main -- see ApiClient.ioDispatcher's
        // own doc comment for why a fire-and-forget request (playItem/playEpisode/
        // handlePlaybackEnded all launch on viewModelScope rather than suspending the caller)
        // otherwise escapes onto the real Dispatchers.IO pool, invisible to runTest and able to
        // leak past this test's @After -- exactly the UncaughtExceptionsBeforeTest failure this
        // file hit before this was added.
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
        podcastQueue = createQueueStore()
        audiobookQueue = createQueueStore()
        viewModel =
            PlayerViewModel(
                context = ContextWrapper(null),
                playbackItemResolver = playbackItemResolver,
                jellyfinPlaybackReportSender = NoOpJellyfinPlaybackReportSender(),
                controllerOverride = handle,
                toPlayableMediaItem = ::fakeMediaItem,
                podcastQueue = podcastQueue,
                audiobookQueue = audiobookQueue,
            )
        runTest { serverConfigRepository.setBaseUrl(baseUrl) }
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
        Dispatchers.resetMain()
    }

    /** `POST /items/{id}/play` — same fixture shape as `PlaybackItemResolverTest`'s own. */
    private fun enqueuePlayItem(
        itemId: String,
        displayTitle: String = "Book",
    ) {
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"session":{"id":"s-$itemId","libraryItemId":"$itemId","mediaType":"book",
                 "displayTitle":"$displayTitle","duration":100.0,"currentTime":0.0,
                 "audioTracks":[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}],
                 "chapters":[]}}
                """.trimIndent(),
            ),
        )
    }

    /** `GET /items/{id}` — the second call [PlaybackItemResolver] makes, for author/title. */
    private fun enqueueLibraryItem(
        itemId: String,
        title: String = "Book",
    ) {
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"item":{"id":"$itemId","libraryId":"lib1","coverPath":null,
                 "media":{"kind":"book","title":"$title"},"progress":null}}
                """.trimIndent(),
            ),
        )
    }

    /** `POST /items/{itemId}/play` and `GET /items/{itemId}` — [PlaybackItemResolver.resolveEpisode]
     *  makes the same two-call shape as [enqueuePlayItem]/[enqueueLibraryItem], just scoped to an
     *  episode's own track. */
    private fun enqueuePlayEpisode(
        itemId: String,
        episodeId: String,
        displayTitle: String = "Episode",
    ) {
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"session":{"id":"s-$episodeId","libraryItemId":"$itemId","mediaType":"podcast",
                 "displayTitle":"$displayTitle","duration":100.0,"currentTime":0.0,
                 "audioTracks":[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}],
                 "chapters":[]}}
                """.trimIndent(),
            ),
        )
        enqueueLibraryItem(itemId, title = "Podcast")
    }

    @Test
    fun `nothing queued -- playback ending does nothing`() =
        runTest {
            enqueuePlayItem("book-1")
            enqueueLibraryItem("book-1")
            viewModel.playItem("book-1")

            viewModel.handlePlaybackEnded()

            // Still exactly the one setMediaItem from playItem -- no further command issued.
            assertEquals(1, handle.setMediaItemsCalls.size)
            assertTrue(handle.seekToCalls.isEmpty())
        }

    @Test
    fun `a queued podcast episode is loaded when the current episode ends`() =
        runTest {
            enqueuePlayEpisode("show-1", "ep-1")
            viewModel.playEpisode("show-1", "ep-1")
            podcastQueue.enqueueNext(PodcastQueueEntry("show-1", "ep-2", "Episode Two", "Show"))
            enqueuePlayEpisode("show-1", "ep-2", displayTitle = "Episode Two")

            viewModel.handlePlaybackEnded()

            assertEquals(
                listOf("episode:show-1:ep-1", "episode:show-1:ep-2"),
                handle.setMediaItemsCalls.map { items -> items.single().mediaId },
            )
        }

    @Test
    fun `switching to a book and back does not clear the podcast queue`() =
        runTest {
            podcastQueue.enqueueLast(PodcastQueueEntry("show-1", "ep-2", "Episode Two", "Show"))
            enqueuePlayEpisode("show-1", "ep-1")
            viewModel.playEpisode("show-1", "ep-1")

            enqueuePlayItem("book-1")
            enqueueLibraryItem("book-1")
            viewModel.playItem("book-1")

            // docs/ROADMAP.md §12f, requirement 1: playing a book in between must not clear the
            // podcast queue that was already there.
            assertEquals(listOf(PodcastQueueEntry("show-1", "ep-2", "Episode Two", "Show")), podcastQueue.state.value?.order)
        }

    @Test
    fun `a same-book chapter seeks within the current item instead of reloading`() =
        runTest {
            enqueuePlayItem("book-1")
            enqueueLibraryItem("book-1")
            viewModel.playItem("book-1")
            audiobookQueue.enqueueNext(
                AudiobookQueueEntry.Chapter("book-1", "ch-2", "Chapter 2", "Book", startMs = 60_000L),
            )

            viewModel.handlePlaybackEnded()

            // Exactly one setMediaItem call (the original load) -- a reload would add a second.
            assertEquals(1, handle.setMediaItemsCalls.size)
            assertEquals(listOf(60_000L), handle.seekToCalls)
        }

    @Test
    fun `a cross-book chapter loads the other book, then seeks to the chapter start`() =
        runTest {
            enqueuePlayItem("book-1")
            enqueueLibraryItem("book-1")
            viewModel.playItem("book-1")
            audiobookQueue.enqueueNext(
                AudiobookQueueEntry.Chapter("book-2", "ch-1", "Chapter 1", "Book Two", startMs = 12_000L),
            )
            enqueuePlayItem("book-2", displayTitle = "Book Two")
            enqueueLibraryItem("book-2", title = "Book Two")

            viewModel.handlePlaybackEnded()

            assertEquals(
                listOf("book-1", "book-2"),
                handle.setMediaItemsCalls.map { items -> items.single().mediaId },
            )
            assertEquals(listOf(12_000L), handle.seekToCalls)
        }

    @Test
    fun `a music queue is seeded on playQueue and is independent of the podcast and audiobook queues`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("t1"), resolvedTrack("t2")) })

            assertEquals(
                listOf(MusicQueueEntry("t1", "t1", null), MusicQueueEntry("t2", "t2", null)),
                viewModel.musicQueue.state.value?.order,
            )
            assertNull(podcastQueue.state.value)
            assertNull(audiobookQueue.state.value)
        }

    @Test
    fun `clearing the audiobook queue does not stop playback or touch the podcast queue`() =
        runTest {
            enqueuePlayItem("book-1")
            enqueueLibraryItem("book-1")
            viewModel.playItem("book-1")
            audiobookQueue.enqueueNext(AudiobookQueueEntry.Item("book-2", "Book Two"))
            podcastQueue.enqueueLast(PodcastQueueEntry("show-1", "ep-1", "Episode One", "Show"))

            audiobookQueue.clearQueue()

            assertNull(audiobookQueue.state.value)
            assertEquals(listOf(PodcastQueueEntry("show-1", "ep-1", "Episode One", "Show")), podcastQueue.state.value?.order)
            // Playback itself is untouched by clearing the queue.
            assertEquals(1, handle.playCallCount)
        }

    /**
     * Android wave 12f's queue-view "Clear queue" action, music branch. This is the assertion
     * that pins the whole point of the wave (see [PlayerViewModel.clearActiveQueue]'s own doc
     * comment): a redirect back to resetting [PlayerViewModel.musicQueue] instead of calling
     * [PlaybackHandle.clearMediaItems] would pass a `musicQueue.state`-only assertion while doing
     * nothing to what Media3 actually plays next -- so this asserts on [FakePlaybackHandle]
     * directly, never on the store.
     */
    @Test
    fun `clearing the active queue while music is playing calls clearMediaItems on the handle`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("t1"), resolvedTrack("t2")) })

            viewModel.clearActiveQueue()

            assertEquals(1, handle.clearMediaItemsCallCount)
        }

    /**
     * The [QueueContentType.PODCAST] counterpart -- clearing while a podcast is the live content
     * type must empty [podcastQueue] and must **not** reach the handle at all, matching
     * `docs/HANDOVER.md`'s "writer must name its reader" lesson: a podcast queue's real source of
     * truth is [QueueStore], not Media3, so the music-only [PlaybackHandle.clearMediaItems] path
     * has no business firing here.
     */
    @Test
    fun `clearing the active queue while a podcast is playing empties the podcast queue and does not touch the handle`() =
        runTest {
            enqueuePlayEpisode("show-1", "ep-1")
            viewModel.playEpisode("show-1", "ep-1")
            podcastQueue.enqueueNext(PodcastQueueEntry("show-1", "ep-2", "Episode Two", "Show"))

            viewModel.clearActiveQueue()

            assertNull(podcastQueue.state.value)
            assertEquals(0, handle.clearMediaItemsCallCount)
        }
}

private fun fakeMediaItem(resolved: ResolvedPlayback): MediaItem =
    MediaItem.Builder()
        .setMediaId(resolved.mediaId)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(resolved.title)
                .apply {
                    resolved.artist?.let { setArtist(it) }
                    resolved.subtitle?.let { setSubtitle(it) }
                }
                .build(),
        )
        .build()

private fun resolvedTrack(id: String): ResolvedPlayback =
    ResolvedPlayback(
        mediaId = id,
        uri = "https://example.invalid/$id.mp3",
        title = id,
        artist = null,
        subtitle = null,
        artworkUrl = null,
        startPositionMs = 0,
    )
