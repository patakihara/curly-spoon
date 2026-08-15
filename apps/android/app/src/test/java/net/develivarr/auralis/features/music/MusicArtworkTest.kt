package net.develivarr.auralis.features.music

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MusicArtworkTest {
    @Test
    fun `builds the proxied artwork URL with no width query parameter`() {
        val url = jellyfinItemArtworkUrl("https://auralis.example.com", "album-driftwave")
        assertEquals("https://auralis.example.com/api/v1/jellyfin/items/album-driftwave/artwork", url)
    }

    @Test
    fun `trims a trailing slash on the base URL before appending the path`() {
        val url = jellyfinItemArtworkUrl("https://auralis.example.com/", "album-driftwave")
        assertEquals("https://auralis.example.com/api/v1/jellyfin/items/album-driftwave/artwork", url)
    }

    @Test
    fun `degrades to null rather than a broken URL when the base URL isn't known yet`() {
        assertNull(jellyfinItemArtworkUrl(null, "album-driftwave"))
    }
}
