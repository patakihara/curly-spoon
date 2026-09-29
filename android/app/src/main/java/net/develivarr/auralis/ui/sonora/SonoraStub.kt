package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import net.develivarr.auralis.generated.theme.SonoraDimens
import net.develivarr.auralis.generated.theme.SonoraLightColors
import net.develivarr.auralis.generated.theme.SonoraType

/**
 * The stand-in body every Android Sonora composable draws until M1 and M2 write its layout in
 * place: a bordered box labelled with the component's name, then its title as a heading, its
 * text props and its slots, top to bottom. A [root] box fills the screen and scrolls. On
 * Sonora's light scheme, so a page's plain `BasicText` children read on it.
 */
@Composable
internal fun SonoraStub(
    name: String,
    title: String? = null,
    texts: List<String?> = emptyList(),
    slots: List<(@Composable () -> Unit)?> = emptyList(),
    root: Boolean = false,
) {
    val colors = SonoraLightColors
    val frame = if (root) {
        Modifier.fillMaxSize().background(colors.surfaceBg).verticalScroll(rememberScrollState())
    } else {
        Modifier.fillMaxWidth()
    }
    Column(
        modifier = frame
            .border(HAIRLINE, colors.surfaceBorder, RoundedCornerShape(SonoraDimens.radiusXs))
            .padding(SonoraDimens.spacingSm),
        verticalArrangement = Arrangement.spacedBy(SonoraDimens.spacingXs),
    ) {
        BasicText(name, style = text(colors.surfaceFgMuted, SonoraType.textXs))
        if (title != null) {
            BasicText(
                title,
                modifier = Modifier.semantics { heading() },
                style = text(colors.surfaceFg, SonoraType.h3Size, SonoraFonts.display),
            )
        }
        texts.filterNotNull().forEach {
            BasicText(it, style = text(colors.surfaceFg, SonoraType.textMd))
        }
        slots.filterNotNull().forEach { slot -> slot() }
    }
}

/** The box's outline. */
private val HAIRLINE = 1.dp

private fun text(color: Color, size: TextUnit, family: FontFamily = SonoraFonts.body) =
    TextStyle(color = color, fontSize = size, fontFamily = family)
