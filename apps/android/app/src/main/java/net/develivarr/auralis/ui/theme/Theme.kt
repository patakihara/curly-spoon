package net.develivarr.auralis.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Wraps content in Sonora's theming (`docs/design/SONORA.md`, wave 16b-2-A —
 * `docs/ROADMAP.md` §16): color, type and shape, replacing Compose's Material defaults.
 *
 * This **replaces** the previous wallpaper-derived Material You palette
 * (`dynamicLightColorScheme`/`dynamicDarkColorScheme`) rather than layering on top of it: Sonora
 * is a fixed design system the app owns, the same way web's `ThemeProvider` doesn't defer to the
 * browser's OS theme for anything beyond light/dark. `darkTheme` still follows
 * [isSystemInDarkTheme] by default — that is Sonora's own light/dark switch, not Material You.
 *
 * [accent] defaults to Sonora's own default (violet, §1.3) and exists as a parameter — not a
 * hardcoded constant — because the design names accent as a **user-picked** color (Symphony's
 * 17-hue preset, [SonoraAccentPresets]); nothing in this wave adds a picker UI, but the seam for
 * one to plug into later is here rather than something a later wave has to retrofit.
 */
@Composable
fun AuralisTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    accent: Color = SonoraDefaultAccent,
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) sonoraDarkColorScheme() else sonoraLightColorScheme()
    val appTokens = sonoraAppTokens(darkTheme = darkTheme, accent = accent)

    ProvideSonoraAppTokens(tokens = appTokens) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = SonoraTypography,
            shapes = SonoraShapes,
            content = content,
        )
    }
}
