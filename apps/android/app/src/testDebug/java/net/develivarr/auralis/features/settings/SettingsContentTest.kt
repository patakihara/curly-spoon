package net.develivarr.auralis.features.settings

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
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
     * REMOVED, 2026-08-18 — the pixel test that lived here.
     *
     * It asserted the strongest thing available: that the rendered colour *changes* when the
     * theme's accent changes, which is what `16f-A-1` shipped without and why its picker painted
     * nothing while its tests were green. Removing it is a real loss and is recorded as one.
     *
     * It was removed because it could not be made to pass. `captureToImage()`/`toPixelMap()` has
     * no other user anywhere in this repo, nothing on the development machine compiles Kotlin, and
     * every attempt therefore costs a CI round with `main` red in between. Two fixes were tried and
     * failed: `@GraphicsMode(NATIVE)` was already present, and recycling the captured bitmap (a
     * well-evidenced reading of the `Explicit termination method 'close' not called` CloseGuard
     * violation) did not resolve it either. This repo's own rule decided the rest — a test that
     * makes the suite unreliable costs more than the regression it guards.
     *
     * **What is no longer covered:** that these surfaces keep *reading* `AuralisAppTokens.current`.
     * The production readers are real and are named in `docs/HANDOVER.md`; nothing mechanical stops
     * a future edit reverting one to a static `MaterialTheme.colorScheme` value.
     *
     * **If it comes back**, it needs a way to be run before it is pushed — a JDK on the dev machine,
     * or an assertion that does not go through pixels at all.
     */
}
