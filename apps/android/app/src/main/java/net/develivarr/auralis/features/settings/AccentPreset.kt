package net.develivarr.auralis.features.settings

import androidx.compose.ui.graphics.Color
import net.develivarr.auralis.ui.theme.SonoraAccentPresets

/** One swatch in the Settings accent picker: a [SonoraAccentPresets] color plus a human name for
 * its content description and test tag. */
data class AccentPreset(val label: String, val color: Color)

/**
 * [SonoraAccentPresets] itself is a bare `List<Color>` with no names — deliberately not adding
 * names to it in `ui/theme/Color.kt` for this wave, per its spec ("do not touch Color.kt's
 * existing definitions beyond what is needed to consume them"). These are Sonora's own hue names
 * (`SonoraPalette`'s private `Accent*` property names in that file — Red through Rose, §1.3),
 * paired back onto the presets **by list position**. That positional coupling is the thing to
 * know if [SonoraAccentPresets] is ever reordered or resized; [sonoraAccentPresetOptions]'s own
 * `require` catches a size mismatch loudly rather than silently mis-labelling a swatch.
 */
private val SonoraAccentPresetLabels: List<String> =
    listOf(
        "Red", "Orange", "Amber", "Yellow", "Lime", "Green", "Emerald", "Teal",
        "Cyan", "Sky", "Blue", "Indigo", "Violet", "Purple", "Fuchsia", "Pink", "Rose",
    )

val sonoraAccentPresetOptions: List<AccentPreset> by lazy {
    require(SonoraAccentPresetLabels.size == SonoraAccentPresets.size) {
        "SonoraAccentPresetLabels (${SonoraAccentPresetLabels.size}) no longer matches " +
            "SonoraAccentPresets (${SonoraAccentPresets.size}) — update the label list to match."
    }
    SonoraAccentPresetLabels.zip(SonoraAccentPresets) { label, color -> AccentPreset(label, color) }
}
