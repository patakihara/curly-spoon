package net.develivarr.auralis.ui.theme

import androidx.compose.ui.graphics.Color
import kotlin.math.atan2
import kotlin.math.cbrt
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * A from-scratch OKLab/OKLCH implementation. Sonora's `--accent-ink` (light theme) is defined as
 * CSS `color-mix(in oklch, var(--accent) 58%, black)` (see
 * `packages/ui/src/styles/sonora-theme.css`), and there is no Android API for OKLCH color-mix.
 *
 * This has to be a real function, not a baked-in constant, because accent is a **user-picked**
 * color (Symphony's 17-hue preset) — whatever hue a future picker lands on, `accentInk` (light)
 * has to be re-derived exactly the way web derives it, not just for the one default violet this
 * wave ships with.
 *
 * Matrices are Björn Ottosson's reference ones (https://bottosson.github.io/posts/oklab/,
 * public domain), the same conversion the CSS Color 4 spec's `oklch()`/`color-mix(in oklch, …)`
 * is defined in terms of.
 */
private fun srgbChannelToLinear(c: Double): Double =
    if (c <= 0.04045) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)

private fun linearChannelToSrgb(c: Double): Double =
    if (c <= 0.0031308) c * 12.92 else 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055

private data class Oklab(val l: Double, val a: Double, val b: Double)

private data class Oklch(val l: Double, val c: Double, val hDegrees: Double)

private fun Color.toOklab(): Oklab {
    val r = srgbChannelToLinear(red.toDouble())
    val g = srgbChannelToLinear(green.toDouble())
    val b = srgbChannelToLinear(blue.toDouble())

    val l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    val m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    val s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

    val l2 = cbrt(l)
    val m2 = cbrt(m)
    val s2 = cbrt(s)

    return Oklab(
        l = 0.2104542553 * l2 + 0.7936177850 * m2 - 0.0040720468 * s2,
        a = 1.9779984951 * l2 - 2.4285922050 * m2 + 0.4505937099 * s2,
        b = 0.0259040371 * l2 + 0.7827717662 * m2 - 0.8086757660 * s2,
    )
}

private fun Oklab.toOklch(): Oklch {
    val c = hypot(a, b)
    val hDeg = Math.toDegrees(atan2(b, a)).let { if (it < 0) it + 360 else it }
    return Oklch(l, c, hDeg)
}

private fun Oklch.toOklab(): Oklab {
    val hRad = Math.toRadians(hDegrees)
    return Oklab(l, c * cos(hRad), c * sin(hRad))
}

private fun Oklab.toColor(): Color {
    val l2 = l + 0.3963377774 * a + 0.2158037573 * b
    val m2 = l - 0.1055613458 * a - 0.0638541728 * b
    val s2 = l - 0.0894841775 * a - 1.2914855480 * b

    val lLin = l2 * l2 * l2
    val mLin = m2 * m2 * m2
    val sLin = s2 * s2 * s2

    val r = 4.0767416621 * lLin - 3.3077115913 * mLin + 0.2309699292 * sLin
    val g = -1.2684380046 * lLin + 2.6097574011 * mLin - 0.3413193965 * sLin
    val b2 = -0.0041960863 * lLin - 0.7034186147 * mLin + 1.7076147010 * sLin

    fun clamp01(x: Double) = x.coerceIn(0.0, 1.0)

    return Color(
        red = linearChannelToSrgb(clamp01(r)).toFloat(),
        green = linearChannelToSrgb(clamp01(g)).toFloat(),
        blue = linearChannelToSrgb(clamp01(b2)).toFloat(),
        alpha = 1f,
    )
}

/**
 * Mirrors CSS `color-mix(in oklch, colorA <weightA*100>%, colorB)`: interpolates L and C
 * linearly, and resolves hue per the CSS Color 4 "powerless hue" rule — when one endpoint is
 * achromatic (chroma ~0, as pure black is), the mix keeps the *other* endpoint's hue throughout
 * rather than interpolating toward an undefined angle. That rule is exactly what
 * `color-mix(in oklch, var(--accent) 58%, black)` relies on: black contributes no hue, so the
 * mixed color keeps the accent's hue at a lower lightness and chroma.
 */
internal fun mixOklch(colorA: Color, colorB: Color, weightA: Double): Color {
    val a = colorA.toOklab().toOklch()
    val b = colorB.toOklab().toOklch()

    val hue = when {
        a.c > 0.0001 -> a.hDegrees
        b.c > 0.0001 -> b.hDegrees
        else -> 0.0
    }

    val weightB = 1.0 - weightA
    val mixed = Oklch(
        l = a.l * weightA + b.l * weightB,
        c = a.c * weightA + b.c * weightB,
        hDegrees = hue,
    )
    return mixed.toOklab().toColor()
}

/**
 * Sonora's `--accent-ink` (light theme only): `color-mix(in oklch, var(--accent) 58%, black)`
 * (SONORA.md §2, `packages/ui/src/styles/sonora-theme.css`). Dark theme's `--accent-ink` is
 * simply the accent itself and needs no computation — see [sonoraAppTokens].
 */
internal fun accentInkForLight(accent: Color): Color = mixOklch(accent, Color.Black, 0.58)
