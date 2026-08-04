package net.auralis.app.data.downloads

import org.junit.Assert.assertEquals
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
