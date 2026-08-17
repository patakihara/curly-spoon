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
 *
 * Wave 16b-2-A-2 widens this to the **26 chroma-role values** `16b-2-P`'s parity review named as
 * verified only once, by a human reading a table: the two "…resolves all sixteen m3 chroma role
 * values…" tests below assert all sixteen `--m3-*` chroma slots (primary/secondary/tertiary/
 * error, each with its `on*` and
 * `*Container` pair — SONORA.md §1.5, this file's `Color.kt:75-116`) as [MaterialTheme]'s
 * [androidx.compose.material3.ColorScheme] resolves them, in both themes. Sixteen dark + sixteen
 * light = thirty-two assertions, of which **26 are literals SONORA.md declares directly**; the
 * other **six are light-side `onSecondary`/`onSecondaryContainer`/`onTertiary`/
 * `onTertiaryContainer`/`onError`/`onErrorContainer`**, which SONORA.md's own source has no light
 * value for at all (§1.5's table marks them "not declared light") — `Color.kt` derives those six
 * by contrast against the role/container they sit on, so they are asserted as production values
 * this file's `Color.kt` comment already pins, not as SONORA.md literals. Each assertion names
 * which of the two it is.
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

    /** The sixteen `--m3-*` chroma-role slots [ColorScheme] exposes, captured as a group. */
    private class CapturedChromaRoles {
        var primary: Color? = null
        var onPrimary: Color? = null
        var primaryContainer: Color? = null
        var onPrimaryContainer: Color? = null
        var secondary: Color? = null
        var onSecondary: Color? = null
        var secondaryContainer: Color? = null
        var onSecondaryContainer: Color? = null
        var tertiary: Color? = null
        var onTertiary: Color? = null
        var tertiaryContainer: Color? = null
        var onTertiaryContainer: Color? = null
        var error: Color? = null
        var onError: Color? = null
        var errorContainer: Color? = null
        var onErrorContainer: Color? = null
    }

    private fun captureChromaRoles(darkTheme: Boolean): CapturedChromaRoles {
        val captured = CapturedChromaRoles()
        composeRule.setContent {
            AuralisTheme(darkTheme = darkTheme) {
                Surface {
                    val cs = MaterialTheme.colorScheme
                    captured.primary = cs.primary
                    captured.onPrimary = cs.onPrimary
                    captured.primaryContainer = cs.primaryContainer
                    captured.onPrimaryContainer = cs.onPrimaryContainer
                    captured.secondary = cs.secondary
                    captured.onSecondary = cs.onSecondary
                    captured.secondaryContainer = cs.secondaryContainer
                    captured.onSecondaryContainer = cs.onSecondaryContainer
                    captured.tertiary = cs.tertiary
                    captured.onTertiary = cs.onTertiary
                    captured.tertiaryContainer = cs.tertiaryContainer
                    captured.onTertiaryContainer = cs.onTertiaryContainer
                    captured.error = cs.error
                    captured.onError = cs.onError
                    captured.errorContainer = cs.errorContainer
                    captured.onErrorContainer = cs.onErrorContainer
                }
            }
        }
        return captured
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
    fun `dark theme resolves all sixteen m3 chroma role values against SONORA md`() {
        val c = captureChromaRoles(darkTheme = true)

        // All sixteen are literals SONORA.md §1.5 declares directly for the dark column
        // (Color.kt:86-101) — dark declares every role, none derived.
        assertEquals(Color(0xFFB6C4FF), c.primary) // --m3-primary
        assertEquals(Color(0xFF1D2D61), c.onPrimary) // --m3-on-primary
        assertEquals(Color(0xFF354479), c.primaryContainer) // --m3-primary-container
        assertEquals(Color(0xFFDCE1FF), c.onPrimaryContainer) // --m3-on-primary-container
        assertEquals(Color(0xFFC2C5DD), c.secondary) // --m3-secondary
        assertEquals(Color(0xFF3F434E), c.onSecondary) // --m3-on-secondary
        assertEquals(Color(0xFF565A70), c.secondaryContainer) // --m3-secondary-container
        assertEquals(Color(0xFFDEE1F9), c.onSecondaryContainer) // --m3-on-secondary-container
        assertEquals(Color(0xFFFFB7DB), c.tertiary) // --m3-tertiary
        assertEquals(Color(0xFF472B50), c.onTertiary) // --m3-on-tertiary
        assertEquals(Color(0xFF603E67), c.tertiaryContainer) // --m3-tertiary-container
        assertEquals(Color(0xFFFFD7F5), c.onTertiaryContainer) // --m3-on-tertiary-container
        assertEquals(Color(0xFFFFB4AB), c.error) // --m3-error
        assertEquals(Color(0xFF690005), c.onError) // --m3-on-error
        assertEquals(Color(0xFF93000A), c.errorContainer) // --m3-error-container
        assertEquals(Color(0xFFFFDAD6), c.onErrorContainer) // --m3-on-error-container
    }

    @Test
    fun `light theme resolves all sixteen m3 chroma role values, six of them derived where SONORA md declares none`() {
        val c = captureChromaRoles(darkTheme = false)

        // Ten of these are literals SONORA.md §1.5 declares directly for the light column
        // (Color.kt:75-84).
        assertEquals(Color(0xFF4D5C92), c.primary) // --m3-primary
        assertEquals(Color(0xFFFFFFFF), c.onPrimary) // --m3-on-primary
        assertEquals(Color(0xFFDCE1FF), c.primaryContainer) // --m3-primary-container
        assertEquals(Color(0xFF354479), c.onPrimaryContainer) // --m3-on-primary-container
        assertEquals(Color(0xFF595D72), c.secondary) // --m3-secondary
        assertEquals(Color(0xFFDEE1F9), c.secondaryContainer) // --m3-secondary-container
        assertEquals(Color(0xFF75546F), c.tertiary) // --m3-tertiary
        assertEquals(Color(0xFFFFD7F5), c.tertiaryContainer) // --m3-tertiary-container
        assertEquals(Color(0xFFBA1A1A), c.error) // --m3-error
        assertEquals(Color(0xFFFFDAD6), c.errorContainer) // --m3-error-container

        // The remaining six have NO light value in SONORA.md's own source (§1.5: "not declared
        // light" for on-secondary/-on-tertiary/-on-error and their *-container pairs — see this
        // file's class doc comment). Color.kt derives them by contrast against the role/container
        // color they sit on; asserted here as the pinned production values, not as design
        // literals, so a future accidental change to the derivation is still caught.
        assertEquals(Color(0xFFFFFFFF), c.onSecondary) // derived: secondary #595d72 is dark -> white text
        assertEquals(Color(0xFF0C0C0C), c.onSecondaryContainer) // derived: container #dee1f9 is light -> Neutral900 text
        assertEquals(Color(0xFFFFFFFF), c.onTertiary) // derived: tertiary #75546f is dark -> white text
        assertEquals(Color(0xFF0C0C0C), c.onTertiaryContainer) // derived: container #ffd7f5 is light -> Neutral900 text
        assertEquals(Color(0xFFFFFFFF), c.onError) // derived: error #ba1a1a is dark -> white text
        assertEquals(Color(0xFF0C0C0C), c.onErrorContainer) // derived: container #ffdad6 is light -> Neutral900 text
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
