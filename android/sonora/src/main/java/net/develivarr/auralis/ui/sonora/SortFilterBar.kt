package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.SortFilterBarProps

/** Sonora's SortFilterBar, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun SortFilterBar(props: SortFilterBarProps) {
    val items = props.items
    if (items == null) {
        SonoraStub(
            "SortFilterBar",
            texts = listOf(props.label),
            slots = listOf(props.trailing),
            press = Press(props.onClick),
            label = props.label,
        )
    } else {
        // Given items, the bar is their menu: each is a tap that chooses it, disabled without onSelect.
        SonoraStub(
            "SortFilterBar",
            texts = listOf(props.label),
            slots = listOf(props.trailing),
            taps = items.map { item -> item.label to props.onSelect?.let { select -> { select(item.key) } } },
        )
    }
}
