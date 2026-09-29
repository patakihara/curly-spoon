package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.OverflowMenuProps

/** Sonora's OverflowMenu, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun OverflowMenu(props: OverflowMenuProps) {
    SonoraStub(
        "OverflowMenu",
        texts = listOf(props.label, props.items.joinToString(" · ") { it.label }),
    )
}
