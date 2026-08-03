package net.auralis.app.data.network

/**
 * `AudioTrack.contentUrl` is upstream's own path (`/api/items/:itemId/file/:fileId`); the BFF's
 * proxy route only needs the trailing `fileId` segment (`ApiClient.audioTrackUrl(itemId, fileId)`).
 * Mirrors `apps/web/src/features/player/playback.ts`'s `fileIdFromContentUrl` exactly. Degrades to
 * `null` rather than throwing for malformed input — a track missing/short a `contentUrl` should
 * leave a track unplayable, not crash the player.
 */
fun fileIdFromContentUrl(contentUrl: String?): String? {
    if (contentUrl.isNullOrEmpty()) return null
    val segments = contentUrl.split('/').filter { it.isNotEmpty() }
    return segments.lastOrNull()
}
