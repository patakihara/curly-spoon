package net.auralis.app.features.podcasts

import net.auralis.app.data.model.MediaProgress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EpisodeProgressTest {
    private fun progress(
        libraryItemId: String = "item1",
        episodeId: String? = "ep1",
        currentTime: Double = 0.0,
        isFinished: Boolean = false,
    ) = MediaProgress(
        id = "prog1",
        libraryItemId = libraryItemId,
        episodeId = episodeId,
        duration = 100.0,
        currentTime = currentTime,
        progress = currentTime / 100.0,
        isFinished = isFinished,
    )

    @Test
    fun `no record is unplayed`() {
        assertEquals(EpisodeProgressState.UNPLAYED, episodeProgressState(null))
    }

    @Test
    fun `a record with zero currentTime and not finished is unplayed`() {
        assertEquals(EpisodeProgressState.UNPLAYED, episodeProgressState(progress(currentTime = 0.0)))
    }

    @Test
    fun `a record with positive currentTime and not finished is in progress`() {
        assertEquals(EpisodeProgressState.IN_PROGRESS, episodeProgressState(progress(currentTime = 42.0)))
    }

    @Test
    fun `isFinished wins over a stale positive currentTime`() {
        assertEquals(
            EpisodeProgressState.PLAYED,
            episodeProgressState(progress(currentTime = 42.0, isFinished = true)),
        )
    }

    @Test
    fun `isFinished with zero currentTime is still played`() {
        assertEquals(
            EpisodeProgressState.PLAYED,
            episodeProgressState(progress(currentTime = 0.0, isFinished = true)),
        )
    }

    @Test
    fun `findEpisodeProgress matches only the exact item and episode pair`() {
        val all =
            listOf(
                progress(libraryItemId = "item1", episodeId = "ep1"),
                progress(libraryItemId = "item1", episodeId = "ep2"),
                progress(libraryItemId = "item2", episodeId = "ep1"),
            )

        val found = findEpisodeProgress(all, "item1", "ep2")

        assertEquals("ep2", found?.episodeId)
        assertEquals("item1", found?.libraryItemId)
    }

    @Test
    fun `findEpisodeProgress never matches a book's item-level record`() {
        val all = listOf(progress(libraryItemId = "item1", episodeId = null))

        val found = findEpisodeProgress(all, "item1", "ep1")

        assertNull(found)
    }

    @Test
    fun `findEpisodeProgress returns null when nothing matches`() {
        val all = listOf(progress(libraryItemId = "item1", episodeId = "ep1"))

        assertNull(findEpisodeProgress(all, "item1", "ep-missing"))
    }
}
