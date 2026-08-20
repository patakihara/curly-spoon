package net.develivarr.auralis.navigation

import androidx.compose.material3.NavigationRail
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-settings-A (`docs/design/screens/SETTINGS.md` §6.1):
 * [ShellNavigationRailSettingsItem] exists, is clickable and reflects selection — using the same
 * standalone-composable harness `ShellNavigationItemsTest` already established for
 * [ShellNavigationRailItems] rather than a full [AuralisShell] (its `NavHostController`/
 * `PlayerViewModel`/`ImageLoader` are not needed to prove this item's own behaviour).
 *
 * Content here is short (at most two rail items), so this is not the `LazyColumn` off-viewport
 * trap `docs/HANDOVER.md` documents — both items are within the composed viewport and
 * `performClick()` reaches the node directly, no scroll or `performSemanticsAction` needed.
 *
 * By tag, not by merged content description, matching [ShellNavigationRailItems]'s own
 * established reason: `NavigationRailItem` merges its icon/label semantics, and a `testTag` set
 * directly on the item's own modifier sidesteps that question entirely.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ShellNavigationRailSettingsItemTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `exists and fires onClick when tapped`() {
        var clicked = false
        composeRule.setContent {
            // AuralisTheme, not a bare MaterialTheme — this item reads AuralisAppTokens.current
            // for its selected-state colors, which only AuralisTheme provides
            // (LocalSonoraAppTokens has no default and throws otherwise).
            AuralisTheme {
                NavigationRail {
                    ShellNavigationRailItems(
                        visibleDestinations = visibleShellDestinations(DestinationAvailability()),
                        activeDestination = ShellDestination.FOR_YOU,
                        onNavigate = {},
                    )
                    ShellNavigationRailSettingsItem(
                        selected = false,
                        onClick = { clicked = true },
                    )
                }
            }
        }

        composeRule.onNodeWithTag("shell-nav-rail-settings").assertExists()
        composeRule.onNodeWithTag("shell-nav-rail-settings").performClick()
        assertTrue(clicked)
    }

    @Test
    fun `reflects the selected state it is given`() {
        composeRule.setContent {
            AuralisTheme {
                NavigationRail {
                    ShellNavigationRailSettingsItem(
                        selected = true,
                        onClick = {},
                    )
                }
            }
        }

        composeRule.onNodeWithTag("shell-nav-rail-settings").assertIsSelected()
    }
}
