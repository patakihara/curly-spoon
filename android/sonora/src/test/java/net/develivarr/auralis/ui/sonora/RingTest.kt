package net.develivarr.auralis.ui.sonora

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.boundingRect
import androidx.compose.ui.graphics.Outline
import org.junit.Assert.assertEquals
import org.junit.Test

class RingTest {
    @Test
    fun `M0_states_b the focus ring grows a rounded control's corners by its reach, as a CSS outline does`() {
        val control = Outline.Rounded(
            RoundRect(0f, 0f, 100f, 40f, CornerRadius(8f), CornerRadius(8f), CornerRadius(0f), CornerRadius(8f)),
        )
        val ring = ringOutline(control, 3.5f) as Outline.Rounded
        assertEquals(Rect(-3.5f, -3.5f, 103.5f, 43.5f), ring.roundRect.boundingRect)
        assertEquals(CornerRadius(11.5f), ring.roundRect.topLeftCornerRadius)
        assertEquals(CornerRadius(11.5f), ring.roundRect.bottomLeftCornerRadius)
        assertEquals("a square corner stays square", CornerRadius(0f), ring.roundRect.bottomRightCornerRadius)
    }

    @Test
    fun `M0_states_b the focus ring around a square control is the control grown by its reach`() {
        val ring = ringOutline(Outline.Rectangle(Rect(0f, 0f, 10f, 10f)), 2f) as Outline.Rectangle
        assertEquals(Rect(-2f, -2f, 12f, 12f), ring.rect)
    }

    @Test
    fun `M0_states_b a preview's press spreads from its press point, half way to the farthest corner`() {
        val size = Size(200f, 100f)
        val origin = Offset(PREVIEW_PRESS.x * size.width, PREVIEW_PRESS.y * size.height)
        // The farthest corner from (60, 70) is (200, 0).
        assertEquals(kotlin.math.hypot(140f, 70f) * PREVIEW_GROWTH, rippleRadius(origin, size, PREVIEW_GROWTH), 0.01f)
    }
}
