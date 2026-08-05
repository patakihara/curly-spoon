package net.auralis.app.features.player

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Records every call [JellyfinPlaybackReporter] makes, so tests can assert on decisions
 * ([JellyfinPlaybackReporter]'s whole job) without a real network round trip — see that class's
 * own doc comment on [JellyfinPlaybackReportSender] for why a fake, not `MockWebServer`, is the
 * right seam here.
 */
private class FakeJellyfinPlaybackReportSender : JellyfinPlaybackReportSender {
    data class ProgressCall(val itemId: String, val positionSeconds: Double, val isPaused: Boolean)

    val starts = mutableListOf<Pair<String, Double>>()
    val progress = mutableListOf<ProgressCall>()
    val stops = mutableListOf<Pair<String, Double>>()

    /** When true, the next call to any report method throws instead of recording — consumed
     * (reset to false) the moment it fires, so only one call fails. */
    var failNextCall = false

    override suspend fun reportStart(
        itemId: String,
        positionSeconds: Double,
    ) {
        maybeFail()
        starts.add(itemId to positionSeconds)
    }

    override suspend fun reportProgress(
        itemId: String,
        positionSeconds: Double,
        isPaused: Boolean,
    ) {
        maybeFail()
        progress.add(ProgressCall(itemId, positionSeconds, isPaused))
    }

    override suspend fun reportStopped(
        itemId: String,
        positionSeconds: Double,
    ) {
        maybeFail()
        stops.add(itemId to positionSeconds)
    }

    private fun maybeFail() {
        if (failNextCall) {
            failNextCall = false
            throw RuntimeException("simulated upstream failure")
        }
    }
}

/**
 * [JellyfinPlaybackReporter] dispatches every report through `CoroutineScope.launch`; an
 * [UnconfinedTestDispatcher]-backed scope runs each of those launches eagerly, to completion,
 * before the triggering call (`onTick`, `onMediaItemChanged`, ...) returns — so assertions below
 * read [FakeJellyfinPlaybackReportSender]'s recorded calls synchronously, the same pattern
 * `docs/HANDOVER.md`'s "Android CI" section describes for `ApiClient`'s own constructor-injected
 * dispatcher (a real, not virtual-time, unconfined dispatcher; no `runTest` needed since nothing
 * here awaits simulated delay).
 */
class JellyfinPlaybackReporterTest {
    private lateinit var sender: FakeJellyfinPlaybackReportSender
    private lateinit var reporter: JellyfinPlaybackReporter

    @Before
    fun setUp() {
        sender = FakeJellyfinPlaybackReportSender()
        reporter = JellyfinPlaybackReporter(sender, CoroutineScope(UnconfinedTestDispatcher()))
    }

    @Test
    fun `starting a music item sends one start report and an immediate progress report`() {
        reporter.onMediaItemChanged(newMediaId = "track:abc", positionSeconds = 0.0, isPlaying = true)

        assertEquals(listOf("abc" to 0.0), sender.starts)
        assertEquals(
            listOf(FakeJellyfinPlaybackReportSender.ProgressCall("abc", 0.0, isPaused = false)),
            sender.progress,
        )
    }

    @Test
    fun `a repeated identical tick does not send a duplicate progress report`() {
        reporter.onMediaItemChanged(newMediaId = "track:abc", positionSeconds = 0.0, isPlaying = true)
        sender.progress.clear()

        reporter.onTick(positionSeconds = 30.0, isPlaying = true)
        assertEquals(1, sender.progress.size)

        sender.progress.clear()
        reporter.onTick(positionSeconds = 30.0, isPlaying = true)
        assertTrue("an unmoving, unchanged tick must not be reported again", sender.progress.isEmpty())
    }

    @Test
    fun `pausing sends a progress report with isPaused true, and resuming clears it`() {
        reporter.onMediaItemChanged(newMediaId = "track:abc", positionSeconds = 0.0, isPlaying = true)
        sender.progress.clear()

        reporter.onIsPlayingChanged(positionSeconds = 45.0, isPlaying = false)
        assertEquals(
            FakeJellyfinPlaybackReportSender.ProgressCall("abc", 45.0, isPaused = true),
            sender.progress.last(),
        )

        reporter.onIsPlayingChanged(positionSeconds = 45.0, isPlaying = true)
        assertEquals(
            FakeJellyfinPlaybackReportSender.ProgressCall("abc", 45.0, isPaused = false),
            sender.progress.last(),
        )
    }

    @Test
    fun `a track change fires stopped for the previous item then start for the new one`() {
        reporter.onMediaItemChanged(newMediaId = "track:abc", positionSeconds = 0.0, isPlaying = true)
        reporter.onTick(positionSeconds = 60.0, isPlaying = true)

        reporter.onMediaItemChanged(newMediaId = "track:def", positionSeconds = 0.0, isPlaying = true)

        assertEquals(listOf("abc" to 60.0), sender.stops)
        assertEquals(listOf("abc" to 0.0, "def" to 0.0), sender.starts)
    }

    @Test
    fun `a seek reports the new position immediately`() {
        reporter.onMediaItemChanged(newMediaId = "track:abc", positionSeconds = 0.0, isPlaying = true)
        sender.progress.clear()

        reporter.onSeek(positionSeconds = 120.0, isPlaying = true)

        assertEquals(
            FakeJellyfinPlaybackReportSender.ProgressCall("abc", 120.0, isPaused = false),
            sender.progress.last(),
        )
    }

    @Test
    fun `a non-music item produces zero Jellyfin reports across every entry point`() {
        reporter.onMediaItemChanged(newMediaId = "book-item-1", positionSeconds = 0.0, isPlaying = true)
        reporter.onTick(positionSeconds = 30.0, isPlaying = true)
        reporter.onIsPlayingChanged(positionSeconds = 30.0, isPlaying = false)
        reporter.onSeek(positionSeconds = 45.0, isPlaying = true)
        reporter.onStopped(positionSeconds = 45.0)

        assertTrue(sender.starts.isEmpty())
        assertTrue(sender.progress.isEmpty())
        assertTrue(sender.stops.isEmpty())
    }

    @Test
    fun `a podcast episode media id also produces zero Jellyfin reports`() {
        reporter.onMediaItemChanged(newMediaId = "episode:item-1:episode-1", positionSeconds = 0.0, isPlaying = true)
        reporter.onTick(positionSeconds = 30.0, isPlaying = true)

        assertTrue(sender.starts.isEmpty())
        assertTrue(sender.progress.isEmpty())
    }

    @Test
    fun `a failing send does not throw and does not stop later reports`() {
        reporter.onMediaItemChanged(newMediaId = "track:abc", positionSeconds = 0.0, isPlaying = true)
        sender.progress.clear()
        sender.failNextCall = true

        reporter.onTick(positionSeconds = 30.0, isPlaying = true)
        assertTrue("the failed call must not have been recorded", sender.progress.isEmpty())

        reporter.onTick(positionSeconds = 90.0, isPlaying = true)
        assertEquals(
            listOf(FakeJellyfinPlaybackReportSender.ProgressCall("abc", 90.0, isPaused = false)),
            sender.progress,
        )
    }

    @Test
    fun `onStopped sends a final stopped report and is a no-op once nothing is current`() {
        reporter.onMediaItemChanged(newMediaId = "track:abc", positionSeconds = 0.0, isPlaying = true)
        reporter.onTick(positionSeconds = 50.0, isPlaying = true)

        reporter.onStopped(positionSeconds = 55.0)
        assertEquals(listOf("abc" to 55.0), sender.stops)

        sender.stops.clear()
        reporter.onStopped(positionSeconds = 60.0)
        assertTrue("no music item is current, so this must be a no-op", sender.stops.isEmpty())
    }
}
