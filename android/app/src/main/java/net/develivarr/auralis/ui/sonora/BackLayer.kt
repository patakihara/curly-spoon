package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.BackLayerProps

/** Sonora's BackLayer, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun BackLayer(props: BackLayerProps) {
    SonoraStub(
        "BackLayer",
        title = props.title,
        texts = listOf(props.eyebrow, props.search),
        slots = listOf(props.leading, props.trailing, props.controls),
    )
}
