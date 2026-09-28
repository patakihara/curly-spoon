package net.develivarr.auralis.ui.sonora

import net.develivarr.auralis.sonora.R

import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight

/**
 * Sonora's text families, from the variable TTFs in `res/font`. The token export leaves fonts,
 * weights and the display stretch to the CSS (see SonoraTokens.kt's "Not exported" list), so
 * they are named here after the CSS tokens they mirror.
 */
@OptIn(ExperimentalTextApi::class)
object SonoraFonts {
    /** `--weight-regular`, `-body`, `-medium`, `-strong` and `-super-strong`. */
    val weights: List<Int> = listOf(400, 500, 600, 700, 900)

    /** `--display-stretch`: the display face is Archivo's width axis at 112%. */
    const val DISPLAY_STRETCH: Float = 112f

    /** `--font-body`: Inter. */
    val body: FontFamily = FontFamily(
        weights.map { w ->
            Font(
                R.font.inter,
                weight = FontWeight(w),
                variationSettings = FontVariation.Settings(FontVariation.weight(w)),
            )
        },
    )

    /** `--font-heading`: Archivo at its normal width. */
    val heading: FontFamily = archivo(width = 100f)

    /** `--font-display`: Archivo, wider. */
    val display: FontFamily = archivo(width = DISPLAY_STRETCH)

    private fun archivo(width: Float): FontFamily = FontFamily(
        weights.map { w ->
            Font(
                R.font.archivo,
                weight = FontWeight(w),
                variationSettings = FontVariation.Settings(
                    FontVariation.weight(w),
                    FontVariation.width(width),
                ),
            )
        },
    )
}
