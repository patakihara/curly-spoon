package net.develivarr.auralis

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import net.develivarr.auralis.generated.nav.AuralisNavGraph
import net.develivarr.auralis.generated.nav.PageActions
import net.develivarr.auralis.generated.nav.Route
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The whole navigation map on a device, with placeholder data: every destination of the
 * generated graph opens and shows its page's title as a heading. The titles come from the canvas
 * (nav.json, pages and placeholders, packed as the test's `canvas/` assets), by the rule
 * web/e2e/canvas.spec.ts uses, so the two apps are held to the same headings.
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
            AuralisNavGraph(nav, Route.Browse, PageActions({ _, _, _ -> }, {}, {}))
        }
        composeRule.waitForIdle()

        val routes = nav.graph.mapNotNull { it.route }.associateBy(::pageId)
        val pages = androidPages()
        assertEquals("the graph's destinations are nav.json's Android pages", pages.keys, routes.keys)

        val failures = pages.mapNotNull { (id, navTitle) ->
            val title = titleOf(id, navTitle)
            composeRule.runOnUiThread { nav.navigate(sample(routes.getValue(id))) }
            composeRule.waitForIdle()
            try {
                composeRule.onAllNodes(hasText(title, ignoreCase = true) and isHeading())
                    .onFirst()
                    .assertIsDisplayed()
                null
            } catch (e: AssertionError) {
                "$id does not show its title \"$title\""
            }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    private fun asset(path: String): String =
        InstrumentationRegistry.getInstrumentation().context.assets.open("canvas/$path")
            .bufferedReader().use { it.readText() }

    /** nav.json's Android pages, id to title. */
    private fun androidPages(): Map<String, String> {
        val pages = JSONObject(asset("nav.json")).getJSONArray("pages")
        return (0 until pages.length()).map { pages.getJSONObject(it) }
            .filter { p -> p.optJSONArray("platforms")?.let { a -> (0 until a.length()).any { a.getString(it) == "android" } } ?: true }
            .associate { it.getString("id") to it.getString("title") }
    }

    /**
     * The heading a page shows: nav.json's title, unless its BackLayer binds the title from its
     * data, as an album does, when it is that placeholder value.
     */
    private fun titleOf(id: String, navTitle: String): String {
        val bound = BOUND_TITLE.find(asset("pages/$id.page.jsx"))?.groupValues?.get(1) ?: return navTitle
        var value: Any = JSONObject(asset("placeholders/$id.json"))
        for (key in bound.split('.')) value = (value as JSONObject).get(key)
        return value as? String ?: error("$id: data.$bound is not a string")
    }

    private companion object {
        val BOUND_TITLE = Regex("""<BackLayer\b(?:[^>]|=>)*?\btitle=\{data\.([\w.]+)\}""")

        /** `net…Route.NowPlaying` to `nowPlaying`, the page's id in nav.json. */
        fun pageId(route: String): String =
            route.substringAfterLast("Route.").substringBefore('/').substringBefore('?')
                .replaceFirstChar { it.lowercase() }

        /** The route with each path parameter given a sample value and its query dropped. */
        fun sample(route: String): String =
            route.substringBefore('?').replace(Regex("""\{\w+\}"""), "sample")
    }
}
