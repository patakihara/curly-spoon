package net.develivarr.auralis.features.settings

import net.develivarr.auralis.ui.theme.SonoraAccentPresets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AccentPresetTest {
    @Test
    fun `has exactly one labelled option per SonoraAccentPresets entry, in order`() {
        assertEquals(SonoraAccentPresets.size, sonoraAccentPresetOptions.size)
        sonoraAccentPresetOptions.forEachIndexed { index, option ->
            assertEquals(SonoraAccentPresets[index], option.color)
        }
    }

    @Test
    fun `every label is non-blank and unique`() {
        val labels = sonoraAccentPresetOptions.map { it.label }
        assertTrue(labels.all { it.isNotBlank() })
        assertEquals(labels.size, labels.toSet().size)
    }
}
