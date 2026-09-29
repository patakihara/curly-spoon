package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.IconButtonProps

/** Sonora's IconButton, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun IconButton(props: IconButtonProps) {
    SonoraStub("IconButton", texts = listOf(props.label), slots = listOf(props.children))
}
