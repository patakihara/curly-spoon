package net.develivarr.auralis

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.performClick
import androidx.media3.exoplayer.ExoPlayer
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import net.develivarr.auralis.api.ServerConfig
import net.develivarr.auralis.auth.KeystoreTokenStore
import net.develivarr.auralis.play.Playback
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * M0.emulator's smoke test, against the real server on recorded upstreams (`server/e2e/`, which
 * the emulator job starts and names with the `auralisServer` and `auralisPlayable` arguments).
 *
 * The app signs in as a person would, with one thing replaced: the browser. Tapping Sign in opens
 * the server's login page; the test catches that intent and follows the redirects itself, through
 * the stand-in sign-on, to the `auralis://auth/callback` the server sends back, and delivers it to
 * the app. Browse then shows, and the recorded item plays through the app's own [Playback] (the
 * path a page's play control takes) until Media3's position passes five seconds.
 */
@RunWith(AndroidJUnit4::class)
class SmokeTest {

    @get:Rule
    val composeRule = createEmptyComposeRule()

    private val app = ApplicationProvider.getApplicationContext<AuralisApp>()
    private val arguments = InstrumentationRegistry.getArguments()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @After
    fun stop() {
        instrumentation.runOnMainSync { app.graph.playback.player.stop() }
    }

    @Test
    fun M0_emulator_a_signsInOpensBrowseAndPlaysPastFiveSeconds() {
        val playable = requireNotNull(arguments.getString(PLAYABLE)) { "no $PLAYABLE argument" }
        val ref = requireNotNull(Playback.refOf(playable)) { "not a playable ref: $playable" }
        app.graph = AppGraph(app, ServerConfig.from(arguments), KeystoreTokenStore(app), OkHttpClient())
        app.graph.session.signedOut()

        ActivityScenario.launch(MainActivity::class.java)
        val login = catchBrowser { composeRule.onNode(hasText("Sign in") and hasClickAction()).performClick() }
        val callback = followToApp(login)
        app.startActivity(
            Intent(Intent.ACTION_VIEW, callback)
                .setClass(app, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        composeRule.waitUntil(TIMEOUT_MS) {
            composeRule.onAllNodes(hasText("Browse") and isHeading()).fetchSemanticsNodes().isNotEmpty()
        }

        app.graph.playback.play(ref)
        var reached = Reached()
        try {
            // The player belongs to the main thread; read it there, judge here.
            composeRule.waitUntil(TIMEOUT_MS) {
                instrumentation.runOnMainSync { reached = Reached.from(app.graph.playback.player) }
                reached.error?.let { throw AssertionError(said("the player failed at ${reached.position} ms"), it) }
                reached.playing && reached.position > FIVE_SECONDS_MS
            }
        } catch (e: ComposeTimeoutException) {
            throw AssertionError(said("playback reached only ${reached.position} ms (playing: ${reached.playing})"), e)
        }
        // The bytes came from the server the test signed in to: the track is one of its own URLs.
        val server = ServerConfig.from(arguments).baseUrl.toString()
        assertTrue("${reached.uri} is not on $server", reached.uri.orEmpty().startsWith(server + "api/media/"))
        said("playback passed five seconds while playing: ${reached.position} ms of ${reached.uri}")
    }

    /** Logs [outcome] where the emulator job keeps it with the test results (reports/smoke-test.txt). */
    private fun said(outcome: String): String = outcome.also { Log.i(TAG, it) }

    /** What the player showed at one look: its position, whether it was playing, its track, any error. */
    private data class Reached(
        val position: Long = 0,
        val playing: Boolean = false,
        val uri: String? = null,
        val error: Exception? = null,
    ) {
        companion object {
            fun from(player: ExoPlayer) = Reached(
                position = player.currentPosition,
                playing = player.isPlaying,
                uri = player.currentMediaItem?.localConfiguration?.uri?.toString(),
                error = player.playerError,
            )
        }
    }

    /** Runs [tap], which opens the browser, and gives back the page it would have opened. */
    private fun catchBrowser(tap: () -> Unit): Uri {
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_VIEW))
                .respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK, null))
            tap()
            composeRule.waitUntil(TIMEOUT_MS) { Intents.getIntents().any { it.action == Intent.ACTION_VIEW } }
            return Intents.getIntents().last { it.action == Intent.ACTION_VIEW }.data!!
        } finally {
            Intents.release()
        }
    }

    /**
     * Follows [start]'s redirects as a browser would, cookies included, until one leaves HTTP for
     * the app's own scheme.
     */
    private fun followToApp(start: Uri): Uri {
        val http = OkHttpClient.Builder().followRedirects(false).build()
        val cookies = mutableMapOf<String, String>()
        var url = start.toString()
        repeat(MAX_REDIRECTS) {
            val request = Request.Builder().url(url).apply {
                if (cookies.isNotEmpty()) header("Cookie", cookies.entries.joinToString("; ") { "${it.key}=${it.value}" })
            }.build()
            val location = http.newCall(request).execute().use { reply ->
                for (set in reply.headers("Set-Cookie")) {
                    val pair = set.substringBefore(';')
                    cookies[pair.substringBefore('=')] = pair.substringAfter('=')
                }
                assertEquals("$url: ${reply.body?.string()}", 302, reply.code)
                reply.request.url.resolve(reply.header("Location")!!)?.toString() ?: reply.header("Location")!!
            }
            if (location.startsWith("auralis:")) return Uri.parse(location)
            url = location
        }
        error("no way back to the app from $start")
    }

    private companion object {
        const val TAG = "SmokeTest"
        const val PLAYABLE = "auralisPlayable"
        const val TIMEOUT_MS = 30_000L
        const val FIVE_SECONDS_MS = 5_000L
        const val MAX_REDIRECTS = 5
    }
}
