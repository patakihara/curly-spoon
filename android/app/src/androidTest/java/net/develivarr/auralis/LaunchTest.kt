package net.develivarr.auralis

import android.media.MediaCodecList
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Probes the emulator itself: the installed app launches, and the system image can decode the
 * AAC audio the recorded Audiobookshelf book carries (`audio/mp4a-latm`), which M0.emulator's
 * smoke test plays.
 */
@RunWith(AndroidJUnit4::class)
class LaunchTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun launchingTheAppShowsItsName() {
        composeRule.onNodeWithText("Auralis").assertExists()
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
