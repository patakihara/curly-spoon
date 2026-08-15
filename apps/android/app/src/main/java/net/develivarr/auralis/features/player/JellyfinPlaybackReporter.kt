package net.develivarr.auralis.features.player

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** The Media3 media-id prefix a Jellyfin music queue item carries — see
 * `net.develivarr.auralis.features.music.albumPlaybackQueue`, the one place that constructs one
 * (`"track:${track.id}"`). Distinct from `net.develivarr.auralis.playback.PlaybackItemResolver`'s own
 * `book:`/`episode:` schemes (audiobook/podcast ids never collide with this one, by that class's
 * own doc comment), which is exactly what makes it a safe gate: any media id *not* carrying this
 * prefix is, by construction, not a Jellyfin item at all. */
internal const val MUSIC_MEDIA_ID_PREFIX = "track:"

/**
 * Extracts the Jellyfin item id [JellyfinPlaybackReporter] should report against from a Media3
 * media id, or `null` when [mediaId] isn't a music item — the single gating point that keeps
 * audiobook/podcast playback silent to Jellyfin (see [MUSIC_MEDIA_ID_PREFIX]'s own doc comment
 * for why a non-`track:` id can never collide with a real music item's own id).
 */
internal fun jellyfinItemIdFromMediaId(mediaId: String?): String? =
    mediaId
        ?.takeIf { it.startsWith(MUSIC_MEDIA_ID_PREFIX) }
        ?.removePrefix(MUSIC_MEDIA_ID_PREFIX)
        ?.takeIf { it.isNotEmpty() }

/**
 * Where [JellyfinPlaybackReporter] sends the three Jellyfin playback-report calls it decides to
 * make. A plain interface, not `net.develivarr.auralis.features.music.MusicRepository` directly, so
 * [JellyfinPlaybackReporter]'s own start/progress/stopped/dedup decisions stay unit-testable
 * against a fake, without a real network round trip — the same reasoning
 * `docs/HANDOVER.md`'s "Android CI" section gives for why an optimistic/intermediate state needs
 * a controllable seam rather than `MockWebServer`. [JellyfinApiPlaybackReportSender] is the real
 * implementation, wiring these three methods through `MusicRepository`.
 */
interface JellyfinPlaybackReportSender {
    suspend fun reportStart(
        itemId: String,
        positionSeconds: Double,
    )

    suspend fun reportProgress(
        itemId: String,
        positionSeconds: Double,
        isPaused: Boolean,
    )

    suspend fun reportStopped(
        itemId: String,
        positionSeconds: Double,
    )
}

/**
 * Decides *when* to call [sender]'s start/progress/stopped methods as Media3 playback state
 * changes, scoped to music items only — every entry point below runs the new/changed media id
 * through [jellyfinItemIdFromMediaId] first, so a book or podcast episode never produces a
 * report. Plain Kotlin, no Media3/Android import, matching this project's existing pattern of
 * isolating untestable Android glue (`net.develivarr.auralis.playback.MediaItemConversions`,
 * `net.develivarr.auralis.playback.PlaybackItemResolver`) from the decision logic that drives it.
 * [PlayerViewModel] is the only caller: it translates its own `Player.Listener` callbacks and a
 * periodic ticker into the calls below, which is the untestable wiring layer CI compiles but no
 * test exercises.
 *
 * Mirrors `apps/web/src/features/player/playbackSource.ts`'s `jellyfinSource`, with one
 * deliberate difference explained by a platform difference, not a design disagreement: web has
 * no natural "track changed" event, so it fires its start report lazily, on the first progress
 * tick after a track resolves (see that file's own doc comment, decision 1). Media3 has a real
 * one — `Player.Listener.onMediaItemTransition` — so [onMediaItemChanged] below fires start (and
 * stopped, for whatever music item was previously current) eagerly, right on the transition,
 * instead of waiting for the next tick.
 *
 * The one bug this design deliberately avoids reproducing: `reportStart` carries no `isPaused`
 * of its own (see [JellyfinPlaybackReportSender.reportStart]'s parameter list, matching the BFF
 * route it wraps — Jellyfin's own `ReportPlaybackStart` has no such field either), so a track
 * left paused would otherwise keep showing as playing on Jellyfin indefinitely. Every place this
 * class sends a `start` report immediately follows it with a *forced* progress report carrying
 * the real `isPlaying` state — [onMediaItemChanged] does this explicitly — so a paused first
 * tick is corrected within the same call, never left to a later, possibly-skipped tick.
 *
 * All state is plain mutable fields, not a `StateFlow`: this class has nothing to publish to.
 * [PlayerViewModel] drives every entry point directly, synchronously with respect to each other
 * — Media3 delivers `Player.Listener` callbacks on the main thread, and a ticker built on
 * `viewModelScope` runs on `Dispatchers.Main.immediate`, the same single-threaded guarantee
 * [PlayerViewModel]'s own `pendingController` doc comment already relies on for a different
 * reason.
 */
class JellyfinPlaybackReporter(
    private val sender: JellyfinPlaybackReportSender,
    private val scope: CoroutineScope,
) {
    private var currentItemId: String? = null
    private var lastKnownPositionSeconds: Double = 0.0
    private var lastReportedPaused: Boolean? = null
    private var lastReportedPositionSeconds: Double? = null

    /**
     * The active item changed — a queue auto-advance, a seek that landed on a different item, or
     * a brand-new `setMediaItem(s)` call replacing whatever was playing. Ends the previous music
     * item (if any) with a `stopped` report at its own last known position, then — if the new
     * item is music — starts it: an eager `start` report at [positionSeconds] (the new item's
     * own starting position — 0 for a freshly queued track, non-zero only if playback resumed
     * mid-item), immediately followed by a forced progress report carrying [isPlaying] (see this
     * class's own header for why that pairing is load-bearing).
     */
    fun onMediaItemChanged(
        newMediaId: String?,
        positionSeconds: Double,
        isPlaying: Boolean,
    ) {
        val previousItemId = currentItemId
        if (previousItemId != null) {
            dispatch { sender.reportStopped(previousItemId, lastKnownPositionSeconds) }
        }
        val newItemId = jellyfinItemIdFromMediaId(newMediaId)
        currentItemId = newItemId
        lastKnownPositionSeconds = positionSeconds
        lastReportedPaused = null
        lastReportedPositionSeconds = null
        if (newItemId == null) return
        dispatch { sender.reportStart(newItemId, positionSeconds) }
        reportProgress(positionSeconds, isPlaying, force = true)
    }

    /** A periodic tick — the reporting cadence itself lives in [PlayerViewModel], not here.
     * Deduplicated against the last report actually sent: an unmoving, unchanged tick (the
     * common case while paused) is dropped rather than spammed every cadence. */
    fun onTick(
        positionSeconds: Double,
        isPlaying: Boolean,
    ) = reportProgress(positionSeconds, isPlaying, force = false)

    /** A play/pause transition — reported immediately, bypassing dedup, rather than waiting for
     * the next [onTick]: a pause should reach Jellyfin right away, not up to one tick interval
     * late. */
    fun onIsPlayingChanged(
        positionSeconds: Double,
        isPlaying: Boolean,
    ) = reportProgress(positionSeconds, isPlaying, force = true)

    /** A user-initiated seek that lands within the *currently playing* item — a seek that lands
     * on a different item is [onMediaItemChanged]'s job instead (see [PlayerViewModel]'s wiring
     * for how the two are told apart). Always reports, bypassing dedup: the whole point of a
     * seek is that the position just changed, even when play state didn't. */
    fun onSeek(
        positionSeconds: Double,
        isPlaying: Boolean,
    ) = reportProgress(positionSeconds, isPlaying, force = true)

    /** Playback ended with nothing next to transition to, or the controller is going away
     * entirely — either way [onMediaItemChanged] never fires, so nothing else closes out the
     * current item. Sends a final `stopped` report for whatever music item was current, then
     * clears state. A no-op when nothing music was playing. */
    fun onStopped(positionSeconds: Double) {
        val itemId = currentItemId ?: return
        dispatch { sender.reportStopped(itemId, positionSeconds) }
        currentItemId = null
        lastReportedPaused = null
        lastReportedPositionSeconds = null
    }

    private fun reportProgress(
        positionSeconds: Double,
        isPlaying: Boolean,
        force: Boolean,
    ) {
        val itemId = currentItemId ?: return
        lastKnownPositionSeconds = positionSeconds
        val isPaused = !isPlaying
        if (!force && isPaused == lastReportedPaused && positionSeconds == lastReportedPositionSeconds) {
            return
        }
        lastReportedPaused = isPaused
        lastReportedPositionSeconds = positionSeconds
        dispatch { sender.reportProgress(itemId, positionSeconds, isPaused) }
    }

    /**
     * Fires [block] on [scope], swallowing everything but [CancellationException] — a failed
     * report must leave Jellyfin's resume position slightly stale, never interrupt playback or
     * propagate into the caller's own coroutine. Matches this project's existing
     * degrade-rather-than-throw house style (e.g. `PlaybackItemResolver.resolve`'s own
     * `catch (e: ApiException) { null }`), generalised to "anything but cancellation" here
     * because [JellyfinPlaybackReportSender] is a plain interface with no fixed exception type
     * to catch.
     */
    private fun dispatch(block: suspend () -> Unit) {
        scope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Non-fatal by design — see this method's own doc comment above.
            }
        }
    }
}
