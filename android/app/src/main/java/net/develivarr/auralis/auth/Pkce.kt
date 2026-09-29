package net.develivarr.auralis.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** PKCE (RFC 7636): the app keeps a verifier and sends only its S256 challenge. */
object Pkce {
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    /** 32 random bytes, base64url: 43 characters, as the server's schema asks. */
    fun verifier(random: SecureRandom): String = randomString(random)

    /** base64url(sha256(verifier)). */
    fun challenge(verifier: String): String =
        encoder.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))

    /** 32 random bytes, base64url. */
    fun randomString(random: SecureRandom): String =
        encoder.encodeToString(ByteArray(32).also { random.nextBytes(it) })
}
