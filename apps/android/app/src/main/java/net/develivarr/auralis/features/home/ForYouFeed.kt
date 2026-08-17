package net.develivarr.auralis.features.home

import net.develivarr.auralis.data.model.JellyfinAlbum
import net.develivarr.auralis.data.model.LibraryItem
import net.develivarr.auralis.data.model.MusicRecommendedAlbum
import net.develivarr.auralis.data.model.Shelf

/**
 * Pure aggregation for the "For you" feed (docs/ROADMAP.md §12d) — the Android mirror of
 * `apps/web/src/features/home/forYouFeed.ts`. There is no BFF endpoint that returns one
 * mixed-type home feed — Audiobookshelf's per-library home shelves and Jellyfin's favourite
 * albums are independent fetches — so this is where they get stitched into one uniform list of
 * [FeedCarousel]s, all meant to render with exactly one card geometry ([ForYouCard] in
 * `ForYouCarousel.kt`), plus a flat [buildQuickPicks] list for the grid at the top of the
 * screen. No Android imports, no [net.develivarr.auralis.data.network.ApiClient] — kept out of
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
    /** Wave 15d — `true` only for a [recommendedAlbumsToCarousel] item whose
     * [MusicRecommendedAlbum.availability] is not `"owned"`: a recommendation from an outside
     * provider (ListenBrainz) that the signed-in user does not have in their Jellyfin library.
     * Defaults `false` for every other caller ([shelfToCarousel]'s books/podcasts,
     * [albumsToCarousel]'s Jellyfin favourites) — none of which has an externality concept, since
     * every item they produce is, by definition, already owned. Drives two things: the "Not in
     * your library" badge/announcement ([net.develivarr.auralis.features.home
     * .feedItemAnnouncement], `ForYouCard`'s visible overlay) and, in
     * [net.develivarr.auralis.features.music.MusicLibraryScreen]'s recommended section, routing
     * a tap to the music request flow instead of the album-detail screen — an external
     * candidate's [id] is opaque and namespaced (`external:<provider>:<id>`), so opening it as a
     * Jellyfin album id would be a dead end. */
    val isExternal: Boolean = false,
)

data class FeedCarousel(
    val id: String,
    val label: String,
    val contentType: ForYouContentType,
    val items: List<FeedItem>,
    /** Wave 13d — set only for shelves that came from `GET /libraries/{id}/recommended`
     * ([Shelf.reason] on the wire); `null` for every ordinary Audiobookshelf home shelf and for
     * [albumsToCarousel]'s Jellyfin favourites, both of which have no such concept. Display-only,
     * server-composed text of unspecified length and exact wording (`docs/ROADMAP.md` §13's
     * `buildRecommendationShelves`) — never asserted on verbatim, never assumed short. */
    val reason: String? = null,
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
        reason = shelf.reason,
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
    /** Wave 13f-2's addition, for [net.develivarr.auralis.features.music.MusicLibraryViewModel]'s
     * `GET /music/recommended` shelves — `null` for every pre-existing caller (Jellyfin
     * favourites have no such concept), same convention as [Shelf.reason]/[FeedCarousel.reason].
     * Placed before the trailing lambda, not after, so every existing call site's trailing-
     * lambda syntax (`albumsToCarousel(id, label, albums) { ... }`) keeps compiling unchanged —
     * Kotlin resolves a trailing lambda to the last parameter regardless of a defaulted
     * parameter in between. */
    reason: String? = null,
    artworkUrl: (albumId: String) -> String?,
): FeedCarousel =
    FeedCarousel(
        id = id,
        label = label,
        contentType = ForYouContentType.MUSIC,
        reason = reason,
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

/** [albumsToCarousel]'s counterpart for `GET /music/recommended`'s shelves (wave 15d), the only
 * caller whose items can carry [MusicRecommendedAlbum.availability] `"external"` rather than
 * `"owned"`. Kept as its own function rather than widening [albumsToCarousel]'s parameter type,
 * because that function's only other caller
 * ([net.develivarr.auralis.features.home.ForYouViewModel]'s Jellyfin-favourites carousel) has no
 * externality concept at all — every favourite album is, by definition, already owned — so
 * giving it a parameter it could never use meaningfully would be worse than one small extra
 * function. [FeedItem.isExternal] is derived by comparing [MusicRecommendedAlbum.availability]
 * to the literal `"owned"` string, never by matching an id prefix — see that field's own doc
 * comment for why, and for why any value other than `"owned"` degrades to "treat as external"
 * rather than "treat as owned". */
fun recommendedAlbumsToCarousel(
    id: String,
    label: String,
    albums: List<MusicRecommendedAlbum>,
    reason: String? = null,
    artworkUrl: (albumId: String) -> String?,
): FeedCarousel =
    FeedCarousel(
        id = id,
        label = label,
        contentType = ForYouContentType.MUSIC,
        reason = reason,
        items =
            albums.map { album ->
                FeedItem(
                    id = album.id,
                    contentType = ForYouContentType.MUSIC,
                    title = album.name,
                    subtitle = album.artistName,
                    coverUrl = artworkUrl(album.id),
                    progress = null,
                    isExternal = album.availability != "owned",
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
