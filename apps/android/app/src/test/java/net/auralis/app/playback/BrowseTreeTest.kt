package net.auralis.app.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import net.auralis.app.data.downloads.DownloadRepository
import net.auralis.app.data.downloads.DownloadState
import net.auralis.app.data.downloads.DownloadedItem
import net.auralis.app.data.downloads.FakeDownloadEngine
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
    private lateinit var downloadEngine: FakeDownloadEngine
    private lateinit var downloadRepository: DownloadRepository
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
        downloadEngine = FakeDownloadEngine()
        downloadRepository = DownloadRepository(apiClient, keyValueStore, downloadEngine)
        repository = BrowseTreeRepository(apiClient, serverConfigRepository, downloadRepository)
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
    fun `rootChildren returns exactly the four folders, in order`() =
        runTest {
            val root = repository.rootChildren()

            assertEquals(4, root.size)
            assertEquals(BrowseFolder(BrowseIds.CONTINUE, "Continue Listening"), root[0])
            assertEquals(BrowseFolder(BrowseIds.BOOKS, "Books"), root[1])
            assertEquals(BrowseFolder(BrowseIds.SERIES, "Series"), root[2])
            assertEquals(BrowseFolder(BrowseIds.DOWNLOADED, "Downloaded"), root[3])
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
    fun `children of Continue windows the shelf's items to pageSize, not the whole shelf`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"shelves":[
                  {"id":"shelf2","label":"Continue Listening","type":"book","items":[
                    {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"First"},"progress":null},
                    {"id":"item2","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Second"},"progress":null},
                    {"id":"item3","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Third"},"progress":null}
                  ]}
                ]}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.CONTINUE, page = 0, pageSize = 2)

            assertEquals(2, children.size)
            assertEquals(BrowseIds.book("item1"), (children[0] as BrowseBook).id)
            assertEquals(BrowseIds.book("item2"), (children[1] as BrowseBook).id)
        }

    @Test
    fun `children of Continue at page 1 returns the second window, not the first repeated`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"shelves":[
                  {"id":"shelf2","label":"Continue Listening","type":"book","items":[
                    {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"First"},"progress":null},
                    {"id":"item2","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Second"},"progress":null},
                    {"id":"item3","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Third"},"progress":null}
                  ]}
                ]}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.CONTINUE, page = 1, pageSize = 2)

            assertEquals(1, children.size)
            assertEquals(BrowseIds.book("item3"), (children[0] as BrowseBook).id)
        }

    @Test
    fun `children of Continue past the end of the shelf returns emptyList rather than throwing`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"shelves":[
                  {"id":"shelf2","label":"Continue Listening","type":"book","items":[
                    {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"First"},"progress":null}
                  ]}
                ]}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.CONTINUE, page = 5, pageSize = 2)

            assertTrue(children.isEmpty())
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
    fun `children of a series node windows that series' books to pageSize, not the whole series`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"series":[
                  {"id":"ser1","name":"The Chronicles","description":null,"books":[
                    {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Book One"},"progress":null},
                    {"id":"item2","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Book Two"},"progress":null},
                    {"id":"item3","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Book Three"},"progress":null}
                  ]}
                ],"total":1}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.seriesNode("ser1"), page = 0, pageSize = 2)

            assertEquals(2, children.size)
            assertEquals(BrowseIds.book("item1"), (children[0] as BrowseBook).id)
            assertEquals(BrowseIds.book("item2"), (children[1] as BrowseBook).id)
        }

    @Test
    fun `children of a series node at page 1 returns the second window, not the first repeated`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"series":[
                  {"id":"ser1","name":"The Chronicles","description":null,"books":[
                    {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Book One"},"progress":null},
                    {"id":"item2","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Book Two"},"progress":null},
                    {"id":"item3","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Book Three"},"progress":null}
                  ]}
                ],"total":1}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.seriesNode("ser1"), page = 1, pageSize = 2)

            assertEquals(1, children.size)
            assertEquals(BrowseIds.book("item3"), (children[0] as BrowseBook).id)
        }

    @Test
    fun `children of a series node past the end of its books returns emptyList rather than throwing`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"series":[
                  {"id":"ser1","name":"The Chronicles","description":null,"books":[
                    {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Book One"},"progress":null}
                  ]}
                ],"total":1}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.seriesNode("ser1"), page = 5, pageSize = 2)

            assertTrue(children.isEmpty())
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
    fun `children returns emptyList, not throwing, when the libraries call errors`() =
        runTest {
            withBaseUrlConfigured()
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Boom"}}"""),
            )

            val children = repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50)

            assertTrue(children.isEmpty())
        }

    @Test
    fun `children returns emptyList, not throwing, when the libraryItems call errors`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Boom"}}"""),
            )

            val children = repository.children(BrowseIds.BOOKS, page = 0, pageSize = 50)

            assertTrue(children.isEmpty())
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

    @Test
    fun `search maps upstream results to BrowseBooks with the browse tree's own book ids`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"books":[
                  {"id":"item1","libraryId":"lib1","coverPath":null,
                   "media":{"kind":"book","title":"Found Book"},"progress":null}
                ],"podcasts":[],"series":[],"authors":[]}
                """.trimIndent(),
            )

            val results = repository.search("found", page = 0, pageSize = 50)

            assertEquals(1, results.size)
            assertEquals(BrowseIds.book("item1"), results[0].id)
        }

    @Test
    fun `search windows its results to pageSize, not the whole upstream result set`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"books":[
                  {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"First"},"progress":null},
                  {"id":"item2","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Second"},"progress":null},
                  {"id":"item3","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Third"},"progress":null}
                ],"podcasts":[],"series":[],"authors":[]}
                """.trimIndent(),
            )

            val results = repository.search("book", page = 0, pageSize = 2)

            assertEquals(2, results.size)
            assertEquals(BrowseIds.book("item1"), results[0].id)
            assertEquals(BrowseIds.book("item2"), results[1].id)
        }

    @Test
    fun `search degrades to emptyList, not throwing, when the upstream call errors`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            mockWebServer.enqueue(
                MockResponse()
                    .setResponseCode(500)
                    .setBody("""{"error":{"code":"internal_error","message":"Boom"}}"""),
            )

            val results = repository.search("book", page = 0, pageSize = 50)

            assertTrue(results.isEmpty())
        }

    @Test
    fun `search returns emptyList for a blank query without calling the API`() =
        runTest {
            withBaseUrlConfigured()
            // No response enqueued: if the repository called the API here, the request would
            // block/fail with no queued response, failing this test loudly.
            val results = repository.search("   ", page = 0, pageSize = 50)

            assertTrue(results.isEmpty())
        }

    @Test
    fun `mostRecentContinueListening returns the shelf's first item`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue(
                """
                {"shelves":[
                  {"id":"shelf2","label":"Continue Listening","type":"book","items":[
                    {"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"First"},"progress":null},
                    {"id":"item2","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Second"},"progress":null}
                  ]}
                ]}
                """.trimIndent(),
            )

            val result = repository.mostRecentContinueListening()

            assertEquals(BrowseIds.book("item1"), result?.id)
        }

    @Test
    fun `mostRecentContinueListening returns null when the shelf is empty`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueue("""{"shelves":[{"id":"personalized-01","label":"Recently Added","type":"book","items":[]}]}""")

            val result = repository.mostRecentContinueListening()

            assertNull(result)
        }

    @Test
    fun `bestSearchMatch picks an exact, case-insensitive title match over the first result`() {
        val exact = BrowseBook(id = BrowseIds.book("item2"), title = "Dune")
        val candidates =
            listOf(
                BrowseBook(id = BrowseIds.book("item1"), title = "Dune Messiah"),
                exact,
            )

        val match = bestSearchMatch("dune", candidates, continueListeningFallback = null)

        assertEquals(exact, match)
    }

    @Test
    fun `bestSearchMatch falls back to the first result when nothing matches exactly`() {
        val first = BrowseBook(id = BrowseIds.book("item1"), title = "Dune Messiah")
        val candidates = listOf(first, BrowseBook(id = BrowseIds.book("item2"), title = "Children of Dune"))

        val match = bestSearchMatch("dune", candidates, continueListeningFallback = null)

        assertEquals(first, match)
    }

    @Test
    fun `bestSearchMatch falls back to the continue-listening item on a blank query`() {
        val fallback = BrowseBook(id = BrowseIds.book("item9"), title = "Whatever Was Playing")

        val match = bestSearchMatch("", emptyList(), continueListeningFallback = fallback)

        assertEquals(fallback, match)
    }

    @Test
    fun `bestSearchMatch returns null when there is nothing to pick from`() {
        assertNull(bestSearchMatch("dune", emptyList(), continueListeningFallback = null))
        assertNull(bestSearchMatch("", emptyList(), continueListeningFallback = null))
    }

    /** Enqueues a `POST /items/{id}/play` response with a single resolvable track — enough for
     * [DownloadRepository.enqueue] to succeed and mark the item kept-offline. */
    private fun enqueuePlayItem(itemId: String) {
        enqueue(
            """
            {"session":{"id":"s1","libraryItemId":"$itemId","mediaType":"book",
             "displayTitle":"Sample","duration":100.0,"currentTime":0.0,
             "audioTracks":[{"index":0,"startOffset":0.0,"duration":100.0,"contentUrl":"/api/items/$itemId/file/f1"}],
             "chapters":[]}}
            """.trimIndent(),
        )
    }

    /** Marks [itemId] kept-offline (a real `enqueue()` round trip through [downloadRepository])
     * and then overwrites its one track's engine entry to [DownloadState.COMPLETED] — the state
     * [BrowseTreeRepository]'s `Downloaded` node requires before an item appears in it. */
    private suspend fun keepOfflineAndComplete(itemId: String) {
        enqueuePlayItem(itemId)
        downloadRepository.enqueue(itemId)
        downloadEngine.seed(DownloadedItem(itemId, "f1", DownloadState.COMPLETED, bytesDownloaded = 100, totalBytes = 100))
    }

    @Test
    fun `children of Downloaded is empty when nothing is kept offline`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()

            val children = repository.children(BrowseIds.DOWNLOADED, page = 0, pageSize = 50)

            assertTrue(children.isEmpty())
        }

    @Test
    fun `children of Downloaded excludes an item that is still downloading`() =
        runTest {
            withBaseUrlConfigured()
            enqueueLibraries()
            enqueuePlayItem("item1")
            downloadRepository.enqueue("item1")
            // Left at FakeDownloadEngine's default QUEUED state — never seeded to COMPLETED.

            val children = repository.children(BrowseIds.DOWNLOADED, page = 0, pageSize = 50)

            assertTrue(children.isEmpty())
        }

    @Test
    fun `children of Downloaded includes a fully completed item, mapped like Books`() =
        runTest {
            withBaseUrlConfigured()
            // enqueueLibraries() must be queued *after* keepOfflineAndComplete: that helper does
            // its own synchronous POST /items/:id/play round trip immediately, and MockWebServer
            // serves queued responses strictly FIFO by arrival order, not by matching URL/shape.
            // Queuing the libraries response first would let that earlier POST consume it by
            // mistake, shifting every response after it by one and making the real, later
            // GET /libraries (fired inside repository.children() below) fail on a mismatched body
            // — which BrowseTreeRepository.children()'s own try/catch silently turns into
            // emptyList(), not an exception.
            keepOfflineAndComplete("item1")
            enqueueLibraries()
            enqueue(
                """
                {"item":{"id":"item1","libraryId":"lib1","coverPath":null,
                 "media":{"kind":"book","title":"Sample Book"},"progress":null}}
                """.trimIndent(),
            )

            val children = repository.children(BrowseIds.DOWNLOADED, page = 0, pageSize = 50)

            assertEquals(1, children.size)
            val book = children[0] as BrowseBook
            assertEquals(BrowseIds.book("item1"), book.id)
            assertEquals("Sample Book", book.title)
            assertEquals("${baseUrl.trimEnd('/')}/api/v1/media/item1/cover?width=200", book.coverUrl)
        }

    @Test
    fun `children of Downloaded windows completed items to pageSize, not the whole set`() =
        runTest {
            withBaseUrlConfigured()
            // Sorted by item id (BrowseTreeRepository's own tie-break) — item1 then item2 then item3.
            // enqueueLibraries() is queued after these (see the sibling test's comment above for
            // why): each keepOfflineAndComplete does its own immediate POST /items/:id/play, and
            // MockWebServer's queue is strict FIFO by arrival, not by matching URL/shape.
            keepOfflineAndComplete("item1")
            keepOfflineAndComplete("item2")
            keepOfflineAndComplete("item3")
            enqueueLibraries()
            enqueue("""{"item":{"id":"item1","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"First"},"progress":null}}""")
            enqueue("""{"item":{"id":"item2","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Second"},"progress":null}}""")

            val children = repository.children(BrowseIds.DOWNLOADED, page = 0, pageSize = 2)

            assertEquals(2, children.size)
            assertEquals(BrowseIds.book("item1"), (children[0] as BrowseBook).id)
            assertEquals(BrowseIds.book("item2"), (children[1] as BrowseBook).id)
        }

    @Test
    fun `children of Downloaded at page 1 returns the second window, not the first repeated`() =
        runTest {
            withBaseUrlConfigured()
            // enqueueLibraries() ordering: see the first Downloaded/keepOfflineAndComplete test's
            // comment above.
            keepOfflineAndComplete("item1")
            keepOfflineAndComplete("item2")
            keepOfflineAndComplete("item3")
            enqueueLibraries()
            enqueue("""{"item":{"id":"item3","libraryId":"lib1","coverPath":null,"media":{"kind":"book","title":"Third"},"progress":null}}""")

            val children = repository.children(BrowseIds.DOWNLOADED, page = 1, pageSize = 2)

            assertEquals(1, children.size)
            assertEquals(BrowseIds.book("item3"), (children[0] as BrowseBook).id)
        }
}
