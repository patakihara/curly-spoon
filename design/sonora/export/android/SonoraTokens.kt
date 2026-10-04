// GENERATED — Sonora tokens as Compose values.
// Source: the Sonora design system's tokens/*.css. Do not hand-edit; regenerate with
// export/generate.js when tokens change.
package com.sonora.design

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
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
    val Neutral1000 = Color(0xFF000000)
    val ScrimSoft = Color(0x57000000)
    val Scrim = Color(0x75000000)
    val ScrimStrong = Color(0x8C000000)
    val OnScrim = Color(0xFFFFFFFF)
    val OnScrimTrack = Color(0x47FFFFFF)
    val SliderThumbInk = Color(0xFFFFFFFF)
    val SwitchThumb = Color(0xFFFFFFFF)
    val Accent = Color(0xFF8B5CF6)
    val AccentContrast = Color(0xFFFFFFFF)
    val Play = Color(0xFFF44862)
    val PlayContrast = Color(0xFFFFFFFF)
    val StateError = Color(0xFFFB270D)
    val StateSuccess = Color(0xFF42E477)
    val StateSuccessInk = Color(0xFF000000)
    val StateWarning = Color(0xFFFFCC8B)
    val StateInfo = Color(0xFF9B66E9)
    val ArtTint1Start = Color(0xFF8B5CF6)
    val ArtTint2End = Color(0xFF8B5CF6)
}

/** Theme-dependent colors: build one and pass it down; never read the other theme's. */
data class SonoraColors(
    val accentInk: Color,
    val playInk: Color,
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
    val divider: Color,
    val focusRing: Color,
    val scrollEdge: Color,
    val artGradientStart: Color,
    val artGradientEnd: Color,
    val frontEdge: Color
)

val SonoraDarkColors = SonoraColors(
    accentInk = Color(0xFFA78BFA),
    playInk = Color(0xFFFF7A8D),
    toneProgress = Color(0xFF8B5CF6),
    toneLibrary = Color(0xFFF44862),
    toneRequest = Color(0xFFFFCC8B),
    toneError = Color(0xFFFB270D),
    toneLibraryInk = Color(0xFFFFFFFF),
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
    divider = Color(0x33FFFFFF),
    focusRing = Color(0xFFE1E1E1),
    scrollEdge = Color(0x38FFFFFF),
    artGradientStart = Color(0xFFB6C4FF),
    artGradientEnd = Color(0xFFFFB7DB),
    frontEdge = Color(0x29E1E1E1)
)

val SonoraLightColors = SonoraColors(
    accentInk = Color(0xFF6D28D9),
    playInk = Color(0xFFA8182F),
    toneProgress = Color(0xFF8B5CF6),
    toneLibrary = Color(0xFFF44862),
    toneRequest = Color(0xFFFFCC8B),
    toneError = Color(0xFFFB270D),
    toneLibraryInk = Color(0xFFFFFFFF),
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
    divider = Color(0x2E000000),
    focusRing = Color(0xFF191919),
    scrollEdge = Color(0x2E000000),
    artGradientStart = Color(0xFF4D5C92),
    artGradientEnd = Color(0xFF75546F),
    frontEdge = Color(0x14000000)
)

/** Spacing, icon sizes, radii, and frame measurements. */
object SonoraDimens {
    val space0 = 0.dp
    val spacing2xs = 2.dp
    val spacingXs = 4.dp
    val spacingSm = 8.dp
    val spacingMd = 12.dp
    val spacingLg = 16.dp
    val spacingXl = 20.dp
    val spacing2xl = 24.dp
    val gridGap = 12.dp
    val icon2xs = 14.dp
    val iconXs = 20.dp
    val iconSm = 24.dp
    val iconMd = 28.dp
    val iconLg = 32.dp
    val iconXl = 40.dp
    val controlXs = 32.dp
    val controlSm = 36.dp
    val controlMd = 40.dp
    val controlLg = 44.dp
    val controlXl = 48.dp
    val art2xs = 40.dp
    val artXs = 44.dp
    val artSm = 48.dp
    val artMd = 52.dp
    val artLg = 64.dp
    val artXl = 80.dp
    val art2xl = 96.dp
    val artHeroCompact = 208.dp
    val artHero = 232.dp
    val hairline = 1.dp
    val progressSm = 3.dp
    val progressMd = 5.dp
    val dotSm = 8.dp
    val dotMd = 10.dp
    val badgeSm = 18.dp
    val badgeMd = 24.dp
    val switchHeight = 24.dp
    val switchThumbSize = 18.dp
    val sliderTrack = 4.dp
    val sliderTrackMobile = 8.dp
    val sliderThumb = 12.dp
    val sliderHandle = 20.dp
    val scrollbarWidth = 4.dp
    val scrollbarThumbMin = 32.dp
    val scrollbarInset = 2.dp
    val scrollEdgeFade = 24.dp
    val blurSm = 6.dp
    val gridGutter = 20.dp
    val gridGutterMobile = 8.dp
    val gridMargin = 28.dp
    val gridMarginMobile = 16.dp
    val gridItemMin = 160.dp
    val gridItemMinMobile = 100.dp
    val gridItemMinWide = 240.dp
    val gridItemMinWideMobile = 170.dp
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
    val nowPlayingArtMax = 300.dp
    val nowPlayingPreviewHeight = 204.dp
    val bottomnavHeight = 60.dp
    val miniplayerHeight = 82.dp
    val seekMaxWidth = 480.dp
    val progressMaxWidth = 280.dp
    val timeReadoutWidth = 36.dp
    val cardWidthXs = 116.dp
    val cardWidthSm = 132.dp
    val cardWidthMd = 152.dp
    val cardWidthLg = 176.dp
    val railPillWidth = 56.dp
    val railPillWidthWide = 72.dp
    val menuRowHeight = 44.dp
    val menuMinWidth = 260.dp
    val grabberWidth = 32.dp
    val grabberHeight = 4.dp
    val radius3xs = 2.dp
    val radius2xs = 6.dp
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

/** Motion: the curves, and durations named by role (milliseconds). */
object SonoraMotion {
    val EaseStandard = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
    val EaseLinear = LinearEasing
    const val durationInstant = 70
    const val durationFast = 150
    const val durationQuick = 200
    const val durationMedium = 280
    const val durationSlow = 420
    const val durationSettle = 30
    const val durationLinger = 900
    const val durationSweep = 1500
    const val durationSpin = 1600
    const val durationEqA = 900
    const val durationEqB = 620
    const val durationEqC = 1150
}

/** Interaction states: state-layer opacities over the content colour, and the focus ring. */
object SonoraState {
    val hover = 0.08f
    val focus = 0.1f
    val pressed = 0.1f
    val disabledContainer = 0.12f
    val disabledContent = 0.38f
    val focusRingWidth = 3.dp
    val focusRingOffset = 2.dp
}

/** Stacking: one z scale, named by what sits there. */
object SonoraLayer {
    val raised = 1f
    val overlay = 2f
    val edge = 3f
    val menu = 20f
    val sheet = 30f
    val modalScrim = 40f
    val modal = 41f
}

/** Line-heights as a ratio of the text's own size. */
object SonoraLeading {
    val none = 1.em
    val tight = 1.15.em
    val snug = 1.25.em
    val body = 1.4.em
    val relaxed = 1.5.em
}

/** Letter-spacing as a share of the text's own size. */
object SonoraTracking {
    val label = 0.02.em
    val caps = 0.1.em
    val display = (-0.02).em
}

/** Opacities for content that is present but quieter. */
object SonoraOpacity {
    val dim = 0.45f
    val scrollbar = 0.6f
    val rest = 0.72f
}

/*
 * Not exported — no single Compose equivalent; read these from the CSS:
 *   --surface-overlay-header: linear-gradient(transparent 0%, rgb(0 0 0 / 85%) 100%)
 *   --scrim-accent: color-mix(in srgb, var(--accent) 82%, transparent)
 *   --rail-pill-active: color-mix(in oklab, var(--surface-bg-alt) 90%, var(--accent))
 *   --tint-accent-card: color-mix(in oklch, var(--surface-card) 78%, var(--accent))
 *   --art-tint-1-end: color-mix(in oklch, var(--accent) 45%, var(--art-gradient-end))
 *   --art-tint-4-start: color-mix(in oklch, var(--accent) 52%, var(--art-gradient-start))
 *   --art-tint-4-end: color-mix(in oklch, var(--accent) 42%, var(--art-gradient-end))
 *   --art-tint-2-start: color-mix(in oklch, var(--accent) 62%, var(--neutral-0))
 *   --art-tint-3-start: color-mix(in oklch, var(--accent) 58%, var(--state-warning))
 *   --art-tint-3-end: color-mix(in oklch, var(--accent) 78%, var(--neutral-1000))
 *   --art-tint-5-start: color-mix(in oklch, var(--accent) 82%, var(--neutral-1000))
 *   --art-tint-5-end: color-mix(in oklch, var(--accent) 52%, var(--neutral-0))
 *   --weight-regular: 400
 *   --weight-body: 500
 *   --weight-medium: 600
 *   --weight-strong: 700
 *   --weight-super-strong: 900
 *   --heading-weight: var(--weight-super-strong)
 *   --display-weight: var(--weight-strong)
 *   --display-stretch: 112%
 *   --focus-ring-room: calc(var(--focus-ring-width) + var(--focus-ring-offset))
 *   --grid-columns: 12
 *   --grid-columns-mobile: 3
 *   --grid-item-max-wide-mobile: 1fr
 *   --now-playing-art-width: 76%
 *   --sheet-max-height: 80%
 *   --shelf-arrow-top: 38%
 *   --radius-round: 50%
 *   --shadow-xs: 0 1px 2px rgba(0,0,0,0.05)
 *   --shadow-sm: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)
 *   --shadow-md: 0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)
 *   --shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
 *   --shadow-xl: 0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)
 *   --shadow-xxl: 0 25px 50px rgba(0,0,0,0.25)
 *   --font-body: 'Inter',-apple-system,'Segoe UI',sans-serif
 *   --font-display: 'Archivo','Inter',sans-serif
 *   --font-heading: 'Archivo','Inter',sans-serif
 *   --font-icon: 'Material Symbols Rounded'
 */
