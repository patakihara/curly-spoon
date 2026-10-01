package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Disabled without an action: each interactive Sonora component, drawn with none, has every control disabled. */
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
    val composeRule = createComposeRule()

    @Test
    fun withNoActionEveryControlIsDisabled() {
        composeRule.setContent { draw() }
        val controls = composeRule.onAllNodes(control, useUnmergedTree = true).fetchSemanticsNodes()
        assertTrue("$name draws no control", controls.isNotEmpty())
        val live = composeRule.onAllNodes(control and enabled, useUnmergedTree = true).fetchSemanticsNodes()
        assertEquals("$name has an enabled control without an action", 0, live.size)
    }
}
