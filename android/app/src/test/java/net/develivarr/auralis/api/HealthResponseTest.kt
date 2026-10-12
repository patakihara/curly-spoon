package net.develivarr.auralis.api

import net.develivarr.auralis.generated.api.HealthResponse
import net.develivarr.auralis.generated.api.HealthResponseStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HealthResponseTest {

    private val commit = "0123456789abcdef0123456789abcdef01234567"

    @Test
    fun `reads the health answer the server sends, with the commit it was built from`() {
        val health =
            ApiJson.decodeFromString(
                HealthResponse.serializer(),
                """{"status":"ok","commit":"$commit","signOn":true}""",
            )
        assertEquals(HealthResponseStatus.OK, health.status)
        assertEquals(commit, health.commit)
        assertEquals(true, health.signOn)
    }

    @Test
    fun `reads a server built from no commit`() {
        val health =
            ApiJson.decodeFromString(HealthResponse.serializer(), """{"status":"ok","commit":null,"signOn":false}""")
        assertNull(health.commit)
    }

    @Test
    fun `ignores a field it does not know`() {
        val health =
            ApiJson.decodeFromString(
                HealthResponse.serializer(),
                """{"status":"ok","commit":null,"signOn":true,"uptime":3}""",
            )
        assertEquals(HealthResponseStatus.OK, health.status)
    }
}
