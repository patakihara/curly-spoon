package net.develivarr.auralis.features.books

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.develivarr.auralis.data.downloads.DownloadRepository
import net.develivarr.auralis.data.downloads.FakeDownloadEngine
import net.develivarr.auralis.data.model.Chapter
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
import net.develivarr.auralis.data.settings.ServerConfigRepository
import net.develivarr.auralis.features.home.DownloadActionState
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Follows [net.develivarr.auralis.features.podcasts.PodcastDetailViewModelTest]'s shape: a real
 * [ApiClient] against a [MockWebServer], with [ApiClient]'s `ioDispatcher` explicitly given the
 * same test dispatcher `Dispatchers.setMain` installs — the trap this project has hit before is a
 * test that injects the dispatcher into `setMain` but *not* into `ApiClient`, which leaks a
 * request past its own test and fails a later, unrelated one.
 */
class BookDetailViewModelTest {
    private lateinit var mockWebServer: MockWebServer
    private lateinit var apiClient: ApiClient
    private lateinit var serverConfigRepository: ServerConfigRepository
    private lateinit var downloadRepository: DownloadRepository
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        val testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()
        val keyValueStore = FakeKeyValueStore()
        serverConfigRepository = ServerConfigRepository(keyValueStore)
        val cookieJar = SessionCookieJar(keyValueStore, CoroutineScope(Dispatchers.Unconfined))
        val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
        baseUrl = mockWebServer.url("/").toString()
        apiClient = ApiClient(httpClient, cookieJar, ioDispatcher = testDispatcher) { baseUrl }
        downloadRepository = DownloadRepository(apiClient, keyValueStore, FakeDownloadEngine())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    private suspend fun withBaseUrlConfigured() {
        serverConfigRepository.setBaseUrl(baseUrl)
    }

    /** `GET /items/{id}?expanded=true&include=progress` — the one network call [BookDetailViewModel.load] makes. */
    private fun enqueueBookItem(
        itemId: String = "book1",
        title: String = "The Fellowship of the Ring",
        kind: String = "book",
        authorsJson: String = """[{"id":"author1","name":"J. R. R. Tolkien"}]""",
        author: String? = null,
        narrator: String? = "Rob Inglis",
        duration: Double? = 68820.0,
        chaptersJson: String = "null",
        progressJson: String = "null",
    ) {
        val authorField = author?.let { ""","author":"$it"""" }.orEmpty()
        val narratorField = narrator?.let { ""","narrator":"$it"""" }.orEmpty()
        val durationField = duration?.let { ""","duration":$it""" }.orEmpty()
        mockWebServer.enqueue(
            MockResponse().setBody(
                """
                {"item":{"id":"$itemId","libraryId":"lib1","coverPath":null,
                 "media":{"kind":"$kind","title":"$title","authors":$authorsJson$authorField$narratorField$durationField,"chapters":$chaptersJson},
                 "progress":$progressJson}}
                """.trimIndent(),
            ),
        )
    }

    @Test
    fun `load populates title, author, meta line and chapters, and Play when there is no progress`() =
        runTest {
            withBaseUrlConfigured()
            enqueueBookItem(
                chaptersJson = """[{"id":1,"start":0.0,"end":600.0,"title":"Chapter One"},{"id":2,"start":600.0,"end":1200.0,"title":"Chapter Two"}]""",
            )
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is BookDetailUiState.Loading }

            assertTrue(state is BookDetailUiState.Loaded)
            val data = (state as BookDetailUiState.Loaded).data
            assertEquals("The Fellowship of the Ring", data.title)
            assertEquals("J. R. R. Tolkien", data.authorNames)
            assertEquals("Narrated by Rob Inglis · 19 h 07 m · 2 chapters", data.metaLine)
            assertEquals(listOf("Chapter One", "Chapter Two"), data.chapters.map { it.title })
            assertEquals(listOf(1, 2), data.chapters.map { it.index })
            assertEquals("Play", data.playLabel)
        }

    @Test
    fun `a book with progress reads Resume and carries a percent-listened meta segment`() =
        runTest {
            withBaseUrlConfigured()
            enqueueBookItem(
                progressJson =
                    """{"id":"p1","libraryItemId":"book1","episodeId":null,"duration":68820.0,
                        "currentTime":34410.0,"progress":0.5,"isFinished":false}""",
            )
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is BookDetailUiState.Loading }

            val data = (state as BookDetailUiState.Loaded).data
            assertEquals("Resume", data.playLabel)
            assertTrue(data.metaLine!!.endsWith("50% listened"))
        }

    @Test
    fun `no chapters, no narrator and no duration produce a null meta line and an empty chapter list`() =
        runTest {
            withBaseUrlConfigured()
            enqueueBookItem(narrator = null, duration = null, chaptersJson = "null")
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is BookDetailUiState.Loading }

            val data = (state as BookDetailUiState.Loaded).data
            assertNull(data.metaLine)
            assertTrue(data.chapters.isEmpty())
        }

    @Test
    fun `no structured authors falls back to the flattened author string`() =
        runTest {
            withBaseUrlConfigured()
            enqueueBookItem(authorsJson = "null", author = "Flattened Author")
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is BookDetailUiState.Loading }

            assertEquals("Flattened Author", (state as BookDetailUiState.Loaded).data.authorNames)
        }

    @Test
    fun `neither structured authors nor a flat author string omits the author line`() =
        runTest {
            withBaseUrlConfigured()
            enqueueBookItem(authorsJson = "null", author = null)
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is BookDetailUiState.Loading }

            assertNull((state as BookDetailUiState.Loaded).data.authorNames)
        }

    @Test
    fun `a non-book item produces NotABook, not Loaded`() =
        runTest {
            withBaseUrlConfigured()
            enqueueBookItem(kind = "podcast")
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is BookDetailUiState.Loading }

            assertTrue(state is BookDetailUiState.NotABook)
            assertEquals("The Fellowship of the Ring", (state as BookDetailUiState.NotABook).title)
        }

    @Test
    fun `a failed item fetch produces Failed with the server's message`() =
        runTest {
            withBaseUrlConfigured()
            mockWebServer.enqueue(
                MockResponse().setResponseCode(404).setBody("""{"error":{"code":"not_found","message":"No such item"}}"""),
            )
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.load()
            val state = viewModel.uiState.first { it !is BookDetailUiState.Loading }

            assertTrue(state is BookDetailUiState.Failed)
            assertEquals("No such item", (state as BookDetailUiState.Failed).message)
        }

    @Test
    fun `startDownload enqueues via the shared DownloadRepository and reports the outcome`() =
        runTest {
            withBaseUrlConfigured()
            // FakeDownloadEngine.enqueue always succeeds — DownloadRepository.enqueue's own
            // Enqueued branch is what this test exercises, matching HomeViewModelTest's identical
            // "enqueue via a real DownloadRepository wrapping a FakeDownloadEngine" pattern.
            mockWebServer.enqueue(
                MockResponse().setBody(
                    """{"session":{"id":"s1","libraryItemId":"book1","mediaType":"book",
                        "displayTitle":"The Fellowship of the Ring","duration":68820.0,"currentTime":0.0,
                        "audioTracks":[{"index":0,"startOffset":0.0,"duration":68820.0,
                        "contentUrl":"/api/items/book1/file/f1"}],"chapters":[]}}""",
                ),
            )
            val viewModel = BookDetailViewModel(apiClient, serverConfigRepository, downloadRepository, "book1")

            viewModel.startDownload()
            val state = viewModel.downloadState.first { it != DownloadActionState.IDLE && it != DownloadActionState.PENDING }

            assertEquals(DownloadActionState.ENQUEUED, state)
        }

    @Test
    fun `composeBookMetaLine joins only the parts that are present, in order, with no stray separators`() {
        assertEquals(
            "Narrated by Rob Inglis · 19 h 07 m · 24 chapters · 38% listened",
            composeBookMetaLine(narrator = "Rob Inglis", durationSeconds = 68820.0, chapterCount = 24, progressPercent = 38),
        )
        assertEquals("Narrated by Rob Inglis", composeBookMetaLine("Rob Inglis", null, null, null))
        assertEquals("19 h 07 m", composeBookMetaLine(null, 68820.0, null, null))
        assertEquals("1 chapter", composeBookMetaLine(null, null, 1, null))
        assertEquals("24 chapters", composeBookMetaLine(null, null, 24, null))
        assertEquals("38% listened", composeBookMetaLine(null, null, null, 38))
        assertNull(composeBookMetaLine(null, null, null, null))
        assertNull(composeBookMetaLine("", 0.0, 0, null))
    }

    @Test
    fun `activeChapterIndex picks the last chapter whose start the position has reached`() {
        val chapters =
            listOf(
                BookChapterUi(index = 1, title = "One", startMs = 0L, timeLabel = "0:00"),
                BookChapterUi(index = 2, title = "Two", startMs = 600_000L, timeLabel = "10:00"),
                BookChapterUi(index = 3, title = "Three", startMs = 1_200_000L, timeLabel = "20:00"),
            )
        assertEquals(1, activeChapterIndex(chapters, 0L))
        assertEquals(1, activeChapterIndex(chapters, 599_999L))
        assertEquals(2, activeChapterIndex(chapters, 600_000L))
        assertEquals(3, activeChapterIndex(chapters, 5_000_000L))
        assertNull(activeChapterIndex(emptyList(), 1_000L))
    }

    @Test
    fun `chapterAnnouncement names the current chapter only when active`() {
        val chapter = BookChapterUi(index = 1, title = "Chapter One", startMs = 0L, timeLabel = "0:00")
        assertEquals("Chapter One, 0:00", chapterAnnouncement(chapter, active = false))
        assertEquals("Chapter One, 0:00, current chapter", chapterAnnouncement(chapter, active = true))
    }

    // Wave 16e-nowplaying-A pulled this mapping out of toBookDetailData so NowPlayingScreen's
    // chapter indicator can build the same BookChapterUi shape directly; this pins the mapping
    // itself rather than only exercising it indirectly through `load` above.
    @Test
    fun `chaptersFrom sorts ascending by start and assigns a 1-based display index`() {
        val chapters =
            listOf(
                Chapter(id = 2, start = 600.0, end = 1200.0, title = "Chapter Two"),
                Chapter(id = 1, start = 0.0, end = 600.0, title = "Chapter One"),
            )
        val result = chaptersFrom(chapters)
        assertEquals(listOf("Chapter One", "Chapter Two"), result.map { it.title })
        assertEquals(listOf(1, 2), result.map { it.index })
        assertEquals(listOf(0L, 600_000L), result.map { it.startMs })
        assertEquals(listOf("0:00", "10:00"), result.map { it.timeLabel })
    }

    @Test
    fun `chaptersFrom is empty for a null or empty chapter list`() {
        assertTrue(chaptersFrom(null).isEmpty())
        assertTrue(chaptersFrom(emptyList()).isEmpty())
    }
}
