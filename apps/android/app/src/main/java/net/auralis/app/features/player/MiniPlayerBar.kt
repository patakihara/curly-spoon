package net.auralis.app.features.player

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
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
 * The persistent mini player: title, a play/pause toggle, and — music only — shuffle, repeat
 * and lyrics (Android wave H/J). Tapping anywhere on the bar other than a control
 * ([onExpand]) opens [NowPlayingScreen] (Android wave 12a-A2) — the same
 * "tap the collapsed surface to expand it" convention this project's references
 * (YouTube Music, Spotify) both use.
 *
 * Renders every control as a real icon now that `material-icons-extended` is a granted
 * dependency (wave 12a-A1) — see this file's own git history for why it used to render plain
 * text: the icon set's availability, not the design, was the blocker.
 *
 * [state]`.isMusic` still gates [onToggleShuffle]/[onCycleRepeat]/[onOpenLyrics]: shuffle on a
 * multi-file audiobook would scramble its chapter order, repeat-one on a podcast episode is at
 * best odd, and only music has a Jellyfin lyrics endpoint to call — see [PlayerUiState.Playing]'s
 * own doc comment.
 */
@Composable
fun MiniPlayerBar(
    state: PlayerUiState.Playing,
    onTogglePlayPause: () -> Unit,
    onToggleShuffle: () -> Unit = {},
    onCycleRepeat: () -> Unit = {},
    onOpenLyrics: () -> Unit = {},
    onExpand: () -> Unit = {},
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onExpand)
                .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(state.title, modifier = Modifier.weight(1f), maxLines = 1)
        if (state.isMusic) {
            // A genuine two-state toggle: Role.Switch + stateDescription announce "on"/"off" as
            // a state change, the same pattern net.auralis.app.features.music.FavoriteToggleButton
            // already established for this app's other two-state toggles — carried over from
            // this control's pre-icon version, which used the identical pair. The icon itself
            // doesn't change between the two states — Shuffle has no separate "off" glyph in the
            // extended set — so [stateDescription], not the glyph, is what a screen reader hears
            // change.
            IconButton(
                onClick = onToggleShuffle,
                modifier =
                    Modifier.semantics {
                        role = Role.Switch
                        contentDescription = "Shuffle"
                        stateDescription = if (state.shuffleEnabled) "On" else "Off"
                    },
            ) {
                Icon(Icons.Filled.Shuffle, contentDescription = null)
            }
            // Repeat has three states, which Role.Switch's boolean semantics can't carry — see
            // repeatModeContentDescription's own doc comment — so this control both swaps its
            // glyph (Repeat vs. RepeatOne) and carries a fully-worded contentDescription naming
            // the state directly.
            IconButton(
                onClick = onCycleRepeat,
                modifier =
                    Modifier.semantics {
                        contentDescription = repeatModeContentDescription(state.repeatMode)
                    },
            ) {
                Icon(
                    if (state.repeatMode == Player.REPEAT_MODE_ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                    contentDescription = null,
                )
            }
            IconButton(onClick = onOpenLyrics) {
                // Subtitles, not a dedicated "Lyrics" glyph — Material Icons' classic filled set
                // (what `material-icons-extended` ships) has no icon actually named "Lyrics",
                // and guessing at one risks an unresolved reference this project can't compile
                // locally to catch (no JDK/SDK on this machine — CI is the only compile gate).
                // Subtitles reads clearly enough for "synced text alongside audio."
                Icon(Icons.Filled.Subtitles, contentDescription = "Lyrics")
            }
        }
        IconButton(onClick = onTogglePlayPause) {
            Icon(
                if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = if (state.isPlaying) "Pause" else "Play",
            )
        }
    }
}
