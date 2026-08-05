package net.auralis.app.features.player

import android.content.ContextWrapper
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import kotlinx.coroutines.CompletableDeferred
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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * [PlaybackHandle] fake that records every command [PlayerViewModel] issues, so a test can
 * assert on exactly what queue content ended up dispatched — without ever constructing a real
 * `MediaController` (impossible under this project's plain JVM unit tests; see [PlaybackHandle]'s
 * own doc comment).
 */
private class FakePlaybackHandle : PlaybackHandle {
    val setMediaItemsCalls = mutableListOf<List<MediaItem>>()
    val addMediaItemsCalls = mutableListOf<List<MediaItem>>()
    var prepareCallCount = 0
    var playCallCount = 0

    override var shuffleModeEnabled: Boolean = false
    override var repeatMode: Int = Player.REPEAT_MODE_OFF
    override val isPlaying: Boolean
        get() = playCallCount > 0

    override fun setMediaItem(item: MediaItem) {
        setMediaItemsCalls.add(listOf(item))
    }

    override fun setMediaItems(items: List<MediaItem>) {
        setMediaItemsCalls.add(items)
    }

    override fun addMediaItems(items: List<MediaItem>) {
        addMediaItemsCalls.add(items)
    }

    override fun prepare() {
        prepareCallCount++
    }

    override fun play() {
        playCallCount++
    }

    override fun pause() {
        // Unused by these tests.
    }
}

/** No-op — these tests never involve a music item, so nothing should ever call this. */
private class NoOpJellyfinPlaybackReportSender : JellyfinPlaybackReportSender {
    override suspend fun reportStart(
        itemId: String,
        positionSeconds: Double,
    ) {
    }

    override suspend fun reportProgress(
        itemId: String,
        positionSeconds: Double,
        isPaused: Boolean,
    ) {
    }

    override suspend fun reportStopped(
        itemId: String,
        positionSeconds: Double,
    ) {
    }
}

/**
 * Builds a bare, Uri-free [MediaItem] from [resolved] — real
 * [net.auralis.app.playback.MediaItemConversions.toMediaItem] calls `MediaItem.Builder.setUri`,
 * which reaches `android.net.Uri.parse` and throws under this project's unmocked test
 * `android.jar` (no Robolectric here). This fake conversion carries only `mediaId`/title, which
 * is all these tests need to tell queue pages apart, and is exactly the seam
 * [PlayerViewModel]'s `toPlayableMediaItem` constructor parameter exists for.
 */
private fun fakeMediaItem(resolved: ResolvedPlayback): MediaItem =
    MediaItem.Builder()
        .setMediaId(resolved.mediaId)
        .setMediaMetadata(MediaMetadata.Builder().setTitle(resolved.title).build())
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

/**
 * Covers [PlayerViewModel.playQueue]'s `queueGeneration` stale-append guard — added in wave I
 * (`731cdcf`) alongside cross-page queueing, and never previously exercised: this is
 * [PlayerViewModel]'s first test file.
 *
 * Every test here constructs [PlayerViewModel] with [FakePlaybackHandle] as `controllerOverride`
 * and [fakeMediaItem] as `toPlayableMediaItem`, bypassing both the real `MediaController`
 * connection and the real `Uri`-touching `MediaItem` conversion — neither is reachable from a
 * plain JVM unit test in this project (see [PlaybackHandle]'s and `toPlayableMediaItem`'s own doc
 * comments on [PlayerViewModel] for why). `context`/`playbackItemResolver` are still required by
 * the constructor but are never dereferenced by anything these tests call: `playQueue` doesn't
 * touch either, and `controllerOverride` being non-null means `connectedController()` — the only
 * place `context` is read — is never invoked.
 */
class PlayerViewModelTest {
    private lateinit var handle: FakePlaybackHandle
    private lateinit var viewModel: PlayerViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        handle = FakePlaybackHandle()
        val keyValueStore = FakeKeyValueStore()
        val serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        // Never actually dispatched: nothing in this test suite calls playItem/playEpisode, the
        // only callers of ApiClient via PlaybackItemResolver.
        val apiClient = ApiClient(httpClient, cookieJar) { error("not used by these tests") }
        val playbackItemResolver = PlaybackItemResolver(apiClient, serverConfigRepository)
        viewModel =
            PlayerViewModel(
                context = ContextWrapper(null),
                playbackItemResolver = playbackItemResolver,
                jellyfinPlaybackReportSender = NoOpJellyfinPlaybackReportSender(),
                controllerOverride = handle,
                toPlayableMediaItem = ::fakeMediaItem,
            )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `a single page with no interruption appends every page fetchRemaining supplies`() =
        runTest {
            viewModel.playQueue(
                buildQueue = { listOf(resolvedTrack("t1")) },
                fetchRemaining = { onPage ->
                    onPage(listOf(resolvedTrack("t2"), resolvedTrack("t3")))
                    onPage(listOf(resolvedTrack("t4")))
                },
            )

            assertEquals(listOf(listOf("t1")), handle.setMediaItemsCalls.map { items -> items.map { it.mediaId } })
            assertEquals(
                listOf(listOf("t2", "t3"), listOf("t4")),
                handle.addMediaItemsCalls.map { items -> items.map { it.mediaId } },
            )
            assertEquals(1, handle.prepareCallCount)
            assertEquals(1, handle.playCallCount)
        }

    @Test
    fun `a null fetchRemaining appends nothing`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("only")) })

            assertEquals(listOf(listOf("only")), handle.setMediaItemsCalls.map { items -> items.map { it.mediaId } })
            assertTrue(handle.addMediaItemsCalls.isEmpty())
        }

    /**
     * The reason this file exists: album A starts playing, and its background page fetch is
     * still in flight (parked on [pendingAPage]) when the user taps play on album B. Only once
     * B's own `playQueue` call has fully run — bumping `queueGeneration` past the value A's call
     * captured — does A's pending page get released. It must never reach the player, and B's own
     * queue must be untouched by it.
     *
     * Deleting the `queueGeneration != myGeneration` check in [PlayerViewModel.playQueue] would
     * make this test fail: with the check gone, releasing [pendingAPage] runs
     * `activeController().addMediaItems(page.map(toPlayableMediaItem))` unconditionally, so
     * `handle.addMediaItemsCalls` would gain an entry for `["a2"]` — which the assertion below
     * explicitly forbids. Nothing else in this test would coincidentally also block that call:
     * [FakePlaybackHandle] has no guard of its own, and `page.isEmpty()` is false, so the
     * generation check is the only thing standing between `pendingAPage`'s release and a call
     * landing in `addMediaItemsCalls`.
     */
    @Test
    fun `a late page from an interrupted album never reaches a queue a newer playQueue call started`() =
        runTest {
            val pendingAPage = CompletableDeferred<Unit>()
            var aFetchRemainingCompleted = false

            // Starts album A. `buildQueue`/the first `fetchRemaining` call up to `pendingAPage`'s
            // `await()` all run synchronously on the UnconfinedTestDispatcher installed in
            // setUp() — so by the time this call returns, A's first page is already the "live"
            // queue and its background fetch is parked, suspended, at `pendingAPage.await()`.
            viewModel.playQueue(
                buildQueue = { listOf(resolvedTrack("a1")) },
                fetchRemaining = { onPage ->
                    pendingAPage.await()
                    onPage(listOf(resolvedTrack("a2")))
                    aFetchRemainingCompleted = true
                },
            )
            assertEquals(listOf(listOf("a1")), handle.setMediaItemsCalls.map { items -> items.map { it.mediaId } })

            // The user taps play on album B while A's page fetch is still parked. This bumps
            // queueGeneration past what A's call captured, and — like A's own call — runs
            // synchronously to completion (no fetchRemaining of its own here, so there's no
            // suspension point for it to park on).
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("b1")) })
            assertEquals(
                listOf(listOf("a1"), listOf("b1")),
                handle.setMediaItemsCalls.map { items -> items.map { it.mediaId } },
            )

            // Release A's pending page now that B is the live queue. This resumes A's parked
            // continuation, which calls onPage(["a2"]) — the generation guard inside that
            // callback is what must stop it from reaching the player.
            pendingAPage.complete(Unit)

            // Keep observing past the point A's page could have landed, not stop the instant it
            // was released — a check made before the continuation actually runs would prove
            // nothing. UnconfinedTestDispatcher resumes a completed CompletableDeferred's
            // continuation inline within complete() above, so by this point A's fetchRemaining
            // lambda has already run to its own completion.
            assertTrue("A's fetchRemaining lambda should have finished running", aFetchRemainingCompleted)

            // The actual assertion this whole test exists for: A's late page never reached the
            // player, and B's queue is exactly what it was, untouched by A's straggler.
            assertTrue(
                "A's late page must never be appended once a newer playQueue() call has started",
                handle.addMediaItemsCalls.isEmpty(),
            )
            assertEquals(
                listOf(listOf("a1"), listOf("b1")),
                handle.setMediaItemsCalls.map { items -> items.map { it.mediaId } },
            )
        }
}
