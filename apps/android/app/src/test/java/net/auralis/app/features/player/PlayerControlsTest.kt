package net.auralis.app.features.player

import androidx.media3.common.Player
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerControlsTest {
    @Test
    fun `nextRepeatMode cycles off to all to one and back to off`() {
        assertEquals(Player.REPEAT_MODE_ALL, nextRepeatMode(Player.REPEAT_MODE_OFF))
        assertEquals(Player.REPEAT_MODE_ONE, nextRepeatMode(Player.REPEAT_MODE_ALL))
        assertEquals(Player.REPEAT_MODE_OFF, nextRepeatMode(Player.REPEAT_MODE_ONE))
    }

    @Test
    fun `nextRepeatMode treats an unknown value as off`() {
        assertEquals(Player.REPEAT_MODE_ALL, nextRepeatMode(-1))
    }

    @Test
    fun `isMusicMediaId is true only for a track- prefixed id`() {
        assertTrue(isMusicMediaId("track:abc123"))
        assertFalse(isMusicMediaId("book:abc123"))
        assertFalse(isMusicMediaId("episode:abc123:ep1"))
        assertFalse(isMusicMediaId(null))
        // Mirrors jellyfinItemIdFromMediaId's own edge case: a bare prefix with nothing after it
        // isn't a real item id.
        assertFalse(isMusicMediaId("track:"))
    }

    @Test
    fun `repeatModeContentDescription is distinct for all three states`() {
        val off = repeatModeContentDescription(Player.REPEAT_MODE_OFF)
        val all = repeatModeContentDescription(Player.REPEAT_MODE_ALL)
        val one = repeatModeContentDescription(Player.REPEAT_MODE_ONE)

        assertTrue(off.contains("off", ignoreCase = true))
        assertTrue(all.contains("all", ignoreCase = true))
        assertTrue(one.contains("one", ignoreCase = true))
        assertTrue(setOf(off, all, one).size == 3)
    }
}
