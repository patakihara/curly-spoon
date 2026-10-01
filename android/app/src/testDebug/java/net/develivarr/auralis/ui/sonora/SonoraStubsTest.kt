package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.generated.ui.AboutCardProps
import net.develivarr.auralis.generated.ui.AccountButtonProps
import net.develivarr.auralis.generated.ui.ArtistCardProps
import net.develivarr.auralis.generated.ui.BackLayerProps
import net.develivarr.auralis.generated.ui.BackdropShellProps
import net.develivarr.auralis.generated.ui.BottomNavItem
import net.develivarr.auralis.generated.ui.BottomNavProps
import net.develivarr.auralis.generated.ui.ButtonGroupItem
import net.develivarr.auralis.generated.ui.ButtonGroupProps
import net.develivarr.auralis.generated.ui.ButtonProps
import net.develivarr.auralis.generated.ui.EmptyStateProps
import net.develivarr.auralis.generated.ui.EpisodeRowProps
import net.develivarr.auralis.generated.ui.ExpandableTextProps
import net.develivarr.auralis.generated.ui.ExpanderRowProps
import net.develivarr.auralis.generated.ui.FeatureCardProps
import net.develivarr.auralis.generated.ui.FieldRowProps
import net.develivarr.auralis.generated.ui.FollowButtonProps
import net.develivarr.auralis.generated.ui.FrontLayerHeaderProps
import net.develivarr.auralis.generated.ui.IconButtonProps
import net.develivarr.auralis.generated.ui.InputProps
import net.develivarr.auralis.generated.ui.LayoutGridProps
import net.develivarr.auralis.generated.ui.LyricsPageProps
import net.develivarr.auralis.generated.ui.MediaCardProps
import net.develivarr.auralis.generated.ui.MediaHeaderProps
import net.develivarr.auralis.generated.ui.MiniPlayerProps
import net.develivarr.auralis.generated.ui.NowPlayingPageProps
import net.develivarr.auralis.generated.ui.NowPlayingProps
import net.develivarr.auralis.generated.ui.OverflowMenuItem
import net.develivarr.auralis.generated.ui.OverflowMenuProps
import net.develivarr.auralis.generated.ui.PageBodyProps
import net.develivarr.auralis.generated.ui.PreviewButtonProps
import net.develivarr.auralis.generated.ui.QueuePageProps
import net.develivarr.auralis.generated.ui.QuickPickProps
import net.develivarr.auralis.generated.ui.RatingProps
import net.develivarr.auralis.generated.ui.ResultRowProps
import net.develivarr.auralis.generated.ui.SearchFieldProps
import net.develivarr.auralis.generated.ui.SectionProps
import net.develivarr.auralis.generated.ui.SettingRowProps
import net.develivarr.auralis.generated.ui.ShelfProps
import net.develivarr.auralis.generated.ui.SortFilterBarProps
import net.develivarr.auralis.generated.ui.StatusBannerProps
import net.develivarr.auralis.generated.ui.TabBarItem
import net.develivarr.auralis.generated.ui.TabBarProps
import net.develivarr.auralis.generated.ui.ValueRowProps
import net.develivarr.auralis.generated.ui.ViewToggleProps
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Every Android Sonora composable is still a stub, and a stub says which component it stands in
 * for: each one, drawn with only its required props, shows its component's name.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SonoraStubsTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun stub(name: String, content: @Composable () -> Unit) = name to content

    private val stubs = listOf(
        stub("AboutCard") { AboutCard(AboutCardProps(title = "About")) },
        stub("AccountButton") { AccountButton(AccountButtonProps()) },
        stub("ArtistCard") { ArtistCard(ArtistCardProps(title = "Artist")) },
        stub("BackLayer") { BackLayer(BackLayerProps()) },
        stub("BackdropShell") { BackdropShell(BackdropShellProps()) },
        stub("BottomNav") { BottomNav(BottomNavProps(items = listOf(BottomNavItem(key = "browse", label = "Browse", icon = "explore")), active = "browse")) },
        stub("Button") { Button(ButtonProps(children = null)) },
        stub("ButtonGroup") { ButtonGroup(ButtonGroupProps(items = listOf(ButtonGroupItem(key = "All")))) },
        stub("EmptyState") { EmptyState(EmptyStateProps(title = "Empty")) },
        stub("EpisodeRow") { EpisodeRow(EpisodeRowProps(title = "Episode")) },
        stub("ExpandableText") { ExpandableText(ExpandableTextProps()) },
        stub("ExpanderRow") { ExpanderRow(ExpanderRowProps(label = "More")) },
        stub("FeatureCard") { FeatureCard(FeatureCardProps(title = "Feature")) },
        stub("FieldRow") { FieldRow(FieldRowProps(label = "Field")) },
        stub("FollowButton") { FollowButton(FollowButtonProps()) },
        stub("FrontLayerHeader") { FrontLayerHeader(FrontLayerHeaderProps()) },
        stub("IconButton") { IconButton(IconButtonProps(label = "Icon")) },
        stub("Input") { Input(InputProps()) },
        stub("LayoutGrid") { LayoutGrid(LayoutGridProps()) },
        stub("LyricsPage") { LyricsPage(LyricsPageProps()) },
        stub("MediaCard") { MediaCard(MediaCardProps(title = "Media")) },
        stub("MediaHeader") { MediaHeader(MediaHeaderProps()) },
        stub("MiniPlayer") { MiniPlayer(MiniPlayerProps(title = "Track", artist = "Artist")) },
        stub("NowPlaying") { NowPlaying(NowPlayingProps()) },
        stub("NowPlayingPage") { NowPlayingPage(NowPlayingPageProps()) },
        stub("OverflowMenu") { OverflowMenu(OverflowMenuProps(items = listOf(OverflowMenuItem(key = "share", label = "Share")))) },
        stub("PageBody") { PageBody(PageBodyProps()) },
        stub("PreviewButton") { PreviewButton(PreviewButtonProps()) },
        stub("QueuePage") { QueuePage(QueuePageProps()) },
        stub("QuickPick") { QuickPick(QuickPickProps(title = "Pick")) },
        stub("Rating") { Rating(RatingProps(value = 4f)) },
        stub("ResultRow") { ResultRow(ResultRowProps(title = "Result")) },
        stub("SearchField") { SearchField(SearchFieldProps()) },
        stub("Section") { Section(SectionProps()) },
        stub("SettingRow") { SettingRow(SettingRowProps(title = "Setting")) },
        stub("Shelf") { Shelf(ShelfProps()) },
        stub("SortFilterBar") { SortFilterBar(SortFilterBarProps(label = "Sort")) },
        stub("StatusBanner") { StatusBanner(StatusBannerProps(children = null)) },
        stub("TabBar") { TabBar(TabBarProps(items = listOf(TabBarItem(key = "albums")))) },
        stub("ValueRow") { ValueRow(ValueRowProps(label = "Label", value = "Value")) },
        stub("ViewToggle") { ViewToggle(ViewToggleProps()) },
    )

    @Test
    fun eachStubShowsTheNameOfTheComponentItStandsFor() {
        // All at once, each under its name, rather than one swapped for the next. Unscrolled: a
        // root stub fills the screen and scrolls itself, and those past it are drawn at no height.
        composeRule.setContent {
            Column {
                stubs.forEach { (name, draw) -> Box(Modifier.testTag(name)) { draw() } }
            }
        }
        stubs.forEach { (name, _) ->
            composeRule.onNode(hasText(name) and hasAnyAncestor(hasTestTag(name)), useUnmergedTree = true)
                .assertExists("$name shows no label")
        }
    }

    private fun role(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Test
    fun eachTapIsAButtonOrATabByItsNameAndOneWithoutAHandlerIsDisabled() {
        val tapped = mutableListOf<String>()
        composeRule.setContent {
            Column {
                IconButton(IconButtonProps(label = "Close", onClick = { tapped += "close" }))
                BottomNav(
                    BottomNavProps(
                        items = listOf(BottomNavItem(key = "music", label = "Music", icon = "album")),
                        active = "music",
                        onChange = { tapped += it },
                    ),
                )
                MiniPlayer(MiniPlayerProps(title = "Track", artist = "Artist"))
            }
        }
        composeRule.onNode(role(Role.Button) and hasContentDescription("Close") and hasClickAction())
            .performClick()
        composeRule.onNode(role(Role.Tab) and hasText("Music") and hasClickAction()).performClick()
        composeRule.onNode(role(Role.Button) and hasContentDescription("Track")).assertIsNotEnabled()
        assertEquals(listOf("close", "music"), tapped)
    }
}
