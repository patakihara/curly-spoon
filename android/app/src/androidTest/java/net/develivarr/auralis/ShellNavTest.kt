package net.develivarr.auralis

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onLast
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
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 12-front.md's "Shell and navigation" on a device, walked only by tapping the shell's own
 * controls and pressing Android's back, never by navigating in code: ✕ returns to whatever opened
 * a page, each destination keeps its own stack, Android's back does what ✕ does, the mini-player
 * opens Now Playing, the player's tabs switch sheets, and a sheet closes to the page under it.
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
            AuralisNavGraph(nav, Route.Browse, PageActions({ _, _, _ -> }, {}, {}))
        }
        composeRule.waitForIdle()
    }

    private fun tap(node: SemanticsNodeInteraction) {
        node.performScrollTo().performClick()
        composeRule.waitForIdle()
    }

    /** The first tappable thing showing `text`: a card, a row, a link or a control. */
    private fun tap(text: String) =
        tap(composeRule.onAllNodes(hasText(text) and hasClickAction()).onFirst())

    /** A destination on the bottom bar, which the shell draws after the page. */
    private fun destination(label: String) =
        tap(composeRule.onAllNodes(hasText(label) and hasClickAction()).onLast())

    /** The mini-player, docked above the bottom bar. */
    private fun miniPlayer() =
        tap(composeRule.onAllNodes(hasText("MiniPlayer") and hasClickAction()).onLast())

    private fun systemBack() {
        composeRule.runOnUiThread { composeRule.activity.onBackPressedDispatcher.onBackPressed() }
        composeRule.waitForIdle()
    }

    /** The page showing, by its route's class name, with its ref when it takes one. */
    private fun showing(): String {
        val entry = nav.currentBackStackEntry ?: return "nothing"
        val name = entry.destination.route!!.substringAfterLast("Route.")
            .substringBefore('/').substringBefore('?')
        return when (name) {
            "Album" -> "Album ${entry.toRoute<Route.Album>().ref}"
            "Artist" -> "Artist ${entry.toRoute<Route.Artist>().ref}"
            else -> name
        }
    }

    /** Music from the bottom bar, an album, its artist, then one of the artist's albums. */
    private fun openAnAlbumFromItsArtist() {
        start()
        destination("Music")
        assertEquals("Music", showing())
        tap("Between Lines of Light")
        assertEquals("Album between-lines-of-light", showing())
        tap("Deep Inertia")
        assertEquals("Artist deep-inertia", showing())
        tap("Shadows and Sighs")
        assertEquals("Album shadows-and-sighs", showing())
    }

    @Test
    fun M0_canvas_d_closeReturnsToTheArtistAnAlbumWasOpenedFrom() {
        openAnAlbumFromItsArtist()
        tap("Close")
        assertEquals("Artist deep-inertia", showing())
    }

    @Test
    fun M0_canvas_d_eachDestinationKeepsItsStackAndAndroidBackDoesWhatCloseDoes() {
        openAnAlbumFromItsArtist()
        destination("Books")
        assertEquals("Books", showing())
        destination("Music")
        assertEquals("Album shadows-and-sighs", showing())
        systemBack()
        assertEquals("Artist deep-inertia", showing())
    }

    @Test
    fun M0_canvas_d_theMiniPlayerOpensNowPlayingWhoseTabsSwitchSheetsClosingToThePageUnder() {
        openAnAlbumFromItsArtist()
        miniPlayer()
        assertEquals("NowPlaying", showing())
        tap("Queue")
        assertEquals("Queue", showing())
        tap("Collapse player")
        assertEquals("Album shadows-and-sighs", showing())
    }

    @Test
    fun M0_canvas_d_androidBackClosesASheetToThePageUnderIt() {
        openAnAlbumFromItsArtist()
        miniPlayer()
        tap("Lyrics")
        assertEquals("Lyrics", showing())
        systemBack()
        assertEquals("Album shadows-and-sighs", showing())
    }
}
