package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.SortFilterBarProps

/** Sonora's SortFilterBar, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun SortFilterBar(props: SortFilterBarProps) {
    SonoraStub("SortFilterBar", texts = listOf(props.label), slots = listOf(props.trailing))
}
