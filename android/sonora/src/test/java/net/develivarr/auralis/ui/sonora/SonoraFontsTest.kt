package net.develivarr.auralis.ui.sonora

import net.develivarr.auralis.sonora.R

import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.FontListFontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.ResourceFont
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalTextApi::class)
class SonoraFontsTest {
    private fun fonts(family: Any) = (family as FontListFontFamily).fonts.map { it as ResourceFont }

    private fun axis(font: ResourceFont, name: String) =
        font.variationSettings.settings.single { it.axisName == name }.toVariationValue(null)

    @Test
    fun `body text is Inter at every Sonora weight, each drawn from the weight axis`() {
        val body = fonts(SonoraFonts.body)
        assertEquals(List(5) { R.font.inter }, body.map { it.resId })
        assertEquals(listOf(400, 500, 600, 700, 900), body.map { it.weight.weight })
        assertEquals(listOf(400f, 500f, 600f, 700f, 900f), body.map { axis(it, "wght") })
    }

    @Test
    fun `headings are Archivo at normal width and display text is Archivo at 112 percent`() {
        assertEquals(setOf(R.font.archivo), fonts(SonoraFonts.heading).map { it.resId }.toSet())
        assertEquals(setOf(100f), fonts(SonoraFonts.heading).map { axis(it, "wdth") }.toSet())
        assertEquals(setOf(112f), fonts(SonoraFonts.display).map { axis(it, "wdth") }.toSet())
    }

    @Test
    fun `an icon family sets the icon font's FILL and weight axes`() {
        val filled = fonts(SonoraSymbols.family(fill = true, weight = 500, size = 24f)).single()
        assertEquals(R.font.material_symbols_rounded, filled.resId)
        assertEquals(FontWeight(500), filled.weight)
        assertEquals(1f, axis(filled, "FILL"))
        assertEquals(500f, axis(filled, "wght"))
        val outlined = fonts(SonoraSymbols.family(fill = false, weight = 400, size = 24f)).single()
        assertEquals(0f, axis(outlined, "FILL"))
    }

    @Test
    fun `an icon's optical size follows its size within the font's 20 to 48 range, as the browser's does`() {
        fun opsz(size: Float) =
            axis(fonts(SonoraSymbols.family(fill = false, weight = 400, size = size)).single(), "opsz")
        assertEquals(20f, opsz(16f))
        assertEquals(32f, opsz(32f))
        assertEquals(48f, opsz(64f))
    }
}
