package net.auralis.app.data.settings

import kotlinx.coroutines.test.runTest
import net.auralis.app.data.network.FakeKeyValueStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServerConfigRepositoryTest {
    @Test
    fun `getBaseUrl returns null when nothing has been set`() =
        runTest {
            val repository = ServerConfigRepository(FakeKeyValueStore())

            assertNull(repository.getBaseUrl())
        }

    @Test
    fun `setBaseUrl then getBaseUrl round-trips the value`() =
        runTest {
            val repository = ServerConfigRepository(FakeKeyValueStore())

            repository.setBaseUrl("https://auralis.example.com")

            assertEquals("https://auralis.example.com", repository.getBaseUrl())
        }
}
