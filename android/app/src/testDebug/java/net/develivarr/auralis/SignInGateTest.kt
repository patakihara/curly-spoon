package net.develivarr.auralis

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import net.develivarr.auralis.api.ApiException
import net.develivarr.auralis.api.FakeServer
import net.develivarr.auralis.api.ServerConfig
import net.develivarr.auralis.auth.MemoryTokenStore
import net.develivarr.auralis.generated.api.Account
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SignInGateTest {

    @get:Rule
    val composeRule = createEmptyComposeRule()

    private val server = FakeServer()
    private val app = ApplicationProvider.getApplicationContext<AuralisApp>()

    private fun install(token: String? = null) {
        app.graph = AppGraph(
            context = app,
            server = ServerConfig("http://127.0.0.1:8787/".toHttpUrl()),
            tokens = MemoryTokenStore(token = token),
            http = server.client(),
        )
    }

    private fun showing(title: String) {
        composeRule.waitUntil(TIMEOUT_MS) {
            composeRule.onAllNodes(hasText(title) and isHeading()).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun `without a token the app opens Sign in`() {
        install()
        ActivityScenario.launch(MainActivity::class.java)
        showing("Sign in")
    }

    @Test
    fun `with a token the app opens Browse`() {
        install(token = "bearer-1")
        ActivityScenario.launch(MainActivity::class.java)
        showing("Browse")
    }

    @Test
    fun `Sign in opens the server's login page in the browser`() {
        install()
        ActivityScenario.launch(MainActivity::class.java)
        composeRule.onNode(hasText("Sign in") and hasClickAction()).performClick()
        val opened = shadowOf(app).nextStartedActivity
        assertEquals(Intent.ACTION_VIEW, opened.action)
        assertEquals("/api/auth/login", opened.data?.path)
        assertEquals("android", opened.data?.getQueryParameter("client"))
    }

    @Test
    fun `the browser's callback signs the app in and opens Browse`() {
        install()
        val state = app.graph.signIn.start().queryParameter("app_state")
        server.answer = { 200 to """{"token":"bearer-1","deviceId":"device-1","expiresAt":1}""" }
        val callback = Uri.parse("auralis://auth/callback?code=one-time&state=$state")
        ActivityScenario.launch<MainActivity>(
            Intent(Intent.ACTION_VIEW, callback).setClass(app, MainActivity::class.java),
        )
        showing("Browse")
        assertEquals("bearer-1", app.graph.session.token.value)
    }

    @Test
    fun `a 401 returns the app to Sign in`() {
        install(token = "bearer-1")
        ActivityScenario.launch(MainActivity::class.java)
        showing("Browse")
        server.answer = { 401 to """{"error":"unauthenticated"}""" }
        assertThrows(ApiException::class.java) {
            app.graph.api.get("api/auth/me", Account.serializer())
        }
        showing("Sign in")
    }

    private companion object {
        const val TIMEOUT_MS = 5_000L
    }
}
