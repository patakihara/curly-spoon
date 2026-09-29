package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.MediaHeaderProps

/** Sonora's MediaHeader, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun MediaHeader(props: MediaHeaderProps) {
    SonoraStub(
        "MediaHeader",
        texts = listOf(props.kindLabel, props.title, props.subtitle, props.meta, props.partOf),
        slots = listOf(props.rating, props.actions, props.menu),
    )
}
