package net.auralis.app.features.player

import androidx.media3.common.C
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [sliderFraction]/[positionMsFromFraction]/[remainingTimeLabel]/[resolveSubtitle]/
 * [clampSeekTarget] are the pure core of the Now Playing surface (wave 12a-A2) — see
 * [NowPlayingFormat] file's own header for why these are split out from the Compose screen.
 * The degenerate cases (zero/unknown/negative duration, position past the end) are the ones
 * worth pinning: a naive `positionMs.toFloat() / durationMs` would divide by zero or return a
 * value outside `0f..1f` for exactly these inputs.
 */
class NowPlayingFormatTest {
    @Test
    fun `slider fraction is the plain ratio for an ordinary in-range position`() {
        assertEquals(0.25f, sliderFraction(positionMs = 2_500, durationMs = 10_000), 0.0001f)
        assertEquals(0.5f, sliderFraction(positionMs = 5_000, durationMs = 10_000), 0.0001f)
    }

    @Test
    fun `slider fraction is zero for a zero duration, not a division-by-zero crash`() {
        assertEquals(0f, sliderFraction(positionMs = 0, durationMs = 0))
        assertEquals(0f, sliderFraction(positionMs = 5_000, durationMs = 0))
    }

    @Test
    fun `slider fraction is zero for an unknown or negative duration`() {
        assertEquals(0f, sliderFraction(positionMs = 5_000, durationMs = C.TIME_UNSET))
        assertEquals(0f, sliderFraction(positionMs = 5_000, durationMs = -1))
    }

    @Test
    fun `slider fraction clamps to one for a position beyond the duration`() {
        assertEquals(1f, sliderFraction(positionMs = 15_000, durationMs = 10_000))
    }

    @Test
    fun `slider fraction never leaves the zero to one range for any input`() {
        val fraction = sliderFraction(positionMs = -500, durationMs = 10_000)
        assertTrue(fraction in 0f..1f)
    }

    @Test
    fun `position from fraction inverts slider fraction for an ordinary duration`() {
        assertEquals(2_500L, positionMsFromFraction(fraction = 0.25f, durationMs = 10_000))
        assertEquals(10_000L, positionMsFromFraction(fraction = 1f, durationMs = 10_000))
        assertEquals(0L, positionMsFromFraction(fraction = 0f, durationMs = 10_000))
    }

    @Test
    fun `position from fraction is zero for an unknown duration`() {
        assertEquals(0L, positionMsFromFraction(fraction = 0.5f, durationMs = C.TIME_UNSET))
        assertEquals(0L, positionMsFromFraction(fraction = 0.5f, durationMs = 0))
    }

    @Test
    fun `position from fraction clamps a fraction outside zero to one`() {
        assertEquals(10_000L, positionMsFromFraction(fraction = 1.5f, durationMs = 10_000))
        assertEquals(0L, positionMsFromFraction(fraction = -0.5f, durationMs = 10_000))
    }

    @Test
    fun `remaining time counts down from the duration`() {
        assertEquals("-1:15", remainingTimeLabel(positionMs = 45_000, durationMs = 120_000))
        assertEquals("-0:00", remainingTimeLabel(positionMs = 120_000, durationMs = 120_000))
    }

    @Test
    fun `remaining time never goes negative past the end of the item`() {
        assertEquals("-0:00", remainingTimeLabel(positionMs = 130_000, durationMs = 120_000))
    }

    @Test
    fun `remaining time is a placeholder when duration is unknown`() {
        assertEquals("--:--", remainingTimeLabel(positionMs = 45_000, durationMs = C.TIME_UNSET))
        assertEquals("--:--", remainingTimeLabel(positionMs = 45_000, durationMs = 0))
    }

    @Test
    fun `elapsed time formats the plain position, clamped at zero`() {
        assertEquals("0:45", elapsedTimeLabel(45_000))
        assertEquals("0:00", elapsedTimeLabel(-500))
    }

    @Test
    fun `subtitle prefers artist over subtitle when both are present`() {
        assertEquals("J.R.R. Tolkien", resolveSubtitle(artist = "J.R.R. Tolkien", subtitle = "Some Album"))
    }

    @Test
    fun `subtitle falls back to subtitle when artist is absent`() {
        assertEquals("Some Album", resolveSubtitle(artist = null, subtitle = "Some Album"))
        assertEquals("Some Album", resolveSubtitle(artist = "  ", subtitle = "Some Album"))
    }

    @Test
    fun `subtitle is null when neither artist nor subtitle is present`() {
        assertNull(resolveSubtitle(artist = null, subtitle = null))
        assertNull(resolveSubtitle(artist = "", subtitle = null))
    }

    @Test
    fun `clamp seek target skips back without going below zero`() {
        assertEquals(0L, clampSeekTarget(positionMs = 5_000, deltaMs = -10_000, durationMs = 120_000))
        assertEquals(35_000L, clampSeekTarget(positionMs = 45_000, deltaMs = -10_000, durationMs = 120_000))
    }

    @Test
    fun `clamp seek target skips forward without exceeding a known duration`() {
        assertEquals(120_000L, clampSeekTarget(positionMs = 110_000, deltaMs = 30_000, durationMs = 120_000))
        assertEquals(75_000L, clampSeekTarget(positionMs = 45_000, deltaMs = 30_000, durationMs = 120_000))
    }

    @Test
    fun `clamp seek target does not clamp the high end when duration is unknown`() {
        assertEquals(35_000L, clampSeekTarget(positionMs = 5_000, deltaMs = 30_000, durationMs = C.TIME_UNSET))
    }
}
