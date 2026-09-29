package net.develivarr.auralis

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.navigation.compose.rememberNavController
import net.develivarr.auralis.generated.nav.AuralisNavGraph
import net.develivarr.auralis.generated.nav.PageActions
import net.develivarr.auralis.generated.nav.Route

/**
 * The app: the canvas's generated navigation map, opening on Browse. Every page shows its
 * placeholder data; its actions do nothing yet (sign-in and playback are M0.emulator's).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AuralisNavGraph(rememberNavController(), Route.Browse, NO_ACTIONS)
        }
    }

    private companion object {
        val NO_ACTIONS = PageActions(onPlay = { _, _, _ -> }, onRequest = {}, onSignIn = {})
    }
}
