package net.develivarr.auralis.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins `docs/design/screens/SETTINGS.md` §6.3's byte-for-byte target: [SonoraAccentPresets] must
 * match web's `packages/ui/src/tokens/color.ts` `ACCENT_PRESETS` in name, order and hex, exactly
 * — 17 presets, Red through Rose (`docs/design/screens/SETTINGS.md` §2.3 already establishes the
 * two currently agree, cross-checked literal by literal against `Color.kt`'s own
 * `SonoraPalette.Accent*` values). **This test is a pin, not a fix** — nothing here should ever
 * need to change to make it pass; if it fails, either [SonoraAccentPresets] or web's own
 * `ACCENT_PRESETS` has silently drifted, and the fix belongs wherever the drift happened, not in
 * this file.
 *
 * Compared as [Color] values built from the same 0xAARRGGBB literal constructor
 * [SonoraPalette]'s own values use, rather than round-tripping through
 * [net.develivarr.auralis.data.settings.toHexArgb]'s `Float`-channel arithmetic — this avoids any
 * question of float-rounding tolerance entirely, since both sides of the comparison are built the
 * identical way.
 *
 * Runs as a bare JVM unit test: `Color`'s hex-int constructor is plain arithmetic with no
 * `android.graphics` call underneath, the same ceiling
 * `net.develivarr.auralis.data.settings.ThemePreferencesRepositoryTest` already sits at.
 */
class SonoraAccentPresetsTest {
    @Test
    fun `SonoraAccentPresets matches web's ACCENT_PRESETS hex list, Red through Rose, in order`() {
        val expected =
            listOf(
                Color(0xFFEF4444), // Red
                Color(0xFFF97316), // Orange
                Color(0xFFF59E0B), // Amber
                Color(0xFFEAB308), // Yellow
                Color(0xFF84CC16), // Lime
                Color(0xFF22C55E), // Green
                Color(0xFF10B981), // Emerald
                Color(0xFF14B8A6), // Teal
                Color(0xFF06B6D4), // Cyan
                Color(0xFF0EA5E9), // Sky
                Color(0xFF3B82F6), // Blue
                Color(0xFF6366F1), // Indigo
                Color(0xFF8B5CF6), // Violet
                Color(0xFFA855F7), // Purple
                Color(0xFFD946EF), // Fuchsia
                Color(0xFFEC4899), // Pink
                Color(0xFFF43F5E), // Rose
            )

        assertEquals(expected, SonoraAccentPresets)
    }
}
