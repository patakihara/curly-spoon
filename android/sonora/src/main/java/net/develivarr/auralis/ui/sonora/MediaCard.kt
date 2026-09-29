package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.MediaCardProps

/** Sonora's MediaCard, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun MediaCard(props: MediaCardProps) {
    SonoraStub(
        "MediaCard",
        texts = listOf(props.eyebrow, props.title, props.sub, props.status),
        onClick = props.onClick,
        label = props.title,
        taps = listOf("Request" to props.onRequest),
    )
}
