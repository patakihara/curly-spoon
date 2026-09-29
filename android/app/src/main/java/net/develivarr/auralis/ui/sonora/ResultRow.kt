package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ResultRowProps

/** Sonora's ResultRow, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun ResultRow(props: ResultRowProps) {
    SonoraStub(
        "ResultRow",
        texts = listOf(props.title, props.meta, props.detail, props.status),
        slots = listOf(props.trailing),
    )
}
