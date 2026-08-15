package net.develivarr.auralis.features.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers the pure mapping functions in `QueueUi.kt` (Android wave 12f) — no `MediaController`,
 * no `MediaItem`, no coroutine dispatcher, so nothing here can hit the coroutine-leak/`MockWebServer`
 * traps `docs/HANDOVER.md`'s "Android CI: read this before touching an Android test" section
 * describes; those only bite `PlayerViewModel`-level tests, not this plain-JVM file.
 */
class QueueUiTest {
    @Test
    fun `a podcast queue at cursor -1 marks no row current`() {
        val state =
            SimpleQueueState(
                order = listOf(PodcastQueueEntry("show-1", "ep-1", "Episode One", "Show")),
                cursor = -1,
            )

        val rows = podcastQueueRows(state)

        assertEquals(1, rows.size)
        assertTrue(rows.none { it.isCurrent })
    }

    @Test
    fun `a podcast queue at cursor 1 marks exactly the index-1 row current`() {
        val state =
            SimpleQueueState(
                order =
                    listOf(
                        PodcastQueueEntry("show-1", "ep-1", "Episode One", "Show"),
                        PodcastQueueEntry("show-1", "ep-2", "Episode Two", "Show"),
                        PodcastQueueEntry("show-1", "ep-3", "Episode Three", "Show"),
                    ),
                cursor = 1,
            )

        val rows = podcastQueueRows(state)

        assertEquals(listOf(false, true, false), rows.map { it.isCurrent })
    }

    @Test
    fun `a null podcast queue state yields an empty list, not a crash`() {
        assertEquals(emptyList<QueueRowUi>(), podcastQueueRows(null))
    }

    @Test
    fun `a null audiobook queue state yields an empty list, not a crash`() {
        assertEquals(emptyList<QueueRowUi>(), audiobookQueueRows(null))
    }

    @Test
    fun `every AudiobookQueueEntry variant maps to a row with a non-blank title`() {
        val state =
            SimpleQueueState(
                order =
                    listOf(
                        AudiobookQueueEntry.Item("book-2", "Book Two"),
                        AudiobookQueueEntry.Chapter("book-1", "ch-2", "Chapter 2", "Book One", startMs = 60_000L),
                    ),
                cursor = -1,
            )

        val rows = audiobookQueueRows(state)

        assertEquals(2, rows.size)
        assertTrue(rows.all { it.title.isNotBlank() })
        // The Item variant carries no disambiguating book title -- it has nothing to
        // disambiguate itself from -- while the Chapter variant surfaces its own book as the
        // subtitle so a queued chapter still says which book it belongs to.
        assertNull(rows[0].subtitle)
        assertEquals("Book One", rows[1].subtitle)
    }

    @Test
    fun `an audiobook queue at cursor 1 marks exactly the index-1 row current`() {
        val state =
            SimpleQueueState(
                order =
                    listOf(
                        AudiobookQueueEntry.Item("book-2", "Book Two"),
                        AudiobookQueueEntry.Chapter("book-1", "ch-2", "Chapter 2", "Book One", startMs = 60_000L),
                    ),
                cursor = 1,
            )

        val rows = audiobookQueueRows(state)

        assertEquals(listOf(false, true), rows.map { it.isCurrent })
    }

    @Test
    fun `a Media3 summary list marks the row at currentMediaItemIndex as current`() {
        val items =
            listOf(
                MediaItemSummary("t1", "Track One", "Artist"),
                MediaItemSummary("t2", "Track Two", "Artist"),
                MediaItemSummary("t3", "Track Three", "Artist"),
            )

        val rows = musicQueueRows(items, currentIndex = 2)

        assertEquals(listOf(false, false, true), rows.map { it.isCurrent })
    }

    @Test
    fun `a Media3 summary list marks no row current when currentIndex is -1`() {
        val items = listOf(MediaItemSummary("t1", "Track One", "Artist"))

        val rows = musicQueueRows(items, currentIndex = -1)

        assertTrue(rows.none { it.isCurrent })
    }
}
