// GENERATED — Sonora tokens as Compose values.
// Source: the Sonora design system's tokens/*.css. Do not hand-edit; regenerate with
// export/generate.js when tokens change.
package com.sonora.design

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Colors that carry one value regardless of theme. */
object SonoraPalette {
    val Neutral950 = Color(0xFF080808)
    val Neutral900 = Color(0xFF0C0C0C)
    val Neutral850 = Color(0xFF141414)
    val Neutral700 = Color(0xFF2D2D2D)
    val Neutral500 = Color(0xFF5A5A5A)
    val Neutral300 = Color(0xFF969696)
    val Neutral100 = Color(0xFFD7D7D7)
    val Neutral50 = Color(0xFFE1E1E1)
    val Neutral0 = Color(0xFFFFFFFF)
    val ScrimSoft = Color(0x57000000)
    val Scrim = Color(0x75000000)
    val ScrimStrong = Color(0x8C000000)
    val OnScrim = Color(0xFFFFFFFF)
    val Accent = Color(0xFF8B5CF6)
    val AccentContrast = Color(0xFFFFFFFF)
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
    val AccentRose = Color(0xFFF44862)
    val StateError = Color(0xFFE12F43)
    val StateSuccess = Color(0xFF42E477)
    val StateWarning = Color(0xFFFFCC8B)
    val StateInfo = Color(0xFF9B66E9)
}

/** Theme-dependent colors: build one and pass it down; never read the other theme's. */
data class SonoraColors(
    val accentInk: Color,
    val toneProgress: Color,
    val toneLibrary: Color,
    val toneRequest: Color,
    val toneError: Color,
    val toneLibraryInk: Color,
    val toneRequestInk: Color,
    val toneProgressInk: Color,
    val toneErrorInk: Color,
    val surfaceNowPlaying: Color,
    val surfaceNowPlayingFg: Color,
    val surfaceNowPlayingFgMuted: Color,
    val surfaceBg: Color,
    val surfaceBgAlt: Color,
    val surfaceCard: Color,
    val surfaceFg: Color,
    val surfaceFgMuted: Color,
    val surfaceBorder: Color,
    val surfaceHover: Color,
    val artGradientStart: Color,
    val artGradientEnd: Color
)

val SonoraDarkColors = SonoraColors(
    accentInk = Color(0xFFA78BFA),
    toneProgress = Color(0xFF8B5CF6),
    toneLibrary = Color(0xFF42E477),
    toneRequest = Color(0xFFFFCC8B),
    toneError = Color(0xFFE12F43),
    toneLibraryInk = Color(0xFF000000),
    toneRequestInk = Color(0xFF000000),
    toneProgressInk = Color(0xFFFFFFFF),
    toneErrorInk = Color(0xFFFFFFFF),
    surfaceNowPlaying = Color(0xFF462A3D),
    surfaceNowPlayingFg = Color(0xFFFFFFFF),
    surfaceNowPlayingFgMuted = Color(0xC7FFFFFF),
    surfaceBg = Color(0xFF141414),
    surfaceBgAlt = Color(0xFF080808),
    surfaceCard = Color(0xFF1C1B1D),
    surfaceFg = Color(0xFFE1E1E1),
    surfaceFgMuted = Color(0xFF969696),
    surfaceBorder = Color(0x14FFFFFF),
    surfaceHover = Color(0x1AFFFFFF),
    artGradientStart = Color(0xFFB6C4FF),
    artGradientEnd = Color(0xFFFFB7DB)
)

val SonoraLightColors = SonoraColors(
    accentInk = Color(0xFF6D28D9),
    toneProgress = Color(0xFF8B5CF6),
    toneLibrary = Color(0xFF42E477),
    toneRequest = Color(0xFFFFCC8B),
    toneError = Color(0xFFE12F43),
    toneLibraryInk = Color(0xFF000000),
    toneRequestInk = Color(0xFF000000),
    toneProgressInk = Color(0xFFFFFFFF),
    toneErrorInk = Color(0xFFFFFFFF),
    surfaceNowPlaying = Color(0xFFE3CADB),
    surfaceNowPlayingFg = Color(0xFF1F1219),
    surfaceNowPlayingFgMuted = Color(0x9E000000),
    surfaceBg = Color(0xFFF9F6F6),
    surfaceBgAlt = Color(0xFFFFFFFF),
    surfaceCard = Color(0xFFE8E1E1),
    surfaceFg = Color(0xFF191919),
    surfaceFgMuted = Color(0xFF505050),
    surfaceBorder = Color(0x14000000),
    surfaceHover = Color(0x0F000000),
    artGradientStart = Color(0xFF4D5C92),
    artGradientEnd = Color(0xFF75546F)
)

/** Spacing, icon sizes, radii, and frame measurements. */
object SonoraDimens {
    val space0 = 0.dp
    val spacingXs = 4.dp
    val spacingSm = 8.dp
    val spacingMd = 12.dp
    val spacingLg = 16.dp
    val spacingXl = 20.dp
    val spacing2xl = 24.dp
    val gridGap = 12.dp
    val iconXs = 20.dp
    val iconSm = 24.dp
    val iconMd = 28.dp
    val miniplayerAlbumSize = 44.dp
    val gridGutter = 20.dp
    val gridGutterMobile = 8.dp
    val gridMargin = 28.dp
    val gridMarginMobile = 16.dp
    val gridItemMin = 50.dp
    val gridItemMinMobile = 100.dp
    val gridItemMinWide = 240.dp
    val gridItemMinWideMobile = 170.dp
    val gridItemMax = 190.dp
    val gridItemMaxWide = 300.dp
    val gridMaxWidth = 1100.dp
    val gridMaxWidthTiles = 1000.dp
    val gridMaxWidthList = 860.dp
    val gridMaxWidthForm = 640.dp
    val breakpointCompact = 600.dp
    val railWidthExpanded = 268.dp
    val railWidthCollapsed = 108.dp
    val railRowHeight = 56.dp
    val sideSheetWidth = 320.dp
    val contentMinWidth = 620.dp
    val appbarHeight = 96.dp
    val appbarHeightMobile = 60.dp
    val appbarControlsHeight = 60.dp
    val bottomAppBarHeight = 64.dp
    val nowPlayingArtMax = 300.dp
    val nowPlayingPreviewHeight = 204.dp
    val radiusXs = 8.dp
    val radiusSm = 16.dp
    val radiusMd = 24.dp
    val radiusLg = 32.dp
    val radiusPill = 999.dp
}

/** Type scale (rem → sp at 16). */
object SonoraType {
    val textXs = 11.sp
    val textSm = 13.sp
    val textMd = 14.sp
    val textLg = 16.sp
    val textXl = 18.sp
    val text2xl = 20.sp
    val text3xl = 24.sp
    val text4xl = 28.sp
    val text5xl = 32.sp
    val leadingXs = 14.sp
    val leadingSm = 16.sp
    val leadingMd = 18.sp
    val leadingLg = 20.sp
    val leadingXl = 24.sp
    val h1Size = 36.sp
    val h1Leading = 44.sp
    val h2Size = 30.sp
    val h2Leading = 38.sp
    val h3Size = 24.sp
    val h3Leading = 32.sp
    val h4Size = 20.sp
    val h4Leading = 30.sp
    val spaceXs = 4.sp
    val spaceSm = 8.sp
    val spaceMd = 12.sp
    val spaceLg = 16.sp
    val spaceXl = 24.sp
    val space2xl = 32.sp
    val space3xl = 36.sp
    val space4xl = 40.sp
}

/** Motion: one curve, durations named by role (milliseconds). */
object SonoraMotion {
    val EaseStandard = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
    const val durationInstant = 70
    const val durationFast = 150
    const val durationQuick = 200
    const val durationMedium = 280
    const val durationSlow = 420
}

/*
 * Not exported — no single Compose equivalent; read these from the CSS:
 *   --surface-overlay-header: linear-gradient(transparent 0%, rgb(0 0 0 / 85%) 100%)
 *   --weight-body: 500
 *   --weight-strong: 700
 *   --heading-weight: 900
 *   --grid-columns: 12
 *   --grid-columns-mobile: 3
 *   --grid-item-max-mobile: 1fr
 *   --grid-item-max-wide-mobile: 1fr
 *   --shadow-xs: 0 1px 2px rgba(0,0,0,0.05)
 *   --shadow-sm: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)
 *   --shadow-md: 0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)
 *   --shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
 *   --shadow-xl: 0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)
 *   --shadow-xxl: 0 25px 50px rgba(0,0,0,0.25)
 *   --ease-standard: cubic-bezier(.4,0,.2,1)
 *   --font-body: 'Inter',-apple-system,'Segoe UI',sans-serif
 *   --font-display: 'Archivo Black','Archivo','Inter',sans-serif
 *   --font-heading: 'Archivo','Inter',sans-serif
 */
