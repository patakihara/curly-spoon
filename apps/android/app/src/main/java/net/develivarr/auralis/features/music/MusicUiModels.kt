package net.develivarr.auralis.features.music

import net.develivarr.auralis.data.model.JellyfinAlbum
import net.develivarr.auralis.data.model.JellyfinArtist
import net.develivarr.auralis.data.model.JellyfinPlaylist
import net.develivarr.auralis.data.model.JellyfinPlaylistItem
import kotlin.math.roundToLong

/** How many items each `artists()`/`albums()`/`tracks()` page requests — matches
 * `apps/web/src/api/queries.ts`'s `JELLYFIN_PAGE_SIZE`, for no reason other than there being
 * no cause to pick a different number for the same upstream on a different client. */
internal const val MUSIC_PAGE_SIZE = 40

/** One artist row on [MusicLibraryScreen] (or, via [FavoritesScreen], the favourites listing). */
data class MusicArtistUi(
    val id: String,
    val name: String,
    val coverUrl: String?,
    val favorite: Boolean = false,
)

/** One album row on [MusicLibraryScreen] or [ArtistDetailScreen] — the same shape serves both,
 * since both are "a list of albums", just scoped differently upstream ([MusicRepository.albums]'s
 * own `artistId` parameter). Also used by [FavoritesScreen]'s favourite-albums listing. */
data class MusicAlbumUi(
    val id: String,
    val name: String,
    val artistName: String?,
    val coverUrl: String?,
    val favorite: Boolean = false,
)

/** Shared by [MusicLibraryViewModel] (the unscoped library-wide list); kept `internal`, not
 * `private`, because it is also called from [ArtistDetailViewModel] (the artist-scoped list) and
 * [FavoritesViewModel] (the favourites-only listing) — all three need the exact same
 * [JellyfinArtist]/[JellyfinAlbum] → UI-row mapping and cover-URL construction. */
internal fun JellyfinArtist.toUi(baseUrl: String?): MusicArtistUi =
    MusicArtistUi(id = id, name = name, coverUrl = jellyfinItemArtworkUrl(baseUrl, id), favorite = favorite)

internal fun JellyfinAlbum.toUi(baseUrl: String?): MusicAlbumUi =
    MusicAlbumUi(
        id = id,
        name = name,
        artistName = artistName,
        coverUrl = jellyfinItemArtworkUrl(baseUrl, id),
        favorite = favorite,
    )

/** One playlist row on [PlaylistsScreen] and one entry of the "add to playlist" sheet
 * ([AddToPlaylistSheet]). */
data class MusicPlaylistUi(
    val id: String,
    val name: String,
    val trackCount: Int?,
    val coverUrl: String?,
)

internal fun JellyfinPlaylist.toUi(baseUrl: String?): MusicPlaylistUi =
    MusicPlaylistUi(id = id, name = name, trackCount = trackCount, coverUrl = jellyfinItemArtworkUrl(baseUrl, id))

/** One track row on [PlaylistDetailScreen] — one occurrence of a track *within* a playlist, in
 * stored playlist order. [playlistItemId] is this occurrence's own id, distinct from
 * [trackId] — see [net.develivarr.auralis.data.model.JellyfinPlaylistItem.playlistItemId]'s doc
 * comment for why the distinction is load-bearing: removal keys on [playlistItemId], never
 * [trackId], so the same track appearing twice in one playlist can be removed once without
 * touching the other occurrence. */
data class MusicPlaylistEntryUi(
    val playlistItemId: String,
    val trackId: String,
    val title: String,
    val artistNames: String?,
    val albumId: String?,
    val durationSeconds: Long,
)

internal fun JellyfinPlaylistItem.toUi(): MusicPlaylistEntryUi =
    MusicPlaylistEntryUi(
        playlistItemId = playlistItemId,
        trackId = track.id,
        title = track.name,
        artistNames = track.artistNames.joinToString(", ").takeIf { it.isNotBlank() },
        albumId = track.albumId,
        durationSeconds = (track.durationSeconds ?: 0.0).roundToLong(),
    )
