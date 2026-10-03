package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.generated.ui.AccountButtonProps
import net.develivarr.auralis.generated.ui.ArtistCardProps
import net.develivarr.auralis.generated.ui.BottomNavItem
import net.develivarr.auralis.generated.ui.BottomNavProps
import net.develivarr.auralis.generated.ui.ButtonGroupItem
import net.develivarr.auralis.generated.ui.ButtonGroupProps
import net.develivarr.auralis.generated.ui.ButtonProps
import net.develivarr.auralis.generated.ui.EpisodeRowProps
import net.develivarr.auralis.generated.ui.ExpandableTextProps
import net.develivarr.auralis.generated.ui.ExpanderRowProps
import net.develivarr.auralis.generated.ui.FeatureCardProps
import net.develivarr.auralis.generated.ui.FieldRowProps
import net.develivarr.auralis.generated.ui.FollowButtonProps
import net.develivarr.auralis.generated.ui.IconButtonProps
import net.develivarr.auralis.generated.ui.LyricsPageProps
import net.develivarr.auralis.generated.ui.MediaCardProps
import net.develivarr.auralis.generated.ui.MediaHeaderProps
import net.develivarr.auralis.generated.ui.MiniPlayerProps
import net.develivarr.auralis.generated.ui.NowPlayingPageProps
import net.develivarr.auralis.generated.ui.NowPlayingProps
import net.develivarr.auralis.generated.ui.OverflowMenuItem
import net.develivarr.auralis.generated.ui.OverflowMenuProps
import net.develivarr.auralis.generated.ui.PreviewButtonProps
import net.develivarr.auralis.generated.ui.QueuePageProps
import net.develivarr.auralis.generated.ui.QuickPickProps
import net.develivarr.auralis.generated.ui.ResultRowProps
import net.develivarr.auralis.generated.ui.SearchFieldProps
import net.develivarr.auralis.generated.ui.SectionProps
import net.develivarr.auralis.generated.ui.SettingRowProps
import net.develivarr.auralis.generated.ui.SortFilterBarProps
import net.develivarr.auralis.generated.ui.StatusBannerProps
import net.develivarr.auralis.generated.ui.TabBarItem
import net.develivarr.auralis.generated.ui.TabBarProps
import net.develivarr.auralis.generated.ui.ValueRowProps
import net.develivarr.auralis.generated.ui.ViewToggleProps
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Each interactive Sonora component, drawn with no action. */
internal val unbound: List<Pair<String, @Composable () -> Unit>> = listOf(
    "AccountButton" to { AccountButton(AccountButtonProps(label = "Account")) },
    "ArtistCard" to { ArtistCard(ArtistCardProps(title = "Artist")) },
    "BottomNav" to { BottomNav(BottomNavProps(items = listOf(BottomNavItem("home", "Home", "home")), active = "home")) },
    "Button" to { Button(ButtonProps(children = null)) },
    "ButtonGroup" to { ButtonGroup(ButtonGroupProps(items = listOf(ButtonGroupItem("all", "All")))) },
    "EpisodeRow" to { EpisodeRow(EpisodeRowProps(title = "Episode")) },
    // Controlled: left uncontrolled it keeps its own state, a whole action of its own.
    "ExpandableText" to { ExpandableText(ExpandableTextProps(text = "Text", expanded = false)) },
    "ExpanderRow" to { ExpanderRow(ExpanderRowProps(label = "Chapters")) },
    "FeatureCard" to { FeatureCard(FeatureCardProps(title = "Feature")) },
    "FieldRow" to { FieldRow(FieldRowProps(label = "Server", value = "auralis")) },
    "FollowButton" to { FollowButton(FollowButtonProps()) },
    "IconButton" to { IconButton(IconButtonProps(label = "Close")) },
    "LyricsPage" to { LyricsPage(LyricsPageProps()) },
    "MediaCard" to { MediaCard(MediaCardProps(title = "Album")) },
    "MediaHeader" to { MediaHeader(MediaHeaderProps(title = "Album")) },
    "MiniPlayer" to { MiniPlayer(MiniPlayerProps(title = "Track", artist = "Artist")) },
    "NowPlaying" to { NowPlaying(NowPlayingProps(tab = "now")) },
    "NowPlayingPage" to { NowPlayingPage(NowPlayingPageProps(title = "Track")) },
    "OverflowMenu" to { OverflowMenu(OverflowMenuProps(items = listOf(OverflowMenuItem("share", "Share")))) },
    "PreviewButton" to { PreviewButton(PreviewButtonProps(label = "Preview")) },
    "QueuePage" to { QueuePage(QueuePageProps()) },
    "QuickPick" to { QuickPick(QuickPickProps(title = "Pick")) },
    "ResultRow" to { ResultRow(ResultRowProps(title = "Result")) },
    "SearchField" to { SearchField(SearchFieldProps(value = "Sonora")) },
    "Section" to { Section(SectionProps(title = "Shelf", actionText = "See all")) },
    "SettingRow" to { SettingRow(SettingRowProps(title = "Setting")) },
    "SortFilterBar" to { SortFilterBar(SortFilterBarProps(label = "Sort")) },
    "StatusBanner" to { StatusBanner(StatusBannerProps(children = null, actionLabel = "Retry")) },
    "TabBar" to { TabBar(TabBarProps(items = listOf(TabBarItem("albums", "Albums")))) },
    "ValueRow" to { ValueRow(ValueRowProps(label = "Speed", value = "1x")) },
    "ViewToggle" to { ViewToggle(ViewToggleProps()) },
)

/** A control: anything that takes a press or text. */
internal val control = hasClickAction() or SemanticsMatcher.keyIsDefined(SemanticsProperties.EditableText)

/** Not disabled. */
internal val enabled = SemanticsMatcher.keyNotDefined(SemanticsProperties.Disabled)

/**
 * Disabled with `disabled` set: a component drawn with its actions bound and `disabled` set is
 * disabled and ignores presses, and one bound and not disabled takes them.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SonoraDisabledTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `M0_states_c a component with disabled set is disabled and ignores presses`() {
        var presses = 0
        val press: () -> Unit = { presses++ }
        val change: (String) -> Unit = { presses++ }
        composeRule.setContent {
            Column {
                Button(ButtonProps(children = null, onClick = press, disabled = true))
                IconButton(IconButtonProps(label = "Close", onClick = press, disabled = true))
                PreviewButton(PreviewButtonProps(label = "Preview", onClick = press, disabled = true))
                SearchField(SearchFieldProps(value = "Sonora", onChange = change, disabled = true))
            }
        }
        val controls = composeRule.onAllNodes(control, useUnmergedTree = true)
        val count = controls.fetchSemanticsNodes().size
        assertTrue("drew only $count controls", count >= 4)
        assertEquals(0, composeRule.onAllNodes(control and enabled, useUnmergedTree = true).fetchSemanticsNodes().size)
        repeat(count) { controls[it].performClick() }
        composeRule.waitForIdle()
        assertEquals("a disabled control took a press", 0, presses)
        assertEquals(
            "a disabled field takes text",
            0,
            composeRule.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.SetText) and enabled, useUnmergedTree = true)
                .fetchSemanticsNodes().size,
        )
    }

    @Test
    fun `M0_states_c a bound component is enabled and takes its press`() {
        var presses = 0
        composeRule.setContent { Button(ButtonProps(children = null, onClick = { presses++ })) }
        composeRule.onNode(hasClickAction() and enabled).performClick()
        assertEquals(1, presses)
    }

    @Test
    fun `M0_states_c an ExpandableText keeping its own state is enabled and folds on a press`() {
        composeRule.setContent { ExpandableText(ExpandableTextProps(text = "Text")) }
        composeRule.onNode(hasText("More") and hasClickAction() and enabled).performClick()
        composeRule.onNode(hasText("Less") and hasClickAction() and enabled).performClick()
        composeRule.onNode(hasText("More") and hasClickAction() and enabled).assertExists()
    }

    @Test
    fun `M0_states_c a controlled ExpandableText with no onToggle is disabled`() {
        composeRule.setContent { ExpandableText(ExpandableTextProps(text = "Text", expanded = true)) }
        composeRule.onNode(hasText("Less")).assertIsNotEnabled()
    }

    @Test
    fun `M0_states_c Edit queue is disabled when the queue can be neither removed from nor reordered`() {
        composeRule.setContent { QueuePage(QueuePageProps(onClear = {}, onClose = {}, onEditingChange = {})) }
        composeRule.onNode(hasText("Edit queue")).assertIsNotEnabled()
    }

    @Test
    fun `M0_states_c Edit queue is enabled once the queue can be removed from or reordered`() {
        val edits = mutableListOf<Boolean>()
        val can = listOf(
            QueuePageProps(onRemove = { _, _ -> }, onEditingChange = { edits += it }),
            QueuePageProps(onRemoveSelected = { _ -> }, onEditingChange = { edits += it }),
            QueuePageProps(onReorder = { _, _ -> }, onEditingChange = { edits += it }),
        )
        composeRule.setContent { Column { can.forEach { QueuePage(it) } } }
        val toggles = composeRule.onAllNodes(hasText("Edit queue") and hasClickAction() and enabled)
        assertEquals(3, toggles.fetchSemanticsNodes().size)
        repeat(3) { composeRule.onAllNodes(hasText("Edit queue") and hasClickAction())[0].performClick() }
        assertEquals(listOf(true, true, true), edits)
        assertEquals(3, composeRule.onAllNodes(hasText("Done editing queue") and enabled).fetchSemanticsNodes().size)
    }

    @Test
    fun `M0_states_c every interactive Sonora component is drawn with no action`() {
        // The states screenshots' list (sonora's States.kt) names every component with an action.
        val states = File("../sonora/src/test/java/net/develivarr/auralis/ui/sonora/States.kt").readText()
        val interactive = Regex("""StateEntry\("(\w+)"""").findAll(states).map { it.groupValues[1] }.toList()
        assertTrue("found no interactive component", interactive.isNotEmpty())
        assertEquals(interactive.sorted(), unbound.map { it.first }.sorted())
    }
}
