package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.FieldRowProps

/** Sonora's FieldRow, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun FieldRow(props: FieldRowProps) {
    SonoraStub("FieldRow", texts = listOf(props.label, props.value ?: props.placeholder))
}
