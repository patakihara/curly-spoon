package net.auralis.app.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.FakeKeyValueStore
import net.auralis.app.data.network.SessionCookieJar
import net.auralis.app.data.settings.ServerConfigRepository
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BrowseTreeTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var keyValueStore: FakeKeyValueStore
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var apiClient: ApiClient
    private lateinit var repository: BrowseTreeRepository
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()
        keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar) { baseUrl }
        repository = BrowseTreeRepository(apiClient, serverConfigRepository)
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
    }

    private suspend fun withBaseUrlConfigured() {
        serverConfigRepository.setBaseUrl(baseUrl)
    }

    private fun enqueue(body: String) {
        mockWebServer.enqueue(MockResponse().setBody(body))
    }

    private fun enqueueLibraries(libraryId: String = "lib1") {
        enqueue("""{"libraries":[{"id":"$libraryId","name":"Audiobooks","mediaType":"book","icon":null}]}""")
    }

    @Test
    fun `rootChildren returns exactly the three folders, in order`() =
        runTest {
            val root = repository.rootChildren()

            assertEquals(3, root.size)
            assertEquals(BrowseFolder(BrowseIds.CONTINUE, "Continue Listening"), root[0])
            assertEquals(BrowseFolder(BrowseIds.BOOKS, "Books"), root[1])
            assertEquals(BrowseFolder(BrowseIds.SERIES, "Series"), root[2])
        }

    @Test
    fun `children of Books maps a libraryItems result, including the cover URL`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"items":[
                  {"id":"item1","libraryId":"lib1","coverPath":null,
                   "media":{"kind":"book","title":"Sample Book"},"progress":null}
                ],"total":1,"limit":50,"page":0}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50)

            assertEquals(1, children.size)
            val book = children[0] as BrowseBook
            assertEquals(BrowseIds.book("item1"), book.id)
            assertEquals("Sample Book", book.title)
            assertEquals("${baseUrl.trimEnd('/')}/api/v1/media/item1/cover?width=200", book.coverUrl)
        }

    @Test
    fun `children of Continue finds a shelf by id or label containing continue, case-insensitively`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"shelves":[
                  {"id":"personalized-01","label":"Recently Added","type":"book","items":[]},
                  {"id":"shelf2","label":"CONTINUE Listening","type":"book","items":[
                    {"id":"item2","libraryId":"lib1","coverPath":null,
                     "media":{"kind":"book","title":"In Progress"},"progress":null}
                  ]}
                ]}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.CONTINUE, page = 0, pageSize = 50)

            assertEquals(1, children.size)
            assertEquals("In Progress", (children[0] as BrowseBook).title)
        }

    @Test
    fun `children of Continue returns emptyList when no shelf matches`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """{"shelves":[{"id":"personalized-01","label":"Recently Added","type":"book","items":[]}]}""",
            )

            val children = repository.children(BrowseIds.CONTINUE, page = 0, pageSize = 50)

            assertTrue(children.isEmpty())
        }

    @Test
    fun `children of Series maps a librarySeries result to folders with the series prefix`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """{"series":[{"id":"ser1","name":"The Chronicles","description":null,"books":[]}],"total":1}""",
            )

            val children = repository.children(BrowseIds.SERIES, page = 0, pageSize = 50)

            assertEquals(1, children.size)
            val folder = children[0] as BrowseFolder
            assertEquals(BrowseIds.seriesNode("ser1"), folder.id)
            assertEquals("The Chronicles", folder.title)
        }

    @Test
    fun `children of a series node returns that series' books`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"series":[
                  {"id":"ser1","name":"The Chronicles","description":null,"books":[
                    {"id":"item3","libraryId":"lib1","coverPath":null,
                     "media":{"kind":"book","title":"Book One"},"progress":null}
                  ]},
                  {"id":"ser2","name":"Other Series","description":null,"books":[]}
                ],"total":2}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.seriesNode("ser1"), page = 0, pageSize = 50)

            assertEquals(1, children.size)
            assertEquals("Book One", (children[0] as BrowseBook).title)
        }

    @Test
    fun `children of an unknown series node returns emptyList when no series matches`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue("""{"series":[{"id":"ser2","name":"Other Series","description":null,"books":[]}],"total":1}""")

            val children = repository.children(BrowseIds.seriesNode("missing"), page = 0, pageSize = 50)

            assertTrue(children.isEmpty())
        }

    @Test
    fun `children returns emptyList for every branch when there are no libraries`() =
        runTest {
            withBaseUrlConfigured()

            enqueue("""{"libraries":[]}""")
            assertTrue(repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50).isEmpty())

            enqueue("""{"libraries":[]}""")
            assertTrue(repository.children(BrowseIds.CONTINUE, page = 0, pageSize = 50).isEmpty())

            enqueue("""{"libraries":[]}""")
            assertTrue(repository.children(BrowseIds.SERIES, page = 0, pageSize = 50).isEmpty())

            enqueue("""{"libraries":[]}""")
            assertTrue(repository.children(BrowseIds.seriesNode("ser1"), page = 0, pageSize = 50).isEmpty())
        }

    @Test
    fun `item on a book id maps a libraryItem result to a BrowseBook`() =
        runTest {
            withBaseUrlConfigured()
            enqueue(
                """
                {"item":{"id":"item9","libraryId":"lib1","coverPath":null,
                 "media":{"kind":"book","title":"Standalone"},"progress":null}}
                """.trimIndent(),
            )

            val book = repository.item(BrowseIds.book("item9"))

            assertEquals(BrowseIds.book("item9"), book?.id)
            assertEquals("Standalone", book?.title)
            assertEquals("${baseUrl.trimEnd('/')}/api/v1/media/item9/cover?width=200", book?.coverUrl)
        }

    @Test
    fun `item with a non-book prefix returns null without calling the API`() =
        runTest {
            withBaseUrlConfigured()
            // No response enqueued: if the repository called the API here, the request would
            // block/fail with no queued response, failing this test loudly.
            val result = repository.item(BrowseIds.seriesNode("xyz"))

            assertNull(result)
        }

    @Test
    fun `item returns null, not throwing, when the API errors`() =
        runTest {
            withBaseUrlConfigured()
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(404)
                    .setBody("""{"error":{"code":"not_found","message":"No such item"}}"""),
            )

            val result = repository.item(BrowseIds.book("missing"))

            assertNull(result)
        }

    @Test
    fun `toBrowseBook author fallback- authors present are joined`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"items":[
                  {"id":"item1","libraryId":"lib1","coverPath":null,
                   "media":{"kind":"book","title":"T","authors":[{"id":"a1","name":"Alice"},{"id":"a2","name":"Bob"}],"author":"ignored"},
                   "progress":null}
                ],"total":1,"limit":50,"page":0}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50)

            assertEquals("Alice, Bob", (children[0] as BrowseBook).subtitle)
        }

    @Test
    fun `toBrowseBook author fallback- falls back to the flat author string when authors is absent`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"items":[
                  {"id":"item1","libraryId":"lib1","coverPath":null,
                   "media":{"kind":"book","title":"T","author":"Solo Author"},
                   "progress":null}
                ],"total":1,"limit":50,"page":0}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50)

            assertEquals("Solo Author", (children[0] as BrowseBook).subtitle)
        }

    @Test
    fun `toBrowseBook author fallback- falls back to the flat author string when authors is empty`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"items":[
                  {"id":"item1","libraryId":"lib1","coverPath":null,
                   "media":{"kind":"book","title":"T","authors":[],"author":"Solo Author"},
                   "progress":null}
                ],"total":1,"limit":50,"page":0}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50)

            assertEquals("Solo Author", (children[0] as BrowseBook).subtitle)
        }

    @Test
    fun `toBrowseBook author fallback- null subtitle when neither authors nor author is present`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"items":[
                  {"id":"item1","libraryId":"lib1","coverPath":null,
                   "media":{"kind":"book","title":"T"},
                   "progress":null}
                ],"total":1,"limit":50,"page":0}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50)

            assertNull((children[0] as BrowseBook).subtitle)
        }
}
