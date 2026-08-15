package net.develivarr.auralis

import net.develivarr.auralis.util.formatDuration
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Plain JVM unit test — no Robolectric/instrumentation needed since formatDuration is pure
 * arithmetic. Its real purpose in Phase 5a is proving `gradle test` is wired up at all.
 */
class ExampleUnitTest {
    @Test
    fun `formats durations under an hour as m colon ss`() {
        assertEquals("2:03", formatDuration(123))
    }

    @Test
    fun `formats durations of an hour or more as h colon mm colon ss`() {
        assertEquals("1:02:03", formatDuration(3723))
    }

    @Test
    fun `formats zero as zero colon zero zero`() {
        assertEquals("0:00", formatDuration(0))
    }

    @Test
    fun `clamps negative input to zero instead of throwing`() {
        assertEquals("0:00", formatDuration(-42))
    }
}
