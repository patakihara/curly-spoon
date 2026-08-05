package net.auralis.app.data.network

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import net.auralis.app.data.model.PodcastSubscribeMetadata
import net.auralis.app.data.model.Release
import net.auralis.app.data.model.SubscribePodcastBody
import okhttp3.Cookie
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    // -----------------------------------------------------------------------------
    // Android Auto data-layer prep (wave E1)
    // -----------------------------------------------------------------------------

    @Test
    fun `libraryItems decodes items, total, limit and page`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[
                      {"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Dune"},"progress":null}
                    ],"total":42,"limit":50,"page":0}
                    """.trimIndent(),
                ),
            )

            val result = apiClient.libraryItems("lib1")

            assertEquals(1, result.items.size)
            assertEquals("Dune", result.items[0].media.title)
            assertEquals(42, result.total)
            assertEquals(50, result.limit)
            assertEquals(0, result.page)
        }

    @Test
    fun `libraryItems with no arguments sends no query parameters beyond the path`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0}"""))

            apiClient.libraryItems("lib1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertEquals("/api/v1/libraries/lib1/items", recordedPath)
        }

    @Test
    fun `libraryItems sends page, limit, sort, desc and filter as query parameters when provided`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0}"""))

            apiClient.libraryItems("lib1", page = 2, limit = 25, sort = "addedAt", desc = true, filter = "series.abc")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("page=2"))
            assertTrue(recordedPath.contains("limit=25"))
            assertTrue(recordedPath.contains("sort=addedAt"))
            assertTrue(recordedPath.contains("desc=true"))
            assertTrue(recordedPath.contains("filter=series.abc"))
        }

    @Test
    fun `libraryItems decodes a null limit and page when the server omits them`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"limit":null,"page":null}"""))

            val result = apiClient.libraryItems("lib1")

            assertNull(result.limit)
            assertNull(result.page)
        }

    @Test
    fun `librarySeries decodes series and total, including empty and populated book lists`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"series":[
                      {"id":"s1","name":"The Expanse","description":null,"books":[]},
                      {"id":"s2","name":"Dune Saga","description":"desc","books":[
                        {"id":"item1","libraryId":"lib1","coverPath":null,
                         "media":{"kind":"book","title":"Dune"},"progress":null}
                      ]}
                    ],"total":2}
                    """.trimIndent(),
                ),
            )

            val result = apiClient.librarySeries("lib1")

            assertEquals(2, result.total)
            assertEquals("The Expanse", result.series[0].name)
            assertTrue(result.series[0].books.isEmpty())
            assertEquals("Dune Saga", result.series[1].name)
            assertEquals(1, result.series[1].books.size)
            assertEquals("Dune", result.series[1].books[0].media.title)
        }

    @Test
    fun `librarySeries sends page and limit as query parameters when provided`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"series":[],"total":0}"""))

            apiClient.librarySeries("lib1", page = 1, limit = 10)

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("page=1"))
            assertTrue(recordedPath.contains("limit=10"))
        }

    @Test
    fun `searchLibrary decodes books, podcasts, series and authors, including empty arrays`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"books":[
                      {"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Dune"},"progress":null}
                    ],"podcasts":[],
                     "series":[{"id":"s1","name":"The Expanse","description":null,"books":[]}],
                     "authors":[{"id":"a1","name":"Frank Herbert","description":null,"imagePath":null,"numBooks":3}]}
                    """.trimIndent(),
                ),
            )

            val result = apiClient.searchLibrary("lib1", "dune")

            assertEquals(1, result.books.size)
            assertEquals("Dune", result.books[0].media.title)
            assertTrue(result.podcasts.isEmpty())
            assertEquals(1, result.series.size)
            assertEquals("The Expanse", result.series[0].name)
            assertEquals(1, result.authors.size)
            assertEquals("Frank Herbert", result.authors[0].name)
            assertEquals(3, result.authors[0].numBooks)
        }

    @Test
    fun `searchLibrary sends q and limit as query parameters`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"books":[],"podcasts":[],"series":[],"authors":[]}"""))

            apiClient.searchLibrary("lib1", "dune", limit = 15)

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("q=dune"))
            assertTrue(recordedPath.contains("limit=15"))
        }

    @Test
    fun `libraryItem decodes the wrapped item envelope`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Dune"},"progress":null}}""",
                ),
            )

            val result = apiClient.libraryItem("item1")

            assertEquals("item1", result.id)
            assertEquals("Dune", result.media.title)
        }

    @Test
    fun `libraryItem with no arguments sends neither expanded nor include`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Dune"},"progress":null}}""",
                ),
            )

            apiClient.libraryItem("item1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertEquals("/api/v1/items/item1", recordedPath)
        }

    @Test
    fun `libraryItem sends expanded=true and include=progress only when requested`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Dune"},"progress":null}}""",
                ),
            )

            apiClient.libraryItem("item1", expanded = true, includeProgress = true)

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("expanded=true"))
            assertTrue(recordedPath.contains("include=progress"))
        }

    @Test
    fun `a MediaSummary with a series field decodes SeriesSequence entries including a null sequence`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"book","title":"Dune",
                         "series":[{"id":"s1","name":"Dune Saga","sequence":"3"},
                                   {"id":"s2","name":"Untitled Series","sequence":null}]},
                       "progress":null}}""",
                ),
            )

            val result = apiClient.libraryItem("item1")

            val series = result.media.series
            assertNotNull(series)
            assertEquals(2, series?.size)
            assertEquals("Dune Saga", series?.get(0)?.name)
            assertEquals("3", series?.get(0)?.sequence)
            assertNull(series?.get(1)?.sequence)
        }

    @Test
    fun `a MediaSummary with no series key decodes series as null`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item1","libraryId":"lib1","coverPath":null,
                       "media":{"kind":"podcast","title":"A Podcast"},"progress":null}}""",
                ),
            )

            val result = apiClient.libraryItem("item1")

            assertNull(result.media.series)
        }

    // -----------------------------------------------------------------------------
    // Podcast discovery — mirrors routes/podcasts.ts
    // -----------------------------------------------------------------------------

    @Test
    fun `searchPodcastDirectory sends term and country as query parameters and decodes results`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"results":[{"itunesId":1200000001,"itunesArtistId":1200000002,
                      "title":"Nebula Weekly","artistName":"Nebula Media","description":"A synthetic show",
                      "descriptionPlain":"A synthetic show","releaseDate":"2020-01-01","genres":["Science"],
                      "cover":"https://example.com/cover.jpg","trackCount":42,
                      "feedUrl":"https://example.com/feed.xml","pageUrl":"https://example.com/page",
                      "explicit":false}]}
                    """.trimIndent(),
                ),
            )

            val results = apiClient.searchPodcastDirectory("nebula", country = "us")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("term=nebula"))
            assertTrue(recordedPath.contains("country=us"))
            assertEquals(1, results.size)
            assertEquals(1200000001L, results[0].itunesId)
            assertEquals("Nebula Weekly", results[0].title)
            assertEquals(42, results[0].trackCount)
        }

    @Test
    fun `searchPodcastDirectory with no country omits the country query parameter`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"results":[]}"""))

            apiClient.searchPodcastDirectory("nebula")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("term=nebula"))
            assertFalse(recordedPath.contains("country"))
        }

    @Test
    fun `previewPodcastFeed sends rssFeed in the request body and decodes its episodes`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"preview":{"title":"Nebula Weekly","author":"Nebula Media",
                      "description":"A synthetic show","descriptionPlain":"A synthetic show",
                      "feedUrl":"https://example.com/feed.xml","image":"https://example.com/cover.jpg",
                      "categories":["Science"],"language":"en","explicit":false,"numEpisodes":1,
                      "episodes":[{"title":"Episode One","subtitle":null,"description":null,
                        "pubDate":"2020-01-01","publishedAt":1577836800000,"episodeType":"full",
                        "season":null,"episodeNumber":"1","author":null,"duration":"3600",
                        "durationSeconds":3600.0,"explicit":false,
                        "enclosure":{"url":"https://example.com/ep1.mp3","type":"audio/mpeg","length":"123456"},
                        "guid":"guid-1","chaptersUrl":null,"chapters":[]}],
                      "pubDate":"2020-01-01","link":"https://example.com"}}
                    """.trimIndent(),
                ),
            )

            val preview = apiClient.previewPodcastFeed("https://example.com/feed.xml")

            val recorded = mockWebServer.takeRequest().body.readUtf8()
            assertTrue(recorded.contains("https://example.com/feed.xml"))
            assertEquals("Nebula Weekly", preview.title)
            assertEquals(1, preview.numEpisodes)
            assertEquals("Episode One", preview.episodes[0].title)
            assertEquals("https://example.com/ep1.mp3", preview.episodes[0].enclosure?.url)
        }

    @Test
    fun `previewPodcastFeed throws ApiException with code upstream_forbidden on a 403`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(403)
                    .setBody("""{"error":{"code":"upstream_forbidden","message":"Admin access required"}}"""),
            )

            val exception =
                try {
                    apiClient.previewPodcastFeed("https://example.com/feed.xml")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("upstream_forbidden", exception?.code)
            assertEquals(403, exception?.httpStatus)
        }

    @Test
    fun `subscribePodcast sends the subscription body and decodes the created item`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setResponseCode(201).setBody(
                    """{"item":{"id":"item-nebula","libraryId":"lib-podcasts","coverPath":null,
                       "media":{"kind":"podcast","title":"Nebula Weekly","numEpisodes":0},"progress":null}}""",
                ),
            )

            val body =
                SubscribePodcastBody(
                    libraryId = "lib-podcasts",
                    folderId = "folder1",
                    folderPath = "/podcasts",
                    rssFeed = "https://example.com/feed.xml",
                    title = "Nebula Weekly",
                    metadata =
                        PodcastSubscribeMetadata(
                            author = "Nebula Media",
                            itunesId = 1200000001,
                        ),
                    autoDownloadEpisodes = true,
                )

            val item = apiClient.subscribePodcast(body)

            val recorded = mockWebServer.takeRequest().body.readUtf8()
            assertTrue(recorded.contains("lib-podcasts"))
            assertTrue(recorded.contains("https://example.com/feed.xml"))
            assertTrue(recorded.contains("1200000001"))
            assertEquals("item-nebula", item.id)
            assertEquals("Nebula Weekly", item.media.title)
        }

    // -----------------------------------------------------------------------------
    // Episode listing — MediaSummary.episodes/numEpisodes on an expanded item fetch
    // -----------------------------------------------------------------------------

    @Test
    fun `a MediaSummary with an episodes field decodes numEpisodes and PodcastEpisode entries`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item-nebula","libraryId":"lib-podcasts","coverPath":null,
                       "media":{"kind":"podcast","title":"Nebula Weekly","numEpisodes":2,
                         "episodes":[{"id":"ep1","index":1,"season":null,"episodeNumber":"1",
                           "title":"Episode One","subtitle":null,"description":null,
                           "publishedAt":1577836800000,"duration":3600.0,
                           "audioTrack":{"index":0,"startOffset":0.0,"duration":3600.0,
                             "title":null,"contentUrl":"/api/items/item-nebula/file/ep1",
                             "mimeType":"audio/mpeg"}}]},
                       "progress":null}}""",
                ),
            )

            val result = apiClient.libraryItem("item-nebula", expanded = true)

            assertEquals(2, result.media.numEpisodes)
            val episodes = result.media.episodes
            assertNotNull(episodes)
            assertEquals(1, episodes?.size)
            assertEquals("ep1", episodes?.get(0)?.id)
            assertEquals("Episode One", episodes?.get(0)?.title)
            assertEquals("/api/items/item-nebula/file/ep1", episodes?.get(0)?.audioTrack?.contentUrl)
        }

    @Test
    fun `a minified podcast MediaSummary carries numEpisodes but decodes episodes as null`() =
        runTest {
            // The BFF's `normalizeMedia` (packages/abs-client/src/normalize.ts) always
            // populates `numEpisodes` — minified or expanded alike — but only ever maps
            // `episodes` when the raw item carried them, which a minified fetch never does.
            // This is the shape a real un-expanded `libraryItem()` call decodes.
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item-nebula","libraryId":"lib-podcasts","coverPath":null,
                       "media":{"kind":"podcast","title":"Nebula Weekly","numEpisodes":12},
                       "progress":null}}""",
                ),
            )

            val result = apiClient.libraryItem("item-nebula")

            assertEquals(12, result.media.numEpisodes)
            assertNull(result.media.episodes)
        }

    @Test
    fun `a MediaSummary with neither numEpisodes nor episodes keys decodes both as null`() =
        runTest {
            // Defensive: the real server always sends `numEpisodes` for a podcast item (see
            // the test above), but decoding must degrade rather than throw if it's ever
            // absent — total functions over a partial upstream response, not a crash.
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"item":{"id":"item-nebula","libraryId":"lib-podcasts","coverPath":null,
                       "media":{"kind":"podcast","title":"Nebula Weekly"},"progress":null}}""",
                ),
            )

            val result = apiClient.libraryItem("item-nebula")

            assertNull(result.media.numEpisodes)
            assertNull(result.media.episodes)
        }

    // -----------------------------------------------------------------------------
    // Episode playback — POST /items/{itemId}/play/{episodeId}
    // -----------------------------------------------------------------------------

    @Test
    fun `playEpisode POSTs to the episode-scoped play path and decodes a session carrying both ids`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"session":{"id":"sess-ep1","libraryItemId":"item-nebula","episodeId":"ep1",
                       "mediaType":"podcast","displayTitle":"Nebula Weekly - Episode One",
                       "duration":3600.0,"currentTime":0.0,"audioTracks":[],"chapters":[]}}""",
                ),
            )

            val session = apiClient.playEpisode("item-nebula", "ep1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertEquals("/api/v1/items/item-nebula/play/ep1", recordedPath)
            assertEquals("sess-ep1", session.id)
            assertEquals("item-nebula", session.libraryItemId)
            assertEquals("ep1", session.episodeId)
        }

    @Test
    fun `playEpisode throws ApiException on an error response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"Episode not found"}}"""),
            )

            val exception =
                try {
                    apiClient.playEpisode("item-nebula", "missing-ep")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("not_found", exception?.code)
            assertEquals(404, exception?.httpStatus)
        }

    // -----------------------------------------------------------------------------
    // Per-episode progress — GET /me/progress
    // -----------------------------------------------------------------------------

    @Test
    fun `myProgress decodes records for both a book (null episodeId) and a podcast episode`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"progress":[
                       {"id":"p1","libraryItemId":"item-dune","episodeId":null,"duration":1800.0,
                        "currentTime":600.0,"progress":0.33,"isFinished":false},
                       {"id":"p2","libraryItemId":"item-nebula","episodeId":"ep1","duration":3600.0,
                        "currentTime":1800.0,"progress":0.5,"isFinished":false}
                     ]}""",
                ),
            )

            val progress = apiClient.myProgress()

            assertEquals(2, progress.size)
            assertNull(progress[0].episodeId)
            assertEquals("ep1", progress[1].episodeId)
            assertEquals(0.5, progress[1].progress, 0.0001)
        }

    @Test
    fun `myProgress throws ApiException rather than an unrelated exception on an error response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )

            val exception =
                try {
                    apiClient.myProgress()
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("upstream_auth_expired", exception?.code)
            assertEquals(401, exception?.httpStatus)
        }

    // -----------------------------------------------------------------------------
    // Jellyfin music (routes/jellyfin.ts) — Android data layer, phase 9
    // -----------------------------------------------------------------------------

    @Test
    fun `jellyfinConfig decodes an unconfigured response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody("""{"configured":false,"baseUrl":null,"hasCredentials":false}"""),
            )

            val config = apiClient.jellyfinConfig()

            assertFalse(config.configured)
            assertNull(config.baseUrl)
            assertFalse(config.hasCredentials)
        }

    @Test
    fun `jellyfinConfig decodes a configured response with stored credentials`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"configured":true,"baseUrl":"https://jellyfin.example.com","hasCredentials":true}""",
                ),
            )

            val config = apiClient.jellyfinConfig()

            assertTrue(config.configured)
            assertEquals("https://jellyfin.example.com", config.baseUrl)
            assertTrue(config.hasCredentials)
        }

    @Test
    fun `jellyfinLogin omits baseUrl from the request body when not provided`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"configured":true,"baseUrl":"https://jellyfin.example.com","user":{"id":"u1","name":"alice"}}""",
                ),
            )

            apiClient.jellyfinLogin("alice", "hunter2")

            val recordedBody = mockWebServer.takeRequest().body.readUtf8()
            assertFalse(recordedBody.contains("baseUrl"))
            assertTrue(recordedBody.contains(""""username":"alice""""))
            assertTrue(recordedBody.contains(""""password":"hunter2""""))
        }

    @Test
    fun `jellyfinLogin sends baseUrl in the request body when provided`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"configured":true,"baseUrl":"https://jellyfin.example.com","user":{"id":"u1","name":"alice"}}""",
                ),
            )

            apiClient.jellyfinLogin("alice", "hunter2", baseUrl = "https://jellyfin.example.com")

            val recordedBody = mockWebServer.takeRequest().body.readUtf8()
            assertTrue(recordedBody.contains(""""baseUrl":"https://jellyfin.example.com""""))
        }

    @Test
    fun `jellyfinLogin decodes the user id and name on success`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"configured":true,"baseUrl":"https://jellyfin.example.com","user":{"id":"u1","name":"alice"}}""",
                ),
            )

            val result = apiClient.jellyfinLogin("alice", "hunter2")

            assertEquals("u1", result.user.id)
            assertEquals("alice", result.user.name)
        }

    @Test
    fun `jellyfinLogin throws ApiException with code jellyfin_not_configured when no baseUrl is known`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(409)
                    .setBody(
                        """{"error":{"code":"jellyfin_not_configured","message":"Jellyfin connection has not been configured yet"}}""",
                    ),
            )

            val exception =
                try {
                    apiClient.jellyfinLogin("alice", "hunter2")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("jellyfin_not_configured", exception?.code)
            assertEquals(409, exception?.httpStatus)
        }

    @Test
    fun `jellyfinArtists requests parentId, startIndex, limit, sortBy and sortOrder as query parameters`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":0}"""))

            apiClient.jellyfinArtists(
                parentId = "lib1",
                startIndex = 20,
                limit = 10,
                sortBy = "SortName",
                sortOrder = "Descending",
            )

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("parentId=lib1"))
            assertTrue(recordedPath.contains("startIndex=20"))
            assertTrue(recordedPath.contains("limit=10"))
            assertTrue(recordedPath.contains("sortBy=SortName"))
            assertTrue(recordedPath.contains("sortOrder=Descending"))
        }

    @Test
    fun `jellyfinArtists omits optional query parameters when not provided`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":0}"""))

            apiClient.jellyfinArtists()

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertFalse(recordedPath.contains("parentId"))
            assertFalse(recordedPath.contains("startIndex"))
            assertFalse(recordedPath.contains("limit"))
        }

    @Test
    fun `jellyfinArtists decodes items and surfaces the upstream total record count`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[{"id":"art1","name":"Radiohead","overview":null,"imageTag":"tag1","albumCount":9}],
                     "total":42,"startIndex":0}
                    """.trimIndent(),
                ),
            )

            val page = apiClient.jellyfinArtists()

            assertEquals(1, page.items.size)
            assertEquals("Radiohead", page.items[0].name)
            assertEquals(9, page.items[0].albumCount)
            assertEquals(42, page.total)
        }

    @Test
    fun `jellyfinArtists throws ApiException rather than an unrelated exception on an error response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )

            val exception =
                try {
                    apiClient.jellyfinArtists()
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("upstream_auth_expired", exception?.code)
            assertEquals(401, exception?.httpStatus)
        }

    @Test
    fun `jellyfinAlbums includes artistId as a query parameter and decodes the album fields`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[{"id":"alb1","name":"OK Computer","sortName":"OK Computer","artistId":"art1",
                     "artistName":"Radiohead","productionYear":1997,"overview":null,"genres":["Rock"],
                     "imageTag":"tag2","trackCount":12}],
                     "total":9,"startIndex":0}
                    """.trimIndent(),
                ),
            )

            val page = apiClient.jellyfinAlbums(artistId = "art1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("artistId=art1"))
            assertEquals(1, page.items.size)
            assertEquals("OK Computer", page.items[0].name)
            assertEquals(listOf("Rock"), page.items[0].genres)
            assertEquals(9, page.total)
        }

    @Test
    fun `jellyfinTracks includes albumId as a query parameter and decodes the track fields`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[{"id":"trk1","name":"Paranoid Android","albumId":"alb1","albumName":"OK Computer",
                     "artistNames":["Radiohead"],"trackNumber":2,"discNumber":1,"durationSeconds":383.5,
                     "imageTag":"tag2","genres":["Rock"]}],
                     "total":12,"startIndex":0}
                    """.trimIndent(),
                ),
            )

            val page = apiClient.jellyfinTracks(albumId = "alb1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("albumId=alb1"))
            assertEquals(1, page.items.size)
            assertEquals("Paranoid Android", page.items[0].name)
            assertEquals(383.5, page.items[0].durationSeconds!!, 0.001)
            assertEquals(12, page.total)
        }

    @Test
    fun `jellyfinSearch sends term and limit as query parameters and decodes all three result buckets`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"artists":[{"id":"art1","name":"Radiohead","overview":null,"imageTag":null,"albumCount":null}],
                     "albums":[{"id":"alb1","name":"OK Computer","sortName":null,"artistId":null,"artistName":null,
                      "productionYear":null,"overview":null,"genres":[],"imageTag":null,"trackCount":null}],
                     "tracks":[{"id":"trk1","name":"Paranoid Android","albumId":null,"albumName":null,
                      "artistNames":[],"trackNumber":null,"discNumber":null,"durationSeconds":null,
                      "imageTag":null,"genres":[]}]}
                    """.trimIndent(),
                ),
            )

            val results = apiClient.jellyfinSearch("radiohead", limit = 5)

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("term=radiohead"))
            assertTrue(recordedPath.contains("limit=5"))
            assertEquals(1, results.artists.size)
            assertEquals(1, results.albums.size)
            assertEquals(1, results.tracks.size)
        }

    @Test
    fun `jellyfinTrackStreamUrl builds the exact BFF proxy URL with no token in it`() =
        runTest {
            val baseUrl = mockWebServer.url("/").toString().trimEnd('/')

            val url = apiClient.jellyfinTrackStreamUrl("track1")

            assertEquals("$baseUrl/api/v1/jellyfin/tracks/track1/stream", url)
            assertFalse(url.contains("ApiKey"))
            assertFalse(url.contains("token", ignoreCase = true))
        }

    @Test
    fun `jellyfinArtists favoritesOnly and id are sent as favoritesOnly and ids query parameters`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":0}"""))

            apiClient.jellyfinArtists(favoritesOnly = true, id = "art1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("favoritesOnly=true"))
            assertTrue(recordedPath.contains("ids=art1"))
        }

    @Test
    fun `jellyfinAlbums favoritesOnly and id are sent as favoritesOnly and ids query parameters`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":0}"""))

            apiClient.jellyfinAlbums(favoritesOnly = true, id = "alb1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("favoritesOnly=true"))
            assertTrue(recordedPath.contains("ids=alb1"))
        }

    @Test
    fun `jellyfinTracks favoritesOnly is sent as a favoritesOnly query parameter`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":0}"""))

            apiClient.jellyfinTracks(favoritesOnly = true)

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("favoritesOnly=true"))
        }

    @Test
    fun `jellyfinMarkFavorite POSTs to the item's favorite route and decodes the resulting state`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"favorite":true}"""))

            val result = apiClient.jellyfinMarkFavorite("art1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.endsWith("/jellyfin/items/art1/favorite"))
            assertTrue(result.favorite)
        }

    @Test
    fun `jellyfinUnmarkFavorite DELETEs the item's favorite route and decodes the resulting state`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"favorite":false}"""))

            val result = apiClient.jellyfinUnmarkFavorite("art1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.endsWith("/jellyfin/items/art1/favorite"))
            assertFalse(result.favorite)
        }

    @Test
    fun `jellyfinUnmarkFavorite throws ApiException rather than an unrelated exception on an error response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )

            val exception =
                try {
                    apiClient.jellyfinUnmarkFavorite("art1")
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("upstream_auth_expired", exception?.code)
        }

    // -----------------------------------------------------------------------------
    // Jellyfin playlists (Android wave F — music playlists). See routes/jellyfin.ts's own
    // "Playlists" section comment and packages/jellyfin-client/src/schemas/raw.ts's playlists
    // section for the source-verified upstream behaviour these mirror: add keys on plain item
    // ids ("itemIds" in the request body), remove keys on the per-entry "playlistItemId" (sent
    // as comma-separated "playlistItemIds" query parameter), never a track id.
    // -----------------------------------------------------------------------------

    @Test
    fun `jellyfinPlaylists decodes items, total and startIndex`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"items":[{"id":"pl1","name":"Road Trip","imageTag":"tag1","trackCount":12}],
                        "total":3,"startIndex":0}""",
                ),
            )

            val page = apiClient.jellyfinPlaylists()

            assertEquals(1, page.items.size)
            assertEquals("Road Trip", page.items[0].name)
            assertEquals(12, page.items[0].trackCount)
            assertEquals(3, page.total)
        }

    @Test
    fun `jellyfinPlaylists sends startIndex, limit and favoritesOnly-ids as query parameters`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":10}"""))

            apiClient.jellyfinPlaylists(startIndex = 10, limit = 20, favoritesOnly = true, id = "pl1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("startIndex=10"))
            assertTrue(recordedPath.contains("limit=20"))
            assertTrue(recordedPath.contains("favoritesOnly=true"))
            assertTrue(recordedPath.contains("ids=pl1"))
        }

    @Test
    fun `jellyfinPlaylistItems decodes each entry's playlistItemId distinct from its track id`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """
                    {"items":[
                      {"playlistItemId":"entry1","track":{"id":"trk1","name":"Airbag","albumId":"alb1",
                       "albumName":"OK Computer","artistNames":["Radiohead"],"trackNumber":1,"discNumber":1,
                       "durationSeconds":284.0,"imageTag":"tag2","genres":["Rock"]}}
                    ],"total":1,"startIndex":0}
                    """.trimIndent(),
                ),
            )

            val page = apiClient.jellyfinPlaylistItems("pl1")

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.endsWith("/jellyfin/playlists/pl1/items"))
            assertEquals(1, page.items.size)
            assertEquals("entry1", page.items[0].playlistItemId)
            assertEquals("trk1", page.items[0].track.id)
            assertEquals("Airbag", page.items[0].track.name)
        }

    @Test
    fun `jellyfinPlaylistItems sends startIndex and limit as query parameters`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setBody("""{"items":[],"total":0,"startIndex":5}"""))

            apiClient.jellyfinPlaylistItems("pl1", startIndex = 5, limit = 40)

            val recordedPath = mockWebServer.takeRequest().path.orEmpty()
            assertTrue(recordedPath.contains("startIndex=5"))
            assertTrue(recordedPath.contains("limit=40"))
        }

    @Test
    fun `jellyfinCreatePlaylist POSTs name and itemIds in the body and returns the new id`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"pl-new"}"""))

            val id = apiClient.jellyfinCreatePlaylist("Road Trip", listOf("trk1", "trk2"))

            val recorded = mockWebServer.takeRequest()
            assertTrue(recorded.path.orEmpty().endsWith("/jellyfin/playlists"))
            val body = recorded.body.readUtf8()
            assertTrue(body.contains("\"name\":\"Road Trip\""))
            assertTrue(body.contains("\"itemIds\":[\"trk1\",\"trk2\"]"))
            assertEquals("pl-new", id)
        }

    @Test
    fun `jellyfinCreatePlaylist omits itemIds from the body when not provided`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":"pl-new"}"""))

            apiClient.jellyfinCreatePlaylist("Empty playlist")

            val body = mockWebServer.takeRequest().body.readUtf8()
            assertFalse(body.contains("itemIds"))
        }

    @Test
    fun `jellyfinAddToPlaylist POSTs itemIds in the body against a 204 response`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setResponseCode(204))

            apiClient.jellyfinAddToPlaylist("pl1", listOf("trk1", "trk2"))

            val recorded = mockWebServer.takeRequest()
            assertEquals("POST", recorded.method)
            assertTrue(recorded.path.orEmpty().endsWith("/jellyfin/playlists/pl1/items"))
            assertTrue(recorded.body.readUtf8().contains("\"itemIds\":[\"trk1\",\"trk2\"]"))
        }

    @Test
    fun `jellyfinAddToPlaylist throws ApiException rather than an unrelated exception on an error response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(400)
                    .setBody("""{"error":{"code":"validation_error","message":"itemIds must include at least one item"}}"""),
            )

            val exception =
                try {
                    apiClient.jellyfinAddToPlaylist("pl1", listOf("trk1"))
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("validation_error", exception?.code)
        }

    @Test
    fun `jellyfinRemoveFromPlaylist DELETEs with playlistItemIds as a comma-separated query parameter`() =
        runTest {
            mockWebServer.enqueue(MockResponse().setResponseCode(204))

            apiClient.jellyfinRemoveFromPlaylist("pl1", listOf("entry1", "entry2"))

            val recorded = mockWebServer.takeRequest()
            assertEquals("DELETE", recorded.method)
            val recordedPath = recorded.path.orEmpty()
            assertTrue(recordedPath.contains("/jellyfin/playlists/pl1/items"))
            // Keyed on playlistItemId (the per-entry id), never a track id — see this section's
            // own file doc comment.
            assertTrue(recordedPath.contains("playlistItemIds=entry1%2Centry2") || recordedPath.contains("playlistItemIds=entry1,entry2"))
        }

    @Test
    fun `jellyfinRemoveFromPlaylist throws ApiException rather than an unrelated exception on an error response`() =
        runTest {
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(401)
                    .setBody("""{"error":{"code":"upstream_auth_expired","message":"Session expired"}}"""),
            )

            val exception =
                try {
                    apiClient.jellyfinRemoveFromPlaylist("pl1", listOf("entry1"))
                    null
                } catch (e: ApiException) {
                    e
                }

            assertNotNull(exception)
            assertEquals("upstream_auth_expired", exception?.code)
        }
}
