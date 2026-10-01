package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import net.develivarr.auralis.generated.ui.BackdropShellProps
import net.develivarr.auralis.generated.ui.IconButtonProps
import net.develivarr.auralis.generated.ui.NowPlayingProps
import net.develivarr.auralis.generated.ui.QueuePageProps
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(ParameterizedRobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProbeIdleTest(private val name: String, private val draw: @Composable () -> Unit) {
    companion object {
        private val probes: List<Pair<String, @Composable () -> Unit>> = listOf(
            "nowPlayingBare" to { NowPlaying(NowPlayingProps()) },
            "nowPlayingTab" to { NowPlaying(NowPlayingProps(tab = "now")) },
            "nowPlayingBound" to { NowPlaying(NowPlayingProps(tab = "now", onClose = {}, onMore = {}, onTabChange = {})) },
            "shellDisabledButton" to { BackdropShell(BackdropShellProps(children = { IconButton(IconButtonProps(label = "X")) })) },
            "shellBoundButton" to { BackdropShell(BackdropShellProps(children = { IconButton(IconButtonProps(label = "X", onClick = {})) })) },
            "shellQueuePage" to { BackdropShell(BackdropShellProps(children = { QueuePage(QueuePageProps()) })) },
            "scrollDisabledButton" to {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { IconButton(IconButtonProps(label = "X")) }
            },
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
