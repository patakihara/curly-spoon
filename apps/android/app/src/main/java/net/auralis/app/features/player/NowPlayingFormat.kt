package net.auralis.app.features.player

import androidx.media3.common.C
import net.auralis.app.util.formatDuration

/**
 * The pure logic behind the Now Playing surface (Android wave 12a-A2) — no Compose, no
 * [androidx.media3.session.MediaController], so all of it runs as a plain JVM unit test. Kept
 * separate from [NowPlayingScreen] and [PlayerViewModel] the same way [nextRepeatMode]/
 * [isMusicMediaId] are kept out of [MiniPlayerBar] in this same package: the parts worth
 * asserting against live here, the Compose/Media3 plumbing that can't be unit-tested lives
 * elsewhere.
 */

/**
 * A sampled point on the timeline: the currently loaded item's position and duration in
 * milliseconds. [durationMs] is [C.TIME_UNSET] (a large negative sentinel, per
 * [androidx.media3.common.Player.getDuration]'s own contract) whenever the player hasn't
 * resolved a duration yet — a live HLS transcode stream, or the brief window right after
 * `prepare()` before Media3 has read the container. Every function below treats that sentinel,
 * and any other non-positive value, as "unknown" rather than a crash or a garbage fraction.
 */
data class PlaybackProgress(val positionMs: Long, val durationMs: Long)

/**
 * The Now Playing seek bar's `Slider` value: [positionMs] as a fraction of [durationMs] in
 * `0f..1f`. Never divides by zero and never returns outside that range — a duration that is
 * zero, negative, or [C.TIME_UNSET] (unknown) yields `0f`, and a position past the end (the
 * final progress tick before `onMediaItemTransition` fires, or a player that briefly reports
 * position > duration during a seek) clamps to `1f` rather than overshooting the slider track.
 */
fun sliderFraction(
    positionMs: Long,
    durationMs: Long,
): Float {
    if (durationMs <= 0L) return 0f
    val clampedPositionMs = positionMs.coerceIn(0L, durationMs)
    return (clampedPositionMs.toDouble() / durationMs.toDouble()).toFloat().coerceIn(0f, 1f)
}

/**
 * [sliderFraction]'s inverse: what position a dragged slider [fraction] corresponds to, so
 * `onValueChangeFinished` can call [PlayerViewModel.seekTo] with a millisecond target instead of
 * a bare fraction. `0L` when [durationMs] is unknown — there is no meaningful position to seek
 * to on a track whose length the player hasn't resolved, so the slider is degenerate (always at
 * `0f` per [sliderFraction] above) and dragging it can't produce a fraction worth honouring.
 */
fun positionMsFromFraction(
    fraction: Float,
    durationMs: Long,
): Long {
    if (durationMs <= 0L) return 0L
    return (fraction.coerceIn(0f, 1f) * durationMs).toLong().coerceIn(0L, durationMs)
}

/** The elapsed-time label to the left of the seek bar — plain "so far" time, clamped so a
 * transient negative position never renders as a negative label. */
fun elapsedTimeLabel(positionMs: Long): String = formatDuration(positionMs.coerceAtLeast(0L) / 1000)

/**
 * The remaining-time label to the right of the seek bar, counting *down* (a leading "-"), the
 * Spotify/YouTube Music convention this project's references both use. `"--:--"` when
 * [durationMs] is unknown, since there is nothing to count down from — showing `0:00` would
 * read as "finished" rather than "unknown", which is worse.
 */
fun remainingTimeLabel(
    positionMs: Long,
    durationMs: Long,
): String {
    if (durationMs <= 0L) return "--:--"
    val remainingMs = (durationMs - positionMs).coerceAtLeast(0L)
    return "-" + formatDuration(remainingMs / 1000)
}

/**
 * The subtitle line under the title on Now Playing. [artist] wins when present — it already
 * carries the right per-media-type answer upstream ([net.auralis.app.playback.PlaybackItemResolver]
 * sets it to the author for an audiobook; `albumPlaybackQueue` sets it to the track's own artist
 * for music) — and [subtitle] (album name for music, author-fallback for a book/podcast with no
 * separate subtitle) is the fallback when there's no artist at all. `null` when neither is
 * present, so the screen can skip rendering an empty line rather than showing blank space.
 */
fun resolveSubtitle(
    artist: String?,
    subtitle: String?,
): String? = artist?.takeIf { it.isNotBlank() } ?: subtitle?.takeIf { it.isNotBlank() }

/**
 * Where a skip-back/skip-forward tap should land: [positionMs] + [deltaMs] (negative for
 * skip-back), clamped to `0` at the low end always, and to [durationMs] at the high end only
 * when it's known — an unknown duration means there's nothing to clamp against yet, so a skip
 * forward on a not-yet-resolved stream is left unclamped above rather than silently capped at
 * zero (which [sliderFraction]'s own "unknown duration" case would otherwise suggest).
 */
fun clampSeekTarget(
    positionMs: Long,
    deltaMs: Long,
    durationMs: Long,
): Long {
    val target = positionMs + deltaMs
    val upperBound = if (durationMs > 0L) durationMs else Long.MAX_VALUE
    return target.coerceIn(0L, upperBound)
}
