package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ButtonGroupProps

/** Sonora's ButtonGroup, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun ButtonGroup(props: ButtonGroupProps) {
    SonoraStub(
        "ButtonGroup",
        tabs = props.items.map { item -> (item.label ?: item.key) to props.onChange?.let { change -> { change(item.key) } } },
        selected = props.items.firstOrNull { it.key == props.value }?.let { it.label ?: it.key },
    )
}
