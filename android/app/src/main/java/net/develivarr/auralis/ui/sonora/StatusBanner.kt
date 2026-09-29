package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.StatusBannerProps

/** Sonora's StatusBanner, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun StatusBanner(props: StatusBannerProps) {
    SonoraStub("StatusBanner", texts = listOf(props.actionLabel), slots = listOf(props.children))
}
