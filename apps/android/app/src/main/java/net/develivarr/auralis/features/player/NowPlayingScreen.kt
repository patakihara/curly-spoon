package net.develivarr.auralis.features.player

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Forward30
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import coil.ImageLoader
import coil.compose.AsyncImage
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.features.books.BookChapterUi
import net.develivarr.auralis.features.books.chaptersFrom

/**
 * The 10s/30s skip amounts the transport row's [Icons.Filled.Replay10]/[Icons.Filled.Forward30]
 * buttons apply — `docs/DESIGN.md`'s own keyboard-shortcut table (`J`/`L` ±30s) documents 30s as
 * this project's forward/back skip convention; 10s-back is the finer-grained "I missed that
 * line" correction Symfonium and Audiobookshelf's own web player both use, which this project's
 * icon choice ([Icons.Filled.Replay10], not `Replay30`) already committed to.
 *
 * `docs/design/screens/NOW_PLAYING.md` §7/§8 rules aligning this with web's configurable 30s/30s
 * out of scope for wave 16e-nowplaying-A — pre-existing, named there so it isn't mistaken for
 * drift this wave introduced.
 */
private const val SKIP_BACK_MS = 10_000L
private const val SKIP_FORWARD_MS = 30_000L

/**
 * The kind-appropriate fallback icon for the currently loaded item, shared by [MiniPlayerBar] and
 * this screen's own cover art (`docs/design/screens/NOW_PLAYING.md` §3.3, wave 16e-nowplaying-A —
 * "name the placeholder/error painter for every image, not just the happy path", the same rule
 * `net.develivarr.auralis.ui.components.MediaHeader` already applies per-screen). [state] carries
 * no direct "kind" field, only [PlayerUiState.Playing.isMusic] and
 * [PlayerUiState.Playing.audiobookItemId] (`null` unless an audiobook is loaded) — together they
 * distinguish all three media types by elimination, the same way
 * [PlayerViewModel.currentContentTypeFlow]'s `PODCAST`/`AUDIOBOOK`/`MUSIC` triad does. `internal`
 * so [MiniPlayerBar] (same module, same package) can reuse it without a second per-kind mapping.
 */
internal fun nowPlayingFallbackIcon(
    isMusic: Boolean,
    audiobookItemId: String?,
): ImageVector =
    when {
        isMusic -> Icons.Filled.MusicNote
        audiobookItemId != null -> Icons.AutoMirrored.Filled.MenuBook
        else -> Icons.Filled.Podcasts
    }

/**
 * The full-height Now Playing surface (Android wave 12a-A2) — artwork, title/subtitle, a
 * draggable seek bar, and transport controls, expanding from [MiniPlayerBar]. Renders as a
 * plain full-screen [Surface] rather than a `ModalBottomSheet`: `docs/DESIGN.md`'s own layout
 * table calls this a "full-screen sheet" only below 600dp and a split-view/side-panel above it,
 * neither of which is a bottom-sheet shape — [net.develivarr.auralis.navigation.AuralisShell] owns
 * *which* construct wraps this composable (an [androidx.compose.animation.AnimatedVisibility]
 * overlay, per that file's own doc comment), so this file stays a plain content composable with
 * no sheet/dialog chrome of its own, reusable under whatever container the shell picks.
 *
 * [state]'s absence (nothing playing) is not handled here: [net.develivarr.auralis.navigation.AuralisShell]
 * already gates the whole surface on a non-null [PlayerUiState.Playing], the same gate
 * [MiniPlayerBar] uses to decide whether to render at all — Now Playing has nothing to expand
 * *from* when nothing is playing, so there is no reachable path to this composable with no
 * current item.
 *
 * Seek-bar drag state ([sliderPosition]/[isDragging]) lives here, not in [PlayerViewModel]: the
 * ViewModel has no notion of "a drag in progress," and doesn't need one — see this file's own
 * inline comment on why fighting the incoming position stream needs a purely local flag.
 *
 * Wave 16e-nowplaying-A (`docs/design/screens/NOW_PLAYING.md`) added [onToggleShuffle]/
 * [onCycleRepeat]/[onOpenLyrics] — the same three callbacks [net.develivarr.auralis.navigation.AuralisShell]
 * already threads into [MiniPlayerBar] — so this screen no longer loses shuffle/repeat/lyrics the
 * moment the user expands (§2.2/§6.2's "the core fix"), and [apiClient], which this screen's own
 * chapter indicator uses to fetch [state.audiobookItemId]'s chapter list the same way
 * [net.develivarr.auralis.features.books.BookDetailViewModel] does for the detail screen (§6.3) —
 * no new BFF route, the existing `GET /items/:id?expanded=true` already serves everything (§4).
 */
@Composable
fun NowPlayingScreen(
    state: PlayerUiState.Playing,
    playerViewModel: PlayerViewModel,
    imageLoader: ImageLoader,
    apiClient: ApiClient,
    onDismiss: () -> Unit,
    // Android wave 12f -- navigates to Routes.QUEUE, matching onOpenLyrics's identical
    // "AuralisShell owns the navController, this composable just gets a lambda" shape.
    onOpenQueue: () -> Unit,
    onToggleShuffle: () -> Unit = {},
    onCycleRepeat: () -> Unit = {},
    onOpenLyrics: () -> Unit = {},
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

    // The chapter indicator's data source (§6.3). Fetched once per audiobook item id, degrading
    // to an empty list on any ApiException — a chapter indicator that fails to load is omitted
    // (§5's fallback contract), not an error state on the whole screen. `null` (no audiobook
    // loaded) also degrades to empty, so the LaunchedEffect below has one branch, not two.
    var chapters by remember { mutableStateOf<List<BookChapterUi>>(emptyList()) }
    LaunchedEffect(state.audiobookItemId) {
        val audiobookItemId = state.audiobookItemId
        chapters =
            if (audiobookItemId == null) {
                emptyList()
            } else {
                try {
                    chaptersFrom(apiClient.libraryItem(audiobookItemId, expanded = true).media.chapters)
                } catch (e: ApiException) {
                    emptyList()
                }
            }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Collapse Now Playing")
                }
                Row {
                    // The lyrics affordance Now Playing was missing entirely (§2.2/§6.2) —
                    // same icon choice and same state.isMusic gate as MiniPlayerBar's own
                    // button, which reaches the identical Routes.LYRICS destination.
                    if (state.isMusic) {
                        IconButton(onClick = onOpenLyrics) {
                            Icon(Icons.Filled.Subtitles, contentDescription = "Lyrics")
                        }
                    }
                    IconButton(onClick = onOpenQueue) {
                        Icon(Icons.Filled.QueueMusic, contentDescription = "Queue")
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Art tile, compact/mobile sheet (§3.3): --radius-lg = 32.dp, via the app's own
            // SonoraShapes.large mapping rather than a hardcoded RoundedCornerShape literal.
            // Fallback icon underneath a transparent-until-loaded AsyncImage, matching
            // MediaHeader's established pattern — Coil paints nothing while loading, on
            // failure, or when state.artworkUri is null, and this screen previously had no
            // fallback at all for any of those cases.
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(MaterialTheme.shapes.large),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = nowPlayingFallbackIcon(state.isMusic, state.audiobookItemId),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(96.dp).testTag("now-playing-art-fallback"),
                )
                AsyncImage(
                    model = state.artworkUri,
                    contentDescription = null,
                    imageLoader = imageLoader,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Title, mobile sheet (§3.3): weight 900 at every size is already how
            // ui.theme.SonoraTypography defines headlineMedium (--h2-size), so this was already
            // correct on the weight axis despite the spec's own recon table calling it "Missing"
            // — see this wave's report. `var(--font-display)` can't be matched regardless: this
            // app bundles no display font on Android (SonoraTypography's own doc comment), a
            // pre-existing, out-of-scope limitation, not something this wave introduces.
            Text(
                state.title,
                style = MaterialTheme.typography.headlineMedium,
                maxLines = 2,
                modifier = Modifier.semantics { heading() },
            )
            // Artist/subtitle, mobile sheet (§3.3): --text-lg (16px) / --m3-on-surface-variant.
            // bodyLarge is SonoraTypography's own --text-lg mapping; titleMedium (the previous
            // style here) is unpinned by Sonora and carried no muted colour role at all.
            resolveSubtitle(state.artist, state.subtitle)?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // The chapter/context indicator (§6.3) — two different pieces of per-medium state,
            // deliberately not unified into one generic mechanism (§6.3's own instruction):
            // an audiobook's active chapter title, or music's "Playing from {album}" context.
            // Neither ever applies to a podcast episode, matching web's own per-medium split.
            if (state.audiobookItemId != null) {
                activeChapterTitle(chapters, displayedPositionMs)?.let {
                    Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else if (state.isMusic) {
                nowPlayingContextLine(isMusic = true, album = state.subtitle)?.let {
                    Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
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
                // The accessible value announcement web already has (§11) —
                // `"{elapsed} of {total}"`, composed identically to web's literal
                // `` `${formatDuration(currentTime)} of ${formatDuration(duration)}` ``.
                modifier =
                    Modifier.semantics {
                        stateDescription = scrubberValueDescription(displayedPositionMs, progress.durationMs)
                    },
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(elapsedTimeLabel(displayedPositionMs), style = MaterialTheme.typography.labelMedium)
                Text(
                    remainingTimeLabel(displayedPositionMs, progress.durationMs),
                    style = MaterialTheme.typography.labelMedium,
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Transport icon sizes, mobile sheet (§3.3): Shuffle/Repeat 48.dp, Previous/skip/Next
            // 56.dp, Play/Pause 72.dp — previously every control here rendered at one uniform M3
            // default size. Shuffle/Repeat are new on this screen (§6.2); Previous/Next are
            // pre-existing and kept Android-only per §6.6/§8 (Media3 gives this platform a real
            // queue to step through that web's client-side queue construct doesn't have).
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (state.isMusic) {
                    // Same Role.Switch + stateDescription pattern as MiniPlayerBar's identical
                    // control (§11: "do not invent a second announcement pattern for the same
                    // controls appearing on a second screen").
                    IconButton(
                        onClick = onToggleShuffle,
                        modifier =
                            Modifier.size(48.dp).semantics {
                                role = Role.Switch
                                contentDescription = "Shuffle"
                                stateDescription = if (state.shuffleEnabled) "On" else "Off"
                            },
                    ) {
                        Icon(Icons.Filled.Shuffle, contentDescription = null, modifier = Modifier.size(24.dp))
                    }
                }
                IconButton(onClick = playerViewModel::skipToPrevious, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Filled.SkipPrevious, contentDescription = "Previous", modifier = Modifier.size(28.dp))
                }
                IconButton(
                    onClick = {
                        playerViewModel.seekTo(
                            clampSeekTarget(progress.positionMs, -SKIP_BACK_MS, progress.durationMs),
                        )
                    },
                    modifier = Modifier.size(56.dp),
                ) {
                    Icon(Icons.Filled.Replay10, contentDescription = "Skip back 10 seconds", modifier = Modifier.size(28.dp))
                }
                // Play/Pause fill (§3.3): a real FilledIconButton — its default colours already
                // resolve MaterialTheme.colorScheme.primary/onPrimary, the accent-derived roles
                // this app's Sonora theme already wires (16f-A-1/16f-A-2) — no new component and
                // no new colour logic needed, matching the spec's own instruction.
                FilledIconButton(onClick = playerViewModel::togglePlayPause, modifier = Modifier.size(72.dp)) {
                    Icon(
                        if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (state.isPlaying) "Pause" else "Play",
                        modifier = Modifier.size(36.dp),
                    )
                }
                IconButton(
                    onClick = {
                        playerViewModel.seekTo(
                            clampSeekTarget(progress.positionMs, SKIP_FORWARD_MS, progress.durationMs),
                        )
                    },
                    modifier = Modifier.size(56.dp),
                ) {
                    Icon(Icons.Filled.Forward30, contentDescription = "Skip forward 30 seconds", modifier = Modifier.size(28.dp))
                }
                IconButton(onClick = playerViewModel::skipToNext, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Filled.SkipNext, contentDescription = "Next", modifier = Modifier.size(28.dp))
                }
                if (state.isMusic) {
                    IconButton(
                        onClick = onCycleRepeat,
                        modifier =
                            Modifier.size(48.dp).semantics {
                                contentDescription = repeatModeContentDescription(state.repeatMode)
                            },
                    ) {
                        Icon(
                            if (state.repeatMode == Player.REPEAT_MODE_ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
            }
        }
    }
}
