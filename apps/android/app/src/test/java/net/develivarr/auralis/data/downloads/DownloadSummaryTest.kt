package net.develivarr.auralis.data.downloads

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DownloadSummaryTest {
    private fun track(
        fileId: String,
        state: DownloadState,
        bytesDownloaded: Long = 0,
        totalBytes: Long = 0,
        itemId: String = "item1",
    ) = DownloadedItem(itemId, fileId, state, bytesDownloaded, totalBytes)

    @Test
    fun `an empty track list summarizes to null`() {
        assertNull(summarizeDownloads(emptyList()))
    }

    @Test
    fun `all tracks completed summarizes to COMPLETED with summed bytes`() {
        val summary =
            summarizeDownloads(
                listOf(
                    track("f1", DownloadState.COMPLETED, bytesDownloaded = 100, totalBytes = 100),
                    track("f2", DownloadState.COMPLETED, bytesDownloaded = 200, totalBytes = 200),
                ),
            )

        assertEquals(DownloadSummary("item1", DownloadState.COMPLETED, 300, 300), summary)
    }

    @Test
    fun `one queued track among completed ones summarizes to DOWNLOADING, not COMPLETED`() {
        val summary =
            summarizeDownloads(
                listOf(
                    track("f1", DownloadState.COMPLETED, bytesDownloaded = 100, totalBytes = 100),
                    track("f2", DownloadState.QUEUED, bytesDownloaded = 0, totalBytes = 100),
                ),
            )

        assertEquals(DownloadState.DOWNLOADING, summary?.state)
    }

    @Test
    fun `a paused track among completed ones also summarizes to DOWNLOADING`() {
        val summary =
            summarizeDownloads(
                listOf(
                    track("f1", DownloadState.COMPLETED, bytesDownloaded = 100, totalBytes = 100),
                    track("f2", DownloadState.PAUSED, bytesDownloaded = 50, totalBytes = 100),
                ),
            )

        assertEquals(DownloadState.DOWNLOADING, summary?.state)
    }

    @Test
    fun `any failed track wins over completed and in-flight ones`() {
        val summary =
            summarizeDownloads(
                listOf(
                    track("f1", DownloadState.COMPLETED, bytesDownloaded = 100, totalBytes = 100),
                    track("f2", DownloadState.DOWNLOADING, bytesDownloaded = 50, totalBytes = 100),
                    track("f3", DownloadState.FAILED, bytesDownloaded = 0, totalBytes = 100),
                ),
            )

        assertEquals(DownloadState.FAILED, summary?.state)
    }

    @Test
    fun `a single unknown-total track makes the whole item's total unknown, even if others are known`() {
        val summary =
            summarizeDownloads(
                listOf(
                    track("f1", DownloadState.DOWNLOADING, bytesDownloaded = 50, totalBytes = 100),
                    track("f2", DownloadState.DOWNLOADING, bytesDownloaded = 10, totalBytes = -1),
                ),
            )

        assertEquals(0L, summary?.totalBytes)
        // bytesDownloaded is still a plain sum — only totalBytes degrades to "unknown".
        assertEquals(60L, summary?.bytesDownloaded)
    }

    @Test
    fun `itemId is taken from the tracks, not hardcoded`() {
        val summary = summarizeDownloads(listOf(track("f1", DownloadState.COMPLETED, itemId = "book-42")))

        assertEquals("book-42", summary?.itemId)
    }
}
