package net.auralis.app.data.downloads

/**
 * One row for the downloads screen (and the Android Auto "Downloaded" browse node): every
 * [DownloadedItem] track belonging to one library item, reduced to a single state and byte count
 * a user can read at a glance. [DownloadRepository.enqueue] downloads *every* track of a book
 * (see its own doc comment), so a UI surfacing "what's downloaded" must roll those tracks up per
 * item rather than showing one row per file — nobody thinks of "chapter file 4 of 12" as their
 * own downloaded item.
 */
data class DownloadSummary(
    val itemId: String,
    val state: DownloadState,
    val bytesDownloaded: Long,
    val totalBytes: Long,
)

/**
 * Reduces every track belonging to one item to a single [DownloadSummary]. `null` for an empty
 * list — an item with zero tracks isn't "downloaded", it's not tracked at all, and fabricating a
 * zero-state summary would render a row for a book the user never actually asked to keep offline.
 *
 * **State priority, worst-first**: any [DownloadState.FAILED] track means the whole item reads as
 * failed — a book missing one of twelve chapters is exactly as un-listen-through-able as one
 * where every chapter failed, so reporting "11/12 done" and hiding the one that broke would be
 * more misleading than useful. Short of a failure, any track still in flight
 * ([DownloadState.QUEUED], [DownloadState.DOWNLOADING], [DownloadState.PAUSED]) collapses the
 * item to [DownloadState.DOWNLOADING]: this summary backs one progress row per *item*, not per
 * track, and those three in-flight states all render identically there (a progress bar), unlike
 * [DownloadState.COMPLETED]. Only when every track is [DownloadState.COMPLETED] does the item
 * itself read as complete.
 *
 * **`bytesDownloaded`/`totalBytes`** are plain sums across tracks — except `totalBytes`, which
 * becomes `0` (this package's "unknown" sentinel; see [DownloadedItem.totalBytes]'s own doc
 * comment) the moment *any* track's own total is unknown. Summing only the tracks whose total
 * happens to be known would understate the book's real total, and could make [downloadProgress]
 * briefly report the item as further along — or even "done" — than it actually is. Reporting the
 * whole item as unknown-progress is the honest choice while an accurate total isn't computable.
 */
fun summarizeDownloads(tracks: List<DownloadedItem>): DownloadSummary? {
    if (tracks.isEmpty()) return null
    val itemId = tracks.first().itemId
    val state =
        when {
            tracks.any { it.state == DownloadState.FAILED } -> DownloadState.FAILED
            tracks.all { it.state == DownloadState.COMPLETED } -> DownloadState.COMPLETED
            else -> DownloadState.DOWNLOADING
        }
    val bytesDownloaded = tracks.sumOf { it.bytesDownloaded }
    val totalBytes = if (tracks.any { it.totalBytes <= 0 }) 0L else tracks.sumOf { it.totalBytes }
    return DownloadSummary(itemId, state, bytesDownloaded, totalBytes)
}
