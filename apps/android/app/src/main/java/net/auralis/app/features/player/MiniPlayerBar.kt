package net.auralis.app.features.player

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player

/**
 * A minimal Now Playing surface: title, a play/pause toggle, and — music only — shuffle and
 * repeat (Android wave H). No seek bar, no artwork, no queue — that is later-wave polish.
 *
 * [state]`.isMusic` gates [onToggleShuffle]/[onCycleRepeat]: shuffle on a multi-file audiobook
 * would scramble its chapter order, and repeat-one on a podcast episode is at best odd, so
 * neither control renders for anything but a music item (see [PlayerUiState.Playing]'s own doc
 * comment).
 *
 * Renders every control as text, not an icon: `material-icons-core` (the small icon set bundled
 * as a transitive dependency of `material3` at this project's pinned Compose BOM) was not
 * confirmed to include `Pause` specifically — several sources describe `Icons.Default.Pause` as
 * requiring the separate, ungranted `material-icons-extended` artifact, while `PlayArrow` is
 * more consistently reported as part of the core set. Rather than add a dependency or risk an
 * unresolved reference on one of the icons this wave adds (`Shuffle`, `Repeat`, `RepeatOne`),
 * every control renders as plain text — swap in real icons once `material-icons-extended` is a
 * deliberate, granted addition.
 */
@Composable
fun MiniPlayerBar(
    state: PlayerUiState.Playing,
    onTogglePlayPause: () -> Unit,
    onToggleShuffle: () -> Unit = {},
    onCycleRepeat: () -> Unit = {},
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(state.title, modifier = Modifier.weight(1f), maxLines = 1)
        if (state.isMusic) {
            // A genuine two-state toggle: Role.Switch + stateDescription announce "on"/"off" as
            // a state change, the same pattern net.auralis.app.features.music.FavoriteToggleButton
            // already established for this app's other two-state toggles.
            TextButton(
                onClick = onToggleShuffle,
                modifier =
                    Modifier.semantics {
                        role = Role.Switch
                        stateDescription = if (state.shuffleEnabled) "On" else "Off"
                    },
            ) {
                Text(if (state.shuffleEnabled) "Shuffle: On" else "Shuffle")
            }
            // Repeat has three states, which Role.Switch's boolean stateDescription can't carry
            // — see repeatModeContentDescription's own doc comment — so this control carries a
            // fully-worded contentDescription naming the state directly instead.
            TextButton(
                onClick = onCycleRepeat,
                modifier =
                    Modifier.semantics {
                        contentDescription = repeatModeContentDescription(state.repeatMode)
                    },
            ) {
                Text(
                    when (state.repeatMode) {
                        Player.REPEAT_MODE_ALL -> "Repeat: All"
                        Player.REPEAT_MODE_ONE -> "Repeat: One"
                        else -> "Repeat"
                    },
                )
            }
        }
        TextButton(onClick = onTogglePlayPause) {
            Text(if (state.isPlaying) "Pause" else "Play")
        }
    }
}
