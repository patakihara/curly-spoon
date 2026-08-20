package net.develivarr.auralis.features.player

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import coil.ImageLoader
import coil.compose.AsyncImage
import kotlinx.coroutines.flow.Flow

/**
 * The persistent mini player: cover art, title/subtitle, a playback progress indicator, a
 * play/pause toggle, and — music only — shuffle, repeat and lyrics (Android wave H/J, restyled
 * in wave 16e-nowplaying-A per `docs/design/screens/NOW_PLAYING.md` §3.2/§6.1). Tapping anywhere
 * on the bar other than a control ([onExpand]) opens [NowPlayingScreen] (Android wave 12a-A2) —
 * the same "tap the collapsed surface to expand it" convention this project's references
 * (YouTube Music, Spotify) both use.
 *
 * [imageLoader]/[progressFlow] give this bar its first cover art and progress indicator (§2.1
 * named both as previously absent entirely). [progressFlow] is deliberately the *same*
 * `PlayerViewModel.playbackProgressFlow()` mechanism [NowPlayingScreen] already collects — the
 * spec's own instruction is "reuse it, don't build a bar-local computation" — so the caller
 * ([net.develivarr.auralis.navigation.AuralisShell]) passes in a `remember`ed instance rather
 * than this composable calling back into a ViewModel it doesn't otherwise depend on.
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
    imageLoader: ImageLoader,
    progressFlow: Flow<PlaybackProgress>,
    onTogglePlayPause: () -> Unit,
    onToggleShuffle: () -> Unit = {},
    onCycleRepeat: () -> Unit = {},
    onOpenLyrics: () -> Unit = {},
    onExpand: () -> Unit = {},
) {
    val progress by progressFlow.collectAsState(initial = PlaybackProgress(0L, 0L))

    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(88.dp)
                .clickable(onClick = onExpand),
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Cover art (§3.2's "Missing entirely" -> 44.dp, --miniplayer-album-size read 1:1 as
            // dp per 16b-2-A's established convention). Fallback icon underneath a
            // transparent-until-loaded AsyncImage, the same pattern
            // net.develivarr.auralis.ui.components.MediaHeader already established — Coil paints
            // nothing while loading/on failure/when the model is null, so this is what shows
            // through in every one of those cases without a Coil placeholder/error painter.
            Box(
                modifier = Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = nowPlayingFallbackIcon(state.isMusic, state.audiobookItemId),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(22.dp).testTag("mini-player-art-fallback"),
                )
                AsyncImage(
                    model = state.artworkUri,
                    contentDescription = null,
                    imageLoader = imageLoader,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(44.dp),
                )
            }

            Column(
                modifier = Modifier.weight(1f).padding(start = 12.dp),
            ) {
                // --text-md weight 600 title / --text-sm muted artist (§3.2) — no existing
                // Android type-scale name maps exactly, so bodyMedium/bodySmall are the closest
                // read, matching every other row-shaped primitive's own "closest existing scale
                // step" convention in this app.
                Text(
                    state.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
                resolveSubtitle(state.artist, state.subtitle)?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }

            if (state.isMusic) {
                // A genuine two-state toggle: Role.Switch + stateDescription announce "on"/"off" as
                // a state change, the same pattern net.develivarr.auralis.features.music.FavoriteToggleButton
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

        // Non-interactive, matching web's non-seekable LinearProgress (§7 rules out making the
        // mini player's progress bar interactive). Decorative w.r.t. the row's own controls, so
        // this carries its own label rather than joining a merged group — mirrors web's
        // `LinearProgress aria-label="Playback progress"`.
        LinearProgressIndicator(
            progress = { sliderFraction(progress.positionMs, progress.durationMs) },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomStart)
                    .testTag("mini-player-progress")
                    .semantics { contentDescription = "Playback progress" },
        )
    }
}
