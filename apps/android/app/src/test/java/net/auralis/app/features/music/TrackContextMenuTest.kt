package net.auralis.app.features.music

import net.auralis.app.features.player.MusicQueueEntry
import net.auralis.app.features.player.SimpleQueueState
import net.auralis.app.features.player.createQueueStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

    // -- enqueueMusicTrack: the refusal path and the queue-order guarantee ------------------

    @Test
    fun `play next refuses with a message when no music queue is playing`() {
        val musicQueue = createQueueStore<MusicQueueEntry>()
        var message: String? = null
        enqueueMusicTrack(
            musicQueue = musicQueue,
            entry = MusicQueueEntry(itemId = "t1", title = "Track One", artist = "Artist"),
            position = TrackMenuAction.PLAY_NEXT,
            onMessage = { message = it },
        )
        // The refusal must be reported, not silent, and nothing must have been queued.
        assertTrue(message != null && message!!.contains("Track One"))
        assertNull(musicQueue.state.value)
    }

    @Test
    fun `play last refuses with a message when no music queue is playing`() {
        val musicQueue = createQueueStore<MusicQueueEntry>()
        var message: String? = null
        enqueueMusicTrack(
            musicQueue = musicQueue,
            entry = MusicQueueEntry(itemId = "t1", title = "Track One", artist = "Artist"),
            position = TrackMenuAction.PLAY_LAST,
            onMessage = { message = it },
        )
        assertTrue(message != null)
        assertNull(musicQueue.state.value)
    }

    @Test
    fun `play next inserts into an already-playing music queue and reports success`() {
        val musicQueue = createQueueStore<MusicQueueEntry>()
        musicQueue.setQueue(
            SimpleQueueState(
                order = listOf(MusicQueueEntry(itemId = "current", title = "Current", artist = null)),
                cursor = 0,
            ),
        )
        var message: String? = null
        enqueueMusicTrack(
            musicQueue = musicQueue,
            entry = MusicQueueEntry(itemId = "t1", title = "Track One", artist = "Artist"),
            position = TrackMenuAction.PLAY_NEXT,
            onMessage = { message = it },
        )
        assertTrue(message != null && message!!.contains("Track One"))
        // Assert through advance(), not just the order list -- QueueStoreTest's own header
        // records that a state-shape-only assertion pinned a real cursor bug as "correct" for a
        // whole CI round. advance() from cursor 0 must yield the just-queued track next.
        assertEquals(MusicQueueEntry(itemId = "t1", title = "Track One", artist = "Artist"), musicQueue.advance())
    }

    @Test
    fun `play next then play last on an empty queue produces next-then-last order, proven via advance`() {
        val musicQueue = createQueueStore<MusicQueueEntry>()
        // Bootstraps the queue so it counts as "already playing" for the refusal check -- a
        // single already-loaded entry, matching how PlayerViewModel.playQueue seeds it.
        musicQueue.setQueue(
            SimpleQueueState(
                order = listOf(MusicQueueEntry(itemId = "current", title = "Current", artist = null)),
                cursor = 0,
            ),
        )
        val next = MusicQueueEntry(itemId = "next", title = "Next Track", artist = null)
        val last = MusicQueueEntry(itemId = "last", title = "Last Track", artist = null)

        enqueueMusicTrack(musicQueue, next, TrackMenuAction.PLAY_NEXT, onMessage = {})
        enqueueMusicTrack(musicQueue, last, TrackMenuAction.PLAY_LAST, onMessage = {})

        // "Next" must be reached by the very first advance() after the current item, and "last"
        // only after that -- inspecting `.order` alone would not catch a cursor bootstrapped
        // wrong (QueueStore's own recorded defect), so this chains through the real API instead.
        assertEquals(next, musicQueue.advance())
        assertEquals(last, musicQueue.advance())
        assertNull(musicQueue.advance())
    }

    @Test
    fun `go to album and go to artist are never offered as menu actions to enqueueMusicTrack`() {
        // enqueueMusicTrack only handles PLAY_NEXT/PLAY_LAST; a caller passing a navigation
        // action must be a no-op, not a crash -- pins the `else -> return` branch.
        val musicQueue = createQueueStore<MusicQueueEntry>()
        musicQueue.setQueue(SimpleQueueState(order = listOf(MusicQueueEntry("current", "Current", null)), cursor = 0))
        var messaged = false
        enqueueMusicTrack(
            musicQueue = musicQueue,
            entry = MusicQueueEntry(itemId = "t1", title = "Track One", artist = null),
            position = TrackMenuAction.GO_TO_ALBUM,
            onMessage = { messaged = true },
        )
        assertTrue(!messaged)
        assertEquals(
            SimpleQueueState(order = listOf(MusicQueueEntry("current", "Current", null)), cursor = 0),
            musicQueue.state.value,
        )
    }
}
