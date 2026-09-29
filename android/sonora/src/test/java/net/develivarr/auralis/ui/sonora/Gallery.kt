package net.develivarr.auralis.ui.sonora

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.develivarr.auralis.generated.gallery.componentGallery
import net.develivarr.auralis.generated.gallery.galleryIcons
import net.develivarr.auralis.generated.theme.SonoraColors
import net.develivarr.auralis.generated.theme.SonoraDarkColors
import net.develivarr.auralis.generated.theme.SonoraLightColors
import net.develivarr.auralis.generated.theme.SonoraType

/** One screenshot of the Android gallery: its name, unique, and what it draws. */
class GalleryEntry(val name: String, val content: @Composable () -> Unit) {
    override fun toString() = name
}

/**
 * The Android gallery, one Paparazzi snapshot per entry: the token specimens (each theme's
 * palette, the type scale in Inter and Archivo, the icon font), then every Sonora component, from
 * the generated `componentGallery`, drawn with the usage the web gallery draws it with.
 */
val sonoraGallery: List<GalleryEntry> = listOf(
    GalleryEntry("PaletteDark") { Palette(SonoraDarkColors) },
    GalleryEntry("PaletteLight") { Palette(SonoraLightColors) },
    GalleryEntry("TypeScale") { TypeScale() },
    GalleryEntry("Icons") { Icons() },
) + componentGallery

/** Each colour of a theme by its token name, read off [SonoraColors] in declaration order. */
fun swatches(colors: SonoraColors): List<Pair<String, Color>> =
    SonoraColors::class.java.declaredFields
        .filter {
            !java.lang.reflect.Modifier.isStatic(it.modifiers) &&
                it.type == Long::class.javaPrimitiveType
        }
        .map { field ->
            field.isAccessible = true
            field.name to Color(field.getLong(colors).toULong())
        }

private fun text(color: Color, size: TextUnit, family: FontFamily, weight: Int = 400) =
    TextStyle(color = color, fontSize = size, fontFamily = family, fontWeight = FontWeight(weight))

/** A theme's colours as swatches, each named, on that theme's own surface. */
@Composable
private fun Palette(colors: SonoraColors) {
    Column(
        Modifier.fillMaxSize().background(colors.surfaceBg).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        swatches(colors).forEach { (name, color) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(width = 56.dp, height = 26.dp).background(color))
                BasicText(
                    name,
                    Modifier.padding(start = 12.dp),
                    style = text(colors.surfaceFg, SonoraType.textSm, SonoraFonts.body),
                )
            }
        }
    }
}

/** Sonora's type: the display and heading faces at h1 to h4, the body face at each text size. */
@Composable
private fun TypeScale() {
    val colors = SonoraLightColors
    val ink = colors.surfaceFg
    Column(
        Modifier.fillMaxSize().background(colors.surfaceBg).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        listOf(
            "h1" to SonoraType.h1Size,
            "h2" to SonoraType.h2Size,
            "h3" to SonoraType.h3Size,
            "h4" to SonoraType.h4Size,
        ).forEach { (name, size) ->
            BasicText("Display $name Archivo", style = text(ink, size, SonoraFonts.display, 700))
            BasicText("Heading $name Archivo", style = text(ink, size, SonoraFonts.heading, 700))
        }
        listOf(
            "xs" to SonoraType.textXs,
            "sm" to SonoraType.textSm,
            "md" to SonoraType.textMd,
            "lg" to SonoraType.textLg,
            "xl" to SonoraType.textXl,
            "2xl" to SonoraType.text2xl,
        ).forEach { (name, size) ->
            BasicText("Text $name, Inter the body face", style = text(ink, size, SonoraFonts.body))
        }
        SonoraFonts.weights.forEach { weight ->
            BasicText(
                "Inter at weight $weight",
                style = text(ink, SonoraType.textLg, SonoraFonts.body, weight),
            )
        }
    }
}

/** Every icon the web gallery draws, from the icon font, each over its name. */
@Composable
private fun Icons() {
    val colors = SonoraLightColors
    Column(
        Modifier.fillMaxSize().background(colors.surfaceBg).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        galleryIcons.chunked(4).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { name ->
                    Column(
                        Modifier.width(84.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        SonoraIcon(name, size = 32.sp, color = colors.surfaceFg)
                        BasicText(
                            name,
                            style = text(colors.surfaceFgMuted, SonoraType.textXs, SonoraFonts.body),
                        )
                    }
                }
            }
        }
    }
}
