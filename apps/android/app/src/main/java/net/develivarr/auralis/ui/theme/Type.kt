package net.develivarr.auralis.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Sonora's type scale (`docs/design/SONORA.md` §1.8), Feishin's numbers copied exactly. Two
 * rules from the source are encoded directly rather than left for callers to remember:
 * **headings are weight 900 at every size**, and there are **no italics anywhere** — `fontStyle
 * = FontStyle.Normal` is set explicitly on every style below, even though it is also Compose's
 * own default, because "no italics" is a stated design rule here, not an accident of nobody
 * having set one.
 *
 * `--h1`…`--h4` (§1.8's heading table) map onto Compose's four largest text roles —
 * `headlineLarge`/`Medium`/`Small` and `titleLarge` — at their exact size/line-height pairs.
 * `--text-lg`/`-md`/`-sm`/`-xs` (§1.8's body table, paired with the adjacent `--leading-*` row —
 * SONORA.md's own table lists them side by side for exactly this reason) fill the remaining six
 * body/label slots; `labelLarge` reuses the `--text-md`/`--leading-md` pair, matching Material
 * 3's own baseline convention of `labelLarge` sizing the same as `bodyMedium` (distinguished by
 * weight/usage, not scale — Sonora doesn't define a separate label scale). `--text-xl` and above
 * (`text-xl`…`text-5xl`) aren't used: nothing in this wave's spec calls for them, and Sonora's
 * headings are their own dedicated `--h1`–`--h4` tokens, not derived from the generic text scale.
 *
 * `displayLarge`/`Medium`/`Small` and `titleMedium`/`titleSmall` are **not overridden** —
 * SONORA.md names no value for them, so they stay at [Typography]'s own Material baseline rather
 * than being fabricated to fill every slot.
 *
 * `fontFamily` is left unset (null) on every style: bundling Inter/Roboto Flex on Android is
 * explicitly out of scope for this wave (see this wave's report for what it would take), so
 * every style resolves to whatever family the platform already supplies today.
 */
val SonoraTypography = Typography(
    headlineLarge = TextStyle( // --h1-size / --h1-leading (36/44)
        fontWeight = FontWeight.W900,
        fontStyle = FontStyle.Normal,
        fontSize = 36.sp,
        lineHeight = 44.sp,
    ),
    headlineMedium = TextStyle( // --h2-size / --h2-leading (30/38)
        fontWeight = FontWeight.W900,
        fontStyle = FontStyle.Normal,
        fontSize = 30.sp,
        lineHeight = 38.sp,
    ),
    headlineSmall = TextStyle( // --h3-size / --h3-leading (24/32)
        fontWeight = FontWeight.W900,
        fontStyle = FontStyle.Normal,
        fontSize = 24.sp,
        lineHeight = 32.sp,
    ),
    titleLarge = TextStyle( // --h4-size / --h4-leading (20/30)
        fontWeight = FontWeight.W900,
        fontStyle = FontStyle.Normal,
        fontSize = 20.sp,
        lineHeight = 30.sp,
    ),
    bodyLarge = TextStyle( // --text-lg / --leading-lg (16/20)
        fontWeight = FontWeight.Normal,
        fontStyle = FontStyle.Normal,
        fontSize = 16.sp,
        lineHeight = 20.sp,
    ),
    bodyMedium = TextStyle( // --text-md / --leading-md (14/18)
        fontWeight = FontWeight.Normal,
        fontStyle = FontStyle.Normal,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    bodySmall = TextStyle( // --text-sm / --leading-sm (13/16)
        fontWeight = FontWeight.Normal,
        fontStyle = FontStyle.Normal,
        fontSize = 13.sp,
        lineHeight = 16.sp,
    ),
    labelLarge = TextStyle( // --text-md / --leading-md (14/18) — see header comment
        fontWeight = FontWeight.Normal,
        fontStyle = FontStyle.Normal,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    labelMedium = TextStyle( // --text-sm / --leading-sm (13/16)
        fontWeight = FontWeight.Normal,
        fontStyle = FontStyle.Normal,
        fontSize = 13.sp,
        lineHeight = 16.sp,
    ),
    labelSmall = TextStyle( // --text-xs / --leading-xs (11/14)
        fontWeight = FontWeight.Normal,
        fontStyle = FontStyle.Normal,
        fontSize = 11.sp,
        lineHeight = 14.sp,
    ),
)
