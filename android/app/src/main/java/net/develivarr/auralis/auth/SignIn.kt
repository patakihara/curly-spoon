package net.develivarr.auralis.auth

import android.content.SharedPreferences
import android.net.Uri
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom
import net.develivarr.auralis.api.ApiClient
import net.develivarr.auralis.api.ApiException
import net.develivarr.auralis.api.ServerConfig
import net.develivarr.auralis.generated.api.TokenBody
import okhttp3.HttpUrl

/** How a sign-in callback ended. */
sealed interface SignInResult {
    data object SignedIn : SignInResult

    /** Refused, and why: `bad_state`, `no_code`, the server's own error, or `unreachable`. */
    data class Refused(val reason: String) : SignInResult
}

/**
 * Signing in through the server's household sign-on. [start] makes a PKCE verifier and a state,
 * keeps both in [pending] (the browser may outlive this process), and gives the login page to
 * open. [finish] takes the `auralis://auth/callback` the server sends the browser to: only the
 * state this app started is accepted, once, and its code is swapped for a bearer token.
 */
class SignIn(
    private val server: ServerConfig,
    private val api: ApiClient,
    private val session: Session,
    private val pending: SharedPreferences,
    private val random: SecureRandom = SecureRandom(),
) {
    fun start(): HttpUrl {
        val verifier = Pkce.verifier(random)
        val state = Pkce.randomString(random)
        pending.edit().putString(VERIFIER, verifier).putString(STATE, state).commit()
        return server.baseUrl.newBuilder()
            .addPathSegments("api/auth/login")
            .addQueryParameter("client", "android")
            .addQueryParameter("code_challenge", Pkce.challenge(verifier))
            .addQueryParameter("app_state", state)
            .apply { session.deviceId?.let { addQueryParameter("device_id", it) } }
            .build()
    }

    /** Blocks on the server: call it off the main thread. */
    fun finish(callback: Uri): SignInResult {
        val verifier = pending.getString(VERIFIER, null)
        val state = pending.getString(STATE, null)
        pending.edit().remove(VERIFIER).remove(STATE).commit()
        val returned = callback.getQueryParameter("state")
        if (verifier == null || state == null || returned == null || !same(state, returned)) {
            return SignInResult.Refused("bad_state")
        }
        val code = callback.getQueryParameter("code") ?: return SignInResult.Refused("no_code")
        return try {
            session.signedIn(api.appToken(TokenBody(code = code, codeVerifier = verifier)))
            SignInResult.SignedIn
        } catch (e: ApiException) {
            SignInResult.Refused(e.error ?: "http_${e.status}")
        } catch (e: IOException) {
            SignInResult.Refused("unreachable")
        }
    }

    private fun same(a: String, b: String) = MessageDigest.isEqual(a.toByteArray(), b.toByteArray())

    companion object {
        /** Whether [uri] is the server's redirect back to the app. */
        fun isCallback(uri: Uri?): Boolean =
            uri?.scheme == "auralis" && uri.host == "auth" && uri.path == "/callback"

        private const val VERIFIER = "verifier"
        private const val STATE = "state"
    }
}
