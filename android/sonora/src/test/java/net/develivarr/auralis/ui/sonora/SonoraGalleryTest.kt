package net.develivarr.auralis.ui.sonora

import java.io.File
import net.develivarr.auralis.generated.theme.SonoraDarkColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SonoraGalleryTest {
    private val names = sonoraGallery.map { it.name }

    /** Every Sonora component composable in `ui/sonora`, the module's `Sonora…` primitives aside. */
    private fun composables(): Set<String> {
        val declared = Regex("""(?m)^@Composable\s+fun (\w+)\(""")
        return File("src/main/java/net/develivarr/auralis/ui/sonora")
            .listFiles { f -> f.name.endsWith(".kt") }!!
            .flatMap { file -> declared.findAll(file.readText()).map { it.groupValues[1] } }
            .filterNot { it.startsWith("Sonora") }
            .toSet()
    }

    @Test
    fun `M0_tokens_c the gallery names are unique and not blank`() {
        assertTrue(names.none { it.isBlank() })
        assertEquals(names.groupBy { it }.filterValues { it.size > 1 }.keys, emptySet<String>())
    }

    @Test
    fun `M0_tokens_c every Sonora composable in ui sonora is in the gallery`() {
        val found = composables()
        assertTrue("read only ${found.size} composables", found.size >= 40)
        assertEquals("not in the gallery", emptySet<String>(), found - names.toSet())
    }

    @Test
    fun `M0_tokens_c the gallery opens with the token specimens`() {
        assertEquals(listOf("PaletteDark", "PaletteLight", "TypeScale", "Icons"), names.take(4))
    }

    @Test
    fun `M0_tokens_c a palette swatch is each theme colour under its token name`() {
        val swatches = swatches(SonoraDarkColors).toMap()
        assertEquals(24, swatches.size)
        assertEquals(SonoraDarkColors.surfaceBg, swatches["surfaceBg"])
        assertEquals(SonoraDarkColors.accentInk, swatches["accentInk"])
    }
}
