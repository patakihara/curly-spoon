package net.develivarr.auralis

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.generated.nav.AuralisNavGraph
import net.develivarr.auralis.generated.nav.PageActions
import net.develivarr.auralis.generated.nav.Route
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 11-front.md's "Shell and navigation" on a device, walked only by tapping the shell's own
 * controls and pressing Android's back, never by navigating in code: ✕ returns to whatever opened
 * a page, each destination keeps its own stack, Android's back does what ✕ does, the mini-player
 * opens Now Playing, the player's tabs switch sheets in place, a sheet closes to the page under it,
 * the bottom bar lights the destination that opened a page, and the avatar leading the top bar
 * opens Settings.
 * Every control is found as a screen reader finds it, by its role, a button or a tab, and its name.
 * web/e2e/shell-nav.spec.ts walks the same journey in the browser.
 */
@RunWith(AndroidJUnit4::class)
class ShellNavTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    private lateinit var nav: NavHostController

    private fun start() {
        composeRule.setContent {
            nav = rememberNavController()
            AuralisNavGraph(nav, Route.Browse, PageActions({ _, _, _ -> }, {}))
        }
        composeRule.waitForIdle()
    }

    private fun tap(node: SemanticsNodeInteraction) {
        node.performScrollTo().performClick()
        composeRule.waitForIdle()
    }

    /** The first enabled button named `name`: a card, a row, a link or a control. */
    private fun tap(name: String) = tap(
        composeRule.onAllNodes(
            hasRole(Role.Button) and (hasContentDescription(name) or hasText(name)) and
                hasClickAction() and isEnabled(),
        ).onFirst(),
    )

    /** A tab named `label`: a destination on the bottom bar, or one of the player's tabs. */
    private fun tab(label: String) = tap(
        composeRule.onAllNodes(hasRole(Role.Tab) and hasText(label) and hasClickAction() and isEnabled())
            .onFirst(),
    )

    /**
     * The mini-player: the button named by the track shell.json's `playing` loads that holds a
     * Pause button, since a page may also show a card of that track's album, which opens the album.
     */
    private fun miniPlayer() = tap(
        composeRule.onAllNodes(
            hasRole(Role.Button) and (hasContentDescription(PLAYING) or hasText(PLAYING)) and
                hasClickAction() and isEnabled() and
                hasAnyDescendant(hasRole(Role.Button) and hasText("Pause")),
        ).onFirst(),
    )

    private fun systemBack() {
        composeRule.runOnUiThread { composeRule.activity.onBackPressedDispatcher.onBackPressed() }
        composeRule.waitForIdle()
    }

    /** The page showing, by its id in nav.json, with its ref when it takes one. */
    private fun showing(): String {
        val entry = nav.currentBackStackEntry ?: return "nothing"
        return when (val id = pageId(entry.destination.route!!)) {
            "album" -> "album ${entry.toRoute<Route.Album>().ref}"
            "artist" -> "artist ${entry.toRoute<Route.Artist>().ref}"
            else -> id
        }
    }

    /** Music from the bottom bar, an album, its artist, then one of the artist's albums. */
    private fun openAnAlbumFromItsArtist() {
        start()
        tab("Music")
        assertEquals("music", showing())
        tap("Between Lines of Light")
        assertEquals("album between-lines-of-light", showing())
        tap("Deep Inertia")
        assertEquals("artist deep-inertia", showing())
        tap("Shadows and Sighs")
        assertEquals("album shadows-and-sighs", showing())
    }

    @Test
    fun M0_canvas_d_closeReturnsToTheArtistAnAlbumWasOpenedFrom() {
        openAnAlbumFromItsArtist()
        tap("Close")
        assertEquals("artist deep-inertia", showing())
    }

    @Test
    fun M0_canvas_d_eachDestinationKeepsItsStackAndAndroidBackDoesWhatCloseDoes() {
        openAnAlbumFromItsArtist()
        tab("Books")
        assertEquals("books", showing())
        tab("Music")
        assertEquals("album shadows-and-sighs", showing())
        systemBack()
        assertEquals("artist deep-inertia", showing())
    }

    @Test
    fun M0_canvas_d_theMiniPlayerOpensNowPlayingWhoseTabsSwitchSheetsClosingToThePageUnder() {
        openAnAlbumFromItsArtist()
        miniPlayer()
        assertEquals("nowPlaying", showing())
        tab("Queue")
        assertEquals("queue", showing())
        tap("Collapse player")
        assertEquals("album shadows-and-sighs", showing())
    }

    @Test
    fun M0_canvas_d_androidBackClosesASheetToThePageUnderIt() {
        openAnAlbumFromItsArtist()
        miniPlayer()
        tab("Lyrics")
        assertEquals("lyrics", showing())
        systemBack()
        assertEquals("album shadows-and-sighs", showing())
    }

    /** Whether a page drawing the Sonora stub `name` is on screen, entering, leaving or settled. */
    private fun shows(name: String) = composeRule.onAllNodesWithText(name).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun M0_canvas_c_thePlayersTabsSwitchInPlaceWithNoCrossfadeOfTheOldTab() {
        start()
        miniPlayer()
        tab("Queue")
        assertTrue(shows("QueuePage"))
        composeRule.mainClock.autoAdvance = false
        composeRule.onAllNodes(hasRole(Role.Tab) and hasText("Lyrics") and hasClickAction()).onFirst().performClick()
        var frames = 0
        while (frames < MAX_FRAMES && !(shows("LyricsPage") && !shows("QueuePage"))) {
            composeRule.mainClock.advanceTimeByFrame()
            frames++
        }
        composeRule.mainClock.autoAdvance = true
        assertTrue(
            "Lyrics replaced Queue after $frames frames; a tab switch has no transition",
            frames <= TAB_SWITCH_FRAMES,
        )
        assertEquals("lyrics", showing())
    }

    @Test
    fun M0_canvas_d_anAlbumOpenedFromABrowseCardLightsBrowseOnTheBottomBar() {
        start()
        tap("Between Lines of Light")
        assertEquals("album between-lines-of-light", showing())
        composeRule.onNode(hasRole(Role.Tab) and hasText("Browse") and isSelected()).assertExists()
        composeRule.onNode(hasRole(Role.Tab) and hasText("Music") and isSelected()).assertDoesNotExist()
    }

    @Test
    fun theAvatarOpensSettingsWhoseCloseReturnsToThePageUnderIt() {
        start()
        tab("Books")
        tap("Account")
        assertEquals("settings", showing())
        tap("Close")
        assertEquals("books", showing())
    }

    private companion object {
        /** The track the shell's mini-player shows, shell.json's `playing`. */
        const val PLAYING = "Heartbeats in Silence"

        /** Frames a tab switch may take to settle: the frame that composes it, then the next. */
        const val TAB_SWITCH_FRAMES = 2

        /** Frames to watch for it, well past the NavHost's 700 ms crossfade. */
        const val MAX_FRAMES = 90
    }
}
