package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.AboutCardProps

/** Sonora's AboutCard, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun AboutCard(props: AboutCardProps) {
    SonoraStub(
        "AboutCard",
        texts = listOf(props.title, props.heading, props.meta, props.body),
        slots = listOf(props.action, props.badge),
    )
}
