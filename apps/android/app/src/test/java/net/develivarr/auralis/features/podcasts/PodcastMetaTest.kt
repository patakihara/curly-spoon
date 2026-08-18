package net.develivarr.auralis.features.podcasts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Wave 16e-podcast-A. Pins [composePodcastMeta]'s three named cases from
 * `docs/design/screens/PODCAST_DETAIL.md` §5 directly, without going through a Compose render. */
class PodcastMetaTest {
    @Test
    fun `the empty-episodes case omits the whole line`() {
        assertNull(composePodcastMeta(episodeCount = 0, unplayedCount = 0))
    }

    @Test
    fun `the singular-count case says episode, not episodes`() {
        assertEquals("1 episode · 0 unplayed", composePodcastMeta(episodeCount = 1, unplayedCount = 0))
    }

    @Test
    fun `the zero-unplayed case still renders 0, not omitting it`() {
        assertEquals("128 episodes · 0 unplayed", composePodcastMeta(episodeCount = 128, unplayedCount = 0))
    }

    @Test
    fun `a plural episode count with some unplayed composes both numbers in order`() {
        assertEquals("128 episodes · 3 unplayed", composePodcastMeta(episodeCount = 128, unplayedCount = 3))
    }
}
