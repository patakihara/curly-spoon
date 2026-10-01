package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ExpandableTextProps

/** Sonora's ExpandableText, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun ExpandableText(props: ExpandableTextProps) {
    val expanded = props.expanded == true
    SonoraStub(
        "ExpandableText",
        texts = listOf(props.text),
        slots = listOf(props.children),
        taps = listOf(
            (if (expanded) props.lessLabel ?: "Less" else props.moreLabel ?: "More") to
                props.onToggle?.let { toggle -> { toggle(!expanded) } },
        ),
    )
}
