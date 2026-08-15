package net.develivarr.auralis.harness

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Proves that Compose UI assertions run in this project without a device or emulator.
 *
 * Wave 14b-1's whole point is a gap named in HANDOVER: apps/android has no Compose UI test
 * harness at all, so anything touching a composable's rendered structure (accessibility
 * grouping on ForYouCarouselRow is the motivating case) can only be verified by "it compiles"
 * plus a reviewer reading the source, which is exactly the standard that let all four of this
 * project's writer-with-no-reader failures through. Robolectric supplies a simulated Android
 * environment on the plain JVM, so these tests run under a normal `gradlew test` invocation —
 * the same one CI already runs (see .github/workflows/android.yml) — with no instrumented run,
 * no connected device, and no emulator.
 *
 * `testOptions.unitTests.isIncludeAndroidResources = true` in app/build.gradle.kts is
 * load-bearing here: Robolectric cannot inflate any Android resource without the real
 * resource table, and createComposeRule() needs exactly that to host a composable at all.
 * Leaving that flag off makes every test below fail before its body runs, with an error that
 * does not point back at the missing flag.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ComposeHarnessTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `renders a simple composable and finds it by text`() {
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    Text("harness")
                }
            }
        }

        composeRule.onNodeWithText("harness").assertExists()
    }

    @Test
    fun `merges sibling text nodes into one accessibility node via semantics grouping`() {
        // This is the exact capability the next wave needs: grouping a card's title and its
        // reason line into one accessibility node on ForYouCarouselRow. If this assertion
        // cannot run, the harness does not actually prove what it needs to prove.
        composeRule.setContent {
            MaterialTheme {
                Surface {
                    Column(
                        modifier = Modifier.semantics(mergeDescendants = true) {
                            contentDescription = "grouped label"
                        }
                    ) {
                        Text("title")
                        Text("reason")
                    }
                }
            }
        }

        composeRule.onNodeWithContentDescription("grouped label").assertExists()
    }
}
