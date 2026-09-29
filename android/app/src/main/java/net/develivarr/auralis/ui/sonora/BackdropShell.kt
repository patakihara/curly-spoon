package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.BackdropShellProps

/** Sonora's BackdropShell, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun BackdropShell(props: BackdropShellProps) {
    SonoraStub(
        "BackdropShell",
        slots = listOf(props.back, props.rail, props.subheader, props.children, props.sheet, props.player),
        root = true,
    )
}
