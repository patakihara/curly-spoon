package net.auralis.app.features.music

import net.auralis.app.data.model.JellyfinAlbum
import net.auralis.app.data.model.JellyfinArtist

/** How many items each `artists()`/`albums()`/`tracks()` page requests — matches
 * `apps/web/src/api/queries.ts`'s `JELLYFIN_PAGE_SIZE`, for no reason other than there being
 * no cause to pick a different number for the same upstream on a different client. */
internal const val MUSIC_PAGE_SIZE = 40

/** One artist row on [MusicLibraryScreen]. */
data class MusicArtistUi(
    val id: String,
    val name: String,
    val coverUrl: String?,
)

/** One album row on [MusicLibraryScreen] or [ArtistDetailScreen] — the same shape serves both,
 * since both are "a list of albums", just scoped differently upstream ([MusicRepository.albums]'s
 * own `artistId` parameter). */
data class MusicAlbumUi(
    val id: String,
    val name: String,
    val artistName: String?,
    val coverUrl: String?,
)

/** Shared by [MusicLibraryViewModel] (the unscoped library-wide list); kept `internal`, not
 * `private`, because it is also called from [ArtistDetailViewModel] (the artist-scoped list) —
 * both need the exact same [JellyfinArtist]/[JellyfinAlbum] → UI-row mapping and cover-URL
 * construction. */
internal fun JellyfinArtist.toUi(baseUrl: String?): MusicArtistUi =
    MusicArtistUi(id = id, name = name, coverUrl = jellyfinItemArtworkUrl(baseUrl, id))

internal fun JellyfinAlbum.toUi(baseUrl: String?): MusicAlbumUi =
    MusicAlbumUi(id = id, name = name, artistName = artistName, coverUrl = jellyfinItemArtworkUrl(baseUrl, id))
