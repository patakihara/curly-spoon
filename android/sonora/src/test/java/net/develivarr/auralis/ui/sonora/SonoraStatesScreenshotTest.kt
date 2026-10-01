package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.HtmlReportWriter
import app.cash.paparazzi.Paparazzi
import app.cash.paparazzi.Snapshot
import app.cash.paparazzi.SnapshotHandler
import java.awt.image.BufferedImage
import java.io.File
import net.develivarr.auralis.generated.theme.SonoraLightColors
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * Material's states on each interactive Compose component, one Paparazzi snapshot per state:
 * enabled, hovered, focused, pressed, and disabled for want of an action (and with `disabled` set,
 * where the component declares it). Hover, focus and press are pinned as a preview pins them on
 * the web. The snapshots go to build/reports/paparazzi/debug-states, apart from the gallery's.
 */
@RunWith(Parameterized::class)
class SonoraStatesScreenshotTest(private val entry: StateEntry) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun entries(): List<StateEntry> = sonoraStates
    }

    private val shots = Shots(
        HtmlReportWriter(rootDirectory = File(System.getProperty("paparazzi.report.dir") + "-states")),
    )

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5, snapshotHandler = shots)

    private fun shot(state: String, variant: Variant, pinned: PinnedState? = null): IntArray {
        val name = "${entry.name}-$state"
        paparazzi.snapshot(name) {
            CompositionLocalProvider(LocalPinnedState provides pinned) {
                // Room around the component for the focus ring, which is drawn outside its shape.
                Box(Modifier.fillMaxSize().background(SonoraLightColors.surfaceBg).padding(16.dp)) {
                    entry.draw(variant)
                }
            }
        }
        return shots.pixels.getValue(name)
    }

    @Test
    fun `M0_states_b each state draws differently and disabled draws one way`() {
        val drawn = linkedMapOf(
            "enabled" to shot("enabled", Variant.BOUND),
            "hovered" to shot("hovered", Variant.BOUND, PinnedState.HOVERED),
            "focused" to shot("focused", Variant.BOUND, PinnedState.FOCUSED),
            "pressed" to shot("pressed", Variant.BOUND, PinnedState.PRESSED),
            "disabled" to shot("disabled", Variant.NONE),
        )
        val names = drawn.keys.toList()
        names.forEachIndexed { i, a ->
            names.drop(i + 1).forEach { b ->
                assertFalse("${entry.name}: $a and $b draw the same", drawn.getValue(a).contentEquals(drawn.getValue(b)))
            }
        }
        if (entry.declaresDisabled) {
            assertArrayEquals(
                "${entry.name}: disabled set draws as having no action does",
                drawn.getValue("disabled"),
                shot("disabled-set", Variant.DISABLED),
            )
        }
    }

    @Test
    fun `M0_states_b a disabled component shows no state`() {
        val plain = shot("disabled-plain", Variant.NONE)
        PinnedState.entries.forEach { pinned ->
            assertArrayEquals("${entry.name}: disabled shows $pinned", plain, shot("disabled-$pinned", Variant.NONE, pinned))
        }
    }
}

/** Hands each snapshot to [report] and keeps its last frame's pixels by snapshot name. */
private class Shots(private val report: SnapshotHandler) : SnapshotHandler {
    val pixels = mutableMapOf<String, IntArray>()

    override fun newFrameHandler(snapshot: Snapshot, frameCount: Int, fps: Int): SnapshotHandler.FrameHandler {
        val inner = report.newFrameHandler(snapshot, frameCount, fps)
        return object : SnapshotHandler.FrameHandler {
            override fun handle(image: BufferedImage) {
                pixels[snapshot.name!!] = image.getRGB(0, 0, image.width, image.height, null, 0, image.width)
                inner.handle(image)
            }

            override fun close() = inner.close()
        }
    }

    override fun close() = report.close()
}
