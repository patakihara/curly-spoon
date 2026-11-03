package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.SortFilterBarProps

/** Sonora's SortFilterBar, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun SortFilterBar(props: SortFilterBarProps) {
    val items = props.items
    if (items.isNullOrEmpty()) {
        // No items, or an empty list, is no menu: the bar is the plain control.
        SonoraStub(
            "SortFilterBar",
            texts = listOf(props.label),
            slots = listOf(props.trailing),
            press = Press(props.onClick),
            label = props.label,
        )
    } else {
        // Given items, the bar is their menu: each is a tap that chooses it, disabled without
        // onSelect, and the one whose label is the bar's is the current one unless an item says.
        val marked = items.map { item ->
            if (item.selected == null) item.copy(selected = item.label == props.label) else item
        }
        SonoraStub(
            "SortFilterBar",
            texts = listOf(props.menuLabel ?: "Sort", props.label),
            slots = listOf(props.trailing),
            taps = menuTaps(marked, props.onSelect),
        )
    }
}
