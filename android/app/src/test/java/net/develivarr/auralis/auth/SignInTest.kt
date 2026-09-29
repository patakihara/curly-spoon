package net.develivarr.auralis.auth

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.api.ApiClient
import net.develivarr.auralis.api.ApiJson
import net.develivarr.auralis.api.FakeServer
import net.develivarr.auralis.api.ServerConfig
import net.develivarr.auralis.generated.api.TokenBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class SignInTest {
    private val server = FakeServer()
    private val store = MemoryTokenStore()
    private val session = Session(store)
    private val config = ServerConfig("http://127.0.0.1:8787/".toHttpUrl())
    private val prefs = ApplicationProvider.getApplicationContext<Context>()
        .getSharedPreferences("sign-in-test", Context.MODE_PRIVATE)
    private val signIn = SignIn(config, ApiClient(config, session, server.client()), session, prefs)

    @Test
    fun `the login page is the server's, for the app, with the S256 challenge of the verifier it keeps`() {
        val login = signIn.start()
        assertEquals("http://127.0.0.1:8787/api/auth/login", login.newBuilder().query(null).build().toString())
        assertEquals("android", login.queryParameter("client"))
        assertNull(login.queryParameter("device_id"))

        server.answer = { 200 to TOKEN }
        signIn.finish(callback(code = "one-time", state = login.queryParameter("app_state")))
        val swap = ApiJson.decodeFromString(TokenBody.serializer(), server.seen.single().body!!)
        assertEquals(Pkce.challenge(swap.codeVerifier), login.queryParameter("code_challenge"))
    }

    @Test
    fun `each sign-in has its own state and verifier`() {
        val first = signIn.start()
        val second = signIn.start()
        assertFalse(first.queryParameter("app_state") == second.queryParameter("app_state"))
        assertFalse(first.queryParameter("code_challenge") == second.queryParameter("code_challenge"))
    }

    @Test
    fun `signing in again names the device the server gave the app`() {
        store.saveDeviceId("device-1")
        assertEquals("device-1", signIn.start().queryParameter("device_id"))
    }

    @Test
    fun `a callback code becomes a stored token`() {
        val login = signIn.start()
        server.answer = { 200 to TOKEN }
        val result = signIn.finish(callback(code = "one-time", state = login.queryParameter("app_state")))
        assertEquals(SignInResult.SignedIn, result)
        assertEquals("bearer-1", store.loadToken())
        assertEquals("bearer-1", session.token.value)
        assertEquals("device-1", store.loadDeviceId())
        val seen = server.seen.single()
        assertEquals("/api/auth/token", seen.request.url.encodedPath)
        assertEquals("one-time", ApiJson.decodeFromString(TokenBody.serializer(), seen.body!!).code)
    }

    @Test
    fun `a callback with a wrong state is refused and swaps nothing`() {
        signIn.start()
        server.answer = { 200 to TOKEN }
        val result = signIn.finish(callback(code = "one-time", state = "not-the-apps-own-state"))
        assertEquals(SignInResult.Refused("bad_state"), result)
        assertTrue(server.seen.isEmpty())
        assertNull(session.token.value)
    }

    @Test
    fun `a callback with no state is refused`() {
        signIn.start()
        assertEquals(SignInResult.Refused("bad_state"), signIn.finish(callback(code = "c", state = null)))
        assertTrue(server.seen.isEmpty())
    }

    @Test
    fun `a callback with no sign-in in flight is refused`() {
        val result = signIn.finish(callback(code = "one-time", state = "a".repeat(43)))
        assertEquals(SignInResult.Refused("bad_state"), result)
        assertTrue(server.seen.isEmpty())
    }

    @Test
    fun `a sign-in finishes once`() {
        val state = signIn.start().queryParameter("app_state")
        server.answer = { 200 to TOKEN }
        assertEquals(SignInResult.SignedIn, signIn.finish(callback(code = "one-time", state = state)))
        assertEquals(SignInResult.Refused("bad_state"), signIn.finish(callback(code = "one-time", state = state)))
        assertEquals(1, server.seen.size)
    }

    @Test
    fun `a code the server does not know is refused`() {
        val login = signIn.start()
        server.answer = { 400 to """{"error":"bad_code"}""" }
        val result = signIn.finish(callback(code = "stale", state = login.queryParameter("app_state")))
        assertEquals(SignInResult.Refused("bad_code"), result)
        assertNull(session.token.value)
    }

    @Test
    fun `a callback from the sign-on's refusal is refused`() {
        val login = signIn.start()
        val result = signIn.finish(callback(code = null, state = login.queryParameter("app_state")))
        assertEquals(SignInResult.Refused("no_code"), result)
        assertTrue(server.seen.isEmpty())
    }

    private fun callback(code: String?, state: String?): Uri =
        Uri.parse("auralis://auth/callback").buildUpon().apply {
            if (code != null) appendQueryParameter("code", code)
            if (state != null) appendQueryParameter("state", state)
        }.build()

    private companion object {
        const val TOKEN = """{"token":"bearer-1","deviceId":"device-1","expiresAt":1800000000000}"""
    }
}
