package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.MediaHeaderProps

/** Sonora's MediaHeader, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun MediaHeader(props: MediaHeaderProps) {
    SonoraStub(
        "MediaHeader",
        texts = listOf(props.kindLabel, props.title, props.meta),
        slots = listOf(props.rating, props.actions, props.menu),
        links = listOf(props.subtitle to props.onSubtitle, props.partOf to props.onPartOf),
        taps = listOf(
            (props.playLabel ?: "Play") to props.onPlay,
            (props.nextLabel ?: "Play next") to props.onPlayNext,
            "Play last" to props.onPlayLast,
            "Download" to props.onDownload,
            "Add" to props.onAdd,
        ),
    )
}
