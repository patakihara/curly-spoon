package net.develivarr.auralis.features.books

import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.ImageLoader
import net.develivarr.auralis.features.home.DownloadActionState
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-book-A: proves [BookDetailContent] — the book detail screen's stateless half — renders
 * the content inventory `docs/design/screens/BOOK_DETAIL.md` §2/§3 specify and that tapping a
 * chapter or the Play button reports the right thing back, using the harness `ComposeHarnessTest`
 * proved out in 14b-1. Follows `SettingsContentTest`'s established pattern: exercise the stateless
 * content composable directly rather than [BookDetailScreen] itself, which pumps a real
 * `BookDetailViewModel`'s coroutines through `collectAsState` and would only be testing that
 * `collectAsState` works, not this wave's own logic.
 *
 * **What this proves, and what it does not** — the same ceiling this project's every Robolectric
 * test carries: it confirms a node with the given tag/text/contentDescription exists and that a
 * click reports the expected value; it says nothing about what the screen looks like, what
 * TalkBack actually announces, or what is reachable by touch. There is no device or emulator here.
 * No `captureToImage()` — this repo has no working precedent for it (removed twice today after
 * repeated CI failures no local JDK could diagnose), so nothing here asserts on a pixel or a
 * colour; the active-chapter *highlight's colour* is untested for that reason, only that the right
 * row is the one carrying the "current chapter" announcement (see the last test below).
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BookDetailContentTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader = ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()

    private val twoChapters =
        listOf(
            BookChapterUi(index = 1, title = "Chapter One", startMs = 0L, timeLabel = "0:00"),
            BookChapterUi(index = 2, title = "Chapter Two", startMs = 600_000L, timeLabel = "10:00"),
        )

    private fun sampleData(
        chapters: List<BookChapterUi> = twoChapters,
        playLabel: String = "Play",
    ) = BookDetailUiData(
        itemId = "book1",
        title = "The Fellowship of the Ring",
        subtitle = null,
        authorNames = "J. R. R. Tolkien",
        coverUrl = null,
        description = "One Ring to rule them all.",
        metaLine = "Narrated by Rob Inglis · 19 h 07 m · 2 chapters",
        chapters = chapters,
        playLabel = playLabel,
    )

    @Test
    fun `renders the title, author, meta line, description and every chapter`() {
        composeRule.setContent {
            AuralisTheme {
                BookDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    downloadState = DownloadActionState.IDLE,
                    activeChapterIndex = null,
                    onPlay = {},
                    onDownload = {},
                    onChapterClick = {},
                )
            }
        }

        composeRule.onNodeWithText("The Fellowship of the Ring").assertExists()
        composeRule.onNodeWithText("J. R. R. Tolkien").assertExists()
        composeRule.onNodeWithText("Narrated by Rob Inglis · 19 h 07 m · 2 chapters").assertExists()
        composeRule.onNodeWithText("One Ring to rule them all.").assertExists()
        composeRule.onNodeWithTag("book-chapters-heading").assertExists()
        composeRule.onNodeWithTag("book-chapter-1").assertExists()
        composeRule.onNodeWithTag("book-chapter-2").assertExists()
    }

    @Test
    fun `omits the Chapters section entirely when the book has no chapter markers`() {
        composeRule.setContent {
            AuralisTheme {
                BookDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(chapters = emptyList()),
                    downloadState = DownloadActionState.IDLE,
                    activeChapterIndex = null,
                    onPlay = {},
                    onDownload = {},
                    onChapterClick = {},
                )
            }
        }

        composeRule.onNodeWithTag("book-chapters-heading").assertDoesNotExist()
    }

    @Test
    fun `the Play button carries the play label as its accessible name and reports a tap`() {
        var played = false
        composeRule.setContent {
            AuralisTheme {
                BookDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(playLabel = "Resume"),
                    downloadState = DownloadActionState.IDLE,
                    activeChapterIndex = null,
                    onPlay = { played = true },
                    onDownload = {},
                    onChapterClick = {},
                )
            }
        }

        composeRule.onNodeWithTag("book-play-button").assertExists()
        composeRule.onNodeWithText("Resume").assertExists()
        composeRule.onNodeWithTag("book-play-button").performClick()

        assertEquals(true, played)
    }

    @Test
    fun `the download button reflects its current state's label`() {
        composeRule.setContent {
            AuralisTheme {
                BookDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    downloadState = DownloadActionState.ENQUEUED,
                    activeChapterIndex = null,
                    onPlay = {},
                    onDownload = {},
                    onChapterClick = {},
                )
            }
        }

        composeRule.onNodeWithTag("book-download-button").assertExists()
        composeRule.onNodeWithText("Queued").assertExists()
    }

    @Test
    fun `tapping a chapter reports that exact chapter, not just any tap`() {
        var tapped: BookChapterUi? = null
        composeRule.setContent {
            AuralisTheme {
                BookDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    downloadState = DownloadActionState.IDLE,
                    activeChapterIndex = null,
                    onPlay = {},
                    onDownload = {},
                    onChapterClick = { tapped = it },
                )
            }
        }

        composeRule.onNodeWithTag("book-chapter-2").performClick()

        assertEquals("Chapter Two", tapped?.title)
        assertEquals(2, tapped?.index)
    }

    /**
     * Proves the merged-semantics grouping end to end, not just as the pure
     * [chapterAnnouncement] function `BookDetailViewModelTest` already covers — the same shape
     * 14b-1's second test used to prove `ForYouCarouselRow`'s own grouping actually reaches the
     * composed semantics tree. Per §6 of the spec, active-chapter state "must be exposed as a
     * semantic property … not conveyed by colour alone": this is that property, read back.
     */
    @Test
    fun `the active chapter's row carries a merged current-chapter announcement, the inactive one does not`() {
        composeRule.setContent {
            AuralisTheme {
                BookDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    downloadState = DownloadActionState.IDLE,
                    activeChapterIndex = 2,
                    onPlay = {},
                    onDownload = {},
                    onChapterClick = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Chapter Two, 10:00, current chapter").assertExists()
        composeRule.onNodeWithContentDescription("Chapter One, 0:00").assertExists()
    }
}
