package net.auralis.app.features.player

import net.auralis.app.features.music.MusicRepository

/**
 * The real [JellyfinPlaybackReportSender], wiring [JellyfinPlaybackReporter]'s start/progress/
 * stopped decisions through [MusicRepository]'s three playback-report methods.
 * [MusicRepository]'s own methods already degrade an upstream failure into a
 * `PlaybackReportResult.Failed` rather than throwing (matching every other method on that
 * class) — this adapter treats that the same as success from [JellyfinPlaybackReporter]'s point
 * of view: there is nothing useful to do differently on failure (see
 * [JellyfinPlaybackReporter.dispatch]'s own doc comment — a failed report is swallowed one layer
 * up regardless), so there is deliberately nothing here to inspect or retry.
 */
class JellyfinApiPlaybackReportSender(
    private val musicRepository: MusicRepository,
) : JellyfinPlaybackReportSender {
    override suspend fun reportStart(
        itemId: String,
        positionSeconds: Double,
    ) {
        musicRepository.reportPlaybackStart(itemId, positionSeconds)
    }

    override suspend fun reportProgress(
        itemId: String,
        positionSeconds: Double,
        isPaused: Boolean,
    ) {
        musicRepository.reportPlaybackProgress(itemId, positionSeconds, isPaused)
    }

    override suspend fun reportStopped(
        itemId: String,
        positionSeconds: Double,
    ) {
        musicRepository.reportPlaybackStopped(itemId, positionSeconds)
    }
}
