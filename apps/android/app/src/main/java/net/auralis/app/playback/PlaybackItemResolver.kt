package net.auralis.app.playback

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import net.auralis.app.data.model.LibraryItem
import net.auralis.app.data.model.PlaybackSession
import net.auralis.app.data.network.ApiClient
import net.auralis.app.data.network.ApiException
import net.auralis.app.data.network.fileIdFromContentUrl
import net.auralis.app.data.settings.ServerConfigRepository
import net.auralis.app.features.player.firstPlayableTrack

/**
 * Turns a browse-tree or phone-UI item id into a fully-populated, playable [MediaItem]: the BFF
 * playback session round trip, first-track selection, file-id extraction and audio URL, plus the
 * enriched [MediaMetadata] (title/artist/artwork) both surfaces need.
 *
 * A plain class, not a `ViewModel`: [AuralisMediaLibraryService] is a `MediaLibraryService`,
 * which has no `ViewModelStore` to scope one to, so this has to be constructible directly (see
 * that class's `onCreate`, alongside [BrowseTreeRepository]). [net.auralis.app.AppContainer]
 * constructs a second instance for [net.auralis.app.features.player.PlayerViewModel]'s phone-UI
 * path — the two previously built their own, diverging `MediaMetadata` (bare title only from the
 * ViewModel, full metadata from the service); this class is now the *only* place either surface
 * builds one, so lock-screen/Auto and the phone UI can no longer drift apart.
 */
class PlaybackItemResolver(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
) {
    /**
     * Resolves [mediaId] into a playable [MediaItem], or `null` when it isn't one — an
     * unrecognised id, a folder/series browse node (browsable, not playable), an item with no
     * playable track, or any [ApiException] along the way. Total function, matching
     * [BrowseTreeRepository]'s own degrade-rather-than-throw style: a bad or transient upstream
     * response should leave one item unplayable, not crash the `future{}` bridge in
     * [AuralisMediaLibraryService] or the caller's coroutine in
     * [net.auralis.app.features.player.PlayerViewModel].
     *
     * Accepts three id shapes: a `book:`-prefixed browse id (from [BrowseTreeRepository], as
     * Android Auto hands back exactly what [BrowseIds.book] produced), a bare item id (the phone
     * UI's `HomeScreen` passes `LibraryItem.id` directly, and a controller may also replay a
     * persisted bare id across process death), or a `series:`-prefixed / root-folder id, which is
     * rejected — those are browsable, not playable, and resolving one would silently hand the
     * player a folder with nothing to play.
     */
    suspend fun resolve(mediaId: String): MediaItem? {
        val itemId = playableItemId(mediaId) ?: return null
        return try {
            val session = apiClient.playItem(itemId)
            val track = firstPlayableTrack(session) ?: return null
            val fileId = fileIdFromContentUrl(track.contentUrl) ?: return null
            val trackUrl = apiClient.audioTrackUrl(itemId, fileId)
            MediaItem.Builder()
                .setMediaId(mediaId)
                .setUri(trackUrl)
                .setMediaMetadata(buildMetadata(itemId, session))
                .build()
        } catch (e: ApiException) {
            null
        }
    }

    /**
     * The browse tree's folder ids ([BrowseIds.ROOT]/[BrowseIds.CONTINUE]/[BrowseIds.BOOKS]/
     * [BrowseIds.SERIES]) carry no prefix the way a series node does, so they need their own
     * explicit rejection here rather than falling through [BrowseIds.isSeriesNode]'s check — a
     * defensive belt for a request that should never reach this method in practice (those items
     * are all `isPlayable = false`), kept because a total function shouldn't trust a caller's
     * MediaController to only ever ask for what it was told is playable.
     */
    private fun playableItemId(mediaId: String): String? =
        when {
            BrowseIds.isBookNode(mediaId) -> BrowseIds.itemIdFrom(mediaId)
            BrowseIds.isSeriesNode(mediaId) -> null
            mediaId == BrowseIds.ROOT || mediaId == BrowseIds.CONTINUE ||
                mediaId == BrowseIds.BOOKS || mediaId == BrowseIds.SERIES -> null
            else -> mediaId
        }

    /**
     * [PlaybackSession] (from `POST /items/:id/play`) carries a display title but no author —
     * that only comes back from `GET /items/:id`, hence the one extra network call here. Fetched
     * after track resolution succeeds, not before, so a track-less item degrades to `null`
     * without spending it.
     *
     * The artwork URL is *not* part of that extra call: it's built the same way
     * `BrowseTreeRepository.toBrowseBook` builds it, from the base URL and item id alone, so the
     * two constructions can't silently diverge into two different cover-art formats.
     */
    private suspend fun buildMetadata(
        itemId: String,
        session: PlaybackSession,
    ): MediaMetadata {
        val libraryItem = libraryItemOrNull(itemId)
        val media = libraryItem?.media
        val artist =
            media?.authors?.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.name }
                ?: media?.author
        val artworkUri =
            serverConfigRepository.getBaseUrl()?.let {
                Uri.parse("${it.trimEnd('/')}/api/v1/media/$itemId/cover?width=200")
            }
        return MediaMetadata.Builder()
            .setTitle(session.displayTitle)
            .setIsPlayable(true)
            .setIsBrowsable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK)
            .apply {
                artist?.let { setArtist(it) }
                media?.subtitle?.let { setSubtitle(it) }
                artworkUri?.let { setArtworkUri(it) }
            }
            .build()
    }

    // Degrades to null rather than propagating: this call is metadata enrichment, not the
    // playable URL itself, so a failure here should leave the item playing with plainer
    // metadata, not unplayable.
    private suspend fun libraryItemOrNull(itemId: String): LibraryItem? =
        try {
            apiClient.libraryItem(itemId)
        } catch (e: ApiException) {
            null
        }
}
