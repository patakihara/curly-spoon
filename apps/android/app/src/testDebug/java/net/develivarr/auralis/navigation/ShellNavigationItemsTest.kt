package net.develivarr.auralis.navigation

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16d-A-2: [ShellNavigationBarItems] must hide Music/Books/Podcasts when their upstream
 * isn't configured — the parity gap 16d-P found (web already gated on
 * `apps/web/src/components/destinations.ts`'s `visibleDestinations`; `AuralisShell` rendered
 * [ShellDestination.entries] unfiltered). Uses the harness `ComposeHarnessTest` proved out in
 * wave 14b-1, rendering just the bar's items rather than the whole shell
 * (`NavHostController`/`PlayerViewModel`/`ImageLoader` are not needed to prove this).
 *
 * **What this proves, and what it does not.** Robolectric confirms a node exists with the
 * content description named — it says nothing about what TalkBack actually announces on a real
 * device, nor how the bar looks (`docs/HANDOVER.md`'s standing caveat on this harness).
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ShellNavigationItemsTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `hides Music, Books and Podcasts while nothing is configured`() {
        composeRule.setContent {
            MaterialTheme {
                NavigationBar {
                    ShellNavigationBarItems(
                        visibleDestinations = visibleShellDestinations(DestinationAvailability()),
                        activeDestination = ShellDestination.FOR_YOU,
                        onNavigate = {},
                    )
                }
            }
        }

        composeRule.onNodeWithContentDescription("For you").assertExists()
        composeRule.onNodeWithContentDescription("Search").assertExists()
        composeRule.onNodeWithContentDescription("Music").assertDoesNotExist()
        composeRule.onNodeWithContentDescription("Books").assertDoesNotExist()
        composeRule.onNodeWithContentDescription("Podcasts").assertDoesNotExist()
    }

    @Test
    fun `shows every destination once every upstream is configured`() {
        composeRule.setContent {
            MaterialTheme {
                NavigationBar {
                    ShellNavigationBarItems(
                        visibleDestinations =
                            visibleShellDestinations(
                                DestinationAvailability(
                                    jellyfinConfigured = true,
                                    audiobookshelfConfigured = true,
                                    hasBookLibrary = true,
                                    hasPodcastLibrary = true,
                                ),
                            ),
                        activeDestination = ShellDestination.FOR_YOU,
                        onNavigate = {},
                    )
                }
            }
        }

        composeRule.onNodeWithContentDescription("For you").assertExists()
        composeRule.onNodeWithContentDescription("Music").assertExists()
        composeRule.onNodeWithContentDescription("Books").assertExists()
        composeRule.onNodeWithContentDescription("Podcasts").assertExists()
        composeRule.onNodeWithContentDescription("Search").assertExists()
    }
}
