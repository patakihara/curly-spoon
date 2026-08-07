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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
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

/**
 * How often [PlayerViewModel.lyricsPositionMsFlow] samples playback position — far finer than
 * [JELLYFIN_PROGRESS_TICK_MS]'s 15s, which is a network-reporting cadence chosen to keep
 * Jellyfin traffic low, not a display-refresh rate. This constant is unrelated to that one and
 * must stay unrelated: raising [JELLYFIN_PROGRESS_TICK_MS] to match lyric-highlighting precision
 * would multiply Jellyfin request volume for no reason connected to lyrics at all (see
 * [PlayerViewModel.lyricsPositionMsFlow]'s own doc comment for why this tick instead costs
 * nothing extra).
 */
private const val LYRICS_POSITION_TICK_MS = 200L

/**
 * How often [PlayerViewModel.playbackProgressFlow] samples position+duration for the Now
 * Playing seek bar (Android wave 12a-A2). Deliberately the same cadence as, but a distinct
 * constant from, [LYRICS_POSITION_TICK_MS] — the two flows serve different screens that happen
 * to want similarly smooth updates today; keeping them separate constants means raising one for
 * its own screen's needs (e.g. a coarser seek-bar tick to save battery) can never silently drag
 * the other along, the same reasoning [LYRICS_POSITION_TICK_MS]'s own doc comment already gives
 * for staying independent of [JELLYFIN_PROGRESS_TICK_MS].
 */
private const val NOW_PLAYING_PROGRESS_TICK_MS = 200L

/** What the mini player (and, later, a full Now Playing surface) renders. */
sealed interface PlayerUiState {
    data object Idle : PlayerUiState

    /**
     * [isMusic], [shuffleEnabled] and [repeatMode] back the shuffle/repeat controls added in
     * Android wave H. [isMusic] gates whether those controls are shown at all — shuffle on a
     * multi-file audiobook would scramble its chapters, and repeat-one on a podcast episode is at
     * best odd, so both controls are music-only, mirroring [jellyfinItemIdFromMediaId]'s own
     * `track:`-prefix gate via [isMusicMediaId]. [shuffleEnabled] and [repeatMode] always mirror
     * [androidx.media3.common.Player]'s own `shuffleModeEnabled`/`repeatMode` — there is no
     * separate optimistic copy that could drift from what the player actually holds. [repeatMode]
     * is one of [Player.REPEAT_MODE_OFF]/[Player.REPEAT_MODE_ALL]/[Player.REPEAT_MODE_ONE].
     *
     * [musicItemId] (Android wave J) is the same Jellyfin item id [isMusic] was derived from via
     * [jellyfinItemIdFromMediaId] — `null` whenever [isMusic] is `false`. Carried here rather
     * than re-derived by a caller because the raw Media3 media id isn't otherwise exposed on this
     * state; the lyrics screen needs the plain Jellyfin id to call
     * [net.auralis.app.features.music.MusicRepository.lyrics] with.
     */
    /**
     * [artist], [subtitle] and [artworkUri] (Android wave 12a-A2) mirror the same
     * [androidx.media3.common.MediaMetadata] fields [net.auralis.app.playback.MediaItemConversions]
     * already sets on every [MediaItem] this app plays — [PlayerUiState] simply hadn't exposed
     * them yet, because nothing before the Now Playing surface needed more than [title]. Read
     * from the controller's current [MediaItem], not re-derived: [ResolvedPlayback] and
     * `albumPlaybackQueue` already resolved "author vs. artist vs. album name" correctly per
     * media type (see those files' own doc comments), so this state just carries that decision
     * forward rather than re-deciding it.
     */
    data class Playing(
        val title: String,
        val isPlaying: Boolean,
        val isMusic: Boolean = false,
        val musicItemId: String? = null,
        val shuffleEnabled: Boolean = false,
        val repeatMode: Int = Player.REPEAT_MODE_OFF,
        val artist: String? = null,
        val subtitle: String? = null,
        val artworkUri: String? = null,
    ) : PlayerUiState

    data class Error(val message: String) : PlayerUiState
}

/**
 * The subset of [androidx.media3.common.Player] (implemented by [MediaController]) that
 * [PlayerViewModel] actually drives from [PlayerViewModel.playResolved]/
 * [PlayerViewModel.playQueue]/its toggle methods. Exists so a unit test can substitute a
 * lightweight fake instead of a real [MediaController], which needs a live [Context] and a bound
 * [AuralisMediaLibraryService] connection that a plain JVM unit test cannot provide (no
 * Robolectric in this project). The wider listener-registration/connection-memoization machinery
 * in [PlayerViewModel.connectedController] is deliberately left outside this seam — that is
 * Android/service plumbing this project has never unit-tested, and isn't where wave I's
 * stale-queue race risk lives.
 */
interface PlaybackHandle {
    fun setMediaItem(item: MediaItem)

    fun setMediaItems(items: List<MediaItem>)

    fun addMediaItems(items: List<MediaItem>)

    fun prepare()

    fun play()

    fun pause()

    /**
     * Seeks within the currently loaded item (Android wave 12a-A2). Distinct from
     * [seekToNext]/[seekToPrevious], which move to a different queue item — the Now Playing
     * seek bar and its skip-back/skip-forward buttons only ever move the position within one
     * item, computed by the caller (see `NowPlayingFormat.clampSeekTarget`) from a position this
     * interface never needs to expose a getter for.
     */
    fun seekTo(positionMs: Long)

    /** Advances to the next queue item, honouring repeat mode — a no-op on a single-item queue
     * (every audiobook/podcast play today), which is exactly what a disabled-looking "next"
     * button on those items should do without this app special-casing queue length itself. */
    fun seekToNext()

    /** The [seekToNext] counterpart. */
    fun seekToPrevious()

    /**
     * Index of the currently loaded item within Media3's real playlist, or `-1` if nothing is
     * loaded. Added for [PlayerViewModel.enqueueTrackNext] — "play next" means "insert
     * immediately after whatever is playing right now", which needs this index rather than a
     * fixed position (index 0 would insert *before* the current item on a queue already past
     * its first entry).
     */
    val currentMediaItemIndex: Int

    /**
     * Inserts [item] at [index] in Media3's real playlist without disturbing what is currently
     * playing or the items already queued elsewhere — [Player.addMediaItem]'s own index
     * overload. The actual "play next" primitive: unlike [addMediaItems] (append-only, used for
     * wave I's background page fetch and now also for "play last"), this can land in the middle
     * of the playlist.
     */
    fun addMediaItem(
        index: Int,
        item: MediaItem,
    )

    var shuffleModeEnabled: Boolean

    var repeatMode: Int

    val isPlaying: Boolean
}

/** Adapts a real [MediaController] to [PlaybackHandle] — the production implementation. */
private class MediaControllerPlaybackHandle(private val controller: MediaController) : PlaybackHandle {
    override fun setMediaItem(item: MediaItem) = controller.setMediaItem(item)

    override fun setMediaItems(items: List<MediaItem>) = controller.setMediaItems(items)

    override fun addMediaItems(items: List<MediaItem>) = controller.addMediaItems(items)

    override fun prepare() = controller.prepare()

    override fun play() = controller.play()

    override fun pause() = controller.pause()

    override fun seekTo(positionMs: Long) = controller.seekTo(positionMs)

    override fun seekToNext() = controller.seekToNext()

    override fun seekToPrevious() = controller.seekToPrevious()

    override val currentMediaItemIndex: Int
        get() = controller.currentMediaItemIndex

    override fun addMediaItem(
        index: Int,
        item: MediaItem,
    ) = controller.addMediaItem(index, item)

    override var shuffleModeEnabled: Boolean
        get() = controller.shuffleModeEnabled
        set(value) {
            controller.shuffleModeEnabled = value
        }

    override var repeatMode: Int
        get() = controller.repeatMode
        set(value) {
            controller.repeatMode = value
        }

    override val isPlaying: Boolean
        get() = controller.isPlaying
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
    /**
     * Test-only seam: when non-null, [activeController] returns this directly instead of
     * connecting to a real [MediaController] via [connectedController] — see [PlaybackHandle]'s
     * own doc comment for why a real connection can't run under this project's plain JVM unit
     * tests. Always `null` in production; [net.auralis.app.navigation.AuralisNavHost] never sets
     * it.
     */
    private val controllerOverride: PlaybackHandle? = null,
    /**
     * Test-only seam: converts a resolved item into the [MediaItem] handed to the controller.
     * Defaults to the real [net.auralis.app.playback.toMediaItem] conversion. Overridable because
     * that conversion reaches `android.net.Uri` (via `MediaItem.Builder.setUri`), which throws
     * under this project's unmocked test `android.jar` — see
     * `net.auralis.app.playback.MediaItemConversions`'s own doc comment. A test can supply a
     * conversion that builds a bare [MediaItem] (no `setUri`/`setArtworkUri`) instead, so
     * [playQueue]'s real generation-guard logic runs without ever touching `Uri`.
     */
    private val toPlayableMediaItem: (ResolvedPlayback) -> MediaItem = { it.toMediaItem() },
    /**
     * Android wave 12f — one independent [QueueStore] per content type (`docs/ROADMAP.md`
     * §12f, requirement 1: switching content types must never clear an unrelated queue). Public
     * so a future queue-view/context-menu surface (web's 12e/12f-2 counterparts) can read and
     * mutate them directly without this ViewModel growing a wrapper method per action; this
     * ViewModel's own use of them is limited to [handlePlaybackEnded] (podcast/audiobook advance)
     * and [playQueue] (seeding the music queue at load time — see [MusicQueueEntry]'s own doc
     * comment for why its cursor isn't kept live-synced to Media3's real position in this wave).
     * Defaulted, matching [controllerOverride]'s own pattern, so no existing construction site
     * (`AuralisNavHost.kt`) needs to change.
     *
     * **[musicQueue] is write-once and read-never in production, and that is now a settled
     * finding, not an open question.** It is seeded exactly once, in [playQueue], and nothing —
     * not [handlePlaybackEnded], not [enqueueTrackNext]/[enqueueTrackLast] — ever advances or
     * inserts into it again, because cross-track music advance and mid-playlist insertion both
     * run on Media3's own real playlist (see [PlaybackHandle.currentMediaItemIndex]/
     * [PlaybackHandle.addMediaItem]), which is the actual thing the app plays from. A wave 12e
     * defect shipped `enqueueMusicTrack` writing "Play next"/"Play last" into *this* store
     * instead of into Media3 — the insert reported success and genuinely did nothing, because
     * nothing ever reads this store's order back into the controller. The fix (see
     * [enqueueTrackNext]) inserts into Media3 directly and leaves this store untouched, rather
     * than trying to keep a second copy of the same queue in sync with it — a mirror nobody
     * reads is strictly worse than no mirror, since a future caller could reasonably assume it
     * *is* kept in sync and trust it. If Android music ever needs a real, driveable queue model
     * (a queue-view surface, matching web's), the right foundation is Media3's own playlist —
     * read via [PlaybackHandle] or the controller directly — not this class; [QueueStore]<[MusicQueueEntry]>
     * is very likely the wrong abstraction for Android music specifically, unlike its podcast/
     * audiobook siblings, which genuinely are the source of truth for their content types
     * because Media3 there only ever holds one item at a time.
     */
    val podcastQueue: QueueStore<PodcastQueueEntry> = createQueueStore(),
    val audiobookQueue: QueueStore<AudiobookQueueEntry> = createQueueStore(),
    val musicQueue: QueueStore<MusicQueueEntry> = createQueueStore(),
) : ViewModel() {
    private val _uiState = MutableStateFlow<PlayerUiState>(PlayerUiState.Idle)
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    /**
     * Which queue [handlePlaybackEnded] should advance when the currently loaded item finishes —
     * set explicitly by each of the three play entry points below ([playItem], [playEpisode],
     * [playQueue]), never inferred from the Media3 media id: see [QueueContentType]'s own doc
     * comment for why inferring it a second way would risk disagreement with the type each
     * function already knows statically.
     */
    private var currentContentType: QueueContentType? = null

    /**
     * The audiobook item id currently loaded, when [currentContentType] is
     * [QueueContentType.AUDIOBOOK] — set by [playItem]. Lets [resolveAdvanceAction] tell a
     * same-book chapter (seek within the current item) from a different book or a cross-book
     * chapter (load, then seek) without asking the controller what `MediaItem` it currently
     * holds, which [PlaybackHandle] deliberately doesn't expose (see that interface's own doc
     * comment on why its seam stays narrow).
     */
    private var currentAudiobookItemId: String? = null

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
     * Bumped on every [playQueue] call, read back by that same call's own [fetchRemaining]
     * continuation before each append. Guards against a stale wave I background append landing
     * after the user has already tapped a different track: without this, a slow
     * `appendRemainingToQueue` page fetch for album A completing after `playQueue` has already
     * been called again for album B would call [MediaController.addMediaItems] against B's
     * now-current queue with A's leftover tracks. `viewModelScope` runs on
     * `Dispatchers.Main.immediate`, so the increment below and every generation check happen on
     * the same single thread — no window for two calls to both observe a stale value.
     */
    private var queueGeneration = 0

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
                        val current = _uiState.value
                        if (current is PlayerUiState.Playing) {
                            _uiState.value =
                                current.copy(
                                    title = mediaItem?.mediaMetadata?.title?.toString() ?: current.title,
                                    isMusic = isMusicMediaId(mediaItem?.mediaId),
                                    musicItemId = jellyfinItemIdFromMediaId(mediaItem?.mediaId),
                                    artist = mediaItem?.mediaMetadata?.artist?.toString(),
                                    subtitle = mediaItem?.mediaMetadata?.subtitle?.toString(),
                                    artworkUri = mediaItem?.mediaMetadata?.artworkUri?.toString(),
                                )
                        }
                    }

                    // Keeps PlayerUiState.Playing.shuffleEnabled mirroring the controller's own
                    // state rather than an optimistic local copy that could drift — see
                    // PlayerUiState.Playing's own doc comment for why. Fires for a change made by
                    // this app (toggleShuffle below) as much as one made anywhere else the
                    // MediaSession is controlled from (Android Auto, a Bluetooth control surface).
                    override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) {
                        val current = _uiState.value
                        if (current is PlayerUiState.Playing) {
                            _uiState.value = current.copy(shuffleEnabled = shuffleModeEnabled)
                        }
                    }

                    // Same reasoning as onShuffleModeEnabledChanged above, for repeatMode.
                    override fun onRepeatModeChanged(repeatMode: Int) {
                        val current = _uiState.value
                        if (current is PlayerUiState.Playing) {
                            _uiState.value = current.copy(repeatMode = repeatMode)
                        }
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
                            // Android wave 12f: the production call site that makes the
                            // podcast/audiobook queue router live. See handlePlaybackEnded's own
                            // doc comment for why STATE_ENDED — not onMediaItemTransition — is
                            // the right listener callback for this.
                            handlePlaybackEnded()
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
     * The command-dispatch seam every play/toggle method below actually calls: [controllerOverride]
     * in a test, otherwise a real connection via [connectedController] wrapped as a
     * [PlaybackHandle]. See [PlaybackHandle]'s own doc comment for why the split sits here rather
     * than inside [connectedController] itself.
     */
    private suspend fun activeController(): PlaybackHandle =
        controllerOverride ?: MediaControllerPlaybackHandle(connectedController())

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
     *
     * [seekToMsAfterLoad] (Android wave 12f) is set only by [handlePlaybackEnded], for a
     * cross-book chapter queue entry — "load this other book, then seek to this chapter's
     * start" (see [AudiobookQueueEntry.Chapter]'s own doc comment). Every other caller
     * ([HomeScreen]/[BooksScreen]'s shelf `onClick`, matching this function's own original doc
     * comment) omits it and gets ordinary "play from the start" behaviour, unchanged.
     */
    fun playItem(
        itemId: String,
        seekToMsAfterLoad: Long? = null,
    ) {
        viewModelScope.launch {
            // Narrow ordering hazard, not currently guarded: these two fields are assigned here,
            // before playResolved's network round trip and eventual setMediaItem complete. If the
            // *previous* item hits STATE_ENDED during that window, handlePlaybackEnded runs using
            // this new book's identity while the player is still on the old one, and could issue
            // a seekTo against the wrong item. Harmless in practice today -- the subsequent
            // setMediaItem overwrites milliseconds later and no timeListened arithmetic sits in
            // this path -- but it is the same class of hazard queueGeneration exists to close for
            // playQueue's own background page-fetch race (see that field's own doc comment).
            currentContentType = QueueContentType.AUDIOBOOK
            currentAudiobookItemId = itemId
            playResolved(fallbackTitle = itemId, seekToMsAfterLoad = seekToMsAfterLoad) {
                playbackItemResolver.resolve(itemId)
            }
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
            currentContentType = QueueContentType.PODCAST
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
        seekToMsAfterLoad: Long? = null,
        resolve: suspend () -> ResolvedPlayback?,
    ) {
        // Invalidates any wave I background queue-append still in flight from a previous
        // playQueue() call — see queueGeneration's own doc comment. A book/podcast item played
        // here has no append of its own, but a prior music queue's straggling page fetch must
        // not addMediaItems() into what is about to become this single-item queue.
        queueGeneration++
        try {
            val resolved =
                resolve()
                    ?: run {
                        _uiState.value = PlayerUiState.Error("This item has no playable audio track.")
                        return
                    }
            val mediaItem = toPlayableMediaItem(resolved)
            val ctrl = activeController()
            ctrl.setMediaItem(mediaItem)
            ctrl.prepare()
            ctrl.play()
            // Android wave 12f: a cross-book chapter queue entry resolves as "load the book,
            // then seek" (see AudiobookQueueEntry.Chapter's own doc comment) — the seek happens
            // once the new item is already playing, not before, matching seekTo's own contract
            // of operating on the currently loaded item.
            if (seekToMsAfterLoad != null) ctrl.seekTo(seekToMsAfterLoad)
            val title = mediaItem.mediaMetadata.title?.toString() ?: fallbackTitle
            _uiState.value =
                PlayerUiState.Playing(
                    title = title,
                    isPlaying = true,
                    isMusic = isMusicMediaId(mediaItem.mediaId),
                    musicItemId = jellyfinItemIdFromMediaId(mediaItem.mediaId),
                    shuffleEnabled = ctrl.shuffleModeEnabled,
                    repeatMode = ctrl.repeatMode,
                    artist = mediaItem.mediaMetadata.artist?.toString(),
                    subtitle = mediaItem.mediaMetadata.subtitle?.toString(),
                    artworkUri = mediaItem.mediaMetadata.artworkUri?.toString(),
                )
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
     *
     * [fetchRemaining], added in wave I, is how a queue grows past the one page [buildQueue]
     * already resolved: once the loaded page is playing, this calls [fetchRemaining] with an
     * `onPage` callback that [Player.addMediaItems] appends to the *live* queue, one page at a
     * time, as `AlbumDetailViewModel.appendRemainingToQueue`/`PlaylistDetailViewModel`'s own
     * fetch it — see those methods' own doc comments for the fetch plan itself
     * ([appendRemainingQueuePages]). `null` (the default) means "this queue is already
     * everything there is" — [AlbumDetailScreen]/[PlaylistDetailScreen] only pass a non-null
     * lambda for their own "play album"/"play playlist" entry points. Deliberately called
     * *after* `ctrl.play()` above, not before: appending happens in the background while the
     * first track is already audible, matching this wave's own "must not block playback start"
     * requirement — `apps/web/src/features/music/musicQueueController.ts`'s `beginMusicQueue`
     * settled the identical design for the web player.
     *
     * [Player.addMediaItems] appends without touching the item currently playing or the
     * shuffle history behind it: Media3's `ShuffleOrder` implementations support insertion
     * (`ShuffleOrder.cloneAndInsert`), so a queue running with `shuffleModeEnabled` gets the
     * newly-appended items folded into its shuffle order rather than the order being rebuilt
     * from scratch or the current item restarting. Not independently exercised here — no JDK/
     * Android SDK on this machine to run a real `ExoPlayer` against — so this rests on Media3's
     * own documented contract for `addMediaItems`, not a local repro.
     */
    fun playQueue(
        buildQueue: suspend () -> List<ResolvedPlayback>,
        fetchRemaining: (suspend (onPage: suspend (List<ResolvedPlayback>) -> Unit) -> Unit)? = null,
    ) {
        viewModelScope.launch {
            currentContentType = QueueContentType.MUSIC
            val myGeneration = ++queueGeneration
            try {
                val queue = buildQueue()
                if (queue.isEmpty()) {
                    _uiState.value = PlayerUiState.Error("This item has no playable audio track.")
                    return@launch
                }
                // Android wave 12f: seeds the independent music queue model at cursor 0 (the
                // first track, about to play below) — see MusicQueueEntry's own doc comment for
                // why this store's cursor isn't kept live-synced to Media3's real position in
                // this wave.
                musicQueue.setQueue(
                    SimpleQueueState(
                        order = queue.map { MusicQueueEntry(itemId = it.mediaId, title = it.title, artist = it.artist) },
                        cursor = 0,
                    ),
                )
                val mediaItems = queue.map(toPlayableMediaItem)
                val ctrl = activeController()
                ctrl.setMediaItems(mediaItems)
                ctrl.prepare()
                ctrl.play()
                val firstMediaItem = mediaItems.first()
                val title = firstMediaItem.mediaMetadata.title?.toString() ?: queue.first().title
                _uiState.value =
                    PlayerUiState.Playing(
                        title = title,
                        isPlaying = true,
                        isMusic = isMusicMediaId(firstMediaItem.mediaId),
                        musicItemId = jellyfinItemIdFromMediaId(firstMediaItem.mediaId),
                        shuffleEnabled = ctrl.shuffleModeEnabled,
                        repeatMode = ctrl.repeatMode,
                        artist = firstMediaItem.mediaMetadata.artist?.toString(),
                        subtitle = firstMediaItem.mediaMetadata.subtitle?.toString(),
                        artworkUri = firstMediaItem.mediaMetadata.artworkUri?.toString(),
                    )
                if (fetchRemaining != null) {
                    fetchRemaining { page ->
                        // Stale-queue guard: see queueGeneration's own doc comment. Checked
                        // before every append, not just once before the whole fetchRemaining
                        // call, since a multi-page album's fetch spans several suspension
                        // points any one of which a newer playQueue()/playResolved() call could
                        // land in between.
                        if (page.isEmpty() || queueGeneration != myGeneration) return@fetchRemaining
                        activeController().addMediaItems(page.map(toPlayableMediaItem))
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Total function, matching playResolved: a failed MediaController connection or
                // a failed buildQueue() degrades to an error state rather than crashing this
                // ViewModel's coroutine scope. A failure inside fetchRemaining itself is already
                // handled one level down, in appendRemainingQueuePages — a failed page fetch
                // there returns quietly rather than throwing, so it never reaches this catch.
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /**
     * Android wave 12f — the podcast/audiobook queue router's production entry point, called
     * from the [Player.Listener] above's `onPlaybackStateChanged` on `STATE_ENDED`. Deliberately
     * a plain method rather than logic inlined into that listener callback: a JVM unit test has
     * no way to drive a real Media3 `STATE_ENDED` (see [PlaybackHandle]'s own doc comment — this
     * project has no Robolectric), but it *can* call [handlePlaybackEnded] directly against the
     * [controllerOverride] fake to simulate "playback just ended" and assert on what got
     * dispatched, the same pattern every other method in this class already tests against.
     *
     * `STATE_ENDED`, not `onMediaItemTransition`, is the right callback to call this from: a
     * multi-item Media3 playlist (music) already advances itself internally on every item but
     * the last, and only reaches `STATE_ENDED` once the whole playlist is exhausted — by which
     * point [resolveAdvanceAction] already has nothing to do for [QueueContentType.MUSIC] (see
     * [QueueAdvanceAction.None]'s own doc comment). For a single-item load (podcast episode,
     * audiobook item — today's only shape for those two types), `STATE_ENDED` is the *only*
     * moment "this finished, what's next" is ever true.
     *
     * `internal`, not `private`: this project's Kotlin test source set is compiled against
     * `internal` members of the main source set (a plain Gradle/Kotlin capability, no
     * `@VisibleForTesting` needed), which is exactly what a JVM test calling this directly (see
     * this doc comment's own opening paragraph) needs.
     */
    internal fun handlePlaybackEnded() {
        val action =
            resolveAdvanceAction(
                finishedContentType = currentContentType,
                currentAudiobookItemId = currentAudiobookItemId,
                podcastQueue = podcastQueue,
                audiobookQueue = audiobookQueue,
            )
        when (action) {
            is QueueAdvanceAction.None -> Unit
            is QueueAdvanceAction.SeekWithinCurrent -> {
                // Same-book chapter: seek only, never reload — see AudiobookQueueEntry.Chapter's
                // own doc comment for why a reload would corrupt Audiobookshelf's
                // timeListened tracking. currentAudiobookItemId is left as-is: the book itself
                // hasn't changed.
                viewModelScope.launch {
                    try {
                        activeController().seekTo(action.positionMs)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
                    }
                }
            }
            is QueueAdvanceAction.LoadAudiobookItem -> playItem(action.itemId, seekToMsAfterLoad = action.thenSeekToMs)
            is QueueAdvanceAction.LoadPodcastEpisode -> playEpisode(action.itemId, action.episodeId)
        }
    }

    /**
     * Inserts [resolved] immediately after the currently-playing item in Media3's real
     * playlist — the "Play next" action from a track's long-press context menu
     * (`features/music/TrackContextMenu.kt`'s `enqueueTrackViaMediaController`). This is the
     * fix for a shipped defect: the wave that added the menu wrote into [musicQueue] instead,
     * which nothing ever reads back into playback, so the action reported success and queued
     * nothing (see [musicQueue]'s own doc comment for the full account). Inserting into the
     * *real* Media3 playlist is what actually changes what plays next.
     *
     * Refuses — returns `false`, inserts nothing — unless [currentContentType] is
     * [QueueContentType.MUSIC]. That covers both "nothing is playing" (`currentContentType` is
     * `null`) and "a book or podcast is playing" (`AUDIOBOOK`/`PODCAST`): in both cases there is
     * no music playlist to insert a track into, and splicing a song into an audiobook's Media3
     * timeline would be worse than doing nothing — the caller is expected to tell the user
     * rather than silently swallow the refusal, matching `apps/web/src/features/music/
     * TrackContextMenu.tsx`'s identical one-message-covers-both-cases choice.
     */
    suspend fun enqueueTrackNext(resolved: ResolvedPlayback): Boolean {
        if (currentContentType != QueueContentType.MUSIC) return false
        return try {
            val ctrl = activeController()
            ctrl.addMediaItem(ctrl.currentMediaItemIndex + 1, toPlayableMediaItem(resolved))
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
    }

    /**
     * The [enqueueTrackNext] counterpart for "Play last" — appends [resolved] to the end of
     * Media3's real playlist via [PlaybackHandle.addMediaItems] instead of inserting after the
     * current item. Same refusal rule and reasoning as [enqueueTrackNext]; see that method's
     * doc comment.
     */
    suspend fun enqueueTrackLast(resolved: ResolvedPlayback): Boolean {
        if (currentContentType != QueueContentType.MUSIC) return false
        return try {
            activeController().addMediaItems(listOf(toPlayableMediaItem(resolved)))
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
    }

    /** Toggles play/pause on the currently loaded item. A no-op when nothing is loaded. */
    fun togglePlayPause() {
        viewModelScope.launch {
            val current = _uiState.value
            if (current !is PlayerUiState.Playing) return@launch
            try {
                val ctrl = activeController()
                if (ctrl.isPlaying) ctrl.pause() else ctrl.play()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /**
     * Seeks within the currently loaded item to [positionMs] (Android wave 12a-A2) — the Now
     * Playing seek bar's `onValueChangeFinished` and its skip-back/skip-forward buttons both
     * call this with a target already clamped by `NowPlayingFormat.clampSeekTarget`/
     * `positionMsFromFraction`, so this method does no clamping of its own: [PlaybackHandle]'s
     * own [PlaybackHandle.seekTo] simply forwards to [Player.seekTo], which already clamps to
     * `[0, duration]` internally. A no-op when nothing is loaded, matching [togglePlayPause]'s
     * own early return.
     */
    fun seekTo(positionMs: Long) {
        viewModelScope.launch {
            if (_uiState.value !is PlayerUiState.Playing) return@launch
            try {
                activeController().seekTo(positionMs)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /** Advances to the next queue item — the Now Playing transport row's "next" button. */
    fun skipToNext() {
        viewModelScope.launch {
            if (_uiState.value !is PlayerUiState.Playing) return@launch
            try {
                activeController().seekToNext()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /** The [skipToNext] counterpart — the Now Playing transport row's "previous" button. */
    fun skipToPrevious() {
        viewModelScope.launch {
            if (_uiState.value !is PlayerUiState.Playing) return@launch
            try {
                activeController().seekToPrevious()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /**
     * A cold flow of [PlaybackProgress] (Android wave 12a-A2), sampled every
     * [NOW_PLAYING_PROGRESS_TICK_MS] while collected — the Now Playing seek bar's data source.
     * Same "fresh `flow {}` per collector, runs only while collected" shape as
     * [lyricsPositionMsFlow], and the same reason: a Compose `collectAsState` call site stops
     * collecting (and this loop stops running) the instant Now Playing leaves composition, with
     * no manual start/stop bookkeeping needed. Reads [controller] directly rather than through
     * [PlaybackHandle], matching [lyricsPositionMsFlow]'s own doc comment on why that widening
     * isn't worth it for a read-only position/duration sample no test here needs to fake.
     * Emits nothing while [controller] is null, degrading to "no update" rather than throwing.
     */
    fun playbackProgressFlow(): Flow<PlaybackProgress> =
        flow {
            while (true) {
                controller?.let { emit(PlaybackProgress(positionMs = it.currentPosition, durationMs = it.duration)) }
                delay(NOW_PLAYING_PROGRESS_TICK_MS)
            }
        }

    /**
     * Toggles shuffle on the underlying [MediaController] — Media3's own shuffle, not a
     * hand-rolled permutation (see this file's doc comment / `docs/HANDOVER.md` wave H entry for
     * why). A no-op when the current item isn't music or nothing is loaded; [_uiState] itself
     * updates from [Player.Listener.onShuffleModeEnabledChanged] once the controller applies the
     * change, not from this call directly, so it never drifts from what the player actually
     * holds.
     */
    fun toggleShuffle() {
        viewModelScope.launch {
            val current = _uiState.value
            if (current !is PlayerUiState.Playing || !current.isMusic) return@launch
            try {
                val ctrl = activeController()
                ctrl.shuffleModeEnabled = !ctrl.shuffleModeEnabled
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /**
     * Cycles repeat mode off -> all -> one -> off (see [nextRepeatMode]) on the underlying
     * [MediaController]. Same music-only gate and same "state comes back through the listener,
     * not written optimistically here" shape as [toggleShuffle].
     */
    fun cycleRepeatMode() {
        viewModelScope.launch {
            val current = _uiState.value
            if (current !is PlayerUiState.Playing || !current.isMusic) return@launch
            try {
                val ctrl = activeController()
                ctrl.repeatMode = nextRepeatMode(ctrl.repeatMode)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Could not connect to the player: ${e.message}")
            }
        }
    }

    /**
     * A cold flow of the current playback position in milliseconds (Android wave J), sampled
     * every [LYRICS_POSITION_TICK_MS] while collected — the finer-grained position source the
     * lyrics view needs, distinct from [JELLYFIN_PROGRESS_TICK_MS]'s 15s network-reporting
     * ticker (see that constant's own doc comment for why the two must stay independent).
     *
     * Deliberately a fresh `flow { }` per collector, not a [StateFlow] this ViewModel keeps
     * running for its own lifetime the way the 15s Jellyfin ticker does: a `flow { }` builder's
     * loop only runs for as long as something is actively collecting it, and stops the moment
     * that collection is cancelled. A Compose call site (`collectAsState`) collects for exactly
     * as long as the composable that calls it stays in composition, so "this ticker only runs
     * while the lyrics screen is visible" falls out of ordinary structured-concurrency
     * cancellation — no manual start/stop bookkeeping needed here, and no risk of a
     * lyrics-precision ticker silently continuing to run (and burning battery) after the user has
     * navigated away.
     *
     * Reads the private [controller] field directly, not through [activeController]/
     * [PlaybackHandle]: [PlaybackHandle] exists only to make the wave I queue-dispatch commands
     * (`setMediaItem(s)`/`prepare`/`play`/shuffle/repeat) testable against a fake, and extending
     * it with a `currentPosition` getter for this one read would widen that seam for no test in
     * this file that needs it — [activeLineIndex] (the logic actually worth unit-testing here)
     * takes a plain position, not a [PlaybackHandle]. Emits nothing while [controller] is null
     * (not yet connected, or already torn down) rather than throwing, matching this file's
     * "total, degrades rather than throws" style; a collector simply sees no position update
     * until a controller exists.
     */
    fun lyricsPositionMsFlow(): Flow<Long> =
        flow {
            while (true) {
                controller?.let { emit(it.currentPosition) }
                delay(LYRICS_POSITION_TICK_MS)
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
