package net.auralis.app.features.home

import net.auralis.app.data.model.JellyfinAlbum
import net.auralis.app.data.model.LibraryItem
import net.auralis.app.data.model.Shelf

/**
 * Pure aggregation for the "For you" feed (docs/ROADMAP.md §12d) — the Android mirror of
 * `apps/web/src/features/home/forYouFeed.ts`. There is no BFF endpoint that returns one
 * mixed-type home feed — Audiobookshelf's per-library home shelves and Jellyfin's favourite
 * albums are independent fetches — so this is where they get stitched into one uniform list of
 * [FeedCarousel]s, all meant to render with exactly one card geometry ([ForYouCard] in
 * `ForYouCarousel.kt`), plus a flat [buildQuickPicks] list for the grid at the top of the
 * screen. No Android imports, no [net.auralis.app.data.network.ApiClient] — kept out of
 * [ForYouViewModel] for the same reason web keeps this logic out of `HomePage.tsx`: this is
 * behaviour worth testing directly, not through a Composable.
 */
enum class ForYouContentType { BOOKS, PODCASTS, MUSIC }

data class FeedItem(
    val id: String,
    val contentType: ForYouContentType,
    val title: String,
    val subtitle: String?,
    val coverUrl: String?,
    /** 0..1, or `null` for content with no progress concept (a Jellyfin album). */
    val progress: Double?,
)

data class FeedCarousel(
    val id: String,
    val label: String,
    val contentType: ForYouContentType,
    val items: List<FeedItem>,
)

/** `authors[]` is the richer, structured field and wins when present; `author` is the free-text
 * fallback some upstream shapes send instead — mirrors web's identical `bookAuthorLabel`, which
 * itself mirrors the audiobook-only `HomeScreen`'s original rule. */
private fun bookAuthorLabel(item: LibraryItem): String? {
    val joined = item.media.authors?.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.name }
    return joined ?: item.media.author
}

/**
 * One Audiobookshelf shelf (a "Continue Listening", "Recently Added", …) becomes one carousel.
 * [contentType] is passed in by the caller rather than read off [Shelf.type] — a podcast
 * library's shelves can carry `type: "episode"` while still belonging to the podcast content
 * type, so the library the shelf came from is the source of truth, not the shelf's own type
 * string. Only [ForYouContentType.BOOKS]/[ForYouContentType.PODCASTS] are meaningful callers;
 * [ForYouContentType.MUSIC] has no shelf concept and goes through [albumsToCarousel] instead.
 */
fun shelfToCarousel(
    shelf: Shelf,
    contentType: ForYouContentType,
    coverUrl: (itemId: String) -> String?,
): FeedCarousel =
    FeedCarousel(
        id = shelf.id,
        label = shelf.label,
        contentType = contentType,
        items =
            shelf.items.map { item ->
                FeedItem(
                    id = item.id,
                    contentType = contentType,
                    title = item.media.title,
                    subtitle =
                        if (contentType == ForYouContentType.BOOKS) {
                            bookAuthorLabel(item)
                        } else {
                            item.media.author
                        },
                    coverUrl = coverUrl(item.id),
                    progress = item.progress?.progress,
                )
            },
    )

/** Jellyfin has no "shelf" concept — this wraps whatever album list the caller already fetched
 * (favourite albums today) into the same [FeedCarousel] shape a book/podcast shelf produces, so
 * the rest of this file and [ForYouCard] never need to know the difference. */
fun albumsToCarousel(
    id: String,
    label: String,
    albums: List<JellyfinAlbum>,
    artworkUrl: (albumId: String) -> String?,
): FeedCarousel =
    FeedCarousel(
        id = id,
        label = label,
        contentType = ForYouContentType.MUSIC,
        items =
            albums.map { album ->
                FeedItem(
                    id = album.id,
                    contentType = ForYouContentType.MUSIC,
                    title = album.name,
                    subtitle = album.artistName,
                    coverUrl = artworkUrl(album.id),
                    progress = null,
                )
            },
    )

/** Which carousels the current content-type filter should render. `"all"` (and, degrading
 * rather than throwing, any value this function doesn't recognise) shows every carousel. */
fun filterCarousels(
    carousels: List<FeedCarousel>,
    filter: String,
): List<FeedCarousel> {
    val type =
        when (filter) {
            "books" -> ForYouContentType.BOOKS
            "podcasts" -> ForYouContentType.PODCASTS
            "music" -> ForYouContentType.MUSIC
            else -> return carousels
        }
    return carousels.filter { it.contentType == type }
}

/**
 * The quick-selection grid: up to [max] items, taken round-robin across [carousels] — one from
 * the first carousel, one from the second, …, wrapping back around to the first once every
 * carousel has contributed one item — rather than draining one carousel before touching the
 * next. That mixes content types the way the reference screenshots' own grid does, instead of
 * defaulting to "whatever the first carousel happens to be" whenever more than one content type
 * has data.
 */
fun buildQuickPicks(
    carousels: List<FeedCarousel>,
    max: Int = 8,
): List<FeedItem> {
    val picks = mutableListOf<FeedItem>()
    var round = 0
    while (picks.size < max) {
        val before = picks.size
        for (carousel in carousels) {
            if (picks.size >= max) break
            carousel.items.getOrNull(round)?.let { picks.add(it) }
        }
        if (picks.size == before) break // no carousel had anything left this round
        round += 1
    }
    return picks
}
