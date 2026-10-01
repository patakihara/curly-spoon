package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.LyricsPageProps
import net.develivarr.auralis.generated.ui.SyncMode

/** Sonora's LyricsPage, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun LyricsPage(props: LyricsPageProps) {
    SonoraStub(
        "LyricsPage",
        texts = listOf(props.heading, props.title, props.artist) + props.lines.orEmpty(),
        slots = listOf(props.footer),
        taps = listOf("Close lyrics" to props.onClose),
        tabs = SYNC_MODES.map { (mode, label) ->
            label to props.onSyncModeChange?.let { change -> { change(mode) } }
        },
    )
}

/** The lyrics sync modes by how the page names them. */
private val SYNC_MODES = listOf(SyncMode.SYNC to "Sync", SyncMode.DOT to "Dot", SyncMode.OFF to "Off")
