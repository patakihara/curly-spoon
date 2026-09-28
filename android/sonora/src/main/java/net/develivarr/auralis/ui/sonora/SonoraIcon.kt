package net.develivarr.auralis.ui.sonora

import net.develivarr.auralis.sonora.R

import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * One Material Symbols Rounded icon, named as Sonora names it: the Compose twin of Sonora's
 * `<span style="font-family:'Material Symbols Rounded'">play_arrow</span>`. The name is a
 * ligature, so it draws as one glyph. [fill] and [weight] are the font's FILL and wght axes, as
 * Sonora's `font-variation-settings: 'FILL' 1, 'wght' 500`. The opsz axis follows [size], as the
 * browser's `font-optical-sizing: auto` does.
 */
@Composable
fun SonoraIcon(
    name: String,
    modifier: Modifier = Modifier,
    size: TextUnit = 24.sp,
    color: Color = Color.Unspecified,
    fill: Boolean = false,
    weight: Int = 400,
) {
    val family = remember(fill, weight, size) { SonoraSymbols.family(fill, weight, size.value) }
    BasicText(
        text = name,
        modifier = modifier,
        style = TextStyle(
            fontFamily = family,
            fontWeight = FontWeight(weight),
            fontSize = size,
            lineHeight = size,
            color = color,
        ),
    )
}

/** The icon font, one family per FILL, weight and optical size setting. */
@OptIn(ExperimentalTextApi::class)
object SonoraSymbols {
    fun family(fill: Boolean, weight: Int, size: Float): FontFamily = FontFamily(
        Font(
            R.font.material_symbols_rounded,
            weight = FontWeight(weight),
            variationSettings = FontVariation.Settings(
                FontVariation.weight(weight),
                FontVariation.Setting("FILL", if (fill) 1f else 0f),
                FontVariation.Setting("opsz", size.coerceIn(20f, 48f)),
            ),
        ),
    )
}
