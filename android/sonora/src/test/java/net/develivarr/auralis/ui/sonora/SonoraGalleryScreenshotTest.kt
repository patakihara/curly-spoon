package net.develivarr.auralis.ui.sonora

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** One Paparazzi snapshot per gallery entry, named after it, into build/reports/paparazzi. */
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
        paparazzi.snapshot(entry.name) { entry.content() }
    }
}
