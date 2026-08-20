package net.develivarr.auralis.features.search

/** Where selecting a [SearchSuggestionUi] navigates — the exact same target its kind's row in
 * the full results list below already navigates to (`docs/design/screens/SEARCH.md` §6.2's
 * "Selection" rule: "no new routes"). [TrackAlbum] is always constructed with a non-null
 * `albumId` — [deriveSearchSuggestions] excludes a track with none entirely, the same "nowhere
 * to go" rule §5 already applies to the full track list. */
sealed interface SearchSuggestionTarget {
    data class Book(val id: String) : SearchSuggestionTarget

    data class Podcast(val id: String) : SearchSuggestionTarget

    data class Artist(val id: String) : SearchSuggestionTarget

    data class Album(val id: String) : SearchSuggestionTarget

    data class TrackAlbum(val albumId: String) : SearchSuggestionTarget
}

/**
 * One typeahead suggestion (`docs/design/screens/SEARCH.md` §6.2). [title] is the plain,
 * undecorated title — what selecting the suggestion writes back into the search field, per
 * §6.2's "Selection" rule ("the suggestion's plain title (not the decorated '· Kind' label)").
 * [label] is the full `"{title} · {Kind}"` display string (§6.2), built once here rather than at
 * each render site so the dropdown item and its `contentDescription` (§11) always agree by
 * construction.
 */
data class SearchSuggestionUi(
    val id: String,
    val title: String,
    val label: String,
    val target: SearchSuggestionTarget,
)

/** §3's Suggestion cap — 8 total, across all kinds combined, a product decision made once in
 * the spec with no Sonora source. */
internal const val SEARCH_SUGGESTION_CAP = 8

/**
 * Derives up to [SEARCH_SUGGESTION_CAP] typeahead suggestions (§6.2) from the same
 * `books`/`podcasts`/`artists`/`albums`/`tracks` arrays [UnifiedSearchResultsUiState.Results]
 * already carries — no new fetch, no new debounce, updating on exactly the results list's own
 * cadence, matching §6.2's "Source" rule.
 *
 * Kind order: Books, Podcasts, Artists, Albums, Tracks — the same fixed order
 * [UnifiedSearchScreen]'s own results list already renders in, per §6.2's "Ordering and cap"
 * rule, minus the two kinds this function deliberately excludes:
 *
 * **Series and Authors are excluded entirely on Android** — the one deliberately unequal point
 * in §6.2. Neither kind has a detail route on this platform yet (confirmed absent from
 * `AuralisNavHost.kt`'s `Routes` object), and per §5/§6.2 an inert suggestion — one that cannot
 * be navigated to — is a worse version of the inert-row problem the full results list already
 * solves by rendering those two kinds as plain, non-interactive text. This is *idiom*, not
 * drift: it is forced by a route that genuinely does not exist yet, not by this wave declining
 * to build one. Excluding these two kinds entirely (rather than counting empty slots for them)
 * is why a platform missing a kind's route still gets up to [SEARCH_SUGGESTION_CAP] suggestions
 * from the kinds it does have, per §6.2's own wording.
 *
 * A track with no [net.develivarr.auralis.features.music.MusicSearchTrackUi.albumId] is excluded
 * too — same "nowhere to go" rule §5 already applies to the full track list, and the same reason
 * [SearchSuggestionTarget.TrackAlbum] never carries a null `albumId`.
 *
 * Requestable-books/requestable-music candidates are never considered — this function only ever
 * reads [UnifiedSearchResultsUiState.Results], never [RequestableBooksUiState]/
 * [RequestableMusicUiState], so §6.2's "settles on its own, slower, debounced cadence" exclusion
 * holds by construction rather than needing an explicit check.
 */
internal fun deriveSearchSuggestions(state: UnifiedSearchResultsUiState.Results): List<SearchSuggestionUi> {
    val suggestions = mutableListOf<SearchSuggestionUi>()

    for (book in state.books) {
        if (suggestions.size >= SEARCH_SUGGESTION_CAP) return suggestions
        suggestions +=
            SearchSuggestionUi(
                id = "book:${book.id}",
                title = book.title,
                label = "${book.title} · Book",
                target = SearchSuggestionTarget.Book(book.id),
            )
    }
    for (podcast in state.podcasts) {
        if (suggestions.size >= SEARCH_SUGGESTION_CAP) return suggestions
        suggestions +=
            SearchSuggestionUi(
                id = "podcast:${podcast.id}",
                title = podcast.title,
                label = "${podcast.title} · Podcast",
                target = SearchSuggestionTarget.Podcast(podcast.id),
            )
    }
    for (artist in state.artists) {
        if (suggestions.size >= SEARCH_SUGGESTION_CAP) return suggestions
        suggestions +=
            SearchSuggestionUi(
                id = "artist:${artist.id}",
                title = artist.name,
                label = "${artist.name} · Artist",
                target = SearchSuggestionTarget.Artist(artist.id),
            )
    }
    for (album in state.albums) {
        if (suggestions.size >= SEARCH_SUGGESTION_CAP) return suggestions
        suggestions +=
            SearchSuggestionUi(
                id = "album:${album.id}",
                title = album.name,
                label = "${album.name} · Album",
                target = SearchSuggestionTarget.Album(album.id),
            )
    }
    for (track in state.tracks) {
        if (suggestions.size >= SEARCH_SUGGESTION_CAP) return suggestions
        val albumId = track.albumId ?: continue
        suggestions +=
            SearchSuggestionUi(
                id = "track:${track.id}",
                title = track.title,
                label = "${track.title} · Track",
                target = SearchSuggestionTarget.TrackAlbum(albumId),
            )
    }

    return suggestions
}
