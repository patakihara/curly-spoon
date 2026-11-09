package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ResultRowProps

/** Sonora's ResultRow, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun ResultRow(props: ResultRowProps) {
    // The row's second action only while it has a label.
    val next = (props.nextLabel to props.onNext).takeIf { !props.nextLabel.isNullOrEmpty() }
    // The art's action only when given one, never standing in for the row's own tap.
    val art = props.onAction?.let { (props.actionGlyph ?: "Action") to it }
    // As on the web: a row that holds another control (the art's action, Play next, a trailing
    // control, a menu) is no control itself when it has no tap of its own, and takes its tap on the
    // title when it has, so no button sits inside another. A stub cannot tell whether a slot acts,
    // so any trailing control or menu counts; an unbound menu draws its own trigger disabled.
    val slotted = props.trailing != null || props.menu != null
    val split = props.onClick != null && (art != null || next != null || slotted)
    val loose = props.onClick == null && (art != null || next?.second != null || slotted)
    val whole = !split && !loose
    SonoraStub(
        "ResultRow",
        texts = listOf(props.title.takeIf { !split }, props.meta, props.detail, props.status),
        slots = listOf(props.trailing, props.menu),
        press = if (whole) Press(props.onClick) else null,
        label = props.title,
        links = if (split) listOf(props.title to props.onClick) else emptyList(),
        taps = listOfNotNull(art, next),
    )
}
