package net.auralis.app.navigation

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
import net.auralis.app.data.settings.ServerConfigRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class AppStartViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var keyValueStore: FakeKeyValueStore
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var apiClient: ApiClient

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        mockWebServer = MockWebServer()
        mockWebServer.start()
        keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    // `apiClient.me()` dispatches its actual network call via `withContext(Dispatchers.IO)`
    // — a real dispatcher untouched by `Dispatchers.setMain`, so the ViewModel's `init` block
    // does not necessarily finish before this constructor call returns. Sampling
    // `state.value` right afterwards would race that background call; `first { ... }`
    // suspends until the terminal state actually arrives instead of assuming it already has.

    @Test
    fun `no base URL saved routes to onboarding`() =
        runTest {
            val viewModel = AppStartViewModel(serverConfigRepository, apiClient)

            val state = viewModel.state.first { it is StartState.Ready }
            assertEquals(Routes.ONBOARDING, (state as StartState.Ready).destination)
        }

    @Test
    fun `base URL saved but auth me fails routes to login`() =
        runTest {
            serverConfigRepository.setBaseUrl(mockWebServer.url("/").toString())
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"not_authenticated","message":"Not signed in"}}"""),
            )

            val viewModel = AppStartViewModel(serverConfigRepository, apiClient)

            val state = viewModel.state.first { it is StartState.Ready }
            assertEquals(Routes.LOGIN, (state as StartState.Ready).destination)
        }

    @Test
    fun `base URL saved and auth me succeeds routes to home`() =
        runTest {
            serverConfigRepository.setBaseUrl(mockWebServer.url("/").toString())
            mockWebServer.enqueue(MockResponse().setBody("""{"user":{"id":"u1","username":"alice"}}"""))

            val viewModel = AppStartViewModel(serverConfigRepository, apiClient)

            val state = viewModel.state.first { it is StartState.Ready }
            assertEquals(Routes.HOME, (state as StartState.Ready).destination)
        }
}
