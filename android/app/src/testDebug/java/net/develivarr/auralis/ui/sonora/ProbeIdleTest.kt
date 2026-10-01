package net.develivarr.auralis.ui.sonora

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.LocalOverscrollConfiguration
import androidx.compose.foundation.layout.height
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import net.develivarr.auralis.generated.ui.IconButtonProps
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@Composable
private fun Scroll(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { content() }
}

@RunWith(ParameterizedRobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProbeIdleTest(private val name: String, private val draw: @Composable () -> Unit) {
    companion object {
        @OptIn(ExperimentalFoundationApi::class)
        private val probes: List<Pair<String, @Composable () -> Unit>> = listOf(
            "plainText" to { Scroll { BasicText("x") } },
            "noOverscroll" to { CompositionLocalProvider(LocalOverscrollConfiguration provides null) { Scroll { BasicText("x") } } },
            "noFill" to { Column(Modifier.verticalScroll(rememberScrollState())) { BasicText("x") } },
            "fixedHeight" to { Column(Modifier.height(200.dp).verticalScroll(rememberScrollState())) { BasicText("x") } },
            "fillNoScroll" to { Column(Modifier.fillMaxSize()) { BasicText("x") } },
        )

        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun drawings(): List<Array<Any>> = probes.map { (name, draw) -> arrayOf(name, draw) }
    }

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun settles() {
        composeRule.setContent { draw() }
        composeRule.waitForIdle()
    }
}
