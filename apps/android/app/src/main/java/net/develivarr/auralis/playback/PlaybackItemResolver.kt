package net.develivarr.auralis.playback

import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.model.PlaybackSession
import net.develivarr.auralis.data.network.ApiClient
import net.develivarr.auralis.data.network.ApiException
import net.develivarr.auralis.data.network.fileIdFromContentUrl
import net.develivarr.auralis.data.settings.ServerConfigRepository
import net.develivarr.auralis.features.player.firstPlayableTrack
import kotlin.math.roundToLong

/**
 * A resolved, playable item, expressed without any Media3 type so it stays JVM-unit-testable —
 * see [PlaybackItemResolver]'s own doc comment for why `MediaItem` construction can't happen
 * here. [MediaItemConversions.toMediaItem]/[MediaItemConversions.toMediaItemsWithStartPosition]
 * are the only places this becomes one.
 */
data class ResolvedPlayback(
    val mediaId: String, // the browse id as it was asked for, so controller item identity is stable
    val uri: String, // the resolved audioTrackUrl
    val title: String,
    val artist: String?,
    val subtitle: String?,
    val artworkUrl: String?,
    // Where Audiobookshelf's own play session says this item was last left off — see
    // buildResolvedPlayback's doc comment for where this comes from. Used by Wave E2c's
    // playback-resumption path; every other caller of resolve() ignores it today.
    val startPositionMs: Long,
)

/**
 * Turns a browse-tree or phone-UI item id into a fully-populated, playable [ResolvedPlayback]:
 * the BFF playback session round trip, first-track selection, file-id extraction and audio URL,
 * plus the enriched title/artist/artwork metadata both surfaces need.
 *
 * Deliberately free of any `android.*`/`androidx.*` (Media3 in particular) import, matching
 * [BrowseTreeRepository]'s own style: `MediaItem.Builder().setUri(String)` reaches
 * `android.net.Uri.parse`, and this project's unit tests run against the stub `android.jar`,
 * whose methods throw `RuntimeException` when called (no Robolectric here). Any code that
 * constructs a `MediaItem` is therefore unit-untestable in this project by construction, so that
 * construction is isolated in [MediaItemConversions] instead, at the two edges
 * ([AuralisMediaLibraryService] and [net.develivarr.auralis.features.player.PlayerViewModel]) that
 * actually need a `MediaItem` to hand to Media3.
 *
 * A plain class, not a `ViewModel`: [AuralisMediaLibraryService] is a `MediaLibraryService`,
 * which has no `ViewModelStore` to scope one to, so this has to be constructible directly (see
 * that class's `onCreate`, alongside [BrowseTreeRepository]). [net.develivarr.auralis.AppContainer]
 * constructs a second instance for [net.develivarr.auralis.features.player.PlayerViewModel]'s phone-UI
 * path — the two previously built their own, diverging metadata (bare title only from the
 * ViewModel, full metadata from the service); this class is now the *only* place either surface
 * resolves one, so lock-screen/Auto and the phone UI can no longer drift apart.
 */
class PlaybackItemResolver(
    private val apiClient: ApiClient,
    private val serverConfigRepository: ServerConfigRepository,
) {
    /**
     * Resolves [mediaId] into a playable [ResolvedPlayback], or `null` when it isn't one — an
     * unrecognised id, a folder/series browse node (browsable, not playable), an item with no
     * playable track, or any [ApiException] along the way. Total function, matching
     * [BrowseTreeRepository]'s own degrade-rather-than-throw style: a bad or transient upstream
     * response should leave one item unplayable, not crash the `future{}` bridge in
     * [AuralisMediaLibraryService] or the caller's coroutine in
     * [net.develivarr.auralis.features.player.PlayerViewModel].
     *
     * Accepts three id shapes: a `book:`-prefixed browse id (from [BrowseTreeRepository], as
     * Android Auto hands back exactly what [BrowseIds.book] produced), a bare item id (the phone
     * UI's `HomeScreen` passes `LibraryItem.id` directly, and a controller may also replay a
     * persisted bare id across process death), or a `series:`-prefixed / root-folder id, which is
     * rejected — those are browsable, not playable, and resolving one would silently hand the
     * player a folder with nothing to play.
     */
    suspend fun resolve(mediaId: String): ResolvedPlayback? {
        val itemId = playableItemId(mediaId) ?: return null
        return try {
            val session = apiClient.playItem(itemId)
            val track = firstPlayableTrack(session) ?: return null
            val fileId = fileIdFromContentUrl(track.contentUrl) ?: return null
            val trackUrl = apiClient.audioTrackUrl(itemId, fileId)
            buildResolvedPlayback(mediaId, itemId, trackUrl, session)
        } catch (e: ApiException) {
            null
        }
    }

    /**
     * The episode-scoped counterpart to [resolve] — a podcast episode is not reachable through
     * [BrowseIds]'s book/series id scheme at all (that scheme is Android Auto's book browse
     * tree only; podcast Android Auto nodes are a later wave, per `docs/ROADMAP.md` §8), so this
     * is a separate entry point rather than another `mediaId` prefix [playableItemId] would need
     * to learn. [net.develivarr.auralis.features.player.PlayerViewModel.playEpisode] is the only
     * caller today.
     *
     * Shares [buildResolvedPlayback] with [resolve] unchanged: [ApiClient.playEpisode] returns
     * the same [net.develivarr.auralis.data.model.PlaybackSession] shape [ApiClient.playItem] does —
     * confirmed directly in `packages/abs-client/src/client.ts`, where `playItem`/`playEpisode`
     * decode the *same* `rawPlaybackSessionSchema` through the *same* `normalizePlaybackSession`
     * — just already scoped to one episode's single track, so first-track selection, file-id
     * extraction and metadata enrichment all apply identically. The resulting track URL
     * ([ApiClient.audioTrackUrl]) is built from [itemId] — the *podcast container's* id, not the
     * episode's — matching `apps/web/src/features/player/useAudioElement.ts`'s
     * `api.audioTrackUrl(currentItem.id, fileId)`, and `apps/server/src/routes/media.ts`'s
     * `/media/:itemId/track/:fileId` route does no book/podcast validation of its own: it's a
     * pure range-forwarding proxy to Audiobookshelf's own `/api/items/:id/file/:fileId`, which
     * resolves a fileId under whichever item owns it, book or podcast alike.
     * [ResolvedPlayback.title] ends up as the episode's own title (`session.displayTitle`) and
     * [ResolvedPlayback.artist] as the podcast's author (from the enclosing
     * [net.develivarr.auralis.data.model.LibraryItem], fetched by [itemId] the same way a book's does)
     * — there is no separate "episode author" concept.
     */
    suspend fun resolveEpisode(
        itemId: String,
        episodeId: String,
    ): ResolvedPlayback? {
        return try {
            val session = apiClient.playEpisode(itemId, episodeId)
            val track = firstPlayableTrack(session) ?: return null
            val fileId = fileIdFromContentUrl(track.contentUrl) ?: return null
            val trackUrl = apiClient.audioTrackUrl(itemId, fileId)
            buildResolvedPlayback(episodeMediaId(itemId, episodeId), itemId, trackUrl, session)
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
     * The controller-facing identity for a playing episode — distinct from a book's bare item
     * id so the two can never collide in whatever keys by `mediaId` downstream (e.g. a future
     * "now playing" lookup). Not one of [BrowseIds]'s prefixes deliberately: those are Android
     * Auto browse-tree ids specifically, and this id is never handed to that tree.
     */
    private fun episodeMediaId(
        itemId: String,
        episodeId: String,
    ): String = "episode:$itemId:$episodeId"

    /**
     * [PlaybackSession] (from `POST /items/:id/play`) carries a display title but no author —
     * that only comes back from `GET /items/:id`, hence the one extra network call here. Fetched
     * after track resolution succeeds, not before, so a track-less item degrades to `null`
     * without spending it.
     *
     * The artwork URL is *not* part of that extra call: it's built the same way
     * `BrowseTreeRepository.toBrowseBook` builds it, from the base URL and item id alone, so the
     * two constructions can't silently diverge into two different cover-art formats.
     *
     * `subtitle` falls back to the author string when `LibraryItem.media.subtitle` is null (true
     * for the overwhelming majority of audiobooks, which have no subtitle field populated) —
     * matching [BrowseTreeRepository.toBrowseBook], which puts the author in `BrowseBook.subtitle`
     * since it has no separate artist concept. Without this fallback, a browse row shows title +
     * author and the subtitle line goes blank the instant the same item starts playing.
     *
     * `startPositionMs` comes from `session.currentTime` — [PlaybackSession] (`POST
     * /items/:id/play`) already carries Audiobookshelf's own record of where this item was last
     * left off, the same field this method already had in hand for every other caller of
     * [resolve] and simply wasn't reading. No second network call, and no separate "progress"
     * concept: it's the position the *play* endpoint itself hands back for resuming, which is
     * exactly what Wave E2c's `onPlaybackResumption` needs.
     */
    private suspend fun buildResolvedPlayback(
        mediaId: String,
        itemId: String,
        trackUrl: String,
        session: PlaybackSession,
    ): ResolvedPlayback {
        val libraryItem = libraryItemOrNull(itemId)
        val media = libraryItem?.media
        val artist =
            media?.authors?.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.name }
                ?: media?.author
        val artworkUrl =
            serverConfigRepository.getBaseUrl()?.let {
                "${it.trimEnd('/')}/api/v1/media/$itemId/cover?width=200"
            }
        return ResolvedPlayback(
            mediaId = mediaId,
            uri = trackUrl,
            title = session.displayTitle,
            artist = artist,
            subtitle = media?.subtitle ?: artist,
            artworkUrl = artworkUrl,
            startPositionMs = (session.currentTime * 1000).roundToLong(),
        )
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
