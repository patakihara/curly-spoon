package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.BottomNavProps

/** Sonora's BottomNav, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun BottomNav(props: BottomNavProps) {
    SonoraStub(
        "BottomNav",
        tabs = props.items.map { item ->
            item.label to props.onChange?.let { change -> { change(item.key) } }
        },
    )
}
