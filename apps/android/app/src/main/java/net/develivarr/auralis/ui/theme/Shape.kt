package net.develivarr.auralis.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Sonora's five-step radius scale (`docs/design/SONORA.md` §1.10): 8/16/24/32px plus a pill.
 * Compose's [Shapes] has exactly five slots, so the mapping is 1:1 — `xs`→`extraSmall`,
 * `sm`→`small`, `md`→`medium`, `lg`→`large`, `pill`→`extraLarge` — with no compression needed,
 * unlike the type scale.
 *
 * Sonora's own primitives don't cleanly follow "desktop small / mobile large" (see
 * `docs/design/sonora/primitives/README.md`: `Button.jsx` uses `--radius-pill` at every size,
 * `Card.jsx` uses `--radius-md` regardless of platform) — so this object doesn't try to bias the
 * ramp toward mobile's larger end globally. It only has to make all five values addressable by
 * name; which named shape each component uses is 16c-1-A's call, component by component, the
 * same way it is in Sonora's own source.
 */
val SonoraShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp), // --radius-xs
    small = RoundedCornerShape(16.dp), // --radius-sm
    medium = RoundedCornerShape(24.dp), // --radius-md
    large = RoundedCornerShape(32.dp), // --radius-lg
    extraLarge = RoundedCornerShape(999.dp), // --radius-pill
)
