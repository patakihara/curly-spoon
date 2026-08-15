package net.develivarr.auralis.features.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QueueRouterTest {
    @Test
    fun `nothing loaded resolves to None`() {
        val action =
            resolveAdvanceAction(
                finishedContentType = null,
                currentAudiobookItemId = null,
                podcastQueue = createQueueStore(),
                audiobookQueue = createQueueStore(),
            )
        assertEquals(QueueAdvanceAction.None, action)
    }

    @Test
    fun `music never produces an action -- Media3's own playlist already advanced itself`() {
        // STATE_ENDED on a multi-item Media3 playlist only fires once the *last* item finishes,
        // by which point there is nothing left in that playlist for this router to load -- see
        // QueueAdvanceAction.None's own doc comment.
        val action =
            resolveAdvanceAction(
                finishedContentType = QueueContentType.MUSIC,
                currentAudiobookItemId = null,
                podcastQueue = createQueueStore(),
                audiobookQueue = createQueueStore(),
            )
        assertEquals(QueueAdvanceAction.None, action)
    }

    @Test
    fun `podcast with nothing queued resolves to None`() {
        val action =
            resolveAdvanceAction(
                finishedContentType = QueueContentType.PODCAST,
                currentAudiobookItemId = null,
                podcastQueue = createQueueStore(),
                audiobookQueue = createQueueStore(),
            )
        assertEquals(QueueAdvanceAction.None, action)
    }

    @Test
    fun `podcast with a queued episode advances and loads it`() {
        val podcastQueue = createQueueStore<PodcastQueueEntry>()
        podcastQueue.setQueue(
            SimpleQueueState(
                order =
                    listOf(
                        PodcastQueueEntry("show-1", "ep-1", "Episode One", "Show"),
                        PodcastQueueEntry("show-1", "ep-2", "Episode Two", "Show"),
                    ),
                cursor = 0,
            ),
        )

        val action =
            resolveAdvanceAction(
                finishedContentType = QueueContentType.PODCAST,
                currentAudiobookItemId = null,
                podcastQueue = podcastQueue,
                audiobookQueue = createQueueStore(),
            )

        assertEquals(QueueAdvanceAction.LoadPodcastEpisode("show-1", "ep-2"), action)
        assertEquals(1, podcastQueue.state.value?.cursor)
    }

    @Test
    fun `podcast advance does not touch the audiobook queue`() {
        val podcastQueue = createQueueStore<PodcastQueueEntry>()
        podcastQueue.setQueue(
            SimpleQueueState(order = listOf(PodcastQueueEntry("s", "e1", "One", null), PodcastQueueEntry("s", "e2", "Two", null)), cursor = 0),
        )
        val audiobookQueue = createQueueStore<AudiobookQueueEntry>()
        audiobookQueue.setQueue(SimpleQueueState(order = listOf(AudiobookQueueEntry.Item("book-1", "Book")), cursor = 0))

        resolveAdvanceAction(
            finishedContentType = QueueContentType.PODCAST,
            currentAudiobookItemId = null,
            podcastQueue = podcastQueue,
            audiobookQueue = audiobookQueue,
        )

        // Untouched: still cursor 0, nothing advanced past the end of a one-entry queue.
        assertEquals(0, audiobookQueue.state.value?.cursor)
    }

    @Test
    fun `a queued audiobook item loads it, with no seek`() {
        val audiobookQueue = createQueueStore<AudiobookQueueEntry>()
        audiobookQueue.setQueue(
            SimpleQueueState(
                order = listOf(AudiobookQueueEntry.Item("book-1", "Book One"), AudiobookQueueEntry.Item("book-2", "Book Two")),
                cursor = 0,
            ),
        )

        val action =
            resolveAdvanceAction(
                finishedContentType = QueueContentType.AUDIOBOOK,
                currentAudiobookItemId = "book-1",
                podcastQueue = createQueueStore(),
                audiobookQueue = audiobookQueue,
            )

        assertEquals(QueueAdvanceAction.LoadAudiobookItem("book-2", thenSeekToMs = null), action)
    }

    @Test
    fun `a same-book chapter seeks within the current item instead of reloading`() {
        // This is the whole point of the wave: a reload would restart the Audiobookshelf
        // session and corrupt timeListened bookkeeping (docs/HANDOVER.md's progress-sync
        // notes), so a chapter belonging to the book already loaded must never produce a
        // LoadAudiobookItem action.
        val audiobookQueue = createQueueStore<AudiobookQueueEntry>()
        audiobookQueue.setQueue(
            SimpleQueueState(
                order =
                    listOf(
                        AudiobookQueueEntry.Item("book-1", "Book One"),
                        AudiobookQueueEntry.Chapter("book-1", "ch-2", "Chapter 2", "Book One", startMs = 60_000L),
                    ),
                cursor = 0,
            ),
        )

        val action =
            resolveAdvanceAction(
                finishedContentType = QueueContentType.AUDIOBOOK,
                currentAudiobookItemId = "book-1",
                podcastQueue = createQueueStore(),
                audiobookQueue = audiobookQueue,
            )

        assertEquals(QueueAdvanceAction.SeekWithinCurrent(60_000L), action)
    }

    @Test
    fun `a cross-book chapter loads the other book, then seeks to the chapter start`() {
        val audiobookQueue = createQueueStore<AudiobookQueueEntry>()
        audiobookQueue.setQueue(
            SimpleQueueState(
                order =
                    listOf(
                        AudiobookQueueEntry.Item("book-1", "Book One"),
                        AudiobookQueueEntry.Chapter("book-2", "ch-1", "Chapter 1", "Book Two", startMs = 12_000L),
                    ),
                cursor = 0,
            ),
        )

        val action =
            resolveAdvanceAction(
                finishedContentType = QueueContentType.AUDIOBOOK,
                currentAudiobookItemId = "book-1",
                podcastQueue = createQueueStore(),
                audiobookQueue = audiobookQueue,
            )

        assertEquals(QueueAdvanceAction.LoadAudiobookItem("book-2", thenSeekToMs = 12_000L), action)
    }

    @Test
    fun `audiobook with nothing queued resolves to None and currentAudiobookItemId is irrelevant`() {
        val action =
            resolveAdvanceAction(
                finishedContentType = QueueContentType.AUDIOBOOK,
                currentAudiobookItemId = "book-1",
                podcastQueue = createQueueStore(),
                audiobookQueue = createQueueStore(),
            )
        assertEquals(QueueAdvanceAction.None, action)
        assertNull((action as? QueueAdvanceAction.LoadAudiobookItem)?.itemId)
    }
}
