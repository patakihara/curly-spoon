package net.auralis.app.features.music

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [albumPlaybackQueue] is the pure half of [AlbumDetailViewModel.buildQueueFrom] — see that
 * method's own doc comment for why the impure half (reading `uiState`, awaiting
 * `MusicRepository.trackStreamUrl`) is kept separate and untested here.
 */
class AlbumPlaybackQueueTest {
    private val tracks =
        listOf(
            MusicTrackUi(id = "trk1", title = "Airbag", position = "1", durationSeconds = 284L),
            MusicTrackUi(id = "trk2", title = "Paranoid Android", position = "2", durationSeconds = 383L),
            MusicTrackUi(id = "trk3", title = "Subterranean Homesick Alien", position = "3", durationSeconds = 267L),
        )
    private val streamUrls =
        mapOf(
            "trk1" to "https://bff.example.test/api/v1/jellyfin/tracks/trk1/stream",
            "trk2" to "https://bff.example.test/api/v1/jellyfin/tracks/trk2/stream",
            "trk3" to "https://bff.example.test/api/v1/jellyfin/tracks/trk3/stream",
        )

    @Test
    fun `starting from the first track queues every track in order`() {
        val queue =
            albumPlaybackQueue(
                tracks = tracks,
                streamUrls = streamUrls,
                artistName = "Radiohead",
                albumName = "OK Computer",
                artworkUrl = "https://bff.example.test/api/v1/jellyfin/items/alb1/artwork",
            )

        assertEquals(listOf("Airbag", "Paranoid Android", "Subterranean Homesick Alien"), queue.map { it.title })
    }

    @Test
    fun `starting from track N queues N and every track after it, not before it`() {
        // Simulates AlbumDetailViewModel.buildQueueFrom's own slicing: the caller passes only
        // the tapped track onward, not the whole album.
        val fromTrack2 = tracks.subList(1, tracks.size)

        val queue =
            albumPlaybackQueue(
                tracks = fromTrack2,
                streamUrls = streamUrls,
                artistName = "Radiohead",
                albumName = "OK Computer",
                artworkUrl = null,
            )

        assertEquals(listOf("Paranoid Android", "Subterranean Homesick Alien"), queue.map { it.title })
        assertTrue(queue.none { it.title == "Airbag" })
    }

    @Test
    fun `each queued item carries the BFF stream url, mediaId, artist, album and artwork`() {
        val queue =
            albumPlaybackQueue(
                tracks = tracks.subList(0, 1),
                streamUrls = streamUrls,
                artistName = "Radiohead",
                albumName = "OK Computer",
                artworkUrl = "https://bff.example.test/api/v1/jellyfin/items/alb1/artwork",
            )

        val item = queue.single()
        assertEquals("track:trk1", item.mediaId)
        assertEquals("https://bff.example.test/api/v1/jellyfin/tracks/trk1/stream", item.uri)
        assertEquals("Airbag", item.title)
        assertEquals("Radiohead", item.artist)
        assertEquals("OK Computer", item.subtitle)
        assertEquals("https://bff.example.test/api/v1/jellyfin/items/alb1/artwork", item.artworkUrl)
        assertEquals(0L, item.startPositionMs)
    }

    @Test
    fun `the built stream url targets the BFF and carries no upstream token`() {
        val queue =
            albumPlaybackQueue(
                tracks = tracks.subList(0, 1),
                streamUrls = streamUrls,
                artistName = null,
                albumName = "OK Computer",
                artworkUrl = null,
            )

        val uri = queue.single().uri
        assertTrue(uri.startsWith("https://bff.example.test/api/v1/jellyfin/tracks/"))
        assertTrue(uri.endsWith("/stream"))
        assertTrue(!uri.contains("token", ignoreCase = true))
        assertTrue(!uri.contains("api_key", ignoreCase = true))
    }

    @Test
    fun `a track missing from the stream url map is dropped, not played with a blank uri`() {
        val queue =
            albumPlaybackQueue(
                tracks = tracks,
                streamUrls = streamUrls - "trk2",
                artistName = "Radiohead",
                albumName = "OK Computer",
                artworkUrl = null,
            )

        assertEquals(listOf("Airbag", "Subterranean Homesick Alien"), queue.map { it.title })
    }

    @Test
    fun `a null artist or artwork degrades to null metadata, not a crash`() {
        val queue =
            albumPlaybackQueue(
                tracks = tracks.subList(0, 1),
                streamUrls = streamUrls,
                artistName = null,
                albumName = "OK Computer",
                artworkUrl = null,
            )

        assertNull(queue.single().artist)
        assertNull(queue.single().artworkUrl)
    }

    // Regression coverage for the "every queued track shows the album artist" bug: a
    // compilation/various-artists album has tracks whose own `artistNames` genuinely differs
    // from the album-level `artistName` passed in. Deliberately distinct from `tracks`/
    // `streamUrls` above (which are all-Radiohead) so this can't pass with the fix reverted —
    // per this project's own "no tautologies" rule, a fixture where track and album artist
    // happen to agree would pass either way.
    private val compilationTracks =
        listOf(
            MusicTrackUi(
                id = "va1",
                title = "Immigrant Song",
                position = "1",
                durationSeconds = 146L,
                artistNames = "Led Zeppelin",
            ),
            MusicTrackUi(
                id = "va2",
                title = "Kashmir",
                position = "2",
                durationSeconds = 517L,
                artistNames = null, // Jellyfin never populated per-track artists for this one.
            ),
        )
    private val compilationStreamUrls =
        mapOf(
            "va1" to "https://bff.example.test/api/v1/jellyfin/tracks/va1/stream",
            "va2" to "https://bff.example.test/api/v1/jellyfin/tracks/va2/stream",
        )

    @Test
    fun `a track's own artist is used over the album-level artist when present`() {
        val queue =
            albumPlaybackQueue(
                tracks = compilationTracks,
                streamUrls = compilationStreamUrls,
                artistName = "Various Artists",
                albumName = "Best Of Rock",
                artworkUrl = null,
            )

        assertEquals("Led Zeppelin", queue.first { it.mediaId == "track:va1" }.artist)
    }

    @Test
    fun `a track with no artist of its own falls back to the album-level artist`() {
        val queue =
            albumPlaybackQueue(
                tracks = compilationTracks,
                streamUrls = compilationStreamUrls,
                artistName = "Various Artists",
                albumName = "Best Of Rock",
                artworkUrl = null,
            )

        assertEquals("Various Artists", queue.first { it.mediaId == "track:va2" }.artist)
    }

    @Test
    fun `both album-level and per-track artist absent degrades to null, not a crash`() {
        val queue =
            albumPlaybackQueue(
                tracks = listOf(compilationTracks[1]), // artistNames = null
                streamUrls = compilationStreamUrls,
                artistName = null,
                albumName = "Best Of Rock",
                artworkUrl = null,
            )

        assertNull(queue.single().artist)
    }
}
