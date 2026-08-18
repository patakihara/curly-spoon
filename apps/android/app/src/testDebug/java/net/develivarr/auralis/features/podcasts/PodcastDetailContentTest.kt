package net.develivarr.auralis.features.podcasts

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import coil.ImageLoader
import net.develivarr.auralis.ui.theme.AuralisTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Wave 16e-podcast-A: proves [PodcastDetailContent] — the podcast detail screen's stateless half
 * — renders `docs/design/screens/PODCAST_DETAIL.md` §2/§3/§5/§6's content inventory, and that
 * tapping "Play latest" or an episode row reports the right thing back. Follows
 * [net.develivarr.auralis.features.books.BookDetailContentTest]'s established pattern: exercise
 * the stateless content composable directly, not [PodcastDetailScreen] itself, which pumps a real
 * [PodcastDetailViewModel]'s coroutines through `collectAsState`.
 *
 * This is `PodcastDetailScreen`'s **first** Robolectric coverage — `HANDOVER.md` and
 * `docs/design/screens/PODCAST_DETAIL.md` §10 both record that it had none before this wave,
 * confirmed by directory listing before this file was added.
 *
 * **What this proves, and what it does not** — the same ceiling every Robolectric test in this
 * repo carries: it confirms a node with the given tag/text/contentDescription exists and that a
 * click reports the expected value; it says nothing about what the screen looks like, what
 * TalkBack actually announces, or what is reachable by touch. There is no device or emulator
 * here. No `captureToImage()` — this repo has no working precedent for it — so nothing here
 * asserts on a pixel or a colour; the played/pending status icon's identity is untested for that
 * reason, only that the right thing (icon vs. progress indicator) is present per row.
 *
 * All fixture episodes use `publishedAt = null` deliberately, so `formatPublishedDate` always
 * resolves to the fixed "—" degrade rather than a `SimpleDateFormat`-formatted date, which would
 * make the expected content-description strings depend on the running JVM's default timezone.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PodcastDetailContentTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val imageLoader = ImageLoader.Builder(ApplicationProvider.getApplicationContext()).build()

    private val twoEpisodes =
        listOf(
            PodcastEpisodeUi(
                id = "ep1",
                title = "Episode One",
                publishedAt = null,
                durationSeconds = 600L,
                progressState = EpisodeProgressState.UNPLAYED,
            ),
            PodcastEpisodeUi(
                id = "ep2",
                title = "Episode Two",
                publishedAt = null,
                durationSeconds = 3240L,
                progressState = EpisodeProgressState.PLAYED,
            ),
        )

    private fun sampleData(
        episodes: List<PodcastEpisodeUi> = twoEpisodes,
        meta: String? = "2 episodes · 1 unplayed",
        playLatestEpisodeId: String? = "ep1",
    ) = PodcastDetailUiData(
        title = "Tech Media Collective",
        author = "Tech Media Collective",
        description = "Weekly conversations about self-hosting.",
        coverUrl = null,
        episodes = episodes,
        meta = meta,
        playLatestEpisodeId = playLatestEpisodeId,
    )

    /**
     * Wiring the meta line and "Play latest" into `MediaHeader`'s previously-empty `meta`/
     * `actions` slots (§10 of the spec) makes the header taller than the empty slots left it —
     * `BookDetailContentTest`'s own doc comment already documents this exact failure mode for
     * `16e-book-A-2`'s header adoption growing `BookDetailContent`'s `LazyColumn` past its
     * initially-composed viewport. `PodcastDetailContent` is the same shape
     * (`PodcastDetailScreen.kt`'s `LazyColumn`), so every assertion below scrolls to its target
     * first rather than assuming it's already composed.
     */
    private fun scrollToTag(tag: String) {
        composeRule
            .onNode(SemanticsMatcher.keyIsDefined(SemanticsActions.ScrollToIndex))
            .performScrollToNode(hasTestTag(tag))
    }

    private fun scrollToDescription(description: String) {
        composeRule
            .onNode(SemanticsMatcher.keyIsDefined(SemanticsActions.ScrollToIndex))
            .performScrollToNode(hasContentDescription(description))
    }

    @Test
    fun `renders the header's title, author, meta line, description and Play latest button`() {
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = null,
                    onOrderChange = {},
                    onPlayEpisode = {},
                )
            }
        }

        composeRule.onNodeWithText("Tech Media Collective").assertExists()
        composeRule.onNodeWithText("2 episodes · 1 unplayed").assertExists()
        composeRule.onNodeWithText("Weekly conversations about self-hosting.").assertExists()
        composeRule.onNodeWithTag("podcast-play-latest-button").assertExists()
        composeRule.onNodeWithText("Play latest").assertExists()
    }

    @Test
    fun `omits the meta line and Play latest button when the podcast has no episodes`() {
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(episodes = emptyList(), meta = null, playLatestEpisodeId = null),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = null,
                    onOrderChange = {},
                    onPlayEpisode = {},
                )
            }
        }

        composeRule.onNodeWithTag("media-header-meta").assertDoesNotExist()
        composeRule.onNodeWithTag("podcast-play-latest-button").assertDoesNotExist()
        scrollToTag("podcast-empty-episodes")
        composeRule.onNodeWithTag("podcast-empty-episodes").assertExists()
    }

    @Test
    fun `tapping Play latest reports the newest episode's id, not just any episode`() {
        var played: String? = null
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(playLatestEpisodeId = "ep1"),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = null,
                    onOrderChange = {},
                    onPlayEpisode = { played = it },
                )
            }
        }

        composeRule.onNodeWithTag("podcast-play-latest-button").performClick()

        assertEquals("ep1", played)
    }

    @Test
    fun `Play latest shows a progress indicator and is disabled while its own episode is pending`() {
        var played: String? = null
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(playLatestEpisodeId = "ep1"),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = "ep1",
                    onOrderChange = {},
                    onPlayEpisode = { played = it },
                )
            }
        }

        composeRule.onNodeWithTag("podcast-play-latest-progress").assertExists()
        composeRule.onNodeWithText("Play latest").assertDoesNotExist()
        // Disabled via Button's own `enabled` param — a tap while pending must not report again.
        composeRule.onNodeWithTag("podcast-play-latest-button").performClick()
        assertNull(played)
    }

    @Test
    fun `tapping an episode row reports that exact episode, not just any tap`() {
        var tapped: String? = null
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = null,
                    onOrderChange = {},
                    onPlayEpisode = { tapped = it },
                )
            }
        }

        scrollToTag("podcast-episode-ep2")
        composeRule.onNodeWithTag("podcast-episode-ep2").performClick()

        assertEquals("ep2", tapped)
    }

    @Test
    fun `a pending episode row shows a progress indicator and does not report a further tap`() {
        var tapped: String? = null
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = "ep1",
                    onOrderChange = {},
                    onPlayEpisode = { tapped = it },
                )
            }
        }

        scrollToTag("podcast-episode-ep1-progress")
        composeRule.onNodeWithTag("podcast-episode-ep1-progress").assertExists()
        composeRule.onNodeWithTag("podcast-episode-ep1").performClick()

        assertNull(tapped)
    }

    /**
     * Proves the merged-semantics grouping (§11 of the spec: "must announce, at minimum: its
     * title, its publish date, its duration, and its played/in-progress/unplayed state") end to
     * end, not just as a pure function in isolation — the same shape
     * `BookDetailContentTest`'s active-chapter test uses for `BookChapterRow`. Every episode here
     * has `publishedAt = null`, so the date segment is always the fixed "—" degrade — see this
     * file's own top-of-class doc comment for why that's deliberate.
     */
    @Test
    fun `each episode row's merged content description carries its title, date, duration and progress state`() {
        val episodes =
            listOf(
                PodcastEpisodeUi(
                    id = "ep-unplayed",
                    title = "Unplayed Episode",
                    publishedAt = null,
                    durationSeconds = 65L,
                    progressState = EpisodeProgressState.UNPLAYED,
                ),
                PodcastEpisodeUi(
                    id = "ep-progress",
                    title = "In-Progress Episode",
                    publishedAt = null,
                    durationSeconds = 125L,
                    progressState = EpisodeProgressState.IN_PROGRESS,
                ),
                PodcastEpisodeUi(
                    id = "ep-played",
                    title = "Played Episode",
                    publishedAt = null,
                    durationSeconds = 3600L,
                    progressState = EpisodeProgressState.PLAYED,
                ),
            )
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(episodes = episodes, playLatestEpisodeId = "ep-unplayed"),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = null,
                    onOrderChange = {},
                    onPlayEpisode = {},
                )
            }
        }

        scrollToDescription("Unplayed Episode, —, 1:05, unplayed")
        composeRule.onNodeWithContentDescription("Unplayed Episode, —, 1:05, unplayed").assertExists()
        scrollToDescription("In-Progress Episode, —, 2:05, in progress")
        composeRule.onNodeWithContentDescription("In-Progress Episode, —, 2:05, in progress").assertExists()
        scrollToDescription("Played Episode, —, 1:00:00, played")
        composeRule.onNodeWithContentDescription("Played Episode, —, 1:00:00, played").assertExists()
    }

    @Test
    fun `the episode order toggle reports the destination state, not the current one`() {
        var newOrder: EpisodeOrder? = null
        composeRule.setContent {
            AuralisTheme {
                PodcastDetailContent(
                    modifier = Modifier,
                    imageLoader = imageLoader,
                    data = sampleData(),
                    order = EpisodeOrder.NEWEST,
                    pendingEpisodeId = null,
                    onOrderChange = { newOrder = it },
                    onPlayEpisode = {},
                )
            }
        }

        scrollToTag("podcast-order-toggle")
        composeRule.onNodeWithText("Show oldest first").assertExists()
        composeRule.onNodeWithTag("podcast-order-toggle").performClick()

        assertEquals(EpisodeOrder.OLDEST, newOrder)
    }
}
