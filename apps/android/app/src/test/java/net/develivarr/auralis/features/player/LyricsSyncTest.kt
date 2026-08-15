package net.develivarr.auralis.features.player

import net.develivarr.auralis.data.model.JellyfinLyricLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Exercises [activeLineIndex] directly against boundary positions — not merely "some line is
 * active" — per this repo's own "no tautologies" rule (`docs/HANDOVER.md`'s Android CI section):
 * a test asserting only that *a* line is active would still pass with the `<=`/`break` logic
 * replaced by something wrong.
 */
class LyricsSyncTest {
    private val synced =
        listOf(
            JellyfinLyricLine("Line zero", startSeconds = 0.0),
            JellyfinLyricLine("Line one", startSeconds = 10.0),
            JellyfinLyricLine("Line two", startSeconds = 20.0),
        )

    @Test
    fun `before the first line's start, no line is active`() {
        assertNull(activeLineIndex(synced, positionSeconds = -1.0))
    }

    @Test
    fun `exactly on a line's start, that line becomes active`() {
        assertEquals(1, activeLineIndex(synced, positionSeconds = 10.0))
    }

    @Test
    fun `just before a line's start, the previous line is still active`() {
        assertEquals(0, activeLineIndex(synced, positionSeconds = 9.999))
    }

    @Test
    fun `past the last line's start, the last line stays active`() {
        assertEquals(2, activeLineIndex(synced, positionSeconds = 999.0))
    }

    @Test
    fun `an intro lead-in before line zero's own start reports no active line, not line zero`() {
        val withLeadIn =
            listOf(
                JellyfinLyricLine("Line zero", startSeconds = 5.0),
                JellyfinLyricLine("Line one", startSeconds = 15.0),
            )
        assertNull(activeLineIndex(withLeadIn, positionSeconds = 0.0))
    }

    @Test
    fun `every line unsynced (all null startSeconds) reports no active line at any position`() {
        val unsynced =
            listOf(
                JellyfinLyricLine("Line zero", startSeconds = null),
                JellyfinLyricLine("Line one", startSeconds = null),
            )
        assertNull(activeLineIndex(unsynced, positionSeconds = 0.0))
        assertNull(activeLineIndex(unsynced, positionSeconds = 999.0))
    }

    @Test
    fun `a null startSeconds line is skipped without resetting the running active index`() {
        // Not a shape Jellyfin actually produces (see this file's own module doc comment), but
        // the function must degrade safely rather than crash or mis-highlight if it ever occurs.
        val mixed =
            listOf(
                JellyfinLyricLine("Line zero", startSeconds = 0.0),
                JellyfinLyricLine("Untimed", startSeconds = null),
                JellyfinLyricLine("Line two", startSeconds = 20.0),
            )
        assertEquals(0, activeLineIndex(mixed, positionSeconds = 10.0))
    }

    @Test
    fun `an empty line list reports no active line`() {
        assertNull(activeLineIndex(emptyList(), positionSeconds = 0.0))
    }
}
