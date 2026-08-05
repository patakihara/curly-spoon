package net.auralis.app.features.player

import android.content.ComponentName
import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.guava.asDeferred
import kotlinx.coroutines.launch
import net.auralis.app.playback.AuralisMediaLibraryService
import net.auralis.app.playback.PlaybackItemResolver
import net.auralis.app.playback.ResolvedPlayback
import net.auralis.app.playback.toMediaItem

/** How often [PlayerViewModel] pushes a Jellyfin progress report for a currently-playing music
 * item, matching `apps/web/src/features/player/useProgressSync.ts`'s own 15s cadence — see
 * [JellyfinPlaybackReporter]'s own doc comment for why that file is the design this mirrors. */
private const val JELLYFIN_PROGRESS_TICK_MS = 15_000L

/** What the mini player (and, later, a full Now Playing surface) renders. */
sealed interface PlayerUiState {
    data object Idle : PlayerUiState

    data class Playing(val title: String, val isPlaying: Boolean) : PlayerUiState

    data class Error(val message: String) : PlayerUiState
}

/**
 * Owns the single [MediaController] connection to [AuralisMediaLibraryService] and translates
 * BFF playback sessions into transport commands. Constructed once per app (see
 * `AuralisNavHost`) so the controller — and the state it drives — survives navigation between
 * screens rather than being torn down and rebuilt per screen.
 *
 * Plays only the first track of an item (see [firstPlayableTrack], used inside
 * [PlaybackItemResolver]); multi-track stitching, seek/skip, and scheduling progress syncs back
 * to the BFF are later waves' jobs.
 *
 * [PlaybackItemResolver] — shared with [AuralisMediaLibraryService], via
 * [net.auralis.app.AppContainer] — owns the whole BFF-session-to-`MediaItem` chain and its
 * metadata, so this class no longer builds its own [androidx.media3.common.MediaItem]/
 * [androidx.media3.common.MediaMetadata]: doing so here *and* in the service is what left phone
 * playback showing a bare title with no artist or artwork before Wave E2b, since the two
 * constructions could — and did — drift apart.
 */
class PlayerViewModel(
    private val context: Context,
    private val playbackItemResolver: PlaybackItemResolver,
    jellyfinPlaybackReportSender: JellyfinPlaybackReportSender,
) : ViewModel() {
    private val _uiState = MutableStateFlow<PlayerUiState>(PlayerUiState.Idle)
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    /**
     * A dedicated scope for [jellyfinPlaybackReporter], deliberately *not* [viewModelScope]:
     * [ViewModel.clear] cancels [viewModelScope]'s `Job` before calling [onCleared] (it is
     * closed as a registered `Closeable` ahead of that call, per `androidx.lifecycle`'s own
     * `ViewModel.clear()` implementation), so a `viewModelScope.launch` made from inside
     * [onCleared] never actually runs its body — it would silently drop exactly the final
     * `stopped` report [onCleared] below needs to send. This scope has no such lifecycle tie, so
     * that report can still fire. Not explicitly cancelled anywhere: this class is already
     * documented as constructed once per app process (see this class's own header) and lives for
     * the app's whole life, the same as the [MediaController] connection it owns — there is
     * nothing shorter-lived to leak against.
     */
    private val jellyfinPlaybackReporterScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val jellyfinPlaybackReporter =
        JellyfinPlaybackReporter(jellyfinPlaybackReportSender, jellyfinPlaybackReporterScope)

    private var controller: MediaController? = null

    /**
     * The in-flight connection attempt, if one has already been started. Memoizing the
     * [Deferred] itself — not just the resolved [MediaController] — matters because
     * `buildAsync().await()` is a real suspension point: `playItem` is only ever reached after
     * a `playbackItemResolver.resolve` network round trip, so two shelf taps in quick succession both
     * observe `controller == null` and would otherwise each start their own
     * `MediaController.Builder`, leaking the loser's connection and listener. Assigning this
     * field happens synchronously, before the `await()` suspension point, and `viewModelScope`
     * runs on `Dispatchers.Main.immediate` — single-threaded — so there is no window for a
     * second caller to race past the check.
     */
    private var pendingController: Deferred<MediaController>? = null

    /**
     * Lazily connects to [AuralisMediaLibraryService], reusing the connection on every
     * subsequent call. `MediaController.Builder.buildAsync()` returns a Guava
     * `ListenableFuture`; `asDeferred().await()` bridges that into this suspend function.
     */
    private suspend fun connectedController(): MediaController {
        controller?.let { return it }
        val deferred =
            pendingController ?: run {
                val token = SessionToken(context, ComponentName(context, AuralisMediaLibraryService::class.java))
                MediaController.Builder(context, token).buildAsync().asDeferred().also { pendingController = it }
            }
        val newController =
            try {
                deferred.await()
            } catch (e: Throwable) {
                // A failed attempt must not stay memoized — otherwise every later call re-awaits
                // the same failed Deferred and playback is permanently dead for this ViewModel's
                // life. Only clear it if it's still *this* attempt: a concurrent caller may have
                // already succeeded and replaced it.
                if (pendingController === deferred) pendingController = null
                throw e
            }
        if (controller == null) {
            newController.addListener(
                object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        val current = _uiState.value
                        if (current is PlayerUiState.Playing) {
                            _uiState.value = current.copy(isPlaying = isPlaying)
                        }
                        jellyfinPlaybackReporter.onIsPlayingChanged(
                            positionSeconds = newController.currentPosition / 1000.0,
                            isPlaying = isPlaying,
                        )
                    }

                    // setMediaItem/prepare/play() in playItem() are fire-and-forget: ExoPlayer's
                    // own async pipeline (resolving the audio stream URL, decoding) can fail after
                    // that point with nothing in this ViewModel's call stack to observe it. Without
                    // this override, that failure never reverts PlayerUiState out of Playing, and
                    // the UI is left claiming playback is happening when it silently is not.
                    override fun onPlayerError(error: PlaybackException) {
                        _uiState.value =
                            PlayerUiState.Error("Playback failed: ${error.errorCodeName} — ${error.message}")
                    }

                    // Fires on every queue advance, seek-to-a-different-item, or fresh
                    // setMediaItem(s) call — the one place [jellyfinPlaybackReporter] learns the
                    // active item changed. `mediaItem?.mediaId` is gated against a `track:` prefix
                    // *inside* the reporter (see [jellyfinItemIdFromMediaId]), so this override
                    // fires unconditionally for every item, book/episode/track alike, and stays
                    // silent for anything that isn't music.
                    override fun onMediaItemTransition(
                        mediaItem: MediaItem?,
                        reason: Int,
                    ) {
                        jellyfinPlaybackReporter.onMediaItemChanged(
                            newMediaId = mediaItem?.mediaId,
                            positionSeconds = newController.currentPosition / 1000.0,
                            isPlaying = newController.isPlaying,
                        )
                    }

                    // A user-initiated seek *within the currently playing item* — a seek that
                    // lands on a different item instead fires onMediaItemTransition above (Media3
                    // reports both callbacks for a cross-item seek; the mediaItemIndex check below
                    // is what keeps this override from double-reporting that case). Every other
                    // discontinuity reason (auto-advance, skip, remove, internal) is left alone:
                    // auto-advance is already covered by onMediaItemTransition, and the rest aren't
                    // a position change a listener/resume position needs to hear about separately.
                    override fun onPositionDiscontinuity(
                        oldPosition: Player.PositionInfo,
                        newPosition: Player.PositionInfo,
                        reason: Int,
                    ) {
                        val isSameItemSeek =
                            (
                                reason == Player.DISCONTINUITY_REASON_SEEK ||
                                    reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT
                            ) && oldPosition.mediaItemIndex == newPosition.mediaItemIndex
                        if (isSameItemSeek) {
                            jellyfinPlaybackReporter.onSeek(
                                positionSeconds = newPosition.positionMs / 1000.0,
                                isPlaying = newController.isPlaying,
                            )
                        }
                    }

                    // The queue reached its end with no next item to transition to, so
                    // onMediaItemTransition above never fires to close out whatever was last
                    // playing — this is the one other place a music item's final `stopped` report
                    // has to come from during normal playback (the other being onCleared, for
                    // teardown rather than natural completion).
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_ENDED) {
                            jellyfinPlaybackReporter.onStopped(newController.currentPosition / 1000.0)
                        }
                    }
                },
            )
            controller = newController
            pendingController = null
            // The periodic Jellyfin progress-report cadence — see JELLYFIN_PROGRESS_TICK_MS's own
            // doc comment for why 15s. Started once, alongside the listener above, and left
            // running for viewModelScope's lifetime (it becomes a no-op once `controller` is
            // cleared, and viewModelScope itself is cancelled on ViewModel teardown either way);
            // jellyfinPlaybackReporter.onTick is itself a no-op whenever no music item is current,
            // so this costs nothing during book/podcast playback.
            viewModelScope.launch {
                while (true) {
                    delay(JELLYFIN_PROGRESS_TICK_MS)
                    val ctrl = controller ?: break
                    jellyfinPlaybackReporter.onTick(
                        positionSeconds = ctrl.currentPosition / 1000.0,
                        isPlaying = ctrl.isPlaying,
                    )
                }
            }
        }
        return controller!!
    }

    /**
     * Starts playback of an item's first track. Called from a shelf item's onClick.
     *
     * `PlaybackItemResolver.resolve` is itself a total function — it swallows `ApiException` and
     * every other resolution failure (no playable track, an unresolvable file id, a `null`/
     * malformed BFF response) and returns `null` for all of them, matching the same
     * "browsable-but-not-playable" outcome the browse tree already treats as one case. That
     * folds what used to be two distinct error messages here (a track-less item vs. a network/
     * API failure) into one; the resolver has no way to tell this caller which failure occurred,
     * and it shouldn't grow one just to preserve wording nobody could act on differently.
     */
    fun playItem(itemId: String) {
        viewModelScope.launch {
            playResolved(fallbackTitle = itemId) { playbackItemResolver.resolve(itemId) }
        }
    }

    /**
     * Starts playback of one podcast episode. Called from a podcast detail screen's episode
     * row `onClick` — the podcast counterpart to [playItem], sharing every step past resolution
     * with it via [playResolved] so the two can't drift in how a failure surfaces.
     */
    fun playEpisode(
        itemId: String,
        episodeId: String,
    ) {
        viewModelScope.launch {
            playResolved(fallbackTitle = episodeId) { playbackItemResolver.resolveEpisode(itemId, episodeId) }
        }
    }

    /**
     * Shared tail of [playItem]/[playEpisode]: resolve, hand to the controller, publish
     * [PlayerUiState]. Pulled out so the two entry points can't diverge in how a resolution
     * failure or a controller-connection failure is reported — before this existed, only
     * [playItem] had this logic and [playEpisode] would have been a second, easily-drifting copy.
     *
     * [resolve] is a suspend lambda, not a plain `ResolvedPlayback?`, so the network round trip
     * happens *inside* this function's own try/catch — matching [playItem]'s original structure,
     * where `playbackItemResolver.resolve(itemId)` itself could throw (a non-[ApiException]
     * failure, though [PlaybackItemResolver.resolve]/`resolveEpisode` are both already total
     * functions in practice) as easily as `connectedController()` could.
     */
    private suspend fun playResolved(
        fallbackTitle: String,
        resolve: suspend () -> ResolvedPlayback?,
    ) {
        try {
            val resolved =
                resolve()
                    ?: run {
                        _uiState.value = PlayerUiState.Error("This item has no playable audio track.")
                        return
                    }
            val mediaItem = resolved.toMediaItem()
            val ctrl = connectedController()
            ctrl.setMediaItem(mediaItem)
            ctrl.prepare()
            ctrl.play()
            val title = mediaItem.mediaMetadata.title?.toString() ?: fallbackTitle
            _uiState.value = PlayerUiState.Playing(title = title, isPlaying = true)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Total function, per house style: a failed MediaController connection (service
            // unreachable, connection refused) degrades to an error state rather than
            // crashing the ViewModel's coroutine scope.
            _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
        }
    }

    /**
     * Starts playing an already-built queue of tracks — an album's tapped track and everything
     * after it, in order (see `AlbumDetailViewModel.buildQueueFrom`/
     * [net.auralis.app.features.music.albumPlaybackQueue]). Distinct from
     * [playResolved]'s single-`MediaItem` path because a queue needs Media3's own multi-item
     * `setMediaItems`, not `setMediaItem`, and because the caller — not
     * [net.auralis.app.playback.PlaybackItemResolver] — has already resolved every item: a
     * Jellyfin track needs no server-side "play session" the way an audiobook/podcast item does,
     * so there is no per-item BFF round trip for a resolver to own here.
     *
     * [buildQueue] is a suspend lambda, matching [playResolved]'s own shape, so the caller's
     * network work (fetching each track's stream URL) runs inside this ViewModel's
     * [viewModelScope] rather than the call site's — the same reason [playResolved] takes
     * `resolve` as a lambda instead of a plain value.
     */
    fun playQueue(buildQueue: suspend () -> List<ResolvedPlayback>) {
        viewModelScope.launch {
            try {
                val queue = buildQueue()
                if (queue.isEmpty()) {
                    _uiState.value = PlayerUiState.Error("This item has no playable audio track.")
                    return@launch
                }
                val mediaItems = queue.map { it.toMediaItem() }
                val ctrl = connectedController()
                ctrl.setMediaItems(mediaItems)
                ctrl.prepare()
                ctrl.play()
                val title = mediaItems.first().mediaMetadata.title?.toString() ?: queue.first().title
                _uiState.value = PlayerUiState.Playing(title = title, isPlaying = true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Total function, matching playResolved: a failed MediaController connection or
                // a failed buildQueue() degrades to an error state rather than crashing this
                // ViewModel's coroutine scope.
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /** Toggles play/pause on the currently loaded item. A no-op when nothing is loaded. */
    fun togglePlayPause() {
        viewModelScope.launch {
            val current = _uiState.value
            if (current !is PlayerUiState.Playing) return@launch
            try {
                val ctrl = connectedController()
                if (ctrl.isPlaying) ctrl.pause() else ctrl.play()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    override fun onCleared() {
        // Final stopped report for whatever music item is current — see
        // jellyfinPlaybackReporterScope's own doc comment for why this has to run on that
        // dedicated scope rather than viewModelScope, which is already cancelled by the time this
        // method runs. A no-op (both the reporter's own and this call's currentPosition read) when
        // nothing is playing or the last item wasn't music.
        controller?.let { jellyfinPlaybackReporter.onStopped(it.currentPosition / 1000.0) }
        controller?.release()
        controller = null
        // A connection attempt may still be in flight (pendingController non-null, controller
        // still null): cancelling the Deferred propagates to `cancel(false)` on the underlying
        // `ListenableFuture` (kotlinx-coroutines-guava's asDeferred() wires this up via
        // `invokeOnCompletion`), so the connection is aborted rather than completing later into
        // a MediaController nobody releases. Without this, clearing the reference alone left
        // the future free to resolve after the ViewModel was gone, leaking the connection.
        pendingController?.cancel()
        pendingController = null
    }
}
