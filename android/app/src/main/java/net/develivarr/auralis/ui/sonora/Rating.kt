package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.RatingProps

/** Sonora's Rating, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun Rating(props: RatingProps) {
    SonoraStub("Rating", texts = listOf(props.value.toString()))
}
