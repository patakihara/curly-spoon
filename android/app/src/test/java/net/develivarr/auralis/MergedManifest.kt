package net.develivarr.auralis

import java.io.File
import java.util.Properties
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

/**
 * The manifest Gradle merged for the variant under test, as the unit test config AGP writes for
 * Robolectric names it: what the APK built from this variant will declare.
 */
object MergedManifest {
    private const val ANDROID = "http://schemas.android.com/apk/res/android"

    /** The `<application>` element's `android:` attribute [name], or null when it is not set. */
    fun applicationAttribute(name: String): String? {
        val config = Properties().apply {
            val stream = javaClass.classLoader!!.getResourceAsStream("com/android/tools/test_config.properties")
                ?: error("no AGP unit test config: is includeAndroidResources on?")
            stream.use { load(it) }
        }
        val file = File(config.getProperty("android_merged_manifest") ?: error("no merged manifest named"))
        val document = DocumentBuilderFactory.newInstance()
            .apply { isNamespaceAware = true }
            .newDocumentBuilder()
            .parse(file)
        val application = document.getElementsByTagName("application").item(0) as Element
        return application.getAttributeNS(ANDROID, name).ifEmpty { null }
    }
}
