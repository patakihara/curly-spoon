package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.HtmlReportWriter
import app.cash.paparazzi.Paparazzi
import java.io.File
import kotlin.math.abs
import net.develivarr.auralis.generated.theme.SonoraLightColors
import net.develivarr.auralis.generated.theme.SonoraState
import net.develivarr.auralis.generated.ui.ButtonGroupItem
import net.develivarr.auralis.generated.ui.ButtonGroupProps
import net.develivarr.auralis.generated.ui.ButtonProps
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** How a disabled control looks, as web's states test reads it: its content at 38%, a selected container at 12%. */
class SonoraDisabledLookTest {
    private val shots = Shots(
        HtmlReportWriter(rootDirectory = File(System.getProperty("paparazzi.report.dir") + "-states")),
    )

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5, snapshotHandler = shots)

    private val bg = SonoraLightColors.surfaceBg

    private fun shot(name: String, content: @Composable () -> Unit): IntArray {
        paparazzi.snapshot(name) {
            Box(Modifier.fillMaxSize().background(bg).padding(16.dp)) { content() }
        }
        return shots.pixels.getValue(name)
    }

    /** How many pixels are [ink] laid over the page, give or take a step per channel. */
    private fun IntArray.count(ink: Color): Int {
        val want = ink.compositeOver(bg).toArgb()
        fun near(a: Int, b: Int) = (0..16 step 8).all { abs((a shr it and 0xFF) - (b shr it and 0xFF)) <= 2 }
        return count { near(it, want) }
    }

    /** A solid square of the surface ink, standing in for an icon. */
    private val square: @Composable () -> Unit = { Box(Modifier.size(24.dp).background(SonoraLightColors.surfaceFg)) }

    @Test
    fun `M0_states_b a disabled Button draws its slots at 38 percent ink`() {
        val full = SonoraLightColors.surfaceFg
        val faded = full.copy(alpha = SonoraState.disabledContent)
        val bound = shot("Button-slot-bound") { Button(ButtonProps(children = square, onClick = {})) }
        assertTrue("a bound Button's slot draws in full ink", bound.count(full) >= 24 * 24)
        listOf(
            "none" to ButtonProps(children = square),
            "disabled" to ButtonProps(children = square, onClick = {}, disabled = true),
        ).forEach { (how, props) ->
            val off = shot("Button-slot-$how") { Button(props) }
            assertEquals("a Button with $how draws a slot in full ink", 0, off.count(full))
            assertTrue("a Button with $how draws its slot at 38%", off.count(faded) >= 24 * 24)
        }
    }

    @Test
    fun `M0_states_b a disabled ButtonGroup keeps its selected segment's 12 percent container`() {
        val container = SonoraLightColors.surfaceFg.copy(alpha = SonoraState.disabledContainer)
        val items = listOf(ButtonGroupItem("all", "All"), ButtonGroupItem("books", "Books"))
        val selected = shot("ButtonGroup-disabled-selected") { ButtonGroup(ButtonGroupProps(items = items, value = "all")) }
        val none = shot("ButtonGroup-disabled-unselected") { ButtonGroup(ButtonGroupProps(items = items)) }
        // Text edges can blend to the same shade, so the fill shows as many more such pixels.
        assertTrue("the selected segment has no 12% container", selected.count(container) > none.count(container) + 150)
    }
}
