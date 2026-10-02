package net.develivarr.auralis

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 11-front.md's "Shell and navigation" on a device, walked only by tapping the shell's own
 * controls and pressing Android's back, never by navigating in code: ✕ returns to whatever opened
 * a page, each destination keeps its own stack, Android's back does what ✕ does, the mini-player
 * opens Now Playing, the player's tabs switch sheets, a sheet closes to the page under it, and the
 * avatar leading the top bar opens Settings.
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

    private fun role(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    /** The first enabled button named `name`: a card, a row, a link or a control. */
    private fun tap(name: String) = tap(
        composeRule.onAllNodes(
            role(Role.Button) and (hasContentDescription(name) or hasText(name)) and
                hasClickAction() and isEnabled(),
        ).onFirst(),
    )

    /** A tab named `label`: a destination on the bottom bar, or one of the player's tabs. */
    private fun tab(label: String) = tap(
        composeRule.onAllNodes(role(Role.Tab) and hasText(label) and hasClickAction() and isEnabled())
            .onFirst(),
    )

    /**
     * The mini-player: the button named by the track shell.json's `playing` loads that holds a
     * Pause button, since a page may also show a card of that track's album, which opens the album.
     */
    private fun miniPlayer() = tap(
        composeRule.onAllNodes(
            role(Role.Button) and (hasContentDescription(PLAYING) or hasText(PLAYING)) and
                hasClickAction() and isEnabled() and
                hasAnyDescendant(role(Role.Button) and hasText("Pause")),
        ).onFirst(),
    )

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
        tab("Music")
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
        tab("Books")
        assertEquals("Books", showing())
        tab("Music")
        assertEquals("Album shadows-and-sighs", showing())
        systemBack()
        assertEquals("Artist deep-inertia", showing())
    }

    @Test
    fun M0_canvas_d_theMiniPlayerOpensNowPlayingWhoseTabsSwitchSheetsClosingToThePageUnder() {
        openAnAlbumFromItsArtist()
        miniPlayer()
        assertEquals("NowPlaying", showing())
        tab("Queue")
        assertEquals("Queue", showing())
        tap("Collapse player")
        assertEquals("Album shadows-and-sighs", showing())
    }

    @Test
    fun M0_canvas_d_androidBackClosesASheetToThePageUnderIt() {
        openAnAlbumFromItsArtist()
        miniPlayer()
        tab("Lyrics")
        assertEquals("Lyrics", showing())
        systemBack()
        assertEquals("Album shadows-and-sighs", showing())
    }

    @Test
    fun theAvatarOpensSettingsWhoseCloseReturnsToThePageUnderIt() {
        start()
        tab("Books")
        tap("Account")
        assertEquals("Settings", showing())
        tap("Close")
        assertEquals("Books", showing())
    }

    private companion object {
        /** The track the shell's mini-player shows, shell.json's `playing`. */
        const val PLAYING = "Heartbeats in Silence"
    }
}
