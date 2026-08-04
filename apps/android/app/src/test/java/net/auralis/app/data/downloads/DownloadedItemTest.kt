package net.auralis.app.data.downloads

import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadedItemTest {
    @Test
    fun `downloadProgress reports the fraction of bytes downloaded so far`() {
        assertEquals(0.5f, downloadProgress(bytesDownloaded = 50, totalBytes = 100), 0.0001f)
    }

    @Test
    fun `downloadProgress reports 0 rather than dividing by zero when totalBytes is zero`() {
        assertEquals(0f, downloadProgress(bytesDownloaded = 0, totalBytes = 0), 0.0001f)
    }

    @Test
    fun `downloadProgress reports 0 for an unknown negative total, such as Media3's LENGTH_UNSET`() {
        assertEquals(0f, downloadProgress(bytesDownloaded = 500, totalBytes = -1), 0.0001f)
    }

    @Test
    fun `downloadProgress clamps to 1 rather than exceeding it when bytesDownloaded overruns totalBytes`() {
        assertEquals(1f, downloadProgress(bytesDownloaded = 150, totalBytes = 100), 0.0001f)
    }

    @Test
    fun `downloadProgress reports 0 at the very start of a download`() {
        assertEquals(0f, downloadProgress(bytesDownloaded = 0, totalBytes = 1000), 0.0001f)
    }

    @Test
    fun `downloadProgress reports 1 exactly when the download is complete`() {
        assertEquals(1f, downloadProgress(bytesDownloaded = 1000, totalBytes = 1000), 0.0001f)
    }
}
