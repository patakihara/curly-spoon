package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.BasicText
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import org.junit.Rule
import org.junit.Test

class SonoraGalleryScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5)

    @Test
    fun `M0_tokens_c the toolchain draws text and an icon`() {
        paparazzi.snapshot("probe") {
            Column {
                BasicText("Sonora", style = TextStyle(fontFamily = SonoraFonts.display, fontSize = 32.sp))
                SonoraIcon("play_arrow", size = 48.sp)
            }
        }
    }
}
