package net.auralis.app.data.downloads

/**
 * In-memory [DownloadEngine] test double — what [DownloadRepository] is tested against, matching
 * `FakeKeyValueStore`'s role for `KeyValueStore`. Records every `enqueue`/`cancel` call so tests
 * can assert on exactly what [DownloadRepository] asked for, and tracks live entries so
 * [downloadsFor] reflects them.
 *
 * [isAvailable] defaults to `true` (a normal, working engine) but is settable — pass `false` to
 * stand in for [UnavailableDownloadEngine] in a test while still recording calls, which the real
 * [UnavailableDownloadEngine] (a true no-op) cannot do. Calls made while unavailable are still
 * recorded rather than suppressed here, so a test can assert [DownloadRepository] never even
 * attempted one, instead of trusting the fake to withhold it.
 */
class FakeDownloadEngine(override val isAvailable: Boolean = true) : DownloadEngine {
    data class EnqueueCall(val itemId: String, val fileId: String, val uri: String)
    data class CancelCall(val itemId: String, val fileId: String)

    val enqueueCalls = mutableListOf<EnqueueCall>()
    val cancelCalls = mutableListOf<CancelCall>()
    private val entries = mutableMapOf<Pair<String, String>, DownloadedItem>()

    override suspend fun enqueue(
        itemId: String,
        fileId: String,
        uri: String,
    ) {
        enqueueCalls += EnqueueCall(itemId, fileId, uri)
        entries[itemId to fileId] =
            DownloadedItem(
                itemId = itemId,
                fileId = fileId,
                state = DownloadState.QUEUED,
                bytesDownloaded = 0,
                totalBytes = 0,
            )
    }

    override suspend fun cancel(
        itemId: String,
        fileId: String,
    ) {
        cancelCalls += CancelCall(itemId, fileId)
        entries.remove(itemId to fileId)
    }

    override suspend fun downloadsFor(itemId: String): List<DownloadedItem> = entries.values.filter { it.itemId == itemId }

    /**
     * Test-only: directly inserts (or overwrites) one track's entry, bypassing [enqueue]'s
     * hardcoded [DownloadState.QUEUED] default — lets a test set up an already-[DownloadState
     * .COMPLETED] (or otherwise arbitrary) download without walking through a full
     * enqueue-then-progress lifecycle no fake here can simulate.
     */
    fun seed(item: DownloadedItem) {
        entries[item.itemId to item.fileId] = item
    }

    /**
     * Test-only: removes every track entry for [itemId] without recording a [cancelCalls] entry
     * or touching [DownloadRepository]'s kept-offline bookkeeping — simulates the engine having
     * lost its record of an item through some path other than [DownloadRepository.cancel], which
     * a caller reading [downloadsFor] must degrade to "nothing known" for rather than fabricate.
     */
    fun forgetAllTracks(itemId: String) {
        entries.keys.filter { it.first == itemId }.forEach { entries.remove(it) }
    }
}
