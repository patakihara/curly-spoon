package net.auralis.app.data.downloads

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pins `downloadStateFromMedia3`'s mapping against Media3's real `Download.STATE_*` int values
 * (see that function's doc comment for where they were read) without importing Media3 at all —
 * the whole point of the mapping being a pure `Int -> DownloadState` function.
 */
class DownloadStateMappingTest {
    @Test
    fun `maps STATE_QUEUED (0) to QUEUED`() {
        assertEquals(DownloadState.QUEUED, downloadStateFromMedia3(0))
    }

    @Test
    fun `maps STATE_STOPPED (1) to PAUSED`() {
        assertEquals(DownloadState.PAUSED, downloadStateFromMedia3(1))
    }

    @Test
    fun `maps STATE_DOWNLOADING (2) to DOWNLOADING`() {
        assertEquals(DownloadState.DOWNLOADING, downloadStateFromMedia3(2))
    }

    @Test
    fun `maps STATE_COMPLETED (3) to COMPLETED`() {
        assertEquals(DownloadState.COMPLETED, downloadStateFromMedia3(3))
    }

    @Test
    fun `maps STATE_FAILED (4) to FAILED`() {
        assertEquals(DownloadState.FAILED, downloadStateFromMedia3(4))
    }

    @Test
    fun `maps STATE_REMOVING (5) to DOWNLOADING, the closest in-progress bucket`() {
        assertEquals(DownloadState.DOWNLOADING, downloadStateFromMedia3(5))
    }

    @Test
    fun `maps STATE_RESTARTING (7) to DOWNLOADING, the closest in-progress bucket`() {
        assertEquals(DownloadState.DOWNLOADING, downloadStateFromMedia3(7))
    }

    @Test
    fun `an unrecognised state, such as the unused value 6, degrades to FAILED rather than throwing`() {
        assertEquals(DownloadState.FAILED, downloadStateFromMedia3(6))
    }

    @Test
    fun `a wildly out-of-range value degrades to FAILED rather than throwing`() {
        assertEquals(DownloadState.FAILED, downloadStateFromMedia3(-1))
        assertEquals(DownloadState.FAILED, downloadStateFromMedia3(999))
    }
}

/**
 * Pins [downloadedItemFrom] — the item-id filter and failure-message logic that used to live in
 * [net.auralis.app.data.downloads.Media3DownloadEngine]'s `toDownloadedItemOrNull`, the one file
 * in this package that can't be unit-tested (stub `android.jar`, no Robolectric). Moved here so
 * it is.
 */
class DownloadedItemFromTest {
    @Test
    fun `resolves a matching id into a DownloadedItem`() {
        val requestId = DownloadRequestId(itemId = "item-1", fileId = "file-2").encode()
        val item =
            downloadedItemFrom(
                requestId = requestId,
                itemId = "item-1",
                state = 2, // STATE_DOWNLOADING
                bytesDownloaded = 512L,
                contentLength = 1024L,
            )
        assertEquals(
            DownloadedItem(
                itemId = "item-1",
                fileId = "file-2",
                state = DownloadState.DOWNLOADING,
                bytesDownloaded = 512L,
                totalBytes = 1024L,
                failureReason = null,
            ),
            item,
        )
    }

    @Test
    fun `returns null when the requestId isn't one this app encoded`() {
        assertNull(
            downloadedItemFrom(
                requestId = "not-one-of-ours",
                itemId = "item-1",
                state = 2,
                bytesDownloaded = 0L,
                contentLength = 0L,
            ),
        )
    }

    @Test
    fun `returns null when the decoded itemId doesn't match the requested one`() {
        val requestId = DownloadRequestId(itemId = "item-1", fileId = "file-2").encode()
        assertNull(
            downloadedItemFrom(
                requestId = requestId,
                itemId = "item-OTHER",
                state = 2,
                bytesDownloaded = 0L,
                contentLength = 0L,
            ),
        )
    }

    @Test
    fun `sets a failure reason when the state resolves to FAILED`() {
        val requestId = DownloadRequestId(itemId = "item-1", fileId = "file-2").encode()
        val item =
            downloadedItemFrom(
                requestId = requestId,
                itemId = "item-1",
                state = 4, // STATE_FAILED
                bytesDownloaded = 0L,
                contentLength = 0L,
            )
        assertEquals("Download failed", item?.failureReason)
    }

    @Test
    fun `leaves the failure reason null for a non-failed state`() {
        val requestId = DownloadRequestId(itemId = "item-1", fileId = "file-2").encode()
        val item =
            downloadedItemFrom(
                requestId = requestId,
                itemId = "item-1",
                state = 3, // STATE_COMPLETED
                bytesDownloaded = 1024L,
                contentLength = 1024L,
            )
        assertNull(item?.failureReason)
    }

    @Test
    fun `an unrecognised state also degrades to a failure reason, matching downloadStateFromMedia3`() {
        val requestId = DownloadRequestId(itemId = "item-1", fileId = "file-2").encode()
        val item =
            downloadedItemFrom(
                requestId = requestId,
                itemId = "item-1",
                state = 999,
                bytesDownloaded = 0L,
                contentLength = 0L,
            )
        assertEquals(DownloadState.FAILED, item?.state)
        assertEquals("Download failed", item?.failureReason)
    }
}
