package net.auralis.app.data.downloads

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pins [DownloadRequestId.encode]/[DownloadRequestId.decode] as a round trip, and specifically
 * exercises the reason a control-character separator was chosen over a printable one: an
 * `itemId`/`fileId` that itself contains the kind of printable character (`:`) a naive delimiter
 * choice could be fooled by.
 */
class DownloadRequestIdTest {
    @Test
    fun `encode then decode returns the original itemId and fileId`() {
        val id = DownloadRequestId(itemId = "item-1", fileId = "file-2")
        assertEquals(id, DownloadRequestId.decode(id.encode()))
    }

    @Test
    fun `round-trips even when itemId or fileId contains a colon`() {
        val id = DownloadRequestId(itemId = "lib:item-1", fileId = "track:01.mp3")
        assertEquals(id, DownloadRequestId.decode(id.encode()))
    }

    @Test
    fun `decode returns null for an id with no separator`() {
        assertNull(DownloadRequestId.decode("not-one-of-ours"))
    }

    @Test
    fun `decode returns null for an empty string`() {
        assertNull(DownloadRequestId.decode(""))
    }

    @Test
    fun `decode returns null when either half would be empty`() {
        val separator = 31.toChar().toString()
        assertNull(DownloadRequestId.decode(separator + "file-2"))
        assertNull(DownloadRequestId.decode("item-1" + separator))
    }
}
