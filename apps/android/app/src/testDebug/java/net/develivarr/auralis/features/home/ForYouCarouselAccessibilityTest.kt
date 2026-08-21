package net.develivarr.auralis.features.home

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
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

    /** Wave 15d — an external recommendation, the item under test for the two cases below. */
    private val externalItem =
        FeedItem(
            id = "external:listenbrainz:mbid-1",
            contentType = ForYouContentType.MUSIC,
            title = "Random Access Memories",
            subtitle = "Daft Punk",
            coverUrl = null,
            progress = null,
            isExternal = true,
        )

    /** Wave 15d-1-books — the book counterpart of [externalItem], proving the badge/announcement
     * behaviour [ForYouCard]/[feedItemAnnouncement] already give every [FeedItem] (they never
     * branch on [FeedItem.contentType] — confirmed by reading both, not assumed) actually reaches
     * a book-flavoured item, not just the music one those functions were originally proved with. */
    private val externalBookItem =
        FeedItem(
            id = "external:openlibrary:/works/OL1111111W",
            contentType = ForYouContentType.BOOKS,
            title = "Dune Messiah",
            subtitle = "Frank Herbert",
            coverUrl = null,
            progress = null,
            isExternal = true,
        )

    /** Wave 15c-2-A — one item from a mixed `GET /api/v1/recommended` shelf, the only kind of
     * item that ever carries a non-null [FeedItem.typeLabel]. */
    private val mixedShelfItem =
        FeedItem(
            id = "album-mixed-1",
            contentType = ForYouContentType.MUSIC,
            title = "Discovery",
            subtitle = "Daft Punk",
            coverUrl = null,
            progress = null,
            typeLabel = "Album",
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

    /** Wave 15d — the accessible half of "not in your library" must be announced, not just
     * drawn: an external card whose badge is visual-only would be a silent divergence from the
     * merged-node contract [feedItemAnnouncement] already establishes for the reason line above.
     * Ordered ahead of the reason in [feedItemAnnouncement], so it's asserted mid-string here
     * too, not just appended. */
    @Test
    fun `an external item's merged description announces 'Not in library' ahead of the reason`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(
                        item = externalItem,
                        imageLoader = imageLoader,
                        onClick = {},
                        reason = "Because you like Daft Punk",
                    )
                }
            }
        }

        composeRule
            .onNodeWithContentDescription(
                "Random Access Memories, Daft Punk — Not in library — Because you like Daft Punk",
            )
            .assertExists()
    }

    /** Wave 15d — the visual half: this Robolectric harness confirms a node with the expected
     * *text* exists in the rendered tree (real Compose layout, not a pure-function assertion on
     * [feedItemAnnouncement] alone) — see this file's own header comment for why that distinction
     * matters. It does **not** prove what the badge looks like, where it sits over the cover, or
     * what TalkBack actually announces on a device; there is no device or emulator here. */
    @Test
    fun `an external item renders a visible 'Not in library' text node`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(item = externalItem, imageLoader = imageLoader, onClick = {}, reason = null)
                }
            }
        }

        composeRule.onNodeWithText("Not in library").assertExists()
    }

    /** Wave 15d — the negative case: an owned item (the pre-existing default,
     * `isExternal = false`) must render neither the badge text node nor the announcement suffix,
     * so "owned items are completely unchanged" is checked, not merely assumed from the badge's
     * `if` guard. */
    @Test
    fun `an owned item announces no 'Not in library' suffix and renders no badge text`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(item = itemWithSubtitle, imageLoader = imageLoader, onClick = {}, reason = null)
                }
            }
        }

        composeRule.onNodeWithContentDescription("The Fifth Season, N.K. Jemisin").assertExists()
        composeRule.onAllNodesWithText("Not in library").assertCountEquals(0)
    }

    /** Wave 15d-1-books: the badge/announcement behaviour proved above for a MUSIC external item
     * holds for a BOOKS one too — the same node, the same merged `contentDescription`, the same
     * visible text — closing the "status must be announced, not merely drawn" requirement for
     * the medium this wave is actually about. */
    @Test
    fun `an external book item's merged description announces 'Not in library' and renders a visible badge`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(item = externalBookItem, imageLoader = imageLoader, onClick = {}, reason = null)
                }
            }
        }

        composeRule
            .onNodeWithContentDescription("Dune Messiah, Frank Herbert — Not in library")
            .assertExists()
        composeRule.onNodeWithText("Not in library").assertExists()
    }

    /** Wave 15c-2-A — the property this wave is graded on: a mixed shelf's type label must be
     * *announced*, not merely drawn. Proves both halves through real rendered nodes rather than a
     * pure-function assertion on [feedItemDisplaySubtitle] alone, same reasoning as this file's
     * header comment. The mechanism: [ForYouCard]'s subtitle `Text` renders
     * [feedItemDisplaySubtitle], and [feedItemAnnouncement] folds
     * [feedItemContentDescription] — which also reads [feedItemDisplaySubtitle] — into the same
     * merged `contentDescription` at `ForYouCarousel.kt:223-225`. One text source, two surfaces. */
    @Test
    fun `a mixed-shelf item's type label leads the subtitle in both the visible text and the merged announcement`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    ForYouCard(item = mixedShelfItem, imageLoader = imageLoader, onClick = {}, reason = null)
                }
            }
        }

        // Visible: the subtitle row itself reads "Album • Daft Punk".
        composeRule.onNodeWithText("Album • Daft Punk").assertExists()
        // Announced: the merged contentDescription carries the same label-prefixed string.
        composeRule.onNodeWithContentDescription("Discovery, Album • Daft Punk").assertExists()
    }
}
