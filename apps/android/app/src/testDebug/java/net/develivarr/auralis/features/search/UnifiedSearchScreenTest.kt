package net.develivarr.auralis.features.search

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.ImageLoader
import net.develivarr.auralis.features.music.MusicAlbumUi
import net.develivarr.auralis.features.music.MusicArtistUi
import net.develivarr.auralis.features.music.MusicSearchTrackUi
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-search-A: [UnifiedSearchScreen]'s **first** Robolectric coverage — confirmed absent
 * before this wave (`docs/design/screens/SEARCH.md` §10 names the gap explicitly).
 *
 * Follows [net.develivarr.auralis.features.podcasts.PodcastDetailContentTest]'s established
 * pattern: exercise the stateless pieces — [UnifiedSearchQueryArea] and [searchResultsSection] —
 * directly against plain state, rather than [UnifiedSearchScreen] itself, which pumps a real
 * [UnifiedSearchViewModel]'s `ApiClient`/`MusicRepository`/`ServerConfigRepository` coroutines
 * through `collectAsState` and would need a full [net.develivarr.auralis.AppContainer] and
 * `NavHostController` to construct.
 *
 * [unifiedSearchStatus]/[deriveSearchSuggestions] are pure functions and are asserted directly
 * with plain JUnit, no Compose involved at all — the entire reason `SearchStatus.kt`/
 * `SearchSuggestions.kt` were split out as pure modules in the first place (§6.2/§6.4's own
 * literal-string contract is best pinned as a string equality, not rediscovered by reading
 * rendered text off a composable).
 *
 * **What the Compose tests below prove, and what they do not** — the same ceiling every
 * Robolectric test in this repo carries: they confirm a node with the given tag/text/semantics
 * exists and that a click reports the expected value; they say nothing about what the screen
 * looks like, what TalkBack actually announces, or what is reachable by touch. There is no
 * device or emulator here.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class UnifiedSearchScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader = ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()

    // --- unifiedSearchStatus (§6.4): the five literal strings, pinned as string equality ---

    @Test
    fun `status is the empty-query prompt when nothing has been typed`() {
        val status =
            unifiedSearchStatus(
                libraryUnconfigured = false,
                query = "",
                trimmedQuery = "",
                isLoading = false,
                counts = UnifiedSearchStatusCounts(),
            )

        assertEquals("Start typing to search titles, authors and narrators.", status)
    }

    @Test
    fun `status is the connect-Audiobookshelf prompt even with a typed query, outranking every other message`() {
        val status =
            unifiedSearchStatus(
                libraryUnconfigured = true,
                query = "dune",
                trimmedQuery = "dune",
                isLoading = false,
                counts = UnifiedSearchStatusCounts(books = 3),
            )

        assertEquals("Connect Audiobookshelf in Settings to search your library.", status)
    }

    @Test
    fun `status is Searching while loading, ahead of the no-matches and found sentences`() {
        val status =
            unifiedSearchStatus(
                libraryUnconfigured = false,
                query = "dune",
                trimmedQuery = "dune",
                isLoading = true,
                counts = UnifiedSearchStatusCounts(),
            )

        assertEquals("Searching…", status)
    }

    @Test
    fun `status is the no-matches sentence with the raw, untrimmed query echoed back`() {
        val status =
            unifiedSearchStatus(
                libraryUnconfigured = false,
                query = " dune ",
                trimmedQuery = "dune",
                isLoading = false,
                counts = UnifiedSearchStatusCounts(),
            )

        assertEquals("No matches for \" dune \".", status)
    }

    @Test
    fun `status joins only books and podcasts when no music side matched`() {
        val status =
            unifiedSearchStatus(
                libraryUnconfigured = false,
                query = "dune",
                trimmedQuery = "dune",
                isLoading = false,
                counts = UnifiedSearchStatusCounts(books = 1, podcasts = 0),
            )

        assertEquals("1 book, 0 podcasts found for \"dune\".", status)
    }

    @Test
    fun `status appends all three music clauses once any one music count is non-zero`() {
        val status =
            unifiedSearchStatus(
                libraryUnconfigured = false,
                query = "static",
                trimmedQuery = "static",
                isLoading = false,
                counts = UnifiedSearchStatusCounts(books = 1, podcasts = 0, artists = 2, albums = 0, tracks = 1),
            )

        assertEquals("1 book, 0 podcasts, 2 artists, 0 albums, 1 track found for \"static\".", status)
    }

    // --- deriveSearchSuggestions (§6.2): kind order, the middle-dot label, cap, exclusions ---

    @Test
    fun `derives suggestions in Books, Podcasts, Artists, Albums, Tracks order with the middle-dot label`() {
        val results =
            UnifiedSearchResultsUiState.Results(
                books = listOf(SearchBookUi(id = "b1", title = "Dune", subtitle = null, coverUrl = null)),
                podcasts = listOf(SearchPodcastUi(id = "p1", title = "The Daily Tech Brief", coverUrl = null)),
                artists = listOf(MusicArtistUi(id = "a1", name = "Nebula Prime", coverUrl = null)),
                albums = listOf(MusicAlbumUi(id = "al1", name = "Static Bloom", artistName = null, coverUrl = null)),
                tracks = listOf(MusicSearchTrackUi(id = "t1", title = "Drift", artistNames = null, albumId = "al1")),
            )

        val suggestions = deriveSearchSuggestions(results)

        assertEquals(
            listOf(
                "Dune · Book",
                "The Daily Tech Brief · Podcast",
                "Nebula Prime · Artist",
                "Static Bloom · Album",
                "Drift · Track",
            ),
            suggestions.map { it.label },
        )
    }

    @Test
    fun `excludes a track with no albumId entirely, not merely as a non-interactive entry`() {
        val results =
            UnifiedSearchResultsUiState.Results(
                tracks =
                    listOf(
                        MusicSearchTrackUi(id = "t1", title = "Has Album", artistNames = null, albumId = "al1"),
                        MusicSearchTrackUi(id = "t2", title = "No Album", artistNames = null, albumId = null),
                    ),
            )

        val suggestions = deriveSearchSuggestions(results)

        assertEquals(listOf("Has Album"), suggestions.map { it.title })
        assertFalse(suggestions.any { it.title == "No Album" })
    }

    @Test
    fun `caps at 8 total across every kind combined`() {
        val results =
            UnifiedSearchResultsUiState.Results(
                books = (1..5).map { SearchBookUi(id = "b$it", title = "Book $it", subtitle = null, coverUrl = null) },
                podcasts = (1..5).map { SearchPodcastUi(id = "p$it", title = "Podcast $it", coverUrl = null) },
            )

        val suggestions = deriveSearchSuggestions(results)

        assertEquals(SEARCH_SUGGESTION_CAP, suggestions.size)
        assertEquals(5, suggestions.count { it.target is SearchSuggestionTarget.Book })
        assertEquals(3, suggestions.count { it.target is SearchSuggestionTarget.Podcast })
    }

    // --- UnifiedSearchQueryArea: the live-region status line and the suggestion dropdown ---

    @Test
    fun `the status text carries a polite live region`() {
        composeRule.setContent {
            AuralisTheme {
                UnifiedSearchQueryArea(
                    query = "",
                    onQueryChange = {},
                    statusText = "Start typing to search titles, authors and narrators.",
                    suggestions = emptyList(),
                    onSelectSuggestion = {},
                )
            }
        }

        composeRule
            .onNodeWithTag("search-status")
            .assertExists()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        composeRule.onNodeWithText("Start typing to search titles, authors and narrators.").assertExists()
    }

    @Test
    fun `selecting a suggestion reports it back by identity, not merely by position`() {
        var selected: SearchSuggestionUi? = null
        val suggestion =
            SearchSuggestionUi(
                id = "book:b1",
                title = "Dune",
                label = "Dune · Book",
                target = SearchSuggestionTarget.Book("b1"),
            )

        composeRule.setContent {
            AuralisTheme {
                UnifiedSearchQueryArea(
                    query = "dun",
                    onQueryChange = {},
                    statusText = "Searching…",
                    suggestions = listOf(suggestion),
                    onSelectSuggestion = { selected = it },
                )
            }
        }
        // §6.2's "Visibility" rule needs the field focused as well as a non-empty query and a
        // candidate — tap the field first, exactly as a real typing user would.
        composeRule.onNodeWithTag("search-field").performClick()

        composeRule.onNodeWithTag("search-suggestion-book:b1").performClick()

        assertEquals(suggestion, selected)
    }

    // --- searchResultsSection: the book-tap fix, and series/authors staying non-interactive ---

    @Test
    fun `the book row's onClick is wired to onOpenBook — a regression guard against the dead-tap-target gap`() {
        var openedBookId: String? = null
        composeRule.setContent {
            AuralisTheme {
                LazyColumn {
                    searchResultsSection(
                        state =
                            UnifiedSearchResultsUiState.Results(
                                books = listOf(SearchBookUi(id = "b1", title = "Dune", subtitle = null, coverUrl = null)),
                            ),
                        visible = VisibleKinds(books = true),
                        imageLoader = imageLoader,
                        onOpenBook = { openedBookId = it },
                        onOpenPodcast = {},
                        onOpenArtist = {},
                        onOpenAlbum = {},
                        requestableBooksState = RequestableBooksUiState.Idle,
                        requestableMusicState = RequestableMusicUiState.Idle,
                        query = "dune",
                        onRequestRelease = {},
                        onRequestAnyway = {},
                        onRequestCandidate = {},
                    )
                }
            }
        }

        composeRule.onNodeWithText("Dune").performClick()

        assertEquals("b1", openedBookId)
    }

    @Test
    fun `series and author rows remain plain, non-interactive text`() {
        composeRule.setContent {
            AuralisTheme {
                LazyColumn {
                    searchResultsSection(
                        state =
                            UnifiedSearchResultsUiState.Results(
                                series = listOf(SearchSeriesUi(id = "s1", name = "The Dune Saga")),
                                authors = listOf(SearchAuthorUi(id = "au1", name = "Frank Herbert")),
                            ),
                        visible = VisibleKinds(series = true, authors = true),
                        imageLoader = imageLoader,
                        onOpenBook = {},
                        onOpenPodcast = {},
                        onOpenArtist = {},
                        onOpenAlbum = {},
                        requestableBooksState = RequestableBooksUiState.Idle,
                        requestableMusicState = RequestableMusicUiState.Idle,
                        query = "dune",
                        onRequestRelease = {},
                        onRequestAnyway = {},
                        onRequestCandidate = {},
                    )
                }
            }
        }

        composeRule.onNodeWithText("The Dune Saga").assertExists().assertHasNoClickAction()
        composeRule.onNodeWithText("Frank Herbert").assertExists().assertHasNoClickAction()
    }
}
