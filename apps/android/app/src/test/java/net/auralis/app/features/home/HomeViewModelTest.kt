package net.auralis.app.features.home

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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class HomeViewModelTest {
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

    @Test
    fun `no base URL saved produces an error state`() =
        runTest {
            val viewModel = HomeViewModel(apiClient, serverConfigRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Error)
            assertEquals("No Auralis server configured", (state as HomeUiState.Error).message)
        }

    @Test
    fun `no libraries produces an empty loaded state`() =
        runTest {
            serverConfigRepository.setBaseUrl(mockWebServer.url("/").toString())
            mockWebServer.enqueue(MockResponse().setBody("""{"libraries":[]}"""))

            val viewModel = HomeViewModel(apiClient, serverConfigRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Loaded)
            assertEquals(emptyList<ShelfUi>(), (state as HomeUiState.Loaded).shelves)
        }

    @Test
    fun `a library's home shelves are mapped, with cover URLs built from the base URL`() =
        runTest {
            val baseUrl = mockWebServer.url("/").toString()
            serverConfigRepository.setBaseUrl(baseUrl)
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"libraries":[{"id":"lib1","name":"Audiobooks","mediaType":"book","icon":null}]}""",
                ),
            )
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"shelves":[{"id":"shelf1","label":"Continue Listening","type":"book","items":[
                      {"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Sample Book"},"progress":null}
                    ]}]}
                    """.trimIndent(),
                ),
            )

            val viewModel = HomeViewModel(apiClient, serverConfigRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Loaded)
            val shelves = (state as HomeUiState.Loaded).shelves
            assertEquals(1, shelves.size)
            assertEquals("shelf1", shelves[0].id)
            assertEquals("Continue Listening", shelves[0].label)
            assertEquals(1, shelves[0].items.size)
            val item = shelves[0].items[0]
            assertEquals("item1", item.id)
            assertEquals("Sample Book", item.title)
            assertEquals(
                "${baseUrl.trimEnd('/')}/api/v1/media/item1/cover?width=200",
                item.coverUrl,
            )
        }

    @Test
    fun `a 401 from GET libraries produces an error state with the server's message`() =
        runTest {
            serverConfigRepository.setBaseUrl(mockWebServer.url("/").toString())
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"not_authenticated","message":"Not signed in"}}"""),
            )

            val viewModel = HomeViewModel(apiClient, serverConfigRepository)

            val state = viewModel.uiState.first { it !is HomeUiState.Loading }

            assertTrue(state is HomeUiState.Error)
            assertEquals("Not signed in", (state as HomeUiState.Error).message)
        }
}
