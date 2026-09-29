package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.EpisodeRowProps

/** Sonora's EpisodeRow, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun EpisodeRow(props: EpisodeRowProps) {
    SonoraStub(
        "EpisodeRow",
        texts = listOf(props.title, props.description, props.meta?.joinToString(" · ")),
        slots = listOf(props.actions),
    )
}
