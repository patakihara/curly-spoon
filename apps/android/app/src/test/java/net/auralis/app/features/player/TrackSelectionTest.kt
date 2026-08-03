package net.auralis.app.features.player

import net.auralis.app.data.model.AudioTrack
import net.auralis.app.data.model.PlaybackSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TrackSelectionTest {
    private fun track(index: Int) =
        AudioTrack(
            index = index,
            startOffset = 0.0,
            duration = 100.0,
        )

    private fun session(tracks: List<AudioTrack>) =
        PlaybackSession(
            id = "session-1",
            libraryItemId = "item-1",
            mediaType = "book",
            displayTitle = "Test Book",
            duration = 300.0,
            currentTime = 0.0,
            audioTracks = tracks,
            chapters = emptyList(),
        )

    @Test
    fun `returns the index-0 track when tracks are already in index order`() {
        val tracks = listOf(track(0), track(1), track(2))

        val result = firstPlayableTrack(session(tracks))

        assertEquals(0, result?.index)
    }

    @Test
    fun `returns the index-0 track even when list order does not match index order`() {
        val tracks = listOf(track(2), track(0), track(1))

        val result = firstPlayableTrack(session(tracks))

        assertEquals(0, result?.index)
    }

    @Test
    fun `returns null when there are no audio tracks`() {
        val result = firstPlayableTrack(session(emptyList()))

        assertNull(result)
    }
}
