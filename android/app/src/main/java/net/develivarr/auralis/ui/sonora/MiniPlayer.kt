package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.MiniPlayerProps

/** Sonora's MiniPlayer, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun MiniPlayer(props: MiniPlayerProps) {
    SonoraStub("MiniPlayer", texts = listOf(props.title, props.artist), onClick = props.onOpen)
}
