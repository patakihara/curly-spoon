package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.OverflowMenuProps

/** Sonora's OverflowMenu, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun OverflowMenu(props: OverflowMenuProps) {
    // The trigger works when a choice can be made; opening it is only reported, not an action.
    val toggle: (() -> Unit)? =
        if (props.onSelect == null) null else ({ props.onOpenChange?.invoke(props.open != true) })
    SonoraStub(
        "OverflowMenu",
        taps = listOf((props.label ?: "More") to toggle) +
            props.items.map { item -> item.label to props.onSelect?.let { select -> { select(item.key) } } },
    )
}
