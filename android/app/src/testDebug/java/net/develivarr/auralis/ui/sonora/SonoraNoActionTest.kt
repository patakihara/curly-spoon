package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.printToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Disabled without an action: each interactive Sonora component, drawn with none, has every
 * control disabled, and pressing each of them changes nothing.
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SonoraNoActionTest(private val name: String, private val draw: @Composable () -> Unit) {
    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun drawings(): List<Array<Any>> = unbound.map { (name, draw) -> arrayOf(name, draw) }
    }

    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `M0_states_c with no action every control is disabled and ignores presses`() {
        composeRule.setContent { draw() }
        val controls = composeRule.onAllNodes(control, useUnmergedTree = true)
        val count = controls.fetchSemanticsNodes().size
        assertTrue("$name draws no control", count > 0)
        val live = composeRule.onAllNodes(control and enabled, useUnmergedTree = true).fetchSemanticsNodes()
        assertEquals("$name has an enabled control without an action", 0, live.size)

        val before = composeRule.onRoot(useUnmergedTree = true).printToString()
        repeat(count) { controls[it].performClick() }
        composeRule.waitForIdle()
        assertEquals("$name reacted to a press", before, composeRule.onRoot(useUnmergedTree = true).printToString())
    }
}
