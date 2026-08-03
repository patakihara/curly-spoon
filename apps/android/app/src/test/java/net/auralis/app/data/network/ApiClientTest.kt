package net.auralis.app.data.network

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import okhttp3.Cookie
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ApiClientTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var cookieJar: SessionCookieJar
    private lateinit var apiClient: ApiClient

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()
        cookieJar = SessionCookieJar(FakeKeyValueStore(), TestScope())
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
    }

    @After
    fun tearDown() {
        try {
            mockWebServer.shutdown()
        } catch (e: Exception) {
            // Already shut down by a test that exercises the network-failure path.
        }
    }

    @Test
    fun `getSetupState decodes a configured response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"configured":true,"baseUrl":"https://media.example.com"}"""),
            )

            val result = apiClient.getSetupState()

            assertTrue(result.configured)
            assertEquals("https://media.example.com", result.baseUrl)
        }

    @Test
    fun `postSetup sends the base URL in the request body and decodes the result`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"configured":true,"baseUrl":"https://media.example.com","serverVersion":"1.2.3"}""",
                ),
            )

            val result = apiClient.postSetup("https://media.example.com")

            val recorded = mockWebServer.takeRequest()
            assertTrue(recorded.body.readUtf8().contains("https://media.example.com"))
            assertTrue(result.configured)
            assertEquals("1.2.3", result.serverVersion)
        }

    @Test
    fun `login decodes user id and username on a 200`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"user":{"id":"u1","username":"alice"}}"""))

            val result = apiClient.login("alice", "hunter2")

            assertEquals("u1", result.user.id)
            assertEquals("alice", result.user.username)
        }

    @Test
    fun `login throws ApiException with code invalid_credentials on a 401`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"invalid_credentials","message":"Bad credentials"}}"""),
            )

            val exception =
                try {
                    apiClient.login("alice", "wrong")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("invalid_credentials", exception?.code)
            assertEquals(401, exception?.httpStatus)
        }

    @Test
    fun `me decodes the signed-in user`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"user":{"id":"u1","username":"alice"}}"""))

            val user = apiClient.me()

            assertEquals("u1", user.id)
            assertEquals("alice", user.username)
        }

    @Test
    fun `libraries decodes a list of libraries`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"libraries":[{"id":"lib1","name":"Audiobooks","mediaType":"book","icon":null}]}""",
                ),
            )

            val libraries = apiClient.libraries()

            assertEquals(1, libraries.size)
            assertEquals("lib1", libraries[0].id)
            assertEquals("book", libraries[0].mediaType)
        }

    @Test
    fun `libraryHome decodes shelves and their items`() =
        runTest {
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

            val shelves = apiClient.libraryHome("lib1")

            assertEquals(1, shelves.size)
            assertEquals("shelf1", shelves[0].id)
            assertEquals("Sample Book", shelves[0].items[0].media.title)
        }

    @Test
    fun `a non-JSON error body on a non-2xx response produces an unexpected_response ApiException`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setResponseCode(500).setBody("Internal Server Error - not json"),
            )

            val exception =
                try {
                    apiClient.me()
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("unexpected_response", exception?.code)
            assertEquals(500, exception?.httpStatus)
        }

    @Test
    fun `a 200 response with an undecodable body throws ApiException with code unexpected_response`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"totally":"not the expected shape"}"""))

            val exception =
                try {
                    apiClient.me()
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("unexpected_response", exception?.code)
            assertEquals(200, exception?.httpStatus)
        }

    @Test
    fun `a request to a shut-down server produces an ApiException where isNetworkError is true`() =
        runTest {
            mockWebServer.shutdown()

            val exception =
                try {
                    apiClient.me()
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertTrue(exception?.isNetworkError == true)
        }

    @Test
    fun `logout on a 200 clears the session cookie jar`() =
        runTest {
            val host = mockWebServer.url("/").host
            cookieJar.saveFromResponse(
                mockWebServer.url("/"),
                listOf(Cookie.Builder().name("auralis_session").value("tok").domain(host).path("/").build()),
            )
            mockWebServer.enqueue(MockResponse().setBody("""{"ok":true}"""))

            apiClient.logout()

            assertNull(cookieJar.loadForRequest(mockWebServer.url("/")).firstOrNull())
        }
}
