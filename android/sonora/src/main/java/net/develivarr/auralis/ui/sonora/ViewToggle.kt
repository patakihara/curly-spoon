package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ViewToggleProps
import net.develivarr.auralis.generated.ui.ViewToggleValue

/** Sonora's ViewToggle, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun ViewToggle(props: ViewToggleProps) {
    SonoraStub(
        "ViewToggle",
        tabs = ViewToggleValue.entries.map { view ->
            view.value to props.onChange?.let { change -> { change(view) } }
        },
    )
}
