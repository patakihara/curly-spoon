package net.auralis.app.features.login

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class LoginViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient
    private lateinit var viewModel: LoginViewModel

    @Before
    fun setUp() {
        // Shared with ApiClient below, not just Dispatchers.Main — see ApiClient.ioDispatcher's
        // own doc comment for why a fire-and-forget request otherwise escapes onto the real
        // Dispatchers.IO pool, invisible to runTest and able to leak past this test's @After.
        val testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val cookieJar = SessionCookieJar(FakeKeyValueStore(), CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient = ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { mockWebServer.url("/").toString() }
        viewModel = LoginViewModel(apiClient)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    @Test
    fun `blank username sets an error and makes no network call`() =
        runTest {
            var succeeded = false

            viewModel.login("", "password", onSuccess = { succeeded = true })

            assertFalse(succeeded)
            assertTrue(viewModel.uiState.value is LoginUiState.Error)
            assertEquals(0, mockWebServer.requestCount)
        }

    @Test
    fun `blank password sets an error and makes no network call`() =
        runTest {
            var succeeded = false

            viewModel.login("alice", "", onSuccess = { succeeded = true })

            assertFalse(succeeded)
            assertTrue(viewModel.uiState.value is LoginUiState.Error)
            assertEquals(0, mockWebServer.requestCount)
        }

    // `viewModel.login` just launches on `viewModelScope` and returns immediately — its own
    // completion is never guaranteed by the mere fact that the next line runs, `testDispatcher`
    // injection above notwithstanding. Waiting on the observable `uiState` transition (for the
    // error case) or on a `CompletableDeferred` completed from `onSuccess` (since `uiState`
    // deliberately never leaves `LoggingIn` on success — the caller navigates away instead)
    // avoids racing that call, unlike sampling a plain var immediately.

    @Test
    fun `successful login calls onSuccess`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"user":{"id":"u1","username":"alice"}}"""))
            val succeeded = CompletableDeferred<Unit>()

            viewModel.login("alice", "hunter2", onSuccess = { succeeded.complete(Unit) })

            succeeded.await()
        }

    @Test
    fun `a 401 sets Error with the server's message and does not call onSuccess`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"invalid_credentials","message":"Bad credentials"}}"""),
            )
            var succeeded = false

            viewModel.login("alice", "wrong", onSuccess = { succeeded = true })

            val state = viewModel.uiState.first { it is LoginUiState.Error }
            assertFalse(succeeded)
            assertEquals("Bad credentials", (state as LoginUiState.Error).message)
        }
}
