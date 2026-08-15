package net.develivarr.auralis.features.music

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.FakeKeyValueStore
import net.develivarr.auralis.data.network.SessionCookieJar
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackContextMenuTest {
    // -- buildTrackMenuItems: the pure item-visibility logic --------------------------------

    @Test
    fun `play next and play last always appear`() {
        val items = buildTrackMenuItems(TrackMenuContext(albumId = null, artistId = null))
        assertTrue(items.any { it.action == TrackMenuAction.PLAY_NEXT })
        assertTrue(items.any { it.action == TrackMenuAction.PLAY_LAST })
    }

    @Test
    fun `go to album appears when albumId is present`() {
        val items = buildTrackMenuItems(TrackMenuContext(albumId = "album-1", artistId = null))
        assertTrue(items.any { it.action == TrackMenuAction.GO_TO_ALBUM })
    }

    @Test
    fun `go to album is omitted when albumId is null -- a single has nowhere to navigate to`() {
        val items = buildTrackMenuItems(TrackMenuContext(albumId = null, artistId = null))
        assertTrue(items.none { it.action == TrackMenuAction.GO_TO_ALBUM })
    }

    @Test
    fun `go to artist appears when artistId is present`() {
        val items = buildTrackMenuItems(TrackMenuContext(albumId = null, artistId = "artist-1"))
        assertTrue(items.any { it.action == TrackMenuAction.GO_TO_ARTIST })
    }

    @Test
    fun `go to artist is omitted when artistId is null -- never a fabricated fallback`() {
        // This is the case that matters most: a JellyfinTrack read off a playlist/favourites row
        // never carries its own artistId (see TrackMenuContext's own doc comment), and the fix
        // must be omission, not falling back to some other artist id (that was the recorded
        // album-artist bug, in a different place).
        val items = buildTrackMenuItems(TrackMenuContext(albumId = "album-1", artistId = null))
        assertTrue(items.none { it.action == TrackMenuAction.GO_TO_ARTIST })
    }

    @Test
    fun `both album and artist actions can appear together`() {
        val items = buildTrackMenuItems(TrackMenuContext(albumId = "album-1", artistId = "artist-1"))
        assertEquals(
            listOf(
                TrackMenuAction.PLAY_NEXT,
                TrackMenuAction.PLAY_LAST,
                TrackMenuAction.GO_TO_ALBUM,
                TrackMenuAction.GO_TO_ARTIST,
            ),
            items.map { it.action },
        )
    }

    // -- resolvePlaybackFor: the shape handed to Media3 --------------------------------------
    //
    // enqueueTrackViaMediaController's own insert-or-refuse behaviour is covered in
    // PlayerViewModelEnqueueTest.kt instead: it needs a real PlayerViewModel (currentContentType,
    // activeController) to exercise meaningfully, and that setup already lives in the player
    // package's test files, not here.

    @Test
    fun `resolvePlaybackFor builds a track-prefixed media id and streams from trackStreamUrl`() =
        runTest {
            val mockWebServer = MockWebServer()
            mockWebServer.start()
            val cookieJar = SessionCookieJar(FakeKeyValueStore(), TestScope())
            val httpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
            val apiClient = ApiClient(httpClient, cookieJar) { mockWebServer.url("/").toString() }
            val musicRepository = MusicRepository(apiClient)

            val resolved =
                resolvePlaybackFor(
                    musicRepository,
                    EnqueueableTrack(
                        itemId = "t1",
                        title = "Track One",
                        artist = "Artist",
                        albumOrPlaylistName = "Album",
                        artworkUrl = "https://example.invalid/cover.jpg",
                    ),
                )

            assertEquals("track:t1", resolved.mediaId)
            assertTrue(resolved.uri.endsWith("/jellyfin/tracks/t1/stream"))
            assertEquals("Track One", resolved.title)
            assertEquals("Artist", resolved.artist)
            assertEquals("Album", resolved.subtitle)
            assertEquals("https://example.invalid/cover.jpg", resolved.artworkUrl)
            mockWebServer.shutdown()
        }
}
