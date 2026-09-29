package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import net.develivarr.auralis.generated.theme.SonoraLightColors
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * One Paparazzi snapshot per gallery entry, named after it, into build/reports/paparazzi. Each
 * draws on Sonora's light surface, the scheme the stubs are drawn in, not Paparazzi's dark window.
 */
@RunWith(Parameterized::class)
class SonoraGalleryScreenshotTest(private val entry: GalleryEntry) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun entries(): List<GalleryEntry> = sonoraGallery
    }

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5)

    @Test
    fun `M0_tokens_c the gallery entry draws on a phone`() {
        paparazzi.snapshot(entry.name) {
            Box(Modifier.fillMaxSize().background(SonoraLightColors.surfaceBg)) { entry.content() }
        }
    }
}
