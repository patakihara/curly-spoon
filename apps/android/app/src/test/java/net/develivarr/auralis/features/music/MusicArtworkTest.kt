package net.develivarr.auralis.features.music

import net.develivarr.auralis.data.model.JellyfinTrack
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

    // --- JellyfinTrack.toSearchUi(baseUrl) — 16e-search-A-2's Fix 1 plumbing ---

    @Test
    fun `toSearchUi builds the same proxied artwork URL as an artist or album row, keyed on the track's own id`() {
        val track = JellyfinTrack(id = "track-driftwave-1", name = "Tidal Lines")

        val ui = track.toSearchUi(baseUrl = "https://auralis.example.com")

        assertEquals("https://auralis.example.com/api/v1/jellyfin/items/track-driftwave-1/artwork", ui.coverUrl)
    }

    @Test
    fun `toSearchUi with no baseUrl argument degrades coverUrl to null — MusicSearchScreen's own call site is unaffected`() {
        val track = JellyfinTrack(id = "track-driftwave-1", name = "Tidal Lines")

        assertNull(track.toSearchUi().coverUrl)
    }
}
