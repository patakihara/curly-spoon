package net.develivarr.auralis

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import net.develivarr.auralis.auth.SignIn
import net.develivarr.auralis.auth.SignInResult
import net.develivarr.auralis.generated.nav.AuralisNavGraph
import net.develivarr.auralis.generated.nav.PageActions
import net.develivarr.auralis.generated.nav.Route
import net.develivarr.auralis.play.Playback

/**
 * The app: the canvas's generated navigation map behind a sign-in gate. Without a token it opens
 * Sign in, whose button opens the server's login page in the browser; the server sends the
 * browser back to `auralis://auth/callback`, which lands here and signs the app in. With a token
 * it opens Browse. A page's play control plays its ref through the app's [Playback]; the canvas's
 * placeholder refs name nothing the server knows, so they play nothing until M1.shell binds real
 * items.
 */
class MainActivity : ComponentActivity() {
    private val graph get() = (application as AuralisApp).graph

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) takeCallback(intent)
        val actions = PageActions(onPlay = { ref, _, _ -> play(ref) }, onRequest = {}, onSignIn = ::openLogin)
        val session = graph.session
        // The gate: Sign in without a token, Browse with one; losing it (a 401) returns to Sign in.
        setContent {
            val token by session.token.collectAsState()
            val signedIn = token != null
            key(signedIn) {
                AuralisNavGraph(rememberNavController(), if (signedIn) Route.Browse else Route.SignIn, actions)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        takeCallback(intent)
    }

    private fun play(key: String) {
        val ref = Playback.refOf(key)
        if (ref == null) Log.w(TAG, "not a playable ref: $key") else graph.playback.play(ref)
    }

    private fun openLogin() {
        val login = Uri.parse(graph.signIn.start().toString())
        try {
            startActivity(Intent(Intent.ACTION_VIEW, login))
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "no browser to sign in with", e)
        }
    }

    private fun takeCallback(intent: Intent?) {
        val uri = intent?.data
        if (!SignIn.isCallback(uri)) return
        val graph = graph
        graph.background.launch {
            val result = graph.signIn.finish(uri!!)
            if (result is SignInResult.Refused) Log.w(TAG, "sign-in refused: ${result.reason}")
        }
    }

    private companion object {
        const val TAG = "Auralis"
    }
}

