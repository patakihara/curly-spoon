package net.develivarr.auralis

import android.media.MediaCodecList
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isHeading
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Probes the emulator itself: the installed app, signed out, launches onto Sign in, and the system image can decode the
 * AAC audio the recorded Audiobookshelf book carries (`audio/mp4a-latm`), which M0.emulator's
 * smoke test plays.
 */
@RunWith(AndroidJUnit4::class)
class LaunchTest {

    @get:Rule
    val composeRule = createEmptyComposeRule()

    @Test
    fun launchingTheAppSignedOutOpensSignIn() {
        ApplicationProvider.getApplicationContext<AuralisApp>().graph.session.signedOut()
        ActivityScenario.launch(MainActivity::class.java)
        composeRule.onNode(hasText("Sign in") and isHeading()).assertIsDisplayed()
    }

    @Test
    fun theDeviceHasAnAacDecoder() {
        val decoders = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
            .filter { !it.isEncoder && it.supportedTypes.any { t -> t.equals(AAC, ignoreCase = true) } }
            .map { it.name }
        assertTrue("no $AAC decoder on this image", decoders.isNotEmpty())
    }

    private companion object {
        const val AAC = "audio/mp4a-latm"
    }
}
