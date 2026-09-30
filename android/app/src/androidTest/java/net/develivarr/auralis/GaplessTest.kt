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
 * tone, across the first boundary: the same check as the web's `web/e2e/gapless.spec.ts`.
 *
 * The app signs in as SmokeTest's does, with the browser replaced by following the sign-on's
 * redirects. Every player event is timed on the main thread, and the position the app reports is
 * sampled until the second file has played a second of its own.
 */
@RunWith(AndroidJUnit4::class)
class GaplessTest {

    private val app = ApplicationProvider.getApplicationContext<AuralisApp>()
    private val arguments = InstrumentationRegistry.getArguments()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

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

        // The player belongs to the main thread; read it there, judge here.
        val positions = mutableListOf<Double>()
        var look = Look()
        val deadline = SystemClock.elapsedRealtime() + TIMEOUT_MS
        while (!(look.index >= 1 && look.within >= ONE_SECOND_MS)) {
            check(SystemClock.elapsedRealtime() < deadline) { said("the second file never played a second: $look") }
            instrumentation.runOnMainSync {
                val player = graph.playback.player
                look = Look(player.currentMediaItemIndex, player.currentPosition, player.playerError)
                if (player.isPlaying) positions += graph.playback.position
            }
            look.error?.let { throw AssertionError(said("the player failed: $look"), it) }
            Thread.sleep(POLL_MS)
        }
        var offset = 0.0
        instrumentation.runOnMainSync { offset = graph.playback.position - graph.playback.player.currentPosition / 1000.0 }
        val seen = synchronized(events) { events.toList() }
        seen.forEach { said(it.toString()) }

        val started = seen.indexOfFirst { it.what == "playing" && it.value }
        val boundary = seen.indexOfFirst { it.what == "transition" && it.value }
        expect(started >= 0) { "the first file never played" }
        expect(boundary > started) { "the player never moved on to the second file by itself" }
        // ExoPlayer's own gapless transition: once playing, it never stops or buffers, across the
        // boundary included.
        val between = seen.subList(started + 1, seen.size)
        expect(between.none { (it.what == "playing" && !it.value) || it.what == "buffering" }) {
            "the player paused or buffered once playing: $between"
        }

        expect(positions.size > 10) { "too few positions: ${positions.size}" }
        expect(positions.sorted() == positions) { "the position went back: $positions" }
        expect(positions.any { it > 0 && it < offset }) { "no position in the first file" }
        expect(positions.any { it >= offset }) { "no position in the second file" }
        expect(positions.last() >= offset + 1) { "the last position ${positions.last()} is short of ${offset + 1}" }
        said("the second file started with no pause or buffering ${seen[boundary].at - seen[started].at} ms after playing began; the position ran on from ${positions.last { it < offset }} to ${positions.first { it >= offset }} across the second file's offset $offset")
    }

    /** Fails with [failure], logged as [said] does, unless [ok]. */
    private fun expect(ok: Boolean, failure: () -> String) {
        if (!ok) throw AssertionError(said(failure()))
    }

    /** Logs [outcome] where the emulator job keeps it with the test results (reports/emulator-tests.txt). */
    private fun said(outcome: String): String = outcome.also { Log.i(TAG, it) }

    /** One player event, on the main thread's clock: what happened, whether it is on, and when. */
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

    private companion object {
        const val TAG = "GaplessTest"
        const val MULTI_FILE = "auralisMultiFile"
        const val TIMEOUT_MS = 40_000L
        const val POLL_MS = 50L
        const val ONE_SECOND_MS = 1_000L
    }
}
