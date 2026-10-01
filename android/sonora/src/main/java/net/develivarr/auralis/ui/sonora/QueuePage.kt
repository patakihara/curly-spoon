package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.QueuePageProps

/** Sonora's QueuePage, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun QueuePage(props: QueuePageProps) {
    SonoraStub(
        "QueuePage",
        texts = listOf(props.heading, props.context),
        slots = listOf(props.footer),
        taps = listOf("Clear queue" to props.onClear, "Close queue" to props.onClose),
    )
}
