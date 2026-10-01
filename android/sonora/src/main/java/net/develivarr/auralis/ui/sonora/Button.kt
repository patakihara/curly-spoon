package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ButtonProps

/** Sonora's Button, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun Button(props: ButtonProps) {
    SonoraStub(
        "Button",
        slots = listOf(props.icon, props.children),
        press = Press(props.onClick, disabled = props.disabled == true),
    )
}
