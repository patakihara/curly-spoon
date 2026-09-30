package net.develivarr.auralis

import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlin.math.abs
import net.develivarr.auralis.api.ServerConfig
import net.develivarr.auralis.auth.KeystoreTokenStore
import net.develivarr.auralis.auth.SignInResult
import net.develivarr.auralis.play.Playback
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The app's [Playback] playing the recorded four-file book from the real server on recorded
 * upstreams (the `auralisMultiFile` argument the emulator job passes), each file a 5 s stand-in
 * tone the plan is timed by, across the first boundary: the same check as the web's
 * `web/e2e/gapless.spec.ts`.
 *
 * The app signs in as SmokeTest's does, with the browser replaced by following the sign-on's
 * redirects. Every player event is timed on the main thread, and the position the app reports is
 * sampled there against the monotonic clock until the second file has played a second of its own.
 * A pause, a stall or a skip at the boundary shows as wall time and position parting ways.
 */
@RunWith(AndroidJUnit4::class)
class GaplessTest {

    private val app = ApplicationProvider.getApplicationContext<AuralisApp>()
    private val arguments = InstrumentationRegistry.getArguments()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val failures = mutableListOf<String>()

    @After
    fun stop() {
        instrumentation.runOnMainSync { app.graph.playback.release() }
    }

    @Test
    fun M1_play_d_playsTheSecondFileWithNoPauseAndThePositionRunsOn() {
        val key = requireNotNull(arguments.getString(MULTI_FILE)) { "no $MULTI_FILE argument" }
        val ref = requireNotNull(Playback.refOf(key)) { "not a playable ref: $key" }
        app.graph = AppGraph(app, ServerConfig.from(arguments), KeystoreTokenStore(app), OkHttpClient())
        val graph = app.graph
        graph.session.signedOut()
        val callback = followToApp(Uri.parse(graph.signIn.start().toString()))
        assertEquals(SignInResult.SignedIn, graph.signIn.finish(callback))

        val events = mutableListOf<Event>()
        instrumentation.runOnMainSync { graph.playback.player.addListener(Timed(events)) }
        graph.playback.play(ref)

        // The player belongs to the main thread; read it there, judge here. Sampling starts once it
        // first plays, and then keeps every look, playing or not.
        val samples = mutableListOf<Sample>()
        var look = Look()
        val deadline = SystemClock.elapsedRealtime() + TIMEOUT_MS
        while (!(look.index >= 1 && look.within >= ONE_SECOND_MS)) {
            check(SystemClock.elapsedRealtime() < deadline) { said("the second file never played a second: $look") }
            instrumentation.runOnMainSync {
                val player = graph.playback.player
                look = Look(player.currentMediaItemIndex, player.currentPosition, player.playerError)
                if (player.isPlaying || samples.isNotEmpty()) {
                    samples += Sample(SystemClock.elapsedRealtime(), graph.playback.position, look.index)
                }
            }
            look.error?.let { throw AssertionError(said("the player failed: $look"), it) }
            Thread.sleep(POLL_MS)
        }
        val tracks = requireNotNull(graph.playback.plan).tracks
        val seen = synchronized(events) { events.toList() }
        seen.forEach { said(it.toString()) }

        val started = seen.indexOfFirst { it.what == "playing" && it.value }
        val boundary = seen.indexOfFirst { it.what == "transition" && it.value }
        expect(started >= 0) { "the first file never played" }
        expect(boundary > started) { "the player never moved on to the second file by itself" }
        if (started >= 0 && boundary > started) {
            // ExoPlayer's own gapless transition: once playing, it never stops or buffers.
            val between = seen.subList(started + 1, seen.size)
            expect(between.none { (it.what == "playing" && !it.value) || it.what == "buffering" }) {
                "the player paused or buffered once playing: $between"
            }
            val firstPlayed = seen[boundary].at - seen[started].at
            expect(abs(firstPlayed - tracks[0].duration * 1000) <= FIRST_FILE_SLACK_MS) {
                "the first file played $firstPlayed ms, not its ${tracks[0].duration} s"
            }
        }

        // Continuity: between two looks the position gains no more than the time between them
        // plus a little, and never goes back.
        samples.zipWithNext().forEach { (a, b) ->
            val gained = b.position - a.position
            expect(gained >= 0) { "the position went back from ${a.position} to ${b.position}" }
            expect(gained * 1000 <= b.at - a.at + JUMP_SLACK_MS) {
                "the position jumped ${gained} s in ${b.at - a.at} ms, from ${a.position} to ${b.position}"
            }
        }
        // Across the boundary, the position gained tracks the wall time passed: a pause or silence
        // is wall time without position, a skip is position without wall time.
        val crossed = samples.firstOrNull { it.index >= 1 }
        expect(crossed != null) { "no look in the second file" }
        if (crossed != null) {
            val before = samples.lastOrNull { it.at <= crossed.at - WINDOW_MS }
            val after = samples.firstOrNull { it.at >= crossed.at + WINDOW_MS }
            expect(before != null && after != null) { "no looks ${WINDOW_MS} ms either side of the boundary" }
            if (before != null && after != null) {
                val gained = (after.position - before.position) * 1000
                val passed = after.at - before.at
                expect(abs(gained - passed) <= TRACK_SLACK_MS) {
                    "across the boundary the position gained ${gained.toLong()} ms in $passed ms"
                }
                said("across the boundary the position gained ${gained.toLong()} ms in $passed ms")
            }
        }
        expect(samples.any { it.index == 0 && it.position > 0 }) { "no position in the first file" }
        expect(samples.last().position >= tracks[1].offset + 1) {
            "the last position ${samples.last().position} is short of ${tracks[1].offset + 1}"
        }
        assertEquals(said("failed: $failures"), emptyList<String>(), failures)
        said("the second file started with no pause, ${samples.size} looks continuous across ${tracks[1].offset} s")
    }

    /** Keeps [failure], logged as [said] does, unless [ok]; the test fails with all it kept. */
    private fun expect(ok: Boolean, failure: () -> String) {
        if (!ok) failures += said(failure())
    }

    /** Logs [outcome] where the emulator job keeps it with the test results (reports/emulator-tests.txt). */
    private fun said(outcome: String): String = outcome.also { Log.i(TAG, it) }

    /** One player event, on the monotonic clock: what happened, whether it is on, and when. */
    private data class Event(val what: String, val value: Boolean, val at: Long)

    /** Times every event that could be a pause: playing on or off, buffering, a file changing. */
    private class Timed(private val events: MutableList<Event>) : Player.Listener {
        private fun add(what: String, value: Boolean) =
            synchronized(events) { events += Event(what, value, SystemClock.elapsedRealtime()) }

        override fun onIsPlayingChanged(isPlaying: Boolean) = add("playing", isPlaying)

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_BUFFERING) add("buffering", true)
        }

        // `value` is whether the player moved on by itself, as at a file's end.
        override fun onMediaItemTransition(item: MediaItem?, reason: Int) =
            add("transition", reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO)
    }

    /** What the player showed at one look: its file, the time within it, any error. */
    private data class Look(val index: Int = 0, val within: Long = 0, val error: PlaybackException? = null)

    /** The position the app reported, in seconds on the whole item's timeline, and when. */
    private data class Sample(val at: Long, val position: Double, val index: Int)

    private companion object {
        const val TAG = "GaplessTest"
        const val MULTI_FILE = "auralisMultiFile"
        const val TIMEOUT_MS = 40_000L
        const val POLL_MS = 50L
        const val ONE_SECOND_MS = 1_000L
        const val WINDOW_MS = 500L
        const val JUMP_SLACK_MS = 100
        const val TRACK_SLACK_MS = 150
        const val FIRST_FILE_SLACK_MS = 300
    }
}
