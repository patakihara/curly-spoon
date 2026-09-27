package net.develivarr.auralis.api

import net.develivarr.auralis.generated.api.HealthResponse
import net.develivarr.auralis.generated.api.HealthResponseStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthResponseTest {

    @Test
    fun `reads the health answer the server sends`() {
        val health = ApiJson.decodeFromString(HealthResponse.serializer(), """{"status":"ok"}""")
        assertEquals(HealthResponseStatus.OK, health.status)
    }

    @Test
    fun `ignores a field it does not know`() {
        val health =
            ApiJson.decodeFromString(HealthResponse.serializer(), """{"status":"ok","uptime":3}""")
        assertEquals(HealthResponseStatus.OK, health.status)
    }
}
