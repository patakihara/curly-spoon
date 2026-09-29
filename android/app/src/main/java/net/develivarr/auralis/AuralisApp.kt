package net.develivarr.auralis

import android.app.Application
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import net.develivarr.auralis.api.ApiClient
import net.develivarr.auralis.api.ServerConfig
import net.develivarr.auralis.auth.KeystoreTokenStore
import net.develivarr.auralis.auth.Session
import net.develivarr.auralis.auth.SignIn
import net.develivarr.auralis.auth.TokenStore
import net.develivarr.auralis.play.Playback
import okhttp3.OkHttpClient

/** What the app is wired from: its server, its session, and the API, sign-in and player over them. */
class AppGraph(
    context: Context,
    server: ServerConfig,
    tokens: TokenStore,
    http: OkHttpClient,
) {
    val session = Session(tokens)
    val api = ApiClient(server, session, http)
    val signIn = SignIn(
        server,
        api,
        session,
        context.getSharedPreferences(SIGN_IN_PREFS, Context.MODE_PRIVATE),
    )

    /** Where network work runs, outliving any one activity. */
    val background = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val playback = Playback(context, api, background)

    companion object {
        /** The preferences file a sign-in in flight keeps its verifier and state in. */
        const val SIGN_IN_PREFS = "auralis_sign_in"
    }
}

/**
 * The application: holds the [AppGraph], built on first use from the build's server and the
 * Keystore. A test sets [graph] before launching an activity to name its own server and store.
 */
class AuralisApp : Application() {
    private var built: AppGraph? = null

    var graph: AppGraph
        get() = built ?: AppGraph(
            context = this,
            server = ServerConfig.from(null),
            tokens = KeystoreTokenStore(this),
            http = OkHttpClient(),
        ).also { built = it }
        set(value) {
            built = value
        }
}
