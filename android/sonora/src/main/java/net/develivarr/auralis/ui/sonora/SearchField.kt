package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.SearchFieldProps

/** Sonora's SearchField, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun SearchField(props: SearchFieldProps) {
    SonoraStub("SearchField", texts = listOf(props.value ?: props.placeholder))
}
