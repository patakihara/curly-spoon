package net.develivarr.auralis

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import net.develivarr.auralis.generated.nav.AuralisNavGraph
import net.develivarr.auralis.generated.nav.PageActions
import net.develivarr.auralis.generated.nav.Route
import net.develivarr.auralis.generated.nav.openDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * Criterion (d) of M0.states on a device: every page of the generated graph, as the app reaches
 * it, has every control without a bound action disabled. Each control with a click action is
 * pressed on the page as first opened, and so is each control a press reveals one level down (a
 * menu's items, a sheet's or dialog's controls, a field), after the same press afresh. A disabled one is not enabled, and its press leaves the
 * route and every node's semantics as they were. An enabled one does something of its own: it
 * changes the route, its own semantics (selected, state, expanded, text, a field's typed value),
 * opens a menu, dialog or field, or hands the app an action (sign in, play). A selected tab or the destination showing,
 * pressed again, may leave things as they are: it already shows. web/e2e/page-controls.spec.ts
 * presses every control of every web page the same way.
 */
@RunWith(Parameterized::class)
class PageControlsTest(private val page: String) {

    @get:Rule
    val composeRule = createComposeRule()

    private lateinit var nav: NavHostController
    private var opening by mutableIntStateOf(0)

    /** What the page handed the app: each sign-in and play, in order. */
    private val handed = mutableListOf<String>()

    /** What a press can change, taken before and after it. */
    private data class Look(
        val route: String,
        val own: String?,
        val opened: Int,
        val handed: Int,
        val tree: List<String>,
    )

    /** A control, as a screen reader names it, and which of the controls so named it is. */
    private data class Control(val name: String, val nth: Int, val enabled: Boolean, val selected: Boolean)

    /**
     * The page as the app first opens it, every remembered state fresh: a destination's home from
     * the bottom bar, any other page from Browse, as a link there opens it.
     */
    private fun open() {
        if (opening == 0) {
            composeRule.setContent {
                key(opening) {
                    nav = rememberNavController()
                    AuralisNavGraph(nav, Route.Browse, PageActions({ ref, queue, mode -> handed += "play $ref $queue $mode" }, { handed += "sign in" }))
                }
            }
        }
        opening++
        composeRule.waitForIdle()
        composeRule.runOnUiThread {
            if (page in destinations()) openDestination(nav, page)
            else nav.navigate(sampleRoute(nav.graph.mapNotNull { it.route }.single { pageId(it) == page }))
        }
        composeRule.waitForIdle()
    }

    private fun clickables(): List<SemanticsNode> =
        composeRule.onAllNodes(hasClickAction()).fetchSemanticsNodes()

    private fun nameOf(node: SemanticsNode): String {
        val c = node.config
        val role = c.getOrNull(SemanticsProperties.Role)?.toString() ?: "Clickable"
        val words = (c.getOrNull(SemanticsProperties.ContentDescription).orEmpty() +
            c.getOrNull(SemanticsProperties.Text).orEmpty().map { it.text })
        return "$role \"${words.joinToString(" ").take(60)}\""
    }

    /** [nodes] as controls, each numbered among those of its name, in the order the tree holds them. */
    private fun controlsOf(nodes: List<SemanticsNode>): List<Control> {
        val seen = mutableMapOf<String, Int>()
        return nodes.map { node ->
            val name = nameOf(node)
            val nth = seen.merge(name, 1, Int::plus)!! - 1
            Control(
                name,
                nth,
                SemanticsProperties.Disabled !in node.config,
                node.config.getOrNull(SemanticsProperties.Selected) == true,
            )
        }
    }

    /** Every control on the page as first opened. */
    private fun controls(): List<Control> = controlsOf(clickables())

    /** The controls showing that were not among [shown]: those a press revealed. */
    private fun revealed(shown: Set<Int>): List<SemanticsNode> = clickables().filter { it.id !in shown }

    /** [control] among [nodes], by its name and which of the controls so named it is. */
    private fun find(control: Control, nodes: List<SemanticsNode> = clickables()): SemanticsNode =
        nodes.filter { nameOf(it) == control.name }[control.nth]

    private fun byId(id: Int) = SemanticsMatcher("node $id") { it.id == id }

    /** What a screen reader reads of [node]'s own state. */
    private fun stateOf(node: SemanticsNode): String {
        val c = node.config
        return listOf(
            c.getOrNull(SemanticsProperties.Selected),
            c.getOrNull(SemanticsProperties.StateDescription),
            c.getOrNull(SemanticsProperties.ToggleableState),
            c.getOrNull(SemanticsProperties.ContentDescription),
            c.getOrNull(SemanticsProperties.Text)?.map { it.text },
            c.getOrNull(SemanticsProperties.EditableText)?.text,
            SemanticsActions.Expand in c,
            SemanticsActions.Collapse in c,
            SemanticsProperties.Disabled in c,
        ).joinToString("|")
    }

    private fun look(id: Int): Look {
        val entry = nav.currentBackStackEntry
        val own = composeRule.onAllNodes(byId(id)).fetchSemanticsNodes().singleOrNull()
        val every = composeRule.onAllNodes(SemanticsMatcher("any node") { true }).fetchSemanticsNodes()
        return Look(
            route = "${entry?.destination?.route} ${entry?.id}",
            own = own?.let(::stateOf),
            opened = composeRule.onAllNodes(isPopup() or isDialog() or hasSetTextAction()).fetchSemanticsNodes().size,
            handed = handed.size,
            tree = every.map { "${nameOf(it)} ${stateOf(it)}" },
        )
    }

    /** What a press did, if anything. */
    private fun did(before: Look, after: Look): String? = when {
        after.route != before.route -> "goes to ${after.route}"
        after.handed != before.handed -> "hands the app ${handed.last()}"
        after.own != null && after.own != before.own -> "changes its own state"
        after.opened > before.opened -> "opens a menu, dialog or field"
        else -> null
    }

    /**
     * A press's outcome: the fault it showed, if any, what it did, and the controls showing just
     * before it, so what it reveals is told apart from what scrolling to it drew.
     */
    private class Pressed(val fault: String?, val did: String?, val moved: Boolean, val shown: Set<Int>)

    /** Scrolls to the control [locate] finds, [control], presses it and says what the press did. */
    private fun press(control: Control, locate: () -> SemanticsNode): Pressed {
        try {
            composeRule.onNode(byId(locate().id)).performScrollTo()
        } catch (_: AssertionError) {
            // Not in a scrolling container: it shows where it is.
        }
        composeRule.waitForIdle()
        val id = locate().id
        val shown = clickables().map { it.id }.toSet()
        val before = look(id)
        if (!control.enabled) composeRule.onNode(byId(id)).assertIsNotEnabled()
        composeRule.onNode(byId(id)).performClick()
        composeRule.waitForIdle()
        var after = look(id)
        var did = did(before, after)
        if (control.enabled && did == null && composeRule.onAllNodes(byId(id) and hasSetTextAction()).fetchSemanticsNodes().isNotEmpty()) {
            // A field does its work as it is typed into.
            composeRule.onNode(byId(id)).performTextInput("a")
            composeRule.waitForIdle()
            after = look(id)
            did = did(before, after)
        }
        return when {
            control.enabled -> Pressed(
                if (did == null && !control.selected) "enabled ${control.name} does nothing visible on a press" else null,
                did,
                true,
                shown,
            )
            after.route != before.route || after.handed != before.handed || after.tree != before.tree -> Pressed(
                "disabled ${control.name} reacts to a press: " +
                    (did ?: "the tree changes, now ${(after.tree - before.tree.toSet()).take(3)}"),
                did,
                true,
                shown,
            )
            else -> Pressed(null, null, false, shown)
        }
    }

    @Test
    fun M0_states_d_everyControlWithoutABoundActionIsDisabled() {
        open()
        val controls = controls()
        assertTrue("$page has no control at all", controls.isNotEmpty())
        val faults = mutableListOf<String>()
        var revealedPressed = 0
        var fresh = true
        for (control in controls) {
            if (!fresh) open()
            fresh = true
            val result = press(control) { find(control) }
            result.fault?.let(faults::add)
            if (result.moved) fresh = false
            if (result.did != "opens a menu, dialog or field") continue
            // One level down: what the press revealed, each pressed after the same press afresh.
            val inner = controlsOf(revealed(result.shown))
            for (k in inner.indices) {
                open()
                val again = press(control) { find(control) }
                val shown = controlsOf(revealed(again.shown))
                assertEquals("${control.name} reveals the same controls each time", inner.map { it.name }, shown.map { it.name })
                val r = shown[k]
                press(r) { find(r, revealed(again.shown)) }.fault?.let { faults += "$it, revealed by ${control.name}" }
                revealedPressed++
            }
        }
        Log.i("PageControlsTest", "$page: pressed ${controls.size} controls and $revealedPressed revealed ones")
        assertTrue("controls on $page:\n${faults.joinToString("\n")}", faults.isEmpty())
    }

    companion object {
        /** nav.json's Android pages. */
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun pages(): List<String> = androidPages()
    }
}
