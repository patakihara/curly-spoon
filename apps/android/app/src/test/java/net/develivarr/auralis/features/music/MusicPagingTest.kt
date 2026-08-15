package net.develivarr.auralis.features.music

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MusicPagingTest {
    @Test
    fun `reports more pages when fewer items are loaded than the upstream total`() {
        assertTrue(hasMoreMusicPages(loadedCount = 40, total = 120))
    }

    @Test
    fun `reports no more pages once every item has been loaded`() {
        assertFalse(hasMoreMusicPages(loadedCount = 120, total = 120))
    }

    @Test
    fun `reports no more pages for an empty, genuinely-empty library`() {
        assertFalse(hasMoreMusicPages(loadedCount = 0, total = 0))
    }

    @Test
    fun `does not loop forever if loadedCount somehow overshoots total`() {
        // Defensive only — a shrinking upstream library between pages could in principle
        // produce this; it must never read as "keep requesting more".
        assertFalse(hasMoreMusicPages(loadedCount = 45, total = 40))
    }
}
