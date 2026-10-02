package net.develivarr.auralis

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject

/*
 * What the device tests share about the navigation map: nav.json and the headings pnpm gen writes
 * from the canvas, packed as the test APK's `canvas/` assets, and how a page and its route are
 * named. web/e2e/nav-pages.ts reads the same files for the browser tests.
 */

/** The test APK's `canvas/<path>` asset, as text. */
fun canvasAsset(path: String): String =
    InstrumentationRegistry.getInstrumentation().context.assets.open("canvas/$path")
        .bufferedReader().use { it.readText() }

/** nav.json's Android pages, by id, in nav.json's order. */
fun androidPages(): List<String> {
    val pages = JSONObject(canvasAsset("nav.json")).getJSONArray("pages")
    return (0 until pages.length()).map { pages.getJSONObject(it) }
        .filter { p ->
            p.optJSONArray("platforms")?.let { a -> (0 until a.length()).any { a.getString(it) == "android" } } ?: true
        }
        .map { it.getString("id") }
}

/** nav.json's destinations, by id: the bottom bar's items, each the id of its home page. */
fun destinations(): Set<String> {
    val destinations = JSONObject(canvasAsset("nav.json")).getJSONArray("destinations")
    return (0 until destinations.length()).map { destinations.getJSONObject(it).getString("id") }.toSet()
}

/** The heading each page shows with its placeholder data, as pnpm gen writes it from the canvas. */
fun headings(): JSONObject = JSONObject(canvasAsset("headings.json"))

/** `net…Route.NowPlaying` to `nowPlaying`, the page's id in nav.json. */
fun pageId(route: String): String =
    route.substringAfterLast("Route.").substringBefore('/').substringBefore('?')
        .replaceFirstChar { it.lowercase() }

/** The route with each path parameter given a sample value and its query dropped. */
fun sampleRoute(route: String): String =
    route.substringBefore('?').replace(Regex("""\{\w+\}"""), "sample")

/** A node in [role], as a screen reader names it: a button, a tab. */
fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)
