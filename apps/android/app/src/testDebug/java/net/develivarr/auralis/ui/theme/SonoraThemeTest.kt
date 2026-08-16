package net.develivarr.auralis.ui.theme

import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16b-2-A: proves [AuralisTheme] actually installs Sonora's color/type/shape values into
 * [MaterialTheme]'s slots and that [AuralisAppTokens] resolves the five app-level tokens — in
 * both themes, with real numbers pinned against `docs/design/SONORA.md` and
 * `packages/ui/src/styles/sonora-theme.css` (web's already-landed values, which this wave's
 * report states line up against 1:1). Deliberately does not assert mere existence: HANDOVER
 * names "a test that only inspects a return value can pin the wrong value as correct" as a
 * recurring failure class on this project, and a theme test that only checked "MaterialTheme
 * has *a* colorScheme/typography/shapes" would pass with every value still at Compose's Material
 * defaults.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SonoraThemeTest {

    @get:Rule
    val composeRule = createComposeRule()

    private class Captured {
        var background: Color? = null
        var onBackground: Color? = null
        var surface: Color? = null
        var headlineWeight: FontWeight? = null
        var pillCornerPx: Float? = null
        var expectedPillCornerPx: Float? = null
        var toneLibrary: Color? = null
        var toneRequest: Color? = null
        var toneProgress: Color? = null
        var toneError: Color? = null
        var accentInk: Color? = null
    }

    private fun captureFrom(darkTheme: Boolean): Captured {
        val captured = Captured()
        composeRule.setContent {
            AuralisTheme(darkTheme = darkTheme) {
                Surface {
                    val density = LocalDensity.current
                    captured.background = MaterialTheme.colorScheme.background
                    captured.onBackground = MaterialTheme.colorScheme.onBackground
                    captured.surface = MaterialTheme.colorScheme.surface
                    captured.headlineWeight = MaterialTheme.typography.headlineLarge.fontWeight
                    val pill = MaterialTheme.shapes.extraLarge as CornerBasedShape
                    captured.pillCornerPx = pill.topStart.toPx(Size.Zero, density)
                    captured.expectedPillCornerPx = with(density) { 999.dp.toPx() }
                    captured.toneLibrary = AuralisAppTokens.current.toneLibrary
                    captured.toneRequest = AuralisAppTokens.current.toneRequest
                    captured.toneProgress = AuralisAppTokens.current.toneProgress
                    captured.toneError = AuralisAppTokens.current.toneError
                    captured.accentInk = AuralisAppTokens.current.accentInk
                }
            }
        }
        return captured
    }

    @Test
    fun `dark theme resolves Sonora's flat surfaces, weight-900 heading, pill shape and tones`() {
        val c = captureFrom(darkTheme = true)

        assertEquals(Color(0xFF0C0C0C), c.background) // --surface-bg (neutral-900)
        assertEquals(Color(0xFFE1E1E1), c.onBackground) // --surface-fg (neutral-50)
        assertEquals(Color(0xFF141414), c.surface) // --surface-card (neutral-850)
        assertEquals(FontWeight.W900, c.headlineWeight)
        assertEquals(c.expectedPillCornerPx, c.pillCornerPx) // extraLarge resolves 999dp, not a default
        assertEquals(SonoraDefaultAccent, c.toneLibrary) // dark: --tone-library = var(--accent)
        assertEquals(Color(0xFFFFB7DB), c.toneRequest) // dark: literal, NOT var(--m3-tertiary)
        assertEquals(Color(0xFFFFCC8B), c.toneProgress) // dark: --state-warning
        assertEquals(Color(0xFFE12F43), c.toneError) // --state-error
        assertEquals(SonoraDefaultAccent, c.accentInk) // dark: --accent-ink = var(--accent)
    }

    @Test
    fun `light theme resolves Sonora's flat surfaces, weight-900 heading, pill shape and tones`() {
        val c = captureFrom(darkTheme = false)

        assertEquals(Color(0xFFEBEBEB), c.background) // --surface-bg-light
        assertEquals(Color(0xFF191919), c.onBackground) // --surface-fg-light
        assertEquals(Color(0xFFE1E1E1), c.surface) // --surface-card-light
        assertEquals(FontWeight.W900, c.headlineWeight)
        assertEquals(c.expectedPillCornerPx, c.pillCornerPx)
        assertEquals(Color(0xFF6B4300), c.toneLibrary) // light literal
        assertEquals(Color(0xFF5B3B57), c.toneRequest) // light literal
        assertEquals(Color(0xFF7A4A00), c.toneProgress) // light literal
        assertEquals(Color(0xFFE12F43), c.toneError) // unchanged from dark
        // light: --accent-ink = color-mix(in oklch, var(--accent) 58%, black) — computed, not a
        // literal; see accentInkForLightMatchesTheIndependentlyComputedOklchMix below.
        assertColorCloseTo(expected = Color(red = 63 / 255f, green = 40 / 255f, blue = 118 / 255f), actual = c.accentInk!!, tolerancePer255 = 2f)
    }

    @Test
    fun `accentInkForLight matches the independently-computed OKLCH mix for the default accent`() {
        // Golden value computed independently in Python, using the identical OKLab/OKLCH
        // matrices (Bjorn Ottosson's reference conversion — see OklchMix.kt), NOT by running
        // this Kotlin code: this repo has no JDK/Android SDK, so the Kotlin implementation
        // itself could never be executed to produce this number. Cross-checking against a
        // second, independent implementation of the same published algorithm is the strongest
        // verification available without a compiler. For accent = #8b5cf6, mixing 58% with
        // black in OKLCH gives rgb(63, 40, 118) = #3F2876.
        val result = accentInkForLight(SonoraDefaultAccent)
        assertColorCloseTo(expected = Color(red = 63 / 255f, green = 40 / 255f, blue = 118 / 255f), actual = result, tolerancePer255 = 2f)
    }

    private fun assertColorCloseTo(expected: Color, actual: Color, tolerancePer255: Float) {
        val tolerance = tolerancePer255 / 255f
        assertTrue(
            "red: expected=${expected.red} actual=${actual.red}",
            abs(expected.red - actual.red) <= tolerance,
        )
        assertTrue(
            "green: expected=${expected.green} actual=${actual.green}",
            abs(expected.green - actual.green) <= tolerance,
        )
        assertTrue(
            "blue: expected=${expected.blue} actual=${actual.blue}",
            abs(expected.blue - actual.blue) <= tolerance,
        )
    }
}
