package net.develivarr.auralis.navigation

import androidx.compose.material3.NavigationBar
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.ui.theme.AuralisTheme
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
 * **What this proves, and what it does not.** Robolectric confirms a node with the given
 * destination's [testTag][androidx.compose.ui.platform.testTag] exists or does not — it says
 * nothing about what TalkBack actually announces on a real device, nor how the bar looks
 * (`docs/HANDOVER.md`'s standing caveat on this harness).
 *
 * **Why by tag, not by content description.** The first draft queried
 * `onNodeWithContentDescription(destination.label)`, matching `Icon`'s `contentDescription`.
 * `NavigationBarItem` wraps its content in a `Modifier.selectable` that merges the icon's
 * content description and the label `Text` into one semantics node, and that merged-tree lookup
 * failed here (`AssertionError` on the very first assertion, in both tests, before any
 * visibility-filtering assertion was reached) — this machine has no JDK/Gradle to print the
 * actual semantics tree and confirm which of "0 nodes" or "ambiguous match" it was. A
 * [androidx.compose.ui.platform.testTag] set directly on each item's own modifier
 * ([ShellNavigationBarItems]) is not subject to merge semantics at all, so it sidesteps the
 * question entirely rather than depending on an assumption about how Material3 merges icon and
 * label semantics in this Robolectric configuration.
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
            // Wave 16f-A-2: AuralisTheme, not a bare MaterialTheme — ShellNavigationBarItems now
            // reads AuralisAppTokens.current for its active-destination indicator, which only
            // AuralisTheme provides (LocalSonoraAppTokens has no default and throws otherwise).
            AuralisTheme {
                NavigationBar {
                    ShellNavigationBarItems(
                        visibleDestinations = visibleShellDestinations(DestinationAvailability()),
                        activeDestination = ShellDestination.FOR_YOU,
                        onNavigate = {},
                    )
                }
            }
        }

        composeRule.onNodeWithTag(ShellDestination.FOR_YOU.name).assertExists()
        composeRule.onNodeWithTag(ShellDestination.SEARCH.name).assertExists()
        composeRule.onNodeWithTag(ShellDestination.MUSIC.name).assertDoesNotExist()
        composeRule.onNodeWithTag(ShellDestination.BOOKS.name).assertDoesNotExist()
        composeRule.onNodeWithTag(ShellDestination.PODCASTS.name).assertDoesNotExist()
    }

    @Test
    fun `shows every destination once every upstream is configured`() {
        composeRule.setContent {
            // Wave 16f-A-2: AuralisTheme, not a bare MaterialTheme — ShellNavigationBarItems now
            // reads AuralisAppTokens.current for its active-destination indicator, which only
            // AuralisTheme provides (LocalSonoraAppTokens has no default and throws otherwise).
            AuralisTheme {
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

        composeRule.onNodeWithTag(ShellDestination.FOR_YOU.name).assertExists()
        composeRule.onNodeWithTag(ShellDestination.MUSIC.name).assertExists()
        composeRule.onNodeWithTag(ShellDestination.BOOKS.name).assertExists()
        composeRule.onNodeWithTag(ShellDestination.PODCASTS.name).assertExists()
        composeRule.onNodeWithTag(ShellDestination.SEARCH.name).assertExists()
    }
}
