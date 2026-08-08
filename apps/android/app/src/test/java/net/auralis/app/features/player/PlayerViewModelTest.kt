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
// internal, not private: PlayerViewModelQueueTest.kt (Android wave 12f) reuses this fake
// rather than duplicating it -- a duplicate top-level *class* with the same name in another
// file of this package would collide at the JVM level (unlike a duplicate top-level
// *function*, which compiles into a per-file synthetic host class and never collides).
internal class FakePlaybackHandle : PlaybackHandle {
    val setMediaItemsCalls = mutableListOf<List<MediaItem>>()
    val addMediaItemsCalls = mutableListOf<List<MediaItem>>()
    val seekToCalls = mutableListOf<Long>()
    var prepareCallCount = 0
    var playCallCount = 0
    var seekToNextCallCount = 0
    var seekToPreviousCallCount = 0

    /** Recorded (index, item) pairs from [addMediaItem] -- the "Play next" primitive. A real
     *  call, not a no-op stub: a fake whose new method does nothing would make every assertion
     *  against it vacuous (see `docs/HANDOVER.md`'s tautological-test findings). */
    val addMediaItemCalls = mutableListOf<Pair<Int, MediaItem>>()

    /** Settable by a test to simulate "the controller currently has N items loaded and is on
     *  index M" -- see [PlaybackHandle.currentMediaItemIndex]'s own doc comment for why
     *  "Play next" needs this rather than a fixed insertion position. Defaults to -1, matching a
     *  real, empty Media3 playlist. */
    var currentMediaItemIndexValue: Int = -1

    override val currentMediaItemIndex: Int
        get() = currentMediaItemIndexValue

    override fun addMediaItem(
        index: Int,
        item: MediaItem,
    ) {
        addMediaItemCalls.add(index to item)
    }

    /** Backing list for [mediaItemCount]/[getMediaItemAt]/[removeMediaItem] (Android wave 12f) --
     *  a real, mutable playlist simulation, not a stub: [removeMediaItem]/[clearMediaItems]
     *  actually shrink it, so a test asserting against [mediaItemCount] after either call is
     *  exercising real behaviour rather than a vacuously-passing no-op (see
     *  `docs/HANDOVER.md`'s tautological-test findings). A test that wants a non-empty playlist
     *  populates this directly. */
    val playlist = mutableListOf<MediaItem>()

    /** Count of [clearMediaItems] calls -- the assertion that pins wave 12f's whole point: the
     *  queue view's "Clear queue" action for music must call this, not merely reset
     *  [PlayerViewModel.musicQueue]. */
    var clearMediaItemsCallCount = 0

    /** Recorded indices passed to [removeMediaItem]. */
    val removeMediaItemCalls = mutableListOf<Int>()

    override val mediaItemCount: Int
        get() = playlist.size

    override fun getMediaItemAt(index: Int): MediaItem = playlist[index]

    override fun removeMediaItem(index: Int) {
        removeMediaItemCalls.add(index)
        playlist.removeAt(index)
    }

    override fun clearMediaItems() {
        clearMediaItemsCallCount++
        playlist.clear()
    }

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

    override fun seekTo(positionMs: Long) {
        seekToCalls.add(positionMs)
    }

    override fun seekToNext() {
        seekToNextCallCount++
    }

    override fun seekToPrevious() {
        seekToPreviousCallCount++
    }
}

/** No-op — these tests never involve a music item, so nothing should ever call this. `internal`
 *  for the same cross-file reuse reason as [FakePlaybackHandle] above. */
internal class NoOpJellyfinPlaybackReportSender : JellyfinPlaybackReportSender {
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
 * [net.auralis.app.playback.MediaItemConversions.toMediaItem] calls `MediaItem.Builder.setUri`
 * *and* `MediaMetadata.Builder.setArtworkUri`, both of which reach `android.net.Uri` and throw
 * under this project's unmocked test `android.jar` (no Robolectric here). This fake carries
 * `mediaId`/title/artist/subtitle — everything these tests need, including the Android
 * wave 12a-A2 `PlayerUiState.Playing.artist`/`subtitle` propagation, none of which touches
 * `Uri` — but deliberately never calls `setArtworkUri`: [ResolvedPlayback.artworkUrl] stays
 * untested end-to-end at this layer for exactly the same Uri reason `toMediaItem` itself is
 * isolated into its own untested file (see that file's own doc comment).
 */
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

private fun resolvedTrack(
    id: String,
    artist: String? = null,
    subtitle: String? = null,
): ResolvedPlayback =
    ResolvedPlayback(
        mediaId = id,
        uri = "https://example.invalid/$id.mp3",
        title = id,
        artist = artist,
        subtitle = subtitle,
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

    /**
     * Covers `PlayerUiState.Playing.isMusic`, `shuffleEnabled` and `repeatMode` (Android wave
     * H) at the `PlayerViewModel` level, plus `toggleShuffle`/`cycleRepeatMode` — previously
     * untested at this layer per `docs/HANDOVER.md`'s wave H review note. Uses [FakePlaybackHandle]
     * as `controllerOverride`, same as every other test in this file, via [playQueue] rather than
     * [PlayerViewModel.playItem]/`playEpisode` (both would need a real `playbackItemResolver`
     * round trip this suite deliberately avoids — see the class doc comment above).
     *
     * One real gap: [PlayerViewModel]'s `Player.Listener.onShuffleModeEnabledChanged`/
     * `onRepeatModeChanged` overrides — the callbacks that mirror a real `MediaController`'s
     * shuffle/repeat state back into `_uiState` — are registered only inside
     * `connectedController()`, which `controllerOverride` bypasses entirely (see
     * [PlaybackHandle]'s own doc comment: the wider listener-registration machinery is
     * deliberately outside this seam). So the listener path itself is unreachable from this
     * file without adding new production surface, which the spec for this wave says not to do.
     * What *is* reachable, and is what these tests pin: `playResolved`/`playQueue` read
     * `shuffleModeEnabled`/`repeatMode` off the controller at play time to seed
     * `PlayerUiState.Playing` (rather than defaulting both to off), and `toggleShuffle`/
     * `cycleRepeatMode` write straight to [PlaybackHandle] without also writing `_uiState`
     * optimistically — both verified against the real `PlayerViewModel.kt` source, not assumed.
     */
    @Test
    fun `a music item's Playing state reflects the handle's shuffle and repeat mode at play time`() =
        runTest {
            handle.shuffleModeEnabled = true
            handle.repeatMode = Player.REPEAT_MODE_ALL

            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("track:t1")) })

            val state = viewModel.uiState.value
            assertTrue(state is PlayerUiState.Playing)
            state as PlayerUiState.Playing
            assertTrue("a track: media id must be recognised as music", state.isMusic)
            assertTrue(state.shuffleEnabled)
            assertEquals(Player.REPEAT_MODE_ALL, state.repeatMode)
        }

    @Test
    fun `a book-prefixed item is not music, regardless of the handle's shuffle state`() =
        runTest {
            handle.shuffleModeEnabled = true

            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("book:b1")) })

            val state = viewModel.uiState.value
            assertTrue(state is PlayerUiState.Playing)
            assertTrue("a book: media id must never be treated as music", !(state as PlayerUiState.Playing).isMusic)
        }

    @Test
    fun `an episode-prefixed item is not music`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("episode:e1:ep1")) })

            val state = viewModel.uiState.value
            assertTrue(state is PlayerUiState.Playing)
            assertTrue(
                "an episode: media id must never be treated as music",
                !(state as PlayerUiState.Playing).isMusic,
            )
        }

    @Test
    fun `toggleShuffle flips the handle's shuffle mode but does not itself write uiState`() =
        runTest {
            handle.shuffleModeEnabled = false
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("track:t1")) })
            val stateBeforeToggle = viewModel.uiState.value as PlayerUiState.Playing
            assertTrue("seeded false at play time", !stateBeforeToggle.shuffleEnabled)

            viewModel.toggleShuffle()

            // The command reached the handle...
            assertTrue("toggleShuffle must flip the underlying handle's shuffle mode", handle.shuffleModeEnabled)
            // ...but PlayerViewModel writes no optimistic copy of its own: with controllerOverride
            // bypassing the real MediaController's Player.Listener (see this test's own doc
            // comment), nothing updates _uiState after playQueue's initial seed, so it must still
            // read exactly what it did right after playQueue — not the handle's new value.
            val stateAfterToggle = viewModel.uiState.value as PlayerUiState.Playing
            assertTrue(
                "PlayerViewModel must not optimistically flip shuffleEnabled itself",
                !stateAfterToggle.shuffleEnabled,
            )
        }

    @Test
    fun `cycleRepeatMode advances the handle's repeat mode but does not itself write uiState`() =
        runTest {
            handle.repeatMode = Player.REPEAT_MODE_OFF
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("track:t1")) })
            val stateBeforeCycle = viewModel.uiState.value as PlayerUiState.Playing
            assertEquals(Player.REPEAT_MODE_OFF, stateBeforeCycle.repeatMode)

            viewModel.cycleRepeatMode()

            assertEquals(
                "cycleRepeatMode must advance the underlying handle off -> all",
                Player.REPEAT_MODE_ALL,
                handle.repeatMode,
            )
            val stateAfterCycle = viewModel.uiState.value as PlayerUiState.Playing
            assertEquals(
                "PlayerViewModel must not optimistically advance repeatMode itself",
                Player.REPEAT_MODE_OFF,
                stateAfterCycle.repeatMode,
            )
        }

    @Test
    fun `toggleShuffle and cycleRepeatMode are no-ops on a non-music item`() =
        runTest {
            handle.shuffleModeEnabled = false
            handle.repeatMode = Player.REPEAT_MODE_OFF
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("book:b1")) })

            viewModel.toggleShuffle()
            viewModel.cycleRepeatMode()

            assertTrue(
                "toggleShuffle must not touch the handle when the current item isn't music",
                !handle.shuffleModeEnabled,
            )
            assertEquals(
                "cycleRepeatMode must not touch the handle when the current item isn't music",
                Player.REPEAT_MODE_OFF,
                handle.repeatMode,
            )
        }

    /**
     * [PlayerViewModel.seekTo]/[PlayerViewModel.skipToNext]/[PlayerViewModel.skipToPrevious]
     * (Android wave 12a-A2) are the command surface the Now Playing seek bar and transport row
     * call. This pins that they forward straight to [PlaybackHandle] with no clamping or
     * optimistic `_uiState` write of their own — [NowPlayingFormat]'s pure functions already own
     * clamping, and `PlaybackHandle.seekTo` documents that `Player.seekTo` clamps internally, so
     * a second clamp here would be dead code duplicating a contract [PlaybackHandle] already
     * states.
     */
    @Test
    fun `seekTo, skipToNext and skipToPrevious forward straight to the handle`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("a1")) })

            viewModel.seekTo(42_000L)
            viewModel.skipToNext()
            viewModel.skipToPrevious()

            assertEquals(listOf(42_000L), handle.seekToCalls)
            assertEquals(1, handle.seekToNextCallCount)
            assertEquals(1, handle.seekToPreviousCallCount)
        }

    @Test
    fun `seekTo, skipToNext and skipToPrevious are no-ops when nothing is playing`() =
        runTest {
            viewModel.seekTo(1_000L)
            viewModel.skipToNext()
            viewModel.skipToPrevious()

            assertTrue("seekTo must not reach the handle with nothing loaded", handle.seekToCalls.isEmpty())
            assertEquals(0, handle.seekToNextCallCount)
            assertEquals(0, handle.seekToPreviousCallCount)
        }

    /**
     * [PlayerUiState.Playing.artist]/[PlayerUiState.Playing.subtitle] (Android wave 12a-A2) —
     * the Now Playing subtitle line's data source. Populated straight from the played
     * [MediaItem]'s own [MediaMetadata], which [fakeMediaItem] sets from [ResolvedPlayback]'s
     * `artist`/`subtitle` without touching `Uri` (see [fakeMediaItem]'s own doc comment for why
     * `artworkUri` stays untested here).
     */
    @Test
    fun `Playing state carries the played item's artist and subtitle`() =
        runTest {
            viewModel.playQueue(
                buildQueue = {
                    listOf(resolvedTrack("book:b1", artist = "J.R.R. Tolkien", subtitle = "An Audiobook"))
                },
            )

            val state = viewModel.uiState.value as PlayerUiState.Playing
            assertEquals("J.R.R. Tolkien", state.artist)
            assertEquals("An Audiobook", state.subtitle)
        }

    /**
     * The [PlayerUiState.Playing.artist]/[subtitle] counterpart to the pre-existing
     * `onMediaItemTransition` coverage this file lacked for `isMusic`/`musicItemId`: a queue
     * advance (not just the initial `playQueue` call) must refresh them for the new item, not
     * leave the previous item's values stuck. Exercised through [PlayerViewModel.playQueue]'s
     * own append path (`fetchRemaining`) rather than a raw `Player.Listener` invocation — this
     * suite has no way to fire Media3 listener callbacks directly, since `controllerOverride`
     * bypasses the whole `connectedController()` listener-registration block (see this file's
     * class doc comment) — so this test instead pins the *state carried at play time* for a
     * second, distinct item, which is the part `onMediaItemTransition`'s mirrored `.copy(...)`
     * and `playResolved`/`playQueue`'s own initial write are meant to agree on.
     */
    @Test
    fun `a second playQueue call replaces the previous item's artist and subtitle, not merges them`() =
        runTest {
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("a1", artist = "Artist A")) })
            viewModel.playQueue(buildQueue = { listOf(resolvedTrack("b1", subtitle = "Subtitle B")) })

            val state = viewModel.uiState.value as PlayerUiState.Playing
            assertEquals(null, state.artist)
            assertEquals("Subtitle B", state.subtitle)
        }
}
