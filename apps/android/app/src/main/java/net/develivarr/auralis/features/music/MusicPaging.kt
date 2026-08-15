package net.develivarr.auralis.features.music

/**
 * Whether a paginated Jellyfin list — [loadedCount] items already in hand, against the
 * upstream's own [total] — has another page worth requesting. [total] is the BFF's
 * normalized field name, not Jellyfin's `TotalRecordCount` (see [MusicRepository]'s own doc
 * comments on [ArtistsPageResult]/[AlbumsPageResult]/[TracksPageResult]). Kept as its own pure
 * function, the same reasoning `EpisodeProgress.kt`'s `episodeProgressState` gives for staying
 * out of a ViewModel: testable without a `ViewModel`, a coroutine, or a network.
 */
fun hasMoreMusicPages(
    loadedCount: Int,
    total: Int,
): Boolean = loadedCount < total
