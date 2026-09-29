package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.EmptyStateProps

/** Sonora's EmptyState, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun EmptyState(props: EmptyStateProps) {
    SonoraStub("EmptyState", texts = listOf(props.title, props.body), slots = listOf(props.action))
}
