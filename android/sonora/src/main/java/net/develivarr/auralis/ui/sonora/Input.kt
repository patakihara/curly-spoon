package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.InputProps

/** Sonora's Input, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun Input(props: InputProps) {
    SonoraStub(
        "Input",
        slots = listOf(props.icon),
        field = Field(props.value, props.placeholder, props.onChange, disabled = props.disabled == true),
    )
}
