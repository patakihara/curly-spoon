package net.develivarr.auralis

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.w3c.dom.Element

class DebugCleartextTest {

    @Test
    fun `a debug build allows cleartext only to the emulator's host and this device`() {
        assertEquals("@xml/network_security_config", MergedManifest.applicationAttribute("networkSecurityConfig"))
        assertNull(MergedManifest.applicationAttribute("usesCleartextTraffic"))

        // Gradle runs unit tests in the module's own folder.
        val config = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File("src/debug/res/xml/network_security_config.xml"))
        val base = config.getElementsByTagName("base-config").item(0) as Element?
        assertEquals("false", base?.getAttribute("cleartextTrafficPermitted"))
        val allowed = config.getElementsByTagName("domain-config").let { configs ->
            (0 until configs.length).map { configs.item(it) as Element }
        }.filter { it.getAttribute("cleartextTrafficPermitted") == "true" }
        val domains = allowed.flatMap { domainConfig ->
            val nodes = domainConfig.getElementsByTagName("domain")
            (0 until nodes.length).map { nodes.item(it).textContent.trim() }
        }
        assertEquals(setOf("10.0.2.2", "127.0.0.1"), domains.toSet())
    }
}
