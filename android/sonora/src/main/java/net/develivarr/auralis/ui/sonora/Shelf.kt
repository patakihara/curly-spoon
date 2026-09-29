package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.ShelfProps

/** Sonora's Shelf, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun Shelf(props: ShelfProps) {
    SonoraStub("Shelf", slots = listOf(props.children))
}
