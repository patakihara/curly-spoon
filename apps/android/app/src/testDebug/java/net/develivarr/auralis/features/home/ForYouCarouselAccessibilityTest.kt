package net.develivarr.auralis.features.home

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.ImageLoader
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 14b-2: proves [ForYouCard] groups a card's cover, title, subtitle and (when present) the
 * owning shelf's recommendation reason into **one** accessibility node, instead of the loose
 * sibling `Text`s HANDOVER's phase-13 audit found (no `semantics`/`clearAndSetSemantics` anywhere
 * in `features/home/`, `contentDescription` set only on decorative cover art, the reason never
 * reachable from a card at all).
 *
 * Deliberately resolves real Compose nodes through [createComposeRule] rather than asserting on
 * [feedItemAnnouncement] alone — a test that only inspects that pure function's return value
 * would stay green even if [ForYouCard] never applied the semantics modifier at all, which is
 * exactly the "writer with no reader"/"return-value-only test" failure class `HANDOVER.md`
 * records repeatedly on this project.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ForYouCarouselAccessibilityTest {

    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader: ImageLoader by lazy {
        ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()
    }

    private val itemWithSubtitle =
        FeedItem(
            id = "book-1",
            contentType = ForYouContentType.BOOKS,
            title = "The Fifth Season",
            subtitle = "N.K. Jemisin",
            coverUrl = null,
            progress = 0.4,
        )

    private val itemWithoutSubtitle =
        FeedItem(
            id = "album-1",
            contentType = ForYouContentType.MUSIC,
            title = "Discovery",
            subtitle = null,
            coverUrl = null,
            progress = null,
        )

    @Test
    fun `a card with a reason resolves as one merged node whose description includes the title and the reason`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(
                        item = itemWithSubtitle,
                        imageLoader = imageLoader,
                        onClick = {},
                        reason = "because you finished The Stone Sky",
                    )
                }
            }
        }

        // Resolvable as one node whose merged description carries both halves.
        composeRule
            .onNodeWithContentDescription(
                "The Fifth Season, N.K. Jemisin — because you finished The Stone Sky",
            )
            .assertExists()

        // Deliberately NOT asserted here: that the bare title is unreachable via
        // `onNodeWithText`. `mergeDescendants` collapses the child *nodes*, but the merge policy
        // for `Text` concatenates rather than replaces, so the merged node still carries every
        // child's `Text` property — only `clearAndSetSemantics {}` would drop them, and this card
        // must not use that, because it would discard `clickable`'s onClick action too. So
        // `onNodeWithText("The Fifth Season")` still resolves, to the merged node itself. The
        // `assertExists` above is what pins the grouping: delete the `semantics` modifier and no
        // node carries that contentDescription, so this test fails.
    }

    @Test
    fun `a card with no reason still resolves as one sensible node, with no trailing separator`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(
                        item = itemWithoutSubtitle,
                        imageLoader = imageLoader,
                        onClick = {},
                        reason = null,
                    )
                }
            }
        }

        // Cold-start / no-signal case: no " — " suffix, no dangling separator, no crash.
        composeRule.onNodeWithContentDescription("Discovery").assertExists()
    }

    @Test
    fun `decorative cover art contributes nothing to the merged description`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(
                        item = itemWithSubtitle,
                        imageLoader = imageLoader,
                        onClick = {},
                        reason = null,
                    )
                }
            }
        }

        // If the cover's null contentDescription leaked into the merge as a literal "null", or a
        // second node materialised for it, this exact-match query would fail.
        composeRule
            .onNodeWithContentDescription("The Fifth Season, N.K. Jemisin")
            .assertExists()
    }
}
