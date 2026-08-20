package net.develivarr.auralis.features.music

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.ImageLoader
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-search-A-3: [MusicSearchScreen]'s **first** Robolectric coverage, closing the gap
 * `16e-search-A-2` named but deliberately left alone because it belongs to a different screen —
 * `SearchTrackRow` here was the only track row in the app with no cover-art tile at all.
 *
 * Follows [net.develivarr.auralis.features.search.UnifiedSearchScreenTest]'s established
 * pattern: exercise `searchResultsSection` (made `internal`, matching that file's own
 * `searchResultsSection`, for exactly this reason) directly against plain state, rather than
 * [MusicSearchScreen] itself, which pumps a real [MusicSearchViewModel]'s `MusicRepository`/
 * `ServerConfigRepository` coroutines through `collectAsState` and would need a full
 * [net.develivarr.auralis.AppContainer] and `NavHostController` to construct.
 *
 * **What these tests prove, and what they do not** — the same ceiling every Robolectric test in
 * this repo carries: they confirm a node with the given tag/text exists and that a click reports
 * the expected value; they say nothing about what the screen looks like, what TalkBack actually
 * announces, or what is reachable by touch. There is no device or emulator here. Coil never
 * resolves a real image under Robolectric (no network, no decoder), so the fallback icon is the
 * only art signal these tests can observe — they say nothing about what a real cover looks like
 * once loaded, only that the same fallback machinery every other result kind already had is now
 * wired up for tracks here too.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MusicSearchScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader = ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()

    @Test
    fun `a track result renders a fallback cover-art tile, matching the unified search screen's own track row`() {
        composeRule.setContent {
            AuralisTheme {
                LazyColumn {
                    searchResultsSection(
                        state =
                            MusicSearchResultsUiState.Results(
                                artists = emptyList(),
                                albums = emptyList(),
                                tracks =
                                    listOf(
                                        MusicSearchTrackUi(
                                            id = "t1",
                                            title = "Drift",
                                            artistNames = "Nebula Prime",
                                            albumId = "al1",
                                        ),
                                    ),
                            ),
                        imageLoader = imageLoader,
                        onOpenArtist = {},
                        onOpenAlbum = {},
                        onRetry = {},
                    )
                }
            }
        }

        // Discriminates: before this wave, SearchTrackRow rendered two bare Texts and no
        // Box/Icon/AsyncImage at all, so no node with this tag (or any MusicNote icon) existed
        // on a track row here — every other kind on the unified search screen already had one
        // via MusicRow/SearchResultTrackRow, which is exactly the asymmetry 16e-search-A-2
        // named and left for this wave to close.
        // Unmerged, same reason as UnifiedSearchScreenTest's identical assertion: the row's
        // `.clickable(...)` modifier groups its children into one announced node, which hides
        // a descendant's testTag from the default (merged) lookup.
        composeRule
            .onNodeWithTag("music-search-track-art-fallback-t1", useUnmergedTree = true)
            .assertExists()
        composeRule.onNodeWithText("Drift").assertExists()
    }

    @Test
    fun `a track with an albumId is tappable and opens that album — cover art does not change the click target`() {
        var openedAlbumId: String? = null
        composeRule.setContent {
            AuralisTheme {
                LazyColumn {
                    searchResultsSection(
                        state =
                            MusicSearchResultsUiState.Results(
                                artists = emptyList(),
                                albums = emptyList(),
                                tracks =
                                    listOf(
                                        MusicSearchTrackUi(
                                            id = "t1",
                                            title = "Drift",
                                            artistNames = "Nebula Prime",
                                            albumId = "al1",
                                        ),
                                    ),
                            ),
                        imageLoader = imageLoader,
                        onOpenArtist = {},
                        onOpenAlbum = { openedAlbumId = it },
                        onRetry = {},
                    )
                }
            }
        }

        composeRule.onNodeWithText("Drift").performClick()

        assertEquals("al1", openedAlbumId)
    }

    @Test
    fun `a track with no albumId stays non-interactive, even with its new cover-art tile`() {
        composeRule.setContent {
            AuralisTheme {
                LazyColumn {
                    searchResultsSection(
                        state =
                            MusicSearchResultsUiState.Results(
                                artists = emptyList(),
                                albums = emptyList(),
                                tracks =
                                    listOf(
                                        MusicSearchTrackUi(
                                            id = "t2",
                                            title = "Loose End",
                                            artistNames = null,
                                            albumId = null,
                                        ),
                                    ),
                            ),
                        imageLoader = imageLoader,
                        onOpenArtist = {},
                        onOpenAlbum = { error("must not navigate — this track has no albumId") },
                        onRetry = {},
                    )
                }
            }
        }

        // Same "no clickable modifier at all when there's nowhere to navigate" contract this
        // file's own MusicSearchScreen.kt doc comment states, now re-asserted with cover art
        // present: adding the tile must not make an unnavigable row read or act navigable.
        composeRule.onNodeWithText("Loose End").assertExists().assertHasNoClickAction()
        // The fallback tile still renders — it is a sibling of the (absent) clickable modifier,
        // not gated by it.
        composeRule
            .onNodeWithTag("music-search-track-art-fallback-t2", useUnmergedTree = true)
            .assertExists()
    }
}
