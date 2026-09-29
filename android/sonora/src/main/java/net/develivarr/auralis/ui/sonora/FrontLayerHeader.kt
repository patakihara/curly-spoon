package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.FrontLayerHeaderProps

/** Sonora's FrontLayerHeader, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun FrontLayerHeader(props: FrontLayerHeaderProps) {
    SonoraStub(
        "FrontLayerHeader",
        texts = listOf(props.spyTitle, props.sections?.mapNotNull { it.title }?.joinToString(" · ")),
        slots = listOf(props.children),
    )
}
