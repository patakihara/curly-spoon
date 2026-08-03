package net.auralis.app.data.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TrackUrlsTest {
    @Test
    fun `extracts the last path segment as the fileId`() {
        assertEquals("file-dune-1", fileIdFromContentUrl("/api/items/item-dune/file/file-dune-1"))
    }

    @Test
    fun `returns null for null input`() {
        assertNull(fileIdFromContentUrl(null))
    }

    @Test
    fun `returns null for an empty string`() {
        assertNull(fileIdFromContentUrl(""))
    }

    @Test
    fun `returns the segment before a trailing slash`() {
        assertEquals("file", fileIdFromContentUrl("/api/items/item-dune/file/"))
    }
}
