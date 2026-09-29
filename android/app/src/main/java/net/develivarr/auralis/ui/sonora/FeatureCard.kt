package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.FeatureCardProps

/** Sonora's FeatureCard, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun FeatureCard(props: FeatureCardProps) {
    SonoraStub(
        "FeatureCard",
        texts = listOf(props.kind, props.title, props.meta, props.description),
        slots = listOf(props.preview),
        taps = listOf("Play" to props.onPlay),
    )
}
