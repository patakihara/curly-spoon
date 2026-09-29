package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.NowPlayingProps

/** Sonora's NowPlaying, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun NowPlaying(props: NowPlayingProps) {
    SonoraStub(
        "NowPlaying",
        title = props.tab?.let { PLAYER_TABS[it] },
        texts = listOf(props.track?.title, props.track?.artist, props.track?.context),
        slots = listOf(props.children),
        root = true,
    )
}

/** The player's tabs by key, named as Sonora's NowPlaying names them. */
private val PLAYER_TABS = mapOf("now" to "Now playing", "queue" to "Queue", "lyrics" to "Lyrics")
