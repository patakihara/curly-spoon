package net.develivarr.auralis.features.settings

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.math.abs
import net.develivarr.auralis.data.settings.ThemeMode
import net.develivarr.auralis.ui.theme.AuralisTheme
import net.develivarr.auralis.ui.theme.SonoraAccentPresets
import net.develivarr.auralis.ui.theme.sonoraAppTokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16f-A-1: proves [SettingsContent] — the Settings screen's stateless half — actually
 * renders the two controls the wave adds (theme mode, accent) and that interacting with them
 * reports the expected value back, using the harness `ComposeHarnessTest` proved out in 14b-1.
 *
 * Deliberately exercises [SettingsContent] directly rather than [SettingsScreen]: the latter
 * pumps a real [ThemeViewModel]'s coroutines through `collectAsState`, which this harness can
 * run but would only be testing that `collectAsState` works, not this wave's own logic.
 *
 * **What this proves, and what it does not** — the same ceiling `docs/HANDOVER.md` states for
 * every Robolectric test in this project: it confirms a node with the given tag/selection state
 * exists; it says nothing about what the screen looks like, what TalkBack announces, or whether
 * the accent visibly changes anywhere else in the app. There is no device or emulator here.
 *
 * **Selection state is asserted for the accent swatches (a leaf `Box` this wave built with an
 * explicit `.selectable(...)`) but not for the theme-mode `FilterChip`s** — this file sticks to
 * `testTag` existence plus click-reports-the-right-value for those, matching
 * `ShellNavigationItemsTest`'s established preference for `testTag` over relying on a
 * Material3 composite composable's internal semantics shape.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsContentTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `renders all three theme mode options and every accent preset`() {
        composeRule.setContent {
            // Wave 16f-A-2: AuralisTheme, not a bare MaterialTheme — SettingsContent now reads
            // AuralisAppTokens.current (the selection ring, the selected mode chip's fill), which
            // only AuralisTheme provides.
            AuralisTheme {
                SettingsContent(
                    mode = ThemeMode.SYSTEM,
                    accent = SonoraAccentPresets.first(),
                    onModeChange = {},
                    onAccentChange = {},
                )
            }
        }

        composeRule.onNodeWithTag("theme-mode-LIGHT").assertExists()
        composeRule.onNodeWithTag("theme-mode-DARK").assertExists()
        composeRule.onNodeWithTag("theme-mode-SYSTEM").assertExists()
        sonoraAccentPresetOptions.forEach { preset ->
            composeRule.onNodeWithTag("accent-preset-${preset.label}").assertExists()
        }
    }

    @Test
    fun `clicking a mode chip reports the tapped mode`() {
        var reported: ThemeMode? = null
        composeRule.setContent {
            // Wave 16f-A-2: AuralisTheme, not a bare MaterialTheme — SettingsContent now reads
            // AuralisAppTokens.current (the selection ring, the selected mode chip's fill), which
            // only AuralisTheme provides.
            AuralisTheme {
                SettingsContent(
                    mode = ThemeMode.SYSTEM,
                    accent = SonoraAccentPresets.first(),
                    onModeChange = { reported = it },
                    onAccentChange = {},
                )
            }
        }

        composeRule.onNodeWithTag("theme-mode-DARK").performClick()

        assertEquals(ThemeMode.DARK, reported)
    }

    @Test
    fun `clicking an accent swatch reports that preset's own color`() {
        var reported: Color? = null
        val target = sonoraAccentPresetOptions[3]
        composeRule.setContent {
            // Wave 16f-A-2: AuralisTheme, not a bare MaterialTheme — SettingsContent now reads
            // AuralisAppTokens.current (the selection ring, the selected mode chip's fill), which
            // only AuralisTheme provides.
            AuralisTheme {
                SettingsContent(
                    mode = ThemeMode.SYSTEM,
                    accent = SonoraAccentPresets.first(),
                    onModeChange = {},
                    onAccentChange = { reported = it },
                )
            }
        }

        composeRule.onNodeWithTag("accent-preset-${target.label}").performClick()

        assertEquals(target.color, reported)
    }

    @Test
    fun `marks only the current accent preset as selected`() {
        val target = sonoraAccentPresetOptions[5]
        val other = sonoraAccentPresetOptions[0]
        composeRule.setContent {
            // Wave 16f-A-2: AuralisTheme, not a bare MaterialTheme — SettingsContent now reads
            // AuralisAppTokens.current (the selection ring, the selected mode chip's fill), which
            // only AuralisTheme provides.
            AuralisTheme {
                SettingsContent(
                    mode = ThemeMode.SYSTEM,
                    accent = target.color,
                    onModeChange = {},
                    onAccentChange = {},
                )
            }
        }

        composeRule.onNodeWithTag("accent-preset-${target.label}").assertIsSelected()
        composeRule.onNodeWithTag("accent-preset-${other.label}").assertIsNotSelected()
    }

    /**
     * Wave 16f-A-2: the test this whole wave exists to have. `16f-P` found that choosing a
     * swatch persisted, recomposed and repainted *nothing* — including the picker's own
     * selection ring, which read `MaterialTheme.colorScheme.onSurface` rather than
     * [AuralisAppTokens.current]. An existence/selection check (the tests above) cannot catch
     * that regression: the ring exists and is marked selected either way. Only a pixel read can
     * tell whether the ring's actual drawn colour tracks the accent.
     *
     * Deliberately keeps [SettingsContent]'s own `accent` parameter fixed at [target]'s colour
     * across both frames — only [AuralisTheme]'s `accent`, i.e. [AuralisAppTokens.current], is
     * mutated — so this proves the ring reads the *production* composition-local reader, not
     * just a value that happens to be threaded through `SettingsContent`'s own prop.
     *
     * **Honesty note, per this wave's spec: this could not be executed here.** There is no
     * JDK/Android SDK on this machine (`docs/HANDOVER.md`'s standing constraint), so this test
     * has never actually been run, and the "make it fail on purpose" check the spec asks for
     * (temporarily reverting the ring's border colour back to the old `onSurface` read and
     * confirming this goes red) was reasoned through, not executed. CI is the first place this
     * test — and the `captureToImage()`/`toPixelMap()` technique itself, which has no other user
     * anywhere in this repo — will actually run.
     */
    @Test
    fun `the selected accent swatch's ring repaints when the theme's accent changes`() {
        val target = sonoraAccentPresetOptions[5]
        val firstThemeAccent = sonoraAccentPresetOptions[0].color
        val secondThemeAccent = sonoraAccentPresetOptions[2].color
        val inkForFirst = sonoraAppTokens(darkTheme = false, accent = firstThemeAccent).accentInk
        val inkForSecond = sonoraAppTokens(darkTheme = false, accent = secondThemeAccent).accentInk
        assertNotEquals("the two theme accents must produce different ink colours, or this test proves nothing", inkForFirst, inkForSecond)

        val themeAccent = mutableStateOf(firstThemeAccent)
        composeRule.setContent {
            AuralisTheme(darkTheme = false, accent = themeAccent.value) {
                SettingsContent(
                    mode = ThemeMode.SYSTEM,
                    accent = target.color,
                    onModeChange = {},
                    onAccentChange = {},
                )
            }
        }

        val ringNode = composeRule.onNodeWithTag("accent-preset-${target.label}")
        val imageBefore = ringNode.captureToImage()
        assertTrue(
            "expected the selected ring to carry accentInk for the first theme accent ($inkForFirst)",
            imageBefore.containsColorCloseTo(inkForFirst, tolerancePer255 = 6f),
        )

        composeRule.runOnIdle { themeAccent.value = secondThemeAccent }
        composeRule.waitForIdle()

        val imageAfter = ringNode.captureToImage()
        assertTrue(
            "expected the selected ring to carry accentInk for the second theme accent ($inkForSecond) after it changed",
            imageAfter.containsColorCloseTo(inkForSecond, tolerancePer255 = 6f),
        )
        assertFalse(
            "expected the ring to no longer carry the first theme accent's ink once the theme accent changed",
            imageAfter.containsColorCloseTo(inkForFirst, tolerancePer255 = 6f),
        )
    }
}

/**
 * True if any pixel in this image is within [tolerancePer255] (per RGB channel) of [target].
 *
 * Recycles the underlying [android.graphics.Bitmap] once its pixels are copied into [pixelMap]
 * — [toPixelMap] eagerly reads every pixel into its own `IntArray` before returning, so the
 * bitmap's native backing store is no longer needed after this call and recycling it here is
 * safe. This is not just hygiene: each test in this file calls `captureToImage()` twice per
 * run and never otherwise disposes of the result, and CI failed both of this file's pixel tests
 * on `java.lang.Throwable: Explicit termination method 'close' not called` — the standard
 * CloseGuard/StrictMode `LeakedClosableViolation` message for an un-recycled `Bitmap`, thrown
 * from an unrelated test whenever the GC happens to finalize the leaked one.
 */
private fun ImageBitmap.containsColorCloseTo(target: Color, tolerancePer255: Float): Boolean {
    val tolerance = tolerancePer255 / 255f
    val pixelMap = toPixelMap()
    asAndroidBitmap().recycle()
    for (x in 0 until pixelMap.width) {
        for (y in 0 until pixelMap.height) {
            val pixel = pixelMap[x, y]
            if (abs(pixel.red - target.red) <= tolerance &&
                abs(pixel.green - target.green) <= tolerance &&
                abs(pixel.blue - target.blue) <= tolerance
            ) {
                return true
            }
        }
    }
    return false
}
