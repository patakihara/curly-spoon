package net.develivarr.auralis

import org.junit.Assert.assertNull
import org.junit.Test

class ReleaseCleartextTest {

    @Test
    fun `a release build allows no cleartext traffic`() {
        assertNull(MergedManifest.applicationAttribute("networkSecurityConfig"))
        assertNull(MergedManifest.applicationAttribute("usesCleartextTraffic"))
    }
}
