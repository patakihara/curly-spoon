package net.develivarr.auralis.auth

import java.security.SecureRandom
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PkceTest {

    @Test
    fun `the challenge is the S256 of the verifier`() {
        // RFC 7636, appendix B.
        assertEquals(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            Pkce.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        )
    }

    @Test
    fun `a verifier is 43 base64url characters, new every time`() {
        val random = SecureRandom()
        val first = Pkce.verifier(random)
        assertTrue(first, Regex("^[A-Za-z0-9_-]{43}$").matches(first))
        assertNotEquals(first, Pkce.verifier(random))
    }
}
