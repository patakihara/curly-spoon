package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ResultRowProps

/** Sonora's ResultRow, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun ResultRow(props: ResultRowProps) {
    SonoraStub(
        "ResultRow",
        texts = listOf(props.title, props.meta, props.detail, props.status),
        slots = listOf(props.trailing, props.menu),
        press = Press(props.onClick),
        label = props.title,
        // The art's action only when given one, never standing in for the row's own tap, and the
        // row's second action only while it has a label.
        taps = listOfNotNull(
            props.onAction?.let { (props.actionGlyph ?: "Action") to it },
            (props.nextLabel to props.onNext).takeIf { !props.nextLabel.isNullOrEmpty() },
        ),
    )
}
