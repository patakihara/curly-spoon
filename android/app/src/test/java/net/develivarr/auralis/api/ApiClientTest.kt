package net.develivarr.auralis.api

import net.develivarr.auralis.auth.MemoryTokenStore
import net.develivarr.auralis.auth.Session
import net.develivarr.auralis.generated.api.Account
import net.develivarr.auralis.generated.api.AppToken
import net.develivarr.auralis.generated.api.TokenBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class ApiClientTest {
    private val server = FakeServer()
    private val session = Session(MemoryTokenStore(token = "bearer-1", deviceId = "device-1"))
    private val api = ApiClient(ServerConfig("http://127.0.0.1:8787/".toHttpUrl()), session, server.client())

    @Test
    fun `every call carries the bearer the app holds`() {
        server.answer = { 200 to ME }
        val me = api.get("api/auth/me", Account.serializer())
        assertEquals("kara", me.username)
        val request = server.seen.single().request
        assertEquals("http://127.0.0.1:8787/api/auth/me", request.url.toString())
        assertEquals("Bearer bearer-1", request.header("Authorization"))
    }

    @Test
    fun `the code swap carries no bearer`() {
        server.answer = { 200 to """{"token":"t","deviceId":"d","expiresAt":1}""" }
        val token = api.appToken(TokenBody(code = "c", codeVerifier = "v".repeat(43)))
        assertEquals(AppToken("t", "d", 1), token)
        val seen = server.seen.single()
        assertEquals("POST", seen.request.method)
        assertNull(seen.request.header("Authorization"))
        assertEquals(
            TokenBody("c", "v".repeat(43)),
            ApiJson.decodeFromString(TokenBody.serializer(), seen.body!!),
        )
    }

    @Test
    fun `a refusal names the server's error`() {
        server.answer = { 400 to """{"error":"bad_code"}""" }
        val refused = assertThrows(ApiException::class.java) {
            api.appToken(TokenBody(code = "c", codeVerifier = "v".repeat(43)))
        }
        assertEquals(400, refused.status)
        assertEquals("bad_code", refused.error)
    }

    @Test
    fun `a 401 signs the app out, keeping its device`() {
        server.answer = { 401 to """{"error":"unauthenticated"}""" }
        assertThrows(ApiException::class.java) { api.get("api/auth/me", Account.serializer()) }
        assertNull(session.token.value)
        assertEquals("device-1", session.deviceId)
    }

    @Test
    fun `a 401 for a token the app has since replaced keeps the new one`() {
        server.answer = {
            session.signedIn(AppToken("bearer-2", "device-1", 1))
            401 to """{"error":"unauthenticated"}"""
        }
        assertThrows(ApiException::class.java) { api.get("api/auth/me", Account.serializer()) }
        assertEquals("bearer-2", session.token.value)
    }

    private companion object {
        const val ME =
            """{"username":"kara","role":"member","deviceId":"device-1","links":[],"later":true}"""
    }
}
