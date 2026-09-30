package net.develivarr.auralis

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.generated.nav.AuralisNavGraph
import net.develivarr.auralis.generated.nav.PageActions
import net.develivarr.auralis.generated.nav.Route
import net.develivarr.auralis.generated.nav.closePage
import net.develivarr.auralis.generated.nav.openDestination
import net.develivarr.auralis.generated.nav.openTab
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The back rules of 11-front.md's "Shell and navigation", on the generated graph: ✕ returns to
 * whatever opened a page, each destination keeps its own stack, Android's back does what ✕ does,
 * and a sheet closes to the page under it. ✕ is `closePage`, which every generated page's close
 * control and back handler call with its destination's home.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NavBackTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    private lateinit var nav: NavHostController

    private fun start(route: Route) {
        composeRule.setContent {
            nav = rememberNavController()
            AuralisNavGraph(nav, route, PageActions({ _, _, _ -> }, {}, {}))
        }
        composeRule.waitForIdle()
    }

    private fun act(step: () -> Unit) {
        composeRule.runOnUiThread(step)
        composeRule.waitForIdle()
    }

    private fun close(home: Route) = act { closePage(nav, home) }

    private fun systemBack() = act { composeRule.activity.onBackPressedDispatcher.onBackPressed() }

    /** The page showing, by its route's class name, with its ref when it takes one. */
    private fun showing(): String {
        val entry = nav.currentBackStackEntry ?: return "nothing"
        val name = entry.destination.route!!.substringAfterLast("Route.").substringBefore('/').substringBefore('?')
        return when (name) {
            "Album" -> "Album ${entry.toRoute<Route.Album>().ref}"
            "Artist" -> "Artist ${entry.toRoute<Route.Artist>().ref}"
            else -> name
        }
    }

    /** Music, then an artist, then one of its albums; then Books, then back to Music. */
    private fun leaveMusicOnAnAlbumAndComeBack() {
        start(Route.Browse)
        act { openDestination(nav, "music") }
        act { nav.navigate(Route.Artist(ref = "deep-inertia")) }
        act { nav.navigate(Route.Album(ref = "tears-of-ice")) }
        act { openDestination(nav, "books") }
        assertEquals("Books", showing())
        act { openDestination(nav, "music") }
        assertEquals("Album tears-of-ice", showing())
    }

    @Test
    fun closingAnAlbumLeftOpenInMusicReturnsToTheArtistItWasOpenedFrom() {
        leaveMusicOnAnAlbumAndComeBack()
        close(Route.Music)
        assertEquals("Artist deep-inertia", showing())
    }

    @Test
    fun androidBackDoesWhatCloseDoesOnAPageOpenedFromAnother() {
        leaveMusicOnAnAlbumAndComeBack()
        systemBack()
        assertEquals("Artist deep-inertia", showing())
    }

    @Test
    fun androidBackDoesWhatCloseDoesOnAPageWithNothingUnderIt() {
        start(Route.Album(ref = "tears-of-ice"))
        systemBack()
        assertEquals("Music", showing())
        assertEquals(null, nav.previousBackStackEntry)
    }

    @Test
    fun closeOnAPageWithNothingUnderItGoesToItsDestinationsHome() {
        start(Route.Album(ref = "tears-of-ice"))
        close(Route.Music)
        assertEquals("Music", showing())
        assertEquals(null, nav.previousBackStackEntry)
    }

    @Test
    fun aSheetClosesToThePageUnderItAfterSwitchingTabs() {
        start(Route.Browse)
        act { nav.navigate(Route.Album(ref = "tears-of-ice")) }
        act { nav.navigate(Route.NowPlaying) }
        act { openTab(nav, "queue") }
        act { openTab(nav, "lyrics") }
        assertEquals("Lyrics", showing())
        close(Route.Browse)
        assertEquals("Album tears-of-ice", showing())
    }

    @Test
    fun androidBackClosesASheetToThePageUnderIt() {
        start(Route.Browse)
        act { nav.navigate(Route.Album(ref = "tears-of-ice")) }
        act { nav.navigate(Route.NowPlaying) }
        act { openTab(nav, "queue") }
        systemBack()
        assertEquals("Album tears-of-ice", showing())
    }
}
