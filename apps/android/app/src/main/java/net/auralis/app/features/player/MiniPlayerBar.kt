package net.auralis.app.features.player

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * A minimal Now Playing surface: title plus a play/pause toggle. No seek bar, no artwork, no
 * queue — that is later-wave polish.
 *
 * Renders the toggle as text, not an icon: `material-icons-core` (the small icon set bundled as
 * a transitive dependency of `material3` at this project's pinned Compose BOM) was not
 * confirmed to include `Pause` specifically — several sources describe `Icons.Default.Pause` as
 * requiring the separate, ungranted `material-icons-extended` artifact, while `PlayArrow` is
 * more consistently reported as part of the core set. Rather than add a dependency or risk an
 * unresolved reference on one of the two icons, both render as plain text per this wave's spec
 * — swap in real icons once `material-icons-extended` is a deliberate, granted addition.
 */
@Composable
fun MiniPlayerBar(
    state: PlayerUiState.Playing,
    onTogglePlayPause: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(state.title, modifier = Modifier.weight(1f), maxLines = 1)
        TextButton(onClick = onTogglePlayPause) {
            Text(if (state.isPlaying) "Pause" else "Play")
        }
    }
}
