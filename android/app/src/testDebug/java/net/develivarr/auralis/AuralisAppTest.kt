package net.develivarr.auralis

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AuralisAppTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun showsTheAppName() {
        composeRule.setContent { AuralisApp() }
        composeRule.onNodeWithText("Auralis").assertExists()
    }
}
