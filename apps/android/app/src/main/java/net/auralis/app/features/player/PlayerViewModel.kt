package net.auralis.app.features.player

import android.content.ComponentName
import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.guava.asDeferred
import kotlinx.coroutines.launch
import net.auralis.app.playback.AuralisMediaLibraryService
import net.auralis.app.playback.PlaybackItemResolver

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
) : ViewModel() {
    private val _uiState = MutableStateFlow<PlayerUiState>(PlayerUiState.Idle)
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

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
                },
            )
            controller = newController
            pendingController = null
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
            try {
                val mediaItem =
                    playbackItemResolver.resolve(itemId)
                        ?: run {
                            _uiState.value = PlayerUiState.Error("This item has no playable audio track.")
                            return@launch
                        }
                val ctrl = connectedController()
                ctrl.setMediaItem(mediaItem)
                ctrl.prepare()
                ctrl.play()
                val title = mediaItem.mediaMetadata.title?.toString() ?: itemId
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
