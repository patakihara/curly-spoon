package net.auralis.app.features.player

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Forward30
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import coil.ImageLoader
import coil.compose.AsyncImage

/**
 * The 10s/30s skip amounts the transport row's [Icons.Filled.Replay10]/[Icons.Filled.Forward30]
 * buttons apply — `docs/DESIGN.md`'s own keyboard-shortcut table (`J`/`L` ±30s) documents 30s as
 * this project's forward/back skip convention; 10s-back is the finer-grained "I missed that
 * line" correction Symfonium and Audiobookshelf's own web player both use, which this project's
 * icon choice ([Icons.Filled.Replay10], not `Replay30`) already committed to.
 */
private const val SKIP_BACK_MS = 10_000L
private const val SKIP_FORWARD_MS = 30_000L

/**
 * The full-height Now Playing surface (Android wave 12a-A2) — artwork, title/subtitle, a
 * draggable seek bar, and transport controls, expanding from [MiniPlayerBar]. Renders as a
 * plain full-screen [Surface] rather than a `ModalBottomSheet`: `docs/DESIGN.md`'s own layout
 * table calls this a "full-screen sheet" only below 600dp and a split-view/side-panel above it,
 * neither of which is a bottom-sheet shape — [net.auralis.app.navigation.AuralisShell] owns
 * *which* construct wraps this composable (an [androidx.compose.animation.AnimatedVisibility]
 * overlay, per that file's own doc comment), so this file stays a plain content composable with
 * no sheet/dialog chrome of its own, reusable under whatever container the shell picks.
 *
 * [state]'s absence (nothing playing) is not handled here: [net.auralis.app.navigation.AuralisShell]
 * already gates the whole surface on a non-null [PlayerUiState.Playing], the same gate
 * [MiniPlayerBar] uses to decide whether to render at all — Now Playing has nothing to expand
 * *from* when nothing is playing, so there is no reachable path to this composable with no
 * current item.
 *
 * Seek-bar drag state ([sliderPosition]/[isDragging]) lives here, not in [PlayerViewModel]: the
 * ViewModel has no notion of "a drag in progress," and doesn't need one — see this file's own
 * inline comment on why fighting the incoming position stream needs a purely local flag.
 */
@Composable
fun NowPlayingScreen(
    state: PlayerUiState.Playing,
    playerViewModel: PlayerViewModel,
    imageLoader: ImageLoader,
    onDismiss: () -> Unit,
    // Android wave 12f -- navigates to Routes.QUEUE, matching onOpenLyrics's identical
    // "AuralisShell owns the navController, this composable just gets a lambda" shape.
    onOpenQueue: () -> Unit,
) {
    // remember(playerViewModel) so the same Flow instance survives recomposition: a fresh
    // flow{} on every call (this composable recomposes on every progress tick it collects)
    // would make collectAsState treat each one as a new key and restart the collector's
    // coroutine every tick instead of converging — never actually advancing the position.
    val progressFlow = remember(playerViewModel) { playerViewModel.playbackProgressFlow() }
    val progress by progressFlow.collectAsState(initial = PlaybackProgress(0L, 0L))

    // While the user is actively dragging, the slider must show the drag's own position, not
    // whatever NOW_PLAYING_PROGRESS_TICK_MS's next tick reports — otherwise the live position
    // stream fights the thumb and it snaps back mid-drag (the exact "Slider prop drop" class of
    // defect this wave's spec calls out). `isDragging` gates which source `sliderFraction` below
    // reads from; `sliderPosition` only has a meaningful value while `isDragging` is true.
    var isDragging by remember { mutableStateOf(false) }
    var sliderPosition by remember { mutableFloatStateOf(0f) }

    val displayedFraction =
        if (isDragging) sliderPosition else sliderFraction(progress.positionMs, progress.durationMs)
    val displayedPositionMs =
        if (isDragging) positionMsFromFraction(sliderPosition, progress.durationMs) else progress.positionMs

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Collapse Now Playing")
                }
                IconButton(onClick = onOpenQueue) {
                    Icon(Icons.Filled.QueueMusic, contentDescription = "Queue")
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            AsyncImage(
                model = state.artworkUri,
                contentDescription = null,
                imageLoader = imageLoader,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(28.dp)),
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(state.title, style = MaterialTheme.typography.headlineMedium, maxLines = 2)
            resolveSubtitle(state.artist, state.subtitle)?.let {
                Text(it, style = MaterialTheme.typography.titleMedium)
            }

            Spacer(modifier = Modifier.height(16.dp))

            Slider(
                value = displayedFraction,
                onValueChange = { fraction ->
                    isDragging = true
                    sliderPosition = fraction
                },
                onValueChangeFinished = {
                    playerViewModel.seekTo(positionMsFromFraction(sliderPosition, progress.durationMs))
                    isDragging = false
                },
                valueRange = 0f..1f,
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(elapsedTimeLabel(displayedPositionMs), style = MaterialTheme.typography.labelMedium)
                Text(
                    remainingTimeLabel(displayedPositionMs, progress.durationMs),
                    style = MaterialTheme.typography.labelMedium,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = playerViewModel::skipToPrevious) {
                    Icon(Icons.Filled.SkipPrevious, contentDescription = "Previous")
                }
                IconButton(
                    onClick = {
                        playerViewModel.seekTo(
                            clampSeekTarget(progress.positionMs, -SKIP_BACK_MS, progress.durationMs),
                        )
                    },
                ) {
                    Icon(Icons.Filled.Replay10, contentDescription = "Skip back 10 seconds")
                }
                IconButton(onClick = playerViewModel::togglePlayPause) {
                    Icon(
                        if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (state.isPlaying) "Pause" else "Play",
                    )
                }
                IconButton(
                    onClick = {
                        playerViewModel.seekTo(
                            clampSeekTarget(progress.positionMs, SKIP_FORWARD_MS, progress.durationMs),
                        )
                    },
                ) {
                    Icon(Icons.Filled.Forward30, contentDescription = "Skip forward 30 seconds")
                }
                IconButton(onClick = playerViewModel::skipToNext) {
                    Icon(Icons.Filled.SkipNext, contentDescription = "Next")
                }
            }
        }
    }
}
