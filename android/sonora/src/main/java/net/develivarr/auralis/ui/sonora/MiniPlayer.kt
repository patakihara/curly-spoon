package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.MiniPlayerProps

/** Sonora's MiniPlayer, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun MiniPlayer(props: MiniPlayerProps) {
    SonoraStub(
        "MiniPlayer",
        texts = listOf(props.title, props.artist),
        press = Press(props.onOpen),
        label = props.title,
        taps = listOf(
            "Previous" to props.onPrev,
            (if (props.playing == true) "Pause" else "Play") to props.onTogglePlay,
            "Next" to props.onNext,
        ),
    )
}
