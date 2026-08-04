package net.auralis.app.features.podcasts

import net.auralis.app.data.model.PodcastEpisode
import org.junit.Assert.assertEquals
import org.junit.Test

class EpisodeOrderTest {
    private fun episode(
        id: String,
        publishedAt: Long?,
    ) = PodcastEpisode(id = id, title = "Episode $id", duration = 100.0, publishedAt = publishedAt)

    @Test
    fun `newest orders by publishedAt descending`() {
        val episodes = listOf(episode("a", 100L), episode("b", 300L), episode("c", 200L))

        val sorted = sortEpisodes(episodes, EpisodeOrder.NEWEST)

        assertEquals(listOf("b", "c", "a"), sorted.map { it.id })
    }

    @Test
    fun `oldest orders by publishedAt ascending`() {
        val episodes = listOf(episode("a", 100L), episode("b", 300L), episode("c", 200L))

        val sorted = sortEpisodes(episodes, EpisodeOrder.OLDEST)

        assertEquals(listOf("a", "c", "b"), sorted.map { it.id })
    }

    @Test
    fun `undated episodes sort last regardless of direction`() {
        val episodes = listOf(episode("dated", 100L), episode("undated", null))

        assertEquals(listOf("dated", "undated"), sortEpisodes(episodes, EpisodeOrder.NEWEST).map { it.id })
        assertEquals(listOf("dated", "undated"), sortEpisodes(episodes, EpisodeOrder.OLDEST).map { it.id })
    }

    @Test
    fun `two undated episodes are left in their original relative order`() {
        val episodes = listOf(episode("first", null), episode("second", null))

        val sorted = sortEpisodes(episodes, EpisodeOrder.NEWEST)

        assertEquals(listOf("first", "second"), sorted.map { it.id })
    }

    @Test
    fun `default order is newest first`() {
        val episodes = listOf(episode("a", 100L), episode("b", 300L))

        assertEquals(listOf("b", "a"), sortEpisodes(episodes).map { it.id })
    }

    @Test
    fun `does not mutate the input list`() {
        val episodes = listOf(episode("a", 100L), episode("b", 300L))

        sortEpisodes(episodes, EpisodeOrder.NEWEST)

        assertEquals(listOf("a", "b"), episodes.map { it.id })
    }
}
