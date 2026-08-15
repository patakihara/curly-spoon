package net.develivarr.auralis.data.downloads

/**
 * Lifecycle of one downloaded audio track, independent of whatever framework type eventually
 * backs it (Media3's `Download.STATE_*` in [DownloadRepository]'s case — see
 * `downloadStateFromMedia3` in `DownloadStateMapping.kt` for that mapping). Plain enum so this
 * package stays free of `androidx.media3`/`android.*` imports, matching [PlaybackItemResolver]
 * and [BrowseTreeRepository]'s existing style: this project's unit tests run against a stub
 * `android.jar` whose methods throw, so any Media3/Android type in a file makes it
 * unit-untestable here.
 */
enum class DownloadState { QUEUED, DOWNLOADING, COMPLETED, FAILED, PAUSED }

/**
 * One track's download, at file granularity — [DownloadRepository]'s decision (see its own doc
 * comment) is to download *every* track of a multi-track audiobook, not just the first one
 * [net.develivarr.auralis.playback.PlaybackItemResolver] resolves for playback, so one library item
 * (`itemId`) can own several [DownloadedItem]s, one per `fileId`.
 *
 * Framework-free by construction: no `Uri`, no `File`, no Media3 `Download`. See this package's
 * other files' doc comments for why that matters to this project's test setup.
 */
data class DownloadedItem(
    val itemId: String,
    val fileId: String,
    val state: DownloadState,
    val bytesDownloaded: Long,
    // Unknown size is represented as <= 0 (0, Media3's C.LENGTH_UNSET == -1, or any other
    // non-positive value a caller might pass) rather than a single reserved sentinel: whatever
    // produces this value degrades to "unknown" on *any* non-positive input rather than only the
    // one value it happens to know about today. See [downloadProgress]'s own doc comment for the
    // consequence of that choice.
    val totalBytes: Long,
    // Populated only when state == FAILED; null otherwise. Not enforced by the type system
    // (a data class can't express that conditional relationship without extra machinery this
    // wave doesn't need) but documented as the contract every writer of this field should follow.
    val failureReason: String? = null,
)

/**
 * Fraction complete, clamped to `0f..1f`. Total function: never divides by zero, never returns
 * `NaN`/`Infinity`, and never reports "done" for a track that has actually overrun its declared
 * size (a total that shrank mid-download, or a total that was simply wrong).
 *
 * `totalBytes <= 0` means "unknown" (see [DownloadedItem.totalBytes]'s doc comment) and reports
 * `0f` rather than guessing — a progress bar that can't know how far along it is should read as
 * "not started" rather than silently inventing a number, since a value like `0.5f` would read to
 * a user as "half done" when the real answer is "no idea".
 */
fun downloadProgress(
    bytesDownloaded: Long,
    totalBytes: Long,
): Float {
    if (totalBytes <= 0) return 0f
    val fraction = bytesDownloaded.toDouble() / totalBytes.toDouble()
    return fraction.toFloat().coerceIn(0f, 1f)
}
