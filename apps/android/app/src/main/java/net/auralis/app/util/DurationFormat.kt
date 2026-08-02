package net.auralis.app.util

/**
 * Formats a duration in seconds the way a playback position/remaining-time label should
 * read: "h:mm:ss" once an hour is reached, "m:ss" below that. Negative input is clamped to
 * zero rather than thrown on — a transient negative position from a player callback
 * shouldn't crash a progress label.
 */
fun formatDuration(seconds: Long): String {
    val clamped = if (seconds < 0) 0 else seconds
    val hours = clamped / 3600
    val minutes = (clamped % 3600) / 60
    val secs = clamped % 60

    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, secs)
    } else {
        "%d:%02d".format(minutes, secs)
    }
}
