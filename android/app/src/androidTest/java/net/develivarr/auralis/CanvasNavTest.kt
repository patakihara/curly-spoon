package net.develivarr.auralis

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
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
 * The whole navigation map on a device, with placeholder data: every destination of the
 * generated graph opens and shows its page's title as a heading. The pages come from nav.json and
 * the titles from the `headings.json` pnpm gen writes from the canvas, both packed as the test's
 * `canvas/` assets; web/e2e/canvas.spec.ts reads the same file, so the two apps are held to the
 * same headings.
 */
@RunWith(AndroidJUnit4::class)
class CanvasNavTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun M0_canvas_d_everyDestinationShowsItsTitleWithPlaceholderData() {
        lateinit var nav: NavHostController
        composeRule.setContent {
            nav = rememberNavController()
            AuralisNavGraph(nav, Route.Browse, PageActions({ _, _, _ -> }, {}))
        }
        composeRule.waitForIdle()

        val routes = nav.graph.mapNotNull { it.route }.associateBy(::pageId)
        val pages = androidPages().toSet()
        val headings = headings()
        assertEquals("the graph's destinations are nav.json's Android pages", pages, routes.keys)

        val failures = pages.mapNotNull { id ->
            val title = headings.getString(id)
            try {
                composeRule.runOnUiThread { nav.navigate(sampleRoute(routes.getValue(id))) }
                composeRule.waitForIdle()
                composeRule.onAllNodes(hasText(title, ignoreCase = true) and isHeading())
                    .onFirst()
                    .assertIsDisplayed()
                null
            } catch (e: AssertionError) {
                "$id does not show its title \"$title\""
            } catch (e: RuntimeException) {
                "$id fails to open: $e"
            }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }
}
