package net.develivarr.auralis.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Sonora's raw color values (`docs/design/SONORA.md` §1.1–§1.5, §2). Kept as one private object
 * so every literal in the theme layer traces back to a named value in that doc rather than a bare
 * hex sprinkled through the file — [sonoraLightColorScheme], [sonoraDarkColorScheme] and
 * [sonoraAppTokens] below are the only things that read it.
 *
 * Sonora is explicit that Material's tonal-neutral ladder is deliberately not used for surfaces:
 * they come from the flat neutral scale below instead. Only the `--m3-*` *chroma* roles
 * (primary/secondary/tertiary/error) keep Material's palette — see [sonoraDarkColorScheme]'s doc
 * comment for how that split maps onto Compose's [ColorScheme].
 */
private object SonoraPalette {
    // --- Neutral scale (§1.1) — drives the dark theme's surfaces directly. ------------------
    val Neutral950 = Color(0xFF080808)
    val Neutral900 = Color(0xFF0C0C0C)
    val Neutral850 = Color(0xFF141414)
    val Neutral300 = Color(0xFF969696)
    val Neutral50 = Color(0xFFE1E1E1)

    // --- Light surface literals (§1.2, the "-light" namespace) — a SEPARATE, always-static set
    // of properties in Sonora's own source, not neutral-scale-derived; kept separate here too. --
    val SurfaceBgLight = Color(0xFFEBEBEB)
    val SurfaceBgAltLight = Color(0xFFF0F0F0)
    val SurfaceCardLight = Color(0xFFE1E1E1)
    val SurfaceFgLight = Color(0xFF191919)
    val SurfaceFgMutedLight = Color(0xFF505050)
    val SurfaceBorderLight = Color(0x14000000) // rgb(0 0 0 / 8%)
    val SurfaceBorderDark = Color(0x14FFFFFF) // rgb(255 255 255 / 8%)

    // --- Accent (§1.3) — a user-picked color, this is only the default. ---------------------
    val Accent = Color(0xFF8B5CF6)
    val AccentContrast = Color(0xFFFFFFFF)

    // Symphony's 17-hue preset picker (§1.3) — swatches, not fixed brand colors.
    val AccentRed = Color(0xFFEF4444)
    val AccentOrange = Color(0xFFF97316)
    val AccentAmber = Color(0xFFF59E0B)
    val AccentYellow = Color(0xFFEAB308)
    val AccentLime = Color(0xFF84CC16)
    val AccentGreen = Color(0xFF22C55E)
    val AccentEmerald = Color(0xFF10B981)
    val AccentTeal = Color(0xFF14B8A6)
    val AccentCyan = Color(0xFF06B6D4)
    val AccentSky = Color(0xFF0EA5E9)
    val AccentBlue = Color(0xFF3B82F6)
    val AccentIndigo = Color(0xFF6366F1)
    val AccentViolet = Color(0xFF8B5CF6)
    val AccentPurple = Color(0xFFA855F7)
    val AccentFuchsia = Color(0xFFD946EF)
    val AccentPink = Color(0xFFEC4899)
    val AccentRose = Color(0xFFF43F5E)

    // --- Semantic state colors (§1.4) actually used by the five app-level tokens. -----------
    val StateError = Color(0xFFE12F43)
    val StateWarning = Color(0xFFFFCC8B)

    // --- The literal (non-computed) halves of the five app-level tokens Sonora itself doesn't
    // ship (§2). `--accent-ink` (light) is the one computed value — see [accentInkForLight]. ---
    val ToneRequestDark = Color(0xFFFFB7DB)
    val ToneLibraryLight = Color(0xFF6B4300)
    val ToneProgressLight = Color(0xFF7A4A00)
    val ToneRequestLight = Color(0xFF5B3B57)

    // --- `--m3-*` chroma roles (§1.5). --------------------------------------------------------
    val M3PrimaryLight = Color(0xFF4D5C92)
    val M3OnPrimaryLight = Color(0xFFFFFFFF)
    val M3PrimaryContainerLight = Color(0xFFDCE1FF)
    val M3OnPrimaryContainerLight = Color(0xFF354479)
    val M3SecondaryLight = Color(0xFF595D72)
    val M3SecondaryContainerLight = Color(0xFFDEE1F9)
    val M3TertiaryLight = Color(0xFF75546F)
    val M3TertiaryContainerLight = Color(0xFFFFD7F5)
    val M3ErrorLight = Color(0xFFBA1A1A)
    val M3ErrorContainerLight = Color(0xFFFFDAD6)

    val M3PrimaryDark = Color(0xFFB6C4FF)
    val M3OnPrimaryDark = Color(0xFF1D2D61)
    val M3PrimaryContainerDark = Color(0xFF354479)
    val M3OnPrimaryContainerDark = Color(0xFFDCE1FF)
    val M3SecondaryDark = Color(0xFFC2C5DD)
    val M3OnSecondaryDark = Color(0xFF3F434E)
    val M3SecondaryContainerDark = Color(0xFF565A70)
    val M3OnSecondaryContainerDark = Color(0xFFDEE1F9)
    val M3TertiaryDark = Color(0xFFFFB7DB)
    val M3OnTertiaryDark = Color(0xFF472B50)
    val M3TertiaryContainerDark = Color(0xFF603E67)
    val M3OnTertiaryContainerDark = Color(0xFFFFD7F5)
    val M3ErrorDark = Color(0xFFFFB4AB)
    val M3OnErrorDark = Color(0xFF690005)
    val M3ErrorContainerDark = Color(0xFF93000A)
    val M3OnErrorContainerDark = Color(0xFFFFDAD6)

    // --- Three roles SONORA.md §1.5 explicitly flags as undeclared on light `:root` in the
    // vendored source (no --m3-on-secondary / -on-tertiary / -on-error, nor their *-container
    // pairs — read directly from Sonora's own tokens/colors.css, not an omission in that doc's
    // table). Compose's ColorScheme requires a value for every slot, so these six are derived
    // here by contrast against the role/container color they sit on: the declared role/container
    // color decides light-vs-dark text, and the "dark text" half reuses this file's own
    // Neutral900 rather than introducing an unrelated new hex. SONORA.md's own text says to
    // "flag it to whichever wave first needs one of those three on light" — this is that wave.
    val M3OnSecondaryLightDerived = Color(0xFFFFFFFF) // secondary #595d72 is dark -> white text
    val M3OnSecondaryContainerLightDerived = Neutral900 // container #dee1f9 is light -> dark text
    val M3OnTertiaryLightDerived = Color(0xFFFFFFFF) // tertiary #75546f is dark -> white text
    val M3OnTertiaryContainerLightDerived = Neutral900 // container #ffd7f5 is light -> dark text
    val M3OnErrorLightDerived = Color(0xFFFFFFFF) // error #ba1a1a is dark -> white text
    val M3OnErrorContainerLightDerived = Neutral900 // container #ffdad6 is light -> dark text
}

/**
 * Sonora's dark color scheme (the design's default — SONORA.md §1.2, "Dark (default)" column).
 * Chroma roles (primary/secondary/tertiary/error, §1.5) map onto Compose's matching slots
 * directly. Background/surface/outline come from the flat neutral scale instead of Material's
 * tonal ladder: `background`/`onBackground` = `--surface-bg`/`--surface-fg`, `surface`/`onSurface`
 * = `--surface-card`/`--surface-fg` (a card IS Compose's default `surface`), `surfaceVariant`/
 * `onSurfaceVariant` = `--surface-bg-alt`/`--surface-fg-muted`, `outline` = `--surface-border`.
 *
 * Slots SONORA.md never specifies at all — `surfaceTint`, `inverseSurface`/`inverseOnSurface`/
 * `inversePrimary`, `scrim`, the `surfaceContainer*` steps, `outlineVariant`, `surfaceBright`/
 * `surfaceDim` — are left at [darkColorScheme]'s own Material baseline by simply not passing
 * them. That is deliberate, not an oversight: fabricating values for slots the design doesn't
 * name would be indistinguishable from real design values to the next reader, and 16c-1-A's
 * components don't reach any of them yet.
 */
internal fun sonoraDarkColorScheme(): ColorScheme = darkColorScheme(
    primary = SonoraPalette.M3PrimaryDark,
    onPrimary = SonoraPalette.M3OnPrimaryDark,
    primaryContainer = SonoraPalette.M3PrimaryContainerDark,
    onPrimaryContainer = SonoraPalette.M3OnPrimaryContainerDark,
    secondary = SonoraPalette.M3SecondaryDark,
    onSecondary = SonoraPalette.M3OnSecondaryDark,
    secondaryContainer = SonoraPalette.M3SecondaryContainerDark,
    onSecondaryContainer = SonoraPalette.M3OnSecondaryContainerDark,
    tertiary = SonoraPalette.M3TertiaryDark,
    onTertiary = SonoraPalette.M3OnTertiaryDark,
    tertiaryContainer = SonoraPalette.M3TertiaryContainerDark,
    onTertiaryContainer = SonoraPalette.M3OnTertiaryContainerDark,
    error = SonoraPalette.M3ErrorDark,
    onError = SonoraPalette.M3OnErrorDark,
    errorContainer = SonoraPalette.M3ErrorContainerDark,
    onErrorContainer = SonoraPalette.M3OnErrorContainerDark,
    background = SonoraPalette.Neutral900, // --surface-bg
    onBackground = SonoraPalette.Neutral50, // --surface-fg
    surface = SonoraPalette.Neutral850, // --surface-card
    onSurface = SonoraPalette.Neutral50, // --surface-fg
    surfaceVariant = SonoraPalette.Neutral950, // --surface-bg-alt
    onSurfaceVariant = SonoraPalette.Neutral300, // --surface-fg-muted
    outline = SonoraPalette.SurfaceBorderDark, // --surface-border
)

/** Sonora's light color scheme — see [sonoraDarkColorScheme]'s doc comment for the mapping. */
internal fun sonoraLightColorScheme(): ColorScheme = lightColorScheme(
    primary = SonoraPalette.M3PrimaryLight,
    onPrimary = SonoraPalette.M3OnPrimaryLight,
    primaryContainer = SonoraPalette.M3PrimaryContainerLight,
    onPrimaryContainer = SonoraPalette.M3OnPrimaryContainerLight,
    secondary = SonoraPalette.M3SecondaryLight,
    onSecondary = SonoraPalette.M3OnSecondaryLightDerived,
    secondaryContainer = SonoraPalette.M3SecondaryContainerLight,
    onSecondaryContainer = SonoraPalette.M3OnSecondaryContainerLightDerived,
    tertiary = SonoraPalette.M3TertiaryLight,
    onTertiary = SonoraPalette.M3OnTertiaryLightDerived,
    tertiaryContainer = SonoraPalette.M3TertiaryContainerLight,
    onTertiaryContainer = SonoraPalette.M3OnTertiaryContainerLightDerived,
    error = SonoraPalette.M3ErrorLight,
    onError = SonoraPalette.M3OnErrorLightDerived,
    errorContainer = SonoraPalette.M3ErrorContainerLight,
    onErrorContainer = SonoraPalette.M3OnErrorContainerLightDerived,
    background = SonoraPalette.SurfaceBgLight,
    onBackground = SonoraPalette.SurfaceFgLight,
    surface = SonoraPalette.SurfaceCardLight,
    onSurface = SonoraPalette.SurfaceFgLight,
    surfaceVariant = SonoraPalette.SurfaceBgAltLight,
    onSurfaceVariant = SonoraPalette.SurfaceFgMutedLight,
    outline = SonoraPalette.SurfaceBorderLight,
)

/** The default accent (§1.3) — violet, one pick from Symphony's 17-hue preset family below. */
val SonoraDefaultAccent: Color = SonoraPalette.Accent

/** Symphony's 17-hue accent preset picker (§1.3), offered as swatches, not fixed brand colors. */
val SonoraAccentPresets: List<Color> = listOf(
    SonoraPalette.AccentRed,
    SonoraPalette.AccentOrange,
    SonoraPalette.AccentAmber,
    SonoraPalette.AccentYellow,
    SonoraPalette.AccentLime,
    SonoraPalette.AccentGreen,
    SonoraPalette.AccentEmerald,
    SonoraPalette.AccentTeal,
    SonoraPalette.AccentCyan,
    SonoraPalette.AccentSky,
    SonoraPalette.AccentBlue,
    SonoraPalette.AccentIndigo,
    SonoraPalette.AccentViolet,
    SonoraPalette.AccentPurple,
    SonoraPalette.AccentFuchsia,
    SonoraPalette.AccentPink,
    SonoraPalette.AccentRose,
)

/**
 * The five app-level tokens Sonora itself doesn't ship (SONORA.md §2) plus the accent pair,
 * exposed through [LocalSonoraAppTokens] the same way Material's own roles are exposed through
 * `MaterialTheme.colorScheme` — a composable reads [AuralisAppTokens.current], never a raw hex,
 * and a token added later needs no call-site changes.
 */
data class SonoraAppTokens(
    val accent: Color,
    val accentContrast: Color,
    val accentInk: Color,
    val toneLibrary: Color,
    val toneRequest: Color,
    val toneProgress: Color,
    val toneError: Color,
)

private val LocalSonoraAppTokens = staticCompositionLocalOf<SonoraAppTokens> {
    error("No SonoraAppTokens provided — wrap content in AuralisTheme")
}

/** Read-side accessor mirroring `MaterialTheme.colorScheme`'s call shape. */
object AuralisAppTokens {
    val current: SonoraAppTokens
        @Composable get() = LocalSonoraAppTokens.current
}

/** Provides [SonoraAppTokens] to [content] — installed by [AuralisTheme]; not public API. */
@Composable
internal fun ProvideSonoraAppTokens(tokens: SonoraAppTokens, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalSonoraAppTokens provides tokens, content = content)
}

/**
 * Builds [SonoraAppTokens] for the given theme + accent (SONORA.md §2). `--accent-ink` and
 * `--tone-library` in dark mode ARE the accent itself (§2's dark column: both `var(--accent)`),
 * so they track whatever accent is passed in rather than being fixed; `--tone-request` and
 * `--tone-progress` are fixed brand literals unrelated to accent in both themes. Light mode's
 * `--accent-ink` is the one token that has to be computed — see [accentInkForLight].
 */
internal fun sonoraAppTokens(darkTheme: Boolean, accent: Color): SonoraAppTokens =
    if (darkTheme) {
        SonoraAppTokens(
            accent = accent,
            accentContrast = SonoraPalette.AccentContrast,
            accentInk = accent,
            toneLibrary = accent,
            toneRequest = SonoraPalette.ToneRequestDark,
            toneProgress = SonoraPalette.StateWarning,
            toneError = SonoraPalette.StateError,
        )
    } else {
        SonoraAppTokens(
            accent = accent,
            accentContrast = SonoraPalette.AccentContrast,
            accentInk = accentInkForLight(accent),
            toneLibrary = SonoraPalette.ToneLibraryLight,
            toneRequest = SonoraPalette.ToneRequestLight,
            toneProgress = SonoraPalette.ToneProgressLight,
            toneError = SonoraPalette.StateError,
        )
    }
