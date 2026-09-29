package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.TabBarProps

/** Sonora's TabBar, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun TabBar(props: TabBarProps) {
    SonoraStub("TabBar", texts = listOf(props.items.joinToString(" · ") { it.label ?: it.key }))
}
