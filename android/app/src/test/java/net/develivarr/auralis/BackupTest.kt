package net.develivarr.auralis

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import net.develivarr.auralis.auth.KeystoreTokenStore
import org.junit.Assert.assertEquals
import org.junit.Test
import org.w3c.dom.Element

class BackupTest {

    @Test
    fun `no backup or device transfer carries the token or a sign-in in flight`() {
        assertEquals("false", MergedManifest.applicationAttribute("allowBackup"))
        assertEquals("@xml/data_extraction_rules", MergedManifest.applicationAttribute("dataExtractionRules"))

        // Gradle runs unit tests in the module's own folder.
        val rules = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File("src/main/res/xml/data_extraction_rules.xml"))
        val secrets = setOf("${KeystoreTokenStore.PREFS}.xml", "${AppGraph.SIGN_IN_PREFS}.xml")
        for (section in listOf("cloud-backup", "device-transfer")) {
            val node = rules.getElementsByTagName(section).item(0) as Element?
                ?: error("no $section section")
            val excludes = node.getElementsByTagName("exclude")
            val excluded = (0 until excludes.length).map { excludes.item(it) as Element }
                .filter { it.getAttribute("domain") == "sharedpref" }
                .map { it.getAttribute("path") }
                .toSet()
            assertEquals(section, secrets, excluded.intersect(secrets))
        }
    }
}
