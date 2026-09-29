package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ArtistCardProps

/** Sonora's ArtistCard, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun ArtistCard(props: ArtistCardProps) {
    SonoraStub("ArtistCard", texts = listOf(props.title, props.sub), onClick = props.onClick)
}
