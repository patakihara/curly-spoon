package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import net.develivarr.auralis.generated.ui.ExpandableTextProps

/**
 * Sonora's ExpandableText, as a stub: M1 and M2 replace its body in place with the real layout.
 * Left without `expanded` it keeps its own state, so its toggle is enabled with no `onToggle`;
 * controlled with no `onToggle`, nothing would move it, so the toggle is disabled.
 */
@Composable
fun ExpandableText(props: ExpandableTextProps) {
    var own by remember { mutableStateOf(false) }
    val controlled = props.expanded != null
    val expanded = if (controlled) props.expanded == true else own
    val toggle: (() -> Unit)? = when {
        controlled -> props.onToggle?.let { onToggle -> { onToggle(!expanded) } }
        else -> ({
            own = !expanded
            props.onToggle?.invoke(!expanded)
        })
    }
    SonoraStub(
        "ExpandableText",
        texts = listOf(props.text),
        slots = listOf(props.children),
        taps = listOf((if (expanded) props.lessLabel ?: "Less" else props.moreLabel ?: "More") to toggle),
    )
}
