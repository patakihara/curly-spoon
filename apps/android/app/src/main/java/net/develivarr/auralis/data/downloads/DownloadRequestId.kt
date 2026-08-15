package net.develivarr.auralis.data.downloads

/**
 * Media3's `DownloadRequest`/`Download` are keyed by one opaque `String` id; this package's
 * [DownloadedItem] is keyed by the pair (`itemId`, `fileId`) — see that class's own doc comment
 * for why a multi-track audiobook needs both. `Media3DownloadEngine` (Wave F2a) is the only
 * place a [DownloadRequestId] should ever be encoded into, or decoded out of, a real Media3
 * `DownloadRequest.id`/`Download.request.id`; this class exists as a pure, framework-free
 * function pair so that round-tripping is unit-tested without a single `androidx.media3` import,
 * matching this package's established split (see `DownloadStateMapping.kt`'s own doc comment on
 * why any Media3/Android import makes a file unit-untestable under this project's stub
 * `android.jar` test setup).
 *
 * [SEPARATOR] is the ASCII Unit Separator control character (code point 0x1F) rather than a
 * printable character like `:` — `itemId` comes from Audiobookshelf and `fileId` from a URL path
 * segment (see [net.develivarr.auralis.data.network.fileIdFromContentUrl]), and neither is guaranteed
 * not to contain a colon or any other printable delimiter. Unit Separator is a control character
 * no legitimate id is ever going to contain, so splitting on it can never misparse a real id that
 * happens to look like the delimiter — matching this project's total-function house style (a
 * parser should never guess).
 */
data class DownloadRequestId(val itemId: String, val fileId: String) {
    /** The literal id to hand to Media3's `DownloadRequest.Builder`. */
    fun encode(): String = "$itemId$SEPARATOR$fileId"

    companion object {
        /**
         * Built from its numeric code point (31 decimal / 0x1F hex) rather than a literal escape
         * sequence in this source file, so the delimiter stays a plain, greppable line instead
         * of an invisible byte sitting between two quote marks.
         */
        private val SEPARATOR: String = 31.toChar().toString()

        /**
         * Inverse of [encode]. `null` for any id this package didn't itself produce — a download
         * left over from a build that used a different convention, or simply garbage a caller
         * shouldn't trust — so code iterating Media3's `DownloadIndex` can skip anything
         * unrecognised rather than crash on it, matching this project's total-function house
         * style.
         */
        fun decode(id: String): DownloadRequestId? {
            val separatorIndex = id.indexOf(SEPARATOR)
            if (separatorIndex < 0) return null
            val itemId = id.substring(0, separatorIndex)
            val fileId = id.substring(separatorIndex + 1)
            if (itemId.isEmpty() || fileId.isEmpty()) return null
            return DownloadRequestId(itemId, fileId)
        }
    }
}
