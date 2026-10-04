package net.develivarr.auralis.ui.sonora

import java.io.File
import net.develivarr.auralis.generated.theme.SonoraDarkColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private val SPECIMENS = listOf("PaletteDark", "PaletteLight", "TypeScale", "Icons")

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

    /** Each themed colour's token name, in the order the generated `SonoraColors` declares it. */
    private fun themed(): List<String> {
        val tokens =
            File("src/main/java/net/develivarr/auralis/generated/theme/SonoraTokens.kt").readText()
        val body = Regex("""data class SonoraColors\((.*?)\n\)""", RegexOption.DOT_MATCHES_ALL)
            .find(tokens)!!.groupValues[1]
        return Regex("""val (\w+): Color""").findAll(body).map { it.groupValues[1] }.toList()
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
    fun `M0_tokens_c each gallery entry past the specimens is a composable in ui sonora`() {
        val components = names.drop(SPECIMENS.size).toSet()
        assertEquals("no composable in ui/sonora", emptySet<String>(), components - composables())
    }

    @Test
    fun `M0_tokens_c the gallery opens with the token specimens`() {
        assertEquals(SPECIMENS, names.take(SPECIMENS.size))
    }

    @Test
    fun `M0_tokens_c a palette swatch is each theme colour under its token name`() {
        val swatches = swatches(SonoraDarkColors).toMap()
        assertTrue("read only ${themed().size} themed colours", themed().size >= 20)
        assertEquals(themed(), swatches.keys.toList())
        assertEquals(SonoraDarkColors.surfaceBg, swatches["surfaceBg"])
        assertEquals(SonoraDarkColors.accentInk, swatches["accentInk"])
    }
}
