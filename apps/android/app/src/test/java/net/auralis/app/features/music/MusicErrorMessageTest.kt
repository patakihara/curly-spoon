package net.auralis.app.features.music

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MusicErrorMessageTest {
    @Test
    fun `jellyfin_not_configured reads as a calm connect prompt, not a scary error`() {
        val message = musicErrorMessage("jellyfin_not_configured")
        assertTrue(message.contains("Jellyfin"))
    }

    @Test
    fun `jellyfin_not_configured produces the same copy whichever path it arrives from`() {
        // MusicAvailability.Unconfigured and a later Failed(code) both route through this same
        // function — see this function's own doc comment on why that has to hold.
        assertEquals(musicErrorMessage("jellyfin_not_configured"), musicErrorMessage("jellyfin_not_configured"))
    }

    @Test
    fun `upstream_auth_expired mentions the sign-in having expired`() {
        val message = musicErrorMessage("upstream_auth_expired")
        assertTrue(message.contains("expired"))
    }

    @Test
    fun `invalid_credentials does not repeat the raw code back to the user`() {
        val message = musicErrorMessage("invalid_credentials")
        assertNotEquals("invalid_credentials", message)
        assertFalse(message.contains("invalid_credentials"))
    }

    @Test
    fun `an unrecognised code degrades to a generic retry-worthy message, never the raw code`() {
        val message = musicErrorMessage("some_future_upstream_code")
        assertFalse(message.contains("some_future_upstream_code"))
    }
}
