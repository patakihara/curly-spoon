package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.LyricsPageProps

/** Sonora's LyricsPage, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun LyricsPage(props: LyricsPageProps) {
    SonoraStub(
        "LyricsPage",
        texts = listOf(props.heading, props.title, props.artist) + props.lines.orEmpty(),
        slots = listOf(props.footer),
    )
}
