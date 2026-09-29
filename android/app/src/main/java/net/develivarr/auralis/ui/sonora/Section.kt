package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.SectionProps

/** Sonora's Section, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun Section(props: SectionProps) {
    SonoraStub(
        "Section",
        texts = listOf(props.eyebrow, props.title, props.actionText ?: props.actionLabel),
        slots = listOf(props.trailing, props.children),
    )
}
