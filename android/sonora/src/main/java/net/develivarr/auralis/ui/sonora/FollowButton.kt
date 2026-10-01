package net.develivarr.auralis.ui.sonora

import androidx.compose.runtime.Composable
import net.develivarr.auralis.generated.ui.FollowButtonProps

/** Sonora's FollowButton, as a stub: M1 and M2 replace its body in place with the real layout. */
@Composable
fun FollowButton(props: FollowButtonProps) {
    val following = props.following == true
    SonoraStub(
        "FollowButton",
        taps = listOf(
            (if (following) props.labels?.on ?: "Following" else props.labels?.off ?: "Follow") to
                props.onChange?.let { change -> { change(!following) } },
        ),
    )
}
