package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.OverflowMenuItem
import net.develivarr.auralis.generated.ui.OverflowMenuProps

/** Sonora's OverflowMenu, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun OverflowMenu(props: OverflowMenuProps) {
    // The trigger works when a choice can be made; opening it is only reported, not an action.
    val toggle: (() -> Unit)? =
        if (props.onSelect == null) null else ({ props.onOpenChange?.invoke(props.open != true) })
    // An anchor is the trigger in place of the three-dot button, and opens the menu by its own press.
    val trigger: List<Pair<String?, (() -> Unit)?>> =
        if (props.anchor == null) listOf((props.label ?: "More") to toggle) else emptyList()
    SonoraStub(
        "OverflowMenu",
        slots = listOf(props.anchor),
        taps = trigger + menuTaps(props.items, props.onSelect),
    )
}

/**
 * A menu's items as stub taps, each choosing its key, disabled without [onSelect]. A selected item
 * says so in its name, as the web's checked item is announced.
 */
internal fun menuTaps(
    items: List<OverflowMenuItem>,
    onSelect: ((String) -> Unit)?,
): List<Pair<String?, (() -> Unit)?>> =
    items.map { item ->
        val name = if (item.selected == true) "${item.label}, selected" else item.label
        name to onSelect?.let { select -> { select(item.key) } }
    }
