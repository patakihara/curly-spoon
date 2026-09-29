package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.NowPlayingPageProps

/** Sonora's NowPlayingPage, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun NowPlayingPage(props: NowPlayingPageProps) {
    SonoraStub(
        "NowPlayingPage",
        texts = listOf(props.title, props.artist, props.context),
        slots = listOf(props.children),
    )
}
