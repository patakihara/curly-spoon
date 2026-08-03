package net.auralis.app.data.network

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import net.auralis.app.data.model.Release
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

    @Test
    fun `playItem decodes a playback session including its nested tracks and chapters`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"session":{"id":"sess1","libraryItemId":"item1","mediaType":"book",
                     "displayTitle":"Dune","duration":1800.0,"currentTime":0.0,
                     "audioTracks":[{"index":0,"startOffset":0.0,"duration":900.0,"title":"Part One",
                       "contentUrl":"/api/items/item1/file/file1","mimeType":"audio/mp4"}],
                     "chapters":[{"id":1,"start":0.0,"end":900.0,"title":"Chapter One"}]}}
                    """.trimIndent(),
                ),
            )

            val session = apiClient.playItem("item1")

            assertEquals("sess1", session.id)
            assertEquals("Dune", session.displayTitle)
            assertEquals("/api/items/item1/file/file1", session.audioTracks[0].contentUrl)
            assertEquals("Chapter One", session.chapters[0].title)
        }

    @Test
    fun `playItem throws ApiException on a 404 error response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"Item not found"}}"""),
            )

            val exception =
                try {
                    apiClient.playItem("missing")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("not_found", exception?.code)
            assertEquals(404, exception?.httpStatus)
        }

    @Test
    fun `syncSession sends currentTime, timeListened and duration in the request body`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"ok":true}"""))

            apiClient.syncSession("sess1", 123.4, 56.7, 1800.0)

            val recorded = mockWebServer.takeRequest().body.readUtf8()
            assertTrue(recorded.contains("123.4"))
            assertTrue(recorded.contains("56.7"))
            assertTrue(recorded.contains("1800.0"))
        }

    @Test
    fun `closeSession succeeds on a 200 ok response`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"ok":true}"""))

            apiClient.closeSession("sess1")
        }

    @Test
    fun `audioTrackUrl builds the exact track URL`() =
        runTest {
            val baseUrl = mockWebServer.url("/").toString().trimEnd('/')

            val url = apiClient.audioTrackUrl("item1", "file1")

            assertEquals("$baseUrl/api/v1/media/item1/track/file1", url)
        }

    // -----------------------------------------------------------------------------
    // Book requests (wave D1)
    // -----------------------------------------------------------------------------

    /** Minimal valid `{request: BookRequest}` envelope — every field this class defaults
     * to null is omitted, leaning on those defaults being exercised elsewhere. */
    private fun sampleRequestJson(
        id: String,
        status: String,
    ): String =
        """{"request":{"id":"$id","userId":"u1","title":"Dune","status":"$status","progress":0.0,"createdAt":1690000000000,"updatedAt":1690000000000}}"""

    @Test
    fun `searchReleases sends term, author and limit as query parameters and decodes releases and errors`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"releases":[{"guid":"g1","indexerId":"idx1","sourceName":"Prowlarr","title":"Dune",
                      "sizeBytes":123456,"seeders":10,"leechers":2,"publishedAt":1690000000000,
                      "downloadUrl":"https://example.com/dl","magnetUri":null,"categories":["audiobook"],
                      "format":"m4b"}],
                     "errors":[{"indexerId":"idx2","kind":"unauthorized","message":"Bad API key"}]}
                    """.trimIndent(),
                ),
            )

            val result = apiClient.searchReleases("dune", author = "Frank", limit = 20)

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("term=dune"))
            assertTrue(recordedPath.contains("author=Frank"))
            assertTrue(recordedPath.contains("limit=20"))
            assertEquals(1, result.releases.size)
            assertEquals("Dune", result.releases[0].title)
            assertEquals(1, result.errors.size)
            assertEquals("unauthorized", result.errors[0].kind)
        }

    @Test
    fun `listRequests with no status omits the status query parameter`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"requests":[]}"""))

            apiClient.listRequests()

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(!recordedPath.contains("status"))
        }

    @Test
    fun `listRequests with a status includes it as a query parameter`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"requests":[]}"""))

            apiClient.listRequests(status = "pending")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("status=pending"))
        }

    @Test
    fun `createRequest sends title, author and release in the body and decodes the created request`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setResponseCode(201).setBody(sampleRequestJson("req1", "pending")),
            )
            val release =
                Release(
                    guid = "g1",
                    indexerId = "idx1",
                    sourceName = "Prowlarr",
                    title = "Dune",
                    sizeBytes = 123456,
                    seeders = 10,
                    leechers = 2,
                    publishedAt = 1690000000000,
                    downloadUrl = "https://example.com/dl",
                    magnetUri = null,
                    categories = listOf("audiobook"),
                    format = "m4b",
                )

            val result = apiClient.createRequest("Dune", "Frank Herbert", release)

            val recordedBody = mockWebServer.takeRequest().body.readUtf8()
            assertTrue(recordedBody.contains(""""title":"Dune""""))
            assertTrue(recordedBody.contains(""""author":"Frank Herbert""""))
            assertTrue(recordedBody.contains(""""guid":"g1""""))
            assertEquals("req1", result.id)
            assertEquals("pending", result.status)
        }

    @Test
    fun `getRequest decodes the request envelope`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(sampleRequestJson("req1", "pending")))

            val result = apiClient.getRequest("req1")

            assertEquals("req1", result.id)
            assertEquals("pending", result.status)
        }

    @Test
    fun `getRequest throws ApiException with code not_found on a 404`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"request \"missing\" not found"}}"""),
            )

            val exception =
                try {
                    apiClient.getRequest("missing")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("not_found", exception?.code)
            assertEquals(404, exception?.httpStatus)
        }

    @Test
    fun `approveRequest decodes the request envelope`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(sampleRequestJson("req1", "approved")))

            val result = apiClient.approveRequest("req1")

            assertEquals("approved", result.status)
        }

    @Test
    fun `approveRequest throws ApiException with code invalid_transition on a 409`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(409)
                    .setBody(
                        """{"error":{"code":"invalid_transition","message":"cannot move a request from \"completed\" to \"approved\""}}""",
                    ),
            )

            val exception =
                try {
                    apiClient.approveRequest("req1")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("invalid_transition", exception?.code)
            assertEquals(409, exception?.httpStatus)
        }

    @Test
    fun `rejectRequest decodes the request envelope`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(sampleRequestJson("req1", "rejected")))

            val result = apiClient.rejectRequest("req1")

            assertEquals("rejected", result.status)
        }

    @Test
    fun `retryRequest decodes the request envelope`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(sampleRequestJson("req1", "searching")))

            val result = apiClient.retryRequest("req1")

            assertEquals("searching", result.status)
        }

    @Test
    fun `grabRequest decodes the request envelope`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody(sampleRequestJson("req1", "downloading")))

            val result = apiClient.grabRequest("req1")

            assertEquals("downloading", result.status)
        }

    @Test
    fun `deleteRequest succeeds against a 204 response with an empty body`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setResponseCode(204))

            apiClient.deleteRequest("req1")
        }
}
